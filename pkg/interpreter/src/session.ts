import {dirname, join} from "node:path"
import type {BreakpointStore} from "./breakpoints.ts"
import {BreakpointStore as Breakpoints} from "./breakpoints.ts"
import type {ConsoleLogStore} from "./console.ts"
import {ConsoleLogStore as ConsoleLogs} from "./console.ts"
import type {InterpreterConfig} from "./config.ts"
import {ensureParentDir} from "./fs.ts"
import {InspectorClient} from "./inspector-client.ts"
import {EventLogger} from "./logger.ts"
import {SnapshotStore} from "./snapshot.ts"
import {TargetSupervisor, type BreakpointSpec, type TargetSnapshot} from "./target.ts"
import {sleep} from "./time.ts"
import type {JsonObject} from "./types.ts"
import type {InterpreterDump} from "./types.ts"
import {serializeError} from "./errors.ts"
import type {InspectMode} from "./inspect-mode.ts"

export type StartupTargetOptions = {
  command: string[]
  cwd?: string
  env?: Record<string, string>
  pauseOnStart?: boolean
  inspectMode?: InspectMode
  breakpoints?: BreakpointSpec[]
}

export type InterpreterSessionSnapshot = {
  id: string
  label: string
  inspectorUrl: string
  connection: {
    state: InspectorClient["socketState"]
    error: string | null
  }
  paused: boolean
  scriptCount: number
  hasDump: boolean
  dump: InterpreterDump | null
  target: TargetSnapshot
}

export type InterpreterSessionEvent =
  | {type: "created"; session: InterpreterSession}
  | {type: "changed"; session: InterpreterSession}

export type InterpreterSessionRunOptions = StartupTargetOptions & {
  label?: string
  inspectorUrl?: string
}

type InterpreterSessionOptions = {
  id: string
  label: string
  config: InterpreterConfig
  logger: EventLogger
  inspectorUrl: string
  dumpPath: string
  consoleLogPath: string
}

export class InterpreterSession {
  readonly id: string
  readonly client: InspectorClient
  readonly snapshots: SnapshotStore
  readonly consoleLogs: ConsoleLogStore
  readonly breakpoints: BreakpointStore
  readonly target: TargetSupervisor
  readonly runtime: InterpreterRuntime
  readonly dumpPath: string
  readonly consoleLogPath: string
  #label: string
  #started = false

  constructor(options: InterpreterSessionOptions) {
    this.id = options.id
    this.#label = options.label
    this.dumpPath = options.dumpPath
    this.consoleLogPath = options.consoleLogPath
    ensureParentDir(this.dumpPath)
    ensureParentDir(this.consoleLogPath)

    this.client = new InspectorClient({
      url: options.inspectorUrl,
      requestTimeoutMs: options.config.requestTimeoutMs,
      logger: options.logger,
    })
    this.snapshots = new SnapshotStore({
      client: this.client,
      logger: options.logger,
      dumpPath: this.dumpPath,
    })
    this.consoleLogs = new ConsoleLogs({
      logger: options.logger,
      consoleLogPath: this.consoleLogPath,
    })
    this.breakpoints = new Breakpoints({
      client: this.client,
      logger: options.logger,
    })
    this.target = new TargetSupervisor(options.logger)
    this.runtime = new InterpreterRuntime({
      sessionId: this.id,
      config: options.config,
      client: this.client,
      logger: options.logger,
      snapshots: this.snapshots,
      consoleLogs: this.consoleLogs,
      breakpoints: this.breakpoints,
    })
    this.runtime.attachTarget(this.target)
  }

  get label(): string {
    return this.#label
  }

