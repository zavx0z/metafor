import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {
	BulkViewportHudController,
	BulkViewportWithHud,
} from "@bulk/types/hud"
import type {
	UiSurface,
	UiSurfaceLayerOpts,
	UiSurfaceLayoutFn,
	UiSurfaceNode,
} from "@ui/elements"
import {
	BulkCausalTimeModel,
	bulkTimeCountersVisible,
	installBulkHud,
	planBulkTimeControlDock,
	planBulkTimeModeButtons,
	type BulkCausalTimeTransport,
} from "./hud.ts"

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

describe("Bulk causal HUD mount", () => {
	test("mounts a compact causal timeline and its bottom dock without a side tab", () => {
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

		const controller = installBulkHud({viewport})

		expect(mounted.map((entry) => (entry.surface as UiSurface).node.name)).toEqual([
			"BulkFullscreenDock",
			"BulkCausalTimelineSurface",
			"BulkTimeControlDock",
		])
		expect(mounted[0]?.layout({w: 1200, h: 800})).toEqual({
			x: 1146,
			y: 0,
			w: 42,
			h: 34,
		})
		expect(mounted[1]?.layout({w: 1200, h: 800})).toEqual({
			x: 42,
			y: 690,
			w: 1116,
			h: 56,
		})
		expect(mounted[1]?.opts?.zIndex).toBe(80)
			expect(mounted[2]?.layout({w: 1200, h: 800})).toEqual({
				x: 454,
				y: 750,
				w: 292,
				h: 38,
			})
		expect(mounted[2]?.opts?.zIndex).toBe(91)
		expect(relayouts).toBe(1)
		expect(controller).not.toHaveProperty("setNodeView")
		expect(controller).not.toHaveProperty("nodeViewActive")
		expect(controller).not.toHaveProperty("toggleTime")
		expect(controller).not.toHaveProperty("timeActive")
	})

	test("keeps every control inside the responsive 320px viewport dock", () => {
		const plan = planBulkTimeControlDock(292)
		const items = [
			plan.keyframes,
			plan.sequence,
			plan.pause,
			plan.resume,
			plan.step,
		].filter((item): item is {x: number; w: number} => item !== null)

		expect(plan.keyframes).not.toBeNull()
		expect(plan.sequence).not.toBeNull()
		expect(items.every((item) => item.x >= 0 && item.x + item.w <= 292)).toBe(true)
	})

	test("keeps centered icon controls before hiding an unusably narrow dock", () => {
		const plan = planBulkTimeControlDock(122)
		expect(plan.keyframes).toBeNull()
		expect(plan.sequence).toBeNull()
		expect(plan.step.x + plan.step.w).toBeLessThanOrEqual(122)
	})

	test("centers controls and puts explicit counters at their outer edges", () => {
		const plan = planBulkTimeControlDock(292)
		const controlsLeft = plan.pause.x
		const controlsRight = plan.step.x + plan.step.w
		expect((controlsLeft + controlsRight) / 2).toBe(146)
		expect(plan.keyframes!.x + plan.keyframes!.w).toBeLessThan(controlsLeft)
		expect(plan.sequence!.x).toBeGreaterThan(controlsRight)
		expect(bulkTimeCountersVisible(0)).toBe(false)
		expect(bulkTimeCountersVisible(1)).toBe(true)
	})

	test("keeps the control group centered throughout the intermediate width range", () => {
		const plan = planBulkTimeControlDock(291)
		const controlsCenter = (plan.pause.x + plan.step.x + plan.step.w) / 2
		expect(Math.abs(controlsCenter - 291 / 2)).toBeLessThanOrEqual(0.5)
		expect(plan.keyframes!.x).toBeGreaterThanOrEqual(0)
		expect(plan.sequence!.x + plan.sequence!.w).toBeLessThanOrEqual(291)
	})

	test("highlights the current mode rather than the opposite available action", () => {
		expect(planBulkTimeModeButtons("open")).toEqual({
			pause: {
				selected: false,
				tone: "neutral",
				variant: "outlined",
				iconSrc: expect.any(String),
				borderWidth: 1,
			},
			resume: {
				selected: true,
				tone: "live",
				variant: "contained",
				iconSrc: expect.any(String),
				borderWidth: 2,
			},
		})
		expect(planBulkTimeModeButtons("paused")).toEqual({
			pause: {
				selected: true,
				tone: "paused",
				variant: "contained",
				iconSrc: expect.any(String),
				borderWidth: 2,
			},
			resume: {
				selected: false,
				tone: "neutral",
				variant: "outlined",
				iconSrc: expect.any(String),
				borderWidth: 1,
			},
		})
		expect(planBulkTimeModeButtons("loading")).toEqual({
			pause: {
				selected: false,
				tone: "neutral",
				variant: "outlined",
				iconSrc: expect.any(String),
				borderWidth: 1,
			},
			resume: {
				selected: false,
				tone: "neutral",
				variant: "outlined",
				iconSrc: expect.any(String),
				borderWidth: 1,
			},
		})
	})
})

