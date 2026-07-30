import {describe, expect, test} from "bun:test"
import {
  DEFAULT_BULK_SETTINGS,
  bulkViewportConfig,
  normalizeBulkRenderSettings,
} from "./settings.ts"

describe("Bulk viewport settings", () => {
  test("contain no layout geometry or mesh-detail laws", () => {
    expect(DEFAULT_BULK_SETTINGS).toEqual({
      render: {
        labelVisibleLevels: 1,
        baseDepth: 0,
        labelFontSizeMm: 0.8,
        labelSurfaceOffsetMm: 1,
      },
    })
    expect(DEFAULT_BULK_SETTINGS).not.toHaveProperty("layout")
    expect(bulkViewportConfig.viewport).not.toHaveProperty("torusFallbackMm")
  })

  test("normalizes only viewport-owned label settings", () => {
    expect(normalizeBulkRenderSettings({
      labelVisibleLevels: 3.6,
      labelFontSizeMm: Number.NaN,
      labelSurfaceOffsetMm: -1,
    })).toEqual({
      ...DEFAULT_BULK_SETTINGS.render,
      labelVisibleLevels: 4,
    })
  })
})
