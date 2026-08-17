import {verifyPackageResponse, type BrowserPackageIdentity} from "../../package-integrity"
import {
  browserPackageCache,
  browserPackageSlot,
  browserPackageUrl,
  parseBrowserPackageUrl,
  type BrowserPackageUrl,
} from "../../package-url"
import {parseReleaseDeltaMessage} from "../../release/protocol"
import {
  transactionCache,
  transactionExists,
  transactionIntentRequest,
} from "../../release/transaction"

const recoveryService = {
  name: "@release/service",
  env: "service-worker",
} as const

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

  if (await transactionExists()) {
    if (sameSlot(artifact, recoveryService)) return await transactionRecoveryService(name, artifact)
    await waitForTransaction()
  }
  return await exactSlotResponse(name, artifact)
}

/** Удаляет package slot только вне recovery transaction. */
export async function remove(name: string, request: Request) {
  if (await transactionExists()) return false
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

async function transactionRecoveryService(name: string, artifact: BrowserPackageUrl) {
  const transaction = await caches.open(transactionCache)
  const intent = await transaction.match(transactionIntentRequest())
  if (!intent) {
    await caches.delete(transactionCache)
    return await exactSlotResponse(name, artifact)
  }
  const delta = parseReleaseDeltaMessage(await intent.json())
  if (delta === null) throw new Error("Transaction содержит некорректное намерение")
  const expected = delta.update.find((entry) => sameSlot(entry, recoveryService))
  if (!expected) return await exactSlotResponse(name, artifact)

  const request = exactRequest(expected)
  const prepared = await transaction.match(request, {ignoreVary: true})
  if (prepared) {
    try {
      await verifyPackageResponse(prepared, expected)
      return prepared
    } catch {
      // Повреждённый recovery executor заменяется exact network response.
    }
  }

  const response = await verifyPackageResponse(verify(await fetch(request)), expected)
  await transaction.put(request, response.clone())
  return response
}

async function exactSlotResponse(name: string, artifact: BrowserPackageUrl) {
  const cache = await caches.open(name)
  const matches: Request[] = []
  for (const request of await cache.keys()) {
    const parsed = parseBrowserPackageUrl(new URL(request.url))
    if (parsed !== null && parsed.version !== null && sameSlot(parsed, artifact))
      matches.push(request)
  }
  if (matches.length > 1)
    throw new Error(`Package slot ${artifact.name}:${artifact.env} имеет несколько exact entries`)
  return matches[0] ? await cache.match(matches[0], {ignoreVary: true}) : undefined
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

async function waitForTransaction() {
  const deadline = Date.now() + 30_000
  while (await transactionExists()) {
    if (Date.now() >= deadline) throw new Error("Browser package transaction не завершена")
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
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
