import {loadConfig, type AgentConfig} from "./config.ts"
import {readFileCommands, readStdinCommands} from "./commands.ts"
import {ConsoleLogStore} from "./console.ts"
import {ensureParentDir} from "./fs.ts"
import {InspectorClient} from "./inspector-client.ts"
import {EventLogger} from "./logger.ts"
import {SnapshotStore} from "./snapshot.ts"
import {startHttpServer, type HttpServer} from "./server.ts"
import {TargetSupervisor} from "./target.ts"
import {sleep} from "./time.ts"
import type {JsonObject} from "./types.ts"
import {serializeError} from "./errors.ts"

export async function runAgent(config: AgentConfig = loadConfig()): Promise<never> {
  ensureParentDir(config.dumpPath)
  ensureParentDir(config.consoleLogPath)
  ensureParentDir(config.commandPath)
  ensureParentDir(config.responsePath)

  const logger = new EventLogger(config.eventLogPath)
  const client = new InspectorClient({
    url: config.inspectorUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    logger,
  })
  const snapshots = new SnapshotStore({
    client,
    logger,
    dumpPath: config.dumpPath,
  })
  const consoleLogs = new ConsoleLogStore({
    logger,
    consoleLogPath: config.consoleLogPath,
  })
  const target = new TargetSupervisor(logger)

  const runtime = new AgentRuntime({
    config,
    client,
    logger,
    snapshots,
    consoleLogs,
  })

  logger.status(`attaching to ${config.inspectorUrl}`)
  logger.event("agent.started", {
    inspectorUrl: config.inspectorUrl,
    dumpPath: config.dumpPath,
    eventLogPath: config.eventLogPath,
    consoleLogPath: config.consoleLogPath,
    commandPath: config.commandPath,
    responsePath: config.responsePath,
    initializedFallbackMs: config.initializedFallbackMs,
    httpEnabled: config.httpEnabled,
    httpHost: config.httpHost,
    httpPort: config.httpPort,
  })

  let httpServer: HttpServer | undefined
  if (config.httpEnabled) {
    try {
      httpServer = startHttpServer({
        host: config.httpHost,
        port: config.httpPort,
        client,
        snapshots,
        consoleLogs,
        target,
        logger,
        eventLogPath: config.eventLogPath,
        consoleLogPath: config.consoleLogPath,
        inspectorUrl: config.inspectorUrl,
      })
    } catch (error) {
      logger.event("http.start.failed", {error: serializeError(error)})
      logger.status(`http api failed to start on ${config.httpHost}:${config.httpPort}`)
    }
  }
  runtime.attachHttpServer(httpServer)
  runtime.attachTarget(target)

  process.on("SIGINT", () => runtime.shutdown(130))
  process.on("SIGTERM", () => runtime.shutdown(143))

  void runtime.maintainConnection()
  void readStdinCommands({
    client,
    snapshots,
    logger,
    responsePath: config.responsePath,
  })
  void readFileCommands({
    client,
    snapshots,
    logger,
    responsePath: config.responsePath,
  }, config.commandPath)

  return await new Promise<never>(() => {
    // WebSocket, reconnect timers, and stdin drive the process lifetime.
  })
}

type AgentRuntimeOptions = {
  config: AgentConfig
  client: InspectorClient
  logger: EventLogger
  snapshots: SnapshotStore
  consoleLogs: ConsoleLogStore
}

class AgentRuntime {
  #config: AgentConfig
  #client: InspectorClient
  #logger: EventLogger
  #snapshots: SnapshotStore
  #consoleLogs: ConsoleLogStore
  #initializedFallbackTimer: ReturnType<typeof setTimeout> | undefined
  #httpServer: HttpServer | undefined
  #target: TargetSupervisor | undefined
  #sleepResolver: (() => void) | undefined

