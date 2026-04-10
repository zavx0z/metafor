import {
	appendProtocolMessage,
	appendWorkerLog,
	initProtocolLogger,
	setConnectionStatus,
	setWorkerStatus,
} from "./protocol-logger.ts"
import type { DbWorldSnapshot } from "../../pkg/db/index.ts"
import { createBulkViewport, type BulkViewportController, type BulkViewportStats } from "../../bulk/web.ts"
import {
	APP_WEB_LAYOUT_SETTING_KEYS,
	APP_WEB_RENDER_SETTING_KEYS,
	APP_WEB_SETTINGS_BY_KEY,
	type AppWebLayoutSettings,
	type AppWebRenderSettings,
} from "./settings.ts"
import { loadPersistedAppWebUiSettings, savePersistedAppWebUiSettings } from "./ui-settings-idb.ts"

type WorkerStatusMessage = {
	type: "worker-status"
	worker: "dark" | "boundary"
	status: "idle" | "ready" | "started" | "done" | "error"
	src?: string
	error?: string
}

type ProtocolMessage = {
	type: "protocol"
	channel: string
	message: unknown
}

type InstanceSnapshotMessage = {
	type: "instance-snapshot"
	src: string
	snapshot: DbWorldSnapshot
}

type ClientMaterializePayload = {
	type: "materialize"
	src: string
	layoutSettings: Partial<AppWebLayoutSettings>
}

type ClientRelayoutPayload = {
	type: "relayout"
	src: string
	layoutSettings: Partial<AppWebLayoutSettings>
}

type SnapshotMessage = {
	type: "snapshot"
	workers: Record<string, "idle" | "ready" | "started" | "done" | "error">
}

type LogMessage = {
	type: "log"
	worker: string
	message: unknown
}

const toWorkerMeta = (meta: {
	src: string | undefined
	error: string | undefined
}): { src?: string; error?: string } => {
	const nextMeta: { src?: string; error?: string } = {}
	if (meta.src !== undefined) nextMeta.src = meta.src
	if (meta.error !== undefined) nextMeta.error = meta.error
	return nextMeta
}

initProtocolLogger()

const form = document.getElementById("control-form") as HTMLFormElement
const srcInput = document.getElementById("src-input") as HTMLInputElement
const detailDensityInput = document.getElementById("detail-density-input") as HTMLInputElement
const detailLevelInput = document.getElementById("detail-level-input") as HTMLInputElement
const labelVisibleLevelsInput = document.getElementById("label-visible-levels-input") as HTMLInputElement
const labelFontSizeInput = document.getElementById("label-font-size-input") as HTMLInputElement
const labelSurfaceOffsetInput = document.getElementById("label-surface-offset-input") as HTMLInputElement
const levelSizeInput = document.getElementById("level-size-input") as HTMLInputElement
const rootInnerDiameterInput = document.getElementById("root-inner-diameter-input") as HTMLInputElement
const rootSphereRadiusInput = document.getElementById("root-sphere-radius-input") as HTMLInputElement
const torusCrossRingRotationInput = document.getElementById("torus-cross-ring-rotation-input") as HTMLInputElement
const torusRadialSegmentsInput = document.getElementById("torus-radial-segments-input") as HTMLInputElement
const torusTubularSegmentsInput = document.getElementById("torus-tubular-segments-input") as HTMLInputElement
const wireframeOpacityInput = document.getElementById("wireframe-opacity-input") as HTMLInputElement
const submitButton = document.getElementById("materialize-btn") as HTMLButtonElement
const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement
const bulkCounter = document.getElementById("bulk-counter") as HTMLSpanElement
let bulkViewport: BulkViewportController | null = null
let initialMaterializationRequested = false

const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
const socket = new WebSocket(`${protocol}//${window.location.host}/ws`)

const updateBulkStats = (stats: BulkViewportStats): void => {
	const rootSrc = stats.rootSrc ? `${stats.rootSrc}: ` : ""
	bulkCounter.textContent = `${rootSrc}${stats.shellCount} shells / ${stats.fieldCount} fields`
}

