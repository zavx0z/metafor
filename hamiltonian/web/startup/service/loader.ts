import {moduleCacheName} from "./storage"

/** Проверяет, что полученный HTTP response можно использовать дальше. */
export function verify(response: Response) {
  if (!response.ok) throw new Error(`${response.url || "Resource"} returned ${response.status}`)
  return response
}

/** Сохраняет response для точного request в выбранном Cache Storage. */
export async function cache(name: string, request: Request, response: Response) {
  await (await caches.open(name)).put(request, response)
}

/** Читает response точного request из выбранного Cache Storage. */
export async function read(name: string, request: Request) {
  return (await caches.open(name)).match(request, {ignoreVary: true})
}

/** Удаляет response точного request из выбранного Cache Storage. */
export async function remove(name: string, request: Request) {
  return (await caches.open(name)).delete(request, {ignoreVary: true})
}

/**
 * Загружает и запускает один Service Worker module.
 *
 * Endpoint выбирает обновляемый importer. Loader владеет общей цепочкой
 * network, проверки, выбранного endpoint cache, повторного чтения и выполнения
 * source. Поэтому importer задаёт состав internal и Metafor modules, но не
 * повторяет механизм их доставки.
 * Ошибка удаляет только entry переданного module и допускает следующий retry.
 *
 * @param endpoint - Стабильный HTTP endpoint module.
 * @returns Результат выполнения сохранённого source.
 */
export async function importModule(endpoint: string) {
  const request = new Request(new URL(endpoint, location.origin))
  const cacheName = moduleCacheName(request)
  if (!cacheName) throw new Error(`Unsupported module endpoint ${request.url}`)

  try {
    let response = await read(cacheName, request)

    if (!response) {
      response = verify(await fetch(request))
      await cache(cacheName, request, response)
      response = await read(cacheName, request)
    }

    if (!response) throw new Error(`Cached module ${request.url} is missing`)

    verify(response)
    return run(await response.text())
  } catch (error) {
    await remove(cacheName, request)
    throw error
  }
}

/**
 * Выполняет source с явно переданными именованными значениями.
 *
 * Startup и importer используют эту границу для сохранённых IIFE и CommonJS
 * module bodies, которым нельзя сделать dynamic import внутри Service Worker.
 */
export function run(source: string, bindings: Readonly<Record<string, unknown>> = {}) {
  const entries = Object.entries(bindings)
  return Function(...entries.map(([name]) => name), source)(...entries.map(([, value]) => value))
}
