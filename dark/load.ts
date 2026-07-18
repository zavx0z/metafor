import {existsSync} from "node:fs"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import settings from "./settings.yml"

const { HUB, MODULE } = settings
const metaPath = (address: string): string => `../${HUB}${address}`

const configuredMeta = (address: string): string | undefined => {
  const root = Bun.env.METAFOR_META_ROOT?.trim()
  if (!root) return
  const path = resolve(root, address, MODULE)
  return existsSync(path) ? pathToFileURL(path).href : undefined
}

const importMeta = async (sourcePath: string): Promise<MetaDSL> => {
  const module = await import(sourcePath)
  return (module.default ?? module) as MetaDSL
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const loadMeta = async (address: string): Promise<MetaDSL> => {
  const sourcePath = configuredMeta(address) ?? new URL(`${metaPath(address)}/${MODULE}`, import.meta.url).href
  try {
    return await importMeta(sourcePath)
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
