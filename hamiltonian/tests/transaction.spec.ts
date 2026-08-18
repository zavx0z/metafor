import {expect, test} from "bun:test"
import type {BrowserPackageEnvironment} from "../shared/package/environment"
import {
  artifactIntegrity,
  packageIdentityHeaders,
  type BrowserPackageIdentity,
} from "../shared/package/integrity"
import {browserPackageCache, browserPackageUrl} from "../shared/package/url"
import {releaseDelta} from "../release/server/release/delta"
import {currentReleasePackages} from "../release/service/cache/current"
import {updateRelease} from "../release/service/update"
import {read} from "../startup/service/loader"
import {captureDiagnostics} from "./fixture/diagnostics"

const origin = "https://transaction.test"

test.serial("UPD-003 keeps a complete old or new composition after every durable mutation", async () => {
  const successful = await fixture()
  const completed = await runUpdate(successful)
  expect(completed.error).toBeNull()
  expect(completed.mutations.at(-1)).toEqual({cache: "transaction", kind: "delete-cache"})
  await expectNewComposition(completed.storage, successful.next)

  for (let failAfter = 1; failAfter <= completed.mutations.length; failAfter += 1) {
    const interrupted = await fixture()
    interrupted.storage.failAfter = failAfter
    const attempt = await runUpdate(interrupted)
    expect(attempt.error).not.toBeNull()

    const snapshot = await packageUrls(interrupted.storage)
    const hasOld = interrupted.previous.every((entry) => snapshot.has(exactUrl(entry)))
    const hasNew = interrupted.next.every((entry) => snapshot.has(exactUrl(entry)))
    expect(hasOld || hasNew).toBe(true)

    interrupted.storage.failAfter = null
    interrupted.storage.resetMutations()
    await captureDiagnostics(async () => {
      await withServiceWorkerGlobals(interrupted.storage, interrupted.network, async () => {
        const current = await currentReleasePackages()
        await updateRelease(loader, releaseDelta(interrupted.next, current))
      })
    })
    await expectNewComposition(interrupted.storage, interrupted.next)
  }
})

test.serial("UPD-003 installs every candidate before cleanup and deletes service release and transaction last", async () => {
  const state = await fixture()
  const result = await runUpdate(state)
  expect(result.error).toBeNull()

  const marker = `${origin}/transaction`
  const transactionPuts = result.mutations.filter((mutation) =>
    mutation.cache === "transaction" && mutation.kind === "put")
  expect(transactionPuts[0]?.url).toBe(marker)

  const firstCanonicalDelete = result.mutations.findIndex((mutation) =>
    mutation.kind === "delete" && mutation.cache !== "transaction")
  expect(firstCanonicalDelete).toBeGreaterThan(0)
  const mutationsBeforeCleanup = result.mutations.slice(0, firstCanonicalDelete)
  for (const entry of state.next) {
    expect(mutationsBeforeCleanup).toContainEqual({
      cache: browserPackageCache(entry.name)!,
      kind: "put",
      url: exactUrl(entry),
    })
  }

  for (const entry of state.previous) {
    expect(result.mutations).not.toContainEqual({
      cache: browserPackageCache(entry.name)!,
      kind: "put",
      url: exactUrl(entry),
    })
  }

  const canonicalDeletes = result.mutations.filter((mutation) =>
    mutation.kind === "delete" && mutation.cache !== "transaction")
  expect(canonicalDeletes.at(-1)?.url).toBe(exactUrl(
    state.previous.find(({name, env}) =>
      name === "@hamiltonian/release" && env === "service")!,
  ))
  expect(result.mutations.at(-1)).toEqual({cache: "transaction", kind: "delete-cache"})
})

