/**
 * Универсально импортирует один Window module.
 *
 * Обновляемый main importer выбирает стабильный endpoint. Фактический request
 * проходит через управляющий Service Worker. Endpoint определяет, попадёт ли
 * artifact в cache `internal` или в будущий cache `metafor`.
 *
 * @param endpoint - Стабильный HTTP endpoint Window module.
 * @returns Namespace импортированного ES module.
 */
export function importModule(endpoint: string) {
  return import(endpoint)
}
