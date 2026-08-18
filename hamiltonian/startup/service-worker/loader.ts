import {verifyPackageResponse, type BrowserPackageIdentity} from "../../web/package-integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
  type BrowserPackageUrl,
} from "../../web/package-url"

/** Проверяет, что полученный HTTP response можно использовать дальше. */
export function verify(response: Response) {
  if (!response.ok) throw new Error(`${response.url || "Resource"} returned ${response.status}`)
  return response
}

/** Сохраняет browser code только по exact identity, остальные resources — по request. */
export async function cache(name: string, request: Request, response: Response) {
  const artifact = ownedPackage(name, request)
  if (artifact !== null) {
    const identity = await responseIdentity(artifact, response)
    await (await caches.open(name)).put(exactRequest(identity), response)
    return
  }
  await (await caches.open(name)).put(request, response)
}

/** Читает stable package через единственную exact canonical entry. */
export async function read(name: string, request: Request) {
  const artifact = ownedPackage(name, request)
  if (artifact === null) return (await caches.open(name)).match(request, {ignoreVary: true})
  if (artifact.version !== null)
    return (await caches.open(name)).match(request, {ignoreVary: true})
  return await exactSlotResponse(name, artifact)
}

/** Удаляет все exact entries package slot. */
export async function remove(name: string, request: Request) {
  const artifact = ownedPackage(name, request)
  if (artifact === null) return (await caches.open(name)).delete(request, {ignoreVary: true})
  const cache = await caches.open(name)
  let removed = false
  for (const candidate of await cache.keys()) {
    const parsed = parseBrowserPackageUrl(new URL(candidate.url))
    if (parsed !== null && sameSlot(parsed, artifact))
      removed = await cache.delete(candidate, {ignoreVary: true}) || removed
  }
  return removed
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

async function exactSlotResponse(name: string, artifact: BrowserPackageUrl) {
  const cache = await caches.open(name)
  for (const request of await cache.keys()) {
    const parsed = parseBrowserPackageUrl(new URL(request.url))
    if (parsed === null || parsed.version === null || !sameSlot(parsed, artifact)) continue
    const response = await cache.match(request, {ignoreVary: true})
    if (!response) throw new Error(`Package slot ${artifact.name}:${artifact.env} потерял первую exact entry`)
    await responseIdentity(artifact, response)
    return response
  }
}

async function responseIdentity(
  artifact: BrowserPackageUrl,
  response: Response,
): Promise<BrowserPackageIdentity> {
  const identity = {
    name: response.headers.get("X-Package-Name"),
    env: response.headers.get("X-Package-Env"),
    version: response.headers.get("X-Package-Version"),
    sha256: response.headers.get("X-Package-SHA256"),
    size: Number(response.headers.get("X-Package-Size")),
  }
  if (
    identity.name !== artifact.name
    || identity.env !== artifact.env
    || typeof identity.version !== "string"
    || !/^\d+\.\d+\.\d+$/.test(identity.version)
    || typeof identity.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(identity.sha256)
    || !Number.isSafeInteger(identity.size)
    || identity.size <= 0
  ) throw new Error(`Package response ${artifact.name}:${artifact.env} имеет некорректную identity`)
  const verified = identity as BrowserPackageIdentity
  await verifyPackageResponse(response, verified)
  return verified
}

function ownedPackage(name: string, request: Request) {
  const artifact = parseBrowserPackageUrl(new URL(request.url))
  const owner = browserPackageCache(artifact?.name ?? null)
  return artifact !== null && owner !== "startup" && owner === name ? artifact : null
}

function exactRequest(entry: Pick<BrowserPackageIdentity, "name" | "env" | "version">) {
  return new Request(
    new URL(browserPackageUrl(entry.name, entry.env, entry.version), location.origin),
    {cache: "no-store"},
  )
}

function sameSlot(
  left: Pick<BrowserPackageIdentity, "name" | "env">,
  right: Pick<BrowserPackageIdentity, "name" | "env">,
) {
  return browserPackageSlot(left.name, left.env) === browserPackageSlot(right.name, right.env)
}
