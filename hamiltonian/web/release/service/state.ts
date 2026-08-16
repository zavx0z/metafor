/** Точная версия package, подготовленная host для browser release. */
export interface ReleasePackage {
  name: string
  version: string
  endpoint: string
  cache: string
}

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
  for (const entry of packages) next[entry.name] = entry
  await (await caches.open(metadataCache)).put(
    activeRequest,
    Response.json({
      packages: next,
      restart: packages.map(({name}) => name),
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
  await Promise.all(pending.storages
    .filter((storage) => !used.has(storage))
    .map((storage) => caches.delete(storage)))
  await metadata.delete(pendingRequest)
}

/** Удаляет прежние versioned caches после успешного active switch. */
export async function discardInactiveReleases() {
  const active = await activeRelease()
  const used = new Set(Object.values(active.packages).map(({storage}) => storage))
  const names = await caches.keys()
  await Promise.all(names
    .filter((name) => name.includes(":release:") && !used.has(name))
    .map((name) => caches.delete(name)))
}
