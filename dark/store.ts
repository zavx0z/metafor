/**
 * Source-of-truth домена Dark.
 *
 * Хранит графовую структуру AST в виде плоского связанного представления и
 * предоставляет API для навигации по узлам через path/address lookup.
 *
 * Инициализация через `dark$.restore()` в `dark/gravity`, проекции через
 * `dark/em` для Boundary и Bulk.
 *
 * @property linkedFlat {@link DarkStore.linkedFlat | linkedFlat} — плоский список узлов для итерации
 * @property reset {@link DarkStore.reset | reset} — сброс к пустому AST
 * @property restore {@link DarkStore.restore | restore} — загрузка нового состояния
 * @property getNode {@link DarkStore.getNode | getNode} — получение узла по адресу или пути
 * @property getChildren {@link DarkStore.getChildren | getChildren} — получение дочерних узлов
 * @property lookup {@link DarkStore.lookup | lookup} — поиск узлов по префиксу пути
 *
 * @see {@link DarkStore} — контракт состояния
 * @see {@link DarkGraphNode} — узел графа
 */

import type { MetaAST } from "@metafor/ast"
import type {
  DarkGraphLookup,
  DarkGraphNode,
  DarkGraphNodeKind,
  DarkGraphPath,
  DarkGraphSection,
  DarkStore,
  DarkStoreInput,
  DarkStoreSnapshot,
} from "./store.t.ts"

const EMPTY_AST: MetaAST = {
  name: "",
  fields: {},
  superposition: {},
}

const TOP_LEVEL_SECTIONS = new Set<DarkGraphSection>([
  "name",
  "fields",
  "superposition",
  "processes",
  "reactions",
  "bulk",
  "mass",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

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

function getSection(path: DarkGraphPath): DarkGraphSection {
  const head = path[0]
  if (head && TOP_LEVEL_SECTIONS.has(head as DarkGraphSection)) {
    return head as DarkGraphSection
  }

  return "root"
}

function classifyNode(value: unknown): DarkGraphNodeKind {
  if (Array.isArray(value)) {
    return "array"
  }

  if (isRecord(value)) {
    return "object"
  }

  return "value"
}

function resolveLookupPath(target: DarkGraphLookup): DarkGraphPath {
  if (typeof target !== "string") {
    return [...target]
  }

  const parsedAddress = parseDarkAddress(target)
  if (parsedAddress) {
    return parsedAddress.path
  }

  return parseDarkPath(target)
}

function appendNode(
  nodes: DarkGraphNode[],
  byAddress: Map<string, DarkGraphNode>,
  schemaPath: string,
  key: string,
  path: DarkGraphPath,
  parentAddress: string | null,
  value: unknown,
  kind: DarkGraphNodeKind,
): DarkGraphNode {
  const address = createDarkAddress(schemaPath, path)
  const node: DarkGraphNode = {
    kind,
    section: getSection(path),
    key,
    address,
    path: [...path],
    parentAddress,
    childAddresses: [],
    value,
  }

  nodes.push(node)
  byAddress.set(address, node)

  if (parentAddress) {
    byAddress.get(parentAddress)?.childAddresses.push(address)
  }

  return node
}

function visitChildren(
  nodes: DarkGraphNode[],
  byAddress: Map<string, DarkGraphNode>,
  schemaPath: string,
  parent: DarkGraphNode,
  value: unknown,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const childPath = createDarkPath(parent.path, index)
      const child = appendNode(
        nodes,
        byAddress,
        schemaPath,
        String(index),
        childPath,
        parent.address,
        entry,
        classifyNode(entry),
      )

      if (Array.isArray(entry) || isRecord(entry)) {
        visitChildren(nodes, byAddress, schemaPath, child, entry)
      }
    })

    return
  }

  if (!isRecord(value)) {
    return
  }

  for (const [key, entry] of Object.entries(value)) {
    const childPath = createDarkPath(parent.path, key)
    const child = appendNode(
      nodes,
      byAddress,
      schemaPath,
      key,
      childPath,
      parent.address,
      entry,
      classifyNode(entry),
    )

    if (Array.isArray(entry) || isRecord(entry)) {
      visitChildren(nodes, byAddress, schemaPath, child, entry)
    }
  }
}

function getTopLevelEntries(ast: MetaAST): Array<[string, unknown]> {
  const orderedKeys = ["name", "fields", "superposition", "processes", "reactions", "bulk", "mass"] as const
  const entries: Array<[string, unknown]> = []
  const seen = new Set<string>()

  for (const key of orderedKeys) {
    if (key in ast) {
      entries.push([key, ast[key]])
      seen.add(key)
    }
  }

  for (const [key, value] of Object.entries(ast)) {
    if (seen.has(key)) {
      continue
    }

    entries.push([key, value])
  }

  return entries
}

