import { describe, expect, test } from "bun:test"
import { resolveLevelGeometry, resolveLevelScale, resolveOuterRadiusFromSphereRadius } from "./geometry"
import type { LevelGeometrySettings } from "@metafor/types/bulk/level"

const BASE: LevelGeometrySettings = {
  rootInnerDiameterMm: 1000,
  rootSphereRadiusMm: 200,
  rootOuterDiameterMm: 4000,
  nestingCoefficient: 0.1,
  packingDensityCoefficient: 1.12,
  sphereMinScaleFactor: 0.5,
}

describe("bulk/gravity/level/geometry", () => {
  test("root-уровень выводит размеры из rootOuterDiameterMm", () => {
    const root = resolveLevelGeometry({ depth: 0, settings: BASE })

    expect(root.outerDiameterMm).toBeCloseTo(BASE.rootOuterDiameterMm, 6)
    expect(root.outerRadiusMm).toBeCloseTo(BASE.rootOuterDiameterMm / 2, 6)
    expect(root.innerDiameterMm).toBeCloseTo(BASE.rootInnerDiameterMm, 6)
    expect(root.thicknessMm).toBeCloseTo(
      (root.outerDiameterMm - root.innerDiameterMm) / 2,
      6,
    )
    expect(root.shellRadiusMm).toBeCloseTo(root.innerRadiusMm + root.shellTubeMm, 6)
    expect(root.levelScale).toBe(1)
  })

  test("глубина уменьшает размер по фрактальному закону", () => {
    const root = resolveLevelGeometry({ depth: 0, settings: BASE })
    const child = resolveLevelGeometry({ depth: 1, settings: BASE })
    const grand = resolveLevelGeometry({ depth: 2, settings: BASE })

    expect(child.outerRadiusMm).toBeCloseTo(root.outerRadiusMm / 2, 6)
    expect(grand.outerRadiusMm).toBeCloseTo(root.outerRadiusMm / 4, 6)
    expect(child.levelScale).toBeCloseTo(0.5, 6)
  })

  test("outerRadiusMm override использует его напрямую без surfaceScale-хака", () => {
    const targetOuter = 2500
    const surface = resolveLevelGeometry({ depth: 1, settings: BASE, outerRadiusMm: targetOuter })

    expect(surface.outerRadiusMm).toBeCloseTo(targetOuter, 6)
    expect(surface.outerDiameterMm).toBeCloseTo(targetOuter * 2, 6)
    // Inner/outer соотношение сохраняется
    const ratio = BASE.rootInnerDiameterMm / BASE.rootOuterDiameterMm
    expect(surface.innerDiameterMm).toBeCloseTo(surface.outerDiameterMm * ratio, 6)
  })

  test("sphere-диаметр выводится из rootSphereRadiusMm пропорционально глубине", () => {
    const root = resolveLevelGeometry({ depth: 0, settings: BASE })
    const child = resolveLevelGeometry({ depth: 1, settings: BASE })

    expect(root.sphereRadiusMm).toBeGreaterThanOrEqual(root.sphereMinDiameterMm / 2)
    expect(root.sphereRadiusMm).toBeLessThanOrEqual(root.sphereMaxDiameterMm / 2)
    expect(child.sphereRadiusMm).toBeCloseTo(root.sphereRadiusMm / 2, 6)
  })

  test("resolveLevelScale согласован с geometry", () => {
    for (const depth of [0, 1, 2, 3]) {
      const g = resolveLevelGeometry({ depth, settings: BASE })
      const s = resolveLevelScale(depth)
      expect(g.levelScale).toBeCloseTo(s, 10)
    }
  })

  test("resolveOuterRadiusFromSphereRadius — обратная функция к sphereRadius", () => {
    const root = resolveLevelGeometry({ depth: 2, settings: BASE })
    const recovered = resolveOuterRadiusFromSphereRadius(2, BASE, root.sphereRadiusMm)
    expect(recovered).toBeCloseTo(root.outerRadiusMm, 4)
  })

  test("отрицательный/NaN depth нормализуется в 0", () => {
    const zero = resolveLevelGeometry({ depth: 0, settings: BASE })
    const negative = resolveLevelGeometry({ depth: -5, settings: BASE })
    const nan = resolveLevelGeometry({ depth: Number.NaN, settings: BASE })

    expect(negative.depth).toBe(0)
    expect(nan.depth).toBe(0)
    expect(negative.outerRadiusMm).toBeCloseTo(zero.outerRadiusMm, 6)
  })
})
