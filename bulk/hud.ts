import type {BulkViewportController, BulkViewportStats} from "bulk/web"
import {UiSurface, Z, div, palette, radii, uiIcons, type DivScrollContext, type UiSurfaceRect} from "@ui/elements"
import {Button, IconButton, SliderControl, Switcher, TextField} from "@ui/components"
import {HudSideTab} from "@ui/hud"
import {
	BULK_LAYOUT_SETTING_KEYS,
	BULK_RENDER_SETTING_KEYS,
	BULK_SETTINGS_BY_KEY,
	DEFAULT_BULK_SCENE_SRC,
	type BulkRenderSettings,
	type BulkSettingKey,
} from "bulk/settings"
import type {BulkLayoutSettings} from "@bulk/gravity/layout"

export type BulkHudSettingsSnapshot = {
	layoutSettings: Partial<BulkLayoutSettings>
	renderSettings: Partial<BulkRenderSettings>
}

export type BulkHudOptions = {
	viewport: BulkViewportController
	initialSrc: string
	initialSettings: BulkHudSettingsSnapshot
	onApply(src: string, settings: BulkHudSettingsSnapshot): void
	onRenderSettingsChange(settings: Partial<BulkRenderSettings>): void
	onSettingsPersist(settings: BulkHudSettingsSnapshot): void
}

export type BulkHudController = {
	currentSrc(): string
	relayout(): void
	setBusy(busy: boolean): void
	setConnectionStatus(online: boolean): void
	setStats(stats: BulkViewportStats): void
	settingsSnapshot(): BulkHudSettingsSnapshot
}

type SettingsTab = "scene" | "geometry" | "render"
type DockButtonKind = "settings" | "fullscreen"

const SETTINGS_MIN_W = 310
const SETTINGS_MAX_W = 380
const SETTINGS_MIN_H = 360
const SETTINGS_MAX_H = 640
const SETTINGS_SCROLL_KEY = "bulk-settings-scroll"
const HUD_PANEL_Z = 80
const HUD_DOCK_Z = 90
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"

let appFullscreenFallbackActive = false
let appFullscreenFallbackReason = ""

export function installBulkHud(options: BulkHudOptions): BulkHudController {
	return new BulkHud(options)
}

class BulkHud implements BulkHudController {
	readonly #viewport: BulkViewportController
	readonly #onApply: BulkHudOptions["onApply"]
	readonly #onRenderSettingsChange: BulkHudOptions["onRenderSettingsChange"]
	readonly #onSettingsPersist: BulkHudOptions["onSettingsPersist"]
	readonly #settingsPane: BulkSettingsPane
	readonly #settingsDock: BulkDockButton
	readonly #fullscreenDock: BulkDockButton
	#settingsOpen = false
	#src: string
	#settings: BulkHudSettingsSnapshot
	#stats: BulkViewportStats = {darkParticleCount: 0, fieldParticleCount: 0}
	#busy = true
	#connected = false
	#fullscreen = appFullscreenActive()

	constructor(options: BulkHudOptions) {
		this.#viewport = options.viewport
		this.#onApply = options.onApply
		this.#onRenderSettingsChange = options.onRenderSettingsChange
		this.#onSettingsPersist = options.onSettingsPersist
		this.#src = options.initialSrc
		this.#settings = cloneSettings(options.initialSettings)
		this.#settingsPane = new BulkSettingsPane(this)
		this.#settingsDock = new BulkDockButton(this, "settings")
		this.#fullscreenDock = new BulkDockButton(this, "fullscreen")

		this.#viewport.hud.addSurface(this.#settingsPane, (bounds) => this.#settingsRect(bounds), {zIndex: HUD_PANEL_Z})
		this.#viewport.hud.addSurface(this.#settingsDock, (bounds) => this.#dockRect("settings", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#fullscreenDock, (bounds) => this.#dockRect("fullscreen", bounds), {zIndex: HUD_DOCK_Z})
		document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
	}

	currentSrc(): string {
		return this.#src
	}

