/**
 * Bun entrypoint устойчивого startup.
 *
 * Он разрешает exact server artifact текущего release, передаёт его общему
 * process executor, ждёт готовность и наблюдает завершение. Signal shutdown
 * уничтожает только принадлежащую startup release incarnation.
 *
 * Пользовательский lifecycle задан [startup owner law](../README.md#как-начинается-работа),
 * а process outcomes проверяет
 * [server startup regression](../../tests/server-startup.spec.ts).
 *
 * @packageDocumentation
 */

import type {ActivePackage, PackageExit} from "@cosmos/release"
import {currentServerReleaseArtifact, serverStartupCosmosRoot} from "./artifact"
import {
  createServerProcessExecutor,
  type ServerProcessRuntime,
} from "./executor"

export interface ServerStartupOptions {
  readonly cosmosRoot?: string
  readonly inspect?: string
  readonly port?: number
  readonly readyTimeoutMs?: number
}

export interface ServerReleaseHost {
  readonly active: ActivePackage<ServerProcessRuntime>
  destroy(): Promise<void>
}

/** Проверяет и запускает ровно один current server release process. */
export async function startServerRelease(
  options: ServerStartupOptions = {},
): Promise<ServerReleaseHost> {
  const cosmosRoot = options.cosmosRoot ?? serverStartupCosmosRoot()
  let artifact: Awaited<ReturnType<typeof currentServerReleaseArtifact>> | null = null
  try {
    artifact = await currentServerReleaseArtifact(cosmosRoot)
    const executor = createServerProcessExecutor()
    const candidate = await executor.prepare(artifact, Object.freeze({
      cwd: cosmosRoot,
      env: Object.freeze({
        COSMOS_ROOT: cosmosRoot,
        PORT: String(options.port ?? serverStartupPort()),
      }),
      ...(options.inspect ? {inspect: options.inspect} : {}),
      ...(options.readyTimeoutMs === undefined ? {} : {readyTimeoutMs: options.readyTimeoutMs}),
    }))
    const active = await executor.activate(candidate)
    console.debug("[@cosmos/startup:server]", "release process активирован", {
      env: artifact.identity.env,
      name: artifact.identity.name,
      pid: active.runtime.process.pid,
      version: artifact.identity.version,
    })
    return Object.freeze({
      active,
      destroy: () => executor.destroy(active),
    })
  } catch (error) {
    console.error("[@cosmos/startup:server]", "release process не запущен", {
      error: errorMessage(error),
    })
    throw error
  }
}

/** Наблюдает завершение release без restart и rollback. */
export async function observeServerRelease(host: ServerReleaseHost): Promise<PackageExit> {
  const exit = await host.active.finished
  if (exit.reason === "failed") {
    console.error("[@cosmos/startup:server]", "release process завершился с ошибкой", {
      error: errorMessage(exit.error),
      pid: host.active.runtime.process.pid,
      version: host.active.runtime.identity.version,
    })
  }
  return exit
}

/** Жизненный цикл тонкого server startup process. */
export async function runServerStartup(options: ServerStartupOptions = {}): Promise<void> {
  const stop = processSignal()
  let host: ServerReleaseHost
  try {
    const inspect = (options.inspect ?? Bun.env.COSMOS_RELEASE_INSPECT?.trim()) || undefined
    host = await startServerRelease({
      ...options,
      ...(inspect ? {inspect} : {}),
    })
  } catch {
    await stop.promise
    stop.dispose()
    return
  }

  const outcome = await Promise.race([
    observeServerRelease(host).then((exit) => ({kind: "exit" as const, exit})),
    stop.promise.then(() => ({kind: "stop" as const})),
  ])
  if (outcome.kind === "stop") await host.destroy()
  else if (outcome.exit.reason === "failed") await stop.promise
  stop.dispose()
}

if (import.meta.main) await runServerStartup()

function processSignal() {
  let resolve!: () => void
  const promise = new Promise<void>((accepted) => { resolve = accepted })
  process.once("SIGINT", resolve)
  process.once("SIGTERM", resolve)
  return {
    promise,
    dispose() {
      process.off("SIGINT", resolve)
      process.off("SIGTERM", resolve)
    },
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function serverStartupPort() {
  const port = Number(Bun.env.PORT ?? Bun.env.BUN_PORT ?? 4444)
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error(`Invalid Cosmos server port: ${String(Bun.env.PORT ?? Bun.env.BUN_PORT)}`)
  return port
}
