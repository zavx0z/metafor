import type {BrowserPackageArtifactIdentity} from "@metafor/tech-build/identity"
import {browserPackageIdentityUrl} from "@metafor/tech-build/identity"

/** Единственный технический Cache Storage package update. */
export const transactionCache = "transaction"

/** Первая cache entry только отмечает незавершённую transaction. */
export const transactionMarkerPath = "/transaction"
const failurePath = "/transaction/failure"
type CompositionFailure = {schema: "cosmos/composition-failure/v1"; target: string; error: string; at: number}

export function transactionMarkerRequest() {
  return new Request(new URL(transactionMarkerPath, location.origin))
}

/** Проверяет существование transaction, не создавая пустой cache. */
export async function transactionExists() {
  return (await caches.keys()).includes(transactionCache)
}

/** Проверяет marker уже начатой transaction, не создавая новую. */
export async function pendingTransaction() {
  if (!await transactionExists()) return false
  const cache = await caches.open(transactionCache)
  const entries = await cache.keys()
  if (entries.length === 0) {
    await caches.delete(transactionCache)
    return false
  }

  const marker = transactionMarkerRequest()
  if (entries[0]?.url !== marker.url || !await cache.match(marker))
    throw new Error("Transaction marker отсутствует в первой entry")
  return true
}

/**
Первой entry создаёт marker до любой загрузки или code write.
Существующая transaction не хранит server delta: release получает её заново.

@returns `true`, если эта transaction уже существовала.
*/
export async function beginTransaction() {
  if (await pendingTransaction()) return true

  await (await caches.open(transactionCache)).put(
    transactionMarkerRequest(),
    new Response(null, {status: 204}),
  )
  return false
}

/** Возвращает ранее подготовленный exact response. */
export async function preparedPackage(entry: BrowserPackageArtifactIdentity) {
  if (!await transactionExists()) return
  return await (await caches.open(transactionCache)).match(
    exactRequest(entry),
    {ignoreVary: true},
  )
}

/** Сохраняет verified response только внутри фиксированной transaction. */
export async function preparePackage(entry: BrowserPackageArtifactIdentity, response: Response) {
  await (await caches.open(transactionCache)).put(exactRequest(entry), response)
}

/** Последняя commit-операция удаляет intent и все prepared bytes вместе. */
export async function commitTransaction() {
  await caches.delete(transactionCache)
}

/** Одна известная ошибка проверки сохраняется в той же transaction, без cache cleanup/reload. */
export async function failedComposition(): Promise<CompositionFailure | null> {
  if (!await transactionExists()) return null
  const response = await (await caches.open(transactionCache)).match(new Request(new URL(failurePath, location.origin)))
  if (!response) return null
  const value: unknown = await response.json()
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid release transaction failure")
  const failure = value as Record<string, unknown>
  if (failure.schema !== "cosmos/composition-failure/v1" || typeof failure.target !== "string" || failure.target.length > 262144 || typeof failure.error !== "string" || failure.error.length > 8192 || typeof failure.at !== "number") throw new Error("Invalid release transaction failure")
  return failure as CompositionFailure
}

/** Блокируется точный immutable root composition; новый release target может продолжить transaction. */
export async function recordFailedComposition(target: string, error: string) {
  const failure: CompositionFailure = {schema: "cosmos/composition-failure/v1", target, error: error.slice(0, 8192), at: Date.now()}
  await (await caches.open(transactionCache)).put(new Request(new URL(failurePath, location.origin)), Response.json(failure))
}

function exactRequest(entry: BrowserPackageArtifactIdentity) {
  return new Request(
    new URL(browserPackageIdentityUrl(entry), location.origin),
    {cache: "no-store"},
  )
}
