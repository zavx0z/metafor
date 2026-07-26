import type { BulkHudController, BulkHudOptions } from "@metafor/types/bulk/hud"
import {palette, UiSurface, uiIcons, type UiSurfaceRect} from "@ui/elements"
import {drawHudNodeViewPlan, HudSideTab, planHudNodeView, type HudNodeViewDocument, type HudNodeViewPlan} from "@ui/hud"

const HUD_DOCK_Z = 90
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"
const NODE_VIEW_ACTIVE_CLASS = "metafor-node-view-active"
// Keep the node renderer as an isolated local prototype. It must not receive
// the live Bulk projection or allocate HUD surfaces until explicitly enabled.
const NODE_VIEW_CONNECTED = false

let appFullscreenFallbackActive = false

export function installBulkHud(options: BulkHudOptions): BulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkHudOptions["viewport"]
	readonly #fullscreenDock: BulkFullscreenDock
	readonly #nodeViewDock: BulkNodeViewDock
	readonly #nodeView: BulkNodeViewSurface
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudOptions) {
		this.#viewport = options.viewport
		this.#fullscreenDock = new BulkFullscreenDock(this)
		this.#nodeViewDock = new BulkNodeViewDock(this)
		this.#nodeView = new BulkNodeViewSurface(this)
		this.#viewport.hud.addSurface(
			this.#fullscreenDock,
			(bounds) => this.#fullscreenDockRect(bounds),
			{zIndex: HUD_DOCK_Z},
		)
		if (NODE_VIEW_CONNECTED) {
			this.#viewport.hud.addSurface(this.#nodeViewDock, () => ({x: 0, y: 116, w: 106, h: 34}), {zIndex: HUD_DOCK_Z})
			this.#viewport.hud.addSurface(this.#nodeView, (bounds) => this.#nodeViewRect(bounds), {zIndex: HUD_DOCK_Z + 1})
		}
		document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
	}

	setNodeView(document: HudNodeViewDocument): void {
		if (!NODE_VIEW_CONNECTED) return
		this.#nodeView.setDocument(document)
	}

	toggleNodeView(): void {
		if (!NODE_VIEW_CONNECTED) return
		this.#nodeView.toggle()
		this.#nodeViewDock.requestRender()
		this.#viewport.hud.relayout()
	}

	nodeViewActive(): boolean { return this.#nodeView.active }

	#nodeViewRect(bounds: {w: number; h: number}): UiSurfaceRect {
		return this.#nodeView.active ? {x: 0, y: 0, w: bounds.w, h: bounds.h} : {x: -1, y: -1, w: 0, h: 0}
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

class BulkNodeViewDock extends UiSurface {
	constructor(private readonly hud: BulkHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkNodeViewDock"
	}

	protected render(): void {
		HudSideTab(this, {
			rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
			key: "bulk-dock:node-view",
			edge: "left",
			label: "Ноды",
			tooltip: this.hud.nodeViewActive() ? "Закрыть Node View" : "Открыть Node View",
			tone: this.hud.nodeViewActive() ? "active" : "neutral",
			onClick: () => this.hud.toggleNodeView(),
		})
	}
}

class BulkNodeViewSurface extends UiSurface {
	#document: HudNodeViewDocument = {atoms: [], transitions: [], wires: []}
	#plan: HudNodeViewPlan = planHudNodeView(this.#document, {x: 0, y: 0, w: 0, h: 0})
	#active = false
	#pan = {x: 0, y: 0}
	#zoom = 1
	#fitPending = true
	#drag: {x: number; y: number; panX: number; panY: number} | null = null

	constructor(private readonly hud: BulkHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkNodeViewSurface"
	}

	override get active(): boolean { return this.#active }

	toggle(): void {
		this.#active = !this.#active
		document.documentElement.classList.toggle(NODE_VIEW_ACTIVE_CLASS, this.#active)
		this.#drag = null
		this.#fitPending = true
		this.requestRender()
	}

	setDocument(document: HudNodeViewDocument): void {
		this.#document = document
		// Geometry is derived once per projection update, never once per wheel/pan redraw.
		this.#plan = planHudNodeView(document, {x: 0, y: 0, w: 0, h: 0})
		this.#fitPending = true
		this.requestRender()
	}

	protected override render(): void {
		if (!this.#active) return
		this.drawRect(0, 0, this.rectW, this.rectH, palette.bg, 0)
		this.drawText("NODE VIEW · перетаскивай холст · колесо — масштаб", 18, 16, {fontPx: 12, material: this.materials.cyan, z: 0.2})
		if (this.#fitPending) this.#fitToView()
		drawHudNodeViewPlan(this, this.#plan, 0.3, {
			transform: {x: this.#pan.x, y: this.#pan.y, scale: this.#zoom},
			viewport: {x: 0, y: 42, w: this.rectW, h: Math.max(0, this.rectH - 42)},
		})
		this.hit(0, 0, this.rectW, this.rectH, () => {}, {
			key: "node-view:pan",
			cursor: "grab",
			activeCursor: "grabbing",
			onPointerDown: (x, y) => { this.#drag = {x, y, panX: this.#pan.x, panY: this.#pan.y} },
			onPointerMove: (x, y) => {
				if (!this.#drag) return
				this.#pan = {x: this.#drag.panX + x - this.#drag.x, y: this.#drag.panY + y - this.#drag.y}
				this.requestRender()
			},
			onPointerUp: () => { this.#drag = null },
		})
		this.wheel(0, 0, this.rectW, this.rectH, (event) => {
			event.preventDefault()
			const previous = this.#zoom
			const next = Math.max(0.18, Math.min(3, previous * (event.deltaY > 0 ? 0.9 : 1.1)))
			// Preserve the logical point under the cursor while zooming.
			this.#pan = {x: event.offsetX - (event.offsetX - this.#pan.x) * next / previous, y: event.offsetY - (event.offsetY - this.#pan.y) * next / previous}
			this.#zoom = next
			this.requestRender()
		}, "node-view:zoom")
		// Пункты навигации регистрируются после бесконечного холста, иначе
		// его обработчик pan перехватывает клик и из Node View нельзя выйти.
		HudSideTab(this, {rect: {x: 18, y: 8, w: 92, h: 30}, key: "node-view:space", edge: "top", label: "Space", tooltip: "Вернуться в Space", tone: "active", onClick: () => this.hud.toggleNodeView()})
		HudSideTab(this, {rect: {x: Math.max(122, this.rectW - 150), y: 8, w: 132, h: 30}, key: "node-view:fullscreen", edge: "top", label: "Полный режим", tooltip: "Полный экран", tone: "active", onClick: () => void this.hud.toggleFullscreen()})
	}

	#fitToView(): void {
		this.#fitPending = false
		const rects = [...this.#plan.atoms.map((layout) => layout.rect), ...this.#plan.transitions.map((layout) => layout.rect)]
		if (rects.length === 0 || this.rectW <= 0 || this.rectH <= 0) return
		const left = Math.min(...rects.map((rect) => rect.x))
		const top = Math.min(...rects.map((rect) => rect.y))
		const right = Math.max(...rects.map((rect) => rect.x + rect.w))
		const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
		const padding = 42
		const zoomX = Math.max(0.01, (this.rectW - padding * 2) / Math.max(1, right - left))
		const zoomY = Math.max(0.01, (this.rectH - 42 - padding * 2) / Math.max(1, bottom - top))
		this.#zoom = Math.max(0.18, Math.min(1, zoomX, zoomY))
		this.#pan = {x: (this.rectW - (right - left) * this.#zoom) / 2 - left * this.#zoom, y: 42 + (this.rectH - 42 - (bottom - top) * this.#zoom) / 2 - top * this.#zoom}
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
