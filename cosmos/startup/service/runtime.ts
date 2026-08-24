import type {
  ActivePackage,
  ReleaseDependencies,
  ReleaseLoader,
  ReleaseRuntime,
} from "@cosmos/release"
import {
  browserFunctionArtifact,
  createBrowserFunctionExecutor,
} from "./executor"

/** Синхронная browser-event поверхность неизменяемого startup. */
export interface StartupEventScope {
  readonly clients: Pick<Clients, "claim">
  skipWaiting(): Promise<void>
  addEventListener(type: "install", listener: (event: ExtendableEvent) => void): void
  addEventListener(type: "activate", listener: (event: ExtendableEvent) => void): void
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
  addEventListener(type: "message", listener: (event: ExtendableMessageEvent) => void): void
}

/** Runtime host, который startup использует без знания release policy. */
export interface ReleaseHost {
  readonly dependencies: ReleaseDependencies
  boot(): Promise<void>
  prepare(request?: Request): Promise<ReleaseRuntime>
  activate(candidate: ReleaseRuntime): Promise<void>
  fetch(event: FetchEvent): Promise<Response>
  message(event: ExtendableMessageEvent): Promise<void>
}

/**
Создаёт единственную runtime-границу startup → release.

Startup хранит только текущий runtime и его незавершённые browser events.
Остальное прикладное поведение остаётся внутри release.
*/
export function createReleaseHost(
  source: Request,
  loader: ReleaseLoader,
): ReleaseHost {
  let active: ActivePackage<ReleaseRuntime> | null = null
  let booting: Promise<void> | null = null
  const inFlight = new Map<ReleaseRuntime, Set<Promise<unknown>>>()
  const loaderApi = Object.freeze({
    verify: loader.verify,
    cache: loader.cache,
    read: loader.read,
    run: loader.run,
  })
  const executor = createBrowserFunctionExecutor(loaderApi.run)
  let dependencies!: ReleaseDependencies

  const prepare = async (request = source) => {
    let response = await loaderApi.read("release", request)
    if (response) {
      console.debug("[@cosmos/startup:service]", "release artifact выбран", {
        env: response.headers.get("X-Package-Env"),
        name: response.headers.get("X-Package-Name"),
        request: request.url,
        source: "cache",
        version: response.headers.get("X-Package-Version"),
      })
    } else {
      response = loaderApi.verify(await fetch(request))
      await loaderApi.cache("release", request, response)
      response = await loaderApi.read("release", request)
      if (response) {
        console.debug("[@cosmos/startup:service]", "release artifact выбран", {
          env: response.headers.get("X-Package-Env"),
          name: response.headers.get("X-Package-Name"),
          request: request.url,
          source: "network",
          version: response.headers.get("X-Package-Version"),
        })
      }
    }
    if (!response) throw new Error("Cached release service is missing")

    loaderApi.verify(response)
    const artifact = await browserFunctionArtifact(response)
    const candidate = await executor.prepare(artifact, dependencies)
    console.debug("[@cosmos/startup:service]", "release runtime подготовлен", {
      env: artifact.identity.env,
      name: artifact.identity.name,
      request: request.url,
      version: artifact.identity.version,
    })
    return candidate
  }

  const activate = async (candidate: ReleaseRuntime) => {
    const previous = active
    const next = await executor.activate(candidate)

    active = next
    if (previous && previous.runtime !== candidate) {
      await drain(previous.runtime)
      await executor.destroy(previous)
      inFlight.delete(previous.runtime)
    }
    console.debug("[@cosmos/startup:service]", "release runtime активирован", {
      replaced: previous !== null && previous.runtime !== candidate,
    })
  }

  const boot = async () => {
    if (active) return
    booting ??= (async () => {
      console.debug("[@cosmos/startup:service]", "bootstrap release начат", {
        request: source.url,
      })
      try {
        await activate(await prepare())
      } catch (error) {
        console.error("[@cosmos/startup:service]", "bootstrap release завершился с ошибкой", {
          error: errorMessage(error),
          request: source.url,
        })
        throw error
      }
    })()
    const attempt = booting
    try {
      await attempt
    } catch (error) {
      if (booting === attempt) booting = null
      throw error
    }
  }

  const fetchEvent = async (event: FetchEvent) => {
    await boot()
    if (!active) throw new Error("Release service is not active")
    const runtime = active.runtime
    return await track(runtime, runtime.fetch(event))
  }

  const messageEvent = async (event: ExtendableMessageEvent) => {
    await boot()
    if (!active) throw new Error("Release service is not active")
    const runtime = active.runtime
    await track(runtime, runtime.message(event))
  }

  const runtimeApi = Object.freeze({prepare, activate})
  dependencies = Object.freeze({loader: loaderApi, runtime: runtimeApi})

  return {
    dependencies,
    boot,
    prepare,
    activate,
    fetch: fetchEvent,
    message: messageEvent,
  }

  async function track<T>(runtime: ReleaseRuntime, promise: Promise<T>) {
    const pending = inFlight.get(runtime) ?? new Set<Promise<unknown>>()
    pending.add(promise)
    inFlight.set(runtime, pending)
    void promise.then(
      () => pending.delete(promise),
      () => pending.delete(promise),
    )
    return await promise
  }

  async function drain(runtime: ReleaseRuntime) {
    const pending = inFlight.get(runtime)
    while (pending && pending.size > 0) await Promise.allSettled([...pending])
  }
}

/** Регистрирует все поддержанные browser events во время initial evaluation. */
export function registerReleaseListeners(scope: StartupEventScope, host: ReleaseHost) {
  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.skipWaiting())
  })

  scope.addEventListener("activate", (event) => {
    event.waitUntil(Promise.all([
      scope.clients.claim(),
      host.boot().catch(() => {}),
    ]))
  })

  scope.addEventListener("fetch", (event) => {
    const operation = host.fetch(event)
    event.respondWith(operation)
    event.waitUntil(operation)
  })

  scope.addEventListener("message", (event) => {
    event.waitUntil(host.message(event))
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
