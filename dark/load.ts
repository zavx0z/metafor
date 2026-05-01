import type {MetaDSL, SRC} from ".."
import type {MetaIdentifiers} from "@store/meta/sqlite"
import type {Store} from "../store/index.ts"
import {emitMetaPatches} from "./patch/meta.ts"

const HUB = "github/"

const resolveHubMetaSource = (address: SRC): string => `/${HUB + address}/meta.json`

const resolveLocalMetaModuleUrl = (address: SRC): string =>
  new URL(`../${HUB}${address}/meta.ts`, import.meta.url).href

const loadMetaFromModule = async (address: SRC): Promise<MetaDSL> => {
  const module = await import(resolveLocalMetaModuleUrl(address))
  return structuredClone((module.default ?? module) as MetaDSL)
}

/**
 * Внутренне читает DSL meta из файла. Не делает orchestration пакета Dark и не мутирует store.
 *
 * @param address — канонический адрес хаба для загрузки
 * @returns `dsl`
 * @throws если не удалось загрузить meta
 */
export const readMetaDsl = async (address: SRC): Promise<MetaDSL> => {
  if (typeof Bun !== "undefined") {
    try {
      return await loadMetaFromModule(address)
    } catch (error) {
      const sourcePath = resolveLocalMetaModuleUrl(address)
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Не удалось загрузить meta: ${sourcePath} — ${message}`)
    }
  }

  const sourcePath = resolveHubMetaSource(address)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return (await response.json()) as MetaDSL
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