	settingsSnapshot(): BulkHudSettingsSnapshot {
		return cloneSettings(this.#settings)
	}

	setBusy(busy: boolean): void {
		if (this.#busy === busy) return
		this.#busy = busy
		this.#settingsPane.requestRender()
	}

	setConnectionStatus(online: boolean): void {
		if (this.#connected === online) return
		this.#connected = online
		this.#settingsPane.requestRender()
	}

	setStats(stats: BulkViewportStats): void {
		this.#stats = stats
		this.#settingsPane.requestRender()
	}

	relayout(): void {
		this.#viewport.hud.relayout()
	}

	settingsOpen(): boolean {
		return this.#settingsOpen
	}

	toggleSettings(): void {
		this.#settingsOpen = !this.#settingsOpen
		this.#viewport.hud.relayout()
		this.#settingsDock.requestRender()
		this.#settingsPane.requestRender()
	}

	async toggleFullscreen(): Promise<void> {
		try {
			if (appFullscreenActive()) {
				await exitAppFullscreen()
			} else {
				try {
					await requestAppFullscreen()
				} catch (error) {
					setAppFullscreenFallback(true, errorMessage(error))
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

	connectionLine(): string {
		return this.#connected ? "socket online" : "socket offline"
	}

	statsLine(): string {
		const root = this.#stats.rootSrc ? `${this.#stats.rootSrc}: ` : ""
		return `${root}${this.#stats.darkParticleCount} Dark particles / ${this.#stats.fieldParticleCount} field particles`
	}

	busy(): boolean {
		return this.#busy
	}

	srcDraft(): string {
		return this.#src
	}

	setSrcDraft(value: string): void {
		if (this.#src === value) return
		this.#src = value
		this.#settingsPane.requestRender()
	}

	apply(): void {
		this.#busy = true
		this.#settingsPane.requestRender()
		this.#onApply(this.#src.trim() || DEFAULT_BULK_SCENE_SRC, this.settingsSnapshot())
	}

	settingValue(key: BulkSettingKey): boolean | number {
		const config = BULK_SETTINGS_BY_KEY[key]
		if (config.section === "render") return this.#settings.renderSettings[key as keyof BulkRenderSettings] ?? config.defaultValue
		return this.#settings.layoutSettings[key as keyof BulkLayoutSettings] ?? config.defaultValue
	}

	setSetting(key: BulkSettingKey, value: boolean | number): void {
		const config = BULK_SETTINGS_BY_KEY[key]
		if (typeof config.defaultValue === "boolean") {
			if (typeof value !== "boolean") return
			if (config.section === "render") {
				this.#settings.renderSettings = {...this.#settings.renderSettings, [key]: value}
				this.#onRenderSettingsChange(this.#settings.renderSettings)
			} else {
				this.#settings.layoutSettings = {...this.#settings.layoutSettings, [key]: value}
			}
		} else {
			const next = clampSettingValue(key, Number(value))
			if (config.section === "render") {
				this.#settings.renderSettings = {...this.#settings.renderSettings, [key]: next}
				this.#onRenderSettingsChange(this.#settings.renderSettings)
			} else {
				this.#settings.layoutSettings = {...this.#settings.layoutSettings, [key]: next}
			}
		}
		this.#onSettingsPersist(this.settingsSnapshot())
		this.#settingsPane.requestRender()
	}

	stepSetting(key: BulkSettingKey, direction: -1 | 1): void {
		const config = BULK_SETTINGS_BY_KEY[key]
		if (typeof config.defaultValue === "boolean") {
			this.setSetting(key, !(this.settingValue(key) === true))
			return
		}
		this.setSetting(key, Number(this.settingValue(key)) + (config.step ?? 1) * direction)
	}

	#settingsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (!this.#settingsOpen) return hiddenRect()
		const w = clampNumber(Math.min(SETTINGS_MAX_W, bounds.w - 24), Math.min(SETTINGS_MIN_W, bounds.w - 24), SETTINGS_MAX_W)
		const h = clampNumber(Math.min(SETTINGS_MAX_H, bounds.h - 72), Math.min(SETTINGS_MIN_H, bounds.h - 72), SETTINGS_MAX_H)
		return {
			x: Math.max(12, bounds.w - w - 12),
			y: 52,
			w,
			h,
		}
	}

	#dockRect(kind: DockButtonKind, bounds: {w: number; h: number}): UiSurfaceRect {
		const w = kind === "settings" ? 116 : 42
		const h = 34
		const y = 0
		if (kind === "settings") return {x: 12, y, w, h}
		return {x: Math.max(12, bounds.w - w - 12), y, w, h}
	}

	#handleFullscreenChange(): void {
		if (appFullscreenElement() !== null && appFullscreenFallbackActive) setAppFullscreenFallback(false, "")
		const next = appFullscreenActive()
		if (this.#fullscreen === next) return
		this.#fullscreen = next
		this.#fullscreenDock.requestRender()
	}
}

class BulkSettingsPane extends UiSurface {
	#tab: SettingsTab = "scene"

	constructor(private readonly hud: BulkHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "BulkSettingsPane"
	}

	protected render(): void {
		const w = Math.max(1, this.rectW)
		const h = Math.max(1, this.rectH)
		this.drawRoundedRect(0, 0, w, h, {
			radius: radii.pane,
			fill: palette.bgPanelDim,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.CONTAINER,
		})
		this.#renderHeader(w)
		const body = {x: 10, y: 48, w: Math.max(1, w - 20), h: Math.max(1, h - 58)}
		this.#renderBody(body)
	}

	#renderHeader(w: number): void {
		IconButton(this, 10, 8, 24, 24, {
			label: "Свернуть настройки",
			iconSrc: uiIcons.minus,
			action: () => this.hud.toggleSettings(),
		})
		this.drawText("Settings", 42, 11, {
			fontPx: 13,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, w - 88),
			z: Z.TEXT,
		})
		this.drawText("bulk", 120, 12, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, w - 164),
			z: Z.TEXT,
		})
		const ruleY = 40
		this.drawRect(10, ruleY, Math.max(1, w - 20), 1, palette.borderDim, Z.SEPARATOR)
	}

	#renderBody(rect: UiSurfaceRect): void {
		const tabsH = 30
		this.#drawTabs(rect.x, rect.y, rect.w, tabsH)
		const scrollRect = {
			x: rect.x,
			y: rect.y + tabsH + 8,
			w: rect.w,
			h: Math.max(1, rect.h - tabsH - 8),
		}
		div(this, scrollRect.x, scrollRect.y, scrollRect.w, scrollRect.h, {
			key: `${SETTINGS_SCROLL_KEY}:${this.#tab}`,
			scrollContentHeight: Math.max(scrollRect.h, this.#contentHeight()),
			style: {
				background: null,
				borderColor: null,
				borderRadius: 0,
				padding: 0,
				overflowY: "auto",
				scrollbarWidth: 4,
			},
			children: (ctx) => this.#renderScrolled(scrollRect, ctx),
		})
	}

	#drawTabs(x: number, y: number, w: number, h: number): void {
		const tabs: Array<{id: SettingsTab; label: string}> = [
			{id: "scene", label: "Сцена"},
			{id: "geometry", label: "Геометрия"},
			{id: "render", label: "Рендер"},
		]
		const gap = 6
		const tabW = Math.max(1, (w - gap * (tabs.length - 1)) / tabs.length)
		for (const [index, tab] of tabs.entries()) {
			const active = this.#tab === tab.id
			Button(this, x + index * (tabW + gap), y, tabW, h, {
				label: tab.label,
				size: "small",
				variant: active ? "contained" : "outlined",
				color: active ? "primary" : "neutral",
				radius: 7,
				action: () => {
					this.#tab = tab.id
					this.requestRender()
				},
			})
		}
	}

	#renderScrolled(rect: UiSurfaceRect, ctx: DivScrollContext): void {
		const x = rect.x + 2
		let y = rect.y + 4 - ctx.scrollTop
		const w = Math.max(1, rect.w - 10)
		if (this.#tab === "scene") {
			this.#renderScene(x, y, w)
			return
		}
		if (this.#tab === "geometry") {
			this.#drawSection("Геометрия", BULK_LAYOUT_SETTING_KEYS, x, y, w)
			return
		}
		y = this.#drawSection("Космос", ["animationEnabled"], x, y, w)
		y = this.#drawSection("Детализация", ["detailDensityFactor", "detailLevelMultiplier", "baseDepth", "wireframeOpacity"], x, y, w)
		y = this.#drawSection("Тор", ["torusCrossRingRotationDeg", "torusRadialSegments", "torusTubularSegments"], x, y, w)
		this.#drawSection("Подписи", ["labelVisibleLevels", "labelFontSizeMm", "labelSurfaceOffsetMm"], x, y, w)
	}

