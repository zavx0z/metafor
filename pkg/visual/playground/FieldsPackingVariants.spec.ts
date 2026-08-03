import {describe, expect, test} from "bun:test"
import {MAX_FIELD_LAYOUT_COUNT} from "../src/FieldsLayout.ts"
import {
  layoutFieldsInGrowthRings,
  layoutFieldsInHexSpiral,
  layoutFieldsOnSingleRing,
  layoutFieldsInSunflower,
} from "./FieldsPackingVariants.ts"

const markerRadius = 1.35
const markerDiameter = markerRadius * 2
const variants = Object.freeze([
  ["growth rings", layoutFieldsInGrowthRings],
  ["sunflower", layoutFieldsInSunflower],
  ["hex spiral", layoutFieldsInHexSpiral],
] as const)

describe("Fields packing playground variants", () => {
  for (const [name, layout] of variants) {
    test(`${name} is deterministic, centered and non-overlapping`, () => {
      for (const count of [2, 3, 4, 5, 54, 128]) {
        const result = layout(count, markerRadius)
        expect(layout(count, markerRadius)).toEqual(result)
        expect(result.points).toHaveLength(count)
        expect(Object.isFrozen(result)).toBe(true)
        expect(Object.isFrozen(result.points)).toBe(true)

        const centerX = result.points.reduce((sum, point) => sum + point.x, 0) /
          count
        const centerY = result.points.reduce((sum, point) => sum + point.y, 0) /
          count
        expect(centerX).toBeCloseTo(0, 12)
        expect(centerY).toBeCloseTo(0, 12)

        for (let left = 0; left < count; left += 1) {
          const from = result.points[left]!
          expect(from.z).toBe(0)
          expect(Math.hypot(from.x, from.y) + markerRadius)
            .toBeLessThanOrEqual(result.radius + 1e-12)
          for (let right = left + 1; right < count; right += 1) {
            const to = result.points[right]!
            expect(Math.hypot(from.x - to.x, from.y - to.y))
              .toBeGreaterThanOrEqual(markerDiameter - 1e-12)
          }
        }
      }
    })

    test(`${name} enforces the Visual layout work bound`, () => {
      expect(() => layout(Number.POSITIVE_INFINITY, markerRadius)).toThrow()
      expect(() => layout(MAX_FIELD_LAYOUT_COUNT + 1, markerRadius)).toThrow()
    })
  }

  test("area-filling variants use substantially less area than one outer ring", () => {
    const ringRadius = layoutFieldsOnSingleRing(54, markerRadius).radius
    const ringAreaFactor = ringRadius * ringRadius

    expect(layoutFieldsInSunflower(54, markerRadius).radius ** 2)
      .toBeLessThan(ringAreaFactor * 0.35)
    expect(layoutFieldsInGrowthRings(54, markerRadius).radius ** 2)
      .toBeLessThan(ringAreaFactor * 0.35)
    expect(layoutFieldsInHexSpiral(54, markerRadius).radius ** 2)
      .toBeLessThan(ringAreaFactor * 0.35)
  })
})