test.serial("UPD-003 treats a stale update for an installed exact entry as a no-op", async () => {
  const installed = await artifact("@hamiltonian/release", "main", "1.0.0", "installed main")
  const storage = new MemoryCacheStorage()
  const release = await storage.open("release")
  await release.put(exactUrl(installed.identity), installed.response)
  storage.resetMutations()

  const network = new Map([[exactUrl(installed.identity), installed.response]])
  const {result: changed} = await captureDiagnostics(async () =>
    await withServiceWorkerGlobals(storage, network, async () =>
      await updateRelease(loader, {update: [installed.identity], remove: []})))

  expect(changed).toEqual([])
  expect((await release.keys()).map(({url}) => url)).toEqual([exactUrl(installed.identity)])
  expect(storage.mutations.some((mutation) =>
    mutation.cache === "release" && (mutation.kind === "put" || mutation.kind === "delete")))
    .toBe(false)
  expect(storage.mutations.at(-1)).toEqual({cache: "transaction", kind: "delete-cache"})
  expect(await storage.keys()).not.toContain("transaction")
})

test.serial("UPD-003 prepares release runtime before cleanup and activates it only after durable commit", async () => {
  const state = await fixture()
  const lifecycle: string[] = []
  const candidate = inertRuntime(lifecycle)

  const {diagnostics} = await captureDiagnostics(async () => {
    await withServiceWorkerGlobals(state.storage, state.network, async () => {
      await updateRelease(loader, state.delta, {
        async prepare(request) {
          lifecycle.push(`prepare:${request.url}`)
          const urls = await packageUrls(state.storage)
          expect(state.previous.every((entry) => urls.has(exactUrl(entry)))).toBeTrue()
          expect(state.next.every((entry) => urls.has(exactUrl(entry)))).toBeTrue()
          expect(await state.storage.keys()).toContain("transaction")
          return candidate
        },
        async activate(runtime) {
          lifecycle.push("activate")
          expect(runtime).toBe(candidate)
          expect(await state.storage.keys()).not.toContain("transaction")
          await expectNewComposition(state.storage, state.next)
        },
      })
    })
  })

  const service = state.next.find(({name, env}) =>
    name === "@hamiltonian/release" && env === "service")!
  expect(lifecycle).toEqual([`prepare:${exactUrl(service)}`, "activate"])
  expect(diagnostics.map(({event}) => event)).toEqual([
    "transaction начата",
    "exact artifact подготовлен",
    "exact artifact подготовлен",
    "exact artifact подготовлен",
    "полный candidate composition проверен",
    "release runtime candidate подготовлен",
    "canonical cleanup завершён",
    "transaction завершена",
  ])
  expect(diagnostics.at(-1)?.details).toEqual(expect.objectContaining({mode: "fresh"}))
})

test.serial("UPD-003 remove-only recovery prepares the installed target release before old cleanup", async () => {
  const state = await fixture()
  for (const entry of state.next) {
    const response = state.network.get(exactUrl(entry))
    if (!response) throw new Error(`Missing fixture artifact ${exactUrl(entry)}`)
    await (await state.storage.open(browserPackageCache(entry.name)!))
      .put(exactUrl(entry), response)
  }
  await (await state.storage.open("transaction"))
    .put(`${origin}/transaction`, new Response(null, {status: 204}))
  state.storage.resetMutations()

  const current = await withServiceWorkerGlobals(
    state.storage,
    state.network,
    currentReleasePackages,
  )
  const delta = releaseDelta(state.next, current)
  expect(delta.update).toEqual([])
  const previousService = state.previous.find(({name, env}) =>
    name === "@hamiltonian/release" && env === "service")!
  expect(delta.remove).toContainEqual({
    name: previousService.name,
    env: previousService.env,
    version: previousService.version,
  })

  const prepared = {url: ""}
  const {diagnostics} = await captureDiagnostics(async () => {
    await withServiceWorkerGlobals(state.storage, state.network, async () => {
      await updateRelease(loader, delta, {
        async prepare(request) {
          prepared.url = request.url
          expect(await state.storage.keys()).toContain("transaction")
          return inertRuntime([])
        },
        async activate() {},
      })
    })
  })

  const target = state.next.find(({name, env}) =>
    name === "@hamiltonian/release" && env === "service")!
  expect(prepared.url).toBe(exactUrl(target))
  await expectNewComposition(state.storage, state.next)
  expect(diagnostics.map(({event}) => event)).toEqual([
    "transaction начата",
    "полный candidate composition проверен",
    "release runtime candidate подготовлен",
    "canonical cleanup завершён",
    "transaction завершена",
  ])
  expect(diagnostics[0]?.details).toEqual(expect.objectContaining({mode: "recovery"}))
})

