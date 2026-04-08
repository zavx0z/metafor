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
const levelSizeInput = document.getElementById("level-size-input") as HTMLInputElement
const rootInnerDiameterInput = document.getElementById("root-inner-diameter-input") as HTMLInputElement
const torusCrossRingRotationInput = document.getElementById("torus-cross-ring-rotation-input") as HTMLInputElement
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

const settingInputs = {
	detailDensityFactor: detailDensityInput,
	detailLevelMultiplier: detailLevelInput,
	levelSizeMultiplier: levelSizeInput,
	rootInnerDiameterMm: rootInnerDiameterInput,
	torusCrossRingRotationDeg: torusCrossRingRotationInput,
} as const

const applySettingUiMetadata = (): void => {
	for (const [key, input] of Object.entries(settingInputs) as Array<
		[keyof typeof settingInputs, HTMLInputElement]
	>) {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		const field = document.querySelector(`[data-setting-key="${key}"]`) as HTMLElement | null
		const comment = field?.querySelector(".setting-comment") as HTMLParagraphElement | null
		if (comment) comment.textContent = config.description
		if (config.step !== undefined) input.step = String(config.step)
		if (config.min !== undefined) input.min = String(config.min)
		if (!input.value) input.value = String(config.defaultValue)
	}
}

const readSettingValue = (key: keyof typeof settingInputs): number => {
	const input = settingInputs[key]
	const fallback = APP_WEB_SETTINGS_BY_KEY[key].defaultValue
	return key === "torusCrossRingRotationDeg"
		? parseFiniteNumber(input, fallback)
		: parsePositiveNumber(input, fallback)
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
	setWorkerStatus("bulk", "ready")

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
	setWorkerStatus("bulk", "error", {
		error: error instanceof Error ? error.message : String(error),
	})
})

socket.onopen = () => {
	setConnectionStatus(true)
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
	setConnectionStatus(false)
	submitButton.disabled = true
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as
		| WorkerStatusMessage
		| ProtocolMessage
		| SnapshotMessage
		| LogMessage
		| InstanceSnapshotMessage

	if (message.type === "snapshot") {
		for (const [worker, status] of Object.entries(message.workers)) {
			if (worker === "dark" || worker === "boundary") {
				setWorkerStatus(worker, status)
			}
		}
		return
	}

	if (message.type === "worker-status") {
		setWorkerStatus(message.worker, message.status, toWorkerMeta({ src: message.src, error: message.error }))
		if (message.worker === "dark" && (message.status === "done" || message.status === "error")) {
			submitButton.disabled = socket.readyState !== WebSocket.OPEN
		}
		return
	}

	if (message.type === "protocol") {
		appendProtocolMessage(message.channel, message.message)
		bulkViewport?.handleProtocol(message.channel, message.message)
		return
	}

	if (message.type === "instance-snapshot") {
		appendWorkerLog("dark", {
			type: "instance-snapshot",
			src: message.src,
			shells: message.snapshot.particles.length,
			fields: message.snapshot.fields.length,
		})
		bulkViewport?.setSnapshot(message.snapshot)
		return
	}

	if (message.type === "log") {
		appendWorkerLog(message.worker, message.message)
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
