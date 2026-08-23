import "@metafor/dsl"
import {readFile} from "node:fs/promises"
import {resolve} from "node:path"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import settings from "./settings.yml"

const {CLUSTER, MODULE} = settings
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const canonicalMetaSource = (address: string): boolean => {
  const segments = address.split("/")
  return segments.length === 2 &&
    segments.every((segment) => SEGMENT.test(segment))
}

const assertMetaSource = (address: string): void => {
  if (!canonicalMetaSource(address)) {
    throw new Error(
      `Неканонический WIMP src: ${address}. Ожидается <owner>/<repository>`,
    )
  }
}

export const resolveMetaPath = (address: string): string => {
  assertMetaSource(address)
  return resolve(import.meta.dir, "..", CLUSTER, address, MODULE)
}

const transpiler = new Bun.Transpiler({loader: "ts", target: "bun"})

export const evaluateMetaSource = async (source: string): Promise<MetaDSL> => {
  const javascript = transpiler.transformSync(source)
  const moduleUrl = URL.createObjectURL(new Blob([javascript], {type: "text/javascript"}))
  try {
    const module = await import(moduleUrl)
    return (module.default ?? module) as MetaDSL
  } finally {
    URL.revokeObjectURL(moduleUrl)
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const loadMeta = async (address: string): Promise<MetaDSL> => {
  const sourcePath = resolveMetaPath(address)
  try {
    return await evaluateMetaSource(await readFile(sourcePath, "utf8"))
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