  constructor(options: AgentRuntimeOptions) {
    this.#config = options.config
    this.#client = options.client
    this.#logger = options.logger
    this.#snapshots = options.snapshots
    this.#consoleLogs = options.consoleLogs

    this.#client.onEvent((method, params) => {
      this.#handleInspectorEvent(method, params)
    })
  }

  attachHttpServer(server: HttpServer | undefined): void {
    this.#httpServer = server
  }

  async maintainConnection(): Promise<void> {
    let attempt = 0
    while (true) {
      let connectedSocket: WebSocket | undefined

      try {
        connectedSocket = await this.#client.connect()
        attempt = 0
        await this.#initializeInspector()
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
        this.#logger.event("agent.connection.failed", {
          attempt,
          error: message,
          lastError,
          hint,
          nextRetryMs: delay,
        })
        if (attempt === 1 || attempt % 5 === 0) {
          this.#logger.status(`connection unavailable (attempt ${attempt}): ${hint}; retry in ${delay}ms`)
        }
      }

      await this.#interruptibleSleep(this.#nextBackoffDelayMs(attempt || 1))
    }
  }

  #nextBackoffDelayMs(attempt: number): number {
    const base = this.#config.reconnectDelayMs
    const exp = Math.min(attempt - 1, 5) // 1× ... 32×
    return Math.min(base * Math.pow(2, exp), 15_000)
  }

  #diagnoseConnectError(message: string): string {
    if (message.includes("Expected 101")) {
      return `target отвечает HTTP, не WebSocket — путь URL ('${this.#client.url}') не совпадает с тем что слушает Bun-инспектор. Используй POST /inspector или env BUN_INSPECTOR_URL чтобы сменить путь (например /dark)`
    }
    if (message.includes("ECONNREFUSED") || message.includes("Failed to connect")) {
      return `target не запущен на ${this.#client.url} — запусти 'bun ... --inspect-wait=${this.#client.url}'`
    }
    return message
  }

  attachTarget(target: TargetSupervisor): void {
    this.#target = target
    // Когда target стартует через /target/run, не ждём 15-секундный backoff.
    // Но Bun.spawn возвращает процесс мгновенно, а inspector-сокет открывается
    // через ~300мс — даём 500мс прежде чем будить sleep.
    target.onEvent((event) => {
      if (event.type === "started") {
        this.#logger.event("agent.kick_reconnect.scheduled", {reason: "target.started", pid: event.pid})
        setTimeout(() => {
          this.#logger.event("agent.kick_reconnect.fired", {})
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

  shutdown(code: number): never {
    this.#logger.event("agent.shutdown", {code})
    this.#clearInitializedFallback()
    this.#target?.shutdown()
    this.#client.close()
    this.#httpServer?.stop?.()
    process.exit(code)
  }

  async #initializeInspector(): Promise<void> {
    await this.#requestSetup("Inspector.enable")
    await this.#requestSetup("Runtime.enable")
    await this.#requestSetup("Console.enable")
    await this.#requestSetup("Debugger.enable")
    await this.#requestSetup("Debugger.setAsyncStackTraceDepth", {depth: 200})
    await this.#requestSetup("Debugger.setBreakpointsActive", {active: true})
    await this.#requestSetup("Debugger.setPauseOnDebuggerStatements", {enabled: true})
    await this.#requestSetup("Debugger.setPauseOnExceptions", {state: "none"})

    // Pre-set breakpoints (target запустили с массивом breakpoints через
    // POST /target/run). Регистрируем сразу после Debugger.enable: Bun ставит
    // их по url/urlRegex и они срабатывают при будущем scriptParsed с матчем.
    const pendingBps = this.#target?.consumePendingBreakpoints() ?? []
    for (const bp of pendingBps) {
      const params: JsonObject = {
        lineNumber: Math.max(0, Math.floor(bp.line) - 1), // line 1-based → 0-based
      }
      if (typeof bp.url === "string") params["url"] = bp.url
      else if (typeof bp.urlRegex === "string") params["urlRegex"] = bp.urlRegex
      if (typeof bp.column === "number") params["columnNumber"] = bp.column
      if (typeof bp.condition === "string") params["condition"] = bp.condition
      try {
        const result = await this.#client.request("Debugger.setBreakpointByUrl", params)
        this.#logger.event("inspector.breakpoint.set", {spec: bp, result})
      } catch (error) {
        this.#logger.event("inspector.breakpoint.failed", {spec: bp, error: serializeError(error)})
      }
    }

    // Если target был запущен с pauseOnStart, то перед тем как отпустить
    // --inspect-wait через Inspector.initialized — арм-аем Debugger.pause.
    // Bun (1.3.13) не отдаёт second client paused-events стабильно, но
    // Debugger.pause до initialized ловит первую же исполняемую инструкцию.
    if (this.#target?.consumePauseOnStart() === true) {
      this.#logger.event("inspector.pause_on_start.armed", {})
      await this.#requestSetup("Debugger.pause")
    }

    this.#logger.event("inspector.enabled", {})
    this.#scheduleInitializedFallback()
  }

  async #requestSetup(method: string, params?: JsonObject): Promise<void> {
    const softTimeoutMs = 1000
    let settled = false

    // Bun may not service a second client while the target is already inside
    // runWhilePaused. Keep the socket alive and let the next pause catch up.
    const request = this.#client.request(method, params)
      .then(() => {
        settled = true
      })
      .catch((error) => {
        settled = true
        const message = serializeError(error)
        if (message.includes("domain already enabled")) {
          this.#logger.event("inspector.request.ignored_error", {method, error: message})
          return
        }
        this.#logger.event("inspector.request.best_effort_failed", {method, error: message})
      })

    await Promise.race([
      request,
      sleep(softTimeoutMs).then(() => {
        if (settled) return
        this.#logger.event("inspector.request.soft_timeout", {method, afterMs: softTimeoutMs})
      }),
    ])
  }

  #scheduleInitializedFallback(): void {
    this.#clearInitializedFallback()

    if (this.#config.initializedFallbackMs <= 0) {
      this.#logger.event("inspector.initialized_fallback.disabled", {})
      return
    }

    this.#initializedFallbackTimer = setTimeout(() => {
      this.#initializedFallbackTimer = undefined
      void this.#client.request("Inspector.initialized")
        .then(() => {
          this.#logger.event("inspector.initialized_fallback.sent", {afterMs: this.#config.initializedFallbackMs})
        })
        .catch((error) => {
          this.#logger.event("inspector.initialized_fallback.failed", {error: serializeError(error)})
        })
    }, this.#config.initializedFallbackMs)

    this.#logger.event("inspector.initialized_fallback.scheduled", {afterMs: this.#config.initializedFallbackMs})
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
        this.#logger.event("inspector.event", {method})
    }
  }
}
