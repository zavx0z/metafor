import {describe, expect, test} from "bun:test"
import {applyWheelAxisLock, integrateQueuedScroll, nextWheelAxis, wheelDeltaPxFor, wheelQueueTauMs} from "./div.ts"

describe("div wheel delta normalization", () => {
  test("keeps pixel deltas unchanged", () => {
    expect(wheelDeltaPxFor(0.5, 0, 480)).toBe(0.5)
    expect(wheelDeltaPxFor(120, 0, 480)).toBe(120)
    expect(wheelDeltaPxFor(-14.25, 0, 480)).toBe(-14.25)
  })

  test("converts line deltas without clamping", () => {
    expect(wheelDeltaPxFor(1, 1, 480)).toBe(40)
    expect(wheelDeltaPxFor(-3, 1, 480)).toBe(-120)
  })

  test("converts page deltas to viewport-sized movement", () => {
    expect(wheelDeltaPxFor(1, 2, 480)).toBe(480)
    expect(wheelDeltaPxFor(-2, 2, 320)).toBe(-640)
  })

  test("ignores non-finite deltas", () => {
    expect(wheelDeltaPxFor(Number.NaN, 0, 480)).toBe(0)
    expect(wheelDeltaPxFor(Number.POSITIVE_INFINITY, 0, 480)).toBe(0)
  })
})

describe("div wheel smoothing", () => {
  test("uses wheel-mode-specific queue time constants", () => {
    expect(wheelQueueTauMs(0)).toBe(42)
    expect(wheelQueueTauMs(1)).toBe(72)
    expect(wheelQueueTauMs(2)).toBe(100)
  })

  test("integrates queued wheel distance without adding extra acceleration", () => {
    const first = integrateQueuedScroll(0, 26, 16, 42, 1000)
    expect(first.value).toBeGreaterThan(0)
    expect(first.value).toBeLessThan(26)
    expect(first.pending).toBeGreaterThan(0)
    expect(first.value + first.pending).toBeCloseTo(26, 6)

    const second = integrateQueuedScroll(first.value, first.pending, 16, 42, 1000)
    expect(second.value).toBeGreaterThan(first.value)
    expect(second.pending).toBeLessThan(first.pending)
    expect(second.value + second.pending).toBeCloseTo(26, 6)
  })

  test("snaps tiny pending distance and clamps at bounds", () => {
    expect(integrateQueuedScroll(10, 0.2, 16, 42, 1000)).toEqual({value: 10.2, pending: 0})
    expect(integrateQueuedScroll(999, 500, 16, 42, 1000)).toEqual({value: 1000, pending: 0})
  })
})

describe("div wheel axis lock", () => {
  test("starts a gesture on the dominant axis", () => {
    expect(nextWheelAxis(2, 12, null, null, 100)).toBe("y")
    expect(nextWheelAxis(12, 2, null, null, 100)).toBe("x")
  })

  test("keeps axis through small cross-axis noise", () => {
    expect(nextWheelAxis(5, 3, "y", 100, 112)).toBe("y")
    expect(applyWheelAxisLock(5, 3, "y")).toEqual({x: 0, y: 3, axis: "y"})
  })

  test("unlocks when the cross-axis movement clearly dominates", () => {
    expect(nextWheelAxis(12, 4, "y", 100, 112)).toBe(null)
    expect(nextWheelAxis(4, 12, "x", 100, 112)).toBe(null)
  })

  test("starts a new gesture after the separation window", () => {
    expect(nextWheelAxis(12, 4, "y", 100, 140)).toBe("x")
  })
})
