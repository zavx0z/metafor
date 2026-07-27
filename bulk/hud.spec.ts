import {describe, expect, test} from "bun:test"
import type {
  BulkViewportHudController,
  BulkViewportWithHud,
} from "@metafor/types/bulk/hud"
import type {
  UiSurface,
  UiSurfaceLayerOpts,
  UiSurfaceLayoutFn,
  UiSurfaceNode,
} from "@ui/elements"
import {installBulkHud} from "./hud.ts"
import {
  adaptBulkTimelineProjection,
  createBulkTimelineFixtureProjection,
} from "./timeline.ts"

describe("Bulk HUD timeline mount", () => {
  test("explicitly mounts the small read-only projection above the scene", () => {
    const mounted: Array<{
      surface: UiSurfaceNode
      layout: UiSurfaceLayoutFn
      opts: UiSurfaceLayerOpts | undefined
    }> = []
    const hud = {
      addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts?: UiSurfaceLayerOpts) {
        mounted.push({surface, layout, opts})
      },
      relayout() {},
    } as unknown as BulkViewportHudController
    const viewport = {hud} as unknown as BulkViewportWithHud
    const timeline = adaptBulkTimelineProjection(createBulkTimelineFixtureProjection())

    const controller = installBulkHud({viewport, timeline})

    expect(mounted.map((entry) => (entry.surface as UiSurface).node.name)).toEqual([
      "BulkTimelineHudSurface",
      "BulkFullscreenDock",
    ])
    expect(mounted[0]?.layout({w: 1200, h: 800})).toEqual({
      x: 42,
      y: 592,
      w: 1116,
      h: 190,
    })
    expect(mounted[0]?.opts?.zIndex).toBe(80)
    expect(controller.timelineDocument()).toBe(timeline)
  })
})
