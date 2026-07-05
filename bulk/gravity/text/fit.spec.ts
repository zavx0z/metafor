import { describe, expect, test } from "bun:test"
import { resolveSurfaceFitScale } from "./fit"
import type { SurfaceArcLimits, TextExtents } from "@metafor/types/bulk/layout"

const LIMITS: SurfaceArcLimits = { horizontalRad: Math.PI * 0.8 }

const textExtents = (overrides: Partial<TextExtents> = {}): TextExtents => ({
  widthMm: 100,
  minXmm: 0,
  centerXmm: 50,
  ascenderMm: 80,
  descenderMm: 20,
  ...overrides,
})

describe("bulk/gravity/text/fit", () => {
  test("когда текст узкий относительно параллели, scale = 1", () => {
    const scale = resolveSurfaceFitScale({
      curveRadiusMm: 1000,
      extents: textExtents({ widthMm: 10 }),
      limits: LIMITS,
      minScale: 0.1,
    })
    expect(scale).toBe(1)
  })

  test("ограничение по ширине тянет scale вниз", () => {
    const scale = resolveSurfaceFitScale({
      curveRadiusMm: 1000,
      extents: textExtents({ widthMm: 1000 * LIMITS.horizontalRad * 2 }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBeCloseTo(0.5, 4)
  })

  test("minScale служит нижней границей", () => {
    const scale = resolveSurfaceFitScale({
      curveRadiusMm: 1000,
      extents: textExtents({ widthMm: 1e9 }),
      limits: LIMITS,
      minScale: 0.2,
    })
    expect(scale).toBe(0.2)
  })

  test("нулевая ширина даёт scale = 1 (лимит не применяется)", () => {
    const scale = resolveSurfaceFitScale({
      curveRadiusMm: 1000,
      extents: textExtents({ widthMm: 0 }),
      limits: LIMITS,
      minScale: 0.01,
    })
    expect(scale).toBe(1)
  })
})
