import type { MetaAST, FieldsAST } from "@metafor/ast"
import type { NodeMeta, NodeType } from "@metafor/dsl"
import type { DarkParticle } from "@dark/types"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/part"

import { dark$ } from "../store.ts"

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

const getFieldName = (path: string): string => {
  if (path.startsWith("/value/")) return path.slice("/value/".length)
  return path.split("/").at(-1) ?? path
}

const isEnumBoundMetaSrc = (node: NodeMeta, fields?: FieldsAST): boolean => {
  if (typeof node.src !== "object") return false

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  return paths.length === 1 && getFieldType(paths[0]!, fields)?.startsWith("enum") === true
}

const createContinuationSrc = (node: NodeMeta): string => {
  if (typeof node.src !== "object") return node.src

  const paths = Array.isArray(node.src.data) ? node.src.data : [node.src.data]
  const fieldName = getFieldName(paths[0]!)

  return "expr" in node.src ? node.src.expr.replaceAll("_[0]", fieldName) : `\${${fieldName}}`
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

      return {
        particle: new Fuzzy({
          basis: node.src.data,
          ...("expr" in node.src ? { expr: node.src.expr } : {}),
        }),
        parent,
        meta: {},
      }
    case "cond":
      return {
        particle: new Fuzzy({
          basis: node.data,
          ...("expr" in node && node.expr !== undefined ? { expr: node.expr } : {}),
        }),
        parent,
        meta: {},
      }
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

const createContinuationBuild = (node: NodeMeta, parent: Fuzzy): ParticleBuild => ({
  particle: new Wimp({
    src: createContinuationSrc(node),
    ...(node.fields !== undefined ? { fields: node.fields } : {}),
    ...(node.mass !== undefined ? { mass: node.mass } : {}),
  }),
  parent,
  meta: {},
})

export function* particleGenerator(
  root: Wimp,
  nodes: Iterable<NodeType>,
  fields?: FieldsAST,
): Generator<ParticleBuild[]> {
  let level = Array.from(nodes, (node): LayerEntry => ({ node, parent: root }))

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
          nextLevel.push(createContinuationBuild(item.node, build.particle))
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

const storeParticle = (particle: DarkParticle, parent?: DarkParticle): void => {
  dark$.particles.set(particle.id, particle)

  if (parent) {
    dark$.parent.set(particle, parent)
    parent.children.add(particle.id)
  }

  if (particle instanceof Wimp) dark$.meta.set(particle.id, particle.src)
}

export const matterPipeline = (root: Wimp, ast: Pick<MetaAST, "matter" | "fields">): void => {
  storeParticle(root)

  if (!ast.matter) return

  for (const layer of particleGenerator(root, ast.matter, ast.fields)) {
    for (const build of layer) storeParticle(build.particle, build.parent)
  }
}
