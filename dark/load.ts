import type { MetaAST } from "@metafor/ast"

export function normalizeSchemaAddress(schemaPath: string): string {
  const trimmed = schemaPath.trim().replace(/\/+$/, "")

  if (!trimmed) {
    return "/"
  }

  if (trimmed.endsWith("/meta.json")) {
    return normalizeSchemaAddress(trimmed.slice(0, -"/meta.json".length))
  }

  return trimmed
}

export function resolveMetaSource(metaPath: string): { metaAddress: string; sourcePath: string } {
  const trimmed = metaPath.trim().replace(/\/+$/, "")

  if (trimmed.endsWith(".json")) {
    return {
      metaAddress: normalizeSchemaAddress(trimmed),
      sourcePath: trimmed,
    }
  }

  const metaAddress = normalizeSchemaAddress(trimmed || "/")
  const sourcePath =
    metaAddress === "/"
      ? "/meta.json"
      : metaAddress.startsWith("/") || metaAddress.startsWith(".")
        ? `${metaAddress}/meta.json`
        : `/${metaAddress}/meta.json`

  return { metaAddress, sourcePath }
}

/**
 * Loader одного schema entry.
 *
 * Не делает orchestration пакета Dark и не мутирует store.
 */
export async function loadMetaAST(metaPath: string): Promise<MetaAST | undefined> {
  const { sourcePath } = resolveMetaSource(metaPath)

  try {
    const response = await fetch(sourcePath)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return (await response.json()) as MetaAST
  } catch (error) {
    console.error(error)
    return undefined
  }
}

export async function loadMetaEntry(metaPath: string): Promise<{ metaAddress: string; ast: MetaAST }> {
  const { metaAddress } = resolveMetaSource(metaPath)
  const ast = await loadMetaAST(metaPath)

  if (!ast) {
    throw new Error(`Unable to load dark schema from "${metaPath}"`)
  }

  return { metaAddress, ast }
}
