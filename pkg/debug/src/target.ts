/**
 * TargetSupervisor — поднимает отлаживаемый Bun-процесс через Bun.spawn,
 * захватывает stdout/stderr построчно и эмитит события подписчикам.
 *
 * Один экземпляр обслуживает один target за раз: повторный start, пока
 * предыдущий не завершён, кидает ошибку (UI должен сначала /target/stop).
 *
 * stdout/stderr пишутся одновременно в кольцевой буфер (для GET /target)
 * и через onLine подписчикам (для WS-стрима в UI).
 *
 * Sidecar при shutdown посылает SIGTERM; через 3с — SIGKILL.
 */

import {spawn, type Subprocess} from "bun"
import type {EventLogger} from "./logger.ts"
import {serializeError} from "./errors.ts"

export type TargetState = "idle" | "starting" | "running" | "exited" | "failed"

export type TargetLine = {
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

export type BreakpointSpec = {
  url?: string         // file URL: "file:///abs/path/to/foo.ts" или "node:path"
  urlRegex?: string    // регулярка по url, если url не задан
  line: number         // 1-based номер строки (как в редакторе)
  column?: number      // 0-based колонка
  condition?: string   // выражение, при котором pause срабатывает
}

export type TargetSnapshot = {
  state: TargetState
  pid: number | null
  command: string[]
  cwd: string | null
  startedAt: string | null
  exitedAt: string | null
  exitCode: number | null
  signalCode: string | null
  outputLineCount: number
  output: TargetLine[]
  pauseOnStart: boolean
  pendingBreakpoints: BreakpointSpec[]
}

export type TargetEvent =
  | {type: "started"; pid: number; command: string[]; cwd: string | null; startedAt: string}
  | {type: "line"; line: TargetLine}
  | {type: "exited"; exitCode: number | null; signalCode: string | null; exitedAt: string}

export type TargetEventHandler = (event: TargetEvent) => void

const OUTPUT_BUFFER_LIMIT = 1000

export class TargetSupervisor {
  #logger: EventLogger
  #handlers = new Set<TargetEventHandler>()
  #child: Subprocess<"ignore", "pipe", "pipe"> | undefined
  #state: TargetState = "idle"
  #command: string[] = []
  #cwd: string | null = null
  #pid: number | null = null
  #startedAt: string | null = null
  #exitedAt: string | null = null
  #exitCode: number | null = null
  #signalCode: string | null = null
  #buffer: TargetLine[] = []
  #pauseOnStart = false
  #pendingBreakpoints: BreakpointSpec[] = []

  constructor(logger: EventLogger) {
    this.#logger = logger
  }

  consumePauseOnStart(): boolean {
    if (!this.#pauseOnStart) return false
    this.#pauseOnStart = false
    return true
  }

  // Возвращает и очищает список pre-set breakpoints. AgentRuntime регистрирует
  // specs в BreakpointStore; конкретные Bun breakpoints ставятся позже на
  // Debugger.scriptParsed по scriptId. Список clearить, чтобы при
  // переподключении не дублировать установку.
  consumePendingBreakpoints(): BreakpointSpec[] {
    const out = this.#pendingBreakpoints
    this.#pendingBreakpoints = []
    return out
  }

  onEvent(handler: TargetEventHandler): () => void {
    this.#handlers.add(handler)
    return () => this.#handlers.delete(handler)
  }

  snapshot(): TargetSnapshot {
    return {
      state: this.#state,
      pid: this.#pid,
      command: this.#command,
      cwd: this.#cwd,
      startedAt: this.#startedAt,
      exitedAt: this.#exitedAt,
      exitCode: this.#exitCode,
      signalCode: this.#signalCode,
      outputLineCount: this.#buffer.length,
      output: [...this.#buffer],
      pauseOnStart: this.#pauseOnStart,
      pendingBreakpoints: [...this.#pendingBreakpoints],
    }
  }

  start(options: {
    command: string[]
    cwd?: string
    env?: Record<string, string>
    pauseOnStart?: boolean
    breakpoints?: BreakpointSpec[]
  }): TargetSnapshot {
    if (this.#state === "starting" || this.#state === "running") {
      throw new Error(`target уже запущен (pid=${this.#pid}); сначала /target/stop`)
    }
    if (options.command.length === 0) {
      throw new Error("command must be a non-empty array")
    }
    if (options.command.some((part) => typeof part !== "string")) {
      throw new Error("command must contain only strings")
    }

    this.#command = options.command
    this.#cwd = options.cwd ?? process.cwd()
    this.#exitCode = null
    this.#signalCode = null
    this.#exitedAt = null
    this.#buffer = []
    this.#state = "starting"
    this.#pauseOnStart = options.pauseOnStart ?? false
    this.#pendingBreakpoints = (options.breakpoints ?? []).filter(
      (bp) => Number.isInteger(bp.line) && bp.line > 0 && (typeof bp.url === "string" || typeof bp.urlRegex === "string"),
    )

    let subprocess: Subprocess<"ignore", "pipe", "pipe">
    try {
      subprocess = spawn({
        cmd: options.command,
        cwd: this.#cwd,
        env: options.env !== undefined
          ? {...process.env, ...options.env}
          : process.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      }) as Subprocess<"ignore", "pipe", "pipe">
    } catch (error) {
      this.#state = "failed"
      this.#logger.event("target.spawn.failed", {error: serializeError(error), command: options.command})
      throw error
    }

    this.#child = subprocess
    this.#pid = subprocess.pid
    this.#state = "running"
    this.#startedAt = new Date().toISOString()

    this.#logger.event("target.started", {pid: this.#pid, command: options.command, cwd: this.#cwd})
    this.#emit({
      type: "started",
      pid: this.#pid,
      command: this.#command,
      cwd: this.#cwd,
      startedAt: this.#startedAt,
    })

    void this.#pumpStream(subprocess.stdout, "stdout")
    void this.#pumpStream(subprocess.stderr, "stderr")
    void this.#waitForExit(subprocess)

    return this.snapshot()
  }

  async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<TargetSnapshot> {
    const child = this.#child
    if (child === undefined || this.#state !== "running") {
      return this.snapshot()
    }
    try {
      child.kill(signal)
      this.#logger.event("target.kill.sent", {pid: this.#pid, signal})
    } catch (error) {
      this.#logger.event("target.kill.failed", {pid: this.#pid, error: serializeError(error)})
    }

    // Через 3с эскалируем до SIGKILL если процесс ещё жив.
    setTimeout(() => {
      if (this.#child === child && this.#state === "running") {
        try {
          child.kill("SIGKILL")
          this.#logger.event("target.kill.escalated", {pid: this.#pid, signal: "SIGKILL"})
        } catch (error) {
          this.#logger.event("target.kill.escalate_failed", {pid: this.#pid, error: serializeError(error)})
        }
      }
    }, 3000)

    return this.snapshot()
  }

  shutdown(): void {
    if (this.#child !== undefined && this.#state === "running") {
      try {
        this.#child.kill("SIGTERM")
      } catch {}
    }
  }

  async #pumpStream(stream: ReadableStream<Uint8Array>, kind: "stdout" | "stderr"): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      for await (const chunk of stream) {
        buffer += decoder.decode(chunk, {stream: true})
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          const text = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          this.#appendLine(kind, text)
          newline = buffer.indexOf("\n")
        }
      }
      const tail = buffer.trim()
      if (tail.length > 0) this.#appendLine(kind, tail)
    } catch (error) {
      this.#logger.event("target.stream.failed", {kind, error: serializeError(error)})
    }
  }

  async #waitForExit(child: Subprocess<"ignore", "pipe", "pipe">): Promise<void> {
    const exitCode = await child.exited
    if (this.#child !== child) return
    this.#state = "exited"
    this.#exitCode = exitCode ?? null
    this.#signalCode = (child.signalCode as string | null | undefined) ?? null
    this.#exitedAt = new Date().toISOString()
    this.#logger.event("target.exited", {
      pid: this.#pid,
      exitCode: this.#exitCode,
      signalCode: this.#signalCode,
    })
    this.#emit({
      type: "exited",
      exitCode: this.#exitCode,
      signalCode: this.#signalCode,
      exitedAt: this.#exitedAt,
    })
  }

  #appendLine(kind: "stdout" | "stderr", text: string): void {
    const line: TargetLine = {
      ts: new Date().toISOString(),
      stream: kind,
      text,
    }
    this.#buffer.push(line)
    if (this.#buffer.length > OUTPUT_BUFFER_LIMIT) {
      this.#buffer.splice(0, this.#buffer.length - OUTPUT_BUFFER_LIMIT)
    }
    this.#emit({type: "line", line})
  }

  #emit(event: TargetEvent): void {
    for (const handler of this.#handlers) {
      try {
        handler(event)
      } catch (error) {
        this.#logger.event("target.handler.failed", {error: serializeError(error)})
      }
    }
  }
}
