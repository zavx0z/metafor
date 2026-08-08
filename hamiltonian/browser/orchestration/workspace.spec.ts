import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_INSPECTOR_DEFAULT_HEIGHT,
  HAMILTONIAN_INSPECTOR_MARGIN,
  HAMILTONIAN_INSPECTOR_STICK_HEIGHT,
  HAMILTONIAN_INSPECTOR_STICK_TOP,
  HAMILTONIAN_INSPECTOR_STICK_WIDTH,
  hamiltonianInspectorWidth,
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

  test("returns the full graph viewport and keeps only a compact reopen stick when closed", () => {
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
      .toEqual({x: 320, y: 0, w: 42, h: 34})
  })
})
