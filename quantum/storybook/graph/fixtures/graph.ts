import {validateGraph} from "../../../../types/metafor/graph.ts"
import {projectBulkGraph} from "../../../bulk/graph/projection.ts"
import {
  createGraphFixture,
  insertSameMetaSibling,
  runtimeFieldAt,
} from "../../../tests/graph/fixture.ts"

export type CurrentGraphView = "graph" | "bulk"

/** Возвращает текущий Graph либо состав независимой Bulk parity projection. */
export function currentGraphFixture(view: CurrentGraphView): unknown {
  const graph = createGraphFixture()
  if (view === "graph") return graph
  const projection = projectBulkGraph(graph)
  return {
    templates: Object.keys(graph.template).length,
    runtimeRoots: graph.runtime.roots.length,
    atoms: projection.runtime.atoms.length,
    topologies: projection.runtime.topologies.length,
    fields: projection.runtime.fields.length,
    transitions: projection.runtime.transitions.length,
    conditions: projection.runtime.conditions.length,
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
    before: {selectedName: beforeValue, validation: validateGraph(before)},
    after: {selectedName: afterValue, validation: validateGraph(after)},
    retargeted: beforeValue !== afterValue,
  }
}
