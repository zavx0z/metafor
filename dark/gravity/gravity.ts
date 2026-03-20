import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { DarkParticle } from "@dark/types"

export type SeedParent = DarkParticle | ParticleSeed
type MetaNode = Extract<NodeType, { type: "meta" }>
type ConditionNode = Extract<NodeType, { type: "cond" }>
type LogicalNode = Extract<NodeType, { type: "log" }>
type MapNode = Extract<NodeType, { type: "map" }>

interface SeedBase {
  kind: "wimp" | "fuzzy" | "axion" | "macho"
  parent: SeedParent
  meta: Record<string, never>
}

export interface WimpSeed extends SeedBase {
  kind: "wimp"
  src: string
  node: MetaNode
}

export interface FuzzySeed extends SeedBase {
  kind: "fuzzy"
  node: MetaNode | ConditionNode
}

export interface AxionSeed extends SeedBase {
  kind: "axion"
  node: LogicalNode
}

export interface MachoSeed extends SeedBase {
  kind: "macho"
  node: MapNode
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
          node,
          parent,
          meta: {},
        }
      }

      if (!isEnumBoundMetaSrc(node, fields)) {
        throw new Error("Dynamic meta src must be bound to a single enum field")
      }

      return { kind: "fuzzy", node, parent, meta: {} }
    case "cond":
      return { kind: "fuzzy", node, parent, meta: {} }
    case "log":
      return {
        kind: "axion",
        node,
        parent,
        meta: {},
      }
    case "map":
      return {
        kind: "macho",
        node,
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
    node,
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
      if ("kind" in item) {
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
