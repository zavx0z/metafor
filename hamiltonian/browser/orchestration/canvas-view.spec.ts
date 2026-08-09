import {describe, expect, test} from "bun:test"
import {
  HAMILTONIAN_CANVAS_VIEW_BODY_BOTTOM_INSET,
  HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP,
  HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP,
  HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT,
  HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT,
  HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT,
  planHamiltonianCanvasViewControls,
} from "./canvas-view.ts"
import {HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT} from "./workspace.ts"

describe("Hamiltonian canvas-view pane", () => {
  test("uses one compact intrinsic column without a growing empty slot", () => {
    const body = {
      x: 16,
      y: HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT + HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP,
      w: 268,
      h: HAMILTONIAN_CANVAS_VIEW_PANEL_HEIGHT
        - HAMILTONIAN_CANVAS_VIEW_TITLE_HEIGHT
        - HAMILTONIAN_CANVAS_VIEW_BODY_TOP_GAP
        - HAMILTONIAN_CANVAS_VIEW_BODY_BOTTOM_INSET,
    }
    const controls = planHamiltonianCanvasViewControls(body)

    expect(controls.fit.y - (controls.toggle.y + controls.toggle.h))
      .toBe(HAMILTONIAN_CANVAS_VIEW_CONTROL_GAP)
    expect(controls.fit.y + controls.fit.h).toBe(body.y + body.h)
    expect(controls.toggle.h).toBe(HAMILTONIAN_CANVAS_VIEW_TOGGLE_HEIGHT)
    expect(controls.fit.h).toBe(HAMILTONIAN_CANVAS_VIEW_FIT_HEIGHT)
  })
})
