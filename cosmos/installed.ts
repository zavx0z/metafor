import {mkdir, realpath} from "node:fs/promises"
import {Database} from "bun:sqlite"
import {join, resolve} from "node:path"
import {createInstalledReleaseStore} from "@metafor/tech-release/installed"
import {observeServerRelease, ServerStartupCleanupError, startStagedServerRelease, type ServerProcessCandidate} from "@cosmos/startup"
import {readInstalledStateCompatibility, verifyInstalledReleaseSelection, type InstalledReleaseSelection} from "./selection"

export interface InstalledCosmosOptions {
  /** Cancels initial startup; runInstalledCosmos also stops its active host on abort. */
  readonly signal?: AbortSignal
  readonly storeRoot: string
  /** Первый явно назначенный кандидат, когда active ещё не записан. */
  readonly initialDigest?: string
  /** Одноразовый явный выбор оператора; обычный restart читает durable active. */
  readonly selection?: InstalledReleaseSelection
  readonly port?: number
  /** Bounded owned-release shutdown; omitted retains startup's existing default. */
  readonly terminationTimeoutMs?: number
  /** Установленная устойчивая WEB-оболочка; не исходники сменяемого release. */
  readonly staticRoot?: string
  readonly controlToken?: string
  /** Explicit instance configuration passed to every exact release incarnation. */
  readonly environment?: Readonly<Record<string, string | undefined>>
}

/**
Launcher установленного Cosmos: получает готовый candidate из local storage,
запускает его через startup и единолично записывает active после готовности.
Сеть, получение bytes и browser cache policy launcher не исполняет.
*/
export async function startInstalledCosmos(options: InstalledCosmosOptions) {
  options.signal?.throwIfAborted()
  const root = resolve(options.storeRoot)
  await mkdir(root, {recursive: true})
  const unlock = await acquireLauncher(root)
  const store = createInstalledReleaseStore({root})
  try {
    options.signal?.throwIfAborted()
    let activation = await store.readActivation()
    if (options.selection) await verifyInstalledReleaseSelection(root, options.selection)
    if (activation?.operation?.state === "running") {
      activation = await store.recordOperation({...activation.operation, state: "failed", error: "Previous startup ended before confirming the operation"}, activation)
    }
    const digest = options.selection?.target ?? activation?.digest ?? options.initialDigest
    if (!digest) throw new Error("Installed Cosmos requires an explicit initial candidate or active release")
    const compatibility = new Map<string, string | null>()
    const resolveCandidate = async (target: string): Promise<ServerProcessCandidate> => {
      const {graph} = await store.verifyCandidate(target)
      compatibility.set(target, await readInstalledStateCompatibility(store, target))
      const member = graph.packages.find(item => item.name === "@cosmos/release")
      const output = member?.environments.find(item => item.env === "server")?.outputs.find(item => item.artifact === "." && item.kind === "entry-point")
      if (!member || !output) throw new Error("Installed Cosmos server entry is missing")
      const identity = {name: member.name, env: "server" as const, version: member.version, sha256: output.sha256, size: output.size}
      const executable = await store.artifactPath(target, {...identity, artifact: "."})
      return {
        artifact: {identity, executable},
        context: {
          cwd: root,
          env: {
            ...options.environment,
            COSMOS_RELEASE_STORE: root,
            COSMOS_RELEASE_DIGEST: target,
            PORT: String(options.port ?? 4444),
            COSMOS_STATIC_ROOT: options.staticRoot ? resolve(options.staticRoot) : undefined,
            COSMOS_CONTROL_TOKEN: options.controlToken,
            COSMOS_RELEASE_SELECTION: undefined,
          },
          readyTimeoutMs: 120_000,
          ...(options.terminationTimeoutMs === undefined ? {} : {terminationTimeoutMs: options.terminationTimeoutMs}),
        },
      }
    }
    const host = await startStagedServerRelease(await resolveCandidate(digest), {
      ...(options.signal ? {signal: options.signal} : {}),
      resolveCandidate,
      async commitCandidate(candidate) {
        const target = candidate.context.env?.COSMOS_RELEASE_DIGEST
        if (!target) throw new Error("Installed Cosmos candidate identity is missing")
        await store.commitActive(target, {digest: activation?.digest ?? null, revision: activation?.revision ?? 0})
        activation = await store.readActivation()
      },
      async confirmCandidate(candidate) {
        const target = candidate.context.env?.COSMOS_RELEASE_DIGEST
        if (!target || !activation) throw new Error("Installed Cosmos activation is missing")
        activation = await store.confirmActive(target, compatibility.get(target) ?? null, activation)
      },
      async beginSelection(request) {
        if (!request.selection || !activation) throw new Error("Installed selection is unavailable")
        const previous = activation.operation
        if (previous?.id === request.requestId) {
          if (previous.target !== request.target || previous.kind !== request.selection.kind ||
              previous.expected.digest !== request.selection.expected.digest || previous.expected.revision !== request.selection.expected.revision)
            throw new Error("Installed operation identity was reused for another selection")
          if (previous.state === "complete") return false
          throw new Error(previous.error ?? "Installed operation is already running")
        }
        const selection: InstalledReleaseSelection = {storeRoot: await realpath(root), target: request.target, ...request.selection}
        await verifyInstalledReleaseSelection(root, selection, {compatible: true})
        activation = await store.recordOperation({id: request.requestId, target: request.target, ...request.selection, state: "running"}, activation)
        return true
      },
      async finishSelection(request, error) {
        if (!activation?.operation || activation.operation.id !== request.requestId) throw new Error("Installed operation identity changed")
        activation = await store.recordOperation({...activation.operation, state: error ? "failed" : "complete",
          ...(error ? {error: error.message.slice(0, 2000) || "Release selection failed"} : {})}, activation)
      },
    })
    let destroying: Promise<void> | undefined
    return {
      host,
      store,
      destroy() {
        destroying ??= (async () => {
          try { await host.destroy() }
          finally { if (host.ownedProcessesExited) await unlock() }
        })()
        return destroying
      },
    }
  } catch (error) {
    if (!(error instanceof ServerStartupCleanupError) || error.ownedProcessesExited) await unlock()
    throw error
  }
}

