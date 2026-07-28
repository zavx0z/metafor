import type { BulkHudController, BulkHudOptions } from "@metafor/types/bulk/hud"
import {palette, UiSurface, uiIcons, type UiSurfaceRect} from "@ui/elements"
import {
	drawHudNodeViewPlan,
	HudSideTab,
	HudTimelinePanel,
	planHudNodeView,
	type HudNodeViewDocument,
	type HudNodeViewPlan,
	type HudTimelineDocument,
} from "@ui/hud"

const HUD_DOCK_Z = 90
const HUD_TIMELINE_Z = 80
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"
const NODE_VIEW_ACTIVE_CLASS = "metafor-node-view-active"
// Keep the node renderer as an isolated local prototype. It must not receive
// the live Bulk projection or allocate HUD surfaces until explicitly enabled.
const NODE_VIEW_CONNECTED = false

let appFullscreenFallbackActive = false

export type BulkHudInstallOptions = BulkHudOptions & {
	timeline: HudTimelineDocument
}

export type InstalledBulkHudController = BulkHudController & {
	setTimelineDocument(document: HudTimelineDocument): void
	timelineDocument(): HudTimelineDocument
}

export function installBulkHud(options: BulkHudInstallOptions): InstalledBulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkHudOptions["viewport"]
	readonly #fullscreenDock: BulkFullscreenDock
	readonly #timeline: BulkTimelineHudSurface
	readonly #nodeViewDock: BulkNodeViewDock
	readonly #nodeView: BulkNodeViewSurface
	readonly #timeDock: BulkTimeDock
	readonly #time: BulkTimeSurface
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudInstallOptions) {
		this.#viewport = options.viewport
		this.#timeline = new BulkTimelineHudSurface(options.timeline)
		this.#fullscreenDock = new BulkFullscreenDock(this)
		this.#nodeViewDock = new BulkNodeViewDock(this)
		this.#nodeView = new BulkNodeViewSurface(this)
		this.#timeDock = new BulkTimeDock(this)
		this.#time = new BulkTimeSurface()
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
		if (NODE_VIEW_CONNECTED) {
			this.#viewport.hud.addSurface(this.#nodeViewDock, () => ({x: 0, y: 116, w: 106, h: 34}), {zIndex: HUD_DOCK_Z})
			this.#viewport.hud.addSurface(this.#nodeView, (bounds) => this.#nodeViewRect(bounds), {zIndex: HUD_DOCK_Z + 1})
		}
		this.#viewport.hud.addSurface(
			this.#timeDock,
			() => ({x: 0, y: 72, w: 106, h: 34}),
			{zIndex: HUD_DOCK_Z},
		)
		this.#viewport.hud.addSurface(
			this.#time,
			(bounds) => this.#timeRect(bounds),
			{zIndex: HUD_DOCK_Z + 1},
		)
		// The causal panel is usable on first load without discovering its tab.
		this.#time.open()
		this.#viewport.hud.relayout()
		if (typeof document !== "undefined") {
			document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
			document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
		}
	}

	setTimelineDocument(document: HudTimelineDocument): void {
		this.#timeline.setDocument(document)
	}

	timelineDocument(): HudTimelineDocument {
		return this.#timeline.document
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

	toggleTime(): void {
		this.#time.toggle()
		this.#timeDock.requestRender()
		this.#viewport.hud.relayout()
	}

	timeActive(): boolean { return this.#time.active }

	#timeRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (!this.#time.active) return {x: -1, y: -1, w: 0, h: 0}
		const timeline = this.#timelineRect(bounds)
		const h = Math.min(bounds.h, Math.min(192, Math.max(148, Math.round(bounds.h * 0.24))))
		return {
			x: timeline.x,
			y: Math.max(0, timeline.y - h - 12),
			w: timeline.w,
			h,
		}
	}

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

	#timelineRect(bounds: {w: number; h: number}): UiSurfaceRect {
		const margin = Math.min(52, Math.max(18, Math.floor(bounds.w * 0.035)))
		const h = Math.min(224, Math.max(160, Math.floor(bounds.h * 0.32)))
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
	#document: HudTimelineDocument

	constructor(document: HudTimelineDocument) {
		super({
			borderRadiusPx: 12,
			padding: 8,
		})
		this.#document = document
		this.node.name = "BulkTimelineHudSurface"
	}

	get document(): HudTimelineDocument {
		return this.#document
	}

	setDocument(document: HudTimelineDocument): void {
		this.#document = document
		this.requestRender()
	}

	protected render(): void {
		HudTimelinePanel(this, this.#document, {x: 0, y: 0, w: this.rectW, h: this.rectH})
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

class BulkTimeDock extends UiSurface {
	constructor(private readonly hud: BulkHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkTimeDock"
	}

	protected render(): void {
		HudSideTab(this, {
			rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
			key: "bulk-dock:time",
			edge: "left",
			label: "Время",
			tooltip: this.hud.timeActive() ? "Закрыть временной стек" : "Открыть временной стек",
			tone: this.hud.timeActive() ? "active" : "neutral",
			onClick: () => this.hud.toggleTime(),
		})
	}
}

type TimeFrame = {
	id: number
	frontier: {acceptanceSequence: number}
	/** Filled by capture policy once a frame owns a measured snapshot cost. */
	resolution?: "exact" | "degraded" | "overloaded"
}

class BulkTimeSurface extends UiSurface {
	#active = false
	#frames: TimeFrame[] = []
	#state: "open" | "paused" | "error" = "open"
	#message = "Пауза создаёт первый keyframe"
	#playhead = 0

	constructor() {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkTimeSurface"
	}

	override get active(): boolean { return this.#active }

	toggle(): void {
		this.#active = !this.#active
		if (this.#active) void this.#refresh()
		this.requestRender()
	}

	open(): void {
		this.#active = true
		void this.#refresh()
		this.requestRender()
	}

	protected override render(): void {
		if (!this.#active) return
		const z = 1
		this.drawRoundedRect(12, 8, Math.max(0, this.rectW - 24), Math.max(0, this.rectH - 16), {
			radius: 12, fill: palette.bgElevated, border: palette.border, borderWidth: 1, z,
		})
		this.drawText("ВРЕМЯ · causal stack", 28, 21, {
			fontPx: 11, material: this.materials.cyan, z: z + 0.1,
		})
		this.drawText(this.#message, 28, 39, {
			fontPx: 10,
			material: this.#state === "error" ? this.materials.error : this.materials.muted,
			maxWidthPx: Math.max(80, this.rectW - 230),
			z: z + 0.1,
		})

		this.#button("time:pause", "Пауза", 28, 54, () => void this.#pause(), this.#state === "open")
		this.#button("time:resume", "Продолжить", 104, 54, () => void this.#resume(), this.#state === "paused")
		this.#button("time:step", "Шаг", 208, 54, () => this.#waitingStep(), false)

		const left = 28
		const right = Math.max(left + 1, this.rectW - 28)
		const trackTop = 92
		for (const [index, label] of ["Force", "Mass", "Boundary"].entries()) {
			const y = trackTop + index * 23
			this.drawText(label, left, y - 4, {
				fontPx: 9, material: this.materials.muted, z: z + 0.1,
			})
			this.drawRect(left + 58, y, Math.max(1, right - left - 58), 1, palette.borderDim, z + 0.02)
		}

		const railLeft = left + 58
		const railWidth = Math.max(1, right - railLeft)
		for (const frame of this.#frames) {
			const x = railLeft + railWidth * framePosition(frame, this.#frames)
			const selected = frame === this.#frames.at(-1)
			const fill = selected
				? palette.red
				: frame.resolution === "exact"
					? palette.green
					: frame.resolution === "degraded"
						? palette.orange
						: frame.resolution === "overloaded"
							? palette.red
							: palette.borderDim
			for (let row = 0; row < 3; row++) {
				this.drawRoundedRect(x - 3, trackTop - 4 + row * 23, 6, 8, {
					radius: 2, fill, border: palette.bg, borderWidth: 1, z: z + 0.08,
				})
			}
		}
		const current = this.#frames.at(-1)
		if (this.rectH >= 174) {
			const summary = current === undefined
				? "0 keyframes · точный снимок появится после Pause"
				: `frame ${current.id} · seq ${current.frontier.acceptanceSequence} · ${this.#frames.length} keyframes · ${keyframeLegend(current)}`
			this.drawText(summary, railLeft, trackTop + 73, {
				fontPx: 9, material: this.materials.muted, maxWidthPx: railWidth, z: z + 0.1,
			})
		}
		const headX = railLeft + railWidth * this.#playhead
		this.drawRect(headX, trackTop - 12, 1.5, 66, palette.cyan, z + 0.12)
		const movePlayhead = (x: number): void => {
			this.#playhead = Math.max(0, Math.min(1, (x - railLeft) / railWidth))
			this.#message = "Просмотр позиции; live и 3D не изменены"
			this.requestRender()
		}
		this.hit(railLeft, trackTop - 16, railWidth, 76, () => {}, {
			key: "time:playhead",
			cursor: "ew-resize",
			activeCursor: "ew-resize",
			onPointerDown: movePlayhead,
			onPointerMove: movePlayhead,
		})
	}

	#button(key: string, label: string, x: number, y: number, onClick: () => void, enabled: boolean): void {
		const w = label === "Продолжить" ? 94 : 62
		this.drawRoundedRect(x, y, w, 25, {
			radius: 7,
			fill: enabled ? palette.bgHot : palette.bgPanel,
			border: enabled ? palette.cyan : palette.borderDim,
			borderWidth: 1,
			z: 1.04,
		})
		this.drawText(label, x + 8, y + 7, {
			fontPx: 9, material: enabled ? this.materials.text : this.materials.muted, z: 1.12,
		})
		if (enabled) this.hit(x, y, w, 25, onClick, {
			key, cursor: "pointer", activeCursor: "pointer",
		})
	}

	async #refresh(): Promise<void> {
		try {
			const response = await fetch("/time/stack")
			if (!response.ok) throw new Error(await response.text())
			this.#frames = await response.json() as TimeFrame[]
			this.#state = this.#frames.length > 0 ? "paused" : "open"
			this.#playhead = this.#frames.length === 0 ? 0 : 1
			this.#message = this.#frames.length === 0 ? "Пауза создаёт первый keyframe" : `Keyframes: ${this.#frames.length}`
		} catch (error) {
			this.#state = "error"
			this.#message = `Время недоступно: ${error instanceof Error ? error.message : String(error)}`
		}
		this.requestRender()
	}

	async #pause(): Promise<void> {
		this.#message = "Жду causal frontier…"
		this.requestRender()
		try {
			const response = await fetch("/time/pause", {method: "POST"})
			if (!response.ok) throw new Error(await response.text())
			await this.#refresh()
		} catch (error) {
			this.#state = "error"
			this.#message = `Пауза не установлена: ${error instanceof Error ? error.message : String(error)}`
			this.requestRender()
		}
	}

	async #resume(): Promise<void> {
		try {
			const response = await fetch("/time/resume", {method: "POST"})
			if (!response.ok) throw new Error(await response.text())
			this.#frames = []
			this.#state = "open"
			this.#playhead = 0
			this.#message = "Приём Particle снова открыт"
		} catch (error) {
			this.#state = "error"
			this.#message = `Продолжение не выполнено: ${error instanceof Error ? error.message : String(error)}`
		}
		this.requestRender()
	}

	#waitingStep(): void {
		this.#message = "Шаг ждёт следующую Particle: UI ничего не генерирует"
		this.requestRender()
	}
}

const framePosition = (frame: TimeFrame, frames: readonly TimeFrame[]): number => {
	const first = frames[0]?.frontier.acceptanceSequence ?? 0
	const last = frames.at(-1)?.frontier.acceptanceSequence ?? first
	return last === first ? 0.5 : (frame.frontier.acceptanceSequence - first) / (last - first)
}

const keyframeLegend = (frame: TimeFrame): string =>
	frame.resolution === "exact" ? "точный" :
	frame.resolution === "degraded" ? "интервал" :
	frame.resolution === "overloaded" ? "перегруз" :
	"capture-метрика не подключена"

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
