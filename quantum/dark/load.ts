import "@metafor/dsl"
import {pathToFileURL} from "node:url"
import {readFile} from "node:fs/promises"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {defaultMetaSourceResolver, type MetaSourceResolver} from "shared/metafor/source"
export {canonicalMetaSource} from "shared/metafor/source"

/** Dark разрешает canonical src через выбранный source либо installed adapter. */
export const resolveMetaPath = (address: string, resolver: MetaSourceResolver = defaultMetaSourceResolver()): string =>
  resolver.resolveMetaPath(address)

/** Authoring требует source preparation; установленный код остаётся read-only. */
export const resolveMetaAuthoringPath = (address: string, resolver: MetaSourceResolver = defaultMetaSourceResolver()): string => {
  if (resolver.installed) throw new Error("Meta authoring requires a source preparation root")
  return resolver.resolveMetaPath(address)
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

/**
Dark читает декларацию из выбранного [источника Meta](../../docs/META_PACKAGES.md).
Source mode повторно оценивает текущие bytes; installed mode импортирует exact
entry file URL, сохраняя относительные compiled chunks и module cache immutable
артефакта. Проверку принадлежности и bytes installed mapping выполняет storage
owner до передачи adapter. Missing entry отклоняется без source fallback.
Проверки обоих режимов: [load](./load.spec.ts).
*/
export const loadMeta = async (address: string, resolver?: MetaSourceResolver): Promise<MetaDSL> => {
  const selected = resolver ?? defaultMetaSourceResolver()
  const sourcePath = resolveMetaPath(address, selected)
  try {
    if (selected.installed) {
      const module = await import(pathToFileURL(sourcePath).href)
      return (module.default ?? module) as MetaDSL
    }
    return await evaluateMetaSource(await readFile(sourcePath, "utf8"))
  } catch (error) {
    throw new Error(`Не удалось загрузить DSL: ${sourcePath} — ${errorMessage(error)}`)
  }
}
