import type {MetaDSL} from "@metafor/types/metafor/schema"
import settings from "./settings.yml"

const { HUB, MODULE } = settings

const importMeta = async (sourcePath: string): Promise<MetaDSL> => {
  const module = await import(sourcePath)
  return (module.default ?? module) as MetaDSL
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const loadMeta = async (address: string): Promise<MetaDSL> => {
  const sourcePath = new URL(`../${HUB}${address}/${MODULE}`, import.meta.url).href
  try {
    return await importMeta(sourcePath)
  } catch (primaryError) {
    const fallbackPath = new URL(`../${HUB}${address}/src/${MODULE}`, import.meta.url).href
    try {
      return await importMeta(fallbackPath)
    } catch (fallbackError) {
      throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(primaryError)}; ${fallbackPath} — ${errorMessage(fallbackError)}`)
    }
  }
}
