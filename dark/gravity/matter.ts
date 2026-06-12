import type { MetaDSL, NodeType } from "../../index.ts"
import type {
  EdgeSlot,
  MatterRelationBindingValue,
  MatterRelationChild,
  MatterRelationParticle,
} from "../../store/wimp/sqlite/matter.t.ts"
import type { MatterParticlePlan } from "../types/dark.ts"
import { MatterChildren, type Matter, type MatterParticle, type Wimp } from "@store/wimp/sqlite"
import {createProtocolChannel} from "../../protocol.ts"

const protocol = createProtocolChannel()

const createContinuationSrc = (expr: string | undefined, value: string | number): string => {
  if (!expr) return String(value)

  const escaped = expr.replaceAll("\\", "\\\\").replaceAll("`", "\\`")
  return String(new Function("_", `return \`${escaped}\``)([value]))
}

const resolveMetaBranchSrcs = (meta: MetaDSL, node: { src: string | { data?: string | string[]; expr?: string } }): string[] => {
  if (typeof node.src === "string") return [node.src]

  const source = node.src
  const paths = source.data !== undefined ? (Array.isArray(source.data) ? source.data : [source.data]) : []
  const firstPath = paths[0]
  if (!firstPath || !firstPath.startsWith("/value/")) return []

  const field = meta.fields?.[firstPath.slice("/value/".length)]
  if (!field || field.type !== "enum") return []

  return (field.values ?? []).map((variant) => createContinuationSrc(source.expr, variant))
}

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

    if (typeof metaNode.src === "string") {
      return [
        {
          kind: "wimp",
          src: metaNode.src,
          ...(metaNode.fields !== undefined ? { fieldsBinding: metaNode.fields } : {}),
          ...(metaNode.mass !== undefined ? { massBinding: metaNode.mass } : {}),
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
            ...(metaNode.fields !== undefined ? { fieldsBinding: metaNode.fields } : {}),
            ...(metaNode.mass !== undefined ? { massBinding: metaNode.mass } : {}),
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
        predicateBinding: conditionNode.expr !== undefined ? { data: conditionNode.data, expr: conditionNode.expr } : { data: conditionNode.data },
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
        predicateBinding: logicalNode.expr !== undefined ? { data: logicalNode.data, expr: logicalNode.expr } : { data: logicalNode.data },
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
        collectionBinding: { data: mapNode.data },
        ...(children !== undefined ? { children } : {}),
      },
    ]
  }

  return []
}

export const projectTemplateMatterRelations = (meta: MetaDSL): MatterRelationParticle[] =>
  (meta.matter ?? []).flatMap((node) => projectTemplateMatterNode(meta, node))

export const projectStoreMatterParticles = (particles: MatterRelationParticle[]): MatterParticlePlan[] =>
  particles.map((particle): MatterParticlePlan => {
    const children =
      particle.children !== undefined && particle.children.length > 0
        ? projectStoreMatterParticles(particle.children.map((child) => child.particle))
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
  })

async function insertParticleRecursive(
  collection: Matter | MatterChildren,
  particle: MatterRelationParticle,
  edgeSlot?: EdgeSlot,
): Promise<void> {
  let inserted: MatterParticle

  if (particle.kind === "wimp") {
    if (collection instanceof MatterChildren) {
      const slot = (edgeSlot ?? "child") as "child" | "branch"
      inserted = await collection.wimp({
        edgeSlot: slot,
        src: particle.src,
        ...(particle.fieldsBinding !== undefined ? { fieldsBinding: particle.fieldsBinding } : {}),
        ...(particle.massBinding !== undefined ? { massBinding: particle.massBinding } : {}),
      })
    } else {
      inserted = await collection.wimp({
        src: particle.src,
        ...(particle.fieldsBinding !== undefined ? { fieldsBinding: particle.fieldsBinding } : {}),
        ...(particle.massBinding !== undefined ? { massBinding: particle.massBinding } : {}),
      })
    }
  } else if (particle.kind === "fuzzy") {
    if (collection instanceof MatterChildren) {
      const slot = (edgeSlot ?? "child") as "child" | "then" | "else" | "branch"
      inserted = await collection.fuzzy({
        edgeSlot: slot,
        fuzzyKind: particle.fuzzyKind,
        ...(particle.predicateBinding !== undefined ? { predicateBinding: particle.predicateBinding } : {}),
      })
    } else {
      inserted = await collection.fuzzy({
        fuzzyKind: particle.fuzzyKind,
        ...(particle.predicateBinding !== undefined ? { predicateBinding: particle.predicateBinding } : {}),
      })
    }
  } else if (particle.kind === "axion") {
    if (collection instanceof MatterChildren) {
      const slot = (edgeSlot ?? "child") as "child" | "then" | "else" | "branch"
      inserted = await collection.axion({ edgeSlot: slot, predicateBinding: particle.predicateBinding })
    } else {
      inserted = await collection.axion({ predicateBinding: particle.predicateBinding })
    }
  } else {
    if (collection instanceof MatterChildren) {
      const slot = (edgeSlot ?? "child") as "child" | "then" | "else" | "branch"
      inserted = await collection.macho({ edgeSlot: slot, collectionBinding: particle.collectionBinding })
    } else {
      inserted = await collection.macho({ collectionBinding: particle.collectionBinding })
    }
  }

  protocol.postMessage({
    patches: [{part: "graviton", op: "add", path: inserted.uuid, value: inserted.kind}],
  })

  if (Array.isArray(particle.children)) {
    for (const child of particle.children) {
      await insertParticleRecursive(inserted.children, child.particle, child.edgeSlot)
    }
  }
}

export async function fillGravityMatter(wimp: Wimp, dsl: MetaDSL): Promise<MatterRelationParticle[]> {
  const relations = projectTemplateMatterRelations(dsl)
  for (const relation of relations) {
    await insertParticleRecursive(wimp.matter, relation)
  }
  return relations
}
