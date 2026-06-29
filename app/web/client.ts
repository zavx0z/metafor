import type {BoundaryBulkRuntimeSnapshot, Particle} from "boundary"
import {createBulkViewport, type BulkViewportController, type BulkViewportStats} from "bulk/web"
import {buildBoundaryWorldRows} from "./world.ts"
import {
	APP_WEB_LAYOUT_SETTING_KEYS,
	DEFAULT_APP_WEB_LAYOUT_SETTINGS,
	DEFAULT_APP_WEB_RENDER_SETTINGS,
	type AppWebLayoutSettings,
	type AppWebRenderSettings,
} from "./settings.ts"
import {DEFAULT_APP_WEB_SCENE_SRC} from "./app-config.ts"
import {loadPersistedAppWebUiSettings, savePersistedAppWebUiSettings, type AppWebUiSettingsSnapshot} from "./ui-settings-idb.ts"
import {installAppWebHud, type AppWebHudController, type AppWebHudSettingsSnapshot} from "./hud.ts"
import type {AndroidRtcCommand} from "./android-rtc.ts"

const markAppWebBoot = (phase: string, detail?: unknown): void => {
	const target = globalThis as {__appWebBoot?: {events?: unknown[]}}
	const boot = target.__appWebBoot ??= {events: []}
	const events = boot.events
	if (!Array.isArray(events)) {
		boot.events = []
	}
	;(boot.events as unknown[]).push({phase, at: Date.now(), detail})
}

markAppWebBoot("client:module:start", {readyState: document.readyState})

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

type TodoChangedMessage = {
	type: "hud-todo-changed"
	todo: {
		text: string
		path: string
	}
}

type HudAndroidControlMessage = {
	type: "hud-android-control"
	command: AndroidRtcCommand
}

type HudVoiceLeaseMessage = {
	type: "hud-voice-lease"
	ownerId: string | null
	expiresAt: number
	ttlMs?: number
	reason?: string
}

type ClientMaterializePayload = {
	type: "materialize"
	src: string
	layoutSettings: Partial<AppWebLayoutSettings>
}

const bulkCanvas = document.getElementById("bulk-canvas") as HTMLCanvasElement | null
if (bulkCanvas === null) throw new Error("bulk-canvas not found")

const bootOverlay = document.createElement("div")
bootOverlay.style.cssText = [
	"position:fixed",
	"inset:0",
	"display:flex",
	"align-items:center",
	"justify-content:center",
	"background:rgba(5,11,18,0.74)",
	"color:#d6f6ff",
	"font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace",
	"z-index:2147483647",
	"pointer-events:auto",
].join(";")

let bulkViewport: BulkViewportController | null = null
let hud: AppWebHudController | null = null
let initialMaterializationRequested = false
let pendingSnapshotMessage: SnapshotMessage | null = null
let currentSnapshot: BoundaryBulkRuntimeSnapshot | null = null
let persistUiSettingsTimer: ReturnType<typeof setTimeout> | null = null
let activeSettings: AppWebHudSettingsSnapshot = {
	layoutSettings: {...DEFAULT_APP_WEB_LAYOUT_SETTINGS},
	renderSettings: {...DEFAULT_APP_WEB_RENDER_SETTINGS},
}
let activeSrc = DEFAULT_APP_WEB_SCENE_SRC
let lastAppliedSceneState: {layoutSettings: Partial<AppWebLayoutSettings>; src: string} | null = null
let pendingSceneState: {layoutSettings: Partial<AppWebLayoutSettings>; src: string} | null = null
let voiceDictationActive = false

const APP_WEB_UI_SETTINGS_LOAD_TIMEOUT_MS = 1_200
const APP_WEB_VOICE_CLIENT_ID_STORAGE_KEY = "metafor.app-web.voice.clientId:v1"

const socketScheme = window.location.protocol === "https:" ? "wss:" : "ws:"
const socket = new WebSocket(`${socketScheme}//${window.location.host}/ws`)
const voiceClientId = readVoiceClientId()

