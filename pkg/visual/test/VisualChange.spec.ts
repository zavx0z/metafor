import {describe, expect, test} from "bun:test"
import {CenteredNested} from "../src/CenteredNested.ts"
import {OutsideIn} from "../src/OutsideIn.ts"
import {
  classifyVisualInvalidation,
  visualScopeKeepsPlacements,
  widenVisualInvalidation,
  type VisualUpstreamChange,
} from "../src/SceneReconciler.ts"

const change = (
  facet: VisualUpstreamChange["facet"],
  structural = false,
): VisualUpstreamChange => ({
  affectedAtomIds: [7],
  changed: true,
  facet,
  structural,
})

describe("production Visual change decisions", () => {
  test("keeps paint, effects and relations out of layout", () => {
    for (const layout of [CenteredNested, OutsideIn]) {
      expect(classifyVisualInvalidation(change("appearance"), layout))
        .toBe("appearance")
      expect(classifyVisualInvalidation(change("effect"), layout))
        .toBe("effects")
      expect(classifyVisualInvalidation(change("relation"), layout))
        .toBe("relations")
    }
    expect(visualScopeKeepsPlacements("appearance")).toBe(true)
    expect(visualScopeKeepsPlacements("effects")).toBe(true)
    expect(visualScopeKeepsPlacements("relations")).toBe(true)
  })

  test("lets each strategy price geometry and never narrows structure", () => {
    expect(classifyVisualInvalidation(change("field-value"), CenteredNested))
      .toBe("geometry")
    expect(classifyVisualInvalidation(change("field-value"), OutsideIn))
      .toBe("appearance")
    expect(classifyVisualInvalidation(change("structure", true), CenteredNested))
      .toBe("structure")
    expect(visualScopeKeepsPlacements("geometry")).toBe(false)
    expect(visualScopeKeepsPlacements("structure")).toBe(false)
    expect(widenVisualInvalidation("relations", "geometry")).toBe("geometry")
  })

  test("does no visual work for an unchanged upstream result", () => {
    expect(classifyVisualInvalidation({
      ...change("structure", true),
      changed: false,
    }, CenteredNested)).toBe("none")
  })
})
