import { describe, expect, test } from "bun:test"
import {
  DEFAULT_BULK_LAYOUT_SETTINGS,
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
} from "@bulk/gravity/layout"
import { DEFAULT_BULK_SETTINGS, normalizeBulkRenderSettings } from "./settings.ts"

describe("bulk visual laws", () => {
  test("uses the gravity layout law as the single layout source", () => {
    expect(DEFAULT_BULK_SETTINGS.layout).toEqual(DEFAULT_BULK_LAYOUT_SETTINGS)
    expect(DEFAULT_BULK_LAYOUT_SETTINGS.rootInnerDiameterMm).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm / 3,
      6,
    )
    expect(DEFAULT_BULK_LAYOUT_SETTINGS.rootSphereRadiusMm).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm *
        DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.nestingCoefficient / 2,
      6,
    )
  })

  test("keeps perpetual animation disabled", () => {
    expect(DEFAULT_BULK_SETTINGS.render.animationEnabled).toBe(false)
  })

  test("keeps the root label inside the canonical Atom scale", () => {
    expect(DEFAULT_BULK_SETTINGS.render.labelFontSizeMm).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm * 0.02,
      6,
    )
    expect(DEFAULT_BULK_SETTINGS.render.labelSurfaceOffsetMm).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm * 0.01,
      6,
    )
  })

  test("normalizes internal render values against the canonical law", () => {
    expect(normalizeBulkRenderSettings({
      detailDensityFactor: Number.NaN,
      labelVisibleLevels: 3.6,
      torusRadialSegments: 2,
      wireframeOpacity: 2,
    })).toEqual({
      ...DEFAULT_BULK_SETTINGS.render,
      labelVisibleLevels: 4,
      torusRadialSegments: 3,
      wireframeOpacity: 1,
    })
  })
})
