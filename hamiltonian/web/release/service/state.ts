import type {BrowserPackageIdentity} from "../../package-integrity"
import {browserPackageUrl} from "../../package-url"
import {
  parseReleaseDeltaMessage,
  releaseDeltaMessage,
  type ReleaseDelta,
  type ReleaseDeltaMessage,
} from "../protocol"
import {
  transactionCache,
  transactionExists,
  transactionIntentRequest,
} from "../transaction"

/** Точная версия package в browser release. */
export interface ReleasePackage extends BrowserPackageIdentity {}

/** Первой записью фиксирует fresh delta до fetch и canonical writes. */
export async function rememberTransaction(delta: ReleaseDelta) {
  await (await caches.open(transactionCache)).put(
    transactionIntentRequest(),
    Response.json(releaseDeltaMessage(delta)),
  )
}

/** Читает незавершённое намерение; пустой cache безопасно удаляет. */
export async function pendingTransaction(): Promise<ReleaseDeltaMessage | null> {
  if (!await transactionExists()) return null
  const cache = await caches.open(transactionCache)
  const response = await cache.match(transactionIntentRequest())
  if (!response) {
    await caches.delete(transactionCache)
    return null
  }
  const delta = parseReleaseDeltaMessage(await response.json())
  if (delta === null) throw new Error("Transaction содержит некорректное намерение")
  return delta
}

/** Возвращает ранее подготовленный exact response. */
export async function preparedPackage(entry: ReleasePackage) {
  if (!await transactionExists()) return
  return await (await caches.open(transactionCache)).match(
    exactRequest(entry),
    {ignoreVary: true},
  )
}

/** Сохраняет verified response только внутри фиксированной transaction. */
export async function preparePackage(entry: ReleasePackage, response: Response) {
  await (await caches.open(transactionCache)).put(exactRequest(entry), response)
}

/** Последняя commit-операция удаляет intent и все prepared bytes вместе. */
export async function commitTransaction() {
  await caches.delete(transactionCache)
}

/** Удаляет metadata и storages прежнего active-switch protocol. */
export async function discardLegacyReleaseState() {
  const names = await caches.keys()
  await Promise.all(["release", "internal", "metafor"]
    .filter((name) => names.includes(name))
    .map(async (name) => {
      const cache = await caches.open(name)
      await Promise.all([
        cache.delete(new Request(new URL("/code?state=active", location.origin))),
        cache.delete(new Request(new URL("/code?state=pending", location.origin))),
      ])
    }))
  await Promise.all(names
    .filter((name) => name.includes(":release:"))
    .map((name) => caches.delete(name)))
}

function exactRequest(entry: ReleasePackage) {
  return new Request(
    new URL(browserPackageUrl(entry.name, entry.env, entry.version), location.origin),
    {cache: "no-store"},
  )
}
