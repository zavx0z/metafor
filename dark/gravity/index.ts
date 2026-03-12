/**
 * `@dark/gravity` — graph geometry, schema loading и primary addressing домена Dark.
 *
 * Здесь формируется dark-owned graph structure из `AST` и временного
 * bootstrap `meta.json`, после чего downstream-домены получают уже
 * подготовленный linked flat contract.
 */

import type { ActorAST } from "@metafor/ast"
import {
  createDarkStore,
  createDarkStoreSnapshot,
  createDarkAddress,
  createDarkPath,
  formatDarkPath,
  parseDarkAddress,
  parseDarkPath,
} from "../store"
import type { DarkStore, DarkStoreInput } from "../store.t.ts"

interface CreateDarkGraphOptions {
  schemaPath?: string
  dsl?: unknown
  sourcePath?: string
}

function resolveDarkGraphSource(metaPath: string): { schemaPath: string; sourcePath: string } {
  const trimmedPath = metaPath.trim().replace(/\/+$/, "")

  if (trimmedPath.endsWith(".json")) {
    const separatorIndex = trimmedPath.lastIndexOf("/")
    return {
      schemaPath: separatorIndex === -1 ? "." : trimmedPath.slice(0, separatorIndex) || "/",
      sourcePath: trimmedPath,
    }
  }

  return {
    schemaPath: trimmedPath || "/",
    sourcePath: `${trimmedPath || "."}/meta.json`,
  }
}

export function createDarkGraph(ast: ActorAST, options: CreateDarkGraphOptions = {}): DarkStore {
  return createDarkStore({
    ast,
    dsl: options.dsl,
    sourcePath: options.sourcePath,
    schemaPath: (options.schemaPath ?? ast.name) || "/",
  })
}

export async function loadDarkGraph(metaPath: string, options: Pick<DarkStoreInput, "dsl"> = {}): Promise<DarkStore> {
  const { schemaPath, sourcePath } = resolveDarkGraphSource(metaPath)
  const response = await fetch(sourcePath)

  if (!response.ok) {
    throw new Error(`Unable to load dark graph source from "${sourcePath}" (${response.status} ${response.statusText})`)
  }

  const ast = (await response.json()) as ActorAST

  return createDarkStore({
    schemaPath,
    sourcePath,
    dsl: options.dsl,
    ast,
  })
}

export {
  createDarkAddress,
  createDarkPath,
  createDarkStore,
  createDarkStoreSnapshot,
  formatDarkPath,
  parseDarkAddress,
  parseDarkPath,
}
export type { DarkStore, DarkStoreInput, DarkStoreSnapshot } from "../store.t.ts"
