import {describe, expect, test} from "bun:test"
import {
  TORUS_FORM_RATIOS,
  defineTorusComponent,
  resolveSelfSimilarTorusForm,
  resolveTorusForm,
} from "./Torus.ts"

describe("shared Torus visual component", () => {
  test("derives one Torus form from occupied inner and outer bounds", () => {
    expect(resolveTorusForm(3, 11)).toEqual({
      innerRadius: 3,
      outerRadius: 11,
      radius: 7,
      tube: 4,
    })
  })

  test("keeps fixed-proportion Torus forms geometrically self-similar", () => {
    const root = resolveSelfSimilarTorusForm(50)
    const nested = resolveSelfSimilarTorusForm(5)

    expect(root.innerRadius / root.outerRadius)
      .toBeCloseTo(TORUS_FORM_RATIOS.innerRadius)
    expect(nested.innerRadius / nested.outerRadius)
      .toBeCloseTo(TORUS_FORM_RATIOS.innerRadius)
    expect(root.radius / nested.radius).toBeCloseTo(10)
    expect(root.tube / nested.tube).toBeCloseTo(10)
  })

  test("recurses independently of the semantic owner", () => {
    const state = defineTorusComponent({
      id: "state:7",
      role: "state",
      payload: {stateId: 7},
      core: [{fieldId: 3}],
      innerRadius: 1,
      outerRadius: 4,
    })
    const atom = defineTorusComponent({
      id: "atom:2",
      role: "atom",
      payload: {atomId: 2},
      innerRadius: 5,
      outerRadius: 12,
      children: [{
        torus: defineTorusComponent({
          id: "atom:3",
          role: "atom",
          payload: {atomId: 3},
          innerRadius: 1,
          outerRadius: 3,
        }),
        scale: 0.5,
        x: 7,
        y: 0,
        z: 0,
      }],
    })

    expect(state.role).toBe("state")
    expect(state.core).toEqual([{fieldId: 3}])
    expect(atom.children[0]!.torus.role).toBe("atom")
    expect(atom.children[0]!.torus.form.outerRadius).toBe(3)
  })
})
