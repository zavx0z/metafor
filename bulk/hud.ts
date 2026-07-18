import type { BulkHudController, BulkHudOptions } from "@metafor/types/bulk/hud"
import { UiSurface, uiIcons, type UiSurfaceRect } from "@ui/elements"
import { HudSideTab } from "@ui/hud"

const HUD_DOCK_Z = 90
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"

let appFullscreenFallbackActive = false

export function installBulkHud(options: BulkHudOptions): BulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkHudOptions["viewport"]
	readonly #fullscreenDock: BulkFullscreenDock
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudOptions) {
		this.#viewport = options.viewport
		this.#fullscreenDock = new BulkFullscreenDock(this)
		this.#viewport.hud.addSurface(
			this.#fullscreenDock,
			(bounds) => this.#fullscreenDockRect(bounds),
			{zIndex: HUD_DOCK_Z},
		)
		document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
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

function appFullscreenElement(): Element | null {
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
