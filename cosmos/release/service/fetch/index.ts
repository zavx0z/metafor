import {browserPackageCache} from "../../../shared/package/url"
import {parseBrowserPackageArtifactUrl} from "../../shared/artifact-url"
import type {ReleaseLoader} from "../runtime"
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
export function createReleaseCache(loader: Readonly<ReleaseLoader>) {
  /** Возвращает cached response либо network fallback для browser request. */
  const cacheFirst = async (request: Request) => {
    const url = new URL(request.url)
    if (url.origin !== location.origin) return await fetch(request)
    const browserArtifact = parseBrowserPackageArtifactUrl(url)
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
    if (response) return response

    try {
      const networkRequest = browserArtifact?.artifact !== undefined && owner !== null
        ? await releaseArtifactNetworkRequest(owner, browserArtifact, request)
        : request
      const network = await fetch(networkRequest)
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
      if (await cache.match(request, {ignoreVary: true})) return
      const response = await fetch(request)
      if (!response.ok) throw new Error(`Startup ${request.url} returned ${response.status}`)
      await cache.put(request, response)
    }))
    await Promise.all(retiredRuntimeAssets.map((resource) => cache.delete(resource, {ignoreVary: true})))
  }

  return Object.freeze({cacheFirst, cacheStartup})
}
