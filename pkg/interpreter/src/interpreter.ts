import {loadConfig, type InterpreterConfig} from "./config.ts"
import {readFileCommands, readStdinCommands} from "./commands.ts"
import {ensureParentDir} from "./fs.ts"
import {EventLogger} from "./logger.ts"
import {startHttpServer, type HttpServer} from "./server.ts"
import {InterpreterSessionManager, type InterpreterSessionRunOptions, type StartupTargetOptions} from "./session.ts"
import {serializeError} from "./errors.ts"

export type RunInterpreterOptions = {
  startupTarget?: StartupTargetOptions
  startupTargets?: InterpreterSessionRunOptions[]
}

type InterpreterRuntimeHandle = {
  shutdown(reason: string, code?: number): Promise<void>
}

type InterpreterGlobalState = typeof globalThis & {
  __metaforInterpreterRuntime?: InterpreterRuntimeHandle
}

export async function runInterpreter(config: InterpreterConfig = loadConfig(), options: RunInterpreterOptions = {}): Promise<void> {
  const globalState = globalThis as InterpreterGlobalState
  await globalState.__metaforInterpreterRuntime?.shutdown("replace")

  ensureParentDir(config.dumpPath)
  ensureParentDir(config.consoleLogPath)
  ensureParentDir(config.commandPath)
  ensureParentDir(config.responsePath)

  const logger = new EventLogger(config.eventLogPath)
  const sessions = new InterpreterSessionManager(config, logger)
  const initialSession = sessions.initialSession

  logger.status(`connecting to interpreter socket ${config.inspectorUrl}`)
  logger.event("interpreter.started", {
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
        client: initialSession.client,
        snapshots: initialSession.snapshots,
        consoleLogs: initialSession.consoleLogs,
        breakpoints: initialSession.breakpoints,
        target: initialSession.target,
        sessions,
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

  let resolveRun: (() => void) | undefined
  let cleanupPromise: Promise<void> | undefined
  const commandAbort = new AbortController()
  const shutdownHandle: InterpreterRuntimeHandle = {
    shutdown: (reason, code) => cleanup(reason, code),
  }
  globalState.__metaforInterpreterRuntime = shutdownHandle

  const cleanup = (reason: string, code?: number): Promise<void> => {
    cleanupPromise ??= (async () => {
      logger.event("interpreter.shutdown", code === undefined ? {reason} : {reason, code})
      commandAbort.abort()
      await sessions.shutdown()
      httpServer?.stop?.()
      process.off("SIGINT", onSigint)
      process.off("SIGTERM", onSigterm)
      if (globalState.__metaforInterpreterRuntime === shutdownHandle) {
        delete globalState.__metaforInterpreterRuntime
      }
      resolveRun?.()
      resolveRun = undefined
    })()
    return cleanupPromise
  }

  const shutdown = (code: number): void => {
    void cleanup("signal", code).finally(() => process.exit(code))
  }
  const onSigint = () => shutdown(130)
  const onSigterm = () => shutdown(143)

  if (import.meta.hot) {
    import.meta.hot.accept()
    import.meta.hot.dispose(() => cleanup("hot-reload"))
  }

  const startupTargets: InterpreterSessionRunOptions[] = options.startupTargets ?? (
    options.startupTarget === undefined ? [] : [options.startupTarget]
  )
  const [firstStartupTarget, ...additionalStartupTargets] = startupTargets
  if (firstStartupTarget !== undefined) {
    try {
      if (firstStartupTarget.label !== undefined) initialSession.setLabel(firstStartupTarget.label)
      const snapshot = initialSession.runTarget(firstStartupTarget)
      logger.event("target.startup.started", {
        sessionId: initialSession.id,
        pid: snapshot.pid,
        command: snapshot.command,
        cwd: snapshot.cwd,
        pauseOnStart: snapshot.pauseOnStart,
      })
    } catch (error) {
      logger.event("target.startup.failed", {
        sessionId: initialSession.id,
        command: firstStartupTarget.command,
        error: serializeError(error),
      })
      logger.status(`startup target failed: ${serializeError(error)}`)
    }
  }
  for (const [index, startupTarget] of additionalStartupTargets.entries()) {
    try {
      const session = sessions.run({
        ...startupTarget,
        label: startupTarget.label ?? `process ${index + 2}`,
      })
      logger.event("target.startup.started", {
        sessionId: session.id,
        pid: session.target.snapshot().pid,
        command: session.target.snapshot().command,
        cwd: session.target.snapshot().cwd,
        pauseOnStart: session.target.snapshot().pauseOnStart,
      })
    } catch (error) {
      logger.event("target.startup.failed", {
        command: startupTarget.command,
        error: serializeError(error),
      })
      logger.status(`startup target failed: ${serializeError(error)}`)
    }
  }

  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigterm)

  sessions.start()
  void readStdinCommands({
    client: initialSession.client,
    snapshots: initialSession.snapshots,
    logger,
    responsePath: config.responsePath,
    signal: commandAbort.signal,
  })
  void readFileCommands({
    client: initialSession.client,
    snapshots: initialSession.snapshots,
    logger,
    responsePath: config.responsePath,
    signal: commandAbort.signal,
  }, config.commandPath)

  return await new Promise<void>((resolve) => {
    resolveRun = resolve
    // WebSocket, reconnect timers, and stdin drive the process lifetime.
  })
}
