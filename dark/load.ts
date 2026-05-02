import type { MetaDSL, SRC } from ".."
import settings from "./settings.yml"

const { HUB, MODULE } = settings

export const loadMeta = async (address: SRC): Promise<MetaDSL> => {
  const sourcePath = new URL(`../${HUB}${address}/${MODULE}`, import.meta.url).href
  try {
    const module = await import(sourcePath)
    return (module.default ?? module) as MetaDSL
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${message}`)
  }
}
