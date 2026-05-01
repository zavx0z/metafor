import type {MetaDSL, SRC} from ".."
import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {Store} from "../store/index.ts"
import {emitMetaPatches} from "./patch/meta.ts"
import settings from "./settings.yml"

const {HUB, MODULE} = settings 

/**
 * Читает DSL meta из локального TS-модуля через dynamic import.
 *
 * @param address — канонический адрес хаба для загрузки
 * @returns `dsl`
 * @throws если не удалось загрузить meta
 */
export const readMetaDsl = async (address: SRC): Promise<MetaDSL> => {
  const sourcePath = new URL(`../${HUB}${address}/${MODULE}`, import.meta.url).href
  try {
    const module = await import(sourcePath)
    return (module.default ?? module) as MetaDSL
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить meta: ${sourcePath} — ${message}`)
  }
}

/**
 * Канонизирует мету:
 * - если её ещё нет в store — эмитит graviton-патчи через `emitMetaPatches`,
 * - если уже есть — читает `MetaIdentifiers` из store через `Meta.identifiers()` ORM.
 *
 * Без in-memory кеша: повторный вызов всегда делает либо emit (для отсутствующей),
 * либо SQL-запрос за uuid'ами.
 */
export const loadMeta = async (
  src: SRC,
  store: Pick<Store, "meta" | "update">,
): Promise<MetaIdentifiers> => {
  const existing = await store.meta.get(src)
  if (existing) return existing.identifiers()

  const dsl = await readMetaDsl(src)
  return emitMetaPatches(src, dsl, store)
}