test.serial("UPD-003 startup uses Cache order and fails closed on a damaged first release", async () => {
  const storage = new MemoryCacheStorage()
  const previous = await artifact("@hamiltonian/release", "service", "1.0.0", "old release")
  const next = await artifact("@hamiltonian/release", "service", "1.1.0", "new release")
  const release = await storage.open("release")
  await release.put(exactUrl(previous.identity), previous.response)
  await release.put(exactUrl(next.identity), next.response)
  storage.resetMutations()

  await withServiceWorkerGlobals(storage, new Map(), async () => {
    const stable = new Request(`${origin}${browserPackageUrl("@hamiltonian/release", "service")}`)
    expect(await (await read("release", stable))?.text()).toBe("old release")

    const mismatched = new Request(`${origin}${browserPackageUrl(
      "@hamiltonian/release",
      "service",
      "9.9.9",
    )}`)
    await release.put(mismatched, previous.response)
    await expect(read("release", mismatched)).rejects.toThrow("имеет другую version")
    await release.delete(mismatched)

    const damagedHeaders = new Headers(previous.response.headers)
    await release.put(exactUrl(previous.identity), new Response("damaged", {headers: damagedHeaders}))
    await expect(read("release", stable)).rejects.toThrow("Bytes не совпадают")
    expect((await release.keys()).map(({url}) => url)).toEqual([
      exactUrl(previous.identity),
      exactUrl(next.identity),
    ])

    await release.delete(exactUrl(previous.identity))
    expect(await (await read("release", stable))?.text()).toBe("new release")
  })
})

const loader = {
  verify(response: Response) {
    if (!response.ok) throw new Error(`Artifact returned ${response.status}`)
    return response
  },
} as Parameters<typeof updateRelease>[0]

async function fixture() {
  const previousArtifacts = await Promise.all([
    artifact("@hamiltonian/release", "main", "1.0.0", "old main"),
    artifact("@internal/visual", "main", "1.0.0", "old visual"),
    artifact("@hamiltonian/release", "service", "1.0.0", "old service"),
  ])
  const nextArtifacts = await Promise.all([
    artifact("@hamiltonian/release", "main", "1.1.0", "new main"),
    artifact("@internal/visual", "main", "1.1.0", "new visual"),
    artifact("@hamiltonian/release", "service", "1.1.0", "new service"),
  ])
  const stale = await artifact("@internal/stale", "main", "0.1.0", "stale")
  const storage = new MemoryCacheStorage()

  for (const value of previousArtifacts) {
    await (await storage.open(browserPackageCache(value.identity.name)!))
      .put(exactUrl(value.identity), value.response)
  }

  const staleHeaders = new Headers(stale.response.headers)
  await (await storage.open("internal")).put(
    exactUrl(stale.identity),
    new Response("damaged stale", {headers: staleHeaders}),
  )
  await (await storage.open("release")).put(
    exactUrl(nextArtifacts[1]!.identity),
    nextArtifacts[1]!.response,
  )
  await (await storage.open("release")).put(`${origin}/unexpected`, new Response("unexpected"))

  storage.resetMutations()
  const network = new Map(nextArtifacts.map((value) => [
    exactUrl(value.identity),
    value.response,
  ]))

  return {
    delta: releaseDelta(
      nextArtifacts.map(({identity}) => identity),
      previousArtifacts.map(({identity}) => identity),
    ),
    network,
    next: nextArtifacts.map(({identity}) => identity),
    previous: previousArtifacts.map(({identity}) => identity),
    storage,
  }
}

async function runUpdate(state: Awaited<ReturnType<typeof fixture>>) {
  let error: unknown = null
  await captureDiagnostics(async () => {
    await withServiceWorkerGlobals(state.storage, state.network, async () => {
      try {
        await updateRelease(loader, state.delta)
      } catch (caught) {
        error = caught
      }
    })
  })
  return {error, mutations: [...state.storage.mutations], storage: state.storage}
}