const updateBulkStats = (stats: BulkViewportStats): void => {
	hud?.setStats(stats)
}

const setVoiceDictationActive = (active: boolean): void => {
	if (voiceDictationActive === active) return
	voiceDictationActive = active
	bulkViewport?.setAnimationSuspended(active)
}

const sendVoiceLease = (action: "request" | "release", reason: string): void => {
	if (socket.readyState !== WebSocket.OPEN) return
	socket.send(JSON.stringify({
		type: "hud-voice-lease",
		action,
		clientId: voiceClientId,
		reason,
	}))
}

const applySnapshotWorld = (
	src: string,
	snapshot: BoundaryBulkRuntimeSnapshot,
	layoutSettings: Partial<AppWebLayoutSettings>,
): void => {
	if (!bulkViewport) return

	bulkViewport.applyWorld(buildBoundaryWorldRows(snapshot, src, layoutSettings))
	if (pendingSceneState && pendingSceneState.src === src) {
		lastAppliedSceneState = pendingSceneState
		pendingSceneState = null
	}
	hud?.setBusy(socket.readyState !== WebSocket.OPEN)
}

const applySnapshotMessage = (message: SnapshotMessage): void => {
	currentSnapshot = message.snapshot
	if (!bulkViewport) {
		pendingSnapshotMessage = message
		return
	}

	const layoutSettings = pendingSceneState?.src === message.src
		? pendingSceneState.layoutSettings
		: activeSettings.layoutSettings
	applySnapshotWorld(message.src, message.snapshot, layoutSettings)
}

const areLayoutSettingsEqual = (
	left: Partial<AppWebLayoutSettings> | null,
	right: Partial<AppWebLayoutSettings> | null,
): boolean => {
	if (!left || !right) return false
	return APP_WEB_LAYOUT_SETTING_KEYS.every((key) => left[key] === right[key])
}

const normalizeSceneSrc = (src: string | null | undefined): string => {
	const next = src?.trim() ?? ""
	return next.length > 0 ? next : DEFAULT_APP_WEB_SCENE_SRC
}

const persistedSettingsSnapshot = (): AppWebUiSettingsSnapshot => ({
	src: activeSrc,
	layoutSettings: activeSettings.layoutSettings,
	renderSettings: activeSettings.renderSettings,
})

const persistUiSettings = async (): Promise<void> => {
	await savePersistedAppWebUiSettings(persistedSettingsSnapshot())
}

const schedulePersistUiSettings = (settings: AppWebHudSettingsSnapshot): void => {
	activeSettings = cloneSettings(settings)
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

const createMaterializePayload = (
	src: string,
	settings: AppWebHudSettingsSnapshot,
): ClientMaterializePayload => ({
	type: "materialize",
	src: normalizeSceneSrc(src),
	layoutSettings: settings.layoutSettings,
})

const applyHudRequest = (src: string, settings: AppWebHudSettingsSnapshot): void => {
	activeSettings = cloneSettings(settings)
	const payload = createMaterializePayload(src, settings)
	activeSrc = payload.src
	flushPersistUiSettings()
	bulkViewport?.setLayoutSettings(payload.layoutSettings)
	bulkViewport?.setRenderSettings(settings.renderSettings)

	const needsMaterialize = !lastAppliedSceneState || lastAppliedSceneState.src !== payload.src
	const needsRelayout =
		!needsMaterialize && lastAppliedSceneState && !areLayoutSettingsEqual(lastAppliedSceneState.layoutSettings, payload.layoutSettings)
	if (!needsMaterialize && !needsRelayout) {
		hud?.setBusy(false)
		return
	}

	hud?.setBusy(true)
	pendingSceneState = {
		src: payload.src,
		layoutSettings: payload.layoutSettings,
	}

	if (needsRelayout && currentSnapshot) {
		applySnapshotWorld(payload.src, currentSnapshot, payload.layoutSettings)
		return
	}

	if (socket.readyState !== WebSocket.OPEN) {
		hud?.setBusy(true)
		return
	}

	socket.send(JSON.stringify(payload))
}

const applyRenderSettingsFromHud = (renderSettings: Partial<AppWebRenderSettings>): void => {
	activeSettings = {
		...activeSettings,
		renderSettings: {...renderSettings},
	}
	bulkViewport?.setRenderSettings(renderSettings)
	schedulePersistUiSettings(activeSettings)
}

const requestInitialMaterialization = (): void => {
	if (initialMaterializationRequested || socket.readyState !== WebSocket.OPEN || hud === null || bulkViewport === null) return
	initialMaterializationRequested = true
	applyHudRequest(hud.currentSrc(), activeSettings)
}

const loadPersistedAppWebUiSettingsSafe = async (): Promise<AppWebUiSettingsSnapshot | null> => {
	try {
		return await withTimeout(
			loadPersistedAppWebUiSettings(),
			APP_WEB_UI_SETTINGS_LOAD_TIMEOUT_MS,
			`app/web UI settings load timed out after ${APP_WEB_UI_SETTINGS_LOAD_TIMEOUT_MS}ms`,
		)
	} catch (error) {
		console.warn("[app-web] using default UI settings:", error)
		return null
	}
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
			}),
		])
	} finally {
		if (timeout !== null) clearTimeout(timeout)
	}
}