const parsePositiveNumber = (input: HTMLInputElement, fallback: number): number => {
	const value = Number(input.value)
	return Number.isFinite(value) && value > 0 ? value : fallback
}

const parseFiniteNumber = (input: HTMLInputElement, fallback: number): number => {
	const value = Number(input.value)
	return Number.isFinite(value) ? value : fallback
}

const parseNonNegativeNumber = (input: HTMLInputElement, fallback: number): number => {
	const value = Number(input.value)
	return Number.isFinite(value) && value >= 0 ? value : fallback
}

const settingInputs = {
	detailDensityFactor: detailDensityInput,
	detailLevelMultiplier: detailLevelInput,
	labelVisibleLevels: labelVisibleLevelsInput,
	labelFontSizeMm: labelFontSizeInput,
	labelSurfaceOffsetMm: labelSurfaceOffsetInput,
	levelSizeMultiplier: levelSizeInput,
	rootInnerDiameterMm: rootInnerDiameterInput,
	rootSphereRadiusMm: rootSphereRadiusInput,
	torusCrossRingRotationDeg: torusCrossRingRotationInput,
	torusRadialSegments: torusRadialSegmentsInput,
	torusTubularSegments: torusTubularSegmentsInput,
	wireframeOpacity: wireframeOpacityInput,
} as const

type SettingInputKey = keyof typeof settingInputs

const settingValueElements: Partial<Record<SettingInputKey, HTMLSpanElement | null>> = {}
let persistUiSettingsTimer: ReturnType<typeof setTimeout> | null = null
let lastAppliedSceneState: { layoutSettings: Partial<AppWebLayoutSettings>; src: string } | null = null
let pendingSceneState: { layoutSettings: Partial<AppWebLayoutSettings>; src: string } | null = null

const closeAllSettingTooltips = (): void => {
	for (const field of document.querySelectorAll<HTMLElement>(".setting-field[data-tooltip-open='true']")) {
		delete field.dataset.tooltipOpen
	}
}

const formatSettingValue = (rawValue: string, step?: number): string => {
	const value = Number(rawValue)
	if (!Number.isFinite(value)) return rawValue
	if (!Number.isFinite(step) || step === undefined) return String(value)
	if (Math.abs(step - Math.round(step)) < 1e-9) return String(Math.round(value))
	return String(Number(value.toFixed(2)))
}

const updateSettingValuePreview = (key: SettingInputKey): void => {
	const value = settingValueElements[key]
	if (!value) return
	value.textContent = formatSettingValue(settingInputs[key].value, APP_WEB_SETTINGS_BY_KEY[key].step)
}

const readSettingValue = (key: SettingInputKey): AppWebLayoutSettings[keyof AppWebLayoutSettings] | AppWebRenderSettings[keyof AppWebRenderSettings] => {
	const input = settingInputs[key]
	const config = APP_WEB_SETTINGS_BY_KEY[key]
	const fallback = config.defaultValue
	if (key === "labelSurfaceOffsetMm") return parseNonNegativeNumber(input, fallback)
	if (key === "torusCrossRingRotationDeg") return parseFiniteNumber(input, fallback)
	return parsePositiveNumber(input, fallback)
}

const createUiSettingsSnapshot = (): {
	layoutSettings: Partial<AppWebLayoutSettings>
	renderSettings: Partial<AppWebRenderSettings>
} => ({
	layoutSettings: Object.fromEntries(
		APP_WEB_LAYOUT_SETTING_KEYS.map((key) => [key, readSettingValue(key)]),
	) as Partial<AppWebLayoutSettings>,
	renderSettings: Object.fromEntries(
		APP_WEB_RENDER_SETTING_KEYS.map((key) => [key, readSettingValue(key)]),
	) as Partial<AppWebRenderSettings>,
})

const areLayoutSettingsEqual = (
	left: Partial<AppWebLayoutSettings> | null,
	right: Partial<AppWebLayoutSettings> | null,
): boolean => {
	if (!left || !right) return false
	return APP_WEB_LAYOUT_SETTING_KEYS.every((key) => left[key] === right[key])
}