/** Наблюдает текущую incarnation через все handover, пока работает launcher. */
export async function runInstalledCosmos(options: InstalledCosmosOptions) {
  const cancellation = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, cancellation.signal]) : cancellation.signal
  let stop!: () => void
  const stopped = new Promise<void>(resolve => { stop = resolve })
  const cancel = () => cancellation.abort(new DOMException("Installed Cosmos was stopped", "AbortError"))
  signal.addEventListener("abort", stop, {once: true})
  if (signal.aborted) stop()
  process.on("SIGINT", cancel)
  process.on("SIGTERM", cancel)
  let runtime: Awaited<ReturnType<typeof startInstalledCosmos>> | undefined
  try {
    try { runtime = await startInstalledCosmos({...options, signal}) }
    catch (error) {
      if (signal.aborted && error === signal.reason) return
      throw error
    }
    const outcome = await Promise.race([observeServerRelease(runtime.host), stopped])
    if (outcome?.reason === "failed") throw outcome.error
  } finally {
    try { await runtime?.destroy() }
    finally {
      process.off("SIGINT", cancel)
      process.off("SIGTERM", cancel)
      signal.removeEventListener("abort", stop)
    }
  }
}

async function acquireLauncher(root: string): Promise<() => Promise<void>> {
  // SQLite удерживает системную блокировку; после падения процесса её снимает ОС.
  // Эта пустая база не хранит состав выпуска и не создаёт предметной схемы.
  const database = new Database(join(root, "launcher.sqlite"), {create: true})
  try {
    database.exec("PRAGMA busy_timeout = 0")
    database.exec("BEGIN EXCLUSIVE")
  } catch (error) {
    database.close()
    throw new Error("Installed Cosmos already has a live launcher or its lock is unavailable", {cause: error})
  }
  let released = false
  return async () => {
    if (released) return
    released = true
    try { database.exec("ROLLBACK") } finally { database.close() }
  }
}
