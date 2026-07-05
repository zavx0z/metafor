import { describe, expect, test } from "bun:test"
import { resolveLevelDetail } from "./detail"
import type { LevelDetailSettings } from "@metafor/types/bulk"

const BASE: LevelDetailSettings = {
  detailDensityFactor: 2,
  detailLevelMultiplier: 1.22,
  torusRadialSegments: 16,
  torusTubularSegments: 16,
  torusMaxSegments: 96,
  sphereBaseWidthSegments: 16,
  sphereBaseHeightSegments: 12,
  sphereMaxWidthSegments: 64,
  sphereMaxHeightSegments: 48,
}

describe("bulk/gravity/level/detail", () => {
  test("detailMultiplier ослабевает по глубине по closed-form формуле", () => {
    const root = resolveLevelDetail(0, BASE)
    const child = resolveLevelDetail(1, BASE)
    const grand = resolveLevelDetail(2, BASE)

    expect(root.detailMultiplier).toBeCloseTo(BASE.detailDensityFactor, 6)
    expect(child.detailMultiplier).toBeCloseTo(BASE.detailDensityFactor / BASE.detailLevelMultiplier, 6)
    expect(grand.detailMultiplier).toBeCloseTo(
      BASE.detailDensityFactor / BASE.detailLevelMultiplier ** 2,
      6,
    )
  })

  test("сегменты тора уважают верхний предел и минимум 3", () => {
    const boosted: LevelDetailSettings = { ...BASE, detailDensityFactor: 100 }
    const root = resolveLevelDetail(0, boosted)

    expect(root.torusRadialSegments).toBe(BASE.torusMaxSegments)
    expect(root.torusTubularSegments).toBe(BASE.torusMaxSegments)

    const starved: LevelDetailSettings = { ...BASE, detailDensityFactor: 0.01 }
    const deep = resolveLevelDetail(10, starved)
    expect(deep.torusRadialSegments).toBeGreaterThanOrEqual(3)
    expect(deep.torusTubularSegments).toBeGreaterThanOrEqual(3)
  })

  test("сегменты сферы уважают пределы и минимумы", () => {
    const boosted: LevelDetailSettings = { ...BASE, detailDensityFactor: 100 }
    const root = resolveLevelDetail(0, boosted)

    expect(root.sphereWidthSegments).toBe(BASE.sphereMaxWidthSegments)
    expect(root.sphereHeightSegments).toBe(BASE.sphereMaxHeightSegments)

    const starved = resolveLevelDetail(12, { ...BASE, detailDensityFactor: 0.01 })
    expect(starved.sphereWidthSegments).toBeGreaterThanOrEqual(3)
    expect(starved.sphereHeightSegments).toBeGreaterThanOrEqual(2)
  })
})