function readVoiceClientId(): string {
	try {
		const existing = sessionStorage.getItem(APP_WEB_VOICE_CLIENT_ID_STORAGE_KEY)
		if (existing !== null && existing.length > 0) return existing
		const next = `app-web-client-${randomClientId()}`
		sessionStorage.setItem(APP_WEB_VOICE_CLIENT_ID_STORAGE_KEY, next)
		return next
	} catch {
		return `app-web-client-${randomClientId()}`
	}
}

function randomClientId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const showBootOverlay = (title: string, detail?: string, retry = false): void => {
	const safeDetail = detail?.trim()
	bootOverlay.innerHTML = ""
	const panel = document.createElement("div")
	panel.style.cssText = [
		"max-width:min(560px,calc(100vw - 48px))",
		"border:1px solid rgba(89,213,255,0.34)",
		"background:rgba(9,16,26,0.92)",
		"box-shadow:0 18px 50px rgba(0,0,0,0.38)",
		"border-radius:10px",
		"padding:18px 20px",
	].join(";")
	const heading = document.createElement("div")
	heading.textContent = title
	heading.style.cssText = "font-size:14px;color:#66e4ff;margin-bottom:8px"
	panel.append(heading)
	if (safeDetail) {
		const body = document.createElement("div")
		body.textContent = safeDetail
		body.style.cssText = "color:#9db3c3;white-space:pre-wrap;overflow-wrap:anywhere"
		panel.append(body)
	}
	if (retry) {
		const button = document.createElement("button")
		button.type = "button"
		button.textContent = "Перезагрузить"
		button.style.cssText = [
			"margin-top:14px",
			"height:30px",
			"padding:0 12px",
			"border-radius:7px",
			"border:1px solid rgba(102,228,255,0.52)",
			"background:rgba(28,119,151,0.36)",
			"color:#d6f6ff",
			"font:inherit",
			"cursor:pointer",
		].join(";")
		button.addEventListener("click", () => window.location.reload())
		panel.append(button)
	}
	bootOverlay.append(panel)
	if (!bootOverlay.isConnected) document.body.append(bootOverlay)
}

const hideBootOverlay = (): void => {
	bootOverlay.remove()
}

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error)

const webGpuBootDiagnostics = (): string => [
	`origin: ${window.location.origin}`,
	`secureContext: ${String(window.isSecureContext)}`,
	`navigator.gpu: ${String("gpu" in navigator)}`,
	`visibility: ${document.visibilityState}`,
	`userAgent: ${navigator.userAgent}`,
].join("\n")

