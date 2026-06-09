import {loadConfig, type InterpreterConfig} from "./config.ts"
import {ensureParentDir} from "./fs.ts"
import {EventLogger} from "./logger.ts"
import {startHttpServer, type HttpServer} from "./server.ts"
import {InterpreterModuleManager, type InterpreterModuleRunOptions, type StartupModuleOptions} from "./module.ts"
import {serializeError} from "./errors.ts"

export type RunInterpreterOptions = {
  startupModule?: StartupModuleOptions
  startupModules?: InterpreterModuleRunOptions[]
  startupSqliteDatabases?: string[]
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

  const startupModules: InterpreterModuleRunOptions[] = options.startupModules ?? (
    options.startupModule === undefined ? [] : [options.startupModule]
  )
  const logger = new EventLogger(config.eventLogPath)
  const modules = new InterpreterModuleManager(config, logger)

  logger.status(`connecting to interpreter socket ${config.protocolUrl}`)
  logger.event("interpreter.started", {
    protocolUrl: config.protocolUrl,
    dumpPath: config.dumpPath,
    eventLogPath: config.eventLogPath,
    consoleLogPath: config.consoleLogPath,
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
        modules,
        logger,
        eventLogPath: config.eventLogPath,
        consoleLogPath: config.consoleLogPath,
        startupSqliteDatabases: options.startupSqliteDatabases ?? [],
      })
    } catch (error) {
      logger.event("http.start.failed", {error: serializeError(error)})
      logger.status(`http api failed to start on ${config.httpHost}:${config.httpPort}`)
    }
  }

  let resolveRun: (() => void) | undefined
  let cleanupPromise: Promise<void> | undefined
  const shutdownHandle: InterpreterRuntimeHandle = {
    shutdown: (reason, code) => cleanup(reason, code),
  }
  globalState.__metaforInterpreterRuntime = shutdownHandle

  const cleanup = (reason: string, code?: number): Promise<void> => {
    cleanupPromise ??= (async () => {
      logger.event("interpreter.shutdown", code === undefined ? {reason} : {reason, code})
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

  for (const [index, startupModule] of startupModules.entries()) {
    try {
      const module = modules.run({
        ...startupModule,
        label: startupModule.label ?? startupModule.id ?? `module-${index + 1}`,
      })
      const snapshot = module.target.snapshot()
      logger.event("module.startup.started", {
        moduleId: module.id,
        pid: snapshot.pid,
        command: snapshot.command,
        cwd: snapshot.cwd,
        pauseOnStart: snapshot.pauseOnStart,
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

  return await new Promise<void>((resolve) => {
    resolveRun = resolve
    // HTTP/WebSocket and reconnect timers drive the runtime lifetime.
  })
}
