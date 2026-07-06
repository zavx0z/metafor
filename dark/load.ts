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
  } catch (primaryError) {
    const fallbackPath = new URL(`${metaPath(address)}/src/${MODULE}`, import.meta.url).href
    try {
      return await importMeta(fallbackPath)
    } catch (fallbackError) {
      throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(primaryError)}; ${fallbackPath} — ${errorMessage(fallbackError)}`)
    }
  }
}

export const loadMetaVersion = async (address: string): Promise<{major: number; minor: number; patch: number}> => {
  const packagePath = new URL(`${metaPath(address)}/package.json`, import.meta.url)
  const pkg = await Bun.file(packagePath).json() as {version?: unknown}
  if (typeof pkg.version !== "string" || pkg.version.length === 0) {
    throw new Error(`Package version is missing in ${packagePath}`)
  }
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(pkg.version)
  if (!match) {
    throw new Error(`Package version is invalid in ${packagePath}: ${pkg.version}`)
  }
  return {major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3])}
}
