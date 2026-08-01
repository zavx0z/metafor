import {describe, expect, test} from "bun:test"
import type {StateGraph} from "../src/StateGraph.ts"
import {
  STATE_GRAPH_PRODUCTION_SIZING,
  buildStateGraphBranchLayout,
  buildStateGraphBranchLayoutFromIndex,
  buildStateGraphRootLayout,
  describeStateGraphRoot,
  indexStateGraphLayout,
} from "../src/StateGraphLayout.ts"

const graph = (): StateGraph => ({
  atomId: 1,
  atomLabel: "Example",
  currentStateId: 1,
  fields: [{
    id: 31,
    key: "ready",
    label: "Ready",
    type: "boolean",
  }],
  reachableStateIds: [1, 2, 3],
  src: "owner/example",
  states: [
    {id: 1, name: "start", position: 0, current: true},
    {id: 2, name: "next", position: 1, current: false},
    {id: 3, name: "done", position: 2, current: false},
  ],
  transitions: [
    {
      id: 11,
      fromStateId: 1,
      toStateId: 2,
      position: 0,
      conditions: [{id: 21, fieldId: 31, predicate: {eq: true}}],
    },
    {
      id: 13,
      fromStateId: 1,
      toStateId: 3,
      position: 1,
      conditions: [],
    },
    {
      id: 12,
      fromStateId: 2,
      toStateId: 1,
      position: 2,
      conditions: [],
    },
  ],
  sleeves: [
    {
      id: "branch-cycle",
      rootStateId: 1,
      stateIds: [1, 2],
      transitionIds: [11, 12],
      end: {kind: "cycle", targetStateId: 1},
    },
    {
      id: "branch-terminal",
      rootStateId: 1,
      stateIds: [1, 3],
      transitionIds: [13],
      end: {kind: "terminal"},
    },
  ],
})

describe("State Graph layered layout", () => {
  test("keeps every Transition step in one branching graph", () => {
    const layout = buildStateGraphRootLayout(graph(), 1)
    const firstStep = layout.nodes.filter((node) => node.step === 1)
    const returning = layout.edges.find((edge) => edge.returning)

    expect(layout.levels.map((level) => level.step)).toEqual([0, 1])
    expect(firstStep).toHaveLength(2)
    expect(new Set(firstStep.map((node) => node.x))).toHaveLength(1)
    expect(new Set(firstStep.map((node) => node.y)).size).toBe(2)
    expect(new Set(layout.nodes.map((node) => node.stateId)).size).toBe(3)
    expect(layout.edges).toHaveLength(3)
    expect(returning).toMatchObject({
      transitionId: 12,
      returning: true,
    })
  })

  test("assigns one unique color to each State identity", () => {
    const layout = buildStateGraphRootLayout(graph(), 1)
    const colorsByState = new Map<number, string>()
    for (const node of layout.nodes) {
      const color = node.color.join(",")
      expect(colorsByState.get(node.stateId) ?? color).toBe(color)
      colorsByState.set(node.stateId, color)
    }

    expect(colorsByState.size).toBe(3)
    expect(new Set(colorsByState.values()).size).toBe(3)
  })

  test("does not recolor existing States when graph membership changes", () => {
    const source = graph()
    const baseline = buildStateGraphRootLayout(source, 1)
    const extended = buildStateGraphRootLayout({
      ...source,
      states: [
        {id: 99, name: "earlier", position: -1, current: false},
        ...source.states,
      ],
    }, 1)

    for (const node of baseline.nodes) {
      expect(
        extended.nodes.find((candidate) =>
          candidate.stateId === node.stateId
        )?.color,
      ).toEqual(node.color)
    }
  })

  test("puts condition Fields inside the State that uses them", () => {
    const layout = buildStateGraphRootLayout(graph(), 1)
    const start = layout.nodes.find((node) => node.stateId === 1)
    const next = layout.nodes.find((node) => node.stateId === 2)

    expect(start?.fields).toEqual([{
      id: 31,
      key: "ready",
      label: "Ready",
      type: "boolean",
    }])
    expect(next?.fields).toEqual([])
    expect(start?.fieldRadius).toBe(next?.fieldRadius)
    expect(start?.radius).toBeGreaterThan(next?.radius ?? 0)
    expect(start?.innerRadius).toBeGreaterThan(next?.innerRadius ?? 0)
  })

  test("describes every path sharing the selected start State", () => {
    const source = graph()
    const layout = buildStateGraphRootLayout(source, 1)
    expect(describeStateGraphRoot(source, layout, 0)).toMatchObject({
      title: "Граф 1 · старт: start",
      pathCount: 2,
      levelCount: 2,
      transitionCount: 3,
      conditionCount: 1,
      paths: [
        "start → next → ↺ start",
        "start → done",
      ],
    })
  })

  test("reuses branch topology without copying lab metrics into production", () => {
    expect(Object.isFrozen(STATE_GRAPH_PRODUCTION_SIZING)).toBe(true)
    const source = graph()
    const lab = buildStateGraphBranchLayout(source, 1)
    const production = buildStateGraphBranchLayout(
      source,
      1,
      STATE_GRAPH_PRODUCTION_SIZING,
    )

    expect(production.nodes.map((node) => node.id))
      .toEqual(lab.nodes.map((node) => node.id))
    expect(production.edges).toEqual(lab.edges)
    expect(new Set(lab.nodes.map((node) => node.fieldRadius)))
      .not.toEqual(new Set([5.5]))
    expect(new Set(production.nodes.map((node) => node.fieldRadius)))
      .toEqual(new Set([5.5]))

    const secondLevel = production.nodes.filter((node) => node.step === 1)
    expect(Math.abs(secondLevel[1]!.y - secondLevel[0]!.y) -
      secondLevel[0]!.radius - secondLevel[1]!.radius)
      .toBeCloseTo(STATE_GRAPH_PRODUCTION_SIZING.surfaceGap)
    const root = production.nodes.find((node) => node.step === 0)!
    expect(secondLevel[0]!.x - root.x -
      root.radius - Math.max(...secondLevel.map((node) => node.radius)))
      .toBeCloseTo(STATE_GRAPH_PRODUCTION_SIZING.surfaceGap)
  })

  test("reuses one graph-wide index across independent State roots", () => {
    const stateCount = 256
    const states = Array.from({length: stateCount}, (_, index) => ({
      current: index === 0,
      id: index + 1,
      name: `state-${index + 1}`,
      position: index,
    }))
    const source: StateGraph = {
      atomId: 1,
      atomLabel: "Independent",
      currentStateId: 1,
      fields: [],
      reachableStateIds: [1],
      sleeves: states.map((state) => ({
        end: {kind: "terminal" as const},
        id: `terminal:${state.id}`,
        rootStateId: state.id,
        stateIds: [state.id],
        transitionIds: [],
      })),
      src: "owner/independent",
      states,
      transitions: [],
    }
    const index = indexStateGraphLayout(source)
    const layouts = states.map((state) =>
      buildStateGraphBranchLayoutFromIndex(
        index,
        state.id,
        STATE_GRAPH_PRODUCTION_SIZING,
      )
    )

    expect(index.states.size).toBe(stateCount)
    expect(index.sleevesByRoot.size).toBe(stateCount)
    expect(layouts.flatMap((layout) => layout.nodes)).toHaveLength(stateCount)
    expect(layouts.every((layout) =>
      layout.nodes.length === 1 &&
      layout.nodes[0]!.stateId === layout.rootStateId
    )).toBe(true)
  })
})
