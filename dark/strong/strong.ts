import type { DarkParticle } from "@dark/types"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"
import type { FieldsAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"

export interface ParticleBuild {
  particle: DarkParticle
  meta: Record<string, never>
}

const getFieldType = (path: string, fields?: FieldsAST): string | undefined => {
  if (!fields || !path.startsWith("/value/")) return

  return fields[path.slice("/value/".length)]?.type
}

const isEnumBoundMetaSrc = (node: NodeMeta, fields?: FieldsAST): boolean => {
  if (typeof node.src !== "object") return false

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  return paths.length === 1 && getFieldType(paths[0]!, fields)?.startsWith("enum") === true
}

const toParticleBuild = (node: NodeType, fields?: FieldsAST): ParticleBuild | undefined => {
  switch (node.type) {
    case "meta":
      return {
        particle: isEnumBoundMetaSrc(node, fields)
          ? new Fuzzy()
          : new Wimp(typeof node.src === "string" ? node.src : ""),
        meta: {},
      }
    case "log":
      return {
        particle: new Axion(),
        meta: {},
      }
    case "map":
      return {
        particle: new Macho(),
        meta: {},
      }
    default:
      return
  }
}

export function* particleGenerator(nodes: Iterable<NodeType>, fields?: FieldsAST): Generator<ParticleBuild[]> {
  let level = Array.from(nodes)

  while (level.length > 0) {
    const nextLevel: NodeType[] = []
    const builds: ParticleBuild[] = []

    for (const node of level) {
      const build = toParticleBuild(node, fields)
      if (build) builds.push(build)

      if ("child" in node && Array.isArray(node.child)) nextLevel.push(...node.child)
    }

    if (builds.length > 0) yield builds

    level = nextLevel
  }
}