	#renderScene(x: number, y: number, w: number): number {
		this.#drawStatusRow(x, y, w)
		y += 54
		TextField(this, x, y, w, 34, {
			key: "bulk-root-src",
			value: this.hud.srcDraft(),
			placeholder: "Root SRC",
			submitOnEnter: true,
			onChange: (value) => this.hud.setSrcDraft(value),
			onSubmit: () => this.hud.apply(),
			sx: {fontSize: 12, borderRadius: 8, background: "bgInput", borderColor: "borderDim", color: "text"},
		})
		y += 44
		Button(this, x, y, w, 34, {
			label: this.hud.busy() ? "Считаю сцену" : "Пересчитать сцену",
			disabled: this.hud.busy(),
			color: "primary",
			variant: "contained",
			radius: 8,
			action: () => this.hud.apply(),
		})
		y += 52
		return this.#drawSection("Быстрый рендер", ["animationEnabled", "wireframeOpacity", "labelVisibleLevels"], x, y, w)
	}

	#drawStatusRow(x: number, y: number, w: number): void {
		const online = this.hud.connectionLine().includes("online")
		this.drawRoundedRect(x, y, w, 42, {
			radius: 8,
			fill: palette.bgInput,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.ELEMENT,
		})
		this.drawText(this.hud.connectionLine(), x + 10, y + 8, {
			fontPx: 10,
			material: online ? this.materials.green : this.materials.muted,
			maxWidthPx: Math.max(1, w - 20),
			z: Z.TEXT,
		})
		this.drawText(this.hud.statsLine(), x + 10, y + 24, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, w - 20),
			z: Z.TEXT,
		})
	}

	#drawSection(title: string, keys: readonly BulkSettingKey[], x: number, y: number, w: number): number {
		this.drawText(title, x, y, {fontPx: 11, material: this.materials.cyan, maxWidthPx: w, z: Z.TEXT})
		y += 19
		for (const key of keys) y = this.#drawSetting(key, x, y, w)
		return y + 14
	}

	#drawSetting(key: BulkSettingKey, x: number, y: number, w: number): number {
		const config = BULK_SETTINGS_BY_KEY[key]
		const value = this.hud.settingValue(key)
		if (typeof config.defaultValue === "boolean") {
			return this.#drawBooleanRow(config.label, config.description, value === true, x, y, w, (checked) => this.hud.setSetting(key, checked))
		}
		const min = typeof config.min === "number" ? config.min : 0
		const max = typeof config.max === "number" ? config.max : Math.max(1, Number(config.defaultValue) * 2)
		return SliderControl(this, x, y, w, {
			key: `bulk-setting:${key}`,
			label: config.label,
			value: Number(value),
			min,
			max,
			step: config.step ?? 1,
			format: (next) => formatSettingValue(next, config.step),
			onChange: (next) => this.hud.setSetting(key, next),
		})
	}

	#drawBooleanRow(label: string, description: string, checked: boolean, x: number, y: number, w: number, onChange: (checked: boolean) => void): number {
		this.drawText(label, x, y + 3, {
			fontPx: 10,
			material: this.materials.text,
			maxWidthPx: Math.max(1, w - 64),
			z: Z.TEXT,
		})
		this.drawText(description, x, y + 18, {
			fontPx: 8,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, w - 64),
			z: Z.TEXT,
		})
		Switcher(this, x + w - 50, y + 7, 44, 22, {
			checked,
			key: `settings-switch:${label}`,
			tooltip: label,
			onChange,
		})
		return y + 42
	}

	#contentHeight(): number {
		if (this.#tab === "scene") return 244
		if (this.#tab === "geometry") return 36 + BULK_LAYOUT_SETTING_KEYS.length * 46
		return 36 + BULK_RENDER_SETTING_KEYS.length * 46
	}
}