const persistUiSettings = async (): Promise<void> => {
	await savePersistedAppWebUiSettings(createUiSettingsSnapshot())
}

const schedulePersistUiSettings = (): void => {
	if (persistUiSettingsTimer !== null) clearTimeout(persistUiSettingsTimer)
	persistUiSettingsTimer = setTimeout(() => {
		persistUiSettingsTimer = null
		void persistUiSettings().catch((error) => {
			console.error("ui settings persist error:", error)
		})
	}, 120)
}

const flushPersistUiSettings = (): void => {
	if (persistUiSettingsTimer !== null) {
		clearTimeout(persistUiSettingsTimer)
		persistUiSettingsTimer = null
	}

	void persistUiSettings().catch((error) => {
		console.error("ui settings persist error:", error)
	})
}

const applyPersistedSettingValue = (key: SettingInputKey, value: number | undefined): void => {
	if (!Number.isFinite(value)) return
	settingInputs[key].value = String(value)
	updateSettingValuePreview(key)
}

const hydratePersistedUiSettings = async (): Promise<void> => {
	const snapshot = await loadPersistedAppWebUiSettings()
	if (!snapshot) return

	for (const key of APP_WEB_LAYOUT_SETTING_KEYS) {
		applyPersistedSettingValue(key, snapshot.layoutSettings[key])
	}

	for (const key of APP_WEB_RENDER_SETTING_KEYS) {
		applyPersistedSettingValue(key, snapshot.renderSettings[key])
	}
}

const applySettingUiMetadata = (): void => {
	for (const [key, input] of Object.entries(settingInputs) as Array<
		[SettingInputKey, HTMLInputElement]
	>) {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		const field = document.querySelector(`[data-setting-key="${key}"]`) as HTMLElement | null
		const label = field?.querySelector(".setting-label-text") as HTMLLabelElement | null
		const help = field?.querySelector(".setting-help") as HTMLButtonElement | null
		const value = field?.querySelector("[data-setting-value]") as HTMLSpanElement | null
		let tooltip = field?.querySelector(".setting-tooltip") as HTMLDivElement | null
		if (label) label.textContent = config.label
		if (input) {
			if (config.min !== undefined) input.min = String(config.min)
			if (config.max !== undefined) input.max = String(config.max)
			if (config.step !== undefined) input.step = String(config.step)
		}
		if (help) {
			help.type = "button"
			help.textContent = "!"
			help.setAttribute("aria-label", config.description)
			help.setAttribute("aria-expanded", "false")
			if (!tooltip) {
				tooltip = document.createElement("div")
				tooltip.className = "setting-tooltip"
				help.insertAdjacentElement("afterend", tooltip)
			}
			tooltip.textContent = config.description
			if (!help.dataset.tooltipBound && field) {
				const openTooltip = (): void => {
					closeAllSettingTooltips()
					field.dataset.tooltipOpen = "true"
					help.setAttribute("aria-expanded", "true")
				}
				const closeTooltip = (): void => {
					delete field.dataset.tooltipOpen
					help.setAttribute("aria-expanded", "false")
				}
				help.addEventListener("click", (event) => {
					event.stopPropagation()
					if (field.dataset.tooltipOpen === "true") closeTooltip()
					else openTooltip()
				})
				help.addEventListener("blur", closeTooltip)
				help.dataset.tooltipBound = "true"
			}
		}
		if (config.step !== undefined) input.step = String(config.step)
		if (config.min !== undefined) input.min = String(config.min)
		if (config.max !== undefined) input.max = String(config.max)
		if (!input.value) input.value = String(config.defaultValue)
		settingValueElements[key] = value
		updateSettingValuePreview(key)
		input.addEventListener("input", () => {
			updateSettingValuePreview(key)
			schedulePersistUiSettings()
			if (config.section === "render") {
				bulkViewport?.setRenderSettings(createUiSettingsSnapshot().renderSettings)
			}
		})
	}
}

