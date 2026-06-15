import {
	appendForceMessage,
	initForceLogger,
	setConnectionStatus,
} from "./force-logger.ts"
import type { BoundaryBulkRuntimeSnapshot, Particle } from "boundary"
import { createBulkViewport, type BulkViewportController, type BulkViewportStats } from "bulk/web"
import { buildBoundaryWorldRows } from "./world.ts"
import {
	APP_WEB_LAYOUT_SETTING_KEYS,
	APP_WEB_RENDER_SETTING_KEYS,
	APP_WEB_SETTINGS_BY_KEY,
	type AppWebLayoutSettings,
	type AppWebRenderSettings,
} from "./settings.ts"
import { loadPersistedAppWebUiSettings, savePersistedAppWebUiSettings } from "./ui-settings-idb.ts"

type ForceMessage = {
	type: "force"
	parts: Particle[]
}

type SnapshotMessage = {
	type: "snapshot"
	src: string
	snapshot: BoundaryBulkRuntimeSnapshot
}

type ErrorMessage = {
	type: "error"
	error: string
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

initForceLogger()

const form = document.getElementById("control-form") as HTMLFormElement
const srcInput = document.getElementById("src-input") as HTMLInputElement
const animationEnabledInput = document.getElementById("animation-enabled-input") as HTMLInputElement
const detailDensityInput = document.getElementById("detail-density-input") as HTMLInputElement
const detailLevelInput = document.getElementById("detail-level-input") as HTMLInputElement
const labelVisibleLevelsInput = document.getElementById("label-visible-levels-input") as HTMLInputElement
const labelFontSizeInput = document.getElementById("label-font-size-input") as HTMLInputElement
const labelSurfaceOffsetInput = document.getElementById("label-surface-offset-input") as HTMLInputElement
const orbitEdgeGapInput = document.getElementById("orbit-edge-gap-input") as HTMLInputElement
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
let pendingSnapshotMessage: SnapshotMessage | null = null
let currentSnapshot: BoundaryBulkRuntimeSnapshot | null = null

const socketScheme = window.location.protocol === "https:" ? "wss:" : "ws:"
const socket = new WebSocket(`${socketScheme}//${window.location.host}/ws`)

const updateBulkStats = (stats: BulkViewportStats): void => {
	const rootSrc = stats.rootSrc ? `${stats.rootSrc}: ` : ""
	bulkCounter.textContent = `${rootSrc}${stats.shellCount} shells / ${stats.fieldCount} fields`
}

const applySnapshotWorld = (
	src: string,
	snapshot: BoundaryBulkRuntimeSnapshot,
	layoutSettings: Partial<AppWebLayoutSettings>,
): void => {
	if (!bulkViewport) {
		return
	}

	bulkViewport.applyWorld(buildBoundaryWorldRows(snapshot, src, layoutSettings))
	if (pendingSceneState && pendingSceneState.src === src) {
		lastAppliedSceneState = pendingSceneState
		pendingSceneState = null
	}
	submitButton.disabled = socket.readyState !== WebSocket.OPEN
}

const applySnapshotMessage = (message: SnapshotMessage): void => {
	currentSnapshot = message.snapshot
	if (!bulkViewport) {
		pendingSnapshotMessage = message
		return
	}

	const layoutSettings = pendingSceneState?.src === message.src
		? pendingSceneState.layoutSettings
		: createUiSettingsSnapshot().layoutSettings
	applySnapshotWorld(message.src, message.snapshot, layoutSettings)
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
	animationEnabled: animationEnabledInput,
	detailDensityFactor: detailDensityInput,
	detailLevelMultiplier: detailLevelInput,
	labelVisibleLevels: labelVisibleLevelsInput,
	labelFontSizeMm: labelFontSizeInput,
	labelSurfaceOffsetMm: labelSurfaceOffsetInput,
	orbitEdgeGapMm: orbitEdgeGapInput,
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

const formatSettingValue = (input: HTMLInputElement, step?: number): string => {
	if (input.type === "checkbox") return input.checked ? "вкл" : "выкл"
	const rawValue = input.value
	const value = Number(rawValue)
	if (!Number.isFinite(value)) return rawValue
	if (!Number.isFinite(step) || step === undefined) return String(value)
	if (Math.abs(step - Math.round(step)) < 1e-9) return String(Math.round(value))
	return String(Number(value.toFixed(2)))
}

const updateSettingValuePreview = (key: SettingInputKey): void => {
	const value = settingValueElements[key]
	if (!value) return
	value.textContent = formatSettingValue(settingInputs[key], APP_WEB_SETTINGS_BY_KEY[key].step)
}

const readSettingValue = (key: SettingInputKey): AppWebLayoutSettings[keyof AppWebLayoutSettings] | AppWebRenderSettings[keyof AppWebRenderSettings] => {
	const input = settingInputs[key]
	const config = APP_WEB_SETTINGS_BY_KEY[key]
	if (input.type === "checkbox") return input.checked
	const fallback = typeof config.defaultValue === "number" ? config.defaultValue : 0
	if (key === "labelSurfaceOffsetMm" || key === "orbitEdgeGapMm") return parseNonNegativeNumber(input, fallback)
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

const applyPersistedSettingValue = (key: SettingInputKey, value: boolean | number | undefined): void => {
	if (typeof value !== "boolean" && !Number.isFinite(value)) return
	if (settingInputs[key].type === "checkbox") {
		settingInputs[key].checked = value === true
		updateSettingValuePreview(key)
		return
	}
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
		if (input && input.type !== "checkbox") {
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
		if (input.type !== "checkbox") {
			if (config.step !== undefined) input.step = String(config.step)
			if (config.min !== undefined) input.min = String(config.min)
			if (config.max !== undefined) input.max = String(config.max)
			// Browser кэширует value range-инпутов между перезагрузками, поэтому
			// перезаписываем явно дефолтом — persisted-IDB значение перезапишет позже.
			input.value = String(config.defaultValue)
		} else {
			input.checked = config.defaultValue === true
		}
		settingValueElements[key] = value
		updateSettingValuePreview(key)
		const eventName = input.type === "checkbox" ? "change" : "input"
		input.addEventListener(eventName, () => {
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
	if (pendingSnapshotMessage) {
		const snapshotMessage = pendingSnapshotMessage
		pendingSnapshotMessage = null
		applySnapshotMessage(snapshotMessage)
	}

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
	setConnectionStatus(true)
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
	setConnectionStatus(false)
	submitButton.disabled = true
}

type ActorRowsMessage = {
	actor: BoundaryBulkRuntimeSnapshot["actors"][number]
	values: BoundaryBulkRuntimeSnapshot["actorValues"]
	valueRecords: Array<{
		uuid: string
		kind: BoundaryBulkRuntimeSnapshot["values"][number]["kind"]
		boolean?: boolean
		number?: number
		text?: string
		variant?: string
	}>
	valueItems: BoundaryBulkRuntimeSnapshot["valueItems"]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

const upsertByUuid = <T extends {uuid: string}>(rows: T[], row: T): T[] =>
	[...rows.filter((item) => item.uuid !== row.uuid), row]

const actorRowsMessage = (value: unknown): ActorRowsMessage | null => {
	if (!isRecord(value) || !isRecord(value.actor) || !Array.isArray(value.values) || !Array.isArray(value.valueRecords)) return null
	return {
		actor: value.actor as ActorRowsMessage["actor"],
		values: value.values as ActorRowsMessage["values"],
		valueRecords: value.valueRecords as ActorRowsMessage["valueRecords"],
		valueItems: Array.isArray(value.valueItems) ? value.valueItems as ActorRowsMessage["valueItems"] : [],
	}
}

const applyActorRowsPart = (snapshot: BoundaryBulkRuntimeSnapshot, value: unknown): boolean => {
	const rows = actorRowsMessage(value)
	if (!rows) return false
	const enumValueByVariant = new Map(snapshot.fieldEnumVariants.map((variant) => [variant.uuid, variant.itemValue] as const))
	const valueIds = new Set(rows.values.map((row) => row.value))
	snapshot.actors = upsertByUuid(snapshot.actors, rows.actor)
	snapshot.actorValues = [
		...snapshot.actorValues.filter((row) => row.actor !== rows.actor.uuid),
		...rows.values,
	]
	snapshot.values = [
		...snapshot.values.filter((row) => !valueIds.has(row.uuid)),
		...rows.valueRecords.map((row) => ({
			uuid: row.uuid,
			kind: row.kind,
			booleanValue: typeof row.boolean === "boolean" ? (row.boolean ? 1 : 0) : null,
			numberValue: typeof row.number === "number" ? row.number : null,
			textValue: typeof row.text === "string" ? row.text : null,
			enumValue: typeof row.variant === "string" ? enumValueByVariant.get(row.variant) ?? row.variant : null,
		})),
	]
	snapshot.valueItems = [
		...snapshot.valueItems.filter((row) => !valueIds.has(row.value)),
		...rows.valueItems,
	]
	return true
}

const applyTopologyPart = (snapshot: BoundaryBulkRuntimeSnapshot, part: Particle): boolean => {
	if (part.path !== "fuzzy" && part.path !== "axion" && part.path !== "macho") return false
	if (!isRecord(part.value) || typeof part.value.uuid !== "string") return false
	const topology = part.value
	const uuid = topology.uuid as string
	if (part.op === "remove") {
		snapshot.topologies = snapshot.topologies.filter((row) => row.uuid !== uuid)
		return true
	}
	if (part.op !== "add" && part.op !== "replace") return false
	snapshot.topologies = upsertByUuid(snapshot.topologies, {
		uuid,
		parentActor: typeof topology.parentActor === "string" ? topology.parentActor : null,
		parentTopology: typeof topology.parentTopology === "string" ? topology.parentTopology : null,
		kind: part.path,
		position: typeof topology.position === "number" ? topology.position : 0,
	})
	return true
}

const applyForcePartToSnapshot = (snapshot: BoundaryBulkRuntimeSnapshot, part: Particle): boolean => {
	if (part.part !== "graviton") return false
	if (part.path === "actor") return applyActorRowsPart(snapshot, part.value)
	return applyTopologyPart(snapshot, part)
}

socket.onmessage = (event) => {
	const message = JSON.parse(String(event.data)) as ForceMessage | SnapshotMessage | ErrorMessage

	if (message.type === "force") {
		const forceMessage = message as ForceMessage
		appendForceMessage("force", forceMessage.parts)
		let snapshotChanged = false
		for (const part of forceMessage.parts) {
			if (currentSnapshot && applyForcePartToSnapshot(currentSnapshot, part)) snapshotChanged = true
			if (part.part === "graviton" && part.path === "/structural") {
				const signal = part.value as { rootSrc?: unknown }
				const rootSrc = signal.rootSrc
				if (typeof rootSrc !== "string") continue
				if (pendingSceneState && pendingSceneState.src === rootSrc) {
					lastAppliedSceneState = pendingSceneState
					pendingSceneState = null
					submitButton.disabled = socket.readyState !== WebSocket.OPEN
				}
				continue
			}
			bulkViewport?.handleForce(part.part, part)
		}
		if (snapshotChanged && currentSnapshot && lastAppliedSceneState) {
			applySnapshotWorld(lastAppliedSceneState.src, currentSnapshot, lastAppliedSceneState.layoutSettings)
		}
		return
	}

	if (message.type === "snapshot") {
		applySnapshotMessage(message)
		return
	}

	if (message.type === "error") {
		appendForceMessage("error", message.error)
		submitButton.disabled = socket.readyState !== WebSocket.OPEN
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

	if (needsRelayout && currentSnapshot) {
		applySnapshotWorld(payload.src, currentSnapshot, payload.layoutSettings)
		return
	}

	socket.send(JSON.stringify(payload))
})