class BulkDockButton extends UiSurface {
	constructor(private readonly hud: BulkHud, private readonly kind: DockButtonKind) {
		super({bgColor: null, borderColor: null})
		this.node.name = `BulkDockButton:${kind}`
	}

	protected render(): void {
		HudSideTab(this, {
			rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
			key: `bulk-dock:${this.kind}`,
			edge: "top",
			icon: this.#icon(),
			label: this.kind === "settings" ? "Settings" : "",
			tooltip: this.#tooltip(),
			tone: this.kind === "settings" && this.hud.settingsOpen() ? "active" : "neutral",
			onClick: () => {
				if (this.kind === "settings") this.hud.toggleSettings()
				else void this.hud.toggleFullscreen()
			},
		})
	}

	#icon(): string {
		if (this.kind === "settings") return uiIcons.manual
		return this.hud.fullscreenActive() ? uiIcons.collapse : uiIcons.expand
	}

	#tooltip(): string {
		if (this.kind === "settings") return this.hud.settingsOpen() ? "Свернуть настройки" : "Открыть настройки"
		return this.hud.fullscreenActive() ? "Выйти из полного экрана" : "Полный экран"
	}
}

function cloneSettings(settings: BulkHudSettingsSnapshot): BulkHudSettingsSnapshot {
	return {
		layoutSettings: {...settings.layoutSettings},
		renderSettings: {...settings.renderSettings},
	}
}

