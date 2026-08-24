import type {
	BulkHudController,
	BulkHudOptions,
	BulkTimeFrame,
} from "@bulk/types/hud"
import type {UiSurfaceRect} from "@layout/core/runtime"
import {UiSurface} from "@layout/core/surface"
import {StatusChip} from "@ui/components/badge"
import {Button, type ButtonVariant} from "@ui/components/button"
import {uiIcons} from "@ui/elements/icons"
import {palette, radii, type Tone} from "@ui/elements/theme"
import {HudSideTab} from "@ui/hud"
import {HudTimelinePanel} from "@ui/hud/timeline"
import {
	buildBulkCausalTimeline,
	bulkTimeControlDockRect,
	bulkTimePlayheadFromPlot,
	bulkTimeSurfaceRect,
	readBulkTimeFrames,
} from "./causal-time.ts"

const HUD_DOCK_Z = 90
const HUD_CAUSAL_TIME_Z = 80
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"

let appFullscreenFallbackActive = false

export function installBulkHud(options: BulkHudOptions): BulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkHudOptions["viewport"]
	readonly #fullscreenDock: BulkFullscreenDock
	readonly #timeModel: BulkCausalTimeModel
	readonly #time: BulkCausalTimelineSurface
	readonly #timeControls: BulkTimeControlDock
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudOptions) {
		this.#viewport = options.viewport
		this.#fullscreenDock = new BulkFullscreenDock(this)
		this.#timeModel = new BulkCausalTimeModel()
		this.#time = new BulkCausalTimelineSurface(this.#timeModel)
		this.#timeControls = new BulkTimeControlDock(this.#timeModel)
		this.#viewport.hud.addSurface(
			this.#fullscreenDock,
			(bounds) => this.#fullscreenDockRect(bounds),
			{zIndex: HUD_DOCK_Z},
		)
		this.#viewport.hud.addSurface(
			this.#time,
			(bounds) => this.#timeRect(bounds),
			{zIndex: HUD_CAUSAL_TIME_Z},
		)
		this.#viewport.hud.addSurface(
			this.#timeControls,
			(bounds) => this.#timeControlsRect(bounds),
			{zIndex: HUD_DOCK_Z + 1},
		)
		// The causal panel is usable on first load without discovering its tab.
		this.#timeModel.open()
		this.#viewport.hud.relayout()
		if (typeof document !== "undefined") {
			document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
			document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
		}
	}

	#timeRect(bounds: {w: number; h: number}): UiSurfaceRect {
		return bulkTimeSurfaceRect(bounds, this.#timeModel.active)
	}

	#timeControlsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		return bulkTimeControlDockRect(bounds, this.#timeModel.active)
	}

	relayout(): void {
		this.#viewport.hud.relayout()
	}

	async toggleFullscreen(): Promise<void> {
		try {
			if (appFullscreenActive()) {
				await exitAppFullscreen()
			} else {
				try {
					await requestAppFullscreen()
				} catch (error) {
					console.warn("fullscreen request failed, using viewport fallback:", error)
					setAppFullscreenFallback(true)
				}
			}
		} catch (error) {
			console.warn("fullscreen toggle failed:", error)
		}
		this.#handleFullscreenChange()
	}

	fullscreenActive(): boolean {
		return this.#fullscreen
	}

	#fullscreenDockRect(bounds: {w: number; h: number}): UiSurfaceRect {
		const w = 42
		return {x: Math.max(12, bounds.w - w - 12), y: 0, w, h: 34}
	}

	#handleFullscreenChange(): void {
		if (appFullscreenElement() !== null && appFullscreenFallbackActive) {
			setAppFullscreenFallback(false)
		}
		const next = appFullscreenActive()
		if (this.#fullscreen === next) return
		this.#fullscreen = next
		this.#fullscreenDock.requestRender()
	}
}

class BulkFullscreenDock extends UiSurface {
	constructor(private readonly hud: BulkHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkFullscreenDock"
	}

	protected render(): void {
		HudSideTab(this, {
			rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
			key: "bulk-dock:fullscreen",
			edge: "top",
			icon: this.hud.fullscreenActive() ? uiIcons.collapse : uiIcons.expand,
			label: "",
			tooltip: this.hud.fullscreenActive() ? "Выйти из полного экрана" : "Полный экран",
			tone: "neutral",
			onClick: () => void this.hud.toggleFullscreen(),
		})
	}
}

export type BulkTimeState = "loading" | "open" | "pausing" | "paused" | "resuming" | "error"
type BulkTimeListener = () => void

export type BulkCausalTimeTransport = {
	stack(): Promise<unknown>
	pause(): Promise<void>
	resume(): Promise<void>
}

