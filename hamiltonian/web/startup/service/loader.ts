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
 * Выполняет source с явно переданными именованными значениями.
 *
 * Startup и importer используют эту границу для сохранённых IIFE и CommonJS
 * module bodies, которым нельзя сделать dynamic import внутри Service Worker.
 */
export function run(source: string, bindings: Readonly<Record<string, unknown>> = {}) {
  const entries = Object.entries(bindings)
  return Function(...entries.map(([name]) => name), source)(...entries.map(([, value]) => value))
}
