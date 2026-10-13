import type {AtomRef, Graph, RuntimeAtom, RuntimeNode} from "@metafor/types/metafor/graph"
import type {SpatialTreeNode} from "@zavx0z/immersive/nodes/spatial/tree"

/** Производная геометрическая входная модель; lookup возвращает исходный наблюдаемый Atom. */
export interface RuntimeAtomProjection {
  readonly nodes: readonly SpatialTreeNode[]
  readonly roots: readonly AtomRef[]
  lookupRuntimeAtom(ref: string): RuntimeAtom | null
}

/**
 * Переводит public Graph.runtime в вход SpatialTree: только фактические Atom,
 * stable AtomRef и ближайший Atom-parent. Matter preorder сохраняется сквозь
 * topology; template используется только для подписи. Не меняет Graph, canonical
 * координаты и не создаёт сущностей из template. Геометрией владеет SpatialTree.
 * @see ../README.md; atom-projection.spec.ts.
 */
export function projectRuntimeAtoms(graph: Graph): RuntimeAtomProjection {
  const nodes: SpatialTreeNode[] = [], roots: AtomRef[] = []
  const atoms = new Map<string, RuntimeAtom>()
  const pending: {node: RuntimeNode; parent: AtomRef | null}[] = graph.runtime.roots.map(node => ({node, parent: null})).reverse()
  while (pending.length) {
    const {node, parent} = pending.pop()!
    let nearest = parent
    if (node.kind === "atom") {
      if (atoms.has(node.ref)) throw new Error(`Duplicate runtime Atom identity: ${node.ref}`)
      atoms.set(node.ref, node)
      const label = graph.template[node.meta]?.name || node.meta
      nodes.push(parent === null ? {id: node.ref, label} : {id: node.ref, parentId: parent, label})
      if (parent === null) roots.push(node.ref)
      nearest = node.ref
    }
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--) pending.push({node: node.children![index]!, parent: nearest})
  }
  return {nodes, roots, lookupRuntimeAtom: ref => atoms.get(ref) ?? null}
}
