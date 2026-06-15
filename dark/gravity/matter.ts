import {
  normalizeMatterBindingPath,
  normalizeMatterBindingValue,
  type MatterRelationBindingValue,
  type MatterRelationChild,
  type MatterRelationParticle,
} from "@boundary/wimp/sqlite"
import type { MatterParticlePlan } from "../types/dark.ts"
import type { MetaDSL, NodeType } from "../../index.ts"

const createContinuationSrc = (expr: string | undefined, value: string | number): string => {
  if (!expr) return String(value)

  const escaped = expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${escaped}\``)([value]))
}

const resolveMetaBranchSrcs = (meta: MetaDSL, node: { src: string | { data?: string | string[]; expr?: string } }): string[] => {
  if (typeof node.src === "string") return [node.src]

  const source = node.src
  const paths = source.data !== undefined ? (Array.isArray(source.data) ? source.data : [source.data]).map(normalizeMatterBindingPath) : []
  const firstKey = paths[0]
  if (!firstKey) return []

  const field = meta.fields?.find((field) => field.key === firstKey)
  if (!field || field.type !== "enum") return []

  return (field.values ?? []).map((variant) => createContinuationSrc(source.expr, variant))
}

const binding = (data: string | string[], expr: string | undefined): MatterRelationBindingValue =>
  normalizeMatterBindingValue(expr !== undefined ? {data, expr} : {data})

const childRelations = (meta: MetaDSL, children: NodeType[] | undefined): MatterRelationChild[] | undefined => {
  if (!Array.isArray(children) || children.length === 0) return

  const relations = children.flatMap((child) => projectTemplateMatterNode(meta, child))
  return relations.length > 0
    ? relations.map((particle): MatterRelationChild => ({ edgeSlot: "child", particle }))
    : undefined
}

const projectTemplateMatterNode = (meta: MetaDSL, node: NodeType): MatterRelationParticle[] => {
  if (node.type === "meta") {
    const metaNode = node as {
      src: string | { data?: string | string[]; expr?: string }
      fields?: MatterRelationBindingValue
      mass?: MatterRelationBindingValue
      child?: NodeType[]
    }
    const children = childRelations(meta, metaNode.child)
    const fieldsBinding = metaNode.fields !== undefined ? normalizeMatterBindingValue(metaNode.fields) : undefined
    const massBinding = metaNode.mass !== undefined ? normalizeMatterBindingValue(metaNode.mass) : undefined

    if (typeof metaNode.src === "string") {
      return [
        {
          kind: "wimp",
          src: metaNode.src,
          ...(fieldsBinding !== undefined ? { fieldsBinding } : {}),
          ...(massBinding !== undefined ? { massBinding } : {}),
          ...(children !== undefined ? { children } : {}),
        },
      ]
    }

    return [
      {
        kind: "fuzzy",
        fuzzyKind: "dynamic-meta",
        children: resolveMetaBranchSrcs(meta, metaNode).map((src): MatterRelationChild => ({
          edgeSlot: "branch",
          particle: {
            kind: "wimp",
            src,
            ...(fieldsBinding !== undefined ? { fieldsBinding } : {}),
            ...(massBinding !== undefined ? { massBinding } : {}),
            ...(children !== undefined ? { children } : {}),
          },
        })),
      },
    ]
  }

  if (node.type === "cond") {
    const conditionNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const thenParticle = conditionNode.child?.[0] ? projectTemplateMatterNode(meta, conditionNode.child[0])[0] : undefined
    const elseParticle = conditionNode.child?.[1] ? projectTemplateMatterNode(meta, conditionNode.child[1])[0] : undefined
    const children: MatterRelationChild[] = []
    if (thenParticle) children.push({ edgeSlot: "then", particle: thenParticle })
    if (elseParticle) children.push({ edgeSlot: "else", particle: elseParticle })

    return [
      {
        kind: "fuzzy",
        fuzzyKind: "cond",
        predicateBinding: binding(conditionNode.data, conditionNode.expr),
        ...(children.length > 0 ? { children } : {}),
      },
    ]
  }

  if (node.type === "log") {
    const logicalNode = node as { data: string | string[]; expr?: string; child?: NodeType[] }
    const children = childRelations(meta, logicalNode.child)
    return [
      {
        kind: "axion",
        predicateBinding: binding(logicalNode.data, logicalNode.expr),
        ...(children !== undefined ? { children } : {}),
      },
    ]
  }

  if (node.type === "map") {
    const mapNode = node as { data: string; child?: NodeType[] }
    const children = childRelations(meta, mapNode.child)
    return [
      {
        kind: "macho",
        collectionBinding: normalizeMatterBindingValue({ data: mapNode.data }),
        ...(children !== undefined ? { children } : {}),
      },
    ]
  }

  return []
}

export const projectTemplateMatterRelations = (meta: MetaDSL): MatterRelationParticle[] =>
  (meta.matter ?? []).flatMap((node) => projectTemplateMatterNode(meta, node))

const projectBoundaryMatterParticle = (particle: MatterRelationParticle): MatterParticlePlan => {
  const children =
    particle.children !== undefined && particle.children.length > 0
      ? particle.children.map((child) => ({
          edgeSlot: child.edgeSlot,
          particle: projectBoundaryMatterParticle(child.particle),
        }))
      : undefined

  switch (particle.kind) {
    case "wimp":
      return {
        kind: "wimp",
        src: particle.src,
        ...(particle.fieldsBinding !== undefined ? { fieldsBinding: particle.fieldsBinding } : {}),
        ...(particle.massBinding !== undefined ? { massBinding: particle.massBinding } : {}),
        ...(children !== undefined ? { children } : {}),
      }
    case "fuzzy":
      return {
        kind: "fuzzy",
        fuzzyKind: particle.fuzzyKind,
        ...(particle.predicateBinding !== undefined ? { predicateBinding: particle.predicateBinding } : {}),
        ...(children !== undefined ? { children } : {}),
      }
    case "axion":
      return {
        kind: "axion",
        predicateBinding: particle.predicateBinding,
        ...(children !== undefined ? { children } : {}),
      }
    case "macho":
      return {
        kind: "macho",
        collectionBinding: particle.collectionBinding,
        ...(children !== undefined ? { children } : {}),
      }
  }
}

export const projectBoundaryMatterParticles = (particles: MatterRelationParticle[]): MatterParticlePlan[] =>
  particles.map(projectBoundaryMatterParticle)