function clampSettingValue(key: BulkSettingKey, value: number): number {
	const config = BULK_SETTINGS_BY_KEY[key]
	const min = typeof config.min === "number" ? config.min : -Infinity
	const max = typeof config.max === "number" ? config.max : Infinity
	const clamped = clampNumber(value, min, max)
	if (typeof config.step !== "number" || config.step <= 0) return clamped
	const base = Number.isFinite(min) ? min : 0
	const snapped = base + Math.round((clamped - base) / config.step) * config.step
	return clampNumber(Number(snapped.toFixed(6)), min, max)
}

function formatSettingValue(value: number, step?: number): string {
	if (!Number.isFinite(value)) return "-"
	if (step !== undefined && step < 1) return value.toFixed(step <= 0.01 ? 2 : 1)
	return String(Math.round(value))
}

function hiddenRect(): UiSurfaceRect {
	return {x: 0, y: 0, w: 1, h: 1, visible: false}
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value))
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
	if (request === undefined) throw new Error(`fullscreen is not available on ${target.tagName.toLowerCase()}`)
	await request.call(target)
}

async function exitAppFullscreen(): Promise<void> {
	setAppFullscreenFallback(false, "")
	type FullscreenDocument = Document & {webkitExitFullscreen?: () => Promise<void> | void}
	const fullscreenDocument = document as FullscreenDocument
	if (document.exitFullscreen !== undefined && document.fullscreenElement !== null) {
		await document.exitFullscreen()
	} else if (fullscreenDocument.webkitExitFullscreen !== undefined && appFullscreenElement() !== null) {
		await fullscreenDocument.webkitExitFullscreen()
	}
}

function setAppFullscreenFallback(active: boolean, reason: string): void {
	appFullscreenFallbackActive = active
	appFullscreenFallbackReason = reason
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
	if (canvas?.parentElement !== undefined && canvas.parentElement !== null) targets.push(canvas.parentElement)
	if (canvas !== null) targets.push(canvas)
	targets.push(document.documentElement)
	return targets
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
