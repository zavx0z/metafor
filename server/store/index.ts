import type { Store } from "../../core/store.t"
import { MetaStore } from "./meta"
import { DataStore } from "./data"
import { resolve } from "node:path"
import fs from "node:fs/promises"

/**
 * Единый серверный стор
 *
 * Объединяет MetaStore (для модулей) и DataStore (для данных).
 */
export async function Store(path: string = "./store"): Promise<Store> {
  const absPath = resolve(process.cwd(), path)

  // Создаем директорию если не существует
  try {
    await fs.mkdir(absPath, { recursive: true })
  } catch {
    // Игнорируем ошибки создания директории
  }

  const meta = await MetaStore(resolve(absPath, "meta.db"))
  const data = await DataStore(resolve(absPath, "data.db"))
  const ctx = await DataStore(resolve(absPath, "ctx.db"))

  return { meta, data, ctx }
}
