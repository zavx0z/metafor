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
 * @param bindings
 * @returns Результат выполнения сохранённого source.
 */
export async function importModule(
  startup: typeof Startup,
  module: Module,
  bindings: Readonly<Record<string, unknown>> = {},
) {
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
    return startup.run(await response.text(), bindings)
  } catch (error) {
    await startup.remove(module.cache, request)
    throw error
  }
}

/** Загружает и заменяет выбранные cache entries как одну update-группу. */
export async function updateModules(startup: typeof Startup, modules: Module[]) {
  const targets = modules.map((module) => ({
    module,
    request: new Request(new URL(module.endpoint, location.origin)),
  }))
  console.debug("[@import/service/loader:update]", "подготовка обновления началась", {
    artifacts: targets.map(({module, request}) => ({
      cache: module.cache,
      source: request.url,
    })),
  })

  const updates = await Promise.all(targets.map(async ({module, request}) => {
    console.debug("[@import/service/loader:update]", "загрузка новой сборки началась", {
      cache: module.cache,
      source: request.url,
    })
    const [previous, response] = await Promise.all([
      startup.read(module.cache, request),
      fetch(request).then(startup.verify),
    ])
    console.debug("[@import/service/loader:update]", "новая сборка загружена", {
      cache: module.cache,
      previous: previous !== undefined,
      source: request.url,
      status: response.status,
    })
    return {module, request, previous, response}
  }))
  console.debug("[@import/service/loader:update]", "все новые сборки загружены", {
    artifacts: updates.length,
  })

  const applied: typeof updates = []
  try {
    for (const update of updates) {
      console.debug("[@import/service/loader:update]", "замена записи кэша началась", {
        cache: update.module.cache,
        source: update.request.url,
      })
      await startup.cache(update.module.cache, update.request, update.response)
      applied.push(update)
      console.debug("[@import/service/loader:update]", "запись кэша заменена", {
        cache: update.module.cache,
        source: update.request.url,
      })
    }
    console.debug("[@import/service/loader:update]", "все записи кэша заменены", {
      artifacts: applied.length,
    })
  } catch (error) {
    console.debug("[@import/service/loader:update]", "замена кэша завершилась с ошибкой, начинаем откат", {
      artifacts: applied.map((update) => ({
        cache: update.module.cache,
        source: update.request.url,
      })),
    }, error)
    const rollback = await Promise.allSettled(applied.map((update) => update.previous
      ? startup.cache(update.module.cache, update.request, update.previous)
      : startup.remove(update.module.cache, update.request)))
    console.debug("[@import/service/loader:update]", "откат кэша завершён", {
      failed: rollback.filter((result) => result.status === "rejected").length,
      restored: rollback.length,
    })
    throw error
  }
}
