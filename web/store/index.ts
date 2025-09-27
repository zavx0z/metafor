import type { Store } from "../../core/store.t"
import { MetaStore } from "./meta"
import { DataStore } from "./data"

/**
 * Единый веб-стор
 *
 * Объединяет MetaStore (для модулей) и DataStore (для данных).
 */
export async function Store(): Promise<Store> {
  const meta = await MetaStore("meta")
  const data = await DataStore("data")
  const actor = await DataStore("actor")

  return { meta, data, actor }
}
