import type { Store } from "../../core/store.t"
import { MetaStore } from "./meta"
import { DataStore } from "./data"
import { resolve } from "node:path"

/**
 * Единый серверный стор
 *
 * Объединяет MetaStore (для модулей) и DataStore (для данных).
 */
export async function Store(path: string = "./"): Promise<Store> {
  const absPath = resolve(import.meta.dirname, path)
  const meta = await MetaStore(resolve(absPath, "meta.db"))
  const data = await DataStore(resolve(absPath, "data.db"))
  const ctx = await DataStore(resolve(absPath, "ctx.db"))

  return { meta, data, ctx }
}
