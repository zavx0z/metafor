import { describe, expect, test } from "bun:test"
import { computeLerpFactor, easeOutCubic, getDistanceToSegmentPx, mixScalar } from "./math"

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

  test("getDistanceToSegmentPx — расстояние до точки, отрезка-вырожденного, до отрезка", () => {
    // вырожденный отрезок (start == end) — обычное евклидово расстояние
    expect(getDistanceToSegmentPx(3, 4, 0, 0, 0, 0)).toBeCloseTo(5)
    // точка на отрезке
    expect(getDistanceToSegmentPx(5, 0, 0, 0, 10, 0)).toBe(0)
    // точка перпендикулярно середине
    expect(getDistanceToSegmentPx(5, 3, 0, 0, 10, 0)).toBeCloseTo(3)
    // точка вне-отрезка слева — кратчайший — до start
    expect(getDistanceToSegmentPx(-3, 0, 0, 0, 10, 0)).toBeCloseTo(3)
    // точка вне-отрезка справа — кратчайший — до end
    expect(getDistanceToSegmentPx(13, 0, 0, 0, 10, 0)).toBeCloseTo(3)
  })
})
