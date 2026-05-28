import {loadConfig, type InterpreterConfig} from "./config.ts"
import {readFileCommands, readStdinCommands} from "./commands.ts"
import {ensureParentDir} from "./fs.ts"
import {EventLogger} from "./logger.ts"
import {startHttpServer, type HttpServer} from "./server.ts"
import {InterpreterModuleManager, type InterpreterModuleRunOptions, type StartupModuleOptions} from "./module.ts"
import {serializeError} from "./errors.ts"

export type RunInterpreterOptions = {
  startupModule?: StartupModuleOptions
  startupModules?: InterpreterModuleRunOptions[]
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

  const startupModules: InterpreterModuleRunOptions[] = options.startupModules ?? (
    options.startupModule === undefined ? [] : [options.startupModule]
  )
  const [firstStartupModule, ...additionalStartupModules] = startupModules

  const logger = new EventLogger(config.eventLogPath)
  const modules = new InterpreterModuleManager(config, logger, firstStartupModule)
  const initialModule = modules.initialModule

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
        client: initialModule.client,
        snapshots: initialModule.snapshots,
        consoleLogs: initialModule.consoleLogs,
        breakpoints: initialModule.breakpoints,
        target: initialModule.target,
        modules,
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
      await modules.shutdown()
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

  if (firstStartupModule !== undefined) {
    try {
      if (firstStartupModule.label !== undefined) initialModule.setLabel(firstStartupModule.label)
      const snapshot = initialModule.runTarget(firstStartupModule)
      logger.event("module.startup.started", {
        moduleId: initialModule.id,
        pid: snapshot.pid,
        command: snapshot.command,
        cwd: snapshot.cwd,
        pauseOnStart: snapshot.pauseOnStart,
      })
    } catch (error) {
      logger.event("module.startup.failed", {
        moduleId: initialModule.id,
        command: firstStartupModule.command,
        error: serializeError(error),
      })
      logger.status(`startup module failed: ${serializeError(error)}`)
    }
  }
  for (const [index, startupModule] of additionalStartupModules.entries()) {
    try {
      const module = modules.run({
        ...startupModule,
        label: startupModule.label ?? startupModule.id ?? `module-${index + 2}`,
      })
      logger.event("module.startup.started", {
        moduleId: module.id,
        pid: module.target.snapshot().pid,
        command: module.target.snapshot().command,
        cwd: module.target.snapshot().cwd,
        pauseOnStart: module.target.snapshot().pauseOnStart,
      })
    } catch (error) {
      logger.event("module.startup.failed", {
        command: startupModule.command,
        error: serializeError(error),
      })
      logger.status(`startup module failed: ${serializeError(error)}`)
    }
  }

  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigterm)

  modules.start()
  void readStdinCommands({
    client: initialModule.client,
    snapshots: initialModule.snapshots,
    logger,
    responsePath: config.responsePath,
    signal: commandAbort.signal,
  })
  void readFileCommands({
    client: initialModule.client,
    snapshots: initialModule.snapshots,
    logger,
    responsePath: config.responsePath,
    signal: commandAbort.signal,
  }, config.commandPath)

  return await new Promise<void>((resolve) => {
    resolveRun = resolve
    // WebSocket, reconnect timers, and stdin drive the runtime lifetime.
  })
}
