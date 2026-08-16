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

/** Подготавливает package group и открывает её loader одним active-state write. */
export async function updateModules(
  startup: typeof Startup,
  packages: Startup.UpdatePackage[],
) {
  await startup.discardInterruptedUpdate()
  const targets = (await Promise.all(packages.map(async (entry) => {
    const stable = new Request(new URL(`/code?module=${entry.name}`, location.origin))
    const current = await startup.read(entry.cache, stable)
    if (
      current?.headers.get("X-Package-Name") === entry.name
      && current.headers.get("X-Package-Version") === entry.version
    ) return null
    return {
      entry,
      stable,
      request: new Request(new URL(entry.endpoint, location.origin), {cache: "no-store"}),
    }
  }))).filter((target) => target !== null)

  if (targets.length === 0) return await startup.pendingRestart()

  const transaction = crypto.randomUUID()
  const storages = new Map<string, string>()
  for (const {entry} of targets) {
    if (!storages.has(entry.cache))
      storages.set(entry.cache, `${entry.cache}:update:${transaction}`)
  }

  console.debug("[@import/service/loader:update]", "подготовка обновления началась", {
    artifacts: targets.map(({entry, request}) => ({
      cache: entry.cache,
      name: entry.name,
      source: request.url,
      version: entry.version,
    })),
  })

  await startup.rememberUpdate({
    packages: targets.map(({entry}) => entry),
    storages: [...storages.values()],
  })

  const groups = new Map<string, Request[]>()
  for (const {entry, request} of targets) {
    const storage = storages.get(entry.cache)!
    const requests = groups.get(storage) ?? []
    requests.push(request)
    groups.set(storage, requests)
  }

  try {
    await Promise.all([...groups].map(async ([storage, requests]) => {
      console.debug("[@import/service/loader:update]", "загрузка группы во временный кэш началась", {
        artifacts: requests.length,
        storage,
      })
      await (await caches.open(storage)).addAll(requests)
      console.debug("[@import/service/loader:update]", "группа загружена во временный кэш", {
        artifacts: requests.length,
        storage,
      })
    }))

    const active = await Promise.all(targets.map(async ({entry, request}) => {
      const storage = storages.get(entry.cache)!
      const response = await (await caches.open(storage)).match(request)
      if (!response) throw new Error(`Сборка ${entry.name}@${entry.version} отсутствует в кэше`)
      startup.verify(response)
      if (response.headers.get("X-Package-Name") !== entry.name)
        throw new Error(`Ответ обновления принадлежит другому пакету: ${entry.name}`)
      if (response.headers.get("X-Package-Version") !== entry.version)
        throw new Error(`Ответ обновления имеет другую версию: ${entry.name}@${entry.version}`)
      return {...entry, storage}
    }))

    await startup.activateUpdate(active)
    await startup.forgetUpdate()
    await startup.discardInactiveUpdates()
    console.debug("[@import/service/loader:update]", "вся группа открыта в активном кэше", {
      artifacts: active.map(({name, version}) => ({name, version})),
    })
    return active.map(({name}) => name)
  } catch (error) {
    await Promise.all([...storages.values()].map((storage) => caches.delete(storage)))
    await startup.forgetUpdate()
    console.debug("[@import/service/loader:update]", "подготовка кэша завершилась с ошибкой", {
      artifacts: targets.map(({entry}) => ({name: entry.name, version: entry.version})),
    }, error)
    throw error
  }
}
