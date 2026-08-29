import {validateGraph} from "@metafor/types/metafor/graph"
import {projectBulkGraph} from "../../../quantum/bulk/graph/projection.ts"
import {
  createGraphFixture,
  insertSameMetaSibling,
  runtimeFieldAt,
  runtimeRefAt,
} from "../../../quantum/tests/graph/fixture.ts"

export type CurrentGraphView = "graph" | "bulk"

/** Exact Reaction declaration, resolved relation and lazy Mass metadata from one Graph. */
export function reactionGraphFixture(): unknown {
  const graph = createGraphFixture()
  const root = graph.runtime.roots[0]
  if (root?.kind !== "atom") throw new Error("Graph fixture root Atom is absent")
  return {
    declaration: graph.template[graph.root]?.reactions?.[0] ?? null,
    relation: graph.runtime.reactions[0] ?? null,
    targetMass: root.mass,
    massContent: {
      included: false,
      read: "energy.mass.result.read",
    },
  }
}

/** Возвращает текущий Graph либо состав независимой Bulk parity projection. */
export function currentGraphFixture(view: CurrentGraphView): unknown {
  const graph = createGraphFixture()
  if (view === "graph") return graph
  const projection = projectBulkGraph(graph)
  const runtimeMass = (nodes: typeof graph.runtime.roots): number => nodes.reduce(
    (count, node) => count + (node.kind === "atom" ? node.mass.length : 0) + runtimeMass(node.children ?? []),
    0,
  )
  return {
    templates: Object.keys(graph.template).length,
    runtimeRoots: graph.runtime.roots.length,
    atoms: projection.runtime.atoms.length,
    topologies: projection.runtime.topologies.length,
    fields: projection.runtime.fields.length,
    transitions: projection.runtime.transitions.length,
    conditions: projection.runtime.conditions.length,
    reactions: projection.runtime.reactions.length,
    reactionRelations: graph.runtime.reactions.length,
    mass: runtimeMass(graph.runtime.roots),
  }
}

/** Создаёт closed-contract candidate и возвращает точный validation result. */
export function validationGraphFixture(includeRevision: boolean): unknown {
  const graph = createGraphFixture()
  const candidate = includeRevision ? {...graph, revision: 17} : graph
  return {candidate, validation: validateGraph(candidate)}
}

/** Показывает выбор одного snapshot-local path до и после same-Meta insertion. */
export function identityGraphFixture(insertSibling: boolean): unknown {
  const pointer = "/runtime/roots/0/children/1"
  const before = createGraphFixture()
  const after = insertSibling ? insertSameMetaSibling(before) : before
  const beforeValue = runtimeFieldAt(before, pointer, "name")
  const afterValue = runtimeFieldAt(after, pointer, "name")
  return {
    pointer,
    before: {selectedRef: runtimeRefAt(before, pointer), selectedName: beforeValue, validation: validateGraph(before)},
    after: {selectedRef: runtimeRefAt(after, pointer), selectedName: afterValue, validation: validateGraph(after)},
    retargeted: beforeValue !== afterValue,
  }
}
