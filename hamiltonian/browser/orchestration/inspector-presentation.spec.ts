import {describe, expect, test} from "bun:test"
import {
  parseHamiltonianInspectorPresentation,
  serializeHamiltonianInspectorPresentation,
} from "./inspector-presentation.ts"

describe("Hamiltonian inspector presentation", () => {
  test("round-trips open state and exact pane and stick frames", () => {
    const presentation = {
      open: false,
      frame: {x: 124.5, y: 80.25, w: 360, h: 540},
      stickFrame: {x: 740, y: 132, w: 42, h: 34},
      selectedNodeIds: ["host", "peer"],
      selectedNodeId: "peer",
    }
    expect(parseHamiltonianInspectorPresentation(serializeHamiltonianInspectorPresentation(presentation)))
      .toEqual(presentation)
  })

  test("accepts an initial state without measured frames", () => {
    const presentation = {open: true, frame: null, stickFrame: null, selectedNodeIds: [], selectedNodeId: null}
    expect(parseHamiltonianInspectorPresentation(serializeHamiltonianInspectorPresentation(presentation)))
      .toEqual(presentation)
  })

  test("treats corrupt and non-finite presentation as absent", () => {
    expect(parseHamiltonianInspectorPresentation("not json")).toBeNull()
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      kind: "hamiltonian.inspector-presentation.v1",
      open: "yes",
      frame: null,
      stickFrame: null,
    }))).toBeNull()
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      kind: "hamiltonian.inspector-presentation.v1",
      open: true,
      frame: {x: 0, y: 0, w: 0, h: 200},
      stickFrame: null,
      selectedNodeIds: [],
      selectedNodeId: null,
    }))).toBeNull()
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      kind: "hamiltonian.inspector-presentation.v1",
      open: true,
      frame: null,
      stickFrame: {x: Number.NaN, y: 0, w: 42, h: 34},
      selectedNodeIds: [],
      selectedNodeId: null,
    }))).toBeNull()
  })

  test("reads the preceding frame-only v1 state as an empty selection", () => {
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      kind: "hamiltonian.inspector-presentation.v1",
      open: false,
      frame: {x: 100, y: 80, w: 340, h: 500},
      stickFrame: {x: 700, y: 120, w: 42, h: 34},
    }))).toEqual({
      open: false,
      frame: {x: 100, y: 80, w: 340, h: 500},
      stickFrame: {x: 700, y: 120, w: 42, h: 34},
      selectedNodeIds: [],
      selectedNodeId: null,
    })
  })

  test("rejects duplicate selection and a primary node outside the selection", () => {
    const base = {
      kind: "hamiltonian.inspector-presentation.v1",
      open: true,
      frame: null,
      stickFrame: null,
    }
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      ...base,
      selectedNodeIds: ["host", "host"],
      selectedNodeId: "host",
    }))).toBeNull()
    expect(parseHamiltonianInspectorPresentation(JSON.stringify({
      ...base,
      selectedNodeIds: ["host"],
      selectedNodeId: "peer",
    }))).toBeNull()
  })
})
