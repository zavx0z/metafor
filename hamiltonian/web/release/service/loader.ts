import {verifyPackageResponse} from "../../package-integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
} from "../../package-url"
import type {ReleaseLoader} from "./contract"
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
  startup: ReleaseLoader,
  packages: ReleasePackage[],
) {
  await discardInterruptedRelease()
  await discardInactiveReleases()
  const targets = (await Promise.all(packages.map(async (entry) => {
    const cache = requiredCacheOwner(entry.name)
    const stable = new Request(new URL(browserPackageUrl(entry.name, entry.env), location.origin))
    const current = await startup.read(cache, stable)
    if (current) {
      try {
        await verifyPackageResponse(current, entry)
        return null
      } catch {
        // Повреждённый либо устаревший response заменяется exact artifact ниже.
      }
    }
    return {
      cache,
      entry,
      stable,
      request: new Request(
        new URL(browserPackageUrl(entry.name, entry.env, entry.version), location.origin),
        {cache: "no-store"},
      ),
    }
  }))).filter((target) => target !== null)

  if (targets.length === 0) return await pendingRestart()

  const transaction = crypto.randomUUID()
  const storages = new Map<string, string>()
  for (const {cache} of targets) {
    if (!storages.has(cache)) storages.set(cache, `${cache}:release:${transaction}`)
  }

  console.debug("[@release/service:prepare]", "подготовка обновления началась", {
    artifacts: targets.map(({cache, entry, request}) => ({
      cache,
      env: entry.env,
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
  for (const {cache, request} of targets) {
    const storage = storages.get(cache)!
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

    const prepared = await Promise.all(targets.map(async ({cache, entry, request}) => {
      const storage = storages.get(cache)!
      const response = await (await caches.open(storage)).match(request)
      if (!response)
        throw new Error(`Сборка ${entry.name}:${entry.env}@${entry.version} отсутствует в кэше`)
      await verifyPackageResponse(startup.verify(response), entry)
      return {entry: {...entry, storage: cache}, response}
    }))

    await Promise.all(prepared.map(async ({entry, response}) => {
      const cache = requiredCacheOwner(entry.name)
      await (await caches.open(cache)).put(
        browserPackageUrl(entry.name, entry.env, entry.version),
        response,
      )
    }))

    const active = prepared.map(({entry}) => entry)
    await activateRelease(active)
    await forgetRelease()
    await discardInactiveReleases()
    console.debug("[@release/service:activate]", "вся группа открыта в активном кэше", {
      artifacts: active.map(({name, env, version}) => ({name, env, version})),
    })
    return active.map(({name, env}) => browserPackageSlot(name, env))
  } catch (error) {
    await discardInterruptedRelease()
    await discardInactiveReleases()
    console.debug("[@release/service:prepare]", "подготовка кэша завершилась с ошибкой", {
      artifacts: targets.map(({entry}) => ({
        name: entry.name,
        env: entry.env,
        version: entry.version,
      })),
    }, error)
    throw error
  }
}

function requiredCacheOwner(name: string) {
  const owner = browserPackageCache(name)
  if (owner === null) throw new Error(`Package ${name} не имеет cache owner`)
  return owner
}
