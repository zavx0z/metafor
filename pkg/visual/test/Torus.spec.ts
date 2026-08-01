import {describe, expect, test} from "bun:test"
import {
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
  TORUS_FORM_RATIOS,
  TORUS_LAYOUT_BASELINE,
  defineTorusComposition,
  resolveContentTorusForm,
  resolveEmptyTorusForm,
  resolveSelfSimilarTorusForm,
  resolveTorusForm,
  torusFieldRadiusAtLevel,
} from "../src/Torus.ts"

describe("shared Torus visual component", () => {
  test("smooths large Dark shells without multiplying embedded geometry", () => {
    expect(DARK_TORUS_MESH_DETAIL).toEqual({
      radialSegments: 64,
      tubularSegments: 192,
    })
    expect(EMBEDDED_TORUS_MESH_DETAIL).toEqual({
      radialSegments: 32,
      tubularSegments: 192,
    })
  })

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

  test("uses the approved 100 mm empty root and halves every nested level", () => {
    const root = resolveEmptyTorusForm(0)
    const child = resolveEmptyTorusForm(1)
    const grandchild = resolveEmptyTorusForm(2)

    expect(root).toMatchObject({
      innerRadius: 5.56,
      outerRadius: 50,
      radius: 27.78,
      tube: 22.22,
    })
    expect(child.outerRadius).toBe(25)
    expect(grandchild.outerRadius).toBe(12.5)
    expect(torusFieldRadiusAtLevel(0)).toBe(11)
    expect(torusFieldRadiusAtLevel(1)).toBe(5.5)
    expect(torusFieldRadiusAtLevel(2)).toBe(2.75)
    expect(TORUS_LAYOUT_BASELINE.levelScale).toBe(0.5)
  })

  test("grows outward around content without thinning the empty form", () => {
    const empty = resolveEmptyTorusForm(0)
    const filled = resolveContentTorusForm({
      emptyOuterRadius: empty.outerRadius,
      coreExtent: 12,
      occupiedOuterExtent: 80,
      gap: 3,
    })

    expect(filled.innerRadius).toBe(15)
    expect(filled.outerRadius).toBe(83)
    expect(filled.outerRadius - filled.innerRadius)
      .toBeGreaterThanOrEqual(empty.outerRadius - empty.innerRadius)
  })

  test("recurses independently of the semantic owner", () => {
    const state = defineTorusComposition({
      id: "state:7",
      role: "state",
      payload: {stateId: 7},
      core: [{fieldId: 3}],
      innerRadius: 1,
      outerRadius: 4,
    })
    const atom = defineTorusComposition({
      id: "atom:2",
      role: "atom",
      payload: {atomId: 2},
      innerRadius: 5,
      outerRadius: 12,
      children: [{
        torus: defineTorusComposition({
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
