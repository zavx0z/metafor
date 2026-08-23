import {describe, expect, test} from "bun:test"
import {
  DEFAULT_BULK_SETTINGS,
  bulkViewportConfig,
  normalizeBulkRenderSettings,
  resolveBulkTorusLabelMetrics,
} from "./settings.ts"

describe("Bulk viewport settings", () => {
  test("contain no layout geometry or mesh-detail laws", () => {
    expect(DEFAULT_BULK_SETTINGS).toEqual({
      render: {
        labelFontSizeMm: 0.8,
        labelSurfaceOffsetMm: 1,
      },
    })
    expect(DEFAULT_BULK_SETTINGS).not.toHaveProperty("layout")
    expect(bulkViewportConfig.viewport).not.toHaveProperty("torusFallbackMm")
  })

  test("normalizes only viewport-owned label settings", () => {
    expect(normalizeBulkRenderSettings({
      labelFontSizeMm: Number.NaN,
      labelSurfaceOffsetMm: -1,
    })).toEqual(DEFAULT_BULK_SETTINGS.render)
  })

  test("keeps labels readable when exact Visual Torus grows beyond its baseline", () => {
    expect(resolveBulkTorusLabelMetrics(
      DEFAULT_BULK_SETTINGS.render,
      400,
      100,
    )).toEqual({
      fontSizeMm: 8,
      surfaceOffsetMm: 10,
    })
    expect(resolveBulkTorusLabelMetrics(
      DEFAULT_BULK_SETTINGS.render,
      27.78,
      22.22,
    )).toEqual({
      fontSizeMm: 0.8,
      surfaceOffsetMm: 1,
    })
  })
})
