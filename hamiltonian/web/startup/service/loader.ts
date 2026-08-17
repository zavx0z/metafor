import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
} from "../../package-url"
import type {BrowserPackageIdentity} from "../../package-integrity"

/** Минимальная ссылка startup на уже активный release artifact. */
interface ActiveReleasePackage extends BrowserPackageIdentity {
  storage: string
}

interface ActiveRelease {
  packages: Record<string, ActiveReleasePackage>
}

const releaseCache = "release"
const activeReleaseRequest = new Request(new URL("/code?state=active", location.origin))

/** Проверяет, что полученный HTTP response можно использовать дальше. */
export function verify(response: Response) {
  if (!response.ok) throw new Error(`${response.url || "Resource"} returned ${response.status}`)
  return response
}

/** Сохраняет response для точного request в выбранном Cache Storage. */
export async function cache(name: string, request: Request, response: Response) {
  const active = await activePackage(name, request)
  if (active) {
    await (await caches.open(active.storage)).put(exactPackageUrl(active), response)
    return
  }
  await (await caches.open(name)).put(request, response)
}

/** Читает response точного request из выбранного Cache Storage. */
export async function read(name: string, request: Request) {
  const active = await activePackage(name, request)
  if (active)
    return (await caches.open(active.storage)).match(exactPackageUrl(active), {ignoreVary: true})
  return (await caches.open(name)).match(request, {ignoreVary: true})
}

/** Удаляет response точного request из выбранного Cache Storage. */
export async function remove(name: string, request: Request) {
  const active = await activePackage(name, request)
  if (active)
    return (await caches.open(active.storage)).delete(exactPackageUrl(active), {ignoreVary: true})
  return (await caches.open(name)).delete(request, {ignoreVary: true})
}

/**
 * Выполняет source с явно переданными именованными значениями.
 *
 * Startup и release используют эту границу для сохранённых IIFE и CommonJS
 * module bodies, которым нельзя сделать dynamic import внутри Service Worker.
 */
export function run(source: string, bindings: Readonly<Record<string, unknown>> = {}) {
  const entries = Object.entries(bindings)
  return Function(...entries.map(([name]) => name), source)(...entries.map(([, value]) => value))
}

async function activePackage(name: string, request: Request) {
  const artifact = parseBrowserPackageUrl(new URL(request.url))
  if (artifact === null) return null
  const entry = (await activeRelease()).packages[browserPackageSlot(artifact.name, artifact.env)]
  return entry && browserPackageCache(entry.name) === name ? entry : null
}

/** Читает только указатель, необходимый startup для восстановления active release. */
async function activeRelease(): Promise<ActiveRelease> {
  const response = await (await caches.open(releaseCache)).match(activeReleaseRequest)
  if (!response) return {packages: {}}
  const state = await response.json() as Partial<ActiveRelease>
  return {packages: state.packages ?? {}}
}

function exactPackageUrl(entry: ActiveReleasePackage) {
  return browserPackageUrl(entry.name, entry.env, entry.version)
}
