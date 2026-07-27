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
import type {HudTimelineDocument} from "@ui/hud"
import {installBulkHud} from "./hud.ts"

const timeline: HudTimelineDocument = {
	title: "Inference · current observer cut",
	minTick: 41,
	maxTick: 43,
	playheadTick: 42,
	tracks: [{
		id: "atom:1",
		label: "Inference",
		markers: [{tick: 42, resolution: "exact", selected: true}],
	}],
}

describe("Bulk HUD timeline mount", () => {
	test("mounts the read-only observer cut above the real scene", () => {
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

		const controller = installBulkHud({viewport, timeline})

		expect(mounted.map((entry) => (entry.surface as UiSurface).node.name)).toEqual([
			"BulkTimelineHudSurface",
			"BulkFullscreenDock",
		])
		expect(mounted[0]?.layout({w: 1200, h: 800})).toEqual({
			x: 42,
			y: 558,
			w: 1116,
			h: 224,
		})
		expect(mounted[0]?.opts?.zIndex).toBe(80)
		expect(controller.timelineDocument()).toBe(timeline)
	})
})
