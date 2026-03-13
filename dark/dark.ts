import { loadMetaAST } from "./load"
import { dark$ } from "./store"
import { createChildren } from "./gravity/gravity"
import type { NodeType } from "@metafor/template"
import type { Address } from "./dark.t"
import { generateUUID, type UUID } from "./identifier"
import { gravity$, materializeDarkAtoms } from "./gravity"

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
  const ensureMetaLoaded = async (metaAddress: Address): Promise<Address> => {
    const existing = dark$.getMeta(metaAddress)
    if (existing) return metaAddress

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    dark$.setMeta(metaAddress, ast)
    return metaAddress
  }

  const ast = await loadMetaAST(address)
  if (!ast) throw new Error(`Не удалось загрузить meta: ${address}`)
  dark$.setMeta(address, ast)

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
