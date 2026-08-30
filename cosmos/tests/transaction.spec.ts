import {expect, test} from "bun:test"
import type {BrowserPackageEnvironment} from "../shared/package/environment"
import {
  artifactIntegrity,
  packageIdentityHeaders,
  type BrowserPackageIdentity,
} from "../shared/package/integrity"
import {browserPackageCache, browserPackageUrl} from "../shared/package/url"
import {
  packageArtifactIdentityHeaders,
  type BrowserPackageArtifactIdentity,
} from "../release/shared/artifact-integrity"
import {browserPackageIdentityUrl} from "../release/shared/artifact-url"
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
        await updateRelease(loader, releaseDelta(interrupted.next, current), quietHandover)
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
      name === "@cosmos/release" && env === "service")!,
  ))
  expect(result.mutations.at(-1)).toEqual({cache: "transaction", kind: "delete-cache"})
})

test.serial("UPD-003 treats a stale update for an installed exact entry as a no-op", async () => {
  const installed = await artifact("@cosmos/release", "main", "1.0.0", "installed main")
  const storage = new MemoryCacheStorage()
  const release = await storage.open("release")
  await release.put(exactUrl(installed.identity), installed.response)
  storage.resetMutations()

  const network = new Map([[exactUrl(installed.identity), installed.response]])
  const {result: changed} = await captureDiagnostics(async () =>
    await withServiceWorkerGlobals(storage, network, async () =>
      await updateRelease(loader, {update: [installed.identity], remove: []}, quietHandover)))

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
        async restartBrowser() {
          lifecycle.push("restart")
          expect(await state.storage.keys()).toContain("transaction")
        },
      })
    })
  })

  const service = state.next.find(({name, env}) =>
    name === "@cosmos/release" && env === "service")!
  expect(lifecycle).toEqual([`prepare:${exactUrl(service)}`, "restart", "activate"])
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
    name === "@cosmos/release" && env === "service")!
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
        async restartBrowser() {},
      })
    })
  })

  const target = state.next.find(({name, env}) =>
    name === "@cosmos/release" && env === "service")!
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

test.serial("lazy artifacts of the predecessor survive until Window handover", async () => {
  const previousRoot = await artifact("@internal/visual", "main", "1.0.0", "old root")
  const nextRoot = await artifact("@internal/visual", "main", "1.1.0", "new root")
  const previousLazy = await nonRootArtifact(
    "./.cosmos/entry/old.js",
    "1.0.0",
    "old lazy",
  )
  const nextLazy = await nonRootArtifact(
    "./.cosmos/entry/new.js",
    "1.1.0",
    "new lazy",
  )
  const theme = await nonRootArtifact("./theme.css", "1.1.0", "new theme")
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  await internal.put(exactUrl(previousRoot.identity), previousRoot.response)
  await internal.put(exactUrl(previousLazy.identity), previousLazy.response)
  storage.resetMutations()

  const desired = [nextRoot.identity, theme.identity]
  const current = [previousRoot.identity, previousLazy.identity]
  const network = new Map([
    [exactUrl(nextRoot.identity), nextRoot.response],
    [exactUrl(theme.identity), theme.response],
  ])
  let handovers = 0

  await withServiceWorkerGlobals(storage, network, async () => {
    await updateRelease(loader, releaseDelta(desired, current), {
      async prepare() { throw new Error("Service runtime handover is not expected") },
      async activate() { throw new Error("Service runtime activation is not expected") },
      async restartBrowser() {
        handovers += 1
        expect(await internal.match(exactUrl(previousRoot.identity))).toBeUndefined()
        expect(await internal.match(exactUrl(previousLazy.identity))).toBeInstanceOf(Response)
        expect(await storage.keys()).toContain("transaction")
        await internal.put(exactUrl(nextLazy.identity), nextLazy.response)
      },
    })
  })

  expect(handovers).toBe(1)
  expect(await internal.match(exactUrl(previousLazy.identity))).toBeUndefined()
  expect(await internal.match(exactUrl(nextLazy.identity))).toBeInstanceOf(Response)
  expect(await storage.keys()).not.toContain("transaction")
})

test.serial("artifact delta fails closed without a matching package root", async () => {
  const orphan = await nonRootArtifact("./theme.css", "1.1.0", "orphan theme")
  const storage = new MemoryCacheStorage()
  const network = new Map([[exactUrl(orphan.identity), orphan.response]])

  await withServiceWorkerGlobals(storage, network, async () => {
    await expect(updateRelease(loader, {update: [orphan.identity], remove: []}))
      .rejects.toThrow("has no matching root")
  })
})

