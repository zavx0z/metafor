import {moduleCacheName} from "./loader"

const startup = [
  "/",
  "/startup-main.js",
  "/manifest.webmanifest",
]

/**
 * Startup service для navigation request возвращает сохранённый HTML `/`, поэтому
 * вложенный SPA-адрес не создаёт отдельную cache-запись. Для остальных
 * requests возвращает response точного URL и обращается к network только при
 * cache miss. `/import/*` обслуживается через cache `import`.
 * Module endpoints обслуживаются через cache, ранее переданный importer.
 * Остальные requests проходят через cache `startup`.
 * Успешный network fallback для `/import/*`, module endpoints и
 * `/assets/*` сохраняется после первого реального запроса браузера; остальные
 * startup endpoints добавляет только {@link cacheStartup}.
 *
 * `Vary` игнорируется, потому что loader хранит одну неизменяемую репрезентацию
 * каждого startup endpoint.
 *
 * @param request - GET request, перехваченный Service Worker.
 * @returns Response из постоянного cache, результат network fallback либо
 * пустой `503` для недоступного asset.
 */
export async function cacheFirst(request: Request) {
  const pathname = new URL(request.url).pathname
  const importModule = pathname.startsWith("/import/")
  const moduleCache = moduleCacheName(request)
  const cache = await caches.open(
    importModule ? "import" : moduleCache ?? "startup",
  )
  const response = await cache.match(request.mode === "navigate" ? "/" : request, {ignoreVary: true})
  if (response) return response

  try {
    const network = await fetch(request)
    if (
      network.ok
      && (importModule || moduleCache || pathname.startsWith("/assets/"))
    ) {
      await cache.put(request, network.clone())
    }
    return network
  } catch (error) {
    if (!pathname.startsWith("/assets/")) throw error
    return new Response(null, {status: 503})
  }
}

/**
 * Один раз сохраняет отсутствующие startup endpoints в постоянный cache.
 * В startup входят только HTML, startup main и Web App Manifest. Иконки и
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
  const cache = await caches.open("startup")
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
