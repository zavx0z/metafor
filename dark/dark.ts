import type { MetaAST } from "@metafor/ast"
import { dark$ } from "./store"

function normalizeSchemaPath(schemaPath: string): string {
  const trimmed = schemaPath.trim()
  if (!trimmed) {
    return "/"
  }

  if (trimmed === "/") {
    return trimmed
  }

  return trimmed.replace(/\/+$/, "") || "/"
}

/**
 * Загружает граф Dark из meta.json.
 *
 * @param metaPath — путь к файлу или директории с meta.json
 *
 * @example
 * ```typescript
 * await load("/path/to/meta.json")
 * await load("/path/to/schema") // загрузит /path/to/schema/meta.json
 * ```
 */
export async function load(metaPath: string): Promise<void> {
  const trimmedPath = metaPath.trim().replace(/\/+$/, "")
  const { schemaPath, sourcePath } = trimmedPath.endsWith(".json")
    ? {
        schemaPath: trimmedPath.lastIndexOf("/") === -1 ? "." : trimmedPath.slice(0, trimmedPath.lastIndexOf("/")) || "/",
        sourcePath: trimmedPath,
      }
    : {
        schemaPath: trimmedPath || "/",
        sourcePath: `${trimmedPath || "."}/meta.json`,
      }

  const response = await fetch(sourcePath)

  if (!response.ok)
    throw new Error(`Unable to load dark graph source from "${sourcePath}" (${response.status} ${response.statusText})`)

  const ast = (await response.json()) as MetaAST
  dark$.meta.set(normalizeSchemaPath(schemaPath), ast)
}
