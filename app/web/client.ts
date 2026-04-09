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
	renderSettings: Partial<AppWebRenderSettings>
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

const applySettingUiMetadata = (): void => {
	for (const [key, input] of Object.entries(settingInputs) as Array<
		[keyof typeof settingInputs, HTMLInputElement]
	>) {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		const field = document.querySelector(`[data-setting-key="${key}"]`) as HTMLElement | null
		const label = field?.querySelector(".setting-label-text") as HTMLLabelElement | null
		const help = field?.querySelector(".setting-help") as HTMLButtonElement | null
		const value = field?.querySelector("[data-setting-value]") as HTMLSpanElement | null
		let tooltip = field?.querySelector(".setting-tooltip") as HTMLDivElement | null
		if (label) label.textContent = config.label
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
		if (value) value.textContent = formatSettingValue(input.value, config.step)
		input.addEventListener("input", () => {
			if (value) value.textContent = formatSettingValue(input.value, config.step)
		})
	}
}

document.addEventListener("click", () => {
	closeAllSettingTooltips()
})

const readSettingValue = (key: keyof typeof settingInputs): AppWebLayoutSettings[keyof AppWebLayoutSettings] | AppWebRenderSettings[keyof AppWebRenderSettings] => {
	const input = settingInputs[key]
	const config = APP_WEB_SETTINGS_BY_KEY[key]
	const fallback = config.defaultValue
	if (key === "labelSurfaceOffsetMm") return parseNonNegativeNumber(input, fallback)
	if (key === "torusCrossRingRotationDeg") return parseFiniteNumber(input, fallback)
	return parsePositiveNumber(input, fallback)
}

applySettingUiMetadata()

const createMaterializePayload = (): ClientMaterializePayload => ({
	type: "materialize",
	src: srcInput.value.trim() || "zavx0z/git",
	layoutSettings: Object.fromEntries(
		APP_WEB_LAYOUT_SETTING_KEYS.map((key) => [key, readSettingValue(key)]),
	) as Partial<AppWebLayoutSettings>,
	renderSettings: Object.fromEntries(
		APP_WEB_RENDER_SETTING_KEYS.map((key) => [key, readSettingValue(key)]),
	) as Partial<AppWebRenderSettings>,
})

const initBulkViewport = async (): Promise<void> => {
	const rect = bulkCanvas.getBoundingClientRect()
	bulkViewport = await createBulkViewport({
		canvas: bulkCanvas,
		width: Math.max(1, Math.floor(rect.width)),
		height: Math.max(1, Math.floor(rect.height)),
		onStats: updateBulkStats,
	})
	const initialPayload = createMaterializePayload()
	bulkViewport.setLayoutSettings(initialPayload.layoutSettings)
	bulkViewport.setRenderSettings(initialPayload.renderSettings)

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

socket.onopen = () => {
	submitButton.disabled = false
	if (!initialMaterializationRequested) {
		initialMaterializationRequested = true
		submitButton.disabled = true
		const payload = createMaterializePayload()
		bulkViewport?.setLayoutSettings(payload.layoutSettings)
		bulkViewport?.setRenderSettings(payload.renderSettings)
		socket.send(JSON.stringify(payload))
	}
}

socket.onclose = () => {
	submitButton.disabled = true
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as any

	if (message.type === "worker-status") {
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
		bulkViewport?.setSnapshot(message.snapshot)
		return
	}
}

form.addEventListener("submit", (event) => {
	event.preventDefault()
	submitButton.disabled = true
	const payload = createMaterializePayload()
	bulkViewport?.setLayoutSettings(payload.layoutSettings)
	bulkViewport?.setRenderSettings(payload.renderSettings)
	socket.send(JSON.stringify(payload))
})
