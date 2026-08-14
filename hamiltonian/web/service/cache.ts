const bootstrap = [
  "/",
  "/import.js",
  "/manifest.webmanifest",
  "/assets/icons/favicon.ico",
  "/assets/icons/apple-touch-icon.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/icon-192-maskable.png",
  "/assets/icons/icon-512-maskable.png",
  "/assets/screenshots/screenshot-wide.png",
  "/assets/screenshots/screenshot-mobile.png",
]

/**
 * Возвращает сохранённый bootstrap response и обращается к network только при
 * отсутствии точного URL в cache. Network fallback намеренно не записывается:
 * состав постоянного bootstrap cache изменяет только {@link cacheBootstrap}.
 *
 * `Vary` игнорируется, потому что loader хранит одну неизменяемую репрезентацию
 * каждого bootstrap endpoint.
 *
 * @param request - GET request, перехваченный Service Worker.
 * @returns Response из постоянного cache либо результат network fallback.
 */
export async function cacheFirst(request: Request) {
  const response = await (await caches.open("metafor")).match(request, {ignoreVary: true})
  if (response) return response
  return await fetch(request)
}

/**
 * Один раз сохраняет отсутствующие bootstrap endpoints в постоянный cache.
 * Уже сохранённые bytes не перечитываются и не заменяются. Недостающие
 * endpoints загружаются параллельно; ошибка не откатывает записи, завершённые
 * до неё.
 *
 * @throws Если network request завершился ошибкой или endpoint вернул
 * unsuccessful status.
 */
export async function cacheBootstrap() {
  const cache = await caches.open("metafor")
  await Promise.all(bootstrap.map(async (resource) => {
    const request = new Request(resource)
    if (await cache.match(request, {ignoreVary: true})) return

    const response = await fetch(request)
    if (!response.ok) throw new Error(`Bootstrap ${request.url} returned ${response.status}`)
    await cache.put(request, response)
  }))
}