async function expectNewComposition(
  storage: MemoryCacheStorage,
  expected: BrowserPackageIdentity[],
) {
  const snapshot = await packageUrls(storage)
  expect([...snapshot].sort()).toEqual(expected.map(exactUrl).sort())
  expect(await storage.keys()).not.toContain("transaction")
}

async function packageUrls(storage: MemoryCacheStorage) {
  const urls = new Set<string>()
  for (const owner of ["release", "internal", "metafor"]) {
    if (!(await storage.keys()).includes(owner)) continue
    for (const request of await (await storage.open(owner)).keys()) urls.add(request.url)
  }
  return urls
}

async function artifact(
  name: string,
  env: BrowserPackageEnvironment,
  version: string,
  source: string,
) {
  const bytes = new TextEncoder().encode(source)
  const identity = {name, env, version, ...await artifactIntegrity(bytes.buffer as ArrayBuffer)}
  return {
    identity,
    response: new Response(bytes, {
      headers: {
        "Content-Type": "text/javascript",
        ...packageIdentityHeaders(identity),
      },
    }),
  }
}

function exactUrl(entry: Pick<BrowserPackageIdentity, "name" | "env" | "version">) {
  return `${origin}${browserPackageUrl(entry.name, entry.env, entry.version)}`
}

async function withServiceWorkerGlobals<T>(
  storage: MemoryCacheStorage,
  network: Map<string, Response>,
  run: () => Promise<T>,
) {
  const descriptors = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of [
    ["caches", storage],
    ["fetch", async (request: Request | string | URL) => {
      const response = network.get(requestUrl(request))
      return response?.clone() ?? new Response(null, {status: 404})
    }],
    ["location", new URL(origin)],
  ] as const) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {configurable: true, value, writable: true})
  }

  try {
    return await run()
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete (globalThis as Record<string, unknown>)[name]
    }
  }
}

type Mutation = {
  cache: string
  kind: "open-cache" | "put" | "delete" | "delete-cache"
  url?: string
}

class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>()
  readonly mutations: Mutation[] = []
  failAfter: number | null = null
  #mutationCount = 0

  async open(name: string) {
    let cache = this.caches.get(name)
    if (!cache) {
      cache = new MemoryCache(name, this)
      this.caches.set(name, cache)
      this.mutate({cache: name, kind: "open-cache"})
    }
    return cache
  }

  async keys() {
    return [...this.caches.keys()]
  }

  async delete(name: string) {
    const deleted = this.caches.delete(name)
    if (deleted) this.mutate({cache: name, kind: "delete-cache"})
    return deleted
  }

  mutate(mutation: Mutation) {
    this.mutations.push(mutation)
    this.#mutationCount += 1
    if (this.failAfter === this.#mutationCount)
      throw new Error(`Injected stop after mutation ${this.#mutationCount}`)
  }

  resetMutations() {
    this.mutations.length = 0
    this.#mutationCount = 0
  }
}

class MemoryCache {
  readonly entries = new Map<string, Response>()

  constructor(
    readonly name: string,
    readonly storage: MemoryCacheStorage,
  ) {}

  async match(request: Request | string | URL) {
    return this.entries.get(requestUrl(request))?.clone()
  }

  async put(request: Request | string | URL, response: Response) {
    const url = requestUrl(request)
    this.entries.set(url, response.clone())
    this.storage.mutate({cache: this.name, kind: "put", url})
  }

  async delete(request: Request | string | URL) {
    const url = requestUrl(request)
    const deleted = this.entries.delete(url)
    if (deleted) this.storage.mutate({cache: this.name, kind: "delete", url})
    return deleted
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url))
  }
}

function inertRuntime(lifecycle: string[]) {
  return {
    async start() { lifecycle.push("start") },
    async fetch() { return new Response(null, {status: 503}) },
    async message() {},
    async destroy() { lifecycle.push("destroy") },
  }
}

function requestUrl(request: Request | string | URL) {
  if (request instanceof Request) return request.url
  return new URL(String(request), origin).href
}
