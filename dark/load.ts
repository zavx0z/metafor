import type {MetaDSL, SRC} from ".."
import type {MetaIdentifiers} from "@store/meta/sqlite"
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
 * Канонизирует мету в текущем module-level store:
 * - если её ещё нет — записывает декларацию через `store.meta.create(src, dsl, matter)`,
 * - если уже есть — читает `MetaIdentifiers` через `Meta.identifiers()` ORM.
 */
export const loadMeta = async (src: SRC): Promise<MetaIdentifiers> => {
  const existing = await store.meta.get(src)
  if (existing) return existing.identifiers()

  const dsl = await readMetaDsl(src)
  const meta = await store.meta.create(src, dsl, projectTemplateMatterRelations(dsl))
  return meta.identifiers()
}
