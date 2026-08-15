import type * as Startup from "../../startup/service/loader"

/** Описание одного Service Worker module, выбранного importer. */
export interface Module {
  /** Стабильный HTTP endpoint module. */
  endpoint: string

  /** Cache Storage, принадлежащий module. */
  cache: string
}

/**
 * Загружает и запускает один Service Worker module.
 *
 * Importer владеет endpoint, cache и полной композицией переданных startup
 * primitives. Ошибка удаляет только entry выбранного module и допускает retry.
 *
 * @param startup - Минимальные primitives, переданные startup service.
 * @param module - Endpoint и cache, выбранные importer.
 * @returns Результат выполнения сохранённого source.
 */
export async function importModule(startup: typeof Startup, module: Module) {
  const request = new Request(new URL(module.endpoint, location.origin))

  try {
    let response = await startup.read(module.cache, request)

    if (!response) {
      response = startup.verify(await fetch(request))
      await startup.cache(module.cache, request, response)
      response = await startup.read(module.cache, request)
    }

    if (!response) throw new Error(`Cached module ${request.url} is missing`)

    startup.verify(response)
    return startup.run(await response.text())
  } catch (error) {
    await startup.remove(module.cache, request)
    throw error
  }
}
