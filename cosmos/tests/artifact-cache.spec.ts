import {expect, test} from "bun:test"
import {artifactIntegrity} from "../shared/package/integrity"
import {
  packageArtifactIdentityHeaders,
  type BrowserPackageArtifactIdentity,
} from "../release/shared/artifact-integrity"
import {
  browserPackageArtifactUrl,
  parseBrowserPackageArtifactUrl,
} from "../release/shared/artifact-url"
import {
  cacheReleaseArtifact,
  readReleaseArtifact,
  releaseArtifactNetworkRequest,
} from "../release/service/cache/artifact"
import {createReleaseCache} from "../release/service/fetch"

const origin = "https://artifact-cache.test"

test.serial("stable public artifact follows the first active root during overlap", async () => {
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  const oldRoot = await artifact(undefined, "1.0.0", "old root")
  const nextRoot = await artifact(undefined, "1.1.0", "next root")
  const oldTheme = await artifact("./theme.css", "1.0.0", "old theme")
  const nextTheme = await artifact("./theme.css", "1.1.0", "next theme")
  await internal.put(exactUrl(oldRoot.identity), oldRoot.response)
  await internal.put(exactUrl(nextRoot.identity), nextRoot.response)
  await internal.put(exactUrl(oldTheme.identity), oldTheme.response)
  await internal.put(exactUrl(nextTheme.identity), nextTheme.response)

  const stableRequest = new Request(`${origin}${browserPackageArtifactUrl(
    "@internal/visual",
    "main",
    "./theme.css",
  )}`)
  const stable = parseBrowserPackageArtifactUrl(new URL(stableRequest.url))
  if (!stable) throw new Error("Stable theme URL did not parse")

  await withServiceGlobals(storage, async () => {
    expect(await (await readReleaseArtifact("internal", stable))?.text()).toBe("old theme")
    await internal.delete(exactUrl(oldTheme.identity))
    expect(await readReleaseArtifact("internal", stable)).toBeUndefined()
    expect((await releaseArtifactNetworkRequest("internal", stable, stableRequest)).url)
      .toBe(exactUrl(oldTheme.identity))
  })
})

test.serial("stable network miss is pinned to the active root instead of target stable state", async () => {
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  const oldRoot = await artifact(undefined, "1.0.0", "old root")
  const nextRoot = await artifact(undefined, "1.1.0", "next root")
  const oldTheme = await artifact("./theme.css", "1.0.0", "old theme")
  await internal.put(exactUrl(oldRoot.identity), oldRoot.response)
  await internal.put(exactUrl(nextRoot.identity), nextRoot.response)
  const fetched: string[] = []

  await withServiceGlobals(storage, async (request) => {
    fetched.push(request.url)
    return request.url === exactUrl(oldTheme.identity)
      ? oldTheme.response.clone()
      : new Response(null, {status: 404})
  }, async () => {
    const cache = createReleaseCache(unusedLoader())
    const stable = new Request(`${origin}${browserPackageArtifactUrl(
      "@internal/visual",
      "main",
      "./theme.css",
    )}`)
    expect(await (await cache.cacheFirst(stable)).text()).toBe("old theme")
    expect(fetched).toEqual([exactUrl(oldTheme.identity)])
    expect(await internal.match(exactUrl(oldTheme.identity))).toBeInstanceOf(Response)
  })
})

test.serial("predecessor response is served but never reinserted after the root flips", async () => {
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  const oldRoot = await artifact(undefined, "1.0.0", "old root")
  const nextRoot = await artifact(undefined, "1.1.0", "next root")
  const oldLazy = await artifact("./.cosmos/entry/old.js", "1.0.0", "old lazy")
  await internal.put(exactUrl(nextRoot.identity), nextRoot.response)

  await withServiceGlobals(storage, async () => {
    const requested = parseBrowserPackageArtifactUrl(new URL(exactUrl(oldLazy.identity)))
    if (!requested) throw new Error("Old lazy URL did not parse")
    await cacheReleaseArtifact("internal", requested, oldLazy.response.clone())
    expect(await internal.match(exactUrl(oldLazy.identity))).toBeUndefined()

    internal.entries.clear()
    await internal.put(exactUrl(oldRoot.identity), oldRoot.response)
    internal.afterPut = async (url) => {
      if (url !== exactUrl(oldLazy.identity)) return
      internal.entries.delete(exactUrl(oldRoot.identity))
      internal.entries.set(exactUrl(nextRoot.identity), nextRoot.response.clone())
    }
    await cacheReleaseArtifact("internal", requested, oldLazy.response.clone())
    expect(await internal.match(exactUrl(oldLazy.identity))).toBeUndefined()
  })
})