  setLabel(label: string): void {
    const next = label.trim()
    if (next.length === 0 || next === this.#label) return
    this.#label = next
  }

  startConnectionLoop(): void {
    if (this.#started) return
    this.#started = true
    void this.runtime.maintainConnection()
  }

  runTarget(options: StartupTargetOptions): TargetSnapshot {
    return this.target.start({
      ...options,
      inspectorUrl: this.client.url,
    })
  }

  snapshot(): InterpreterSessionSnapshot {
    return {
      id: this.id,
      label: this.label,
      inspectorUrl: this.client.url,
      connection: {
        state: this.client.socketState,
        error: this.client.lastError ?? null,
      },
      paused: this.snapshots.paused,
      scriptCount: this.snapshots.scripts.length,
      hasDump: this.snapshots.dump !== undefined,
      dump: this.snapshots.dump ?? null,
      target: this.target.snapshot(),
    }
  }

  shutdown(): Promise<void> {
    return this.runtime.shutdownWithoutExit()
  }
}

export class InterpreterSessionManager {
  readonly initialSession: InterpreterSession
  readonly #config: InterpreterConfig
  readonly #logger: EventLogger
  readonly #sessions = new Map<string, InterpreterSession>()
  readonly #handlers = new Set<(event: InterpreterSessionEvent) => void>()
  #nextId = 2
  #nextInspectorPort: number

  constructor(config: InterpreterConfig, logger: EventLogger) {
    this.#config = config
    this.#logger = logger
    this.#nextInspectorPort = initialNextInspectorPort(config.inspectorUrl, config.httpPort)
    this.initialSession = new InterpreterSession({
      id: "process-1",
      label: "process 1",
      config,
      logger,
      inspectorUrl: config.inspectorUrl,
      dumpPath: config.dumpPath,
      consoleLogPath: config.consoleLogPath,
    })
    this.#sessions.set(this.initialSession.id, this.initialSession)
  }

  onEvent(handler: (event: InterpreterSessionEvent) => void): () => void {
    this.#handlers.add(handler)
    return () => this.#handlers.delete(handler)
  }

  start(): void {
    for (const session of this.#sessions.values()) session.startConnectionLoop()
  }

  list(): InterpreterSession[] {
    return [...this.#sessions.values()]
  }

  snapshots(): InterpreterSessionSnapshot[] {
    return this.list().map((session) => session.snapshot())
  }

  get(id: string): InterpreterSession | undefined {
    return this.#sessions.get(id)
  }

  create(options: {label?: string; inspectorUrl?: string} = {}): InterpreterSession {
    const id = this.#allocateSessionId(options.label)
    const baseDir = dirname(this.#config.dumpPath)
    const session = new InterpreterSession({
      id,
      label: options.label?.trim() || `process ${this.#nextId - 1}`,
      config: this.#config,
      logger: this.#logger,
      inspectorUrl: options.inspectorUrl ?? this.#allocateInspectorUrl(),
      dumpPath: join(baseDir, "sessions", id, "state.json"),
      consoleLogPath: join(baseDir, "sessions", id, "console.log"),
    })
    this.#sessions.set(id, session)
    session.startConnectionLoop()
    this.#emit({type: "created", session})
    return session
  }

  run(options: InterpreterSessionRunOptions): InterpreterSession {
    const createOptions: {label?: string; inspectorUrl?: string} = {}
    if (options.label !== undefined) createOptions.label = options.label
    if (options.inspectorUrl !== undefined) createOptions.inspectorUrl = options.inspectorUrl
    const session = this.create(createOptions)
    session.runTarget(options)
    this.#emit({type: "changed", session})
    return session
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.#sessions.values()].map((session) => session.shutdown()))
  }

  #allocateSessionId(label: string | undefined): string {
    const slug = (label ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42)
    const base = slug.length > 0 ? slug : `process-${this.#nextId++}`
    let id = base
    let suffix = 2
    while (this.#sessions.has(id)) id = `${base}-${suffix++}`
    return id
  }

  #allocateInspectorUrl(): string {
    const current = new URL(this.#config.inspectorUrl)
    while (this.#nextInspectorPort === this.#config.httpPort) this.#nextInspectorPort += 1
    current.port = String(this.#nextInspectorPort++)
    current.pathname = "/"
    current.search = ""
    current.hash = ""
    return current.toString()
  }

  #emit(event: InterpreterSessionEvent): void {
    for (const handler of this.#handlers) {
      try {
        handler(event)
      } catch (error) {
        this.#logger.event("session.handler.failed", {error: serializeError(error)})
      }
    }
  }
}

type InterpreterRuntimeOptions = {
  sessionId: string
  config: InterpreterConfig
  client: InspectorClient
  logger: EventLogger
  snapshots: SnapshotStore
  consoleLogs: ConsoleLogStore
  breakpoints: BreakpointStore
}

class InterpreterRuntime {
  #sessionId: string
  #config: InterpreterConfig
  #client: InspectorClient
  #logger: EventLogger
  #snapshots: SnapshotStore
  #consoleLogs: ConsoleLogStore
  #breakpoints: BreakpointStore
  #initializedFallbackTimer: ReturnType<typeof setTimeout> | undefined
  #target: TargetSupervisor | undefined
  #sleepResolver: (() => void) | undefined
  #closed = false

  constructor(options: InterpreterRuntimeOptions) {
    this.#sessionId = options.sessionId
    this.#config = options.config
    this.#client = options.client
    this.#logger = options.logger
    this.#snapshots = options.snapshots
    this.#consoleLogs = options.consoleLogs
    this.#breakpoints = options.breakpoints

    this.#client.onEvent((method, params) => {
      this.#handleInspectorEvent(method, params)
    })
  }

  async maintainConnection(): Promise<void> {
    let attempt = 0
    while (!this.#closed) {
      let connectedSocket: WebSocket | undefined

      try {
        connectedSocket = await this.#client.connect()
        attempt = 0
        await this.#initializeInterpreter()
        await this.#client.waitForClose(connectedSocket)
        this.#clearInitializedFallback()
        this.#snapshots.markRunning()
      } catch (error) {
        this.#clearInitializedFallback()
        this.#snapshots.markRunning()
        if (
          connectedSocket !== undefined
          && connectedSocket.readyState !== WebSocket.CLOSED
          && connectedSocket.readyState !== WebSocket.CLOSING
        ) {
          connectedSocket.close()
        }
        const message = serializeError(error)
        const lastError = this.#client.lastError ?? message
        const hint = this.#diagnoseConnectError(lastError)
        const delay = this.#nextBackoffDelayMs(++attempt)
        this.#logger.event("interpreter.connection.failed", {
          sessionId: this.#sessionId,
          attempt,
          error: message,
          lastError,
          hint,
          nextRetryMs: delay,
        })
        if (attempt === 1 || attempt % 5 === 0) {
          this.#logger.status(`[${this.#sessionId}] connection unavailable (attempt ${attempt}): ${hint}; retry in ${delay}ms`)
        }
      }

      await this.#interruptibleSleep(this.#nextBackoffDelayMs(attempt || 1))
    }
  }

  #nextBackoffDelayMs(attempt: number): number {
    const base = this.#config.reconnectDelayMs
    const exp = Math.min(attempt - 1, 5)
    return Math.min(base * Math.pow(2, exp), 15_000)
  }

  #diagnoseConnectError(message: string): string {
    if (message.includes("Expected 101")) {
      return `target отвечает HTTP, не WebSocket — URL ('${this.#client.url}') не совпадает с тем что слушает Bun-инспектор`
    }
    if (message.includes("ECONNREFUSED") || message.includes("Failed to connect")) {
      return `target не запущен на ${this.#client.url} — запусти 'bun ... --inspect-wait=${this.#client.url}'`
    }
    return message
  }

