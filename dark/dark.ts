import { loadMetaAST } from "./load"
import { dark$ } from "./store"
import { createChildren } from "./gravity/gravity"
import type { NodeType } from "@metafor/template"
import type { Address } from "./dark.t"
import { generateUUID, type UUID } from "./identifier"
import { gravity$, materializeDarkAtoms } from "./gravity"
import { compileLocalTopologyFragment } from "../metafor/dsl/topology.ts"
import type { LocalTopologyFragment, LocalTopologyMetaLike } from "../metafor/dsl/topology.t.ts"

function getNodeChildren(node: NodeType): NodeType[] {
  return "child" in node && Array.isArray(node.child) ? node.child : []
}

function isMetaNode(node: NodeType): node is Extract<NodeType, { type: "meta" }> {
  return node.type === "meta"
}

function getMetaAddress(node: NodeType): Address | null {
  if (node.type !== "meta" || !node.string) return null
  const src = node.string.src
  return typeof src === "string" ? src : null
}

export async function matter(address: Address): Promise<void> {
  const ensureMetaLoaded = async (metaAddress: Address) => {
    const existing = dark$.getMeta(metaAddress)
    if (existing) return existing

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    dark$.setMeta(metaAddress, ast)
    return ast
  }

  const ensureLocalFragment = async (metaAddress: Address): Promise<LocalTopologyFragment> => {
    const existing = dark$.topology.getFragment(metaAddress)
    if (existing) return existing

    const ast = await ensureMetaLoaded(metaAddress)
    return dark$.topology.setFragment(metaAddress, compileLocalTopologyFragment(ast as LocalTopologyMetaLike))
  }

  const assembleHiddenTopology = async (rootAddress: Address): Promise<void> => {
    const pending: Array<{ metaAddress: Address; parentPlacementId?: string; viaReferenceId?: string }> = [
      { metaAddress: rootAddress },
    ]

    while (pending.length > 0) {
      const next = pending.shift()!
      const fragment = await ensureLocalFragment(next.metaAddress)
      const ingested = dark$.topology.ingestFragment(next.metaAddress, fragment, {
        ...(next.parentPlacementId ? { parentPlacementId: next.parentPlacementId } : {}),
        ...(next.viaReferenceId ? { viaReferenceId: next.viaReferenceId } : {}),
      })

      for (const referenceId of ingested.referenceIds) {
        const reference = dark$.topology.getReference(referenceId)
        if (!reference) continue
        await ensureMetaLoaded(reference.src as Address)
        pending.push({
          metaAddress: reference.src as Address,
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }
    }
  }

  const ast = await ensureMetaLoaded(address)
  await assembleHiddenTopology(address)

  const rootAtom = createChildren(null, { uuid: generateUUID(), meta: address })

  const walk = async (parentUuid: UUID, nodes: readonly NodeType[]): Promise<void> => {
    for (const node of nodes) {
      if (isMetaNode(node)) {
        const childMetaAddress = getMetaAddress(node)
        if (!childMetaAddress) continue
        await ensureMetaLoaded(childMetaAddress)
        const childAtom = createChildren(parentUuid, { uuid: generateUUID(), meta: childMetaAddress })
        await walk(childAtom.uuid, getNodeChildren(node))
        continue
      }
      await walk(parentUuid, getNodeChildren(node))
    }
  }

  await walk(rootAtom.uuid, ast.gravity ?? [])
  dark$.atom = materializeDarkAtoms(gravity$)
}
