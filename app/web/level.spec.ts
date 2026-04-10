import { describe, expect, test } from "bun:test"
import {
  resolveAppWebCanonicalLevelMetrics,
  resolveAppWebLevelMetrics,
  resolveAppWebLevelScale,
  resolveAppWebOuterRadiusFromFieldSphereRadius,
} from "./level.ts"
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
    expect(root.outerDiameterMm).toBeCloseTo(root.outerRadiusMm * 2, 6)
    expect(root.innerDiameterMm).toBeCloseTo(DEFAULT_APP_WEB_LAYOUT_SETTINGS.rootInnerDiameterMm, 6)
    expect(root.thicknessMm).toBeCloseTo((root.outerDiameterMm - root.innerDiameterMm) / 2, 6)
    expect(root.workingThicknessMm).toBeCloseTo(root.thicknessMm - root.paddingMm * 2, 6)
    expect(root.maxObjectDiameterMm).toBeCloseTo(
      root.outerDiameterMm * root.nestingCoefficient,
      6,
    )
    expect(root.sphereDiameterMm).toBeGreaterThanOrEqual(root.sphereMinDiameterMm)
    expect(root.sphereDiameterMm).toBeLessThanOrEqual(root.sphereMaxDiameterMm)
    expect(root.fieldSphereRadiusMm * 2).toBeCloseTo(root.sphereDiameterMm, 6)
    expect(child.outerRadiusMm).toBeCloseTo(root.outerRadiusMm / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier, 6)
    expect(child.fieldSphereRadiusMm).toBeCloseTo(
      root.fieldSphereRadiusMm / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
      6,
    )
    expect(child.labelFontSizeMm).toBeCloseTo(
      (root.labelFontSizeMm ?? 0) / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
      6,
    )
    expect(child.labelSurfaceOffsetMm).toBeCloseTo(
      (root.labelSurfaceOffsetMm ?? 0) / DEFAULT_APP_WEB_LAYOUT_SETTINGS.levelSizeMultiplier,
      6,
    )
    expect(child.detailMultiplier).toBeCloseTo(
      (root.detailMultiplier ?? 0) / DEFAULT_APP_WEB_RENDER_SETTINGS.detailLevelMultiplier,
      6,
    )

    expect(root.isLabelVisible).toBe(false) // Root label is hidden because baseDepth is 0
    expect(child.isLabelVisible).toBe(true) // Child label is visible because 1 > 0
    expect(root.torusRadialSegments).toBeGreaterThan(0)
    expect(root.torusTubularSegments).toBeGreaterThan(0)
    expect(root.sphereWidthSegments).toBeGreaterThan(0)
    expect(root.sphereHeightSegments).toBeGreaterThan(0)
  })

  test("явно разделяет level-scale и surface-scale", () => {
    const canonical = resolveAppWebCanonicalLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })
    const expanded = resolveAppWebLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      outerRadiusMm: canonical.outerRadiusMm * 1.5,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })

    expect(canonical.levelScale).toBeCloseTo(
      resolveAppWebLevelScale(2, DEFAULT_APP_WEB_LAYOUT_SETTINGS),
      6,
    )
    expect(canonical.surfaceScale).toBeCloseTo(1, 6)
    expect(expanded.levelScale).toBeCloseTo(canonical.levelScale, 6)
    expect(expanded.surfaceScale).toBeCloseTo(1.5, 6)
    expect(expanded.fieldSphereRadiusMm).toBeCloseTo(canonical.fieldSphereRadiusMm * 1.5, 6)
    expect(expanded.paddingMm).toBeCloseTo(canonical.paddingMm * 1.5, 6)
    expect(expanded.labelFontSizeMm).toBeCloseTo(canonical.labelFontSizeMm ?? 0, 6)
  })

  test("управляет видимостью подписей через скользящее окно baseDepth", () => {
    const renderSettings = {
      ...DEFAULT_APP_WEB_RENDER_SETTINGS,
      labelVisibleLevels: 2,
      baseDepth: 1,
    }

    const depth0 = resolveAppWebLevelMetrics({
      depth: 0,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })
    const depth1 = resolveAppWebLevelMetrics({
      depth: 1,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })
    const depth2 = resolveAppWebLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })
    const depth3 = resolveAppWebLevelMetrics({
      depth: 3,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })

    expect(depth0.isLabelVisible).toBe(false) // Выше базового уровня
    expect(depth1.isLabelVisible).toBe(false) // На базовом уровне (скрыто, так как мы внутри)
    expect(depth2.isLabelVisible).toBe(true) // В пределах окна
    expect(depth3.isLabelVisible).toBe(true) // В пределах окна (1 + 2 = 3)
    const depth4 = resolveAppWebLevelMetrics({
      depth: 4,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })
    expect(depth4.isLabelVisible).toBe(false) // Глубже окна
  })

  test("показывает корневые объекты, когда мы снаружи (baseDepth: -1)", () => {
    const renderSettings = {
      ...DEFAULT_APP_WEB_RENDER_SETTINGS,
      labelVisibleLevels: 2,
      baseDepth: -1,
    }

    const depth0 = resolveAppWebLevelMetrics({
      depth: 0,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })
    const depth1 = resolveAppWebLevelMetrics({
      depth: 1,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings,
    })

    expect(depth0.isLabelVisible).toBe(true) // Корневой объект виден (0 > -1)
    expect(depth1.isLabelVisible).toBe(true) // Дочерний тоже виден (1 <= -1 + 2)
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
    expect(metrics.maxObjectDiameterMm).toBeCloseTo(
      metrics.outerDiameterMm * metrics.nestingCoefficient,
      6,
    )
    expect(metrics.paddingMm).toBeCloseTo(
      metrics.maxObjectDiameterMm * (metrics.packingDensityCoefficient - 1),
      6,
    )
    expect(metrics.shellRadiusMm + metrics.shellTubeMm).toBeCloseTo(metrics.outerRadiusMm, 6)
    expect(metrics.shellRadiusMm - metrics.shellTubeMm).toBeCloseTo(metrics.innerRadiusMm, 6)
  })

  test("уменьшает шрифт подписи только по depth, а не по локально раздутому outer radius", () => {
    const canonical = resolveAppWebLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })
    const expanded = resolveAppWebLevelMetrics({
      depth: 2,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      outerRadiusMm: 777,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })

    expect(expanded.outerRadiusMm).toBe(777)
    expect(expanded.labelFontSizeMm).toBeCloseTo(canonical.labelFontSizeMm ?? 0, 6)
    expect(expanded.labelSurfaceOffsetMm).not.toBeCloseTo(canonical.labelSurfaceOffsetMm ?? 0, 6)
  })

  test("восстанавливает outer radius уровня по радиусу peer field-сферы", () => {
    const metrics = resolveAppWebLevelMetrics({
      depth: 3,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      outerRadiusMm: 777,
    })

    const restoredOuterRadiusMm = resolveAppWebOuterRadiusFromFieldSphereRadius({
      depth: 3,
      fieldSphereRadiusMm: metrics.fieldSphereRadiusMm,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
    })

    expect(restoredOuterRadiusMm).toBeCloseTo(metrics.outerRadiusMm, 6)
  })

  test("сохраняет достаточную детализацию на 5 и 6 уровнях", () => {
    const depth5 = resolveAppWebLevelMetrics({
      depth: 5,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })
    const depth6 = resolveAppWebLevelMetrics({
      depth: 6,
      layoutSettings: DEFAULT_APP_WEB_LAYOUT_SETTINGS,
      renderSettings: DEFAULT_APP_WEB_RENDER_SETTINGS,
    })

    // При SPHERE_BASE_WIDTH_SEGMENTS = 16 и detailLevelMultiplier = 1.22
    // На 5 уровне: 16 * 2 / 1.22^5 = 32 / 2.7 = 11.85 (округление до 12)
    // На 6 уровне: 16 * 2 / 1.22^6 = 32 / 3.3 = 9.7 (округление до 10)
    expect(depth5.sphereWidthSegments).toBeGreaterThanOrEqual(10)
    expect(depth6.sphereWidthSegments).toBeGreaterThanOrEqual(8)
    expect(depth5.torusRadialSegments).toBeGreaterThanOrEqual(10)
    expect(depth6.torusRadialSegments).toBeGreaterThanOrEqual(8)
  })
})
