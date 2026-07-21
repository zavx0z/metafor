import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import settings from "./settings.yml"

const {CLUSTER, MODULE} = settings
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const canonicalMetaSource = (address: string): boolean => {
  const segments = address.split("/")
  return (segments.length === 2 || segments.length === 3) &&
    segments.every((segment) => SEGMENT.test(segment))
}

const assertMetaSource = (address: string): void => {
  if (!canonicalMetaSource(address)) {
    throw new Error(
      `Неканонический WIMP src: ${address}. Ожидается <github-user>/<repository>[/<meta-package>]`,
    )
  }
}

const defaultMetaRoot = (): string => resolve(import.meta.dir, "..", CLUSTER)

export const resolveMetaPath = (address: string, root?: string): string => {
  assertMetaSource(address)
  return resolve(root?.trim() || defaultMetaRoot(), address, MODULE)
}

const importMeta = async (sourcePath: string): Promise<MetaDSL> => {
  const module = await import(sourcePath)
  return (module.default ?? module) as MetaDSL
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const loadMeta = async (address: string): Promise<MetaDSL> => {
  const sourcePath = pathToFileURL(resolveMetaPath(address, Bun.env.METAFOR_META_ROOT)).href
  try {
    return await importMeta(sourcePath)
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
