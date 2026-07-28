import {afterEach, beforeEach, describe, expect, test} from "bun:test"
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

let previousDocument: typeof globalThis.document | undefined
let previousFetch: typeof globalThis.fetch

beforeEach(() => {
	previousDocument = globalThis.document
	previousFetch = globalThis.fetch
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			fullscreenElement: null,
			addEventListener() {},
			getElementById() {
				return null
			},
			documentElement: {
				classList: {
					toggle() {},
				},
			},
		},
	})
	globalThis.fetch = (async () => Response.json([])) as unknown as typeof globalThis.fetch
})

afterEach(() => {
	if (previousDocument === undefined) Reflect.deleteProperty(globalThis, "document")
	else Object.defineProperty(globalThis, "document", {configurable: true, value: previousDocument})
	globalThis.fetch = previousFetch
})

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
	test("mounts the observer cut and opens causal time without covering it", () => {
		const mounted: Array<{
			surface: UiSurfaceNode
			layout: UiSurfaceLayoutFn
			opts: UiSurfaceLayerOpts | undefined
			}> = []
		let relayouts = 0
		const hud = {
			addSurface(surface: UiSurfaceNode, layout: UiSurfaceLayoutFn, opts?: UiSurfaceLayerOpts) {
				mounted.push({surface, layout, opts})
			},
			relayout() {
				relayouts++
			},
		} as unknown as BulkViewportHudController
		const viewport = {hud} as unknown as BulkViewportWithHud

		const controller = installBulkHud({viewport, timeline})

		expect(mounted.map((entry) => (entry.surface as UiSurface).node.name)).toEqual([
			"BulkTimelineHudSurface",
			"BulkFullscreenDock",
			"BulkTimeDock",
			"BulkTimeSurface",
		])
		expect(mounted[0]?.layout({w: 1200, h: 800})).toEqual({
			x: 42,
			y: 558,
			w: 1116,
			h: 224,
		})
		expect(mounted[0]?.opts?.zIndex).toBe(80)
		expect(mounted[3]?.layout({w: 1200, h: 800})).toEqual({
			x: 42,
			y: 354,
			w: 1116,
			h: 192,
		})
		expect(mounted[3]?.opts?.zIndex).toBe(91)
		expect(relayouts).toBe(1)
		expect(controller.timelineDocument()).toBe(timeline)

		controller.toggleTime()
		expect(mounted[3]?.layout({w: 1200, h: 800})).toEqual({
			x: -1,
			y: -1,
			w: 0,
			h: 0,
		})
		expect(relayouts).toBe(2)

		controller.toggleTime()
		expect(mounted[3]?.layout({w: 1200, h: 800})).toEqual({
			x: 42,
			y: 354,
			w: 1116,
			h: 192,
		})
		expect(relayouts).toBe(3)
	})
})
