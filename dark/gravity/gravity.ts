import type { FieldsAST } from "@metafor/ast"
import type { Mass, NodeMeta, NodeType } from "@metafor/dsl"
import type { DarkParticle } from "@dark/types"

export type SeedParent = DarkParticle | ParticleSeed

interface SeedBase {
  kind: "wimp" | "fuzzy" | "axion" | "macho"
  parent: SeedParent
  meta: Record<string, never>
}

export interface WimpSeed extends SeedBase {
  kind: "wimp"
  src: string
  fields?: NodeMeta["fields"]
  mass?: Mass | NodeMeta["mass"]
}

export interface FuzzySeed extends SeedBase {
  kind: "fuzzy"
}

export interface AxionSeed extends SeedBase {
  kind: "axion"
  basis?: string | string[]
  expr?: string
}

export interface MachoSeed extends SeedBase {
  kind: "macho"
  basis: string
}

export type ParticleSeed = WimpSeed | FuzzySeed | AxionSeed | MachoSeed

type LayerEntry = LayerNode | ParticleSeed

type LayerNode = {
  node: NodeType
  parent: SeedParent
}

const getFieldType = (path: string, fields?: FieldsAST): string | undefined => {
  if (!fields || !path.startsWith("/value/")) return

  return fields[path.slice("/value/".length)]?.type
}

const getFieldValues = (path: string, fields?: FieldsAST): Array<string | number> => {
  if (!fields || !path.startsWith("/value/")) return []

  return fields[path.slice("/value/".length)]?.values ?? []
}

const isEnumBoundMetaSrc = (node: NodeMeta, fields?: FieldsAST): boolean => {
  if (typeof node.src !== "object") return false

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  return paths.length === 1 && getFieldType(paths[0]!, fields)?.startsWith("enum") === true
}

const createContinuationSrc = (node: NodeMeta, value: string | number): string => {
  if (typeof node.src !== "object") return node.src

  if (!("expr" in node.src) || node.src.expr === undefined) return String(value)

  const expr = node.src.expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${expr}\``)([value]))
}

const createParticleSeed = (node: NodeType, parent: SeedParent, fields?: FieldsAST): ParticleSeed | undefined => {
  switch (node.type) {
    case "meta":
      if (typeof node.src === "string") {
        return {
          kind: "wimp",
          src: node.src,
          ...(node.fields !== undefined ? { fields: node.fields } : {}),
          ...(node.mass !== undefined ? { mass: node.mass } : {}),
          parent,
          meta: {},
        }
      }

      if (!isEnumBoundMetaSrc(node, fields)) {
        throw new Error("Dynamic meta src must be bound to a single enum field")
      }

      return { kind: "fuzzy", parent, meta: {} }
    case "cond":
      return { kind: "fuzzy", parent, meta: {} }
    case "log":
      return {
        kind: "axion",
        basis: node.data,
        ...("expr" in node && node.expr !== undefined ? { expr: node.expr } : {}),
        parent,
        meta: {},
      }
    case "map":
      return {
        kind: "macho",
        basis: node.data,
        parent,
        meta: {},
      }
    default:
      return
  }
}

const createContinuationSeeds = (node: NodeMeta, parent: FuzzySeed, fields?: FieldsAST): WimpSeed[] => {
  if (typeof node.src !== "object") return []

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  const values = getFieldValues(paths[0]!, fields)

  return values.map((value) => ({
    kind: "wimp",
    src: createContinuationSrc(node, value),
    ...(node.fields !== undefined ? { fields: node.fields } : {}),
    ...(node.mass !== undefined ? { mass: node.mass } : {}),
    parent,
    meta: {},
  }))
}

export function* particleGenerator(
  root: DarkParticle,
  nodes: Iterable<NodeType>,
  fields?: FieldsAST,
): Generator<ParticleSeed[]> {
  let level = Array.from(nodes, (node): LayerEntry => ({ node, parent: root }))

  while (level.length > 0) {
    const seeds: ParticleSeed[] = []
    const nextLevel: LayerEntry[] = []

    for (const item of level) {
      if (!("node" in item)) {
        seeds.push(item)
        continue
      }

      const seed = createParticleSeed(item.node, item.parent, fields)
      const parent = seed ?? item.parent

      if (seed) {
        seeds.push(seed)

        if (item.node.type === "meta" && typeof item.node.src === "object" && seed.kind === "fuzzy") {
          nextLevel.push(...createContinuationSeeds(item.node, seed, fields))
        }
      }

      if ("child" in item.node && Array.isArray(item.node.child)) {
        nextLevel.push(...item.node.child.map((node): LayerNode => ({ node, parent })))
      }
    }

    if (seeds.length > 0) yield seeds

    level = nextLevel
  }
}
