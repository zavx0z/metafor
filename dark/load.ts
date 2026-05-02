import type {MetaDSL, SRC} from ".."
import type {Wimp} from "@store/wimp/sqlite"
import settings from "./settings.yml"
import {projectTemplateMatterRelations} from "./matter.ts"

const {HUB, MODULE} = settings

/**
 * Читает DSL meta из локального TS-модуля через dynamic import.
 *
 * @param address — канонический адрес хаба для загрузки
 * @returns `dsl`
 * @throws если не удалось загрузить DSL
 */
export const readWimpDsl = async (address: SRC): Promise<MetaDSL> => {
  const sourcePath = new URL(`../${HUB}${address}/${MODULE}`, import.meta.url).href
  try {
    const module = await import(sourcePath)
    return (module.default ?? module) as MetaDSL
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${message}`)
  }
}

/**
 * Получает или канонизирует wimp в `globalThis.store`:
 * - если уже есть — возвращает существующий `Wimp` ORM,
 * - иначе читает DSL и создаёт через `store.wimp.create(src, dsl, matter)`.
 */
export const loadWimp = async (src: SRC): Promise<Wimp> => {
  const existing = await store.wimp.get(src)
  if (existing) return existing

  const dsl = await readWimpDsl(src)
  return store.wimp.create(src, dsl, projectTemplateMatterRelations(dsl))
}