document.addEventListener("click", () => {
	closeAllSettingTooltips()
})

applySettingUiMetadata()

const persistedUiSettingsReady = hydratePersistedUiSettings().catch((error) => {
	console.error("ui settings hydrate error:", error)
})

const createMaterializePayload = (): ClientMaterializePayload => ({
	type: "materialize",
	src: srcInput.value.trim() || "zavx0z/git",
	layoutSettings: createUiSettingsSnapshot().layoutSettings,
})

const initBulkViewport = async (): Promise<void> => {
	await persistedUiSettingsReady
	const rect = bulkCanvas.getBoundingClientRect()
	bulkViewport = await createBulkViewport({
		canvas: bulkCanvas,
		width: Math.max(1, Math.floor(rect.width)),
		height: Math.max(1, Math.floor(rect.height)),
		onStats: updateBulkStats,
	})
	const initialPayload = createMaterializePayload()
	bulkViewport.setLayoutSettings(initialPayload.layoutSettings)
	bulkViewport.setRenderSettings(createUiSettingsSnapshot().renderSettings)

	const resizeObserver = new ResizeObserver((entries) => {
		const entry = entries[0]
		if (!entry || !bulkViewport) return

		bulkViewport.setSize(
			Math.max(1, Math.floor(entry.contentRect.width)),
			Math.max(1, Math.floor(entry.contentRect.height)),
		)
	})

	resizeObserver.observe(bulkCanvas)
}

void initBulkViewport().catch((error) => {
	console.error("bulk init error:", error)
})

socket.onopen = async () => {
	await persistedUiSettingsReady
	submitButton.disabled = false
	if (!initialMaterializationRequested) {
		initialMaterializationRequested = true
		submitButton.disabled = true
		const payload = createMaterializePayload()
		const { renderSettings } = createUiSettingsSnapshot()
		bulkViewport?.setLayoutSettings(payload.layoutSettings)
		bulkViewport?.setRenderSettings(renderSettings)
		pendingSceneState = {
			src: payload.src,
			layoutSettings: payload.layoutSettings,
		}
		socket.send(JSON.stringify(payload))
	}
}

socket.onclose = () => {
	submitButton.disabled = true
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as any

	if (message.type === "worker-status") {
		if (message.worker === "dark" && message.status === "error") {
			pendingSceneState = null
		}
		if (message.worker === "dark" && (message.status === "done" || message.status === "error")) {
			submitButton.disabled = socket.readyState !== WebSocket.OPEN
		}
		return
	}

	if (message.type === "protocol") {
		bulkViewport?.handleProtocol(message.channel, message.message)
		return
	}

	if (message.type === "instance-snapshot") {
		if (pendingSceneState && pendingSceneState.src === message.src) {
			lastAppliedSceneState = pendingSceneState
			pendingSceneState = null
		}
		bulkViewport?.setSnapshot(message.snapshot)
		return
	}
}

form.addEventListener("submit", (event) => {
	event.preventDefault()
	const payload = createMaterializePayload()
	const { renderSettings } = createUiSettingsSnapshot()
	flushPersistUiSettings()
	bulkViewport?.setLayoutSettings(payload.layoutSettings)
	bulkViewport?.setRenderSettings(renderSettings)

	const needsMaterialize = !lastAppliedSceneState || lastAppliedSceneState.src !== payload.src
	const needsRelayout =
		!needsMaterialize && lastAppliedSceneState && !areLayoutSettingsEqual(lastAppliedSceneState.layoutSettings, payload.layoutSettings)
	if (!needsMaterialize && !needsRelayout) return

	submitButton.disabled = true
	pendingSceneState = {
		src: payload.src,
		layoutSettings: payload.layoutSettings,
	}

	const scenePayload: ClientMaterializePayload | ClientRelayoutPayload = needsMaterialize
		? payload
		: {
			type: "relayout",
			src: payload.src,
			layoutSettings: payload.layoutSettings,
		}
	socket.send(JSON.stringify(scenePayload))
})
