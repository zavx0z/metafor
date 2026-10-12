import {browserPackageCache} from "../../../shared/package/cache"
import {parseBrowserPackageArtifactUrl} from "@metafor/tech-build/identity"
import type {ReleaseLoader} from "../runtime"
import {observeSafely, type ReleaseObservation} from "../observation"
import {
  cacheReleaseArtifact,
  readReleaseArtifact,
  releaseArtifactNetworkRequest,
} from "../cache/artifact"

const startupResources = [
  "/",
  "/@cosmos/startup?env=main",
  "/manifest.webmanifest",
]

const runtimeAssets = new Set([
  "/assets/fonts/jetbrains-mono-bold.ttf",
])

const retiredRuntimeAssets = [
  "/assets/fonts/JetBrainsMono-Bold.ttf",
]

/** Создаёт принадлежащую release browser cache policy поверх startup primitives. */
export function createReleaseCache(
  loader: Readonly<ReleaseLoader>,
  observation?: Pick<ReleaseObservation, "cacheHit" | "network" | "response">,
) {
  const networkFetch = async (request: Request) => {
    const operation = observeSafely(() => observation?.network(request.url))
    try {
      const response = await fetch(request)
      if (operation !== undefined) observeSafely(() => observation?.response(operation, response.status))
      return response
    } catch (error) {
      if (operation !== undefined) observeSafely(() => observation?.response(operation))
      throw error
    }
  }
  /** Возвращает cached response либо network fallback для browser request. */
  const cacheFirst = async (request: Request) => {
    const url = new URL(request.url)
    if (url.origin !== location.origin) return await networkFetch(request)
    const browserArtifact = parseBrowserPackageArtifactUrl(url)
    if (url.searchParams.has("source-map") || browserArtifact?.artifact?.endsWith(".js.map"))
      return await networkFetch(request)
    const packageOwner = browserPackageCache(browserArtifact?.name ?? null)
    const owner = packageOwner === "startup" ? null : packageOwner
    const cacheName = owner ?? "startup"
    const cache = await caches.open(cacheName)
    const response = request.mode === "navigate"
      ? await cache.match("/", {ignoreVary: true})
      : browserArtifact?.artifact === undefined
        ? await loader.read(cacheName, request)
        : owner === null
          ? undefined
          : await readReleaseArtifact(owner, browserArtifact)
    if (response) {
      observeSafely(() => observation?.cacheHit(request.url, response.status))
      return response
    }

    try {
      const networkRequest = browserArtifact?.artifact !== undefined && owner !== null
        ? await releaseArtifactNetworkRequest(owner, browserArtifact, request)
        : request
      const network = await networkFetch(networkRequest)
      if (network.ok && browserArtifact?.artifact !== undefined && owner !== null)
        await cacheReleaseArtifact(owner, browserArtifact, network.clone())
      else if (network.ok && (owner !== null || runtimeAssets.has(url.pathname)))
        await loader.cache(cacheName, request, network.clone())
      return network
    } catch (error) {
      if (!url.pathname.startsWith("/assets/")) throw error
      return new Response(null, {status: 503})
    }
  }

  /** Сохраняет отсутствующие неизменяемые startup resources. */
  const cacheStartup = async () => {
    const cache = await caches.open("startup")
    await Promise.all(startupResources.map(async (resource) => {
      const request = new Request(resource)
      const cached = await cache.match(request, {ignoreVary: true})
      if (cached) {
        observeSafely(() => observation?.cacheHit(request.url, cached.status))
        return
      }
      const response = await networkFetch(request)
      if (!response.ok) throw new Error(`Startup ${request.url} returned ${response.status}`)
      await cache.put(request, response)
    }))
    await Promise.all(retiredRuntimeAssets.map((resource) => cache.delete(resource, {ignoreVary: true})))
  }

  return Object.freeze({cacheFirst, cacheStartup})
}