const waitForVisibleDocument = async (): Promise<void> => {
	if (document.visibilityState === "visible") return
	markAppWebBoot("client:visibility:wait", document.visibilityState)
	showBootOverlay("Ожидаю активную вкладку", "Chrome задерживает WebGPU adapter/device, пока вкладка в фоне.")
	await new Promise<void>((resolve) => {
		const onVisibilityChange = (): void => {
			if (document.visibilityState !== "visible") return
			document.removeEventListener("visibilitychange", onVisibilityChange)
			resolve()
		}
		document.addEventListener("visibilitychange", onVisibilityChange)
	})
	markAppWebBoot("client:visibility:visible")
}

const initBulkViewport = async (): Promise<void> => {
	markAppWebBoot("client:init:start")
	showBootOverlay("Инициализация WebGPU")
	markAppWebBoot("client:idb:start")
	const persisted = await loadPersistedAppWebUiSettingsSafe()
	markAppWebBoot("client:idb:done", persisted === null ? "defaults" : "persisted")
	if (persisted !== null) {
		activeSrc = normalizeSceneSrc(persisted.src)
		activeSettings = {
			layoutSettings: {...DEFAULT_APP_WEB_LAYOUT_SETTINGS, ...persisted.layoutSettings},
			renderSettings: {...DEFAULT_APP_WEB_RENDER_SETTINGS, ...persisted.renderSettings},
		}
	}

	await waitForVisibleDocument()
	const rect = bulkCanvas.getBoundingClientRect()
	markAppWebBoot("client:viewport:start", {width: rect.width, height: rect.height})
	bulkViewport = await createBulkViewport({
		canvas: bulkCanvas,
		width: Math.max(1, Math.floor(rect.width)),
		height: Math.max(1, Math.floor(rect.height)),
		androidFrameSize: () => hud?.androidFrameSize() ?? null,
		onAndroidControl: (command) => hud?.sendAndroidControl(command) === true,
		onStats: updateBulkStats,
	})
	markAppWebBoot("client:viewport:done")
	bulkViewport.setLayoutSettings(activeSettings.layoutSettings)
	bulkViewport.setRenderSettings(activeSettings.renderSettings)
	bulkViewport.setAnimationSuspended(voiceDictationActive)
	markAppWebBoot("client:hud:start")
	hud = installAppWebHud({
		viewport: bulkViewport,
		voiceClientId,
		initialSrc: activeSrc,
		initialSettings: activeSettings,
		onApply: applyHudRequest,
		onRenderSettingsChange: applyRenderSettingsFromHud,
		onSettingsPersist: schedulePersistUiSettings,
		onVoiceDictationActiveChange: setVoiceDictationActive,
		onVoiceLeaseRequest: (reason) => sendVoiceLease("request", reason),
		onVoiceLeaseRelease: (reason) => sendVoiceLease("release", reason),
	})
	markAppWebBoot("client:hud:done")
	hideBootOverlay()
	hud.setConnectionStatus(socket.readyState === WebSocket.OPEN)
	requestInitialMaterialization()

	if (pendingSnapshotMessage) {
		const snapshotMessage = pendingSnapshotMessage
		pendingSnapshotMessage = null
		applySnapshotMessage(snapshotMessage)
	}

	const resizeBulkViewport = (): void => {
		if (!bulkViewport) return
		const rect = bulkCanvas.getBoundingClientRect()
		bulkViewport.setSize(
			Math.max(1, Math.floor(rect.width || bulkCanvas.clientWidth || 1)),
			Math.max(1, Math.floor(rect.height || bulkCanvas.clientHeight || 1)),
		)
	}

	const resizeObserver = new ResizeObserver(() => resizeBulkViewport())

	resizeObserver.observe(bulkCanvas)
	window.addEventListener("resize", resizeBulkViewport)
	window.visualViewport?.addEventListener("resize", resizeBulkViewport)
}

void initBulkViewport().catch((error) => {
	markAppWebBoot("client:init:error", errorMessage(error))
	console.error("bulk init error:", error)
	showBootOverlay(
		"WebGPU не запустился",
		`${errorMessage(error)}\n\n${webGpuBootDiagnostics()}\n\nChrome не вернул WebGPU adapter/device за отведённое время. Интерфейс не продолжит старт без WebGPU renderer.`,
		true,
	)
})

