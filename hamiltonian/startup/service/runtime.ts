import type {
  ReleaseDependencies,
  ReleaseFactory,
  ReleaseLoader,
  ReleaseRuntime,
} from "@hamiltonian/release"

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
 * Создаёт единственную runtime-границу startup → release.
 *
 * Startup хранит только текущий runtime и его незавершённые browser events.
 * Остальное прикладное поведение остаётся внутри release.
 */
export function createReleaseHost(
  source: Request,
  loader: ReleaseLoader,
): ReleaseHost {
  let active: ReleaseRuntime | null = null
  let booting: Promise<void> | null = null
  const inFlight = new Map<ReleaseRuntime, Set<Promise<unknown>>>()
  const loaderApi = Object.freeze({
    verify: loader.verify,
    cache: loader.cache,
    read: loader.read,
    run: loader.run,
  })
  let dependencies!: ReleaseDependencies

  const prepare = async (request = source) => {
    let response = await loaderApi.read("release", request)
    if (response) {
      console.debug("[@hamiltonian/startup:service]", "release artifact выбран", {
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
        console.debug("[@hamiltonian/startup:service]", "release artifact выбран", {
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
    const module = {exports: {}} as {exports: {default?: ReleaseFactory}}
    loaderApi.run(await response.text(), {module})
    const factory = module.exports.default
    if (typeof factory !== "function") throw new Error("Release service factory is missing")
    const candidate = await factory(dependencies)
    assertRuntime(candidate)
    console.debug("[@hamiltonian/startup:service]", "release runtime подготовлен", {
      env: response.headers.get("X-Package-Env"),
      name: response.headers.get("X-Package-Name"),
      request: request.url,
      version: response.headers.get("X-Package-Version"),
    })
    return candidate
  }

  const activate = async (candidate: ReleaseRuntime) => {
    assertRuntime(candidate)
    const previous = active

    try {
      await candidate.start()
    } catch (error) {
      await candidate.destroy().catch(() => {})
      throw error
    }

    active = candidate
    if (previous && previous !== candidate) {
      await drain(previous)
      await previous.destroy()
      inFlight.delete(previous)
    }
    console.debug("[@hamiltonian/startup:service]", "release runtime активирован", {
      replaced: previous !== null && previous !== candidate,
    })
  }

  const boot = async () => {
    if (active) return
    booting ??= (async () => {
      console.debug("[@hamiltonian/startup:service]", "bootstrap release начат", {
        request: source.url,
      })
      try {
        await activate(await prepare())
      } catch (error) {
        console.error("[@hamiltonian/startup:service]", "bootstrap release завершился с ошибкой", {
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
    const runtime = active
    return await track(runtime, runtime.fetch(event))
  }

  const messageEvent = async (event: ExtendableMessageEvent) => {
    await boot()
    if (!active) throw new Error("Release service is not active")
    const runtime = active
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

function assertRuntime(runtime: unknown): asserts runtime is ReleaseRuntime {
  if (
    typeof runtime !== "object"
    || runtime === null
    || typeof (runtime as ReleaseRuntime).start !== "function"
    || typeof (runtime as ReleaseRuntime).fetch !== "function"
    || typeof (runtime as ReleaseRuntime).message !== "function"
    || typeof (runtime as ReleaseRuntime).destroy !== "function"
  ) throw new Error("Release service returned an invalid runtime")
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
