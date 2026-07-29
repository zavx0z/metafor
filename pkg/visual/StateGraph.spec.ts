import {describe, expect, test} from "bun:test"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import {buildStateGraph} from "./StateGraph.ts"

const projection = (): BulkRuntimeProjection => ({
  atoms: [{
    id: 1,
    parentAtom: null,
    parentTopology: null,
    wimp: "owner/graph",
    position: 0,
  }],
  topologies: [],
  wimps: [{src: "owner/graph", name: "Graph"}],
  fields: [{
    id: 31,
    wimp: "owner/graph",
    key: "ready",
    label: "Ready",
    type: "boolean",
  }],
  states: [
    {id: 1, wimp: "owner/graph", name: "A", position: 0},
    {id: 2, wimp: "owner/graph", name: "B", position: 1},
    {id: 3, wimp: "owner/graph", name: "C", position: 2},
    {id: 4, wimp: "owner/graph", name: "D", position: 3},
    {id: 5, wimp: "owner/graph", name: "unreachable", position: 4},
  ],
  transitions: [
    {id: 11, wimp: "owner/graph", fromState: 1, toState: 2, position: 0},
    {id: 12, wimp: "owner/graph", fromState: 1, toState: 3, position: 1},
    {id: 13, wimp: "owner/graph", fromState: 2, toState: 4, position: 2},
    {id: 14, wimp: "owner/graph", fromState: 3, toState: 1, position: 3},
  ],
  conditions: [{
    id: 21,
    wimp: "owner/graph",
    transition: 11,
    field: 31,
    position: 0,
    predicate: {eq: true},
  }],
  processes: [],
  reactions: [],
  atomStates: [{atom: 1, state: 1}],
  fieldEnumVariants: [],
  atomValues: [],
  values: [],
  valueItems: [],
  matterParticles: [],
  matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})

describe("State Graph", () => {
  test("enumerates every possible path from every declared State", () => {
    const graph = buildStateGraph(projection(), 1)
    expect(graph.currentStateId).toBe(1)
    expect(graph.reachableStateIds).toEqual([1, 2, 4, 3])
    expect(graph.sleeves.slice(0, 2)).toEqual([
      {
        id: "atom/1/root/1/path/11-13",
        rootStateId: 1,
        stateIds: [1, 2, 4],
        transitionIds: [11, 13],
        end: {kind: "terminal"},
      },
      {
        id: "atom/1/root/1/path/12-14",
        rootStateId: 1,
        stateIds: [1, 3],
        transitionIds: [12, 14],
        end: {kind: "cycle", targetStateId: 1},
      },
    ])
    expect(graph.sleeves.map((sleeve) => sleeve.rootStateId)).toEqual([
      1,
      1,
      2,
      3,
      3,
      4,
      5,
    ])
    expect(graph.reachableStateIds).not.toContain(5)
  })

  test("retains exact Transition conditions in the inspected graph", () => {
    const graph = buildStateGraph(projection(), 1)
    expect(graph.fields).toEqual([{
      id: 31,
      key: "ready",
      label: "Ready",
      type: "boolean",
    }])
    expect(graph.transitions[0]).toMatchObject({
      id: 11,
      conditions: [{id: 21, fieldId: 31, predicate: {eq: true}}],
    })
  })

})
