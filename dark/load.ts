import type {MetaDSL} from "@metafor/types/metafor/schema"
import settings from "./settings.yml"

const { HUB, MODULE } = settings
const metaPath = (address: string): string => `../${HUB}${address}`

const importMeta = async (sourcePath: string): Promise<MetaDSL> => {
  const module = await import(sourcePath)
  return (module.default ?? module) as MetaDSL
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const loadMeta = async (address: string): Promise<MetaDSL> => {
  const sourcePath = new URL(`${metaPath(address)}/${MODULE}`, import.meta.url).href
  try {
    return await importMeta(sourcePath)
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
