import { describe, expect, test } from "bun:test"
import { computeLerpFactor, easeOutCubic, mixScalar, renderLocalLength } from "./math"

describe("bulk/web/math", () => {
  test("mixScalar линейно интерполирует", () => {
    expect(mixScalar(0, 10, 0)).toBe(0)
    expect(mixScalar(0, 10, 1)).toBe(10)
    expect(mixScalar(0, 10, 0.5)).toBe(5)
    expect(mixScalar(2, 6, 0.25)).toBe(3)
  })

  test("easeOutCubic монотонно растёт от 0 до 1 с замедлением к концу", () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5)
  })

  test("computeLerpFactor возвращает 0 при не-положительном dt и стремится к 1 при больших dt", () => {
    expect(computeLerpFactor(0, 100)).toBe(0)
    expect(computeLerpFactor(-10, 100)).toBe(0)
    expect(computeLerpFactor(NaN, 100)).toBe(0)
    expect(computeLerpFactor(1000, 100)).toBeGreaterThan(0.99)
    expect(computeLerpFactor(50, 100)).toBeGreaterThan(0)
    expect(computeLerpFactor(50, 100)).toBeLessThan(1)
  })

  test("готовая Visual projection получает мировой scale Atom", () => {
    const inheritedAtomScale = 0.1

    expect(renderLocalLength(50, inheritedAtomScale)).toBeCloseTo(5, 6)
    expect(renderLocalLength(2, inheritedAtomScale)).toBeCloseTo(0.2, 6)
    expect(renderLocalLength(5, inheritedAtomScale)).toBeCloseTo(0.5, 6)
  })

})
