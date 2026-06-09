import {dirname, join} from "node:path"
import type {BreakpointStore} from "./breakpoints.ts"
import {BreakpointStore as Breakpoints, breakpointSpecMatchesSourceUrl, sameBreakpointSpec} from "./breakpoints.ts"
import type {ConsoleLogStore} from "./console.ts"
import {ConsoleLogStore as ConsoleLogs} from "./console.ts"
import type {InterpreterConfig} from "./config.ts"
import {ensureParentDir} from "./fs.ts"
import {ProtocolClient} from "./protocol-client.ts"
import {protocolCommand, publicProtocolMethod} from "./protocol-names.ts"
import {EventLogger} from "./logger.ts"
import {SnapshotStore} from "./snapshot.ts"
import {TargetSupervisor, type BreakpointSpec, type TargetSnapshot} from "./target.ts"
import {sleep} from "./time.ts"
import type {JsonObject} from "./types.ts"
import type {InterpreterDump} from "./types.ts"
import {serializeError} from "./errors.ts"
import type {InspectMode} from "./inspect-mode.ts"

export type StartupModuleOptions = {
  command: string[]
  cwd?: string
  env?: Record<string, string>
  pauseOnStart?: boolean
  inspectMode?: InspectMode
  breakpoints?: BreakpointSpec[]
  modulePath?: string
}

export type InterpreterModuleSnapshot = {
  id: string
  label: string
  modulePath: string | null
  protocolUrl: string
  connection: {
    state: ProtocolClient["socketState"]
    error: string | null
  }
  paused: boolean
  scriptCount: number
  hasDump: boolean
  dump: InterpreterDump | null
  target: TargetSnapshot
}

export type InterpreterModuleEvent =
  | {type: "created"; module: InterpreterModule}
  | {type: "changed"; module: InterpreterModule}

export type InterpreterModuleRunOptions = StartupModuleOptions & {
  id?: string
  label?: string
  protocolUrl?: string
}

type InterpreterModuleOptions = {
  id: string
  label: string
  modulePath?: string
  config: InterpreterConfig
  logger: EventLogger
  protocolUrl: string
  dumpPath: string
  consoleLogPath: string
}

type ReplayRunToTarget = {
  spec: BreakpointSpec
  removeWhenReached: boolean
}

export class InterpreterModule {
  readonly id: string
  readonly client: ProtocolClient
  readonly snapshots: SnapshotStore
  readonly consoleLogs: ConsoleLogStore
  readonly breakpoints: BreakpointStore
  readonly target: TargetSupervisor
  readonly runtime: InterpreterRuntime
  readonly dumpPath: string
  readonly consoleLogPath: string
  #label: string
  #modulePath: string | null
  #started = false

