import type { MetaAST } from "@metafor/ast"

export function normalizeSchemaAddress(schemaPath: string): string {
  const trimmed = schemaPath.trim().replace(/\/+$/, "")
  if (!trimmed) return "/"
  if (trimmed.endsWith("/meta.json")) return normalizeSchemaAddress(trimmed.slice(0, -"/meta.json".length))
  return trimmed
}

export function resolveMetaSource(metaPath: string): string {
  const trimmed = metaPath.trim().replace(/\/+$/, "")
  if (trimmed.endsWith(".json")) return trimmed
  const metaAddress = normalizeSchemaAddress(trimmed || "/")
  return metaAddress === "/"
    ? "/meta.json"
    : metaAddress.startsWith("/") || metaAddress.startsWith(".")
      ? `${metaAddress}/meta.json`
      : `/${metaAddress}/meta.json`
}

/**
 * Загружает MetaAST из файла.
 *
 * Не делает orchestration пакета Dark и не мутирует store.
 *
 * @returns `ast` или `undefined` при ошибке загрузки
 */
export async function loadMetaAST(metaPath: string): Promise<MetaAST | undefined> {
  const sourcePath = resolveMetaSource(metaPath)
  try {
    const response = await fetch(sourcePath)
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return (await response.json()) as MetaAST
  } catch (error) {
    console.error(error)
    return undefined
  }
}