  attachTarget(target: TargetSupervisor): void {
    this.#target = target
    target.onEvent((event) => {
      if (event.type === "started") {
        this.#snapshots.reset()
        this.#breakpoints.reset()
        this.#logger.event("interpreter.kick_reconnect.scheduled", {
          sessionId: this.#sessionId,
          reason: "target.started",
          pid: event.pid,
        })
        setTimeout(() => {
          this.#logger.event("interpreter.kick_reconnect.fired", {sessionId: this.#sessionId})
          this.#kickReconnect()
        }, 500)
      }
    })
  }

  #kickReconnect(): void {
    const resolve = this.#sleepResolver
    if (resolve !== undefined) {
      this.#sleepResolver = undefined
      resolve()
    }
  }

  #interruptibleSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.#sleepResolver === resolve) this.#sleepResolver = undefined
        resolve()
      }, ms)
      this.#sleepResolver = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  async shutdownWithoutExit(): Promise<void> {
    this.#closed = true
    this.#clearInitializedFallback()
    this.#client.close()
    this.#kickReconnect()
    await this.#target?.shutdown()
  }

  async #initializeInterpreter(): Promise<void> {
    await this.#requestSetup("Inspector.enable")
    await this.#requestSetup("Runtime.enable")
    await this.#requestSetup("Console.enable")
    await this.#requestSetup("Debugger.enable")
    await this.#requestSetup("Debugger.setAsyncStackTraceDepth", {depth: 200})
    await this.#requestSetup("Debugger.setBreakpointsActive", {active: true})
    await this.#requestSetup("Debugger.setPauseOnDebuggerStatements", {enabled: true})
    await this.#requestSetup("Debugger.setPauseOnExceptions", {state: "none"})

    const pendingBps = this.#target?.consumePendingBreakpoints() ?? []
    if (pendingBps.length > 0) {
      const registrations = this.#breakpoints.addMany(pendingBps)
      await this.#breakpoints.armPendingByUrl(registrations.map((registration) => registration.id))
      await this.#breakpoints.applyToScripts(this.#snapshots.scripts)
      this.#logger.event("breakpoint.pending.registered", {
        sessionId: this.#sessionId,
        count: registrations.length,
        registrations,
      })
    }

    const pauseOnStartRequested = this.#target?.consumePauseOnStart() === true
    if (pauseOnStartRequested) this.#logger.event("interpreter.pause_on_start.inspect_brk", {sessionId: this.#sessionId})

    this.#logger.event("interpreter.enabled", {sessionId: this.#sessionId})
    this.#scheduleInitializedFallback()
  }

  async #requestSetup(method: string, params?: JsonObject): Promise<void> {
    const softTimeoutMs = 1000
    let settled = false
    const request = this.#client.request(method, params)
      .then(() => {
        settled = true
      })
      .catch((error) => {
        settled = true
        const message = serializeError(error)
        if (message.includes("domain already enabled")) {
          this.#logger.event("interpreter.request.ignored_error", {sessionId: this.#sessionId, method, error: message})
          return
        }
        this.#logger.event("interpreter.request.best_effort_failed", {sessionId: this.#sessionId, method, error: message})
      })

    await Promise.race([
      request,
      sleep(softTimeoutMs).then(() => {
        if (settled) return
        this.#logger.event("interpreter.request.soft_timeout", {sessionId: this.#sessionId, method, afterMs: softTimeoutMs})
      }),
    ])
  }

  #scheduleInitializedFallback(): void {
    this.#clearInitializedFallback()

    if (this.#config.initializedFallbackMs <= 0) {
      this.#logger.event("interpreter.initialized_fallback.disabled", {sessionId: this.#sessionId})
      return
    }

    this.#initializedFallbackTimer = setTimeout(() => {
      this.#initializedFallbackTimer = undefined
      void this.#client.request("Inspector.initialized")
        .then(() => {
          this.#logger.event("interpreter.initialized_fallback.sent", {
            sessionId: this.#sessionId,
            afterMs: this.#config.initializedFallbackMs,
          })
        })
        .catch((error) => {
          this.#logger.event("interpreter.initialized_fallback.failed", {
            sessionId: this.#sessionId,
            error: serializeError(error),
          })
        })
    }, this.#config.initializedFallbackMs)

    this.#logger.event("interpreter.initialized_fallback.scheduled", {
      sessionId: this.#sessionId,
      afterMs: this.#config.initializedFallbackMs,
    })
  }

  #clearInitializedFallback(): void {
    if (this.#initializedFallbackTimer === undefined) return
    clearTimeout(this.#initializedFallbackTimer)
    this.#initializedFallbackTimer = undefined
  }

  #handleInspectorEvent(method: string, params: JsonObject): void {
    switch (method) {
      case "Debugger.scriptParsed":
        this.#snapshots.handleScriptParsed(params)
        void this.#handleScriptParsedForBreakpoints(params)
        return
      case "Debugger.paused":
        void this.#snapshots.handlePaused(params)
        return
      case "Debugger.resumed":
        this.#snapshots.handleResumed()
        return
      case "Console.messageAdded":
        this.#consoleLogs.handleMessageAdded(params)
        return
      case "Runtime.consoleAPICalled":
        this.#consoleLogs.handleRuntimeConsoleApiCalled(params)
        return
      default:
        this.#logger.event("interpreter.event", {sessionId: this.#sessionId, method})
    }
  }

  async #handleScriptParsedForBreakpoints(params: JsonObject): Promise<void> {
    const scriptId = typeof params["scriptId"] === "string" ? params["scriptId"] : undefined
    const url = typeof params["url"] === "string" ? params["url"] : ""
    const sourceMapURL = typeof params["sourceMapURL"] === "string" ? params["sourceMapURL"] : undefined
    if (scriptId === undefined) return
    const script = {scriptId, url, ...(sourceMapURL === undefined ? {} : {sourceMapURL})}
    await this.#breakpoints.handleScriptParsed(script)
  }
}

function initialNextInspectorPort(inspectorUrl: string, httpPort: number): number {
  try {
    const parsed = new URL(inspectorUrl)
    const port = Number(parsed.port)
    if (Number.isInteger(port) && port > 0) return port + (port + 1 === httpPort ? 2 : 1)
  } catch {}
  return httpPort === 6500 ? 6501 : 6500
}
