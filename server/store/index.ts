import type { Store } from "../../core/store.t"
import { MetaStore } from "./meta"
import { DataStore } from "./data"

/**
 * Единый серверный стор
 *
 * Объединяет MetaStore (для модулей) и DataStore (для данных).
 */
export async function Store(): Promise<Store> {
  const meta = await MetaStore("meta.db", "module")
  const data = await DataStore()

  return {
    meta,
    data,
  }
}
