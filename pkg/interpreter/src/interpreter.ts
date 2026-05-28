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

export async function runInterpreter(config: InterpreterConfig = loadConfig(), options: RunInterpreterOptions = {}): Promise<never> {
  ensureParentDir(config.dumpPath)
  ensureParentDir(config.consoleLogPath)
  ensureParentDir(config.commandPath)
  ensureParentDir(config.responsePath)

  const logger = new EventLogger(config.eventLogPath)
  const sessions = new InterpreterSessionManager(config, logger)
  const defaultSession = sessions.defaultSession

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
        client: defaultSession.client,
        snapshots: defaultSession.snapshots,
        consoleLogs: defaultSession.consoleLogs,
        breakpoints: defaultSession.breakpoints,
        target: defaultSession.target,
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

  const startupTargets: InterpreterSessionRunOptions[] = options.startupTargets ?? (
    options.startupTarget === undefined ? [] : [options.startupTarget]
  )
  const [firstStartupTarget, ...additionalStartupTargets] = startupTargets
  if (firstStartupTarget !== undefined) {
    try {
      if (firstStartupTarget.label !== undefined) defaultSession.setLabel(firstStartupTarget.label)
      const snapshot = defaultSession.runTarget(firstStartupTarget)
      logger.event("target.startup.started", {
        sessionId: defaultSession.id,
        pid: snapshot.pid,
        command: snapshot.command,
        cwd: snapshot.cwd,
        pauseOnStart: snapshot.pauseOnStart,
      })
    } catch (error) {
      logger.event("target.startup.failed", {
        sessionId: defaultSession.id,
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

  const shutdown = (code: number): never => {
    logger.event("interpreter.shutdown", {code})
    sessions.shutdown()
    httpServer?.stop?.()
    process.exit(code)
  }

  process.on("SIGINT", () => shutdown(130))
  process.on("SIGTERM", () => shutdown(143))

  sessions.start()
  void readStdinCommands({
    client: defaultSession.client,
    snapshots: defaultSession.snapshots,
    logger,
    responsePath: config.responsePath,
  })
  void readFileCommands({
    client: defaultSession.client,
    snapshots: defaultSession.snapshots,
    logger,
    responsePath: config.responsePath,
  }, config.commandPath)

  return await new Promise<never>(() => {
    // WebSocket, reconnect timers, and stdin drive the process lifetime.
  })
}
