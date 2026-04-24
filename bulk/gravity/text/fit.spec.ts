import { describe, expect, test } from "bun:test"
import { resolveSurfaceFitScale, type SurfaceArcLimits, type SurfaceCurveRadii } from "./fit"
import type { TextExtents } from "./extents"

const LIMITS: SurfaceArcLimits = {
  horizontalRad: Math.PI * 0.8,
  ascenderRad: Math.PI * 0.5,
  descenderRad: Math.PI * 0.25,
}

const CURVE: SurfaceCurveRadii = {
  baseCurveRadiusMm: 1000,
  minorCurveRadiusMm: 200,
}

const textExtents = (overrides: Partial<TextExtents> = {}): TextExtents => ({
  widthMm: 100,
  minXmm: 0,
  centerXmm: 50,
  ascenderMm: 80,
  descenderMm: 20,
  ...overrides,
})

describe("bulk/gravity/text/fit", () => {
  test("когда все лимиты не достигнуты, scale = 1", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({ widthMm: 1, ascenderMm: 1, descenderMm: 1 }),
      limits: LIMITS,
      minScale: 0.1,
    })
    expect(scale).toBe(1)
  })

  test("ограничение по ширине тянет scale вниз", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      // очень широкий текст относительно baseCurveR × horizontalRad
      extents: textExtents({ widthMm: CURVE.baseCurveRadiusMm * LIMITS.horizontalRad * 2 }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBeCloseTo(0.5, 4)
  })

  test("ограничение по ascender тянет scale вниз", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({
        ascenderMm: CURVE.minorCurveRadiusMm * LIMITS.ascenderRad * 2,
      }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBeCloseTo(0.5, 4)
  })

  test("ограничение по descender тянет scale вниз (это и есть фикс 'y'-обрезания)", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({
        descenderMm: CURVE.minorCurveRadiusMm * LIMITS.descenderRad * 2,
      }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBeCloseTo(0.5, 4)
  })

  test("берётся минимум из трёх ограничений", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({
        widthMm: CURVE.baseCurveRadiusMm * LIMITS.horizontalRad * 1.25, // 0.8
        ascenderMm: CURVE.minorCurveRadiusMm * LIMITS.ascenderRad * 2, // 0.5 — самое тугое
        descenderMm: CURVE.minorCurveRadiusMm * LIMITS.descenderRad * 1.25, // 0.8
      }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBeCloseTo(0.5, 4)
  })

  test("minScale служит нижней границей", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({ widthMm: 1e9 }), // хотим 0 или почти 0
      limits: LIMITS,
      minScale: 0.2,
    })
    expect(scale).toBe(0.2)
  })

  test("нулевые размеры игнорируются (лимит не применяется)", () => {
    const scale = resolveSurfaceFitScale({
      curve: CURVE,
      extents: textExtents({ widthMm: 0, ascenderMm: 0, descenderMm: 0 }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBe(1)
  })
})