describe("Bulk causal time command state", () => {
	test("serializes Pause and Resume while their RPC is pending", async () => {
		const pause = deferred<void>()
		const pausedStack = deferred<unknown>()
		const resume = deferred<void>()
		let stackCalls = 0
		let pauseCalls = 0
		let resumeCalls = 0
		const model = new BulkCausalTimeModel({
			async stack() {
				stackCalls++
				return stackCalls === 1 ? [] : await pausedStack.promise
			},
			async pause() {
				pauseCalls++
				await pause.promise
			},
			async resume() {
				resumeCalls++
				await resume.promise
			},
		})

		model.open()
		await flushTasks()
		expect(model.state).toBe("open")
		expect(model.canPause).toBe(true)

		const firstPause = model.pause()
		const duplicatePause = model.pause()
		expect(pauseCalls).toBe(1)
		expect(model.state).toBe("pausing")
		expect(model.canPause).toBe(false)
		expect(model.canResume).toBe(false)
		pause.resolve()
		await flushTasks()
		expect(stackCalls).toBe(2)
		pausedStack.resolve([{id: 1, frontier: {acceptanceSequence: 7}}])
		await Promise.all([firstPause, duplicatePause])
		expect(model.state).toBe("paused")
		expect(model.canResume).toBe(true)

		const firstResume = model.resume()
		const duplicateResume = model.resume()
		expect(resumeCalls).toBe(1)
		expect(model.state).toBe("resuming")
		expect(model.canPause).toBe(false)
		expect(model.canResume).toBe(false)
		resume.resolve()
		await Promise.all([firstResume, duplicateResume])
		expect(model.state).toBe("open")
		expect(model.frames).toEqual([])
	})

	test("ignores a stale stack response after close and reopen", async () => {
		const firstStack = deferred<unknown>()
		const secondStack = deferred<unknown>()
		let stackCalls = 0
		const transport: BulkCausalTimeTransport = {
			stack() {
				stackCalls++
				return stackCalls === 1 ? firstStack.promise : secondStack.promise
			},
			async pause() {},
			async resume() {},
		}
		const model = new BulkCausalTimeModel(transport)

		model.open()
		expect(model.state).toBe("loading")
		expect(model.canPause).toBe(false)
		model.toggle()
		model.toggle()
		expect(stackCalls).toBe(2)
		secondStack.resolve([{id: 1, frontier: {acceptanceSequence: 9}}])
		await flushTasks()
		expect(model.state).toBe("paused")
		expect(model.frames[0]?.frontier.acceptanceSequence).toBe(9)

		firstStack.resolve([])
		await flushTasks()
		expect(model.state).toBe("paused")
		expect(model.frames[0]?.frontier.acceptanceSequence).toBe(9)
	})
})

function deferred<T>(): {
	promise: Promise<T>
	resolve(value: T): void
} {
	let resolvePromise!: (value: T) => void
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve
	})
	return {promise, resolve: resolvePromise}
}

const flushTasks = async (): Promise<void> => {
	await new Promise<void>((resolve) => setTimeout(resolve, 0))
}
