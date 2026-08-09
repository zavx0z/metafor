import type {
  NodeSystemNode,
} from "./model.ts"

export type NodeSystemContainmentIndex = Readonly<{
  roots: readonly NodeSystemNode[]
  childrenByParent: ReadonlyMap<string, readonly NodeSystemNode[]>
  parentByChild: ReadonlyMap<string, string>
  rootIdByNode: ReadonlyMap<string, string>
  descendantsByRoot: ReadonlyMap<string, readonly NodeSystemNode[]>
}>

/** Builds an acyclic visual-containment tree of arbitrary depth. */
export function indexNodeSystemContainment(
  nodes: readonly NodeSystemNode[],
): NodeSystemContainmentIndex {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const childrenByParent = new Map<string, NodeSystemNode[]>()
  const parentByChild = new Map<string, string>()

  for (const node of nodes) {
    if (node.parentId === undefined) continue
    const parent = byId.get(node.parentId)
    if (parent === undefined) throw new Error(`Unknown parent node: ${node.id}/${node.parentId}`)
    if (parent.id === node.id) throw new Error(`Node cannot contain itself: ${node.id}`)
    parentByChild.set(node.id, parent.id)
    const children = childrenByParent.get(parent.id) ?? []
    children.push(node)
    childrenByParent.set(parent.id, children)
  }

  for (const children of childrenByParent.values()) children.sort(compareOrdered)
  const roots = nodes.filter((node) => node.parentId === undefined).sort(compareOrdered)
  const rootIdByNode = new Map<string, string>()
  const descendantsByRoot = new Map<string, NodeSystemNode[]>()
  for (const node of nodes) {
    const path = new Set<string>()
    let current = node
    while (current.parentId !== undefined) {
      if (path.has(current.id)) throw new Error(`Containment cycle: ${node.id}`)
      path.add(current.id)
      current = byId.get(current.parentId)!
    }
    rootIdByNode.set(node.id, current.id)
    if (node.id !== current.id) {
      const descendants = descendantsByRoot.get(current.id) ?? []
      descendants.push(node)
      descendantsByRoot.set(current.id, descendants)
    }
  }
  for (const descendants of descendantsByRoot.values()) descendants.sort(compareOrdered)
  return {roots, childrenByParent, parentByChild, rootIdByNode, descendantsByRoot}
}

function compareOrdered(left: NodeSystemNode, right: NodeSystemNode): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)
}
