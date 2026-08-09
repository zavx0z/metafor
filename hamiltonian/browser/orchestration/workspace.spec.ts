import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_INSPECTOR_DEFAULT_HEIGHT,
  HAMILTONIAN_INSPECTOR_MARGIN,
  HAMILTONIAN_INSPECTOR_STICK_HEIGHT,
  HAMILTONIAN_INSPECTOR_STICK_TOP,
  HAMILTONIAN_INSPECTOR_STICK_WIDTH,
  HAMILTONIAN_CANVAS_VIEW_STICK_HEIGHT,
  HAMILTONIAN_CANVAS_VIEW_STICK_WIDTH,
  HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT,
  HAMILTONIAN_CANVAS_VIEW_PANEL_WIDTH,
  hamiltonianInspectorWidth,
  planHamiltonianCanvasViewFrame,
  planHamiltonianGraphDisplayRect,
  planHamiltonianOrchestrationWorkspace,
} from "./workspace.ts"

describe("Hamiltonian orchestration workspace", () => {
  test("keeps the graph full size and opens a floating responsive inspector pane", () => {
    const workspace = planHamiltonianOrchestrationWorkspace(1200, 800, true)
    expect(workspace.inspector.w).toBe(hamiltonianInspectorWidth(1200))
    expect(workspace.graph).toEqual({x: 0, y: 0, w: 1200, h: 800})
    expect(workspace.inspector).toEqual({
      x: 1200 - hamiltonianInspectorWidth(1200) - HAMILTONIAN_INSPECTOR_MARGIN,
      y: HAMILTONIAN_INSPECTOR_STICK_TOP,
      w: hamiltonianInspectorWidth(1200),
      h: Math.min(HAMILTONIAN_INSPECTOR_DEFAULT_HEIGHT, 800 - HAMILTONIAN_INSPECTOR_STICK_TOP - HAMILTONIAN_INSPECTOR_MARGIN),
    })
  })

  test("returns the full graph display and keeps only a compact reopen stick when closed", () => {
    const workspace = planHamiltonianOrchestrationWorkspace(1200, 800, false)
    expect(workspace.graph).toEqual({x: 0, y: 0, w: 1200, h: 800})
    expect(workspace.inspector).toEqual({
      x: 1200 - HAMILTONIAN_INSPECTOR_STICK_WIDTH,
      y: HAMILTONIAN_INSPECTOR_STICK_TOP,
      w: HAMILTONIAN_INSPECTOR_STICK_WIDTH,
      h: HAMILTONIAN_INSPECTOR_STICK_HEIGHT,
    })
  })

  test("keeps the compact stick inside a tiny viewport", () => {
    const workspace = planHamiltonianOrchestrationWorkspace(30, 20, false)
    expect(workspace.graph).toEqual({x: 0, y: 0, w: 30, h: 20})
    expect(workspace.inspector).toEqual({x: 0, y: 0, w: 30, h: 20})
  })

  test("uses a caller-owned pane and docks a movable stick to the nearest viewport edge", () => {
    expect(planHamiltonianOrchestrationWorkspace(1200, 800, true, {x: 120, y: 90, w: 420, h: 360}).inspector)
      .toEqual({x: 120, y: 90, w: 420, h: 360})
    expect(planHamiltonianOrchestrationWorkspace(1200, 800, false, null, {x: 320, y: 180, w: 42, h: 34}).inspector)
      .toEqual({x: 320, y: 0, w: HAMILTONIAN_INSPECTOR_STICK_WIDTH, h: HAMILTONIAN_INSPECTOR_STICK_HEIGHT})
  })

  test("keeps graph-display geometry independent from every inspector state", () => {
    expect(planHamiltonianGraphDisplayRect(1200, 800)).toEqual({x: 0, y: 0, w: 1200, h: 800})
    expect(planHamiltonianOrchestrationWorkspace(1200, 800, true, {x: 100, y: 90, w: 500, h: 500}).graph)
      .toEqual(planHamiltonianGraphDisplayRect(1200, 800))
    expect(planHamiltonianOrchestrationWorkspace(1200, 800, false, null, {x: 320, y: 0, w: 38, h: 34}).graph)
      .toEqual(planHamiltonianGraphDisplayRect(1200, 800))
  })

  test("places separate infinite-canvas controls or stick over the graph", () => {
    expect(planHamiltonianCanvasViewFrame(1200, 800, false)).toEqual({
      x: 0,
      y: HAMILTONIAN_INSPECTOR_STICK_TOP,
      w: HAMILTONIAN_CANVAS_VIEW_STICK_WIDTH,
      h: HAMILTONIAN_CANVAS_VIEW_STICK_HEIGHT,
    })
    expect(planHamiltonianCanvasViewFrame(20, 18, false)).toEqual({x: 0, y: 0, w: 20, h: 18})
    expect(planHamiltonianCanvasViewFrame(1200, 800, true)).toEqual({
      x: HAMILTONIAN_INSPECTOR_MARGIN,
      y: HAMILTONIAN_INSPECTOR_STICK_TOP,
      w: HAMILTONIAN_CANVAS_VIEW_PANEL_WIDTH,
      h: HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT,
    })
    expect(planHamiltonianCanvasViewFrame(1200, 800, true, {x: 240, y: 100, w: 360, h: 240}))
      .toEqual({x: 240, y: 100, w: 360, h: 240})
  })
})
