import { loadMetaAST } from "./load"
import { dark$ } from "./store"
import { createChildren, materializeDarkAtoms } from "./gravity/gravity"
import type { NodeType } from "@metafor/template"
import type { Address } from "./dark.t.js"

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

function createAssemblyChildAddress(rootAddress: string, index: number): string {
  return `${rootAddress}#atom/${index}`
}

export async function load(address: Address): Promise<void> {
  let nextAtomIndex = 0

  const ensureMetaLoaded = async (metaAddress: Address): Promise<Address> => {
    const existing = dark$.getMeta(metaAddress)
    if (existing) return metaAddress

    const ast = await loadMetaAST(metaAddress)
    if (!ast) throw new Error(`Не удалось загрузить meta: ${metaAddress}`)
    dark$.setMeta(metaAddress, ast)
    return metaAddress
  }

  const walk = async (
    parentAddress: string,
    nodes: readonly NodeType[],
    rootAddress: string,
  ): Promise<void> => {
    for (const node of nodes) {
      if (isMetaNode(node)) {
        const childMetaAddress = getMetaAddress(node)
        if (!childMetaAddress) continue

        await ensureMetaLoaded(childMetaAddress)

        const childAtom = createChildren(parentAddress, {
          address: createAssemblyChildAddress(rootAddress, ++nextAtomIndex),
          meta: childMetaAddress,
        })

        await walk(childAtom.address, getNodeChildren(node), rootAddress)
        continue
      }

      await walk(parentAddress, getNodeChildren(node), rootAddress)
    }
  }

  const ast = await loadMetaAST(address)
  if (!ast) throw new Error(`Не удалось загрузить meta: ${address}`)
  dark$.setMeta(address, ast)

  createChildren(null, {
    address,
    meta: address,
  })

  await walk(address, ast.gravity ?? [], address)

  dark$.restore({
    meta: new Map(dark$.meta),
    atom: materializeDarkAtoms(),
  })
}
