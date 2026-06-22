/**
 * TargetSupervisor — поднимает исполняемый Bun-процесс через Bun.spawn,
 * захватывает stdout/stderr построчно и эмитит события подписчикам.
 *
 * Один экземпляр обслуживает один модульный процесс за раз: повторный start,
 * пока предыдущий не завершён, кидает ошибку (UI должен сначала остановить
 * этот process через /processes/:id/action).
 *
 * stdout/stderr пишутся одновременно в кольцевой буфер (для snapshot модуля)
 * и через onLine подписчикам (для WS-стрима в UI).
 *
 * Интерпретатор при shutdown посылает SIGTERM; через 3с — SIGKILL.
 */

import {spawn, type Subprocess} from "bun"
import type {EventLogger} from "./logger.ts"
import {serializeError} from "./errors.ts"
import {applyInspectMode, type InspectMode} from "./inspect-mode.ts"
import {sleep} from "./time.ts"

export type TargetState = "idle" | "starting" | "running" | "exited" | "failed"

export type TargetLine = {
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

export type BreakpointSpec = {
  url?: string         // file URL: "file:///abs/path/to/foo.ts" или "node:path"
  sourceUrl?: string   // original source URL from source map, if it differs from runtime url
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
const BUN_PROTOCOL_BANNER_LABEL = "Bun " + "Ins" + "pector"

export type TargetOutputFilterState = {
  inBunProtocolBanner: boolean
}

export function filterTargetOutputLine(state: TargetOutputFilterState, kind: "stdout" | "stderr", text: string): boolean {
  if (kind !== "stderr") return true
  if (state.inBunProtocolBanner) {
    if (isBunProtocolBannerDelimiter(text)) state.inBunProtocolBanner = false
    return false
  }
  if (isBunProtocolBannerDelimiter(text)) {
    state.inBunProtocolBanner = true
    return false
  }
  return true
}

export class TargetSupervisor {
  #logger: EventLogger
  #handlers = new Set<TargetEventHandler>()
  #child: Subprocess<"ignore", "pipe", "pipe"> | undefined
  #state: TargetState = "idle"
  #command: string[] = []
  #cwd: string | null = null
  #env: Record<string, string> | undefined
  #pid: number | null = null
  #startedAt: string | null = null
  #exitedAt: string | null = null
  #exitCode: number | null = null
  #signalCode: string | null = null
  #buffer: TargetLine[] = []
  #outputFilter: TargetOutputFilterState = {inBunProtocolBanner: false}
  #pauseOnStart = false
  #pendingBreakpoints: BreakpointSpec[] = []
  #exitHandled: Promise<void> | undefined

  constructor(logger: EventLogger) {
    this.#logger = logger
  }

  consumePauseOnStart(): boolean {
    if (!this.#pauseOnStart) return false
    this.#pauseOnStart = false
    return true
  }

  // Возвращает и очищает список pre-set breakpoints. InterpreterRuntime регистрирует
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
    inspectMode?: InspectMode
    protocolUrl?: string
    breakpoints?: BreakpointSpec[]
  }): TargetSnapshot {
    if (this.#state === "starting" || this.#state === "running") {
      throw new Error(`модуль уже запущен (pid=${this.#pid}); сначала останови process через /processes/:id/action`)
    }
    if (options.command.length === 0) {
      throw new Error("command must be a non-empty array")
    }
    if (options.command.some((part) => typeof part !== "string")) {
      throw new Error("command must contain only strings")
    }

    const inspectMode = options.inspectMode ?? (options.pauseOnStart === true ? "brk" : "inspect")
    const pauseOnStart = inspectMode === "brk"
    this.#command = applyInspectMode(options.command, inspectMode, options.protocolUrl ?? "ws://127.0.0.1:6499/")
    this.#cwd = options.cwd ?? process.cwd()
    this.#env = options.env
    this.#exitCode = null
    this.#signalCode = null
    this.#exitedAt = null
    this.#buffer = []
    this.#outputFilter = {inBunProtocolBanner: false}
    this.#state = "starting"
    this.#pauseOnStart = pauseOnStart
    this.#pendingBreakpoints = (options.breakpoints ?? []).filter((bp) => (
      Number.isInteger(bp.line)
      && bp.line > 0
      && (typeof bp.url === "string" || typeof bp.sourceUrl === "string" || typeof bp.urlRegex === "string")
    ))

    let subprocess: Subprocess<"ignore", "pipe", "pipe">
    try {
      subprocess = spawn({
        cmd: this.#command,
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
      this.#logger.event("target.spawn.failed", {error: serializeError(error), command: this.#command})
      throw error
    }

    this.#child = subprocess
    this.#pid = subprocess.pid
    this.#state = "running"
    this.#startedAt = new Date().toISOString()

    if (pauseOnStart) this.#logger.event("target.inspect_brk.applied", {command: this.#command})
    this.#logger.event("target.started", {pid: this.#pid, command: this.#command, cwd: this.#cwd})
    this.#emit({
      type: "started",
      pid: this.#pid,
      command: this.#command,
      cwd: this.#cwd,
      startedAt: this.#startedAt,
    })

    void this.#pumpStream(subprocess.stdout, "stdout")
    void this.#pumpStream(subprocess.stderr, "stderr")
    this.#exitHandled = this.#waitForExit(subprocess)
    void this.#exitHandled

    return this.snapshot()
  }

  async restart(options: {
    inspectMode?: InspectMode
    pauseOnStart?: boolean
    breakpoints?: BreakpointSpec[]
    signal?: NodeJS.Signals
    beforeStart?: () => void
  } = {}): Promise<TargetSnapshot> {
    if (this.#command.length === 0) throw new Error("target has no previous command to replay")
    const command = [...this.#command]
    const cwd = this.#cwd ?? process.cwd()
    const env = this.#env
    if (this.#state === "starting" || this.#state === "running") {
      await this.stop(options.signal ?? "SIGTERM")
    }
    options.beforeStart?.()
    return this.start({
      command,
      cwd,
      ...(env === undefined ? {} : {env}),
      pauseOnStart: options.pauseOnStart ?? false,
      inspectMode: options.inspectMode ?? "inspect",
      breakpoints: options.breakpoints ?? [],
    })
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
    await this.#waitForStoppedChild(child)

    return this.snapshot()
  }

  async shutdown(): Promise<void> {
    const child = this.#child
    if (child === undefined || this.#state !== "running") return
    try {
      child.kill("SIGTERM")
    } catch {}

    await this.#waitForStoppedChild(child)
  }

  async #waitForStoppedChild(child: Subprocess<"ignore", "pipe", "pipe">): Promise<void> {
    const exitHandled = this.#exitHandled ?? child.exited.then(() => {})
    await Promise.race([
      exitHandled,
      sleep(3000).then(() => {
        if (this.#child === child && this.#state === "running") {
          try {
            child.kill("SIGKILL")
            this.#logger.event("target.kill.escalated", {pid: this.#pid, signal: "SIGKILL"})
          } catch (error) {
            this.#logger.event("target.kill.escalate_failed", {pid: this.#pid, error: serializeError(error)})
          }
        }
      }),
    ])

    if (this.#child === child && this.#state === "running") {
      await Promise.race([
        exitHandled,
        sleep(500),
      ])
    }
  }

  async #pumpStream(stream: ReadableStream<Uint8Array>, kind: "stdout" | "stderr"): Promise<void> {
    const decoder = new TextDecoder()
    const reader = stream.getReader()
    let buffer = ""
    try {
      while (true) {
        const {done, value} = await reader.read()
        if (done) break
        const chunk = value
        buffer += decoder.decode(chunk, {stream: true})
        let newline = buffer.indexOf("\n")
        while (newline >= 0) {
          const text = buffer.slice(0, newline)
          buffer = buffer.slice(newline + 1)
          this.#appendLine(kind, text)
          newline = buffer.indexOf("\n")
        }
      }
      buffer += decoder.decode()
      const tail = buffer.trim()
      if (tail.length > 0) this.#appendLine(kind, tail)
    } catch (error) {
      this.#logger.event("target.stream.failed", {kind, error: serializeError(error)})
    } finally {
      reader.releaseLock()
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
    if (!filterTargetOutputLine(this.#outputFilter, kind, text)) return
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

function isBunProtocolBannerDelimiter(text: string): boolean {
  return text.includes(BUN_PROTOCOL_BANNER_LABEL) && text.includes("---")
}
