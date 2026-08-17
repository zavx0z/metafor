/** Единственный технический Cache Storage package update. */
export const transactionCache = "transaction"

/** Первая cache entry содержит выполняемую fresh server delta. */
export const transactionIntentPath = "/code?state=active"

export function transactionIntentRequest() {
  return new Request(new URL(transactionIntentPath, location.origin))
}

/** Проверяет существование transaction, не создавая пустой cache. */
export async function transactionExists() {
  return (await caches.keys()).includes(transactionCache)
}
