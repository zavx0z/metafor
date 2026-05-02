import type {MetaDSL, SRC} from ".."
import type {Meta} from "@store/meta/sqlite"
import settings from "./settings.yml"
import {projectTemplateMatterRelations} from "./matter.ts"

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
 * Получает или канонизирует мету в `globalThis.store`:
 * - если уже есть — возвращает существующий `Meta` ORM,
 * - иначе читает DSL и создаёт через `store.meta.create(src, dsl, matter)`.
 */
export const loadMeta = async (src: SRC): Promise<Meta> => {
  const existing = await store.meta.get(src)
  if (existing) return existing

  const dsl = await readMetaDsl(src)
  return store.meta.create(src, dsl, projectTemplateMatterRelations(dsl))
}
