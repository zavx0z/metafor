import type {BrowserPackageArtifactIdentity} from "../../shared/artifact-integrity"
import {browserPackageIdentityUrl} from "../../shared/artifact-url"

/** Единственный технический Cache Storage package update. */
export const transactionCache = "transaction"

/** Первая cache entry только отмечает незавершённую transaction. */
export const transactionMarkerPath = "/transaction"

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

function exactRequest(entry: BrowserPackageArtifactIdentity) {
  return new Request(
    new URL(browserPackageIdentityUrl(entry), location.origin),
    {cache: "no-store"},
  )
}
