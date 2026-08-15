const serviceImporterRequest = new Request(new URL("/import-service.js", location.origin))

let serviceImporter: Promise<void> | null = null

/**
 * Загружает и один раз за инкарнацию запускает Service Worker importer.
 *
 * Одновременные события используют один Promise. После ошибки ссылка
 * освобождается, поэтому следующее событие может повторить полную загрузку.
 */
export async function loadServiceImporter() {
  serviceImporter ??= load()

  try {
    await serviceImporter
  } catch (error) {
    serviceImporter = null
    throw error
  }
}

/** Получает importer, сохраняет его bytes и выполняет source из cache. */
async function load() {
  const cache = await caches.open("import")
  let response = await cache.match(serviceImporterRequest, {ignoreVary: true})

  if (!response) {
    response = await fetch(serviceImporterRequest)
    if (!response.ok) throw new Error(`Service importer returned ${response.status}`)
    await cache.put(serviceImporterRequest, response)
    response = await cache.match(serviceImporterRequest, {ignoreVary: true})
  }

  if (!response) throw new Error("Cached Service Worker importer is missing")

  try {
    const source = await response.text()
    Function(source)()
  } catch (error) {
    await cache.delete(serviceImporterRequest)
    throw error
  }
}
