import {describe, expect, test} from "bun:test"
import {
  MAX_FIELD_LAYOUT_COUNT,
  distributeOnPseudoSphere,
  layoutFieldsInPseudoCircle,
  pseudoSphereRadiusForFieldCount,
} from "./FieldsLayout.ts"

describe("shared Fields layouts", () => {
  test("is deterministic and keeps every center on one radius", () => {
    const radius = pseudoSphereRadiusForFieldCount(54, 1.35)
    const points = distributeOnPseudoSphere(54, radius)

    expect(distributeOnPseudoSphere(54, radius)).toEqual(points)
    expect(points).toHaveLength(54)
    for (const point of points) {
      expect(Math.hypot(point.x, point.y, point.z)).toBeCloseTo(radius)
    }
  })

  test("derives the minimum non-overlapping distribution from marker size", () => {
    const markerRadius = 0.8
    const points = distributeOnPseudoSphere(
      17,
      pseudoSphereRadiusForFieldCount(17, markerRadius),
    )
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const from = points[left]!
        const to = points[right]!
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z),
        )
      }
    }

    expect(minimumDistance).toBeCloseTo(markerRadius * 2)
  })

  test("packs arbitrary fixed Field radii into the shared pseudo-circle", () => {
    for (const markerRadius of [0.625, 2.5, 5]) {
      const layout = layoutFieldsInPseudoCircle(17, markerRadius)
      let minimumDistance = Number.POSITIVE_INFINITY
      expect(layout.points).toHaveLength(17)
      for (let left = 0; left < layout.points.length; left += 1) {
        const point = layout.points[left]!
        expect(point.z).toBe(0)
        expect(Math.hypot(point.x, point.y) + markerRadius)
          .toBeLessThanOrEqual(layout.radius)
        for (let right = left + 1; right < layout.points.length; right += 1) {
          const peer = layout.points[right]!
          minimumDistance = Math.min(
            minimumDistance,
            Math.hypot(point.x - peer.x, point.y - peer.y),
          )
        }
      }
      expect(minimumDistance).toBeCloseTo(markerRadius * 2)
      expect(layoutFieldsInPseudoCircle(17, markerRadius)).toBe(layout)
      expect(Object.isFrozen(layout)).toBe(true)
      expect(Object.isFrozen(layout.points)).toBe(true)
      expect(Object.isFrozen(layout.points[0])).toBe(true)
    }
  })

  test("returns immutable sphere points and rejects unbounded work", () => {
    const points = distributeOnPseudoSphere(3, 12)

    expect(Object.isFrozen(points)).toBe(true)
    expect(Object.isFrozen(points[0])).toBe(true)
    expect(() =>
      layoutFieldsInPseudoCircle(MAX_FIELD_LAYOUT_COUNT + 1, 1)
    ).toThrow(RangeError)
    expect(() =>
      pseudoSphereRadiusForFieldCount(Number.POSITIVE_INFINITY, 1)
    ).toThrow(RangeError)
  })

  test("does not alias distinct representable marker radii in cache", () => {
    const firstRadius = 1e14
    const secondRadius = firstRadius + 0.09375
    const first = layoutFieldsInPseudoCircle(31, firstRadius)
    const second = layoutFieldsInPseudoCircle(31, secondRadius)

    expect(second).not.toBe(first)
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < second.points.length; left += 1) {
      for (let right = left + 1; right < second.points.length; right += 1) {
        const from = second.points[left]!
        const to = second.points[right]!
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(from.x - to.x, from.y - to.y),
        )
      }
    }
    expect(Math.abs(minimumDistance - secondRadius * 2)).toBeLessThan(
      Math.abs(minimumDistance - firstRadius * 2),
    )
  })
})
