const startup = [
  "/",
  "/import.js",
  "/manifest.webmanifest",
]

/**
 * Для navigation request возвращает единственный сохранённый HTML `/`, поэтому
 * вложенный SPA-адрес не создаёт отдельную cache-запись. Для остальных
 * requests возвращает response точного URL и обращается к network только при
 * cache miss. Успешный network fallback для `/main.js` и `/assets/*`
 * сохраняется после первого реального запроса браузера; остальные endpoints
 * добавляет только {@link cacheStartup}.
 *
 * `Vary` игнорируется, потому что loader хранит одну неизменяемую репрезентацию
 * каждого startup endpoint.
 *
 * @param request - GET request, перехваченный Service Worker.
 * @returns Response из постоянного cache либо результат network fallback.
 */
export async function cacheFirst(request: Request) {
  const cache = await caches.open("metafor")
  const response = await cache.match(request.mode === "navigate" ? "/" : request, {ignoreVary: true})
  if (response) return response

  const network = await fetch(request)
  const pathname = new URL(request.url).pathname
  if (network.ok && (pathname === "/main.js" || pathname.startsWith("/assets/"))) {
    await cache.put(request, network.clone())
  }
  return network
}

/**
 * Один раз сохраняет отсутствующие startup endpoints в постоянный cache.
 * В startup входят только HTML, importer и Web App Manifest. Иконки и
 * screenshots не загружаются заранее: только фактически запрошенные browser
 * assets позднее сохраняет {@link cacheFirst}.
 *
 * Уже сохранённые bytes не перечитываются и не заменяются. Недостающие
 * endpoints загружаются параллельно; ошибка не откатывает записи, завершённые
 * до неё.
 *
 * @throws Если network request завершился ошибкой или endpoint вернул
 * unsuccessful status.
 */
export async function cacheStartup() {
  const cache = await caches.open("metafor")
  await Promise.all(startup.map((resource) => cacheResource(cache, resource)))
}

/**
 * Сохраняет первый successful network response endpoint, если его ещё нет в
 * постоянном cache.
 */
async function cacheResource(cache: Cache, resource: string) {
  const request = new Request(resource)
  const cached = await cache.match(request, {ignoreVary: true})
  if (cached) return

  const response = await fetch(request)
  if (!response.ok) throw new Error(`Startup ${request.url} returned ${response.status}`)
  await cache.put(request, response)
}
