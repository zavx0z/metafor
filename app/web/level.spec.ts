import { describe, expect, test } from "bun:test"
import { resolveAppWebLevelMetrics } from "./level.ts"
import {
  DEFAULT_APP_WEB_LAYOUT_SETTINGS,
  DEFAULT_APP_WEB_RENDER_SETTINGS,
  appWebLayoutConfig,
} from "./settings.ts"

describe("app/web level law", () => {
  test("считает layout и visual depth-параметры из одного закона уровня", () => {
    const root = resolveAppWebLevelMetrics({
      depth: 0,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })
    const child = resolveAppWebLevelMetrics({
      depth: 1,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })

    expect(root.outerRadiusMm).toBeCloseTo(appWebLayoutConfig.snapshot.rootOuterDiameterMm / 2, 6)
    expect(child.outerRadiusMm).toBeCloseTo(root.outerRadiusMm / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier, 6)
    expect(child.fieldSphereRadiusMm).toBeCloseTo(
      root.fieldSphereRadiusMm / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
      6,
    )
    expect(child.labelFontSizeMm).toBeCloseTo(
      (root.labelFontSizeMm ?? 0) / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
      6,
    )
    expect(child.detailMultiplier).toBeCloseTo(
      (root.detailMultiplier ?? 0) / DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
      6,
    )

    expect(root.isLabelVisible).toBe(true)
    expect(root.torusRadialSegments).toBeGreaterThan(0)
    expect(root.torusTubularSegments).toBeGreaterThan(0)
    expect(root.sphereWidthSegments).toBeGreaterThan(0)
    expect(root.sphereHeightSegments).toBeGreaterThan(0)
  })

  test("при расширении outer radius сохраняет тот же закон inner ratio и shell geometry", () => {
    const metrics = resolveAppWebLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      outerRadiusMm: 777,
    })

    expect(metrics.outerRadiusMm).toBe(777)
    expect(metrics.innerRadiusMm / metrics.outerRadiusMm).toBeCloseTo(
      DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm / appWebLayoutConfig.snapshot.rootOuterDiameterMm,
      6,
    )
    expect(metrics.shellRadiusMm + metrics.shellTubeMm).toBeCloseTo(metrics.outerRadiusMm, 6)
    expect(metrics.shellRadiusMm - metrics.shellTubeMm).toBeCloseTo(metrics.innerRadiusMm, 6)
  })
})
