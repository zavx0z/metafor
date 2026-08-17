import {verifyPackageResponse} from "../../web/package-integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../../web/package-url"
import type {ReleaseDelta} from "../protocol"
import type {ReleaseLoader} from "./contract"
import {
  commitTransaction,
  discardLegacyReleaseState,
  pendingTransaction,
  preparedPackage,
  preparePackage,
  rememberTransaction,
  type ReleasePackage,
} from "./state"

/** Применяет fresh delta через один восстанавливаемый transaction cache. */
export async function updateRelease(
  startup: ReleaseLoader,
  delta: ReleaseDelta,
) {
  const interrupted = await pendingTransaction() !== null
  if (delta.update.length === 0 && delta.remove.length === 0) {
    await discardLegacyReleaseState()
    if (!interrupted) return []
    await rememberTransaction(delta)
    await commitTransaction()
    return ["transaction"]
  }

  await rememberTransaction(delta)
  console.debug("[@hamiltonian/release:service-worker:prepare]", "transaction intent сохранён", {
    remove: delta.remove,
    update: delta.update,
  })

  await Promise.all(delta.update.map(async (entry) => {
    const cached = await preparedPackage(entry)
    if (cached) {
      try {
        await verifyPackageResponse(cached, entry)
        console.debug("[@hamiltonian/release:service-worker:prepare]", "prepared artifact переиспользован", {
          env: entry.env,
          name: entry.name,
          version: entry.version,
        })
        return
      } catch {
        // Повреждённый prepared response заменяется тем же exact artifact ниже.
      }
    }

    const request = exactRequest(entry)
    console.debug("[@hamiltonian/release:service-worker:prepare]", "загрузка exact artifact началась", {
      env: entry.env,
      name: entry.name,
      source: request.url,
      version: entry.version,
    })
    const response = await verifyPackageResponse(startup.verify(await fetch(request)), entry)
    await preparePackage(entry, response)
    console.debug("[@hamiltonian/release:service-worker:prepare]", "exact artifact сохранён в transaction", {
      env: entry.env,
      name: entry.name,
      version: entry.version,
    })
  }))

  const changed = new Set<string>()
  for (const entry of delta.update) {
    const response = await preparedPackage(entry)
    if (!response)
      throw new Error(`Prepared artifact ${entry.name}:${entry.env}@${entry.version} отсутствует`)
    await verifyPackageResponse(response, entry)
    const owner = requiredCacheOwner(entry.name)
    const cache = await caches.open(owner)
    const exact = exactRequest(entry)
    await cache.put(exact, response)
    await discardOtherSlotEntries(cache, entry, exact.url)
    changed.add(browserPackageSlot(entry.name, entry.env))
    console.debug("[@hamiltonian/release:service-worker:activate]", "exact artifact записан в canonical cache", {
      cache: owner,
      env: entry.env,
      name: entry.name,
      version: entry.version,
    })
  }

  for (const entry of delta.remove) {
    const owner = requiredCacheOwner(entry.name)
    await (await caches.open(owner)).delete(exactRequest(entry), {ignoreVary: true})
    changed.add(browserPackageSlot(entry.name, entry.env))
    console.debug("[@hamiltonian/release:service-worker:activate]", "лишний exact artifact удалён", {
      cache: owner,
      env: entry.env,
      name: entry.name,
      version: entry.version,
    })
  }

  await discardLegacyReleaseState()
  await commitTransaction()
  console.debug("[@hamiltonian/release:service-worker:activate]", "transaction завершена удалением cache", {
    changed: [...changed],
  })
  return [...changed]
}

async function discardOtherSlotEntries(
  cache: Cache,
  entry: ReleasePackage,
  keep: string,
) {
  const slot = browserPackageSlot(entry.name, entry.env)
  for (const request of await cache.keys()) {
    const parsed = parseBrowserPackageUrl(new URL(request.url))
    if (
      parsed !== null
      && browserPackageSlot(parsed.name, parsed.env) === slot
      && request.url !== keep
    ) await cache.delete(request, {ignoreVary: true})
  }
}

function exactRequest(entry: Pick<ReleasePackage, "name" | "env" | "version">) {
  return new Request(
    new URL(browserPackageUrl(entry.name, entry.env, entry.version), location.origin),
    {cache: "no-store"},
  )
}

function requiredCacheOwner(name: string) {
  const owner = browserPackageCache(name)
  if (owner === null) throw new Error(`Package ${name} не имеет cache owner`)
  return owner
}
