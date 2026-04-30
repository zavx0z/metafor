import type { MetaDSL, SRC } from ".."
import { getMetaDbContext } from "./load.context.ts"

const HUB = "github/"

/**
 * Преобразует SRC в путь к файлу для загрузки.
 *
 * @param address — канонический адрес хаба
 * @returns путь к файлу для fetch в формате `/{address}/meta.json`
 */
function resolveMetaSource(address: SRC): string {
  return `/${address}/meta.json`
}

/**
 * Преобразует SRC в путь к исходному .ts файлу.
 *
 * @param address — канонический адрес хаба
 * @returns путь к .ts файлу в формате `/{address}.ts`
 */
function resolveMetaTsPath(address: SRC): string {
  return `/${address}.ts`
}

const resolveHubMetaSource = (address: SRC): string => resolveMetaSource(HUB + address)

const resolveLocalMetaModuleUrl = (address: SRC): string => new URL(`../${HUB}${address}/meta.ts`, import.meta.url).href

const loadMetaFromModule = async (address: SRC): Promise<MetaDSL> => {
  const module = await import(resolveLocalMetaModuleUrl(address))
  return structuredClone((module.default ?? module) as MetaDSL)
}

/**
 * Внутренне читает DSL meta из файла.
 *
 * Не делает orchestration пакета Dark и не мутирует store.
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
 * Загружает и канонизирует ровно одну meta в общем in-memory SQLite-контексте.
 *
 * Дальнейшая orchestration обхода дочерних meta должна жить выше `load`,
 * а не внутри этого модуля.
 */
export async function loadMeta(address: SRC): Promise<{ db: unknown } | null> {
  const metaDbContext = await getMetaDbContext()
  if (!metaDbContext) return null

  if (!metaDbContext.loaded.has(address)) {
    const { StoreMetaSqlite } = await import("@store/meta/sqlite")
    const dsl = await readMetaDsl(address)
    const metaStore = await StoreMetaSqlite.open(metaDbContext.db as any)
    await metaStore.create(address, dsl)
    metaDbContext.loaded.add(address)
  }

  return { db: metaDbContext.db }
}
