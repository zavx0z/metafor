import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { DarkParticle } from "@dark/types"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"

export interface ParticleBuild {
  particle: DarkParticle
  parent: DarkParticle
  meta: Record<string, never>
}

type LayerEntry = LayerNode | ParticleBuild

type LayerNode = {
  node: NodeType
  parent: DarkParticle
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

const createParticleBuild = (node: NodeType, parent: DarkParticle, fields?: FieldsAST): ParticleBuild | undefined => {
  switch (node.type) {
    case "meta":
      if (typeof node.src === "string") {
        return {
          particle: new Wimp({
            src: node.src,
            ...(node.fields !== undefined ? { fields: node.fields } : {}),
            ...(node.mass !== undefined ? { mass: node.mass } : {}),
          }),
          parent,
          meta: {},
        }
      }

      if (!isEnumBoundMetaSrc(node, fields)) {
        throw new Error("Dynamic meta src must be bound to a single enum field")
      }

      return { particle: new Fuzzy(), parent, meta: {} }
    case "cond":
      return { particle: new Fuzzy(), parent, meta: {} }
    case "log":
      return {
        particle: new Axion({
          basis: node.data,
          ...("expr" in node && node.expr !== undefined ? { expr: node.expr } : {}),
        }),
        parent,
        meta: {},
      }
    case "map":
      return {
        particle: new Macho({
          basis: node.data,
        }),
        parent,
        meta: {},
      }
    default:
      return
  }
}

const createContinuationBuilds = (node: NodeMeta, parent: Fuzzy, fields?: FieldsAST): ParticleBuild[] => {
  if (typeof node.src !== "object") return []

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  const values = getFieldValues(paths[0]!, fields)
  const wimps: Wimp[] = []

  for (const value of values) {
    wimps.push(
      new Wimp({
        src: createContinuationSrc(node, value),
        ...(node.fields !== undefined ? { fields: node.fields } : {}),
        ...(node.mass !== undefined ? { mass: node.mass } : {}),
      }),
    )
  }

  return wimps.map((particle) => ({
    particle,
    parent,
    meta: {},
  }))
}

export function* particleGenerator(
  wimp: Wimp,
  nodes: Iterable<NodeType>,
  fields?: FieldsAST,
): Generator<ParticleBuild[]> {
  let level = Array.from(nodes, (node): LayerEntry => ({ node, parent: wimp }))

  while (level.length > 0) {
    const builds: ParticleBuild[] = []
    const nextLevel: LayerEntry[] = []

    for (const item of level) {
      if ("particle" in item) {
        builds.push(item)
        continue
      }

      const build = createParticleBuild(item.node, item.parent, fields)
      const parent = build?.particle ?? item.parent

      if (build) {
        builds.push(build)

        if (item.node.type === "meta" && typeof item.node.src === "object" && build.particle instanceof Fuzzy) {
          nextLevel.push(...createContinuationBuilds(item.node, build.particle, fields))
        }
      }

      if ("child" in item.node && Array.isArray(item.node.child)) {
        nextLevel.push(...item.node.child.map((node): LayerNode => ({ node, parent })))
      }
    }

    if (builds.length > 0) yield builds

    level = nextLevel
  }
}