test.serial("marker recovery restarts Window while a clean empty delta remains inert", async () => {
  const storage = new MemoryCacheStorage()
  let restarts = 0
  let failRestart = false
  const handover = {
    async prepare() { throw new Error("Service runtime handover is not expected") },
    async activate() { throw new Error("Service runtime activation is not expected") },
    async restartBrowser() {
      restarts += 1
      if (failRestart) {
        failRestart = false
        throw new Error("injected Window handover failure")
      }
    },
  }

  await withServiceWorkerGlobals(storage, new Map(), async () => {
    expect(await updateRelease(loader, {update: [], remove: []}, handover)).toEqual([])
    expect(restarts).toBe(0)

    await (await storage.open("transaction"))
      .put(`${origin}/transaction`, new Response(null, {status: 204}))
    failRestart = true
    await expect(updateRelease(loader, {update: [], remove: []}, handover))
      .rejects.toThrow("injected Window handover failure")
    expect(await storage.keys()).toContain("transaction")
    expect(await updateRelease(loader, {update: [], remove: []}, handover))
      .toEqual(["transaction"])
  })

  expect(restarts).toBe(2)
  expect(await storage.keys()).not.toContain("transaction")
})

test.serial("corrupt target lazy is removed before Window restart and can be repaired", async () => {
  const visualRoot = await artifact("@internal/visual", "main", "1.1.0", "visual root")
  const validLazy = await nonRootArtifact(
    "./.cosmos/entry/current.js",
    "1.1.0",
    "valid current lazy",
  )
  const previous = await artifact("@internal/other", "main", "1.0.0", "old other")
  const next = await artifact("@internal/other", "main", "1.1.0", "new other")
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  await internal.put(exactUrl(visualRoot.identity), visualRoot.response)
  await internal.put(exactUrl(previous.identity), previous.response)
  await internal.put(exactUrl(validLazy.identity), new Response("corrupt", {
    headers: validLazy.response.headers,
  }))
  storage.resetMutations()
  const network = new Map([[exactUrl(next.identity), next.response]])
  let restarts = 0

  await withServiceWorkerGlobals(storage, network, async () => {
    const current = await currentReleasePackages()
    await updateRelease(loader, releaseDelta(
      [visualRoot.identity, next.identity],
      current,
    ), {
      async prepare() { throw new Error("Service runtime handover is not expected") },
      async activate() { throw new Error("Service runtime activation is not expected") },
      async restartBrowser() {
        restarts += 1
        expect(await internal.match(exactUrl(validLazy.identity))).toBeUndefined()
        await internal.put(exactUrl(validLazy.identity), validLazy.response)
      },
    })
  })

  expect(restarts).toBe(1)
  expect(await internal.match(exactUrl(validLazy.identity))).toBeInstanceOf(Response)
})

test.serial("UPD-003 startup uses Cache order and fails closed on a damaged first release", async () => {
  const storage = new MemoryCacheStorage()
  const previous = await artifact("@cosmos/release", "service", "1.0.0", "old release")
  const next = await artifact("@cosmos/release", "service", "1.1.0", "new release")
  const release = await storage.open("release")
  await release.put(exactUrl(previous.identity), previous.response)
  await release.put(exactUrl(next.identity), next.response)
  storage.resetMutations()

  await withServiceWorkerGlobals(storage, new Map(), async () => {
    const stable = new Request(`${origin}${browserPackageUrl("@cosmos/release", "service")}`)
    expect(await (await read("release", stable))?.text()).toBe("old release")

    const mismatched = new Request(`${origin}${browserPackageUrl(
      "@cosmos/release",
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

const quietHandover = {
  async prepare() { return inertRuntime([]) },
  async activate() {},
  async restartBrowser() {},
}

async function fixture() {
  const previousArtifacts = await Promise.all([
    artifact("@cosmos/release", "main", "1.0.0", "old main"),
    artifact("@internal/visual", "main", "1.0.0", "old visual"),
    artifact("@cosmos/release", "service", "1.0.0", "old service"),
  ])
  const nextArtifacts = await Promise.all([
    artifact("@cosmos/release", "main", "1.1.0", "new main"),
    artifact("@internal/visual", "main", "1.1.0", "new visual"),
    artifact("@cosmos/release", "service", "1.1.0", "new service"),
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
        await updateRelease(loader, state.delta, quietHandover)
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

async function nonRootArtifact(
  artifact: "./theme.css" | `./.cosmos/${string}`,
  version: string,
  source: string,
) {
  const bytes = new TextEncoder().encode(source)
  const identity: BrowserPackageArtifactIdentity = {
    name: "@internal/visual",
    env: "main",
    artifact,
    version,
    ...await artifactIntegrity(bytes.buffer as ArrayBuffer),
  }
  return {
    identity,
    response: new Response(bytes, {
      headers: {
        "Content-Type": artifact.endsWith(".css") ? "text/css" : "text/javascript",
        ...packageArtifactIdentityHeaders(identity),
      },
    }),
  }
}

function exactUrl(
  entry: Pick<BrowserPackageArtifactIdentity, "name" | "env" | "artifact" | "version">,
) {
  return `${origin}${browserPackageIdentityUrl(entry)}`
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
