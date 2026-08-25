import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type DocumentPointer,
  type Graph,
  type RuntimeNode,
} from "@metafor/types/metafor/graph"
import {parseMetaRuntimeAtomPointer} from "shared/protocol/metafor/observation"

export const GRAPH_FIXTURE_ROOT = parseMetaAddress("example/graph-root")!
export const GRAPH_FIXTURE_CHILD = parseMetaAddress("example/graph-child")!

const rootPointer = "#/template/example~1graph-root" as DocumentPointer
const matterPointer = (index: number): DocumentPointer =>
  `${rootPointer}/matter/${index}` as DocumentPointer

/**
Создаёт полный валидный Graph с двумя различимыми значением, но одинаковыми по
Meta дочерними Atom.

Fixture используется только Quantum tests и Storybook; production-домены её не
импортируют.
*/
export function createGraphFixture(): Graph {
  return {
    schema: GRAPH_SCHEMA,
    root: GRAPH_FIXTURE_ROOT,
    template: {
      [GRAPH_FIXTURE_ROOT]: {
        name: "Корневой Graph",
        fields: [{
          key: "mode",
          type: "enum",
          required: true,
          default: "idle",
          values: ["idle", "ready"],
        }],
        superposition: [
          {name: "idle", transitions: {running: {mode: "ready"}}},
          {name: "running", transitions: null},
        ],
        mass: [],
        processes: [{
          key: "running",
          declaration: {
            type: "action",
            action: {src: "./run.ts", read: ["mode"]},
          },
        }],
        matter: [
          {kind: "wimp", src: GRAPH_FIXTURE_CHILD},
          {kind: "wimp", src: GRAPH_FIXTURE_CHILD},
        ],
      },
      [GRAPH_FIXTURE_CHILD]: {
        name: "Дочерний Graph",
        fields: [{key: "name", type: "string", required: true, default: ""}],
        superposition: [{name: "present", transitions: null}],
        mass: [],
        processes: [],
      },
    },
    runtime: {
      roots: [{
        kind: "atom",
        declaration: rootPointer,
        meta: GRAPH_FIXTURE_ROOT,
        state: "idle",
        values: {mode: "idle"},
        children: [
          child(0, "первый"),
          child(1, "второй"),
        ],
      }],
    },
  }
}

/** Вставляет перед существующими детьми ещё один Atom той же Meta. */
export function insertSameMetaSibling(input: Graph): Graph {
  const result = structuredClone(input)
  const rootTemplate = result.template[GRAPH_FIXTURE_ROOT]
  const runtimeRoot = result.runtime.roots[0]
  if (!rootTemplate?.matter || runtimeRoot?.kind !== "atom") {
    throw new Error("Graph fixture не содержит ожидаемые template и runtime root")
  }
  rootTemplate.matter.unshift({kind: "wimp", src: GRAPH_FIXTURE_CHILD})
  runtimeRoot.children = [
    child(0, "вставленный"),
    child(1, "первый"),
    child(2, "второй"),
  ]
  return result
}

/** Читает Field по snapshot-local runtime pointer без обращения к доменному Store. */
export function runtimeFieldAt(
  graph: Graph,
  pointer: string,
  field: string,
): unknown {
  const indices = parseMetaRuntimeAtomPointer(pointer)
  if (!indices || indices.length === 0) return undefined
  let selected: RuntimeNode | undefined = graph.runtime.roots[indices[0]!]
  for (const index of indices.slice(1)) selected = selected?.children?.[index]
  return selected?.kind === "atom" ? selected.values[field] : undefined
}

function child(index: number, name: string): RuntimeNode {
  return {
    kind: "atom",
    declaration: matterPointer(index),
    meta: GRAPH_FIXTURE_CHILD,
    state: "present",
    values: {name},
  }
}