const bulkCausalTimeHttpTransport: BulkCausalTimeTransport = {
	async stack(): Promise<unknown> {
		const response = await fetch("/time/stack")
		if (!response.ok) throw new Error(await responseError(response))
		return await response.json()
	},
	async pause(): Promise<void> {
		const response = await fetch("/time/pause", {method: "POST"})
		if (!response.ok) throw new Error(await responseError(response))
	},
	async resume(): Promise<void> {
		const response = await fetch("/time/resume", {method: "POST"})
		if (!response.ok) throw new Error(await responseError(response))
	},
}

export class BulkCausalTimeModel {
	#active = false
	#frames: BulkTimeFrame[] = []
	#state: BulkTimeState = "loading"
	#message = "Пауза создаёт первый keyframe"
	#playhead = 0
	#operationEpoch = 0
	readonly #listeners = new Set<BulkTimeListener>()

	constructor(private readonly transport: BulkCausalTimeTransport = bulkCausalTimeHttpTransport) {}

	get active(): boolean { return this.#active }
	get frames(): readonly BulkTimeFrame[] { return this.#frames }
	get state(): BulkTimeState { return this.#state }
	get message(): string { return this.#message }
	get playhead(): number { return this.#playhead }
	get canPause(): boolean { return this.#active && this.#state === "open" }
	get canResume(): boolean { return this.#active && this.#state === "paused" }
	get canStep(): boolean { return false }

	subscribe(listener: BulkTimeListener): () => void {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	toggle(): void {
		if (!this.#active) {
			this.open()
			return
		}
		this.#active = false
		this.#operationEpoch++
		this.#notify()
	}

	open(): void {
		if (this.#active) return
		this.#active = true
		const epoch = this.#beginOperation("loading", "Читаю causal stack…")
		void this.#loadStack(epoch)
	}

	setPlayhead(value: number): void {
		this.#playhead = Math.max(0, Math.min(1, value))
		this.#message = "Просмотр позиции; live и 3D не изменены"
		this.#notify()
	}

	async #loadStack(epoch: number): Promise<void> {
		try {
			const frames = readBulkTimeFrames(await this.transport.stack())
			if (!this.#isCurrent(epoch)) return
			this.#frames = frames
			this.#state = this.#frames.length > 0 ? "paused" : "open"
			this.#playhead = this.#frames.length === 0 ? 0 : 1
			this.#message = this.#frames.length === 0 ? "Пауза создаёт первый keyframe" : `Keyframes: ${this.#frames.length}`
		} catch (error) {
			if (!this.#isCurrent(epoch)) return
			this.#state = "error"
			this.#message = `Время недоступно: ${errorMessage(error)}`
		}
		this.#notify()
	}

	async pause(): Promise<void> {
		if (!this.canPause) return
		const epoch = this.#beginOperation("pausing", "Жду causal frontier…")
		try {
			await this.transport.pause()
			if (!this.#isCurrent(epoch)) return
			await this.#loadStack(epoch)
		} catch (error) {
			if (!this.#isCurrent(epoch)) return
			this.#state = "error"
			this.#message = `Пауза не установлена: ${errorMessage(error)}`
			this.#notify()
		}
	}

	async resume(): Promise<void> {
		if (!this.canResume) return
		const epoch = this.#beginOperation("resuming", "Освобождаю causal frontier…")
		try {
			await this.transport.resume()
			if (!this.#isCurrent(epoch)) return
			this.#frames = []
			this.#state = "open"
			this.#playhead = 0
			this.#message = "Приём Particle снова открыт"
		} catch (error) {
			if (!this.#isCurrent(epoch)) return
			this.#state = "error"
			this.#message = `Продолжение не выполнено: ${errorMessage(error)}`
		}
		this.#notify()
	}

	#beginOperation(state: BulkTimeState, message: string): number {
		const epoch = ++this.#operationEpoch
		this.#state = state
		this.#message = message
		this.#notify()
		return epoch
	}

	#isCurrent(epoch: number): boolean {
		return this.#active && this.#operationEpoch === epoch
	}

	#notify(): void {
		for (const listener of this.#listeners) listener()
	}
}

type BulkTimeDockItem = {
	x: number
	w: number
}

export type BulkTimeControlDockPlan = {
	keyframes: BulkTimeDockItem | null
	sequence: BulkTimeDockItem | null
	pause: BulkTimeDockItem
	resume: BulkTimeDockItem
	step: BulkTimeDockItem
	fontPx: number
}

export type BulkTimeModeButtonPlan = {
	pause: {
		selected: boolean
		tone: Tone
		variant: ButtonVariant
		iconSrc: string
		borderWidth: number
	}
	resume: {
		selected: boolean
		tone: Tone
		variant: ButtonVariant
		iconSrc: string
		borderWidth: number
	}
}

export const planBulkTimeModeButtons = (state: BulkTimeState): BulkTimeModeButtonPlan => {
	const paused = state === "paused"
	const live = state === "open"
	return {
		pause: {
			selected: paused,
			tone: paused ? "paused" : "neutral",
			variant: paused ? "contained" : "outlined",
			iconSrc: paused ? uiIcons.debugPause : uiIcons.pause,
			borderWidth: paused ? 2 : 1,
		},
		resume: {
			selected: live,
			tone: live ? "live" : "neutral",
			variant: live ? "contained" : "outlined",
			iconSrc: live ? uiIcons.debugResume : uiIcons.resume,
			borderWidth: live ? 2 : 1,
		},
	}
}

export const planBulkTimeControlDock = (width: number): BulkTimeControlDockPlan => {
	if (width >= 292) {
		return {
			keyframes: {x: 8, w: 66},
			sequence: {x: 218, w: 60},
			pause: {x: 86, w: 36},
			resume: {x: 128, w: 36},
			step: {x: 170, w: 36},
			fontPx: 9,
		}
	}
	if (width >= 236) {
		const offset = Math.floor((width - 236) / 2)
		return {
			keyframes: {x: 6 + offset, w: 56},
			sequence: {x: 174 + offset, w: 52},
			pause: {x: 70 + offset, w: 30},
			resume: {x: 103 + offset, w: 30},
			step: {x: 136 + offset, w: 30},
			fontPx: 8,
		}
	}
	const controlsWidth = 96
	const controlsX = Math.max(6, Math.floor((width - controlsWidth) / 2))
	return {
		keyframes: null,
		sequence: null,
		pause: {x: controlsX, w: 30},
		resume: {x: controlsX + 33, w: 30},
		step: {x: controlsX + 66, w: 30},
		fontPx: 8,
	}
}

export const bulkTimeCountersVisible = (frameCount: number): boolean =>
	Number.isSafeInteger(frameCount) && frameCount > 0

class BulkCausalTimelineSurface extends UiSurface {
	constructor(private readonly model: BulkCausalTimeModel) {
		super({bgColor: null, borderColor: null, padding: 4})
		this.node.name = "BulkCausalTimelineSurface"
		this.model.subscribe(() => this.requestRender())
	}

	override get active(): boolean { return this.model.active }

	protected override render(): void {
		if (!this.model.active) return
		const plan = HudTimelinePanel(
			this,
			buildBulkCausalTimeline(this.model.frames, this.model.playhead),
			{x: 0, y: 0, w: this.rectW, h: this.rectH},
			{
				showHeader: false,
				labelWidth: 76,
				panelPadding: 4,
				trackMinHeight: 0,
				trackFontPx: 8,
				balanceLabelGutter: true,
			},
		)
		const movePlayhead = (x: number): void => {
			this.model.setPlayhead(bulkTimePlayheadFromPlot(
				this.model.frames,
				(x - plan.plot.x) / plan.plot.w,
			))
		}
		this.hit(plan.plot.x, plan.plot.y, plan.plot.w, plan.plot.h, () => {}, {
			key: "time:playhead",
			cursor: "ew-resize",
			activeCursor: "ew-resize",
			onPointerDown: movePlayhead,
			onPointerMove: movePlayhead,
		})
	}
}

class BulkTimeControlDock extends UiSurface {
	constructor(private readonly model: BulkCausalTimeModel) {
		super({
			bgColor: palette.bgToolbar,
			borderColor: null,
			borderRadiusPx: radii.pane,
		})
		this.node.name = "BulkTimeControlDock"
		this.model.subscribe(() => this.requestRender())
	}

	protected override render(): void {
		if (!this.model.active) return
		const plan = planBulkTimeControlDock(this.rectW)
		const mode = planBulkTimeModeButtons(this.model.state)
		const y = Math.max(0, (this.rectH - 30) / 2)

		const showCounters = bulkTimeCountersVisible(this.model.frames.length)
		if (showCounters && plan.keyframes !== null) {
			StatusChip(this, plan.keyframes.x, y + 3, plan.keyframes.w, 24, {
				label: `КАДРЫ ${this.model.frames.length}`,
				variant: "subtle",
				fontPx: plan.fontPx,
				tooltip: "Keyframes в causal stack",
				tooltipDelayMs: 180,
			})
		}
		if (showCounters && plan.sequence !== null) {
			StatusChip(this, plan.sequence.x, y + 3, plan.sequence.w, 24, {
				label: `ТАКТ ${currentSequence(this.model)}`,
				variant: "subtle",
				fontPx: plan.fontPx,
				tooltip: "Acceptance sequence выбранного playhead",
				tooltipDelayMs: 180,
			})
		}
		Button(this, plan.pause.x, y, plan.pause.w, 30, {
			label: "Пауза",
			iconSrc: mode.pause.iconSrc,
			iconOnly: true,
			iconSizePx: 14,
			size: "small",
			variant: mode.pause.variant,
			radius: 7,
			tone: mode.pause.tone,
			selected: mode.pause.selected,
			sx: {borderWidth: mode.pause.borderWidth},
			disabled: !this.model.canPause,
			action: () => void this.model.pause(),
		})
		Button(this, plan.resume.x, y, plan.resume.w, 30, {
			label: "Продолжить",
			iconSrc: mode.resume.iconSrc,
			iconOnly: true,
			iconSizePx: 14,
			size: "small",
			variant: mode.resume.variant,
			radius: 7,
			tone: mode.resume.tone,
			selected: mode.resume.selected,
			sx: {borderWidth: mode.resume.borderWidth},
			disabled: !this.model.canResume,
			action: () => void this.model.resume(),
		})
		Button(this, plan.step.x, y, plan.step.w, 30, {
			label: "Шаг",
			iconSrc: uiIcons.stepOver,
			iconOnly: true,
			iconSizePx: 14,
			size: "small",
			variant: "outlined",
			radius: 7,
			tone: "neutral",
			disabled: !this.model.canStep,
			action: () => {},
		})
	}
}

const currentSequence = (model: BulkCausalTimeModel): number => {
	const first = model.frames[0]?.frontier.acceptanceSequence ?? 0
	const last = model.frames.at(-1)?.frontier.acceptanceSequence ?? first
	return Math.round(first + (last - first) * model.playhead)
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error)

const responseError = async (response: Response): Promise<string> => {
	const text = await response.text()
	try {
		const value = JSON.parse(text) as {error?: unknown}
		if (typeof value.error === "string" && value.error.length > 0) return value.error
		return `HTTP ${response.status}`
	} catch {
		return text || `HTTP ${response.status}`
	}
}

function appFullscreenElement(): Element | null {
	if (typeof document === "undefined") return null
	const webkitDocument = document as Document & {webkitFullscreenElement?: Element | null}
	return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null
}

function appFullscreenActive(): boolean {
	return appFullscreenElement() !== null || appFullscreenFallbackActive
}

async function requestAppFullscreen(): Promise<void> {
	const targets = fullscreenTargetCandidates()
	let lastError: unknown = null
	for (const target of targets) {
		try {
			await requestElementFullscreen(target)
			return
		} catch (error) {
			lastError = error
		}
	}
	throw lastError ?? new Error("fullscreen request failed")
}

async function requestElementFullscreen(target: Element): Promise<void> {
	type FullscreenTarget = Element & {
		webkitRequestFullscreen?: () => Promise<void> | void
	}
	const request = target.requestFullscreen ?? (target as FullscreenTarget).webkitRequestFullscreen
	if (request === undefined) {
		throw new Error(`fullscreen is not available on ${target.tagName.toLowerCase()}`)
	}
	await request.call(target)
}

async function exitAppFullscreen(): Promise<void> {
	setAppFullscreenFallback(false)
	type FullscreenDocument = Document & {webkitExitFullscreen?: () => Promise<void> | void}
	const fullscreenDocument = document as FullscreenDocument
	if (document.exitFullscreen !== undefined && document.fullscreenElement !== null) {
		await document.exitFullscreen()
	} else if (
		fullscreenDocument.webkitExitFullscreen !== undefined &&
		appFullscreenElement() !== null
	) {
		await fullscreenDocument.webkitExitFullscreen()
	}
}

function setAppFullscreenFallback(active: boolean): void {
	appFullscreenFallbackActive = active
	document.documentElement.classList.toggle(APP_FULLSCREEN_FALLBACK_CLASS, active)
	if (active) requestAppFullscreenFallbackResize()
}

function requestAppFullscreenFallbackResize(): void {
	window.dispatchEvent(new Event("resize"))
	window.setTimeout(() => window.dispatchEvent(new Event("resize")), 60)
}

function fullscreenTargetCandidates(): Element[] {
	const canvas = document.getElementById("bulk-canvas")
	const targets: Element[] = []
	if (canvas?.parentElement !== undefined && canvas.parentElement !== null) {
		targets.push(canvas.parentElement)
	}
	if (canvas !== null) targets.push(canvas)
	targets.push(document.documentElement)
	return targets
}