export function createDarkPath(...segments: Array<string | number | readonly (string | number)[]>): DarkGraphPath {
  const path: string[] = []

  for (const segment of segments) {
    if (Array.isArray(segment)) {
      for (const nestedSegment of segment) {
        const value = String(nestedSegment)
        if (value) {
          path.push(value)
        }
      }
      continue
    }

    const value = String(segment)
    if (value) {
      path.push(value)
    }
  }

  return path
}

export function formatDarkPath(path: DarkGraphPath): string {
  if (path.length === 0) {
    return "/"
  }

  return `/${path.map((segment) => encodeURIComponent(segment)).join("/")}`
}

export function parseDarkPath(path: string): DarkGraphPath {
  if (!path || path === "/") {
    return []
  }

  const normalizedPath = path.startsWith("/") ? path.slice(1) : path

  if (!normalizedPath) {
    return []
  }

  return normalizedPath.split("/").filter(Boolean).map(decodeURIComponent)
}

export function createDarkAddress(schemaPath: string, path: DarkGraphPath): string {
  return `${normalizeSchemaPath(schemaPath)}#${formatDarkPath(path)}`
}

export function parseDarkAddress(address: string): { schemaPath: string; path: DarkGraphPath } | undefined {
  const hashIndex = address.indexOf("#")
  if (hashIndex === -1) {
    return undefined
  }

  const schemaPath = normalizeSchemaPath(address.slice(0, hashIndex) || "/")
  const path = parseDarkPath(address.slice(hashIndex + 1) || "/")

  return { schemaPath, path }
}

export function buildDarkStoreSnapshot(input: DarkStoreInput): DarkStoreSnapshot {
  const schemaPath = normalizeSchemaPath(input.schemaPath)
  const nodes: DarkGraphNode[] = []
  const byAddress = new Map<string, DarkGraphNode>()

  const root = appendNode(nodes, byAddress, schemaPath, "root", [], null, input.ast, "root")

  for (const [key, value] of getTopLevelEntries(input.ast)) {
    const path = createDarkPath(key)
    const section = appendNode(nodes, byAddress, schemaPath, key, path, root.address, value, "section")

    if (Array.isArray(value) || isRecord(value)) {
      visitChildren(nodes, byAddress, schemaPath, section, value)
    }
  }

  return {
    schemaPath,
    ast: input.ast,
    sourcePath: input.sourcePath,
    nodes,
  }
}

/**
 * Синглтон store домена Dark.
 *
 * Инициализируется через `restore()`, используется как source-of-truth для
 * проекций в Boundary и Bulk.
 */
export const dark$: DarkStore = {
  schemaPath: "/",
  ast: EMPTY_AST,
  sourcePath: undefined,
  nodes: [],
  linkedFlat: [],

  reset() {
    dark$.restore({
      schemaPath: dark$.schemaPath,
      ast: EMPTY_AST,
      sourcePath: dark$.sourcePath,
    })
  },

  restore(nextState: DarkStoreInput | DarkStoreSnapshot) {
    const snapshot = "nodes" in nextState
      ? {
          schemaPath: normalizeSchemaPath(nextState.schemaPath),
          ast: nextState.ast,
          sourcePath: nextState.sourcePath,
          nodes: nextState.nodes,
        }
      : buildDarkStoreSnapshot(nextState)

    dark$.schemaPath = snapshot.schemaPath
    dark$.ast = snapshot.ast
    dark$.sourcePath = snapshot.sourcePath
    dark$.nodes = snapshot.nodes
    dark$.linkedFlat = snapshot.nodes
  },

  getNode(target: DarkGraphLookup): DarkGraphNode | undefined {
    const path = resolveLookupPath(target)
    const address = createDarkAddress(dark$.schemaPath, path)
    return dark$.nodes.find((node) => node.address === address)
  },

  getChildren(target: DarkGraphLookup): DarkGraphNode[] {
    const node = dark$.getNode(target)
    if (!node) {
      return []
    }

    return node.childAddresses
      .map((address) => dark$.nodes.find((n) => n.address === address))
      .filter((node): node is DarkGraphNode => Boolean(node))
  },

  lookup(target: DarkGraphLookup): DarkGraphNode[] {
    const path = resolveLookupPath(target)

    if (path.length === 0) {
      return [...dark$.nodes]
    }

    return dark$.nodes.filter((node) =>
      path.every((segment, index) => node.path[index] === segment)
    )
  },
}
