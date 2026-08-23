import {browserPackageCache, parseBrowserPackageUrl} from "../../../shared/package/url"
import type {ReleaseLoader} from "../runtime"

const startupResources = [
  "/",
  "/@cosmos/startup?env=main",
  "/manifest.webmanifest",
]

const runtimeAssets = new Set([
  "/assets/fonts/JetBrainsMono-Bold.ttf",
])

/** Создаёт принадлежащую release browser cache policy поверх startup primitives. */
export function createReleaseCache(loader: Readonly<ReleaseLoader>) {
  /** Возвращает cached response либо network fallback для browser request. */
  const cacheFirst = async (request: Request) => {
    const url = new URL(request.url)
    const browserPackage = parseBrowserPackageUrl(url)
    const packageOwner = browserPackageCache(browserPackage?.name ?? null)
    const owner = packageOwner === "startup" ? null : packageOwner
    const cacheName = owner ?? "startup"
    const cache = await caches.open(cacheName)
    const response = request.mode === "navigate"
      ? await cache.match("/", {ignoreVary: true})
      : await loader.read(cacheName, request)
    if (response) return response

    try {
      const network = await fetch(request)
      if (network.ok && (owner !== null || runtimeAssets.has(url.pathname)))
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
  }

  return Object.freeze({cacheFirst, cacheStartup})
}
