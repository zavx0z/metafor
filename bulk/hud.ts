import type { BulkHudController, BulkHudOptions } from "@metafor/types/bulk/hud"
import { UiSurface, uiIcons, type UiSurfaceRect } from "@ui/elements"
import {
	HudSideTab,
	HudTimelinePanel,
	type HudTimelineDocument,
} from "@ui/hud"

const HUD_DOCK_Z = 90
const HUD_TIMELINE_Z = 80
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"

let appFullscreenFallbackActive = false

export type BulkHudInstallOptions = BulkHudOptions & {
	timeline: HudTimelineDocument
}

export type InstalledBulkHudController = BulkHudController & {
	timelineDocument(): HudTimelineDocument
}

export function installBulkHud(options: BulkHudInstallOptions): InstalledBulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkHudOptions["viewport"]
	readonly #timeline: BulkTimelineHudSurface
	readonly #fullscreenDock: BulkFullscreenDock
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudInstallOptions) {
		this.#viewport = options.viewport
		this.#timeline = new BulkTimelineHudSurface(options.timeline)
		this.#fullscreenDock = new BulkFullscreenDock(this)
		this.#viewport.hud.addSurface(
			this.#timeline,
			(bounds) => this.#timelineRect(bounds),
			{zIndex: HUD_TIMELINE_Z},
		)
		this.#viewport.hud.addSurface(
			this.#fullscreenDock,
			(bounds) => this.#fullscreenDockRect(bounds),
			{zIndex: HUD_DOCK_Z},
		)
		if (typeof document !== "undefined") {
			document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
			document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
		}
	}

	relayout(): void {
		this.#viewport.hud.relayout()
	}

	timelineDocument(): HudTimelineDocument {
		return this.#timeline.document
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

	#timelineRect(bounds: {w: number; h: number}): UiSurfaceRect {
		const margin = Math.min(52, Math.max(18, Math.floor(bounds.w * 0.035)))
		const h = Math.min(190, Math.max(132, Math.floor(bounds.h * 0.28)))
		return {
			x: margin,
			y: Math.max(42, bounds.h - h - 18),
			w: Math.max(1, bounds.w - margin * 2),
			h,
		}
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

export class BulkTimelineHudSurface extends UiSurface {
	constructor(readonly document: HudTimelineDocument) {
		super({
			borderRadiusPx: 12,
			padding: 8,
		})
		this.node.name = "BulkTimelineHudSurface"
	}

	protected render(): void {
		HudTimelinePanel(this, this.document, {x: 0, y: 0, w: this.rectW, h: this.rectH})
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
