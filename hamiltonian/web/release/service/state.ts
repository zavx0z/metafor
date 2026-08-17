import type {BrowserPackageIdentity} from "../../package-integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../../package-url"

/** Точная версия package, подготовленная host для browser release. */
export interface ReleasePackage extends BrowserPackageIdentity {}

/** Активная cache entry package после транзакционного переключения. */
export interface ActiveReleasePackage extends ReleasePackage {
  storage: string
}

interface ReleaseState {
  packages: Record<string, ActiveReleasePackage>
  restart: string[]
}

interface PendingRelease {
  packages: ReleasePackage[]
  storages: string[]
}

const metadataCache = "release"
const activeRequest = new Request(new URL("/code?state=active", location.origin))
const pendingRequest = new Request(new URL("/code?state=pending", location.origin))

/** Читает атомарно выбранный package state. */
export async function activeRelease(): Promise<ReleaseState> {
  const response = await (await caches.open(metadataCache)).match(activeRequest)
  if (!response) return {packages: {}, restart: []}
  const state = await response.json() as Partial<ReleaseState>
  return {
    packages: state.packages ?? {},
    restart: state.restart ?? [],
  }
}

/** Сохраняет намерение до начала network/cache операций. */
export async function rememberRelease(release: PendingRelease) {
  await (await caches.open(metadataCache)).put(pendingRequest, Response.json(release))
}

/** Одним metadata write открывает loader все entries подготовленной группы. */
export async function activateRelease(packages: ActiveReleasePackage[]) {
  const current = await activeRelease()
  const next = {...current.packages}
  for (const entry of packages) next[browserPackageSlot(entry.name, entry.env)] = entry
  await (await caches.open(metadataCache)).put(
    activeRequest,
    Response.json({
      packages: next,
      restart: packages.map(({name, env}) => browserPackageSlot(name, env)),
    } satisfies ReleaseState),
  )
}

/** Возвращает packages, active switch которых ещё не завершён navigation. */
export async function pendingRestart() {
  return (await activeRelease()).restart
}

/** Подтверждает, что navigation действующих Window уже запущена. */
export async function confirmRestart() {
  const current = await activeRelease()
  await (await caches.open(metadataCache)).put(
    activeRequest,
    Response.json({...current, restart: []} satisfies ReleaseState),
  )
}

/** Удаляет завершённое либо оставшееся после остановки намерение. */
export async function forgetRelease() {
  await (await caches.open(metadataCache)).delete(pendingRequest)
}

/** Удаляет временные caches прерванной до active switch транзакции. */
export async function discardInterruptedRelease() {
  const metadata = await caches.open(metadataCache)
  const pendingResponse = await metadata.match(pendingRequest)
  if (!pendingResponse) return

  const [pending, active] = await Promise.all([
    pendingResponse.json() as Promise<PendingRelease>,
    activeRelease(),
  ])
  const used = new Set(Object.values(active.packages).map(({storage}) => storage))
  await Promise.all([
    ...pending.packages.map(async (entry) => {
      const current = active.packages[browserPackageSlot(entry.name, entry.env)]
      if (current && sameRelease(current, entry)) return
      const owner = requiredCacheOwner(entry.name)
      await (await caches.open(owner)).delete(
        browserPackageUrl(entry.name, entry.env, entry.version),
        {ignoreVary: true},
      )
    }),
    ...pending.storages
      .filter((storage) => !used.has(storage))
      .map((storage) => caches.delete(storage)),
  ])
  await metadata.delete(pendingRequest)
}

/** Переносит прежний active state в owner caches и удаляет неактивные entries. */
export async function discardInactiveReleases() {
  let active = await activeRelease()
  const packages = {...active.packages}
  let migrated = false

  for (const [slot, entry] of Object.entries(packages)) {
    const cacheName = requiredCacheOwner(entry.name)
    const endpoint = browserPackageUrl(entry.name, entry.env, entry.version)
    if (entry.storage === cacheName) continue
    const owner = await caches.open(cacheName)
    const cached = await owner.match(endpoint, {ignoreVary: true})
    if (!cached) {
      const response = await (await caches.open(entry.storage)).match(endpoint, {ignoreVary: true})
      if (!response)
        throw new Error(`Активная сборка ${entry.name}:${entry.env}@${entry.version} отсутствует в кэше`)
      await owner.put(endpoint, response)
    }
    packages[slot] = {...entry, storage: cacheName}
    migrated = true
  }

  if (migrated) {
    active = {...active, packages}
    await writeReleaseState(active)
  }

  await discardSupersededEntries(active)
  const names = await caches.keys()
  await Promise.all(names
    .filter((name) => name.includes(":release:"))
    .map((name) => caches.delete(name)))
}

async function discardSupersededEntries(active: ReleaseState) {
  const owners = new Set(Object.values(active.packages).map(({name}) => requiredCacheOwner(name)))
  await Promise.all([...owners].map(async (owner) => {
    const cache = await caches.open(owner)
    const requests = await cache.keys()
    await Promise.all(requests.map(async (request) => {
      const artifact = parseBrowserPackageUrl(new URL(request.url))
      if (artifact === null) return
      const entry = active.packages[browserPackageSlot(artifact.name, artifact.env)]
      if (!entry || requiredCacheOwner(entry.name) !== owner) return
      const endpoint = new URL(
        browserPackageUrl(entry.name, entry.env, entry.version),
        location.origin,
      ).href
      if (request.url !== endpoint) await cache.delete(request, {ignoreVary: true})
    }))
  }))
}

function sameRelease(active: ActiveReleasePackage, expected: ReleasePackage) {
  return active.name === expected.name
    && active.env === expected.env
    && active.version === expected.version
    && active.sha256 === expected.sha256
    && active.size === expected.size
}

async function writeReleaseState(state: ReleaseState) {
  await (await caches.open(metadataCache)).put(activeRequest, Response.json(state))
}

function requiredCacheOwner(name: string) {
  const owner = browserPackageCache(name)
  if (owner === null) throw new Error(`Package ${name} не имеет cache owner`)
  return owner
}
