import { describe, expect, test } from "bun:test"
import { createLevelResolver } from "./memo"
import type { LevelSettings } from "./settings.t"

const SETTINGS: LevelSettings = {
  geometry: {
    levelSizeMultiplier: 2,
    rootInnerDiameterMm: 1000,
    rootSphereRadiusMm: 200,
    rootOuterDiameterMm: 4000,
    nestingCoefficient: 0.1,
    packingDensityCoefficient: 1.12,
    sphereMinScaleFactor: 0.5,
  },
  detail: {
    detailDensityFactor: 2,
    detailLevelMultiplier: 1.22,
    torusRadialSegments: 16,
    torusTubularSegments: 16,
    torusMaxSegments: 96,
    sphereBaseWidthSegments: 16,
    sphereBaseHeightSegments: 12,
    sphereMaxWidthSegments: 64,
    sphereMaxHeightSegments: 48,
  },
  label: {
    baseDepth: 0,
    fontSizeMm: 120,
    surfaceOffsetMm: 40,
    visibleLevels: 2,
  },
}

describe("bulk/gravity/level/memo", () => {
  test("canonical geometry возвращает тот же инстанс при повторном depth", () => {
    const resolver = createLevelResolver(SETTINGS)
    const first = resolver.getGeometry(1)
    const second = resolver.getGeometry(1)
    expect(second).toBe(first)
  })

  test("override-вызов не кэшируется и может отличаться от canonical", () => {
    const resolver = createLevelResolver(SETTINGS)
    const canonical = resolver.getGeometry(1)
    const override = resolver.getGeometry(1, 1500)
    expect(override).not.toBe(canonical)
    expect(override.outerRadiusMm).toBeCloseTo(1500, 6)
    expect(canonical.outerRadiusMm).toBeCloseTo(
      SETTINGS.geometry.rootOuterDiameterMm / 2 / SETTINGS.geometry.levelSizeMultiplier,
      6,
    )
  })

  test("detail и label кэшируются по depth", () => {
    const resolver = createLevelResolver(SETTINGS)
    expect(resolver.getDetail(2)).toBe(resolver.getDetail(2))
    expect(resolver.getLabel(1)).toBe(resolver.getLabel(1))
  })

  test("invalidate сбрасывает все кэши", () => {
    const resolver = createLevelResolver(SETTINGS)
    const g1 = resolver.getGeometry(1)
    resolver.invalidate()
    const g2 = resolver.getGeometry(1)
    expect(g2).not.toBe(g1)
    expect(g2).toEqual(g1)
  })
})
