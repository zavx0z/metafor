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