  constructor(options: InterpreterModuleOptions) {
    this.id = options.id
    this.#label = options.label
    this.#modulePath = normalizeModulePath(options.modulePath)
    this.dumpPath = options.dumpPath
    this.consoleLogPath = options.consoleLogPath
    ensureParentDir(this.dumpPath)
    ensureParentDir(this.consoleLogPath)

    this.client = new ProtocolClient({
      url: options.protocolUrl,
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
      moduleId: this.id,
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

  get modulePath(): string | null {
    return this.#modulePath
  }

  setLabel(label: string): void {
    const next = label.trim()
    if (next.length === 0 || next === this.#label) return
    this.#label = next
  }

  setModulePath(modulePath: string | undefined): void {
    this.#modulePath = normalizeModulePath(modulePath)
  }

  startConnectionLoop(): void {
    if (this.#started) return
    this.#started = true
    void this.runtime.maintainConnection()
  }

  runTarget(options: StartupModuleOptions): TargetSnapshot {
    if (options.modulePath !== undefined) this.setModulePath(options.modulePath)
    return this.target.start({
      ...options,
      protocolUrl: this.client.url,
    })
  }

  replayTarget(options: {breakpoints?: BreakpointSpec[]; runTo?: BreakpointSpec} = {}): Promise<TargetSnapshot> {
    const baseBreakpoints = options.breakpoints ?? this.breakpoints.registrations.map((registration) => registration.spec)
    const runTo = options.runTo
    const runToExists = runTo !== undefined && baseBreakpoints.some((spec) => breakpointSpecMatchesRunTo(spec, runTo))
    const breakpoints = runTo === undefined || runToExists ? baseBreakpoints : [...baseBreakpoints, runTo]
    return this.target.restart({
      inspectMode: "wait",
      pauseOnStart: false,
      breakpoints,
      beforeStart: () => this.runtime.setReplayRunTo(runTo === undefined ? null : {
        spec: runTo,
        removeWhenReached: !runToExists,
      }),
    }).catch((error) => {
      this.runtime.setReplayRunTo(null)
      throw error
    })
  }

  snapshot(): InterpreterModuleSnapshot {
    return {
      id: this.id,
      label: this.label,
      modulePath: this.modulePath,
      protocolUrl: this.client.url,
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

export class InterpreterModuleManager {
  readonly #config: InterpreterConfig
  readonly #logger: EventLogger
  readonly #modules = new Map<string, InterpreterModule>()
  readonly #handlers = new Set<(event: InterpreterModuleEvent) => void>()
  #nextId = 1
  #nextProtocolPort: number
  #primaryProtocolAllocated = false

  constructor(config: InterpreterConfig, logger: EventLogger) {
    this.#config = config
    this.#logger = logger
    this.#nextProtocolPort = initialNextProtocolPort(config.protocolUrl, config.httpPort)
  }

  onEvent(handler: (event: InterpreterModuleEvent) => void): () => void {
    this.#handlers.add(handler)
    return () => this.#handlers.delete(handler)
  }

  start(): void {
    for (const module of this.#modules.values()) module.startConnectionLoop()
  }

  list(): InterpreterModule[] {
    return [...this.#modules.values()]
  }

  snapshots(): InterpreterModuleSnapshot[] {
    return this.list().map((module) => module.snapshot())
  }

  get(id: string): InterpreterModule | undefined {
    return this.#modules.get(id)
  }

  create(options: {id?: string; label?: string; protocolUrl?: string; modulePath?: string} = {}): InterpreterModule {
    const id = this.#allocateModuleId(options.id ?? options.label ?? options.modulePath)
    const baseDir = dirname(this.#config.dumpPath)
    const moduleOptions: InterpreterModuleOptions = {
      id,
      label: options.label?.trim() || id,
      config: this.#config,
      logger: this.#logger,
      protocolUrl: options.protocolUrl ?? this.#allocateProtocolUrl(),
      dumpPath: join(baseDir, "modules", id, "state.json"),
      consoleLogPath: join(baseDir, "modules", id, "console.log"),
    }
    if (options.modulePath !== undefined) moduleOptions.modulePath = options.modulePath
    const module = new InterpreterModule(moduleOptions)
    this.#modules.set(id, module)
    module.startConnectionLoop()
    this.#emit({type: "created", module})
    return module
  }

  run(options: InterpreterModuleRunOptions): InterpreterModule {
    const createOptions: {id?: string; label?: string; protocolUrl?: string; modulePath?: string} = {}
    if (options.id !== undefined) createOptions.id = options.id
    if (options.label !== undefined) createOptions.label = options.label
    if (options.protocolUrl !== undefined) createOptions.protocolUrl = options.protocolUrl
    if (options.modulePath !== undefined) createOptions.modulePath = options.modulePath
    const module = this.create(createOptions)
    module.runTarget(options)
    this.#emit({type: "changed", module})
    return module
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.#modules.values()].map((module) => module.shutdown()))
  }

  #allocateModuleId(label: string | undefined): string {
    const slug = (label ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42)
    const base = slug.length > 0 ? slug : `module-${this.#nextId++}`
    let id = base
    let suffix = 2
    while (this.#modules.has(id)) id = `${base}-${suffix++}`
    return id
  }

  #allocateProtocolUrl(): string {
    if (!this.#primaryProtocolAllocated) {
      this.#primaryProtocolAllocated = true
      return this.#config.protocolUrl
    }
    const current = new URL(this.#config.protocolUrl)
    while (this.#nextProtocolPort === this.#config.httpPort) this.#nextProtocolPort += 1
    current.port = String(this.#nextProtocolPort++)
    current.pathname = "/"
    current.search = ""
    current.hash = ""
    return current.toString()
  }

  #emit(event: InterpreterModuleEvent): void {
    for (const handler of this.#handlers) {
      try {
        handler(event)
      } catch (error) {
        this.#logger.event("module.handler.failed", {error: serializeError(error)})
      }
    }
  }
}

function normalizeModulePath(modulePath: string | undefined): string | null {
  const next = modulePath?.trim()
  return next === undefined || next.length === 0 ? null : next
}

type InterpreterRuntimeOptions = {
  moduleId: string
  config: InterpreterConfig
  client: ProtocolClient
  logger: EventLogger
  snapshots: SnapshotStore
  consoleLogs: ConsoleLogStore
  breakpoints: BreakpointStore
}

class InterpreterRuntime {
  #moduleId: string
  #config: InterpreterConfig
  #client: ProtocolClient
  #logger: EventLogger
  #snapshots: SnapshotStore
  #consoleLogs: ConsoleLogStore
  #breakpoints: BreakpointStore
  #initializedFallbackTimer: ReturnType<typeof setTimeout> | undefined
  #initializedSent = false
  #target: TargetSupervisor | undefined
  #sleepResolver: (() => void) | undefined
  #closed = false
  #waitingForTarget = false
  #replayRunTo: ReplayRunToTarget | null = null

  constructor(options: InterpreterRuntimeOptions) {
    this.#moduleId = options.moduleId
    this.#config = options.config
    this.#client = options.client
    this.#logger = options.logger
    this.#snapshots = options.snapshots
    this.#consoleLogs = options.consoleLogs
    this.#breakpoints = options.breakpoints

    this.#client.onEvent((method, params) => {
      this.#handleProtocolEvent(method, params)
    })
  }

  setReplayRunTo(target: ReplayRunToTarget | null): void {
    this.#replayRunTo = target
    this.#logger.event("source.patch.replay.run_to", {
      moduleId: this.#moduleId,
      target,
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
        await sleep(25)
        if (!this.#targetAcceptsConnection()) {
          await this.#waitForTarget()
          continue
        }
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
        if (!this.#targetAcceptsConnection()) {
          this.#logger.event("interpreter.connection.idle", {
            moduleId: this.#moduleId,
            targetState: this.#target?.snapshot().state ?? "none",
          })
          await this.#waitForTarget()
          continue
        }
        const message = serializeError(error)
        const lastError = this.#client.lastError ?? message
        const hint = this.#diagnoseConnectError(lastError)
        const delay = this.#nextBackoffDelayMs(++attempt)
        this.#logger.event("interpreter.connection.failed", {
          moduleId: this.#moduleId,
          attempt,
          error: message,
          lastError,
          hint,
          nextRetryMs: delay,
        })
        if (attempt === 1 || attempt % 5 === 0) {
          this.#logger.status(`[${this.#moduleId}] connection unavailable (attempt ${attempt}): ${hint}; retry in ${delay}ms`)
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
      return `модуль отвечает HTTP, не WebSocket — URL ('${this.#client.url}') не совпадает с тем что слушает Bun protocol`
    }
    if (message.includes("ECONNREFUSED") || message.includes("Failed to connect")) {
      return `модуль не запущен на ${this.#client.url} — интерпретатор запустит его через protocol flag`
    }
    return message
  }

  attachTarget(target: TargetSupervisor): void {
    this.#target = target
    target.onEvent((event) => {
      if (event.type === "started") {
        this.#clearInitializedFallback()
        this.#initializedSent = false
        this.#snapshots.reset()
        this.#breakpoints.clearInstalled("target.started")
        this.#logger.event("interpreter.kick_reconnect.scheduled", {
          moduleId: this.#moduleId,
          reason: "target.started",
          pid: event.pid,
        })
        this.#waitingForTarget = false
        setTimeout(() => {
          this.#logger.event("interpreter.kick_reconnect.fired", {moduleId: this.#moduleId})
          this.#kickReconnect()
        }, 500)
      } else if (event.type === "exited") {
        this.#replayRunTo = null
        this.#clearInitializedFallback()
        this.#breakpoints.clearInstalled("target.exited")
        this.#logger.event("interpreter.connection.completed", {
          moduleId: this.#moduleId,
          exitCode: event.exitCode,
          signalCode: event.signalCode,
        })
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

  #waitForTarget(): Promise<void> {
    if (this.#closed) return Promise.resolve()
    if (!this.#waitingForTarget) {
      this.#waitingForTarget = true
      this.#logger.event("interpreter.connection.waiting_for_module", {
        moduleId: this.#moduleId,
        targetState: this.#target?.snapshot().state ?? "none",
      })
    }
    return new Promise((resolve) => {
      this.#sleepResolver = () => {
        this.#sleepResolver = undefined
        resolve()
      }
    })
  }

  #targetAcceptsConnection(): boolean {
    const state = this.#target?.snapshot().state
    return state === "starting" || state === "running"
  }

  async shutdownWithoutExit(): Promise<void> {
    this.#closed = true
    this.#clearInitializedFallback()
    this.#client.close()
    this.#kickReconnect()
    await this.#target?.shutdown()
  }

  async #initializeInterpreter(): Promise<void> {
    await this.#requestSetup(protocolCommand.controlEnable)
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
        moduleId: this.#moduleId,
        count: registrations.length,
        registrations,
      })
    }

    const pauseOnStartRequested = this.#target?.consumePauseOnStart() === true
    if (pauseOnStartRequested) this.#logger.event("interpreter.pause_on_start.inspect_brk", {moduleId: this.#moduleId})

    this.#logger.event("interpreter.enabled", {moduleId: this.#moduleId})
    if (pauseOnStartRequested) void this.#sendInitialized("pause_on_start")
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
          this.#logger.event("interpreter.request.ignored_error", {moduleId: this.#moduleId, method: publicProtocolMethod(method), error: message})
          return
        }
        this.#logger.event("interpreter.request.best_effort_failed", {moduleId: this.#moduleId, method: publicProtocolMethod(method), error: message})
      })

    await Promise.race([
      request,
      sleep(softTimeoutMs).then(() => {
        if (settled) return
        this.#logger.event("interpreter.request.soft_timeout", {moduleId: this.#moduleId, method: publicProtocolMethod(method), afterMs: softTimeoutMs})
      }),
    ])
  }

  #scheduleInitializedFallback(): void {
    this.#clearInitializedFallback()

    if (this.#config.initializedFallbackMs <= 0) {
      this.#logger.event("interpreter.initialized_fallback.disabled", {moduleId: this.#moduleId})
      return
    }

    this.#initializedFallbackTimer = setTimeout(() => {
      this.#initializedFallbackTimer = undefined
      void this.#sendInitialized("fallback", {afterMs: this.#config.initializedFallbackMs})
    }, this.#config.initializedFallbackMs)

    this.#logger.event("interpreter.initialized_fallback.scheduled", {
      moduleId: this.#moduleId,
      afterMs: this.#config.initializedFallbackMs,
    })
  }

  #clearInitializedFallback(): void {
    if (this.#initializedFallbackTimer === undefined) return
    clearTimeout(this.#initializedFallbackTimer)
    this.#initializedFallbackTimer = undefined
  }

  async #sendInitialized(reason: "pause_on_start" | "fallback", detail: JsonObject = {}): Promise<void> {
    if (this.#initializedSent) return
    try {
      await this.#client.request(protocolCommand.controlInitialized)
      this.#initializedSent = true
      this.#logger.event(reason === "fallback" ? "interpreter.initialized_fallback.sent" : "interpreter.initialized_pause_on_start.sent", {
        moduleId: this.#moduleId,
        ...detail,
      })
    } catch (error) {
      this.#logger.event(reason === "fallback" ? "interpreter.initialized_fallback.failed" : "interpreter.initialized_pause_on_start.failed", {
        moduleId: this.#moduleId,
        ...detail,
        error: serializeError(error),
      })
    }
  }

  #handleProtocolEvent(method: string, params: JsonObject): void {
    switch (method) {
      case "Debugger.scriptParsed":
        this.#snapshots.handleScriptParsed(params)
        void this.#handleScriptParsedForBreakpoints(params)
        return
      case "Debugger.paused":
        void this.#handlePaused(params)
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
        this.#logger.event("interpreter.event", {moduleId: this.#moduleId, method})
    }
  }

  async #handlePaused(params: JsonObject): Promise<void> {
    const replay = this.#replayRunTo
    if (replay !== null) {
      const paused = this.#snapshots.describePaused(params)
      if (!replayRunToReached(replay.spec, paused.topFrame)) {
        this.#logger.event("source.patch.replay.transit_pause", {
          moduleId: this.#moduleId,
          target: replay.spec,
          paused,
        })
        try {
          await this.#client.request("Debugger.resume")
          this.#snapshots.markRunning()
        } catch (error) {
          this.#replayRunTo = null
          this.#logger.event("source.patch.replay.resume_failed", {
            moduleId: this.#moduleId,
            target: replay.spec,
            error: serializeError(error),
          })
          await this.#snapshots.handlePaused(params)
        }
        return
      }

      this.#replayRunTo = null
      if (replay.removeWhenReached) await this.#breakpoints.removeSpec(replay.spec)
      this.#logger.event("source.patch.replay.reached", {
        moduleId: this.#moduleId,
        target: replay.spec,
        paused,
      })
    }
    await this.#snapshots.handlePaused(params)
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

function replayRunToReached(spec: BreakpointSpec, frame: JsonObject | undefined): boolean {
  if (frame === undefined) return false
  const url = typeof frame["url"] === "string" ? frame["url"] : ""
  const line = typeof frame["line"] === "number" ? frame["line"] : 0
  return line === spec.line && breakpointSpecMatchesSourceUrl(spec, url)
}

function breakpointSpecMatchesRunTo(spec: BreakpointSpec, runTo: BreakpointSpec): boolean {
  if (sameBreakpointSpec(spec, runTo)) return true
  if (spec.line !== runTo.line) return false
  for (const source of [runTo.sourceUrl, runTo.url]) {
    if (source !== undefined && breakpointSpecMatchesSourceUrl(spec, source)) return true
  }
  return false
}

function initialNextProtocolPort(protocolUrl: string, httpPort: number): number {
  try {
    const parsed = new URL(protocolUrl)
    const port = Number(parsed.port)
    if (Number.isInteger(port) && port > 0) return port + (port + 1 === httpPort ? 2 : 1)
  } catch {}
  return httpPort === 6500 ? 6501 : 6500
}
