import type { MetaAST } from "@metafor/ast"
import { dark$ } from "./store"
import { buildDarkStoreSnapshot } from "./store"

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
  const snapshot = buildDarkStoreSnapshot({ schemaPath, sourcePath, ast })

  dark$.schemaPath = snapshot.schemaPath
  dark$.sourcePath = snapshot.sourcePath
  dark$.ast = snapshot.ast
  dark$.nodes = snapshot.nodes
  dark$.linkedFlat = snapshot.nodes
}
