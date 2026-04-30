import type {MetaDSL, SRC} from ".."
import type {Store} from "../store/index.ts"
import {emitMetaPatches, type MetaIndex} from "./patch/meta.ts"
import {dark$} from "./store.ts"

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
 * Канонизирует мету: при первом обращении эмитит graviton-патчи в `store.update`,
 * при повторном — возвращает ранее построенный `MetaIndex` из `dark$.metaIndex`.
 */
export const loadMeta = async (
  src: SRC,
  store: Pick<Store, "update">,
): Promise<MetaIndex> => {
  const cached = dark$.metaIndex.get(src)
  if (cached) return cached

  const dsl = await readMetaDsl(src)
  const index = await emitMetaPatches(src, dsl, store)
  dark$.metaIndex.set(src, index)
  return index
}
