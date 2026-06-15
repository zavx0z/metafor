import {describe, expect, test} from "bun:test"
import {shouldSmoothWheelDelta, smoothScrollStep, wheelDeltaPxFor} from "./div.ts"

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
  test("smooths only non-pixel wheel deltas", () => {
    expect(shouldSmoothWheelDelta(12, 0)).toBe(false)
    expect(shouldSmoothWheelDelta(64, 0)).toBe(false)
    expect(shouldSmoothWheelDelta(480, 0)).toBe(false)
    expect(shouldSmoothWheelDelta(40, 1)).toBe(true)
    expect(shouldSmoothWheelDelta(480, 2)).toBe(true)
  })

  test("smooths pixel momentum after a short wheel gap", () => {
    expect(shouldSmoothWheelDelta(24, 0, {eventAtMs: 112, lastEventAtMs: 100})).toBe(false)
    expect(shouldSmoothWheelDelta(24, 0, {eventAtMs: 136, lastEventAtMs: 100})).toBe(true)
    expect(shouldSmoothWheelDelta(4, 0, {eventAtMs: 136, lastEventAtMs: 100})).toBe(false)
    expect(shouldSmoothWheelDelta(24, 0, {eventAtMs: 340, lastEventAtMs: 100})).toBe(false)
    expect(shouldSmoothWheelDelta(4, 0, {eventAtMs: 150, smoothUntilMs: 180})).toBe(true)
  })

  test("moves toward the target and snaps near the end", () => {
    expect(smoothScrollStep(0, 100)).toBe(42)
    expect(smoothScrollStep(99.6, 100)).toBe(100)
  })
})