test.serial("corrupt target-version artifact is evicted before network repair", async () => {
  const storage = new MemoryCacheStorage()
  const internal = await storage.open("internal")
  const root = await artifact(undefined, "1.1.0", "target root")
  const lazy = await artifact("./.cosmos/entry/lazy.js", "1.1.0", "valid lazy")
  await internal.put(exactUrl(root.identity), root.response)
  await internal.put(exactUrl(lazy.identity), new Response("corrupt", {
    headers: lazy.response.headers,
  }))
  const requested = parseBrowserPackageArtifactUrl(new URL(exactUrl(lazy.identity)))
  if (!requested) throw new Error("Lazy URL did not parse")

  await withServiceGlobals(storage, async () => {
    expect(await readReleaseArtifact("internal", requested)).toBeUndefined()
    expect(await internal.match(exactUrl(lazy.identity))).toBeUndefined()
  })
})

test.serial("cross-origin package-shaped requests bypass every local cache", async () => {
  const storage = new MemoryCacheStorage()
  const fetched: string[] = []
  await withServiceGlobals(storage, async (request) => {
    fetched.push(request.url)
    return new Response("remote")
  }, async () => {
    const cache = createReleaseCache(unusedLoader())
    const request = new Request(
      "https://other.test/@internal/visual/theme.css?env=main&version=1.0.0",
    )
    expect(await (await cache.cacheFirst(request)).text()).toBe("remote")
  })
  expect(fetched).toEqual([
    "https://other.test/@internal/visual/theme.css?env=main&version=1.0.0",
  ])
  expect(storage.opens).toBe(0)
})

async function artifact(
  key: BrowserPackageArtifactIdentity["artifact"],
  version: string,
  source: string,
) {
  const bytes = new TextEncoder().encode(source)
  const identity: BrowserPackageArtifactIdentity = {
    name: "@internal/visual",
    env: "main",
    ...(key === undefined ? {} : {artifact: key}),
    version,
    ...await artifactIntegrity(bytes.buffer as ArrayBuffer),
  }
  return {
    identity,
    response: new Response(bytes, {headers: packageArtifactIdentityHeaders(identity)}),
  }
}

function exactUrl(identity: BrowserPackageArtifactIdentity) {
  return `${origin}${browserPackageArtifactUrl(
    identity.name,
    identity.env,
    identity.artifact ?? ".",
    identity.version,
  )}`
}

function unusedLoader() {
  return {
    verify(response: Response) { return response },
    async cache() { throw new Error("Root cache must not be used") },
    async read() { throw new Error("Root cache must not be used") },
    run() {},
  }
}

async function withServiceGlobals<T>(
  storage: MemoryCacheStorage,
  run: () => Promise<T>,
): Promise<T>
async function withServiceGlobals<T>(
  storage: MemoryCacheStorage,
  fetcher: (request: Request) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T>
async function withServiceGlobals<T>(
  storage: MemoryCacheStorage,
  fetcherOrRun: (() => Promise<T>) | ((request: Request) => Promise<Response>),
  maybeRun?: () => Promise<T>,
) {
  const fetcher = maybeRun === undefined
    ? async (_request: Request) => new Response(null, {status: 404})
    : fetcherOrRun as (request: Request) => Promise<Response>
  const run = maybeRun ?? fetcherOrRun as () => Promise<T>
  const descriptors = new Map<string, PropertyDescriptor | undefined>()
  for (const [name, value] of [
    ["caches", storage],
    ["fetch", async (request: Request | string | URL) =>
      await fetcher(request instanceof Request ? request : new Request(request))],
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

class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>()
  opens = 0

  async open(name: string) {
    this.opens += 1
    let cache = this.caches.get(name)
    if (!cache) {
      cache = new MemoryCache()
      this.caches.set(name, cache)
    }
    return cache
  }

  async keys() { return [...this.caches.keys()] }
  async delete(name: string) { return this.caches.delete(name) }
}

class MemoryCache {
  readonly entries = new Map<string, Response>()
  afterPut: ((url: string) => Promise<void>) | null = null

  async match(request: Request | string | URL) {
    return this.entries.get(requestUrl(request))?.clone()
  }

  async put(request: Request | string | URL, response: Response) {
    const url = requestUrl(request)
    this.entries.set(url, response.clone())
    await this.afterPut?.(url)
  }

  async delete(request: Request | string | URL) {
    return this.entries.delete(requestUrl(request))
  }

  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url))
  }
}

function requestUrl(request: Request | string | URL) {
  return request instanceof Request ? request.url : new URL(String(request), origin).href
}
