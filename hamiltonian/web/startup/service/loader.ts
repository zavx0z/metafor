/** Точная версия package, подготовленная host для browser cache. */
export interface UpdatePackage {
  name: string
  version: string
  endpoint: string
  cache: string
}

/** Активная cache entry package после транзакционного переключения. */
export interface ActiveUpdatePackage extends UpdatePackage {
  storage: string
}

interface UpdateState {
  packages: Record<string, ActiveUpdatePackage>
  restart: string[]
}

interface PendingUpdate {
  packages: UpdatePackage[]
  storages: string[]
}

const updateStateCache = "internal"
const activeUpdateRequest = new Request(new URL("/code?state=active", location.origin))
const pendingUpdateRequest = new Request(new URL("/code?state=pending", location.origin))

/** Проверяет, что полученный HTTP response можно использовать дальше. */
export function verify(response: Response) {
  if (!response.ok) throw new Error(`${response.url || "Resource"} returned ${response.status}`)
  return response
}

/** Сохраняет response для точного request в выбранном Cache Storage. */
export async function cache(name: string, request: Request, response: Response) {
  const active = await activePackage(name, request)
  if (active) {
    await (await caches.open(active.storage)).put(active.endpoint, response)
    return
  }
  await (await caches.open(name)).put(request, response)
}

/** Читает response точного request из выбранного Cache Storage. */
export async function read(name: string, request: Request) {
  const active = await activePackage(name, request)
  if (active)
    return (await caches.open(active.storage)).match(active.endpoint, {ignoreVary: true})
  return (await caches.open(name)).match(request, {ignoreVary: true})
}

/** Удаляет response точного request из выбранного Cache Storage. */
export async function remove(name: string, request: Request) {
  const active = await activePackage(name, request)
  if (active)
    return (await caches.open(active.storage)).delete(active.endpoint, {ignoreVary: true})
  return (await caches.open(name)).delete(request, {ignoreVary: true})
}

/** Читает атомарно выбранный package state. */
export async function activeUpdate(): Promise<UpdateState> {
  const response = await (await caches.open(updateStateCache)).match(activeUpdateRequest)
  if (!response) return {packages: {}, restart: []}
  const state = await response.json() as Partial<UpdateState>
  return {
    packages: state.packages ?? {},
    restart: state.restart ?? [],
  }
}

/** Сохраняет намерение до начала network/cache операций. */
export async function rememberUpdate(update: PendingUpdate) {
  await (await caches.open(updateStateCache)).put(
    pendingUpdateRequest,
    Response.json(update),
  )
}

/** Одним cache write открывает loader все entries подготовленной группы. */
export async function activateUpdate(packages: ActiveUpdatePackage[]) {
  const current = await activeUpdate()
  const next = {...current.packages}
  for (const entry of packages) next[entry.name] = entry
  await (await caches.open(updateStateCache)).put(
    activeUpdateRequest,
    Response.json({
      packages: next,
      restart: packages.map(({name}) => name),
    } satisfies UpdateState),
  )
}

/** Возвращает packages, для которых active switch ещё не завершён navigation. */
export async function pendingRestart() {
  return (await activeUpdate()).restart
}

/** Подтверждает, что navigation действующих Window уже запущена. */
export async function confirmRestart() {
  const current = await activeUpdate()
  await (await caches.open(updateStateCache)).put(
    activeUpdateRequest,
    Response.json({...current, restart: []} satisfies UpdateState),
  )
}

/** Удаляет завершённое либо оставшееся после остановки намерение. */
export async function forgetUpdate() {
  await (await caches.open(updateStateCache)).delete(pendingUpdateRequest)
}

/** Удаляет временные caches, на которые не указывает active package state. */
export async function discardInterruptedUpdate() {
  const metadata = await caches.open(updateStateCache)
  const pendingResponse = await metadata.match(pendingUpdateRequest)
  if (!pendingResponse) return

  const [pending, active] = await Promise.all([
    pendingResponse.json() as Promise<PendingUpdate>,
    activeUpdate(),
  ])
  const used = new Set(Object.values(active.packages).map(({storage}) => storage))
  await Promise.all(pending.storages
    .filter((storage) => !used.has(storage))
    .map((storage) => caches.delete(storage)))
  await metadata.delete(pendingUpdateRequest)
}

/** Удаляет прежние versioned caches после успешного active switch. */
export async function discardInactiveUpdates() {
  const active = await activeUpdate()
  const used = new Set(Object.values(active.packages).map(({storage}) => storage))
  const names = await caches.keys()
  await Promise.all(names
    .filter((name) => name.includes(":update:") && !used.has(name))
    .map((name) => caches.delete(name)))
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

async function activePackage(name: string, request: Request) {
  const module = new URL(request.url).searchParams.get("module")
  if (module === null) return null
  const entry = (await activeUpdate()).packages[module]
  return entry?.cache === name ? entry : null
}
