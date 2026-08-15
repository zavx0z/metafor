/** Описание одного module, выбранное обновляемым importer. */
export interface Module {
  /** Стабильный HTTP endpoint module. */
  endpoint: string

  /** Cache Storage, принадлежащий module. */
  cache: string
}

const modules = new Map<string, string>()

/** Возвращает cache, ранее переданный importer для точного request. */
export function moduleCacheName(request: Request) {
  return modules.get(request.url) ?? null
}

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
 * @param module - Endpoint и cache, выбранные обновляемым importer.
 * @returns Результат выполнения сохранённого source.
 */
export async function importModule(module: Module) {
  const request = new Request(new URL(module.endpoint, location.origin))
  modules.set(request.url, module.cache)

  try {
    let response = await read(module.cache, request)

    if (!response) {
      response = verify(await fetch(request))
      await cache(module.cache, request, response)
      response = await read(module.cache, request)
    }

    if (!response) throw new Error(`Cached module ${request.url} is missing`)

    verify(response)
    return run(await response.text())
  } catch (error) {
    await remove(module.cache, request)
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