socket.onopen = () => {
	hud?.setConnectionStatus(true)
	hud?.syncVoiceLease("socket-open")
	requestInitialMaterialization()
}

socket.onclose = () => {
	hud?.setConnectionStatus(false)
	hud?.setBusy(true)
	hud?.setVoiceLease(null, 0)
}

type ActorRowsMessage = {
	actor: BoundaryBulkRuntimeSnapshot["actors"][number]
	values: BoundaryBulkRuntimeSnapshot["actorValues"]
	valueRecords: Array<{
		id: number
		kind: BoundaryBulkRuntimeSnapshot["values"][number]["kind"]
		boolean?: boolean
		number?: number
		text?: string
		variant?: number
	}>
	valueItems: BoundaryBulkRuntimeSnapshot["valueItems"]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null

const upsertById = <T extends {id: number}>(rows: T[], row: T): T[] =>
	[...rows.filter((item) => item.id !== row.id), row]

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
	const enumValueByVariant = new Map(snapshot.fieldEnumVariants.map((variant) => [variant.id, variant.itemValue] as const))
	const valueIds = new Set(rows.values.map((row) => row.value))
	snapshot.actors = upsertById(snapshot.actors, rows.actor)
	snapshot.actorValues = [
		...snapshot.actorValues.filter((row) => row.actor !== rows.actor.id),
		...rows.values,
	]
	snapshot.values = [
		...snapshot.values.filter((row) => !valueIds.has(row.id)),
		...rows.valueRecords.map((row) => ({
			id: row.id,
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
	if (!isRecord(part.value) || typeof part.value.id !== "number") return false
	const topology = part.value
	const id = topology.id as number
	if (part.op === "remove") {
		snapshot.topologies = snapshot.topologies.filter((row) => row.id !== id)
		return true
	}
	if (part.op !== "add" && part.op !== "replace") return false
	snapshot.topologies = upsertById(snapshot.topologies, {
		id,
		parentActor: typeof topology.parentActor === "number" ? topology.parentActor : null,
		parentTopology: typeof topology.parentTopology === "number" ? topology.parentTopology : null,
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
	const message = JSON.parse(String(event.data)) as ForceMessage | SnapshotMessage | ErrorMessage | TodoChangedMessage | HudAndroidControlMessage | HudVoiceLeaseMessage

	if (message.type === "force") {
		const forceMessage = message as ForceMessage
		let snapshotChanged = false
		for (const part of forceMessage.parts) {
			if (currentSnapshot && applyForcePartToSnapshot(currentSnapshot, part)) snapshotChanged = true
			if (part.part === "graviton" && part.path === "/structural") {
				const signal = part.value as {rootSrc?: unknown}
				const rootSrc = signal.rootSrc
				if (typeof rootSrc !== "string") continue
				if (pendingSceneState && pendingSceneState.src === rootSrc) {
					lastAppliedSceneState = pendingSceneState
					pendingSceneState = null
					hud?.setBusy(socket.readyState !== WebSocket.OPEN)
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
		console.error("app-web server error:", message.error)
		hud?.setBusy(socket.readyState !== WebSocket.OPEN)
		return
	}

	if (message.type === "hud-todo-changed") {
		hud?.setTodoMarkdown(message.todo.text, message.todo.path)
		return
	}

	if (message.type === "hud-android-control") {
		hud?.sendAndroidControl(message.command)
		return
	}

	if (message.type === "hud-voice-lease") {
		hud?.setVoiceLease(message.ownerId, message.expiresAt, message.ttlMs)
		return
	}
}

function cloneSettings(settings: AppWebHudSettingsSnapshot): AppWebHudSettingsSnapshot {
	return {
		layoutSettings: {...settings.layoutSettings},
		renderSettings: {...settings.renderSettings},
	}
}
