import {cache as cacheResponse, read} from "./loader"

const startup = [
  "/",
  "/code?module=@startup/main",
  "/manifest.webmanifest",
]

/**
 * Startup service для navigation request возвращает сохранённый HTML `/`, поэтому
 * вложенный SPA-адрес не создаёт отдельную cache-запись. Для остальных
 * requests возвращает response точного URL и обращается к network только при
 * cache miss. Для exact request использует cache его слоя. Успешный network
 * fallback сохраняется только для `@release/*`
 * code и `/assets/*`; остальные startup endpoints добавляет только
 * {@link cacheStartup}.
 *
 * `Vary` игнорируется, потому что loader хранит одну неизменяемую репрезентацию
 * каждого startup endpoint.
 *
 * @param request - GET request, перехваченный Service Worker.
 * @returns Response из постоянного cache, результат network fallback либо
 * пустой `503` для недоступного asset.
 */
export async function cacheFirst(request: Request) {
  const url = new URL(request.url)
  const release = url.pathname === "/code"
    && url.searchParams.get("module")?.startsWith("@release/") === true
  const cache = await caches.open(release ? "release" : "startup")
  const response = request.mode === "navigate"
    ? await cache.match("/", {ignoreVary: true})
    : await read(release ? "release" : "startup", request)
  if (response) return response

  try {
    const network = await fetch(request)
    if (network.ok && (release || url.pathname.startsWith("/assets/"))) {
      await cacheResponse(release ? "release" : "startup", request, network.clone())
    }
    return network
  } catch (error) {
    if (!url.pathname.startsWith("/assets/")) throw error
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
