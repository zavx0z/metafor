import type * as Startup from "../../startup/service/loader"
import {browserPackageUrl} from "../../package-url"
import {
  activateRelease,
  discardInactiveReleases,
  discardInterruptedRelease,
  forgetRelease,
  pendingRestart,
  rememberRelease,
  type ReleasePackage,
} from "./state"

/** Подготавливает package group и открывает её loader одним active-state write. */
export async function updateRelease(
  startup: typeof Startup,
  packages: ReleasePackage[],
) {
  await discardInterruptedRelease()
  await discardInactiveReleases()
  const targets = (await Promise.all(packages.map(async (entry) => {
    const stable = new Request(new URL(browserPackageUrl(entry.name), location.origin))
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

  if (targets.length === 0) return await pendingRestart()

  const transaction = crypto.randomUUID()
  const storages = new Map<string, string>()
  for (const {entry} of targets) {
    if (!storages.has(entry.cache))
      storages.set(entry.cache, `${entry.cache}:release:${transaction}`)
  }

  console.debug("[@release/service:prepare]", "подготовка обновления началась", {
    artifacts: targets.map(({entry, request}) => ({
      cache: entry.cache,
      name: entry.name,
      source: request.url,
      version: entry.version,
    })),
  })

  await rememberRelease({
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
      console.debug("[@release/service:prepare]", "загрузка группы во временный кэш началась", {
        artifacts: requests.length,
        storage,
      })
      await (await caches.open(storage)).addAll(requests)
      console.debug("[@release/service:prepare]", "группа загружена во временный кэш", {
        artifacts: requests.length,
        storage,
      })
    }))

    const prepared = await Promise.all(targets.map(async ({entry, request}) => {
      const storage = storages.get(entry.cache)!
      const response = await (await caches.open(storage)).match(request)
      if (!response) throw new Error(`Сборка ${entry.name}@${entry.version} отсутствует в кэше`)
      startup.verify(response)
      if (response.headers.get("X-Package-Name") !== entry.name)
        throw new Error(`Ответ обновления принадлежит другому пакету: ${entry.name}`)
      if (response.headers.get("X-Package-Version") !== entry.version)
        throw new Error(`Ответ обновления имеет другую версию: ${entry.name}@${entry.version}`)
      return {entry: {...entry, storage: entry.cache}, response}
    }))

    await Promise.all(prepared.map(async ({entry, response}) => {
      await (await caches.open(entry.cache)).put(entry.endpoint, response)
    }))

    const active = prepared.map(({entry}) => entry)
    await activateRelease(active)
    await forgetRelease()
    await discardInactiveReleases()
    console.debug("[@release/service:activate]", "вся группа открыта в активном кэше", {
      artifacts: active.map(({name, version}) => ({name, version})),
    })
    return active.map(({name}) => name)
  } catch (error) {
    await discardInterruptedRelease()
    await discardInactiveReleases()
    console.debug("[@release/service:prepare]", "подготовка кэша завершилась с ошибкой", {
      artifacts: targets.map(({entry}) => ({name: entry.name, version: entry.version})),
    }, error)
    throw error
  }
}
