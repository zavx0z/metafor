import {describe, expect, test} from "bun:test"
import {
  captureHamiltonianSpatialRuntime,
  serializeHamiltonianViewPoint,
} from "./spatial-runtime.ts"

const viewPoint = {
  displayMode: "near" as const,
  activeDisplayId: null,
  position: {x: 0, y: -600, z: 900},
  target: {x: 0, y: 0, z: 900},
  up: {x: 0, y: 0, z: 1},
}

describe("Hamiltonian spatial runtime evidence", () => {
  test("proves the graph and HUD panes from their actual object parents", () => {
    const space = {}
    const hud = {}
    const display = {parent: space}
    const runtime = {space, hud, display, viewPointSnapshot: () => viewPoint}

    const snapshot = captureHamiltonianSpatialRuntime(
      runtime,
      {node: {parent: display}},
      {node: {parent: hud}},
      {node: {parent: hud}},
    )

    expect(snapshot).toEqual({
      valid: true,
      displayInSpace: true,
      graphInDisplay: true,
      inspectorInHud: true,
      canvasControlsInHud: true,
      tree: "Space>UIDisplay>graph;HUD>inspector,canvas-controls",
      viewPoint,
    })
    expect(JSON.parse(serializeHamiltonianViewPoint(snapshot.viewPoint))).toEqual(viewPoint)
  })

  test("fails evidence when a pane is merely labelled HUD but attached to the display", () => {
    const space = {}
    const hud = {}
    const display = {parent: space}
    const snapshot = captureHamiltonianSpatialRuntime(
      {space, hud, display, viewPointSnapshot: () => viewPoint},
      {node: {parent: display}},
      {node: {parent: display}},
      {node: {parent: hud}},
    )

    expect(snapshot.valid).toBe(false)
    expect(snapshot.inspectorInHud).toBe(false)
    expect(snapshot.tree).toBe("invalid")
  })
})
