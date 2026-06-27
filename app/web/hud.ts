import type {BulkViewportController, BulkViewportStats} from "bulk/web"
import {Color} from "@metafor/engine"
import {
	UiSurface,
	Z,
	div,
	palette,
	radii,
	requestNativeSoftKeyboard,
	uiIcons,
	type DivScrollContext,
	type UiSurfaceRect,
} from "@ui/elements"
import {
	Button,
	ButtonVoice,
	IconButton,
	SliderControl,
	Switcher,
	Table,
	TextField,
	VoiceInputHud,
	VoicePhraseSettings,
	focusTextField,
	normalizeTableSelection,
	tableScrollTo,
	tableSelectionAfterClick,
	type ButtonVoiceSnapshot,
	type TableCellContext,
	type TableColumn,
	type TableRowId,
	type TableRowPointerContext,
	type TextFieldEditState,
	type VoiceInputHudDeactivationMode,
	type VoiceInputHudPhraseGroupId,
	type VoiceInputHudPhraseGroup,
	type VoiceInputHudServiceState,
} from "@ui/components"
import {HudSideTab, type HudSideTabEdge} from "@ui/hud"
import {
	AndroidPane,
	EditorPane,
	FileListPane,
	NetworkWatchPane,
	TerminalPane,
	ToDoPane,
	PANE_FRAME,
	beginPaneFrameDrag,
	networkWatchSectionsFromLines,
	paneBodyRect,
	paneFrameCursor,
	paneFrameDragRect,
	paneFrameHit,
	paneHeaderRuleRect,
	type NetworkWatchPaneSnapshot,
	type NetworkWatchServiceKey,
	type PaneFrameDrag,
	type PaneFrameInteractionOpts,
	type PaneRect,
	type TerminalHeaderControls,
	type TerminalInputSource,
	type TerminalSize,
	type TerminalStatusKind,
	type AndroidPaneStatusKind,
	type AndroidPaneSwipe,
	type FileListItem,
	type ToDoPanePanelStateSnapshot,
} from "@ui/panes"
import type {PtyClientMessage, PtyServerMessage, PtyStatusKind, PtyTerminalState} from "@metafor/pty/server"
import {
	DEFAULT_VOICE_ACTIVATION_PHRASES,
	DEFAULT_VOICE_DEACTIVATION_PHRASES,
	DEFAULT_VOICE_STOP_PHRASES,
	VOICE_STOP_COMMAND_DETAIL,
	VoiceInputClient,
	cleanupVoiceText,
	normalizeVoicePhrases,
	voiceInputWebSocketUrl,
	type VoiceDeactivationMode,
	type VoiceInputChunk,
	type VoiceInputDebugSnapshot,
	type VoiceInputSegment,
	type VoiceInputSignalTone,
	type VoiceInputStatus,
	type VoiceInputTransport,
} from "@metafor/interpreter/web"
import {
	APP_WEB_LAYOUT_SETTING_KEYS,
	APP_WEB_RENDER_SETTING_KEYS,
	APP_WEB_SETTINGS_BY_KEY,
	type AppWebLayoutSettings,
	type AppWebRenderSettings,
	type AppWebSettingKey,
} from "./settings.ts"
import {createAndroidRtcClient, type AndroidRtcClient, type AndroidRtcCommand} from "./android-rtc.ts"
import {DEFAULT_APP_WEB_SCENE_SRC} from "./app-config.ts"
import {
	canCreateVoiceRtcAsrSocket,
	createVoiceRtcAsrSocket,
	isVoiceRtcRemoteClient,
	onVoiceRtcDebug,
	readVoiceRtcDebugSnapshot,
	type VoiceRtcDebugSnapshot,
} from "./voice-rtc.ts"

type VoiceRtcDebugGlobal = typeof globalThis & {__metaVoiceRtcDebug?: () => VoiceRtcDebugSnapshot}
type AppFullscreenDebugGlobal = typeof globalThis & {__metaFullscreenDebug?: () => AppFullscreenDebugSnapshot}
type AppVoiceLeaseDebugGlobal = typeof globalThis & {__metaVoiceLeaseDebug?: () => AppVoiceLeaseDebugSnapshot}

type AppFullscreenDebugSnapshot = {
	state: "idle" | "requesting" | "active" | "fallback" | "exiting" | "failed"
	target: string
	error: string
	fallback: boolean
	updatedAt: number
}

type AppVoiceLeaseDebugSnapshot = {
	clientId: string
	ownerId: string | null
	expiresInMs: number
	owns: boolean
	localFocus: boolean
	voiceStatus: VoiceInputStatus
	voiceActive: boolean
	voice: VoiceInputDebugSnapshot | null
	autoWakePaused: boolean
	autoWakeTimerActive: boolean
	autoWakeInFlight: boolean
	prewarmTimerActive: boolean
}

let appFullscreenDebug: AppFullscreenDebugSnapshot = {
	state: "idle",
	target: "",
	error: "",
	fallback: false,
	updatedAt: 0,
}
;(globalThis as AppFullscreenDebugGlobal).__metaFullscreenDebug = () => ({...appFullscreenDebug})

const ANDROID_CONTROL_STATUS_HOLD_MS = 4_000

export type AppWebHudSettingsSnapshot = {
	layoutSettings: Partial<AppWebLayoutSettings>
	renderSettings: Partial<AppWebRenderSettings>
}

export type AppWebHudOptions = {
	viewport: BulkViewportController
	voiceClientId: string
	initialSrc: string
	initialSettings: AppWebHudSettingsSnapshot
	onApply(src: string, settings: AppWebHudSettingsSnapshot): void
	onRenderSettingsChange(settings: Partial<AppWebRenderSettings>): void
	onSettingsPersist(settings: AppWebHudSettingsSnapshot): void
	onVoiceDictationActiveChange(active: boolean): void
	onVoiceLeaseRequest(reason: string): void
	onVoiceLeaseRelease(reason: string): void
}

export type AppWebHudController = {
	androidFrameSize(): {height: number; width: number} | null
	currentSrc(): string
	settingsSnapshot(): AppWebHudSettingsSnapshot
	sendAndroidControl(command: AndroidRtcCommand): boolean
	showNetworkTerminal(command?: AppWebNetworkTerminalCommand): void
	setBusy(busy: boolean): void
	setConnectionStatus(online: boolean): void
	setStats(stats: BulkViewportStats): void
	setTodoMarkdown(text: string, path: string): void
	setVoiceLease(ownerId: string | null, expiresAt: number, ttlMs?: number): void
	syncVoiceLease(reason?: string): void
}

export type AppWebNetworkTerminalCommand = {
	action?: "show" | "dock" | "toggle"
	session?: string
	key?: string
	tmux?: string
}

type NetworkActionPayload = {
	ok?: boolean
	detached?: boolean
	durationMs?: number
	stdout?: string
	stderr?: string
	error?: string
}

type DockKind = "codex" | "settings" | "todo" | "android" | "workspace" | "sqlite" | "network" | "fullscreen"
type DockPanelKind = Exclude<DockKind, "fullscreen">
type SettingsTab = "scene" | "geometry" | "render"

type DockPlacement = {
	edge: HudSideTabEdge
	offset: number
}

type DockNodeTransition = {
	kind: DockPanelKind
	surface: UiSurface
	baseRect: UiSurfaceRect
	fromRect: UiSurfaceRect
	toRect: UiSurfaceRect
	extras: DockExtraTransition[]
	bounds: {w: number; h: number}
	pixelScale: number
	targetDocked: boolean
	startedAt: number
	durationMs: number
	rafId: number | null
}

type DockExtraTransition = {
	surface: UiSurface
	baseRect: UiSurfaceRect
	fromRect: UiSurfaceRect
	toRect: UiSurfaceRect
}

type TerminalController = {
	pane: TerminalPane
	socket: WebSocket | null
	sessionId: string | null
	size: TerminalSize | null
	state: PtyTerminalState | null
	statusLabel: string
	localEchoId: number
	agentNotifyArmed: boolean
	agentNotifySawOutput: boolean
	agentNotifyLastOutputAt: number
	agentNotifyLastPlayedAt: number
	agentNotifyTimer: ReturnType<typeof setTimeout> | null
}

type CodexComposerAttachment = {
	id: string
	name: string
	path: string
	mime: string
	size: number
}

type BrowserWritableFile = {
	write(data: string | Blob | ArrayBuffer): Promise<void>
	close(): Promise<void>
}

type BrowserFileHandle = {
	kind?: "file"
	name?: string
	getFile(): Promise<File>
	createWritable?: () => Promise<BrowserWritableFile>
}

type BrowserDirectoryHandle = {
	kind?: "directory"
	name: string
	entries?: () => AsyncIterable<[string, BrowserDirectoryHandle | BrowserFileHandle]>
}

type WorkspaceFileEntry = {
	file?: File
	handle?: BrowserFileHandle
	sourcePath?: string
	sourceUrl?: string
	sourceKind: "local" | "process" | "source"
	processId?: string
	name: string
	path: string
}

type WorkspaceTreeNode = {
	id: string
	name: string
	dirs: Map<string, WorkspaceTreeNode>
	files: WorkspaceFileEntry[]
}

type WorkspaceProcess = {
	id: string
	label: string
	modulePath: string | null
	connection: string
	paused: boolean
	protocolUrl: string
}

type WorkspaceProcessModules = {
	processId: string
	label: string
	root: string
	workspacePath: string
	entrypoint: string | null
	modules: Array<{path: string}>
}

type SqliteCellValue = string | number | boolean | null | {type?: string; size?: number; hex?: string}

type SqliteTableSummary = {
	name: string
	type: "table" | "view"
	rowCount: number | null
}

type SqliteColumnInfo = {
	name: string
	type: string
	notNull: boolean
	defaultValue: string | null
	primaryKey: boolean
}

type SqliteDatabasePayload = {
	ok: true
	path: string
	label: string
	version: string
	selectedTable: string | null
	limit: number
	offset: number
	tables: SqliteTableSummary[]
	schema: SqliteColumnInfo[]
	rows: Array<Record<string, SqliteCellValue>>
}

type SqliteCellEditSession = {
	rowid: number
	column: string
	previous: SqliteCellValue
	onSubmit(rowid: number, column: string, value: SqliteCellValue): void
}

const STORAGE_PREFIX = "metafor.app-web.hud"
const CODEX_SESSION_STORAGE_KEY = `${STORAGE_PREFIX}.codex.sessionId:v1`
const CODEX_TERMINAL_SESSION_KEY = "app-web:codex"
const CODEX_TERMINAL_TMUX_SESSION = "metafor-app-web-codex"
const CODEX_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.codex.docked:v1`
const CODEX_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.codex.rect:v1`
const CODEX_COMPOSER_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.codex.composer.rect:v1`
const CODEX_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.codex.dockPlacement:v2`
const SETTINGS_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.settings.docked:v1`
const SETTINGS_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.settings.rect:v2`
const SETTINGS_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.settings.dockPlacement:v2`
const TODO_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.todo.docked:v1`
const TODO_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.todo.rect:v1`
const TODO_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.todo.dockPlacement:v2`
const TODO_PANEL_STATE_STORAGE_KEY = `${STORAGE_PREFIX}.todo.panelState:v1`
const WORKSPACE_FILES_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.files.rect:v1`
const WORKSPACE_EDITOR_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.editor.rect:v1`
const WORKSPACE_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.dockPlacement:v1`
const SQLITE_TABLES_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.sqlite.tables.rect:v1`
const SQLITE_ROWS_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.sqlite.rows.rect:v1`
const SQLITE_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.sqlite.docked:v1`
const SQLITE_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.sqlite.dockPlacement:v1`
const APP_WEB_SQLITE_PATH = "app/web/tmp/boundary.sqlite"
const SQLITE_TABLE_SCROLL_KEY = "app-web-sqlite-table-scroll"
const SQLITE_CELL_EDIT_FIELD_KEY = "app-web-sqlite-cell-edit-value"
const SQLITE_CELL_EDIT_MODAL_W = 500
const SQLITE_CELL_EDIT_MODAL_H = 192
const NETWORK_TERMINAL_SESSION_STORAGE_KEY = `${STORAGE_PREFIX}.network.sessionId:v1`
const NETWORK_TERMINAL_SESSION_KEY = "app-web:network-terminal"
const NETWORK_TERMINAL_TMUX_SESSION = "metafor-app-web-net"
const NETWORK_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.network.docked:v1`
const NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY = `${STORAGE_PREFIX}.network.autoRefresh:v1`
const NETWORK_CONTROLS_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.network.controls.rect:v1`
const NETWORK_TERMINAL_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.network.terminal.rect:v1`
const NETWORK_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.network.dockPlacement:v1`
const ANDROID_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.android.docked:v1`
const ANDROID_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.android.rect:v1`
const ANDROID_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.android.dockPlacement:v1`
const VOICE_SETTINGS_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.voice.settings.rect:v1`
const FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.fullscreen.dockPlacement:v1`
const VOICE_INPUT_URL_STORAGE_KEY = "metafor.interpreter.voice.url"
const VOICE_WAKE_URL_STORAGE_KEY = "metafor.interpreter.voice.wakeUrl"
const VOICE_INPUT_CONTEXT_STORAGE_KEY = "metafor.interpreter.voice.context"
const VOICE_WAKE_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.wakePhrases:v1"
const VOICE_ACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.activationPhrases:v1"
const VOICE_DEACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.deactivationPhrases:v1"
const VOICE_STOP_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.stopPhrases:v1"
const VOICE_ACTIVATION_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.activationFuzzy:v1"
const VOICE_DEACTIVATION_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.deactivationFuzzy:v1"
const VOICE_STOP_FUZZY_STORAGE_KEY = "metafor.interpreter.voice.stopFuzzy:v1"
const VOICE_DEACTIVATION_MODE_STORAGE_KEY = "metafor.interpreter.voice.deactivationMode:v1"
const VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY = "metafor.interpreter.voice.recognitionTimeoutSeconds:v1"
const VOICE_AUTO_SEND_STORAGE_KEY = "metafor.interpreter.voice.autoSend:v1"
const CODEX_VOICE_AUTO_SEND_STORAGE_KEY = `${STORAGE_PREFIX}.codex.voice.autoSend:v1`
const CODEX_VOICE_P2P_STORAGE_KEY = `${STORAGE_PREFIX}.codex.voice.p2p:v1`
const VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v1"
const VOICE_SIGNAL_VOLUME_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v2"
const HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundEnabled:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundVolume:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.agentReadyVolume:v1"
const VOICE_SETTINGS_STORAGE_KEYS = [
	VOICE_INPUT_URL_STORAGE_KEY,
	VOICE_WAKE_URL_STORAGE_KEY,
	VOICE_INPUT_CONTEXT_STORAGE_KEY,
	VOICE_WAKE_PHRASES_STORAGE_KEY,
	VOICE_ACTIVATION_PHRASES_STORAGE_KEY,
	VOICE_DEACTIVATION_PHRASES_STORAGE_KEY,
	VOICE_STOP_PHRASES_STORAGE_KEY,
	VOICE_ACTIVATION_FUZZY_STORAGE_KEY,
	VOICE_DEACTIVATION_FUZZY_STORAGE_KEY,
	VOICE_STOP_FUZZY_STORAGE_KEY,
	VOICE_DEACTIVATION_MODE_STORAGE_KEY,
	VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY,
	VOICE_AUTO_SEND_STORAGE_KEY,
	VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY,
	VOICE_SIGNAL_VOLUME_STORAGE_KEY,
	HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY,
	HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY,
	HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY,
] as const

type HudNotificationKind = "activation" | "deactivation" | "stop" | "error" | "agent"

const DEFAULT_VOICE_INPUT_URL = "/hud/voice/asr/ws"
const DEFAULT_VOICE_WAKE_URL = "/hud/voice/wake/ws"
const DEFAULT_VOICE_AUTO_SEND_ENABLED = true
const DEFAULT_CODEX_VOICE_P2P_ENABLED = false
const CODEX_VOICE_P2P_SERVER_AVAILABLE = false
const DEFAULT_VOICE_DEACTIVATION_MODE: VoiceDeactivationMode = "phrase-timeout"
const DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const DEFAULT_VOICE_SIGNAL_VOLUME = 0.2
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MAX_VOICE_SIGNAL_VOLUME = 1
const MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS = 60
const DEFAULT_VOICE_ACTIVATION_FUZZY = 0
const DEFAULT_VOICE_DEACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_STOP_FUZZY = 0.06
const VOICE_MESSAGE_PAUSE_SECONDS = 1.6
const VOICE_SIGNAL_COOLDOWN_MS = 900
const VOICE_SIGNAL_CAPTURE_FALLBACK_MS = 260
const VOICE_AUTO_WAKE_RETRY_MS = 3_000
const VOICE_RTC_PREWARM_RETRY_MS = 500
const VOICE_RTC_PREWARM_MAX_ATTEMPTS = 24
const VOICE_LEASE_LOCAL_TTL_MS = 12_000
const VOICE_HUD_ERROR_MS = 2_400
const VOICE_METER_RENDER_MS = 80
const VOICE_SETTINGS_LONG_PRESS_MS = 450
const VOICE_TOGGLE_CLICK_DELAY_MS = 320
const AGENT_READY_SOUND_IDLE_MS = 2500
const AGENT_READY_SOUND_COOLDOWN_MS = 1200
const CODEX_COMPOSER_H = 268
const CODEX_COMPOSER_MIN_W = 420
const CODEX_COMPOSER_MIN_H = 220
const CODEX_COMPOSER_GAP = 8
const CODEX_COMPOSER_PAD = 12
const CODEX_COMPOSER_HEADER_INSET_X = PANE_FRAME.bodyInsetX
const CODEX_COMPOSER_HEADER_BUTTON_SIZE = 24
const CODEX_COMPOSER_MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
const NETWORK_STATUS_REFRESH_MS = 2500
const CODEX_TITLE = "Codex"
const CODEX_MODEL = "GPT-5"
const APP_FULLSCREEN_FALLBACK_CLASS = "metafor-app-fullscreen-fallback"
const APP_FULLSCREEN_ANDROID_REQUEST_TIMEOUT_MS = 500
const DOCK_SHORT = 32
const DOCK_MARGIN = 8
const DOCK_LONG_PRESS_MS = 320
const DOCK_DRAG_THRESHOLD_PX = 6
const DOCK_TRANSITION_MS = 260
const HUD_PANEL_Z = 20
const HUD_TODO_PANEL_Z = 22
const HUD_SETTINGS_PANEL_Z = 24
const HUD_AGENT_SIGNAL_Z = 41
const HUD_DOCK_Z = 60
const HUD_VOICE_SETTINGS_Z = HUD_DOCK_Z + 8
const SETTINGS_SCROLL_KEY = "app-web-settings-pane:scroll"
const SETTINGS_MIN_W = 360
const SETTINGS_MIN_H = PANE_FRAME.headerHeight + 260
const VOICE_SETTINGS_W = 460
const VOICE_SETTINGS_H = 760
const VOICE_SETTINGS_MARGIN = 8
const AGENT_SIGNAL_BUTTON_SIZE = 22
const AGENT_SIGNAL_HEADER_Y = 8
const AGENT_SIGNAL_HEADER_TEXT_X = 16
const AGENT_SIGNAL_PANEL_W = 300
const AGENT_SIGNAL_PANEL_H = 112
const ANDROID_RTC_FRAME_SRC = "metafor:app-web-android-rtc-frame"
const VOICE_SERVICE_CHECK_TIMEOUT_MS = 2500
const HUD_PANEL_BG = new Color(palette.bg.r, palette.bg.g, palette.bg.b, 0.68)
const HUD_CODE_BG = new Color(palette.bgCode.r, palette.bgCode.g, palette.bgCode.b, 0.62)
const HUD_LOCAL_BACKDROP_BG = new Color(palette.bg.r, palette.bg.g, palette.bg.b, 0.24)
const HUD_MODAL_SHADOW_BG = new Color(palette.bgInput.r, palette.bgInput.g, palette.bgInput.b, 0.32)
const HUD_MODAL_BG = new Color(palette.bgElevated.r, palette.bgElevated.g, palette.bgElevated.b, 0.78)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

type WebkitFullscreenDocument = Document & {
	webkitFullscreenElement?: Element | null
	webkitExitFullscreen?: () => Promise<void> | void
	webkitCancelFullScreen?: () => Promise<void> | void
}

type WebkitFullscreenElement = Element & {
	webkitRequestFullscreen?: () => Promise<void> | void
	webkitRequestFullScreen?: () => Promise<void> | void
}

let appFullscreenFallbackActive = false
let appFullscreenFallbackOnNativeExitUntil = 0

function appFullscreenElement(): Element | null {
	const webkitDocument = document as WebkitFullscreenDocument
	return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null
}

function appFullscreenActive(): boolean {
	return appFullscreenElement() !== null || appFullscreenFallbackActive
}

async function requestAppFullscreen(): Promise<void> {
	const targets = fullscreenTargetCandidates()
	const android = isAndroidBrowser()
	let lastError: unknown = null
	writeAppFullscreenDebug({state: "requesting", target: targets[0]?.id || targets[0]?.tagName || "document", error: ""})
	for (const target of targets) {
		try {
			await requestElementFullscreenWithActivationGuard(target)
			writeAppFullscreenDebug({state: "active", target: target.id || target.tagName || "element", error: ""})
			return
		} catch (error) {
			lastError = error
			if (android) break
		}
	}
	throw lastError ?? new Error("fullscreen request failed")
}

async function waitForAppFullscreenActivation(timeoutMs = 300): Promise<boolean> {
	if (appFullscreenElement() !== null) return true
	const startedAt = performance.now()
	while (performance.now() - startedAt < timeoutMs) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		if (appFullscreenElement() !== null) return true
	}
	return appFullscreenElement() !== null
}

async function requestElementFullscreenWithActivationGuard(target: Element): Promise<void> {
	const request = requestElementFullscreen(target)
	if (!isAndroidBrowser()) {
		await request
		return
	}
	const activated = waitForAppFullscreenActivation(APP_FULLSCREEN_ANDROID_REQUEST_TIMEOUT_MS)
	await Promise.race([
		request,
		activated.then((active) => {
			if (!active) throw new Error("fullscreen request timed out")
		}),
	])
}

async function requestElementFullscreen(target: Element): Promise<void> {
	if (target.requestFullscreen !== undefined) {
		if (isAndroidBrowser()) {
			await target.requestFullscreen()
			return
		}
		try {
			await target.requestFullscreen({navigationUI: "hide"} as FullscreenOptions)
			return
		} catch (error) {
			if (!isFullscreenOptionsError(error)) throw error
		}
		await target.requestFullscreen()
		return
	}
	const webkitTarget = target as WebkitFullscreenElement
	const request = webkitTarget.webkitRequestFullscreen ?? webkitTarget.webkitRequestFullScreen
	if (request === undefined) throw new Error(`fullscreen is not available on ${target.tagName.toLowerCase()}`)
	await Promise.resolve(request.call(target))
}

async function exitAppFullscreen(): Promise<void> {
	writeAppFullscreenDebug({state: "exiting", error: ""})
	appFullscreenFallbackOnNativeExitUntil = 0
	setAppFullscreenFallback(false, "")
	const webkitDocument = document as WebkitFullscreenDocument
	if (document.exitFullscreen !== undefined && document.fullscreenElement !== null) {
		await document.exitFullscreen()
		return
	}
	const exit = webkitDocument.webkitExitFullscreen ?? webkitDocument.webkitCancelFullScreen
	if (exit !== undefined && webkitDocument.webkitFullscreenElement !== null) await Promise.resolve(exit.call(document))
}

function setAppFullscreenFallback(active: boolean, reason: string): void {
	if (appFullscreenFallbackActive === active) return
	appFullscreenFallbackActive = active
	document.documentElement.classList.toggle(APP_FULLSCREEN_FALLBACK_CLASS, active)
	if (document.body !== null) document.body.classList.toggle(APP_FULLSCREEN_FALLBACK_CLASS, active)
	if (active) {
		writeAppFullscreenDebug({state: "fallback", target: "css", error: reason, fallback: true})
	} else {
		writeAppFullscreenDebug({fallback: false})
	}
	requestAppFullscreenFallbackResize()
}

function requestAppFullscreenFallbackResize(): void {
	window.dispatchEvent(new Event("resize"))
	requestAnimationFrame(() => {
		window.dispatchEvent(new Event("resize"))
		requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
	})
}

function fullscreenTargetCandidates(): Element[] {
	const canvas = document.getElementById("bulk-canvas")
	const body = document.body
	const root = document.documentElement
	const preferred: Array<Element | null> = isAndroidBrowser() ? [root, body, canvas] : [root, canvas, body]
	return uniqueElements(preferred.filter((item): item is Element => item instanceof Element))
}

function uniqueElements(elements: readonly Element[]): Element[] {
	const seen = new Set<Element>()
	const result: Element[] = []
	for (const element of elements) {
		if (seen.has(element)) continue
		seen.add(element)
		result.push(element)
	}
	return result
}

function isAndroidBrowser(): boolean {
	const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
	return /android/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)
}

function shouldUseCodexNativeInput(): boolean {
	const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
	if (/android|mobile/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)) return true
	if (navigator.maxTouchPoints > 0) return true
	return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
}

type CodexTextPosition = {
	line: number
	col: number
}

function codexDraftOffsetForPosition(text: string, position: CodexTextPosition): number {
	const lines = text.length === 0 ? [""] : text.split("\n")
	const line = Math.max(0, Math.min(lines.length - 1, Math.floor(position.line)))
	let offset = 0
	for (let i = 0; i < line; i++) offset += (lines[i]?.length ?? 0) + 1
	const col = Math.max(0, Math.min(lines[line]?.length ?? 0, Math.floor(position.col)))
	return offset + col
}

function codexTextPositionFromOffset(text: string, rawOffset: number): CodexTextPosition {
	const lines = text.length === 0 ? [""] : text.split("\n")
	let offset = Math.max(0, Math.min(text.length, Math.floor(rawOffset)))
	for (let line = 0; line < lines.length; line++) {
		const lineText = lines[line] ?? ""
		if (offset <= lineText.length) return {line, col: offset}
		offset -= lineText.length + 1
	}
	const lastLine = Math.max(0, lines.length - 1)
	return {line: lastLine, col: lines[lastLine]?.length ?? 0}
}

function isTouchPointerEvent(event: MouseEvent): boolean {
	const pointer = event as MouseEvent & {
		pointerType?: unknown
		metaforPointerType?: unknown
		sourceCapabilities?: {firesTouchEvents?: boolean} | null
	}
	return pointer.pointerType === "touch" || pointer.metaforPointerType === "touch" || pointer.sourceCapabilities?.firesTouchEvents === true
}

function isFullscreenOptionsError(error: unknown): boolean {
	const text = errorMessage(error)
	return /dictionary|navigationUI|parameter|argument|options|type/i.test(text)
}

function isFullscreenPermissionError(error: unknown): boolean {
	const text = errorMessage(error)
	return /permission|user activation/i.test(text)
}

function writeAppFullscreenDebug(patch: Partial<AppFullscreenDebugSnapshot>): void {
	appFullscreenDebug = {
		...appFullscreenDebug,
		...patch,
		updatedAt: Date.now(),
	}
}

let hudNotificationAudioContext: AudioContext | null = null
let hudNotificationSoundUnlockInstalled = false
let hudNotificationLastLine = ""
let hudNotificationLastAt: Date | null = null
const hudNotificationAudioElements = new Map<HudNotificationKind, HTMLAudioElement>()
const voiceSignalLastPlayedAt = new Map<HudNotificationKind, number>()

export function installAppWebHud(options: AppWebHudOptions): AppWebHudController {
	return new AppWebHud(options)
}

class AppWebHud implements AppWebHudController {
	readonly #viewport: BulkViewportController
	readonly #voiceClientId: string
	readonly #onApply: AppWebHudOptions["onApply"]
	readonly #onRenderSettingsChange: AppWebHudOptions["onRenderSettingsChange"]
	readonly #onSettingsPersist: AppWebHudOptions["onSettingsPersist"]
	readonly #onVoiceDictationActiveChange: AppWebHudOptions["onVoiceDictationActiveChange"]
	readonly #onVoiceLeaseRequest: AppWebHudOptions["onVoiceLeaseRequest"]
	readonly #onVoiceLeaseRelease: AppWebHudOptions["onVoiceLeaseRelease"]
	readonly #settingsPane: AppWebSettingsPane
	readonly #codexDock: AppWebDockPane
	readonly #settingsDock: AppWebDockPane
	readonly #todoDock: AppWebDockPane
	readonly #workspaceDock: AppWebDockPane
	readonly #sqliteDock: AppWebDockPane
	readonly #networkDock: AppWebDockPane
	readonly #androidDock: AppWebDockPane
	readonly #fullscreenDock: AppWebDockPane
	readonly #todoPane: ToDoPane
	readonly #workspaceFiles: FileListPane
	readonly #workspaceEditor: EditorPane
	readonly #sqliteTables: FileListPane
	readonly #sqliteRows: AppWebSqliteTablePane
	readonly #networkWatchPane: NetworkWatchPane
	readonly #androidPane: AndroidPane
	readonly #agentSignalPane: AppWebAgentSignalPane
	readonly #voiceHud: VoiceInputHud
	readonly #codexComposer: AppWebCodexComposerPane
	readonly #codexEditor: EditorPane
	readonly #terminal: TerminalController
	readonly #networkTerminal: TerminalController
	#src: string
	#settings: AppWebHudSettingsSnapshot
	#stats: BulkViewportStats = {shellCount: 0, fieldCount: 0}
	#connected = false
	#busy = true
	#codexDocked = readStoredBoolean(CODEX_DOCKED_STORAGE_KEY, false)
	#settingsDocked = readStoredBoolean(SETTINGS_DOCKED_STORAGE_KEY, false)
	#todoDocked = readStoredBoolean(TODO_DOCKED_STORAGE_KEY, true)
	#workspaceDocked = true
	#sqliteDocked = readStoredBoolean(SQLITE_DOCKED_STORAGE_KEY, true)
	#networkDocked = readStoredBoolean(NETWORK_DOCKED_STORAGE_KEY, true)
	#androidDocked = readStoredBoolean(ANDROID_DOCKED_STORAGE_KEY, true)
	#codexDockPlacement: DockPlacement | null = readStoredDockPlacement(CODEX_DOCK_PLACEMENT_STORAGE_KEY)
	#settingsDockPlacement: DockPlacement | null = readStoredDockPlacement(SETTINGS_DOCK_PLACEMENT_STORAGE_KEY)
	#todoDockPlacement: DockPlacement | null = readStoredDockPlacement(TODO_DOCK_PLACEMENT_STORAGE_KEY)
	#workspaceDockPlacement: DockPlacement | null = readStoredDockPlacement(WORKSPACE_DOCK_PLACEMENT_STORAGE_KEY)
	#sqliteDockPlacement: DockPlacement | null = readStoredDockPlacement(SQLITE_DOCK_PLACEMENT_STORAGE_KEY)
	#networkDockPlacement: DockPlacement | null = readStoredDockPlacement(NETWORK_DOCK_PLACEMENT_STORAGE_KEY)
	#androidDockPlacement: DockPlacement | null = readStoredDockPlacement(ANDROID_DOCK_PLACEMENT_STORAGE_KEY)
	#fullscreenDockPlacement: DockPlacement | null = readStoredDockPlacement(FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY)
	#dockTransition: DockNodeTransition | null = null
	#workspaceEntries = new Map<string, WorkspaceFileEntry>()
	#workspaceLocalEntries = new Map<string, WorkspaceFileEntry>()
	#workspaceProcessEntries = new Map<string, WorkspaceFileEntry>()
	#workspaceProcesses: WorkspaceProcess[] = []
	#workspaceAttachedProcessId: string | null = null
	#workspaceAutoAttached = false
	#workspaceCurrentEntry: WorkspaceFileEntry | null = null
	#workspaceEditorDirty = false
	#workspaceRootLabel = "Local"
	#workspaceProcessLabel = "Bun processes"
	#sqliteSelectedTable: string | null = null
	#sqliteSelectionSyncing = false
	#networkServiceSwitches: Record<NetworkWatchServiceKey, boolean> = {tls: true, redirect: true}
	#networkActionStatus = "ready"
	#networkStatusLines: string[] = []
	#networkStatusUpdatedAt: Date | null = null
	#networkStatusRefreshTimer: number | null = null
	#networkStatusRefreshInFlight = false
	#networkStatusRefreshGeneration = 0
	#networkStatusRefreshAbortController: AbortController | null = null
	#networkStatusAutoRefreshEnabled = readStoredBoolean(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY, true)
	#androidRtcClient: AndroidRtcClient | null = null
	#androidControlStatusUntil = 0
	#fullscreen = appFullscreenActive()
	#voiceClient: VoiceInputClient | null = null
	#voiceStatus: VoiceInputStatus = "idle"
	#voiceTransport: VoiceInputTransport = "idle"
	#voiceDetail = ""
	#voiceLevel = 0
	#voiceServiceState: VoiceInputHudServiceState = "unknown"
	#voiceServiceDetail = "ASR не проверен"
	#voiceServiceCheckInFlight = false
	#voiceRtcDebug: VoiceRtcDebugSnapshot = readVoiceRtcDebugSnapshot()
	#voiceAutoWakeTimer: number | null = null
	#voicePrewarmTimer: number | null = null
	#voicePrewarmAttempts = 0
	#voiceAutoWakeInFlight = false
	#voiceAutoWakePaused = false
	#voiceLeaseOwnerId: string | null = null
	#voiceLeaseExpiresAt = 0
	#voiceLeaseHeartbeatTimer: number | null = null
	#voiceMeterTimer: number | null = null
	#voiceDictationActive = false
	#voiceSettingsOpen = false
	#voiceHudErrorTimer: number | null = null
	#voiceWakeLines: string[] = []
	#voiceWakePreviewText = ""
	#voiceWakePreviewAt: Date | null = null
	#voiceLastPartialText = ""
	#voiceLastPartialAt: Date | null = null
	#voiceLastChunkText = ""
	#voiceLastChunkAt: Date | null = null
	#voiceLastErrorText = ""
	#voiceLastErrorAt: Date | null = null
	#voiceAutoEnterCount = 0
	#voiceAutoEnterAt: Date | null = null
	#voiceServiceCheckedAt: Date | null = null
	#voiceAutoSendText = ""
	#voiceNextFlushMode: "auto" | "draft" = "auto"
	#voicePartialPreviewText = ""
	#voiceComposerBaseDraft: string | null = null
	#voiceComposerGeneratedDraft = ""
	#voiceComposerEdited = false
	#codexDraft = ""
	#codexAttachments: CodexComposerAttachment[] = []
	#codexDropActive = false
	#codexEditorSyncing = false
	#codexNativeInput: HTMLTextAreaElement | null = null
	#codexNativeInputSyncTimer: number | null = null
	#codexNativeInputSyncing = false
	#codexComposerStatus = ""
	#codexComposerStatusTimer: number | null = null
	#codexAutoscrollPinned = true
	readonly #codexDragOver = (event: DragEvent): void => this.#handleCodexDragOver(event)
	readonly #codexDrop = (event: DragEvent): void => void this.#handleCodexDrop(event)
	readonly #codexDragLeave = (event: DragEvent): void => this.#handleCodexDragLeave(event)

	constructor(options: AppWebHudOptions) {
		this.#viewport = options.viewport
		this.#voiceClientId = options.voiceClientId
		this.#onApply = options.onApply
		this.#onRenderSettingsChange = options.onRenderSettingsChange
		this.#onSettingsPersist = options.onSettingsPersist
		this.#onVoiceDictationActiveChange = options.onVoiceDictationActiveChange
		this.#onVoiceLeaseRequest = options.onVoiceLeaseRequest
		this.#onVoiceLeaseRelease = options.onVoiceLeaseRelease
		this.#src = options.initialSrc
		this.#settings = cloneSettings(options.initialSettings)
		this.#settingsPane = new AppWebSettingsPane(this)
		const todoState = readStoredTodoPanelState()
		this.#todoPane = new ToDoPane({
			title: "TODO.md",
			path: "TODO.md",
			draggable: true,
			resizable: true,
			highlightedIds: todoState.highlightedIds,
			expandedCompletedIds: todoState.expandedCompletedIds,
			onPanelStateChange: (state) => writeStoredJson(TODO_PANEL_STATE_STORAGE_KEY, state),
			onItemCheckedChange: (id, checked) => void this.#patchTodoItem(id, checked),
			onFrameRectChange: (rect) => writeStoredRect(TODO_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("todo", true),
		})
		this.#workspaceFiles = new FileListPane({
			title: "Inspector",
			items: [],
			selectionMode: "single",
			showHeader: true,
			draggable: true,
			resizable: true,
			onOpenDirectoryRequest: () => void this.#openWorkspaceDirectory(),
			onSelectionChange: (_ids, items) => {
				const item = items[0]
				if (item !== undefined) void this.#openWorkspaceItem(item)
			},
			onItemOpen: (item) => void this.#openWorkspaceItem(item),
			onFrameRectChange: (rect) => writeStoredRect(WORKSPACE_FILES_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("workspace", true),
		})
		this.#workspaceEditor = new EditorPane({
			title: "Inspector",
			path: "",
			fontPx: 12,
			linePx: 16,
			readOnly: false,
			showCaret: true,
			introAnimation: false,
			draggable: true,
			resizable: true,
			onChange: (text) => this.#handleWorkspaceEditorChange(text),
			onSave: (text) => void this.#saveWorkspaceEditor(text),
			onFrameRectChange: (rect) => writeStoredRect(WORKSPACE_EDITOR_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("workspace", true),
		})
		this.#sqliteTables = new FileListPane({
			title: "SQLite",
			items: [],
			selectionMode: "single",
			showHeader: true,
			draggable: true,
			resizable: true,
			onSelectionChange: (_ids, items) => {
				if (this.#sqliteSelectionSyncing) return
				const item = items[0]
				if (item !== undefined) void this.#openSqliteItem(item)
			},
			onItemOpen: (item) => void this.#openSqliteItem(item),
			onFrameRectChange: (rect) => writeStoredRect(SQLITE_TABLES_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("sqlite", true),
		})
		this.#sqliteRows = new AppWebSqliteTablePane({
			onFrameRectChange: (rect) => writeStoredRect(SQLITE_ROWS_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("sqlite", true),
			onCellEdit: (rowid, column, value) => void this.#updateSqliteCell(rowid, column, value),
		})
		this.#networkWatchPane = this.#createNetworkWatchPane()
		this.#androidPane = new AndroidPane({
			title: "Android",
			draggable: true,
			resizable: true,
			onRefresh: () => this.#connectAndroidRtc(),
			onTap: (x, y) => this.#sendAndroidControl({type: "tap", x, y}),
			onSwipe: (swipe) => this.#sendAndroidSwipe(swipe),
			onOpenAccessibility: () => this.#sendAndroidControl({type: "open-accessibility"}),
			onKey: (code) => this.#sendAndroidControl({type: "key", code}),
			onLaunchPackage: (packageName) => this.#sendAndroidControl({type: "launch", packageName}),
			onFrameRectChange: (rect) => writeStoredRect(ANDROID_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("android", true),
		})
		this.#agentSignalPane = new AppWebAgentSignalPane(this)
		this.#terminal = this.#createTerminalController()
		this.#updateCodexHeaderControls()
		this.#networkTerminal = this.#createNetworkTerminalController()
		this.#voiceHud = this.#createVoiceHud()
		this.#codexComposer = new AppWebCodexComposerPane(this)
		this.#codexEditor = this.#createCodexEditor()
		this.#codexDock = new AppWebDockPane(this, "codex")
		this.#settingsDock = new AppWebDockPane(this, "settings")
		this.#todoDock = new AppWebDockPane(this, "todo")
		this.#workspaceDock = new AppWebDockPane(this, "workspace")
		this.#sqliteDock = new AppWebDockPane(this, "sqlite")
		this.#networkDock = new AppWebDockPane(this, "network")
		this.#androidDock = new AppWebDockPane(this, "android")
		this.#fullscreenDock = new AppWebDockPane(this, "fullscreen")

		this.#viewport.hud.addSurface(this.#terminal.pane, (bounds) => this.#codexRect(bounds), {zIndex: HUD_PANEL_Z})
		this.#viewport.hud.addSurface(this.#codexComposer, (bounds) => this.#codexComposerRect(bounds), {zIndex: HUD_PANEL_Z + 0.4})
		this.#viewport.hud.addSurface(this.#codexEditor, (bounds) => this.#codexEditorRect(bounds), {zIndex: HUD_PANEL_Z + 0.5})
		this.#viewport.hud.addSurface(this.#settingsPane, (bounds) => this.#settingsRect(bounds), {zIndex: HUD_SETTINGS_PANEL_Z})
		this.#viewport.hud.addSurface(this.#todoPane, (bounds) => this.#todoRect(bounds), {zIndex: HUD_TODO_PANEL_Z})
		this.#viewport.hud.addSurface(this.#workspaceFiles, (bounds) => this.#workspaceFilesRect(bounds), {zIndex: HUD_PANEL_Z + 2})
		this.#viewport.hud.addSurface(this.#workspaceEditor, (bounds) => this.#workspaceEditorRect(bounds), {zIndex: HUD_PANEL_Z + 3})
		this.#viewport.hud.addSurface(this.#sqliteTables, (bounds) => this.#sqliteTablesRect(bounds), {zIndex: HUD_PANEL_Z + 2})
		this.#viewport.hud.addSurface(this.#sqliteRows, (bounds) => this.#sqliteRowsRect(bounds), {zIndex: HUD_PANEL_Z + 3})
		this.#viewport.hud.addSurface(this.#networkWatchPane, (bounds) => this.#networkControlsRect(bounds), {zIndex: HUD_PANEL_Z + 2})
		this.#viewport.hud.addSurface(this.#networkTerminal.pane, (bounds) => this.#networkTerminalRect(bounds), {zIndex: HUD_PANEL_Z + 3})
		this.#viewport.hud.addSurface(this.#androidPane, (bounds) => this.#androidRect(bounds), {zIndex: HUD_PANEL_Z + 1})
		this.#viewport.hud.addSurface(this.#agentSignalPane, (bounds) => this.#agentSignalRect(bounds), {zIndex: HUD_AGENT_SIGNAL_Z})
		this.#viewport.hud.addSurface(this.#voiceHud, (bounds) => this.#voiceSettingsRect(bounds), {zIndex: HUD_VOICE_SETTINGS_Z})
		this.#viewport.hud.addSurface(this.#codexDock, (bounds) => this.#dockRect("codex", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#settingsDock, (bounds) => this.#dockRect("settings", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#todoDock, (bounds) => this.#dockRect("todo", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#workspaceDock, (bounds) => this.#dockRect("workspace", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#sqliteDock, (bounds) => this.#dockRect("sqlite", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#networkDock, (bounds) => this.#dockRect("network", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#androidDock, (bounds) => this.#dockRect("android", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#fullscreenDock, (bounds) => this.#dockRect("fullscreen", bounds), {zIndex: HUD_DOCK_Z})

		document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("webkitfullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("dragover", this.#codexDragOver, {capture: true})
		document.addEventListener("drop", this.#codexDrop, {capture: true})
		document.addEventListener("dragleave", this.#codexDragLeave, {capture: true})
		document.addEventListener("visibilitychange", () => this.#handleDocumentVisibilityChange())
		window.addEventListener("focus", () => this.#handleDocumentVisibilityChange())
		window.addEventListener("blur", () => {
			if (this.#documentHasLocalVoiceFocus()) return
			this.#onVoiceLeaseRelease("blur")
			this.#suspendVoiceForInactiveDocument()
		})
		window.addEventListener("pagehide", () => {
			if (this.#documentHasLocalVoiceFocus()) return
			this.#onVoiceLeaseRelease("pagehide")
			this.#suspendVoiceForInactiveDocument()
		})
		window.addEventListener("online", () => void this.#handleVoiceNetworkOnline())
		this.#connectTerminal()
		this.#connectAndroidRtc()
		this.#updateNetworkWatchPane()
		void this.#loadTodo()
		void this.#loadWorkspaceSourceFiles()
		void this.#refreshWorkspaceProcesses()
		void this.#loadSqliteTables()
		void this.#refreshVoiceServiceState()
		;(globalThis as VoiceRtcDebugGlobal).__metaVoiceRtcDebug = readVoiceRtcDebugSnapshot
		;(globalThis as AppVoiceLeaseDebugGlobal).__metaVoiceLeaseDebug = () => this.#voiceLeaseDebugSnapshot()
		this.#updateVoiceHud()
		this.#installCodexNativeInput()
		onVoiceRtcDebug(() => {
			this.#voiceRtcDebug = readVoiceRtcDebugSnapshot()
			this.#codexComposer.requestRender()
			this.#voiceHud.requestRender()
		})
		this.#scheduleVoiceRtcPrewarm()
		void this.#importInterpreterVoiceSettings().finally(() => {
			this.#scheduleVoiceAutoWake(500)
			this.#scheduleVoiceRtcPrewarm(900)
		})
		installHudNotificationSoundUnlock()
	}

	currentSrc(): string {
		return this.#src
	}

	androidFrameSize(): {height: number; width: number} | null {
		const frame = this.#androidPane.frameSnapshot()
		return frame === null ? null : {width: frame.width, height: frame.height}
	}

	settingsSnapshot(): AppWebHudSettingsSnapshot {
		return cloneSettings(this.#settings)
	}

	setVoiceLease(ownerId: string | null, expiresAt: number, ttlMs?: number): void {
		this.#voiceLeaseOwnerId = ownerId
		const leaseTtlMs = typeof ttlMs === "number" && Number.isFinite(ttlMs) ? ttlMs : null
		this.#voiceLeaseExpiresAt = leaseTtlMs === null
			? (Number.isFinite(expiresAt) ? expiresAt : 0)
			: Date.now() + Math.max(0, leaseTtlMs)
		const ownedNow = this.#ownsVoiceLease()
		if (!ownedNow) {
			this.#clearVoiceLeaseHeartbeat()
			this.#suspendVoiceDictationForRemoteLease()
			if (!this.#voiceAutoWakePaused) this.#scheduleVoiceAutoWake(80)
			this.#codexComposer.requestRender()
			this.#voiceHud.requestRender()
			return
		}
		this.#scheduleVoiceLeaseHeartbeat()
		if (!this.#voiceAutoWakePaused) this.#scheduleVoiceAutoWake(80)
		this.#codexComposer.requestRender()
		this.#voiceHud.requestRender()
	}

	syncVoiceLease(reason = "sync"): void {
		if (isAndroidBrowser()) return
		if (!this.#documentHasLocalVoiceFocus()) return
		this.#onVoiceLeaseRequest(reason)
	}

	sendAndroidControl(command: AndroidRtcCommand): boolean {
		return this.#sendAndroidControl(command)
	}

	showNetworkTerminal(command: AppWebNetworkTerminalCommand = {}): void {
		const action = command.action ?? "show"
		if (command.session !== undefined && command.session.trim().length > 0) {
			this.#networkTerminal.sessionId = command.session.trim()
			writeStoredString(NETWORK_TERMINAL_SESSION_STORAGE_KEY, this.#networkTerminal.sessionId)
		}
		if (action === "dock") {
			this.setDocked("network", true)
			return
		}
		if (action === "toggle") {
			const wasDocked = this.#networkDocked
			this.setDocked("network", !wasDocked)
			if (!wasDocked) return
		} else {
			this.setDocked("network", false)
		}
		this.#connectNetworkTerminal()
		this.#viewport.hud.setFocused(this.#networkTerminal.pane)
		this.#networkTerminal.pane.focus()
		this.#scheduleNetworkStatusRefresh(0, {force: true})
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

	setTodoMarkdown(text: string, path: string): void {
		this.#todoPane.setMarkdown(text, path)
	}

	statsLine(): string {
		const root = this.#stats.rootSrc ? `${this.#stats.rootSrc}: ` : ""
		return `${root}${this.#stats.shellCount} shells / ${this.#stats.fieldCount} fields`
	}

	codexDraft(): string {
		return this.#codexDraft
	}

	codexAttachments(): readonly CodexComposerAttachment[] {
		return this.#codexAttachments
	}

	codexDropActive(): boolean {
		return this.#codexDropActive
	}

	codexComposerStatus(): string {
		if (this.#codexComposerStatus) return this.#codexComposerStatus
		if (this.#voiceStatus === "listening" || this.#voiceStatus === "committing") {
			return voiceStatusLine(this.#voiceStatus)
		}
		if (this.#terminal.socket?.readyState !== WebSocket.OPEN) return "Codex terminal не подключен"
		return this.#terminal.statusLabel
	}

	codexComposerReady(): boolean {
		return this.#terminal.socket?.readyState === WebSocket.OPEN
	}

	voiceButtonSnapshot(): ButtonVoiceSnapshot {
		return {
			status: this.#voiceStatus,
			serviceState: this.#voiceServiceState,
			level: this.#voiceStatus === "listening" || this.#voiceStatus === "committing" ? this.#voiceLevel : 0,
		}
	}

	voiceSoundPulse(): number {
		return this.#voiceHud.soundPulseAmount()
	}

	voiceTransport(): VoiceInputTransport {
		return this.#voiceTransport
	}

	toggleVoiceInput(): void {
		void this.#toggleVoice()
	}

	#setCodexDraftFromEditor(value: string): void {
		if (this.#codexEditorSyncing) return
		if (this.#codexNativeInputSyncing) return
		if (this.#codexDraft === value) return
		if (this.#voiceComposerBaseDraft !== null && value !== this.#voiceComposerGeneratedDraft) {
			this.#voiceComposerEdited = true
		}
		this.#codexDraft = value
		this.#syncCodexNativeInputValue()
		this.#codexComposer.requestRender()
	}

	#setCodexDraft(value: string): void {
		if (this.#codexDraft === value) return
		this.#codexDraft = value
		this.#syncCodexEditor()
		this.#syncCodexNativeInputValue()
		this.#codexComposer.requestRender()
	}

	removeCodexAttachment(id: string): void {
		const next = this.#codexAttachments.filter((attachment) => attachment.id !== id)
		if (next.length === this.#codexAttachments.length) return
		this.#codexAttachments = next
		this.#setCodexComposerStatus(next.length > 0 ? `${next.length} влож.` : "")
		this.#codexComposer.requestRender()
	}

	submitCodexComposer(): void {
		const message = codexComposerMessage(this.#codexDraft, this.#codexAttachments)
		if (message.length === 0 || !this.codexComposerReady()) return
		const payload = this.#terminal.state?.bracketedPaste
			? `\x1b[200~${message}\x1b[201~\r`
			: `${message}\r`
		this.#clearVoicePartialPreview()
		this.#discardVoiceAutoSendBuffer()
		this.#voiceNextFlushMode = "auto"
		this.#sendTerminalInput(payload, "api", message)
		this.#resetVoiceComposerDraftTracking()
		this.#setCodexDraft("")
		this.#codexAttachments = []
		this.#setCodexComposerStatus("отправлено")
		this.#focusCodexComposer()
		this.#codexComposer.requestRender()
	}

	connectionLine(): string {
		return this.#connected ? "socket online" : "socket offline"
	}

	terminalStatusLabel(): string {
		return this.#terminal.statusLabel
	}

	agentSoundEnabled(): boolean {
		return readHostTerminalAgentSoundEnabled()
	}

	setAgentSoundEnabled(enabled: boolean): void {
		writeHostTerminalAgentSoundEnabled(enabled)
		this.#updateCodexHeaderControls()
		this.#agentSignalPane.requestRender()
	}

	agentSoundVolume(): number {
		return readHostTerminalAgentSoundVolume()
	}

	setAgentSoundVolume(value: number): void {
		writeHostTerminalAgentSoundVolume(Math.round(clampHostTerminalAgentSoundVolume(value) * 20) / 20)
		this.#updateCodexHeaderControls()
		this.#agentSignalPane.requestRender()
	}

	setVoiceAutoSendEnabled(enabled: boolean): void {
		writeCodexVoiceAutoSendEnabled(enabled)
		this.#voiceHud.requestRender()
		this.#settingsPane.requestRender()
	}

	setVoiceSignalVolume(value: number): void {
		writeVoiceSignalVolume(value)
		this.#voiceHud.requestRender()
		this.#settingsPane.requestRender()
	}

	setVoiceRecognitionTimeoutSeconds(value: number): void {
		writeVoiceRecognitionTimeoutSeconds(value)
		this.#voiceClient?.refreshDeactivationSettings()
		this.#voiceHud.requestRender()
		this.#settingsPane.requestRender()
	}

	setVoiceDeactivationMode(value: VoiceInputHudDeactivationMode): void {
		writeVoiceDeactivationMode(value)
		this.#voiceClient?.refreshDeactivationSettings()
		this.#voiceHud.requestRender()
		this.#settingsPane.requestRender()
	}

	setVoicePhraseFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId, value: number): void {
		writeVoiceFuzzyTolerance(groupId, value)
		this.#restartVoiceCommandRecognizerAfterSettingsChange()
		this.#voiceHud.requestRender()
		this.#settingsPane.requestRender()
	}

	voicePhraseGroups(): VoiceInputHudPhraseGroup[] {
		return voicePhraseGroups(this.#voiceWakeLines)
	}

	addVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
		this.#addVoicePhrase(groupId, phrase)
		this.#settingsPane.requestRender()
	}

	removeVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
		this.#removeVoicePhrase(groupId, phrase)
		this.#settingsPane.requestRender()
	}

	resetVoicePhrases(groupId: VoiceInputHudPhraseGroupId): void {
		this.#resetVoicePhrases(groupId)
		this.#settingsPane.requestRender()
	}

	openVoiceSettings(): void {
		this.#setVoiceSettingsOpen(true)
		this.#viewport.hud.relayout()
		this.#voiceHud.openSettings()
		this.#voiceHud.requestRender()
	}

	#setVoiceSettingsOpen(open: boolean): void {
		if (this.#voiceSettingsOpen === open) return
		this.#voiceSettingsOpen = open
		if (!open) this.#viewport.hud.clearSurfaceRect(this.#voiceHud)
		this.#viewport.hud.relayout()
		this.#voiceHud.requestRender()
	}

	relayout(): void {
		this.#viewport.hud.relayout()
	}

	busy(): boolean {
		return this.#busy
	}

	srcDraft(): string {
		return this.#src
	}

	setSrcDraft(value: string): void {
		this.#src = value
		this.#settingsPane.requestRender()
	}

	apply(): void {
		this.#busy = true
		this.#settingsPane.requestRender()
		this.#onApply(this.#src.trim() || DEFAULT_APP_WEB_SCENE_SRC, this.settingsSnapshot())
	}

	setDocked(kind: DockKind, docked: boolean): void {
		if (kind === "fullscreen") return
		if (this.#startDockTransition(kind, docked)) return
		this.#finishDockTransition(true)
		this.#applyDockedState(kind, docked)
		this.#viewport.hud.relayout()
		if (!docked) this.#focusUndockedPanel(kind)
	}

	#applyDockedState(kind: DockPanelKind, docked: boolean): void {
		if (kind === "codex") {
			this.#codexDocked = docked
			writeStoredBoolean(CODEX_DOCKED_STORAGE_KEY, docked)
		} else if (kind === "settings") {
			this.#settingsDocked = docked
			writeStoredBoolean(SETTINGS_DOCKED_STORAGE_KEY, docked)
		} else if (kind === "todo") {
			this.#todoDocked = docked
			writeStoredBoolean(TODO_DOCKED_STORAGE_KEY, docked)
		} else if (kind === "workspace") {
			this.#workspaceDocked = docked
		} else if (kind === "sqlite") {
			this.#sqliteDocked = docked
			writeStoredBoolean(SQLITE_DOCKED_STORAGE_KEY, docked)
			if (!docked) void this.#loadSqliteTables()
		} else if (kind === "network") {
			this.#networkDocked = docked
			writeStoredBoolean(NETWORK_DOCKED_STORAGE_KEY, docked)
			if (!docked) this.#connectNetworkTerminal()
			this.#syncNetworkStatusRefresh()
		} else if (kind === "android") {
			this.#androidDocked = docked
			writeStoredBoolean(ANDROID_DOCKED_STORAGE_KEY, docked)
		this.#connectAndroidRtc()
		}
	}

	#startDockTransition(kind: DockPanelKind, docked: boolean): boolean {
		if (this.#panelDocked(kind) === docked && this.#dockTransition?.kind !== kind) return false
		this.#finishDockTransition(true)
		const panel = this.#panelSurface(kind)
		const dock = this.#dockSurface(kind)
		if (panel === null || dock === null) return false

		if (docked) {
			const panelFrame = this.#viewport.hud.surfaceFrame(panel)
			if (panelFrame === null || panelFrame.rect.visible === false) return false
			const targetRect = dockRectForPlacement(kind, this.dockPlacement(kind, panelFrame.bounds), panelFrame.bounds)
			this.#runDockTransition({
				kind,
				surface: panel,
				baseRect: panelFrame.rect,
				fromRect: panelFrame.rect,
				toRect: targetRect,
				extras: this.#dockTransitionExtras(kind, panelFrame.rect, panelFrame.rect, targetRect),
				bounds: panelFrame.bounds,
				pixelScale: inferHudNodePixelScale(panel.node.position.x, panel.node.position.y, panelFrame.rect, panelFrame.bounds),
				targetDocked: true,
				startedAt: performance.now(),
				durationMs: DOCK_TRANSITION_MS,
				rafId: null,
			})
			return true
		}

		const dockFrame = this.#viewport.hud.surfaceFrame(dock)
		if (dockFrame === null || dockFrame.rect.visible === false) return false
		this.#applyDockedState(kind, false)
		this.#viewport.hud.relayout()
		const panelFrame = this.#viewport.hud.surfaceFrame(panel)
		if (panelFrame === null || panelFrame.rect.visible === false) return false
		const transition: DockNodeTransition = {
			kind,
			surface: panel,
			baseRect: panelFrame.rect,
			fromRect: dockFrame.rect,
			toRect: panelFrame.rect,
			extras: this.#dockTransitionExtras(kind, panelFrame.rect, dockFrame.rect, panelFrame.rect),
			bounds: panelFrame.bounds,
			pixelScale: inferHudNodePixelScale(panel.node.position.x, panel.node.position.y, panelFrame.rect, panelFrame.bounds),
			targetDocked: false,
			startedAt: performance.now(),
			durationMs: DOCK_TRANSITION_MS,
			rafId: null,
		}
		this.#applyDockTransitionFrame(transition, 0)
		this.#runDockTransition(transition)
		return true
	}

	#runDockTransition(transition: DockNodeTransition): void {
		this.#dockTransition = transition
		this.#viewport.hud.relayout()
		this.#applyDockTransitionFrame(transition, 0)
		const step = (now: number): void => {
			if (this.#dockTransition !== transition) return
			const t = clampNumber((now - transition.startedAt) / transition.durationMs, 0, 1)
			const eased = dockTransitionEase(t)
			this.#applyDockTransitionFrame(transition, eased)
			if (t < 1) {
				transition.rafId = requestAnimationFrame(step)
				return
			}
			this.#completeDockTransition(transition)
		}
		transition.rafId = requestAnimationFrame(step)
	}

	#completeDockTransition(transition: DockNodeTransition): void {
		if (this.#dockTransition !== transition) return
		this.#dockTransition = null
		this.#resetDockTransitionNodes(transition)
		this.#applyDockedState(transition.kind, transition.targetDocked)
		this.#viewport.hud.relayout()
		if (!transition.targetDocked) this.#focusUndockedPanel(transition.kind)
	}

	#finishDockTransition(commitTarget: boolean): void {
		const transition = this.#dockTransition
		if (transition === null) return
		if (transition.rafId !== null) cancelAnimationFrame(transition.rafId)
		this.#dockTransition = null
		this.#resetDockTransitionNodes(transition)
		if (commitTarget) this.#applyDockedState(transition.kind, transition.targetDocked)
		this.#viewport.hud.relayout()
	}

	#applyDockTransitionFrame(transition: DockNodeTransition, t: number): void {
		this.#applyDockSurfaceNodeRect(
			transition.surface,
			transition.baseRect,
			interpolateRect(transition.fromRect, transition.toRect, t),
			transition.bounds,
			transition.pixelScale,
			false,
		)
		for (const extra of transition.extras) {
			this.#applyDockSurfaceNodeRect(
				extra.surface,
				extra.baseRect,
				interpolateRect(extra.fromRect, extra.toRect, t),
				transition.bounds,
				transition.pixelScale,
				true,
			)
		}
		this.#viewport.hud.requestRender()
	}

	#applyDockSurfaceNodeRect(surface: UiSurface, baseRect: UiSurfaceRect, rect: UiSurfaceRect, bounds: {w: number; h: number}, pixelScale: number, forceVisible: boolean): void {
		if (forceVisible) surface.node.visible = true
		surface.node.scale.set(
			rect.w / Math.max(1, baseRect.w),
			rect.h / Math.max(1, baseRect.h),
			1,
		)
		surface.node.position.x = (rect.x - bounds.w / 2) * pixelScale
		surface.node.position.y = (bounds.h / 2 - rect.y) * pixelScale
		surface.node.updateMatrix()
	}

	#resetDockTransitionNodes(transition: DockNodeTransition): void {
		this.#resetDockNodeTransform(transition.surface)
		for (const extra of transition.extras) this.#resetDockNodeTransform(extra.surface)
	}

	#resetDockNodeTransform(surface: UiSurface): void {
		surface.node.scale.set(1, 1, 1)
		surface.node.updateMatrix()
	}

	#focusUndockedPanel(kind: DockPanelKind): void {
		if (kind !== "codex") return
		this.#terminal.pane.focus()
	}

	#dockTransitionExtras(kind: DockPanelKind, basePanelRect: UiSurfaceRect, fromPanelRect: UiSurfaceRect, toPanelRect: UiSurfaceRect): DockExtraTransition[] {
		if (kind === "workspace") {
			const frame = this.#viewport.hud.surfaceFrame(this.#workspaceEditor)
			if (frame === null || frame.rect.visible === false) return []
			return [{
				surface: this.#workspaceEditor,
				baseRect: frame.rect,
				fromRect: projectChildRectBetweenParents(basePanelRect, frame.rect, fromPanelRect),
				toRect: projectChildRectBetweenParents(basePanelRect, frame.rect, toPanelRect),
			}]
		}
		if (kind === "sqlite") {
			const frame = this.#viewport.hud.surfaceFrame(this.#sqliteRows)
			if (frame === null || frame.rect.visible === false) return []
			return [{
				surface: this.#sqliteRows,
				baseRect: frame.rect,
				fromRect: projectChildRectBetweenParents(basePanelRect, frame.rect, fromPanelRect),
				toRect: projectChildRectBetweenParents(basePanelRect, frame.rect, toPanelRect),
			}]
		}
		if (kind === "network") {
			const frame = this.#viewport.hud.surfaceFrame(this.#networkTerminal.pane)
			if (frame === null || frame.rect.visible === false) return []
			return [{
				surface: this.#networkTerminal.pane,
				baseRect: frame.rect,
				fromRect: projectChildRectBetweenParents(basePanelRect, frame.rect, fromPanelRect),
				toRect: projectChildRectBetweenParents(basePanelRect, frame.rect, toPanelRect),
			}]
		}
		if (kind !== "codex") return []
		const frame = this.#viewport.hud.surfaceFrame(this.#agentSignalPane)
		if (frame === null || frame.rect.visible === false) return []
		return [{
			surface: this.#agentSignalPane,
			baseRect: frame.rect,
			fromRect: projectChildRectBetweenParents(basePanelRect, frame.rect, fromPanelRect),
			toRect: projectChildRectBetweenParents(basePanelRect, frame.rect, toPanelRect),
		}]
	}

	#panelDocked(kind: DockPanelKind): boolean {
		if (kind === "codex") return this.#codexDocked
		if (kind === "settings") return this.#settingsDocked
		if (kind === "todo") return this.#todoDocked
		if (kind === "workspace") return this.#workspaceDocked
		if (kind === "sqlite") return this.#sqliteDocked
		if (kind === "network") return this.#networkDocked
		return this.#androidDocked
	}

	#panelSurface(kind: DockPanelKind): UiSurface | null {
		if (kind === "codex") return this.#terminal.pane
		if (kind === "settings") return this.#settingsPane
		if (kind === "todo") return this.#todoPane
		if (kind === "workspace") return this.#workspaceFiles
		if (kind === "sqlite") return this.#sqliteTables
		if (kind === "network") return this.#networkWatchPane
		return this.#androidPane
	}

	#dockSurface(kind: DockPanelKind): UiSurface | null {
		if (kind === "codex") return this.#codexDock
		if (kind === "settings") return this.#settingsDock
		if (kind === "todo") return this.#todoDock
		if (kind === "workspace") return this.#workspaceDock
		if (kind === "sqlite") return this.#sqliteDock
		if (kind === "network") return this.#networkDock
		return this.#androidDock
	}

	dockTransitionActive(kind: DockKind): boolean {
		return kind !== "fullscreen" && this.#dockTransition?.kind === kind
	}

	isDocked(kind: DockKind): boolean {
		if (kind === "codex") return this.#codexDocked
		if (kind === "settings") return this.#settingsDocked
		if (kind === "fullscreen") return true
		if (kind === "todo") return this.#todoDocked
		if (kind === "workspace") return this.#workspaceDocked
		if (kind === "sqlite") return this.#sqliteDocked
		if (kind === "network") return this.#networkDocked
		return this.#androidDocked
	}

	dockLabel(kind: DockKind): string {
		if (kind === "codex") return CODEX_TITLE
		if (kind === "settings") return "Settings"
		if (kind === "android") return "Android"
		if (kind === "workspace") return "Inspector"
		if (kind === "sqlite") return "SQLite"
		if (kind === "network") return "Network"
		if (kind === "fullscreen") return ""
		return "TODO"
	}

	dockIcon(kind: DockKind): string {
		if (kind === "codex") return uiIcons.codex
		if (kind === "settings") return uiIcons.manual
		if (kind === "android") return uiIcons.language
		if (kind === "workspace") return uiIcons.database
		if (kind === "sqlite") return uiIcons.database
		if (kind === "network") return uiIcons.log
		if (kind === "fullscreen") return this.#fullscreen ? uiIcons.collapse : uiIcons.expand
		return uiIcons.apply
	}

	dockTooltip(kind: DockKind): string {
		if (kind === "fullscreen") return this.#fullscreen ? "Выйти из полного экрана" : "Полный экран"
		return this.dockLabel(kind)
	}

	dockEdge(kind: DockKind): HudSideTabEdge {
		return this.#dockPlacementRaw(kind)?.edge ?? defaultDockPlacement(kind, {w: 1, h: 1}).edge
	}

	dockPlacement(kind: DockKind, bounds: {w: number; h: number}): DockPlacement {
		return this.#dockPlacementRaw(kind) ?? defaultDockPlacement(kind, bounds)
	}

	setDockPlacement(kind: DockKind, placement: DockPlacement): void {
		const previous = this.#dockPlacementRaw(kind)
		if (previous !== null && sameDockPlacement(previous, placement)) return
		if (kind === "codex") {
			this.#codexDockPlacement = placement
			writeStoredDockPlacement(CODEX_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#codexDock.requestRender()
		} else if (kind === "settings") {
			this.#settingsDockPlacement = placement
			writeStoredDockPlacement(SETTINGS_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#settingsDock.requestRender()
		} else if (kind === "todo") {
			this.#todoDockPlacement = placement
			writeStoredDockPlacement(TODO_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#todoDock.requestRender()
		} else if (kind === "workspace") {
			this.#workspaceDockPlacement = placement
			writeStoredDockPlacement(WORKSPACE_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#workspaceDock.requestRender()
		} else if (kind === "sqlite") {
			this.#sqliteDockPlacement = placement
			writeStoredDockPlacement(SQLITE_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#sqliteDock.requestRender()
		} else if (kind === "network") {
			this.#networkDockPlacement = placement
			writeStoredDockPlacement(NETWORK_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#networkDock.requestRender()
		} else if (kind === "android") {
			this.#androidDockPlacement = placement
			writeStoredDockPlacement(ANDROID_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#androidDock.requestRender()
		} else {
			this.#fullscreenDockPlacement = placement
			writeStoredDockPlacement(FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY, placement)
			this.#fullscreenDock.requestRender()
		}
		this.#viewport.hud.relayout()
	}

	setDockPlacementFromPoint(kind: DockKind, point: {x: number; y: number}, bounds: {w: number; h: number}): void {
		this.setDockPlacement(kind, dockPlacementFromPoint(kind, point, bounds))
	}

	setSetting(key: AppWebSettingKey, value: boolean | number): void {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
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

	settingValue(key: AppWebSettingKey): boolean | number {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		if (config.section === "render") {
			return this.#settings.renderSettings[key as keyof AppWebRenderSettings] ?? config.defaultValue
		}
		return this.#settings.layoutSettings[key as keyof AppWebLayoutSettings] ?? config.defaultValue
	}

	stepSetting(key: AppWebSettingKey, direction: -1 | 1): void {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		if (typeof config.defaultValue === "boolean") {
			this.setSetting(key, !(this.settingValue(key) === true))
			return
		}
		const step = config.step ?? 1
		this.setSetting(key, Number(this.settingValue(key)) + step * direction)
	}

	toggleDockAction(kind: DockKind): void {
		if (kind === "fullscreen") {
			void this.#toggleFullscreen()
			return
		}
		this.setDocked(kind, false)
	}

	async #toggleFullscreen(): Promise<void> {
		try {
			if (appFullscreenActive()) {
				await exitAppFullscreen()
			} else {
				try {
					if (isAndroidBrowser()) appFullscreenFallbackOnNativeExitUntil = performance.now() + 1600
					await requestAppFullscreen()
					if (!(await waitForAppFullscreenActivation())) {
						appFullscreenFallbackOnNativeExitUntil = 0
						setAppFullscreenFallback(true, "native fullscreen did not activate")
					}
				} catch (error) {
					appFullscreenFallbackOnNativeExitUntil = 0
					if (!isAndroidBrowser()) throw error
					if (isFullscreenPermissionError(error)) throw error
					setAppFullscreenFallback(true, errorMessage(error))
				}
			}
		} catch (error) {
			writeAppFullscreenDebug({state: "failed", error: errorMessage(error)})
			console.warn("fullscreen toggle failed:", error)
		}
		this.#handleFullscreenChange()
	}

	#handleFullscreenChange(): void {
		const nativeActive = appFullscreenElement() !== null
		if (nativeActive && appFullscreenFallbackActive) setAppFullscreenFallback(false, "")
		if (!nativeActive && !appFullscreenFallbackActive && appFullscreenFallbackOnNativeExitUntil > performance.now()) {
			appFullscreenFallbackOnNativeExitUntil = 0
			setAppFullscreenFallback(true, "native fullscreen exited immediately")
		}
		const next = appFullscreenActive()
		if (next) writeAppFullscreenDebug({state: "active", error: ""})
		else if (appFullscreenDebug.state !== "failed") writeAppFullscreenDebug({state: "idle", target: "", error: ""})
		if (this.#fullscreen === next) return
		this.#fullscreen = next
		this.#fullscreenDock.requestRender()
		this.#viewport.hud.relayout()
	}

	async #refreshWorkspaceProcesses(): Promise<void> {
		try {
			const payload = await fetchJson("/hud/interpreter/processes")
			this.#workspaceProcesses = workspaceProcessesFromPayload(payload)
			this.#workspaceProcessLabel = this.#workspaceProcesses.length === 0 ? "Bun processes - none" : "Bun processes"
			const autoAttachProcessId = this.#workspaceAutoAttachProcessId()
			if (autoAttachProcessId !== null) {
				this.#workspaceAutoAttached = true
				await this.#attachWorkspaceProcess(autoAttachProcessId, {reveal: false})
				return
			}
			this.#syncWorkspaceFileTree()
		} catch (error) {
			this.#workspaceProcessLabel = `Bun processes - ${errorMessage(error)}`
			this.#syncWorkspaceFileTree()
		}
	}

	#workspaceAutoAttachProcessId(): string | null {
		if (this.#workspaceAutoAttached || this.#workspaceAttachedProcessId !== null) return null
		return workspacePreferredProcessId(this.#workspaceProcesses)
	}

	async #attachWorkspaceProcess(processId: string, opts: {reveal?: boolean} = {}): Promise<void> {
		const reveal = opts.reveal ?? true
		this.#workspaceAttachedProcessId = processId
		this.#workspaceProcessEntries = new Map()
		this.#workspaceEditor.setTitle("Inspector")
		this.#workspaceEditor.setLanguage({path: ""})
		this.#workspaceEditor.setText("")
		this.#workspaceCurrentEntry = null
		this.#workspaceEditorDirty = false
		try {
			const payload = await fetchJson(`/hud/interpreter/processes/${encodeURIComponent(processId)}/modules?limit=500`)
			const modules = workspaceProcessModulesFromPayload(payload)
			this.#workspaceProcessEntries = workspaceEntriesFromProcessModules(await this.#workspaceSourceModules(modules))
			this.#workspaceProcessLabel = `Attached: ${modules.label}`
			this.#syncWorkspaceFileTree()
			if (reveal && this.#workspaceDocked) this.setDocked("workspace", false)
		} catch (error) {
			this.#workspaceProcessLabel = `Attach failed - ${errorMessage(error)}`
			this.#syncWorkspaceFileTree()
		}
	}

	async #workspaceSourceModules(modules: WorkspaceProcessModules): Promise<WorkspaceProcessModules> {
		try {
			const payload = await fetchJson("/hud/source/files?limit=1200")
			const sourceFiles = workspaceSourceFilesFromPayload(payload)
			if (sourceFiles.modules.length === 0) return modules
			return {
				...modules,
				root: sourceFiles.root,
				workspacePath: sourceFiles.workspacePath,
				modules: sourceFiles.modules,
			}
		} catch (error) {
			console.warn("workspace source files failed:", error)
			return modules
		}
	}

	async #loadWorkspaceSourceFiles(): Promise<void> {
		try {
			const payload = await fetchJson("/hud/source/files?limit=5000")
			const sourceFiles = workspaceSourceFilesFromPayload(payload)
			this.#workspaceRootLabel = sourceFiles.workspacePath || "github"
			this.#workspaceLocalEntries = workspaceEntriesFromSourceFiles(sourceFiles)
			this.#syncWorkspaceFileTree()
		} catch (error) {
			this.#workspaceRootLabel = `github - ${errorMessage(error)}`
			this.#workspaceLocalEntries = new Map()
			this.#syncWorkspaceFileTree()
		}
	}

	#detachWorkspaceProcess(): void {
		this.#workspaceAttachedProcessId = null
		this.#workspaceProcessEntries = new Map()
		this.#workspaceCurrentEntry = null
		this.#workspaceEditorDirty = false
		this.#workspaceProcessLabel = "Bun processes"
		this.#workspaceEditor.setTitle("Inspector")
		this.#workspaceEditor.setLanguage({path: ""})
		this.#workspaceEditor.setText("")
		this.#syncWorkspaceFileTree()
		void this.#refreshWorkspaceProcesses()
	}

	async #runWorkspaceProcessAction(action: string): Promise<void> {
		const processId = this.#workspaceAttachedProcessId
		if (processId === null) return
		try {
			await fetchJson(`/hud/interpreter/processes/${encodeURIComponent(processId)}/action`, {
				method: "POST",
				headers: {"content-type": "application/json"},
				body: JSON.stringify({action}),
			})
			this.#workspaceEditor.setTitle(`Inspector - ${action}`)
			await this.#refreshWorkspaceProcesses()
		} catch (error) {
			this.#workspaceEditor.setTitle(`Action failed - ${errorMessage(error)}`)
		}
	}

	async #openWorkspaceDirectory(): Promise<void> {
		try {
			const picker = (window as Window & {showDirectoryPicker?: () => Promise<BrowserDirectoryHandle>}).showDirectoryPicker
			if (picker !== undefined) {
				const handle = await picker.call(window)
				const entries = new Map<string, WorkspaceFileEntry>()
				await collectDirectoryHandleFiles(handle, "", entries)
				this.#workspaceRootLabel = handle.name || "Local"
				this.#workspaceLocalEntries = entries
			} else {
				const result = await pickDirectoryWithInput()
				this.#workspaceRootLabel = result.label
				this.#workspaceLocalEntries = result.entries
			}
			this.#workspaceCurrentEntry = null
			this.#workspaceEditorDirty = false
			this.#workspaceEditor.setTitle("Inspector")
			this.#workspaceEditor.setLanguage({path: ""})
			this.#workspaceEditor.setText("")
			this.#syncWorkspaceFileTree()
			if (this.#workspaceDocked) this.setDocked("workspace", false)
		} catch (error) {
			if (isAbortError(error)) return
			this.#workspaceFiles.setTitle(`Inspector - ${errorMessage(error)}`)
		}
	}

	async #openWorkspaceItem(item: FileListItem): Promise<void> {
		if (item.id === "workspace:processes:refresh") {
			await this.#refreshWorkspaceProcesses()
			return
		}
		if (item.id === "workspace:processes:detach") {
			this.#detachWorkspaceProcess()
			return
		}
		const action = workspaceProcessActionForItemId(item.id)
		if (action !== null) {
			await this.#runWorkspaceProcessAction(action)
			return
		}
		const processId = workspaceProcessIdForItemId(item.id)
		if (processId !== null) {
			await this.#attachWorkspaceProcess(processId)
			return
		}
		if (item.kind !== "file") return
		const entry = this.#workspaceEntries.get(item.id)
		if (entry === undefined) return
		await this.#openWorkspaceEntry(entry)
	}

	async #openWorkspaceEntry(entry: WorkspaceFileEntry): Promise<void> {
		try {
			const text = entry.sourceKind === "process"
				? await this.#readWorkspaceProcessSource(entry)
				: entry.sourceKind === "source"
					? await this.#readWorkspaceSourceFile(entry)
				: await this.#readWorkspaceLocalSource(entry)
			this.#workspaceCurrentEntry = entry
			this.#workspaceEditorDirty = false
			this.#workspaceEditor.setTitle(entry.name)
			this.#workspaceEditor.setLanguage({path: entry.path})
			this.#workspaceEditor.setText(text)
			this.#viewport.hud.setFocused(this.#workspaceEditor)
		} catch (error) {
			if (isWorkspaceSourceMissingError(error)) this.#removeMissingWorkspaceEntry(entry)
			this.#workspaceEditor.setTitle(`Open failed - ${errorMessage(error)}`)
		}
	}

	#removeMissingWorkspaceEntry(entry: WorkspaceFileEntry): void {
		const id = workspaceEntryId(entry)
		this.#workspaceLocalEntries.delete(id)
		this.#workspaceProcessEntries.delete(id)
		if (this.#workspaceCurrentEntry !== null && workspaceEntryId(this.#workspaceCurrentEntry) === id && !this.#workspaceEditorDirty) {
			this.#workspaceCurrentEntry = null
			this.#workspaceEditor.setLanguage({path: ""})
			this.#workspaceEditor.setText("")
		}
		this.#syncWorkspaceFileTree()
	}

	async #readWorkspaceProcessSource(entry: WorkspaceFileEntry): Promise<string> {
		if (entry.processId === undefined || entry.sourceUrl === undefined) throw new Error("process source is missing")
		const url = `/hud/interpreter/processes/${encodeURIComponent(entry.processId)}/source?sourceUrl=${encodeURIComponent(entry.sourceUrl)}&tokens=1`
		const payload = await fetchJson(url)
		const source = (payload as {scriptSource?: unknown}).scriptSource
		if (typeof source !== "string") throw new Error("source payload has no scriptSource")
		return source
	}

	async #readWorkspaceSourceFile(entry: WorkspaceFileEntry): Promise<string> {
		if (entry.sourcePath === undefined) throw new Error("source path is missing")
		const payload = await fetchJson(`/hud/source/file?path=${encodeURIComponent(entry.sourcePath)}`)
		const text = (payload as {text?: unknown}).text
		if (typeof text !== "string") throw new Error("source payload has no text")
		return text
	}

	async #readWorkspaceLocalSource(entry: WorkspaceFileEntry): Promise<string> {
		if (entry.handle !== undefined) return await (await entry.handle.getFile()).text()
		if (entry.file !== undefined) return await entry.file.text()
		throw new Error("local file is missing")
	}

	#handleWorkspaceEditorChange(_text: string): void {
		const entry = this.#workspaceCurrentEntry
		if (entry === null || this.#workspaceEditorDirty) return
		this.#workspaceEditorDirty = true
		this.#workspaceEditor.setTitle(`${entry.name} *`)
	}

	async #saveWorkspaceEditor(text: string): Promise<void> {
		const entry = this.#workspaceCurrentEntry
		if (entry === null) return
		try {
			if (entry.sourceKind === "process") {
				if (entry.processId === undefined || entry.sourceUrl === undefined) throw new Error("process source is missing")
				await fetchJson(`/hud/interpreter/processes/${encodeURIComponent(entry.processId)}/source`, {
					method: "POST",
					headers: {"content-type": "application/json"},
					body: JSON.stringify({sourceUrl: entry.sourceUrl, text}),
				})
			} else if (entry.sourceKind === "source") {
				if (entry.sourcePath === undefined) throw new Error("source path is missing")
				await fetchJson("/hud/source/file", {
					method: "POST",
					headers: {"content-type": "application/json"},
					body: JSON.stringify({path: entry.sourcePath, text}),
				})
			} else {
				const writable = await entry.handle?.createWritable?.()
				if (writable === undefined) throw new Error("browser did not grant write access for this file")
				await writable.write(text)
				await writable.close()
			}
			this.#workspaceEditorDirty = false
			this.#workspaceEditor.setTitle(entry.name)
		} catch (error) {
			this.#workspaceEditor.setTitle(`Save failed - ${errorMessage(error)}`)
		}
	}

	#syncWorkspaceFileTree(): void {
		const items = workspaceInspectorItems({
			localLabel: this.#workspaceRootLabel,
			localEntries: this.#workspaceLocalEntries,
			processes: this.#workspaceProcesses,
			processLabel: this.#workspaceProcessLabel,
			processEntries: this.#workspaceProcessEntries,
			attachedProcessId: this.#workspaceAttachedProcessId,
		})
		this.#workspaceEntries = new Map([...this.#workspaceLocalEntries, ...this.#workspaceProcessEntries])
		this.#workspaceFiles.setTitle("Inspector")
		this.#workspaceFiles.setItems(items)
		this.#workspaceFiles.setExpandedIds(workspaceDefaultExpandedIds(items))
		this.#workspaceFiles.requestRender()
	}

	async #loadSqliteTables(): Promise<void> {
		try {
			const payload = sqliteDatabasePayloadFromUnknown(await fetchJson(`/hud/interpreter/sqlite?path=${encodeURIComponent(APP_WEB_SQLITE_PATH)}`))
			this.#syncSqliteTables(payload)
			const preferred = this.#sqliteSelectedTable ?? (payload.tables.some((table) => table.name === "actor") ? "actor" : payload.tables[0]?.name ?? null)
			if (preferred !== null) await this.#openSqliteTable(preferred, {reveal: false})
		} catch (error) {
			this.#sqliteTables.setTitle(`SQLite - ${errorMessage(error)}`)
			this.#sqliteRows.clearPayload(`SQLite недоступен: ${errorMessage(error)}`)
		}
	}

	async #openSqliteItem(item: FileListItem): Promise<void> {
		const table = sqliteTableNameFromItemId(item.id)
		if (table === null) return
		await this.#openSqliteTable(table)
	}

	async #openSqliteTable(table: string, opts: {reveal?: boolean} = {}): Promise<void> {
		try {
			const url = `/hud/interpreter/sqlite?path=${encodeURIComponent(APP_WEB_SQLITE_PATH)}&table=${encodeURIComponent(table)}&limit=120`
			const payload = sqliteDatabasePayloadFromUnknown(await fetchJson(url))
			this.#syncSqliteTables(payload)
			const selectedTable = payload.selectedTable ?? table
			this.#sqliteSelectedTable = selectedTable
			this.#selectSqliteTable(selectedTable)
			this.#sqliteRows.setPayload(payload)
			this.#viewport.hud.setFocused(this.#sqliteRows)
			if ((opts.reveal ?? true) && this.#sqliteDocked) this.setDocked("sqlite", false)
		} catch (error) {
			this.#sqliteRows.clearPayload(`Не удалось открыть таблицу ${table}: ${errorMessage(error)}`)
		}
	}

	async #updateSqliteCell(rowid: number, column: string, value: SqliteCellValue): Promise<void> {
		const table = this.#sqliteSelectedTable
		if (table === null) return
		try {
			const payload = sqliteDatabasePayloadFromUnknown(await fetchJson("/hud/interpreter/sqlite/cell", {
				method: "POST",
				headers: {"content-type": "application/json"},
				body: JSON.stringify({
					path: APP_WEB_SQLITE_PATH,
					table,
					rowid,
					column,
					value,
				}),
			}))
			this.#syncSqliteTables(payload)
			this.#sqliteSelectedTable = payload.selectedTable ?? table
			this.#sqliteRows.setPayload(payload)
		} catch (error) {
			this.#sqliteRows.setStatus(errorMessage(error))
		}
	}

	#syncSqliteTables(payload: SqliteDatabasePayload): void {
		this.#sqliteTables.setTitle(`SQLite - ${payload.label}`)
		this.#sqliteTables.setItems(sqliteTableItems(payload.tables))
		const selectedTable = payload.selectedTable ?? this.#sqliteSelectedTable
		if (selectedTable !== null) this.#selectSqliteTable(selectedTable)
	}

	#selectSqliteTable(table: string): void {
		this.#sqliteSelectionSyncing = true
		try {
			this.#sqliteTables.setSelectedIds([sqliteTableItemId(table)])
		} finally {
			this.#sqliteSelectionSyncing = false
		}
	}

	#createTerminalController(): TerminalController {
		const controller = {} as TerminalController
		const pane = new TerminalPane({
			title: `${CODEX_TITLE} · ${CODEX_MODEL}`,
			status: "connecting",
			statusKind: "idle",
			headerControls: this.#codexHeaderControls(),
			fontPx: 12,
			linePx: 17,
			maxScrollback: 10000,
			respondToTerminalQueries: false,
			terminalQueryMode: "cursor",
			terminalMouseWheelMode: "scrollback",
			cursorWhenBlurred: true,
			draggable: true,
			resizable: true,
			inputEnabled: false,
			onInput: (data, source) => this.#sendTerminalInput(data, source),
			onResize: (size) => this.#resizeTerminal(size),
			onFocusChange: (focused) => {
				if (!focused) return
				this.#viewport.hud.setFocused(pane)
			},
			onFrameRectChange: (rect) => writeStoredRect(CODEX_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("codex", true),
		})
		pane.setAutoscrollPinned(this.#codexAutoscrollPinned)
		Object.assign(controller, {
			pane,
			socket: null,
			sessionId: readStoredString(CODEX_SESSION_STORAGE_KEY),
			size: null,
			state: null,
			statusLabel: "connecting",
			localEchoId: 0,
			agentNotifyArmed: false,
			agentNotifySawOutput: false,
			agentNotifyLastOutputAt: 0,
			agentNotifyLastPlayedAt: 0,
			agentNotifyTimer: null,
		} satisfies TerminalController)
		return controller
	}

	#createNetworkWatchPane(): NetworkWatchPane {
		return new NetworkWatchPane({
			title: "NetworkMux",
			sessionLabel: `${NETWORK_TERMINAL_TMUX_SESSION}:network`,
			actions: {
				setTlsEnabled: (enabled) => {
					this.#networkServiceSwitches = {...this.#networkServiceSwitches, tls: enabled}
					this.#updateNetworkWatchPane()
					void this.#runNetworkAction(networkActionForSwitch("tls", enabled))
				},
				setRedirectEnabled: (enabled) => {
					this.#networkServiceSwitches = {...this.#networkServiceSwitches, redirect: enabled}
					this.#updateNetworkWatchPane()
					void this.#runNetworkAction(networkActionForSwitch("redirect", enabled))
				},
				setProductViaInterpreter: () => {
					this.#networkActionStatus = "prod uses app/web"
					this.#updateNetworkWatchPane()
				},
				setAutoRefreshEnabled: (enabled) => this.#setNetworkStatusAutoRefreshEnabled(enabled),
				rebuildLayout: () => {
					this.#networkServiceSwitches = {tls: true, redirect: true}
					this.#updateNetworkWatchPane()
					void this.#runNetworkAction("layout")
				},
				clearPanes: () => void this.#runNetworkAction("clear"),
				refresh: () => this.#scheduleNetworkStatusRefresh(0, {force: true}),
			},
		})
	}

	#createNetworkTerminalController(): TerminalController {
		const controller = {} as TerminalController
		const pane = new TerminalPane({
			title: "Network · tmux",
			status: "connecting",
			statusKind: "idle",
			fontPx: 12,
			linePx: 17,
			maxScrollback: 10000,
			respondToTerminalQueries: false,
			terminalQueryMode: "cursor",
			terminalMouseWheelMode: "scrollback",
			cursorWhenBlurred: true,
			draggable: true,
			resizable: true,
			inputEnabled: false,
			onInput: (data, source) => this.#sendNetworkTerminalInput(data, source),
			onResize: (size) => this.#resizeNetworkTerminal(size),
			onFocusChange: (focused) => {
				if (!focused) return
				this.#viewport.hud.setFocused(pane)
			},
			onFrameRectChange: (rect) => writeStoredRect(NETWORK_TERMINAL_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("network", true),
		})
		Object.assign(controller, {
			pane,
			socket: null,
			sessionId: readStoredString(NETWORK_TERMINAL_SESSION_STORAGE_KEY),
			size: null,
			state: null,
			statusLabel: "connecting",
			localEchoId: 0,
			agentNotifyArmed: false,
			agentNotifySawOutput: false,
			agentNotifyLastOutputAt: 0,
			agentNotifyLastPlayedAt: 0,
			agentNotifyTimer: null,
		} satisfies TerminalController)
		return controller
	}

	#createCodexEditor(): EditorPane {
		const editor = new EditorPane({
			title: "Message.md",
			path: "message.md",
			fontPx: 12,
			linePx: 17,
			titleFontPx: 11,
			readOnly: false,
			chrome: "none",
			bodyInsetX: 0,
			bodyTopGap: 0,
			bodyBottomInset: 0,
			showCaret: true,
			introAnimation: false,
			showHeader: false,
			indentGuides: false,
			showLineNumbers: false,
			wrapLines: true,
			draggable: false,
			resizable: false,
			onChange: (text) => this.#setCodexDraftFromEditor(text),
			onSelectionChange: () => this.#syncCodexNativeInputSelection(),
			onSave: () => this.submitCodexComposer(),
			onSubmit: () => this.submitCodexComposer(),
		})
		const onPointerDown = editor.onPointerDown.bind(editor)
		editor.onPointerDown = (event, localX, localY) => {
			onPointerDown(event, localX, localY)
			if (event.button === 0) this.#focusCodexNativeInput()
		}
		editor.setSelectionContextMenuEnabled(true)
		return editor
	}

	#syncCodexEditor(): void {
		if (this.#codexEditorSyncing || this.#codexEditor.getText() === this.#codexDraft) return
		this.#codexEditorSyncing = true
		try {
			this.#codexEditor.setText(this.#codexDraft)
			const lines = this.#codexDraft.split("\n")
			const lastLine = Math.max(0, lines.length - 1)
			this.#codexEditor.setCursor(lastLine, lines[lastLine]?.length ?? 0, {scroll: "nearest"})
		} finally {
			this.#codexEditorSyncing = false
		}
	}

	#installCodexNativeInput(): void {
		if (!shouldUseCodexNativeInput() || this.#codexNativeInput !== null) return
		const input = document.createElement("textarea")
		input.value = this.#codexDraft
		input.placeholder = ""
		input.autocomplete = "off"
		input.autocapitalize = "off"
		input.spellcheck = false
		input.inputMode = "text"
		Object.assign(input.style, {
			position: "fixed",
			left: "0px",
			top: "0px",
			width: "1px",
			height: "1px",
			zIndex: "2147483647",
			padding: "0",
			margin: "0",
			border: "0",
			outline: "none",
			resize: "none",
			background: "transparent",
			color: "transparent",
			caretColor: "transparent",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: "16px",
			lineHeight: "17px",
			whiteSpace: "pre-wrap",
			overflow: "hidden",
			opacity: "0.01",
			pointerEvents: "none",
			userSelect: "none",
			webkitUserSelect: "none",
			touchAction: "none",
			boxShadow: "none",
		} satisfies Partial<CSSStyleDeclaration>)
		input.addEventListener("beforeinput", (event) => {
			if (this.#handleCodexNativeBeforeInput(event as InputEvent)) {
				event.preventDefault()
			}
		})
		input.addEventListener("input", () => {
			if (this.#codexNativeInputSyncing) return
			this.#setCodexDraftFromNativeInput(input.value, input.selectionEnd ?? input.value.length)
		})
		input.addEventListener("focus", () => {
			this.#viewport.hud.setFocused(this.#codexEditor)
			this.#syncCodexNativeInputValue()
		})
		;(this.#viewport.hud.canvas.parentElement ?? document.body).appendChild(input)
		this.#codexNativeInput = input
		this.#syncCodexNativeInputOverlay()
		this.#codexNativeInputSyncTimer = window.setInterval(() => this.#syncCodexNativeInputOverlay(), 250)
	}

	#handleCodexNativeBeforeInput(event: InputEvent): boolean {
		if (this.#codexNativeInputSyncing || event.isComposing) return false
		const inputType = event.inputType
		if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
			this.#sendCodexNativeInputKey("Enter")
			return true
		}
		if (inputType === "deleteContentBackward") {
			this.#sendCodexNativeInputKey("Backspace")
			return true
		}
		if (inputType === "deleteContentForward") {
			this.#sendCodexNativeInputKey("Delete")
			return true
		}
		if (
			inputType === "insertText" ||
			inputType === "insertReplacementText" ||
			inputType === "insertFromPaste" ||
			inputType === "insertFromDrop"
		) {
			const text = event.data ?? ""
			if (text.length === 0) return false
			this.#codexEditor.insertText(text)
			this.#syncCodexNativeInputValue()
			return true
		}
		return false
	}

	#sendCodexNativeInputKey(key: string): void {
		this.#codexEditor.onKey(new KeyboardEvent("keydown", {key, bubbles: true, cancelable: true}))
		this.#syncCodexNativeInputValue()
	}

	#setCodexDraftFromNativeInput(value: string, cursorOffset = value.length): void {
		if (this.#codexDraft === value) return
		if (this.#voiceComposerBaseDraft !== null && value !== this.#voiceComposerGeneratedDraft) {
			this.#voiceComposerEdited = true
		}
		this.#codexDraft = value
		const cursor = codexTextPositionFromOffset(value, cursorOffset)
		this.#codexEditorSyncing = true
		try {
			this.#codexEditor.setText(value)
			this.#codexEditor.setCursor(cursor.line, cursor.col, {scroll: "nearest"})
		} finally {
			this.#codexEditorSyncing = false
		}
		this.#codexComposer.requestRender()
	}

	#syncCodexNativeInputValue(): void {
		const input = this.#codexNativeInput
		if (input === null) return
		if (input.value === this.#codexDraft) {
			this.#syncCodexNativeInputSelection()
			return
		}
		this.#codexNativeInputSyncing = true
		try {
			input.value = this.#codexDraft
			this.#syncCodexNativeInputSelection()
		} finally {
			this.#codexNativeInputSyncing = false
		}
	}

	#syncCodexNativeInputSelection(): void {
		const input = this.#codexNativeInput
		if (input === null) return
		const snapshot = this.#codexEditor.getSelectionSnapshot()
		const cursor = codexDraftOffsetForPosition(this.#codexDraft, snapshot.cursor)
		if (input.selectionStart === cursor && input.selectionEnd === cursor) return
		try {
			input.setSelectionRange(cursor, cursor)
		} catch {
			// Android can reject selection changes while the IME is recreating the input.
		}
	}

	#focusCodexNativeInput(): void {
		const input = this.#codexNativeInput
		if (input === null || input.style.display === "none") return
		this.#syncCodexNativeInputValue()
		if (document.activeElement !== input) input.focus({preventScroll: true})
		requestNativeSoftKeyboard()
		this.#syncCodexNativeInputSelection()
	}

	#blurCodexNativeInput(): void {
		const input = this.#codexNativeInput
		if (input !== null && document.activeElement === input) input.blur()
	}

	#syncCodexNativeInputOverlay(): void {
		const input = this.#codexNativeInput
		if (input === null) return
		const rect = this.#codexEditorRect({w: window.innerWidth, h: window.innerHeight})
		const visible = rect.visible !== false && rect.w > 0 && rect.h > 0
		input.style.display = visible ? "block" : "none"
		if (!visible) return
		const canvasRect = this.#viewport.hud.canvas.getBoundingClientRect()
		input.style.left = `${Math.round(canvasRect.left + rect.x)}px`
		input.style.top = `${Math.round(canvasRect.top + rect.y)}px`
		input.style.width = "24px"
		input.style.height = "24px"
		this.#syncCodexNativeInputValue()
	}

	#codexHeaderControls(): TerminalHeaderControls {
		const enabled = this.agentSoundEnabled()
		const pinned = this.#codexAutoscrollPinned
		const terminalPane = this.#terminal?.pane
		return {
			primary: [
				{
					label: pinned ? "Автоскролл включен" : "Автоскролл выключен",
					iconSrc: pinned ? uiIcons.autoscroll : uiIcons.manual,
					tone: pinned ? "live" : "neutral",
					active: pinned,
					action: () => {
						this.#codexAutoscrollPinned = !this.#codexAutoscrollPinned
						this.#terminal.pane.setAutoscrollPinned(this.#codexAutoscrollPinned)
						this.#updateCodexHeaderControls()
					},
				},
			],
			secondary: [
				{
					label: "Клавиатура терминала",
					iconSrc: uiIcons.keyboard,
					tone: terminalPane?.softKeyboardInputMode() === "text" ? "live" : "neutral",
					active: terminalPane?.softKeyboardInputMode() === "text",
					disabled: terminalPane === undefined,
					action: () => {
						terminalPane?.openSoftKeyboard()
						this.#updateCodexHeaderControls()
					},
				},
				{
					label: "Сигнал агента",
					iconSrc: agentSignalIcon(enabled),
					tone: enabled ? "live" : "neutral",
					action: () => this.#agentSignalPane.toggle(),
				},
			],
		}
	}

	#updateCodexHeaderControls(): void {
		this.#terminal.pane.setHeaderControls(this.#codexHeaderControls())
	}

	#connectTerminal(): void {
		if (this.#terminal.socket !== null) this.#terminal.socket.close()
		this.#terminal.socket = null
		this.#terminal.state = null
		this.#disarmAgentReadyNotification()
		this.#terminal.pane.setInputEnabled(false)
		this.#setTerminalStatus("idle", "connecting")
		const socket = new WebSocket(this.#terminalUrl())
		this.#terminal.socket = socket
		socket.addEventListener("open", () => {
			if (this.#terminal.socket !== socket) return
			this.#setTerminalStatus("connected", "connected")
			this.#terminal.pane.setInputEnabled(true)
			this.#codexComposer.requestRender()
			if (this.#terminal.size !== null) this.#sendTerminal({type: "terminal.resize", size: this.#terminal.size})
			this.#scheduleVoiceAutoWake()
		})
		socket.addEventListener("message", (event) => {
			if (this.#terminal.socket !== socket) return
			this.#handleTerminalMessage(String(event.data))
		})
		socket.addEventListener("close", () => {
			if (this.#terminal.socket !== socket) return
			this.#terminal.socket = null
			this.#disarmAgentReadyNotification()
			this.#terminal.pane.setInputEnabled(false)
			this.#setTerminalStatus("disconnected", "closed")
			this.#codexComposer.requestRender()
		})
		socket.addEventListener("error", () => {
			if (this.#terminal.socket !== socket) return
			this.#disarmAgentReadyNotification()
			this.#terminal.pane.setInputEnabled(false)
			this.#setTerminalStatus("error", "websocket")
			this.#codexComposer.requestRender()
		})
	}

	#terminalUrl(): string {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:"
		const url = new URL(`${protocol}//${location.host}/hud/terminal/stream`)
		url.searchParams.set("replay", "1")
		url.searchParams.set("key", CODEX_TERMINAL_SESSION_KEY)
		url.searchParams.set("tmux", CODEX_TERMINAL_TMUX_SESSION)
		if (this.#terminal.sessionId !== null) url.searchParams.set("session", this.#terminal.sessionId)
		return url.toString()
	}

	#sendTerminalInput(data: string, source: TerminalInputSource, localEchoText = data): void {
		if (source === "keyboard" || source === "paste") this.#clearVoicePartialPreview()
		if (isTerminalSubmitInput(data)) this.#armAgentReadyNotification()
		const localEchoId = this.#tryTerminalLocalEcho(localEchoText, source) ? ++this.#terminal.localEchoId : undefined
		this.#sendTerminal({
			type: "input.write",
			data,
			source,
			...(localEchoId === undefined ? {} : {localEchoId}),
		})
	}

	#sendVoiceSubmit(text: string): boolean {
		const body = sanitizeCodexTerminalVoiceInput(text)
		if (body.length === 0) return false
		const payload = this.#terminal.state?.bracketedPaste
			? `\x1b[200~${body}\x1b[201~\r`
			: `${body}\r`
		this.#clearVoicePartialPreview()
		this.#sendTerminalInput(payload, "api", body)
		this.#recordVoiceAutoEnter()
		return true
	}

	#recordVoiceAutoEnter(): void {
		this.#voiceAutoEnterCount += 1
		this.#voiceAutoEnterAt = new Date()
	}

	#stageVoiceDraft(text: string, opts: {focusComposer?: boolean} = {}): boolean {
		const body = sanitizeCodexTerminalVoiceInput(text)
		if (body.length === 0) return false
		this.#clearVoicePartialPreview()
		const baseDraft = this.#voiceComposerEdited ? this.#codexDraft : (this.#voiceComposerBaseDraft ?? this.#codexDraft)
		const nextDraft = mergeCodexComposerDraft(baseDraft, body)
		this.#resetVoiceComposerDraftTracking()
		this.#setCodexDraft(nextDraft)
		this.#setCodexComposerStatus("голос добавлен в поле")
		if (opts.focusComposer) this.#focusCodexComposer()
		this.#codexComposer.requestRender()
		return true
	}

	#applyVoiceComposerText(text: string): boolean {
		const body = sanitizeCodexTerminalVoiceInput(text)
		if (body.length === 0) return false
		if (this.#voiceComposerBaseDraft === null) {
			this.#voiceComposerBaseDraft = this.#codexDraft
			this.#voiceComposerGeneratedDraft = this.#codexDraft
		}
		if (this.#voiceComposerEdited) return true
		const nextDraft = mergeCodexComposerDraft(this.#voiceComposerBaseDraft, body)
		this.#voiceComposerGeneratedDraft = nextDraft
		if (this.#codexDraft === nextDraft) return true
		this.#setCodexDraft(nextDraft)
		this.#focusCodexComposer()
		return true
	}

	#restoreVoiceComposerBaseDraft(): void {
		if (this.#voiceComposerBaseDraft === null) return
		if (!this.#voiceComposerEdited && this.#codexDraft === this.#voiceComposerGeneratedDraft) {
			this.#setCodexDraft(this.#voiceComposerBaseDraft)
		}
		this.#resetVoiceComposerDraftTracking()
	}

	#resetVoiceComposerDraftTracking(): void {
		this.#voiceComposerBaseDraft = null
		this.#voiceComposerGeneratedDraft = ""
		this.#voiceComposerEdited = false
	}

	#tryTerminalLocalEcho(data: string, source: TerminalInputSource): boolean {
		const state = this.#terminal.state
		if (
			(source !== "keyboard" && source !== "api") ||
			this.#terminal.socket?.readyState !== WebSocket.OPEN ||
			state === null ||
			!state.localEcho ||
			!this.#terminal.pane.getTerminalState().localEcho
		) return false
		return this.#terminal.pane.tryLocalEcho(data)
	}

	#sendTerminal(message: PtyClientMessage): void {
		if (this.#terminal.socket?.readyState === WebSocket.OPEN) {
			this.#terminal.socket.send(JSON.stringify(message))
		}
	}

	#focusCodexComposer(): void {
		this.#viewport.hud.setFocused(this.#codexEditor)
	}

	#setCodexComposerStatus(status: string, ttlMs = 2200): void {
		if (this.#codexComposerStatusTimer !== null) {
			window.clearTimeout(this.#codexComposerStatusTimer)
			this.#codexComposerStatusTimer = null
		}
		this.#codexComposerStatus = status
		this.#codexComposer.requestRender()
		if (!status) return
		this.#codexComposerStatusTimer = window.setTimeout(() => {
			this.#codexComposerStatusTimer = null
			this.#codexComposerStatus = ""
			this.#codexComposer.requestRender()
		}, ttlMs)
	}

	#handleCodexDragOver(event: DragEvent): void {
		if (!this.#dragEventInsideCodexComposer(event)) {
			this.#setCodexDropActive(false)
			return
		}
		event.preventDefault()
		event.stopPropagation()
		if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy"
		this.#setCodexDropActive(true)
	}

	#handleCodexDragLeave(event: DragEvent): void {
		if (event.clientX > 0 && event.clientY > 0 && event.clientX < window.innerWidth && event.clientY < window.innerHeight) return
		this.#setCodexDropActive(false)
	}

	async #handleCodexDrop(event: DragEvent): Promise<void> {
		if (!this.#dragEventInsideCodexComposer(event)) return
		event.preventDefault()
		event.stopPropagation()
		this.#setCodexDropActive(false)
		const files = codexImageDropFiles(event.dataTransfer)
		if (files.length === 0) {
			this.#setCodexComposerStatus("нет изображения")
			return
		}
		this.#setCodexComposerStatus("загружаю изображение", 6000)
		try {
			const uploaded: CodexComposerAttachment[] = []
			for (const file of files) uploaded.push(await uploadCodexAttachment(file))
			this.#codexAttachments = [...this.#codexAttachments, ...uploaded]
			this.#setCodexComposerStatus(`${this.#codexAttachments.length} влож.`)
			this.#focusCodexComposer()
		} catch (error) {
			this.#setCodexComposerStatus(errorMessage(error), 5000)
		} finally {
			this.#codexComposer.requestRender()
		}
	}

	#dragEventInsideCodexComposer(event: DragEvent): boolean {
		const rect = this.#codexComposerRect({w: window.innerWidth, h: window.innerHeight})
		if (rect.visible === false) return false
		return event.clientX >= rect.x && event.clientX <= rect.x + rect.w && event.clientY >= rect.y && event.clientY <= rect.y + rect.h
	}

	#setCodexDropActive(active: boolean): void {
		if (this.#codexDropActive === active) return
		this.#codexDropActive = active
		this.#codexComposer.requestRender()
	}

	#resizeTerminal(size: TerminalSize): void {
		const next = {cols: Math.max(1, Math.round(size.cols)), rows: Math.max(1, Math.round(size.rows))}
		if (this.#terminal.size?.cols === next.cols && this.#terminal.size.rows === next.rows) return
		this.#terminal.size = next
		this.#sendTerminal({type: "terminal.resize", size: next})
	}

	#handleTerminalMessage(raw: string): void {
		const message = parseTerminalMessage(raw)
		if (message === null) return
		if (message.type === "terminal.write") {
			this.#terminal.pane.writeAuthoritative(message.data)
			if (message.state !== undefined) this.#updateTerminalState(message.state, message.data.length > 0)
			return
		}
		if (message.type === "terminal.state") {
			this.#updateTerminalState(message.state)
			return
		}
		if (message.type === "terminal.local-echo") {
			this.#updateTerminalState(message.state)
			if (!message.accepted) this.#terminal.pane.rejectLocalEcho()
			return
		}
		if (message.type === "terminal.ready") {
			this.#terminal.sessionId = message.sessionId
			this.#updateTerminalState(message.state)
			writeStoredString(CODEX_SESSION_STORAGE_KEY, message.sessionId)
			this.#setTerminalStatus("connected", shellLabel(message.shell))
			if (this.#terminal.size !== null) this.#sendTerminal({type: "terminal.resize", size: this.#terminal.size})
			this.#scheduleVoiceAutoWake()
			return
		}
		if (message.type === "terminal.status") {
			this.#setTerminalStatus(statusKindForPane(message.status.kind), codexTerminalStatusLabel(message.status.label))
			return
		}
		if (message.type === "terminal.exit") {
			this.#disarmAgentReadyNotification()
			this.#terminal.pane.setInputEnabled(false)
			this.#setTerminalStatus("disconnected", "exited")
			this.#terminal.pane.writeln(`\x1b[90mprocess exited: code=${message.code ?? "null"} signal=${message.signal ?? "null"}\x1b[0m`)
			return
		}
		this.#disarmAgentReadyNotification()
		this.#terminal.pane.setInputEnabled(false)
		this.#setTerminalStatus("error", "error")
		this.#terminal.pane.writeln(`\x1b[31m${message.message}\x1b[0m`)
	}

	#setTerminalStatus(kind: TerminalStatusKind, label: string): void {
		const cleanLabel = codexTerminalStatusLabel(label)
		this.#terminal.statusLabel = cleanLabel
		this.#terminal.pane.setStatus(kind, cleanLabel)
		this.#agentSignalPane.requestRender()
		this.#codexComposer.requestRender()
	}

	#updateTerminalState(state: PtyTerminalState, output = false): void {
		this.#terminal.state = state
		if (!this.#terminal.agentNotifyArmed) return
		if (output) {
			this.#terminal.agentNotifySawOutput = true
			this.#terminal.agentNotifyLastOutputAt = performance.now()
		}
		if (this.#terminal.agentNotifySawOutput) this.#scheduleAgentReadyNotificationCheck()
	}

	#connectNetworkTerminal(): void {
		if (this.#networkTerminal.socket?.readyState === WebSocket.OPEN || this.#networkTerminal.socket?.readyState === WebSocket.CONNECTING) return
		this.#networkTerminal.socket?.close()
		this.#networkTerminal.socket = null
		this.#networkTerminal.state = null
		this.#networkTerminal.pane.setInputEnabled(false)
		this.#setNetworkTerminalStatus("idle", "connecting")
		const socket = new WebSocket(this.#networkTerminalUrl())
		this.#networkTerminal.socket = socket
		socket.addEventListener("open", () => {
			if (this.#networkTerminal.socket !== socket) return
			this.#setNetworkTerminalStatus("connected", "connected")
			this.#networkTerminal.pane.setInputEnabled(true)
			if (this.#networkTerminal.size !== null) this.#sendNetworkTerminal({type: "terminal.resize", size: this.#networkTerminal.size})
		})
		socket.addEventListener("message", (event) => {
			if (this.#networkTerminal.socket !== socket) return
			this.#handleNetworkTerminalMessage(String(event.data))
		})
		socket.addEventListener("close", () => {
			if (this.#networkTerminal.socket !== socket) return
			this.#networkTerminal.socket = null
			this.#networkTerminal.pane.setInputEnabled(false)
			this.#setNetworkTerminalStatus("disconnected", "closed")
		})
		socket.addEventListener("error", () => {
			if (this.#networkTerminal.socket !== socket) return
			this.#networkTerminal.pane.setInputEnabled(false)
			this.#setNetworkTerminalStatus("error", "websocket")
		})
	}

	#networkTerminalUrl(): string {
		const protocol = location.protocol === "https:" ? "wss:" : "ws:"
		const url = new URL(`${protocol}//${location.host}/hud/terminal/stream`)
		url.searchParams.set("replay", "1")
		url.searchParams.set("key", NETWORK_TERMINAL_SESSION_KEY)
		url.searchParams.set("tmux", NETWORK_TERMINAL_TMUX_SESSION)
		if (this.#networkTerminal.sessionId !== null) url.searchParams.set("session", this.#networkTerminal.sessionId)
		return url.toString()
	}

	#sendNetworkTerminalInput(data: string, source: TerminalInputSource, localEchoText = data): void {
		const localEchoId = this.#tryNetworkTerminalLocalEcho(localEchoText, source) ? ++this.#networkTerminal.localEchoId : undefined
		this.#sendNetworkTerminal({
			type: "input.write",
			data,
			source,
			...(localEchoId === undefined ? {} : {localEchoId}),
		})
	}

	#tryNetworkTerminalLocalEcho(data: string, source: TerminalInputSource): boolean {
		const state = this.#networkTerminal.state
		if (
			(source !== "keyboard" && source !== "api") ||
			this.#networkTerminal.socket?.readyState !== WebSocket.OPEN ||
			state === null ||
			!state.localEcho ||
			!this.#networkTerminal.pane.getTerminalState().localEcho
		) return false
		return this.#networkTerminal.pane.tryLocalEcho(data)
	}

	#sendNetworkTerminal(message: PtyClientMessage): void {
		if (this.#networkTerminal.socket?.readyState === WebSocket.OPEN) {
			this.#networkTerminal.socket.send(JSON.stringify(message))
		}
	}

	#resizeNetworkTerminal(size: TerminalSize): void {
		const next = {cols: Math.max(1, Math.round(size.cols)), rows: Math.max(1, Math.round(size.rows))}
		if (this.#networkTerminal.size?.cols === next.cols && this.#networkTerminal.size.rows === next.rows) return
		this.#networkTerminal.size = next
		this.#sendNetworkTerminal({type: "terminal.resize", size: next})
	}

	#handleNetworkTerminalMessage(raw: string): void {
		const message = parseTerminalMessage(raw)
		if (message === null) return
		if (message.type === "terminal.write") {
			this.#networkTerminal.pane.writeAuthoritative(message.data)
			if (message.state !== undefined) this.#networkTerminal.state = message.state
			return
		}
		if (message.type === "terminal.state") {
			this.#networkTerminal.state = message.state
			return
		}
		if (message.type === "terminal.local-echo") {
			this.#networkTerminal.state = message.state
			if (!message.accepted) this.#networkTerminal.pane.rejectLocalEcho()
			return
		}
		if (message.type === "terminal.ready") {
			this.#networkTerminal.sessionId = message.sessionId
			this.#networkTerminal.state = message.state
			writeStoredString(NETWORK_TERMINAL_SESSION_STORAGE_KEY, message.sessionId)
			this.#setNetworkTerminalStatus("connected", shellLabel(message.shell))
			if (this.#networkTerminal.size !== null) this.#sendNetworkTerminal({type: "terminal.resize", size: this.#networkTerminal.size})
			return
		}
		if (message.type === "terminal.status") {
			this.#setNetworkTerminalStatus(statusKindForPane(message.status.kind), codexTerminalStatusLabel(message.status.label))
			return
		}
		if (message.type === "terminal.exit") {
			this.#networkTerminal.pane.setInputEnabled(false)
			this.#setNetworkTerminalStatus("disconnected", "exited")
			this.#networkTerminal.pane.writeln(`\x1b[90mprocess exited: code=${message.code ?? "null"} signal=${message.signal ?? "null"}\x1b[0m`)
			return
		}
		this.#networkTerminal.pane.setInputEnabled(false)
		this.#setNetworkTerminalStatus("error", "error")
		this.#networkTerminal.pane.writeln(`\x1b[31m${message.message}\x1b[0m`)
	}

	#setNetworkTerminalStatus(kind: TerminalStatusKind, label: string): void {
		const cleanLabel = codexTerminalStatusLabel(label)
		this.#networkTerminal.statusLabel = cleanLabel
		this.#networkTerminal.pane.setStatus(kind, cleanLabel)
	}

	#armAgentReadyNotification(): void {
		this.#clearAgentReadyNotificationTimer()
		this.#terminal.agentNotifyArmed = true
		this.#terminal.agentNotifySawOutput = false
		this.#terminal.agentNotifyLastOutputAt = 0
	}

	#disarmAgentReadyNotification(): void {
		this.#clearAgentReadyNotificationTimer()
		this.#terminal.agentNotifyArmed = false
		this.#terminal.agentNotifySawOutput = false
		this.#terminal.agentNotifyLastOutputAt = 0
	}

	#scheduleAgentReadyNotificationCheck(): void {
		this.#clearAgentReadyNotificationTimer()
		const elapsed = performance.now() - this.#terminal.agentNotifyLastOutputAt
		const delay = Math.max(0, AGENT_READY_SOUND_IDLE_MS - elapsed)
		this.#terminal.agentNotifyTimer = setTimeout(() => {
			this.#terminal.agentNotifyTimer = null
			this.#maybePlayAgentReadyNotification()
		}, delay)
	}

	#clearAgentReadyNotificationTimer(): void {
		if (this.#terminal.agentNotifyTimer === null) return
		clearTimeout(this.#terminal.agentNotifyTimer)
		this.#terminal.agentNotifyTimer = null
	}

	#maybePlayAgentReadyNotification(): void {
		if (!this.#terminal.agentNotifyArmed || !this.#terminal.agentNotifySawOutput) return
		const state = this.#terminal.state
		if (state === null || !state.cursorVisible) {
			this.#scheduleAgentReadyNotificationCheck()
			return
		}
		const elapsed = performance.now() - this.#terminal.agentNotifyLastOutputAt
		if (elapsed < AGENT_READY_SOUND_IDLE_MS) {
			this.#scheduleAgentReadyNotificationCheck()
			return
		}

		const now = performance.now()
		this.#terminal.agentNotifyArmed = false
		this.#clearAgentReadyNotificationTimer()
		if (now - this.#terminal.agentNotifyLastPlayedAt < AGENT_READY_SOUND_COOLDOWN_MS) return
		this.#terminal.agentNotifyLastPlayedAt = now
		this.#playAgentReadySignal()
	}

	#playAgentReadySignal(): void {
		playHudNotificationSound("agent", this.#voiceClient)
	}

	async #postNetworkAction(action: string, opts: {signal?: AbortSignal} = {}): Promise<{response: Response; payload: NetworkActionPayload}> {
		const init: RequestInit = {
			method: "POST",
			headers: {"content-type": "application/json"},
			body: JSON.stringify({action, mode: "prod"}),
		}
		if (opts.signal !== undefined) init.signal = opts.signal
		const response = await fetch("/space/network/action", init)
		const payload = await response.json().catch(() => ({})) as NetworkActionPayload
		return {response, payload}
	}

	async #runNetworkAction(action: string): Promise<void> {
		this.#networkActionStatus = `running ${action}`
		this.#updateNetworkWatchPane()
		try {
			const {response, payload} = await this.#postNetworkAction(action)
			if (!response.ok || payload.ok === false) {
				const message = payload.error ?? payload.stderr ?? `${response.status}`
				this.#networkActionStatus = `${action} failed: ${String(message).slice(0, 64)}`
			} else if (payload.detached === true) {
				this.#networkActionStatus = `${action} accepted`
			} else {
				this.#networkActionStatus = `${action} ok ${payload.durationMs ?? 0}ms`
			}
		} catch (error) {
			this.#networkActionStatus = `${action} failed: ${error instanceof Error ? error.message : String(error)}`
		} finally {
		this.#updateNetworkWatchPane()
			this.#scheduleNetworkStatusRefresh(0, {force: true})
		}
	}

	#scheduleNetworkStatusRefresh(delayMs: number, opts: {force?: boolean} = {}): void {
		const force = opts.force === true
		if (!this.#networkStatusDisplayActive() || (!force && !this.#networkStatusAutoRefreshActive())) {
			this.#stopNetworkStatusRefresh({abort: !this.#networkStatusDisplayActive() || !this.#networkStatusAutoRefreshEnabled})
			return
		}
		if (this.#networkStatusRefreshTimer !== null) window.clearTimeout(this.#networkStatusRefreshTimer)
		this.#networkStatusRefreshTimer = window.setTimeout(() => {
			this.#networkStatusRefreshTimer = null
			void this.#refreshNetworkStatus({manual: force})
		}, delayMs)
		this.#updateNetworkWatchPane()
	}

	async #refreshNetworkStatus(opts: {manual?: boolean} = {}): Promise<void> {
		if (this.#networkStatusRefreshInFlight) return
		const manual = opts.manual === true
		if (!this.#networkStatusDisplayActive() || (!manual && !this.#networkStatusAutoRefreshActive())) {
			this.#stopNetworkStatusRefresh({abort: !this.#networkStatusDisplayActive() || !this.#networkStatusAutoRefreshEnabled})
			return
		}
		const generation = this.#networkStatusRefreshGeneration
		const abortController = new AbortController()
		this.#networkStatusRefreshAbortController = abortController
		this.#networkStatusRefreshInFlight = true
		this.#updateNetworkWatchPane()
		try {
			const {response, payload} = await this.#postNetworkAction("status", {signal: abortController.signal})
			if (generation !== this.#networkStatusRefreshGeneration) return
			if (!response.ok || payload.ok === false) {
				const message = payload.error ?? payload.stderr ?? `${response.status}`
				this.#networkStatusLines = [`status failed: ${String(message).slice(0, 160)}`]
			} else {
				this.#networkStatusLines = networkStatusLinesFromOutput(payload.stdout ?? "")
				this.#networkStatusUpdatedAt = new Date()
			}
		} catch (error) {
			if (generation !== this.#networkStatusRefreshGeneration || isAbortError(error)) return
			this.#networkStatusLines = [`status failed: ${error instanceof Error ? error.message : String(error)}`]
		} finally {
			if (generation !== this.#networkStatusRefreshGeneration) return
			if (this.#networkStatusRefreshAbortController === abortController) this.#networkStatusRefreshAbortController = null
			this.#networkStatusRefreshInFlight = false
		this.#updateNetworkWatchPane()
			if (this.#networkStatusAutoRefreshActive()) this.#scheduleNetworkStatusRefresh(NETWORK_STATUS_REFRESH_MS)
		}
	}

	#syncNetworkStatusRefresh(): void {
		if (this.#networkStatusAutoRefreshActive()) {
			this.#scheduleNetworkStatusRefresh(this.#networkStatusLines.length === 0 ? 0 : NETWORK_STATUS_REFRESH_MS)
		} else {
			this.#stopNetworkStatusRefresh({abort: !this.#networkStatusDisplayActive() || !this.#networkStatusAutoRefreshEnabled})
		}
		this.#updateNetworkWatchPane()
	}

	#stopNetworkStatusRefresh(opts: {abort?: boolean} = {}): void {
		if (this.#networkStatusRefreshTimer !== null) {
			window.clearTimeout(this.#networkStatusRefreshTimer)
			this.#networkStatusRefreshTimer = null
		}
		if (opts.abort === true && this.#networkStatusRefreshAbortController !== null) {
			this.#networkStatusRefreshGeneration += 1
			this.#networkStatusRefreshAbortController.abort()
			this.#networkStatusRefreshAbortController = null
			this.#networkStatusRefreshInFlight = false
		}
		this.#updateNetworkWatchPane()
	}

	#networkStatusDisplayActive(): boolean {
		if (this.#networkDocked || document.visibilityState === "hidden") return false
		const frame = this.#viewport.hud.surfaceFrame(this.#networkWatchPane)
		return frame !== null && frame.rect.visible !== false
	}

	#networkStatusAutoRefreshActive(): boolean {
		return this.#networkStatusAutoRefreshEnabled && this.#networkStatusDisplayActive()
	}

	#setNetworkStatusAutoRefreshEnabled(enabled: boolean): void {
		if (this.#networkStatusAutoRefreshEnabled === enabled) return
		this.#networkStatusAutoRefreshEnabled = enabled
		writeStoredBoolean(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY, enabled)
		this.#syncNetworkStatusRefresh()
	}

	#networkWatchPaneSnapshot(): NetworkWatchPaneSnapshot {
		return {
			actionStatus: this.#networkActionStatus,
			services: {...this.#networkServiceSwitches},
			productViaInterpreter: false,
			autoRefresh: this.#networkStatusAutoRefreshEnabled,
			autoRefreshActive: this.#networkStatusAutoRefreshActive(),
			refreshing: this.#networkStatusRefreshInFlight,
			updatedAt: this.#networkStatusUpdatedAt,
			sections: networkWatchSectionsFromLines(this.#networkStatusLines),
		}
	}

	#updateNetworkWatchPane(): void {
		this.#networkWatchPane.setSnapshot(this.#networkWatchPaneSnapshot())
	}

	async #loadTodo(): Promise<void> {
		try {
			const response = await fetch("/hud/todo")
			if (!response.ok) throw new Error(await response.text())
			const payload = await response.json() as {text: string; path: string}
			this.setTodoMarkdown(payload.text, payload.path)
		} catch (error) {
			this.setTodoMarkdown(`# TODO недоступен\n\n- [ ] ${error instanceof Error ? error.message : String(error)}`, "TODO.md")
		}
	}

	async #patchTodoItem(id: string, checked: boolean): Promise<void> {
		try {
			const response = await fetch(`/hud/todo/items/${encodeURIComponent(id)}`, {
				method: "PATCH",
				headers: {"content-type": "application/json"},
				body: JSON.stringify({checked}),
			})
			if (!response.ok) throw new Error(await response.text())
			const payload = await response.json() as {text: string; path: string}
			this.setTodoMarkdown(payload.text, payload.path)
		} catch (error) {
			console.error("todo update error:", error)
		}
	}

	#connectAndroidRtc(): void {
		if (this.#androidRtcClient === null) {
			this.#androidRtcClient = createAndroidRtcClient({
				frameSrc: ANDROID_RTC_FRAME_SRC,
				onFrame: (frame) => {
					this.#androidPane.setFrame(frame)
					if (Date.now() >= this.#androidControlStatusUntil) {
						this.#androidPane.setStatus("connected", `${frame.width}x${frame.height} rtc`)
					}
				},
				onStatus: (kind, label) => this.#setAndroidRtcStatus(kind, label),
			})
		}
		this.#androidRtcClient.connect()
	}

	#setAndroidRtcStatus(kind: AndroidPaneStatusKind, label: string): void {
		this.#androidPane.setStatus(kind, label)
		if (/\b(ok|failed)\b/.test(label)) this.#androidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
	}

	#sendAndroidSwipe(swipe: AndroidPaneSwipe): void {
		this.#sendAndroidControl({type: "swipe", ...swipe})
	}

	#sendAndroidControl(command: AndroidRtcCommand): boolean {
		this.#connectAndroidRtc()
		if (this.#androidRtcClient?.send(this.#withAndroidFrameSize(command)) !== true) {
			this.#androidPane.setStatus("error", "rtc control closed")
			return false
		}
		this.#androidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
		this.#androidPane.setStatus("connected", "rtc command")
		return true
	}

	#withAndroidFrameSize(command: AndroidRtcCommand): AndroidRtcCommand {
		if (command.type !== "tap" && command.type !== "swipe") return command
		if (command.frameW !== undefined && command.frameH !== undefined) return command
		const frame = this.#androidPane.frameSnapshot()
		if (frame === null) return command
		return {...command, frameW: frame.width, frameH: frame.height}
	}

	async #importInterpreterVoiceSettings(): Promise<void> {
		try {
			const response = await fetch("/hud/voice/settings")
			if (!response.ok) return
			const payload = await response.json() as {ok?: boolean; values?: unknown}
			if (payload.ok !== true) return
			const values = asVoiceSettingsValues(payload.values) ?? {}
			let changed = false
			for (const key of VOICE_SETTINGS_STORAGE_KEYS) {
				const next = values[key]
				const previous = localStorage.getItem(key)
				if (next === undefined) {
					if (previous !== null) {
						localStorage.removeItem(key)
						changed = true
					}
					continue
				}
				if (previous === next) continue
				localStorage.setItem(key, next)
				changed = true
			}
			if (!changed) return
			this.#voiceClient?.refreshDeactivationSettings()
			this.#voiceHud.requestRender()
			this.#updateVoiceHud()
		} catch {
			// The bridge is optional; app-web keeps using local/default voice settings.
		}
	}

	#createVoiceHud(): VoiceInputHud {
		return new VoiceInputHud({
			onToggle: () => void this.#toggleVoice(),
			onMove: (rect) => writeStoredRect(VOICE_SETTINGS_RECT_STORAGE_KEY, rect),
			settingsPresentation: "panel",
			onPulseFrame: () => this.#codexComposer.requestRender(),
			onSettingsOpenChange: (open) => this.#setVoiceSettingsOpen(open),
			settings: () => this.#voiceSettings(),
			onFullStop: () => this.#stopVoice(),
			onAddPhrase: (groupId, phrase) => this.#addVoicePhrase(groupId, phrase),
			onRemovePhrase: (groupId, phrase) => this.#removeVoicePhrase(groupId, phrase),
			onResetPhrases: (groupId) => this.#resetVoicePhrases(groupId),
			onSignalVolumeChange: (value) => {
				writeVoiceSignalVolume(value)
				this.#voiceHud.requestRender()
			},
			onAutoSendChange: (value) => {
				writeCodexVoiceAutoSendEnabled(value)
				this.#voiceHud.requestRender()
			},
			onDeactivationModeChange: (value) => {
				writeVoiceDeactivationMode(value)
				this.#voiceClient?.refreshDeactivationSettings()
				this.#voiceHud.requestRender()
			},
			onRecognitionTimeoutChange: (value) => {
				writeVoiceRecognitionTimeoutSeconds(value)
				this.#voiceClient?.refreshDeactivationSettings()
				this.#voiceHud.requestRender()
			},
			onPhraseFuzzyChange: (groupId, value) => {
				writeVoiceFuzzyTolerance(groupId, value)
				this.#restartVoiceCommandRecognizerAfterSettingsChange()
				this.#voiceHud.requestRender()
			},
		})
	}

	#ensureVoiceClient(): VoiceInputClient {
		if (this.#voiceClient !== null) return this.#voiceClient
		this.#voiceClient = new VoiceInputClient({
			url: readVoiceInputUrl,
			wakeUrl: readVoiceWakeUrl,
			activationPhrases: () => readVoicePhrases("activation"),
			deactivationPhrases: () => readVoicePhrases("deactivation"),
			stopPhrases: () => readVoicePhrases("stop"),
			phraseFuzzyTolerance: readVoiceFuzzyTolerance,
			deactivationMode: () => readVoiceDeactivationMode(),
			recognitionTimeoutMs: () => readVoiceRecognitionTimeoutSeconds() * 1000,
			language: "ru",
			context: () => voiceContextWithTerminal(this.#terminal.pane.toText()),
			...(readCodexVoiceP2PEnabled()
				? {createAsrSocket: createVoiceRtcAsrSocket}
				: {}),
			onTransport: (transport) => this.#handleVoiceTransport(transport),
			onStatus: (status, detail) => this.#handleVoiceStatus(status, detail),
			onWake: (text) => {
				this.#claimVoiceLeaseForActivation()
				const cleaned = cleanupVoiceInputText(text)
				if (cleaned) this.#recordVoiceWakePreview(cleaned)
				this.#updateVoiceHud("connecting", readVoiceInputUrl())
			},
			onCommandText: (text) => {
				const cleaned = cleanupVoiceInputText(text)
				if (cleaned) this.#recordVoiceWakePreview(cleaned)
				this.#updateVoiceHud()
			},
			onPartial: (text) => this.#handleVoicePartial(text),
			onChunk: (chunk) => this.#handleVoiceChunk(chunk),
			onLevel: (level) => this.#updateVoiceLevel(level),
		})
		return this.#voiceClient
	}

	async #toggleVoice(): Promise<void> {
		this.#blurCodexNativeInput()
		const client = this.#ensureVoiceClient()
		try {
			if (!this.#documentHasLocalVoiceFocus()) return
			if (!client.active || client.status === "waitingWake") this.#claimVoiceLeaseForManualStart()
			if (client.active) {
				if (client.status === "waitingWake") {
					this.#voiceAutoWakePaused = false
					await client.startDictation()
				}
				else {
					this.#voiceAutoWakePaused = false
					this.#voiceNextFlushMode = "draft"
					await client.sleepToWake()
				}
				return
			}
			this.#voiceAutoWakePaused = false
			if (this.#terminal.socket?.readyState !== WebSocket.OPEN) {
				this.#flashVoiceHudError("Codex terminal не подключен")
				return
			}
			if (this.#shouldUseVoiceRtcServerServiceProbe()) {
				this.#markVoiceRtcServerServiceProbe()
			} else {
				const serviceOk = await this.#checkVoiceService()
				if (!serviceOk) {
					this.#flashVoiceHudError(this.#voiceServiceDetail)
					return
				}
			}
			await client.startDictation()
		} catch (error) {
			this.#flashVoiceHudError(error instanceof Error ? error.message : String(error))
		} finally {
			this.#focusCodexComposer()
		}
	}

	#stopVoice(): void {
		this.#pauseVoiceAutoWake()
		this.#onVoiceLeaseRelease("stop")
		this.#voiceNextFlushMode = "draft"
		const wasActive = this.#voiceClient?.active === true
		this.#voiceClient?.stop(VOICE_STOP_COMMAND_DETAIL)
		this.#discardVoiceAutoSendBuffer()
		this.#clearVoicePartialPreview()
		this.#clearVoiceWakePreview()
		if (!wasActive) this.#handleVoiceStatus("idle", VOICE_STOP_COMMAND_DETAIL)
		else this.#updateVoiceHud("idle", VOICE_STOP_COMMAND_DETAIL)
	}

	#handleVoiceStatus(status: VoiceInputStatus, detail = ""): void {
		const previousStatus = this.#voiceStatus
		const voiceSignal = voiceSignalForStatusChange(previousStatus, status, detail)
		const transportError = status === "error" && isVoiceServiceErrorText(detail)
		this.#setVoiceDictationActive(voiceStatusNeedsRenderHold(status))
		if (status === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) this.#voiceAutoWakePaused = true
		if (status === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) {
			this.#onVoiceLeaseRelease("waiting-wake")
		}
		if (status === "idle" && previousStatus !== "idle") {
			this.#onVoiceLeaseRelease("idle")
		}
		if (transportError) {
			this.#voiceAutoWakePaused = false
			this.#scheduleVoiceAutoWake(VOICE_AUTO_WAKE_RETRY_MS)
			this.#discardVoiceAutoSendBuffer()
			this.#clearVoicePartialPreview()
			this.#clearVoiceWakePreview()
		} else if (shouldFlushVoiceBufferForStatus(previousStatus, status)) {
			this.#flushVoiceAutoSendBuffer()
		} else if (shouldPreserveVoicePartialForStatus(previousStatus, status, detail)) {
			this.#preserveVoicePartialAsTerminalInput()
		}
		if (status === "idle") {
			this.#flushVoiceAutoSendBuffer()
			this.#clearVoiceWakePreview()
			this.#scheduleVoiceRtcPrewarm(500)
		}
		this.#voiceStatus = status
		this.#voiceDetail = voiceReadableDetail(detail || voiceStatusLine(status))
		if (status === "error") {
			this.#voiceLastErrorText = this.#voiceDetail || "ошибка голоса"
			this.#voiceLastErrorAt = new Date()
			if (transportError) {
				this.#voiceServiceState = "down"
				this.#voiceServiceDetail = this.#voiceDetail || "ASR недоступен"
			}
		} else if (status === "listening" || status === "waitingWake" || status === "committing") {
			this.#voiceServiceState = "ok"
			this.#voiceServiceDetail = "ASR работает"
		}
		this.#updateVoiceHud()
		if (voiceSignal !== null) this.#playVoiceSignal(voiceSignal)
	}

	#handleVoiceTransport(transport: VoiceInputTransport): void {
		if (this.#voiceTransport === transport) return
		this.#voiceTransport = transport
		this.#codexComposer.requestRender()
		this.#voiceHud.requestRender()
		if (transport === "idle" && (this.#voiceStatus === "idle" || this.#voiceStatus === "waitingWake")) this.#scheduleVoiceRtcPrewarm(1000)
	}

	#scheduleVoiceRtcPrewarm(delayMs = 0): void {
		if (this.#voicePrewarmTimer !== null) return
		this.#voicePrewarmTimer = window.setTimeout(() => {
			this.#voicePrewarmTimer = null
			if (!this.#documentHasLocalVoiceFocus()) {
				this.#voicePrewarmAttempts = 0
				return
			}
			if (!this.#shouldUseVoiceRtcPrewarm()) {
				this.#retryVoiceRtcPrewarm()
				return
			}
			const client = this.#ensureVoiceClient()
			if (client.status === "connecting") {
				this.#retryVoiceRtcPrewarm()
				return
			}
			if (client.status === "listening" || client.status === "committing") {
				this.#voicePrewarmAttempts = 0
				return
			}
			this.#voicePrewarmAttempts = 0
			this.#markVoiceRtcServerServiceProbe()
			client.prewarmDictation()
		}, delayMs)
	}

	#retryVoiceRtcPrewarm(): void {
		if (this.#voicePrewarmAttempts >= VOICE_RTC_PREWARM_MAX_ATTEMPTS) {
			this.#voicePrewarmAttempts = 0
			return
		}
		this.#voicePrewarmAttempts += 1
		this.#scheduleVoiceRtcPrewarm(VOICE_RTC_PREWARM_RETRY_MS)
	}

	#clearVoiceRtcPrewarmTimer(): void {
		if (this.#voicePrewarmTimer === null) return
		window.clearTimeout(this.#voicePrewarmTimer)
		this.#voicePrewarmTimer = null
		this.#voicePrewarmAttempts = 0
	}

	async #handleVoiceNetworkOnline(): Promise<void> {
		if (!this.#documentHasLocalVoiceFocus()) return
		this.#voiceAutoWakePaused = false
		const client = this.#voiceClient
		if (client?.status === "waitingWake") {
			try {
				await client.reconnectWaitingWake()
			} catch {
				if (!this.#voiceAutoWakePaused) this.#scheduleVoiceAutoWake(VOICE_AUTO_WAKE_RETRY_MS)
				return
			}
			this.#scheduleVoiceRtcPrewarm(80)
			this.#updateVoiceHud()
			return
		}
		if (client?.status === "error") client.reset()
		this.#scheduleVoiceAutoWake(80)
		this.#scheduleVoiceRtcPrewarm(160)
	}

	#flashVoiceHudError(detail: string): void {
		if (this.#voiceHudErrorTimer !== null) window.clearTimeout(this.#voiceHudErrorTimer)
		this.#setVoiceDictationActive(false)
		const message = voiceReadableDetail(detail)
		this.#voiceLastErrorText = message || "ошибка голоса"
		this.#voiceLastErrorAt = new Date()
		this.#voiceStatus = "error"
		this.#voiceDetail = message
		this.#updateVoiceHud("error", message)
		this.#playVoiceSignal("error")
		this.#voiceHudErrorTimer = window.setTimeout(() => {
			this.#voiceHudErrorTimer = null
			const status = this.#voiceClient?.status ?? "idle"
			if (status === "error") return
			this.#voiceStatus = status
			this.#voiceDetail = voiceStatusLine(status)
			this.#updateVoiceHud(status)
		}, VOICE_HUD_ERROR_MS)
	}

	#playVoiceSignal(kind: HudNotificationKind): void {
		const now = performance.now()
		const lastPlayedAt = voiceSignalLastPlayedAt.get(kind) ?? 0
		if (now - lastPlayedAt < VOICE_SIGNAL_COOLDOWN_MS) return
		voiceSignalLastPlayedAt.set(kind, now)
		this.#voiceHud.flashSoundIndicator()
		playHudNotificationSound(kind, this.#voiceClient)
	}

	#setVoiceDictationActive(active: boolean): void {
		if (this.#voiceDictationActive === active) return
		this.#voiceDictationActive = active
		this.#onVoiceDictationActiveChange(active)
	}

	#recordVoiceWakePreview(text: string): void {
		const now = new Date()
		this.#voiceWakePreviewText = text
		this.#voiceWakePreviewAt = now
		const line = `${formatTime(now)} · ${text}`
		if (this.#voiceWakeLines[0]?.endsWith(` · ${text}`)) this.#voiceWakeLines[0] = line
		else this.#voiceWakeLines = [line, ...this.#voiceWakeLines].slice(0, 5)
	}

	#clearVoiceWakePreview(): void {
		this.#voiceWakePreviewText = ""
		this.#voiceWakePreviewAt = null
		this.#voiceWakeLines = []
	}

	#updateVoiceLevel(level: number): void {
		if (this.#voiceStatus === "waitingWake") {
			if (this.#voiceLevel !== 0) {
				this.#voiceLevel = 0
				this.#updateVoiceHud()
			}
			return
		}
		const next = clampNumber(level * 12, 0, 1)
		this.#voiceLevel = this.#voiceLevel * 0.72 + next * 0.28
		if (this.#voiceMeterTimer !== null) return
		this.#voiceMeterTimer = window.setTimeout(() => {
			this.#voiceMeterTimer = null
			this.#updateVoiceHud()
		}, VOICE_METER_RENDER_MS)
	}

	async #refreshVoiceServiceState(): Promise<void> {
		if (this.#shouldUseVoiceRtcServerServiceProbe()) {
			this.#markVoiceRtcServerServiceProbe()
			return
		}
		await this.#checkVoiceService()
	}

	#shouldUseVoiceRtcServerServiceProbe(): boolean {
		return readCodexVoiceP2PEnabled() && isVoiceRtcRemoteClient()
	}

	#shouldUseVoiceRtcPrewarm(): boolean {
		return readCodexVoiceP2PEnabled() && canCreateVoiceRtcAsrSocket()
	}

	#markVoiceRtcServerServiceProbe(): void {
		this.#voiceServiceState = "ok"
		this.#voiceServiceDetail = "ASR через WebRTC voice server"
		this.#voiceServiceCheckedAt = new Date()
		this.#updateVoiceHud()
	}

	async #checkVoiceService(): Promise<boolean> {
		if (this.#voiceServiceCheckInFlight) return this.#voiceServiceState === "ok"
		this.#voiceServiceCheckInFlight = true
		try {
			const data = await probeVoiceService(readVoiceInputUrl())
			const model = typeof data?.model === "string" ? data.model : ""
			const device = typeof data?.device === "string" ? data.device : ""
			const compute = typeof data?.computeType === "string" ? data.computeType : ""
			this.#voiceServiceState = "ok"
			this.#voiceServiceDetail = ["ASR работает", model, [device, compute].filter(Boolean).join("/")].filter(Boolean).join(" · ")
			this.#voiceServiceCheckedAt = new Date()
			this.#updateVoiceHud()
			return true
		} catch (error) {
			this.#voiceServiceState = "down"
			this.#voiceServiceDetail = `ASR недоступен: ${endpointLabel(readVoiceInputUrl())}`
			if (error instanceof Error) this.#voiceServiceDetail = `${this.#voiceServiceDetail} · ${error.message}`
			this.#voiceServiceCheckedAt = new Date()
			this.#updateVoiceHud()
			return false
		} finally {
			this.#voiceServiceCheckInFlight = false
		}
	}

	#scheduleVoiceAutoWake(delayMs = 0): void {
		if (!this.#documentHasLocalVoiceFocus()) return
		if (this.#voiceAutoWakePaused || this.#voiceAutoWakeTimer !== null) return
		this.#voiceAutoWakeTimer = window.setTimeout(() => {
			this.#voiceAutoWakeTimer = null
			void this.#ensureVoiceAutoWake()
		}, delayMs)
	}

	#pauseVoiceAutoWake(): void {
		this.#voiceAutoWakePaused = true
		if (this.#voiceAutoWakeTimer === null) return
		window.clearTimeout(this.#voiceAutoWakeTimer)
		this.#voiceAutoWakeTimer = null
	}

	async #ensureVoiceAutoWake(): Promise<void> {
		if (!this.#documentHasLocalVoiceFocus()) return
		if (this.#voiceAutoWakePaused || this.#voiceAutoWakeInFlight) return
		if (this.#shouldUseVoiceRtcServerServiceProbe()) {
			this.#markVoiceRtcServerServiceProbe()
		}
		const client = this.#ensureVoiceClient()
		if (client.active) return
		this.#voiceAutoWakeInFlight = true
		try {
			const started = await this.#startVoiceWake(false)
			if (!started && !this.#voiceAutoWakePaused) this.#scheduleVoiceAutoWake(VOICE_AUTO_WAKE_RETRY_MS)
		} finally {
			this.#voiceAutoWakeInFlight = false
		}
	}

	#handleVoicePartial(raw: string): void {
		const text = cleanupVoiceInputText(raw)
		if (!text) return
		this.#voiceLastPartialText = text
		this.#voiceLastPartialAt = new Date()
		const preview = mergeVoiceInputText(this.#voiceAutoSendText, text)
		this.#voiceAutoSendText = preview
		this.#voicePartialPreviewText = preview
		this.#applyVoiceComposerText(preview)
		this.#codexComposer.requestRender()
		this.#updateVoiceHud("listening", preview)
	}

	#handleVoiceChunk(chunk: VoiceInputChunk): void {
		const messages = voiceMessagesFromChunk(chunk)
		if (messages.length === 0) return
		const text = cleanupVoiceInputText(messages.join(" "))
		if (!text) return
		this.#voiceLastChunkText = text
		this.#voiceLastChunkAt = new Date()
		this.#commitVoiceChunkText(text)
		this.#updateVoiceHud(this.#voiceStatus, text)
	}

	#updateVoiceHud(status = this.#voiceStatus, detail = this.#voiceDetail): void {
		this.#voiceHud.setSnapshot({
			status,
			statusLine: voiceStatusLine(status),
			targetLine: `${CODEX_TITLE} terminal`,
			autoEnterLine: this.#voiceAutoSendLine(),
			detailLine: voiceReadableDetail(detail || "готов к диктовке"),
			serviceLine: this.#voiceServiceLine(),
			serviceState: this.#voiceServiceState,
			level: status === "listening" || status === "committing" ? this.#voiceLevel : 0,
		})
		this.#codexComposer.requestRender()
	}

	#voiceSettings() {
		return {
			title: "Голосовой ввод",
			generalTabLabel: "Общие",
			debugTabLabel: "Отладка",
			fullStopLabel: "Полностью выключить микрофон",
			fullStopHint: "Закрывает ASR и wake-up до ручного запуска.",
			phraseGroups: voicePhraseGroups(this.#voiceWakeLines),
			deactivationModeLabel: "Режим деактивации",
			deactivationModeValue: voiceHudDeactivationMode(readVoiceDeactivationMode()),
			deactivationModeOptions: [
				{value: "phrase" as const, label: "Фразы"},
				{value: "timeout" as const, label: "Тайм-аут"},
				{value: "phrase-timeout" as const, label: "Оба"},
			],
			recognitionTimeoutLabel: "Тайм-аут без распознавания",
			recognitionTimeoutValue: readVoiceRecognitionTimeoutSeconds(),
			recognitionTimeoutMinValue: MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			recognitionTimeoutMaxValue: MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			recognitionTimeoutUnitLabel: "с",
			recognitionTimeoutDownLabel: "Короче",
			recognitionTimeoutUpLabel: "Дольше",
			autoSendLabel: "Автоотправка",
			autoSendHint: "Готовый чанк сразу отправляется в Codex.",
			autoSendValue: readCodexVoiceAutoSendEnabled(),
			signalVolumeLabel: "Звук микрофона",
			signalVolumeValue: readVoiceSignalVolume(),
			signalVolumeMaxValue: MAX_VOICE_SIGNAL_VOLUME,
			signalVolumeDownLabel: "Тише",
			signalVolumeUpLabel: "Громче",
			fuzzyDownLabel: "Строже",
			fuzzyUpLabel: "Мягче",
			fuzzyHintLabel: "Больше % = мягче, но выше риск ложного срабатывания.",
			fuzzyStrictLabel: "0% точно",
			fuzzyLooseLabel: "50% мягко",
			wakeEndpoint: endpointLabel(readVoiceWakeUrl()),
			inputEndpoint: endpointLabel(readVoiceInputUrl()),
			serviceLine: this.#voiceServiceLine(),
			liveLine: this.#voiceSettingsLiveLine(),
			debugLines: this.#voiceDebugLines(),
		}
	}

	#voiceAutoSendLine(): string {
		const mode = readCodexVoiceAutoSendEnabled() ? "auto-send" : "manual draft"
		if (this.#voiceAutoEnterAt === null) return `${mode} · sent: 0`
		return `${mode} · ${formatTime(this.#voiceAutoEnterAt)} · sent #${this.#voiceAutoEnterCount}`
	}

	#voiceRtcCompactLine(): string {
		if (this.#voiceTransport === "idle") return ""
		const debug = this.#voiceRtcDebug
		const transport = this.#voiceTransport.toUpperCase()
		const audio = debug.serverAudioBytes > 0
			? `audio ${formatDebugBytes(debug.serverAudioBytes)} ${formatDebugPercent(debug.serverAudioRms)}`
			: debug.localAudioBytes > 0
				? `local ${formatDebugBytes(debug.localAudioBytes)} ${formatDebugPercent(debug.localAudioRms)}`
				: debug.state || "-"
		const asr = debug.asrMessages > 0 ? `ASR ${debug.asrMessages}/${debug.asrTextMessages}` : "ASR -"
		return `${transport} · ${audio} · ${asr}`
	}

	#voiceServiceLine(): string {
		const time = this.#voiceServiceCheckedAt === null ? "--:--:--" : formatTime(this.#voiceServiceCheckedAt)
		return `${time} · ${this.#voiceServiceDetail}`
	}

	#voiceSettingsLiveLine(): string {
		if (this.#voiceStatus === "waitingWake") return `wake-up: ${debugVoiceText(this.#voiceWakePreviewText)}`
		if (this.#voiceStatus === "listening" || this.#voiceStatus === "committing") return `asr: ${debugVoiceText(this.#voiceLastPartialText)}`
		return "голос: -"
	}

	#voiceDebugLines(): string[] {
		return [
			`status: ${this.#voiceStatus}`,
			`detail: ${this.#voiceDetail || "-"}`,
			`transport: ${this.#voiceTransport}`,
			`rtc state: ${this.#voiceRtcDebug.state || "-"}`,
			`rtc local: ${formatDebugBytes(this.#voiceRtcDebug.localAudioBytes)} · rms ${formatDebugPercent(this.#voiceRtcDebug.localAudioRms)}`,
			`rtc server: ${formatDebugBytes(this.#voiceRtcDebug.serverAudioBytes)} · rms ${formatDebugPercent(this.#voiceRtcDebug.serverAudioRms)} · ${this.#voiceRtcDebug.sampleRate || "-"} Hz`,
			`rtc asr: ${this.#voiceRtcDebug.asrMessages}/${this.#voiceRtcDebug.asrTextMessages} · ${this.#voiceRtcDebug.lastAsrType || "-"}`,
			`rtc text: ${debugVoiceText(this.#voiceRtcDebug.lastAsrText)}`,
			`rtc fallback: ${this.#voiceRtcDebug.fallbackReason || "-"}`,
			`wake: ${readVoiceWakeUrl()}`,
			`asr: ${readVoiceInputUrl()}`,
			`wake heard: ${debugVoiceText(this.#voiceWakePreviewText)}`,
			`wake at: ${formatDebugTime(this.#voiceWakePreviewAt)}`,
			`partial chars: ${this.#voiceLastPartialText.length}`,
			`partial: ${debugVoiceText(this.#voiceLastPartialText)}`,
			`partial at: ${formatDebugTime(this.#voiceLastPartialAt)}`,
			`chunk chars: ${this.#voiceLastChunkText.length}`,
			`chunk: ${debugVoiceText(this.#voiceLastChunkText)}`,
			`chunk at: ${formatDebugTime(this.#voiceLastChunkAt)}`,
			`dictation render hold: ${this.#voiceDictationActive ? "on" : "off"}`,
			`last error: ${debugVoiceText(this.#voiceLastErrorText)}`,
			`error at: ${formatDebugTime(this.#voiceLastErrorAt)}`,
			`level: ${Math.round(this.#voiceLevel * 100)}%`,
			`sound: ${hudNotificationDebugLine()}`,
		]
	}

	#addVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
		storeVoicePhrases(groupId, [...readVoicePhrases(groupId), phrase])
		this.#restartVoiceCommandRecognizerAfterSettingsChange()
		this.#voiceHud.requestRender()
	}

	#removeVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
		const target = voicePhraseKey(phrase)
		if (target === undefined) return
		storeVoicePhrases(groupId, readVoicePhrases(groupId).filter((item) => voicePhraseKey(item) !== target))
		this.#restartVoiceCommandRecognizerAfterSettingsChange()
		this.#voiceHud.requestRender()
	}

	#resetVoicePhrases(groupId: VoiceInputHudPhraseGroupId): void {
		storeVoicePhrases(groupId, defaultVoicePhrases(groupId))
		this.#restartVoiceCommandRecognizerAfterSettingsChange()
		this.#voiceHud.requestRender()
	}

	#flushVoiceAutoSendBuffer(): boolean {
		const text = cleanupVoiceInputText(this.#voiceAutoSendText)
		const mode = this.#voiceNextFlushMode
		this.#voiceAutoSendText = ""
		this.#voiceNextFlushMode = "auto"
		if (text.length === 0) return false
		const autoSendEnabled = readCodexVoiceAutoSendEnabled()
		const voiceComposerEdited = this.#voiceComposerEdited
		let handled: boolean
		if (mode !== "draft" && autoSendEnabled && !voiceComposerEdited) {
			this.#restoreVoiceComposerBaseDraft()
			handled = this.#sendVoiceSubmit(text)
		} else {
			handled = this.#stageVoiceDraft(text, {focusComposer: !autoSendEnabled || mode === "draft"})
		}
		if (handled) this.#clearVoicePartialPreview()
		return handled
	}

	#commitVoiceChunkText(raw: string): boolean {
		const text = cleanupVoiceInputText(raw)
		const mode = this.#voiceNextFlushMode
		this.#voiceAutoSendText = ""
		this.#voiceNextFlushMode = "auto"
		if (text.length === 0) return false
		const autoSendEnabled = readCodexVoiceAutoSendEnabled()
		const voiceComposerEdited = this.#voiceComposerEdited
		let handled: boolean
		if (mode !== "draft" && autoSendEnabled && !voiceComposerEdited) {
			this.#restoreVoiceComposerBaseDraft()
			handled = this.#sendVoiceSubmit(text)
		} else {
			handled = this.#stageVoiceDraft(text, {focusComposer: !autoSendEnabled || mode === "draft"})
		}
		if (handled) this.#clearVoicePartialPreview()
		return handled
	}

	#discardVoiceAutoSendBuffer(): void {
		this.#voiceAutoSendText = ""
	}

	#clearVoicePartialPreview(): void {
		if (!this.#voicePartialPreviewText && !this.#voiceAutoSendText) return
		this.#voicePartialPreviewText = ""
		this.#terminal.pane.clearInputPreview()
		this.#codexComposer.requestRender()
	}

	#preserveVoicePartialAsTerminalInput(): boolean {
		const text = cleanupVoiceInputText(this.#voicePartialPreviewText)
		if (text.length === 0) return false
		this.#discardVoiceAutoSendBuffer()
		return this.#stageVoiceDraft(text, {focusComposer: false})
	}

	async #startVoiceWake(reportErrors: boolean): Promise<boolean> {
		const client = this.#ensureVoiceClient()
		if (client.active) return true
		if (client.status === "error") client.reset()
		if (!this.#documentHasLocalVoiceFocus()) return false
		if (this.#terminal.socket?.readyState !== WebSocket.OPEN) {
			if (reportErrors) this.#flashVoiceHudError("Codex terminal не подключен")
			return false
		}
		if (this.#shouldUseVoiceRtcServerServiceProbe()) {
			this.#markVoiceRtcServerServiceProbe()
		} else {
			const serviceOk = await this.#checkVoiceService()
			if (!serviceOk) {
				if (reportErrors) this.#flashVoiceHudError(this.#voiceServiceDetail)
				return false
			}
		}
		try {
			await client.start()
			return true
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (/permission denied|notallowederror|not allowed/i.test(message)) {
				this.#pauseVoiceAutoWake()
				this.#onVoiceLeaseRelease("permission-denied")
			}
			if (reportErrors) this.#flashVoiceHudError(message)
			else this.#handleVoiceStatus("error", message)
			return false
		}
	}

	#restartVoiceCommandRecognizerAfterSettingsChange(): void {
		const client = this.#voiceClient
		if (client?.status !== "waitingWake") return
		this.#voiceAutoWakePaused = false
		client.stop()
		this.#scheduleVoiceAutoWake()
	}

	#handleDocumentVisibilityChange(): void {
		if (!this.#documentHasLocalVoiceFocus()) {
			this.#onVoiceLeaseRelease("inactive")
			this.#suspendVoiceForInactiveDocument()
			return
		}
		if (!this.#voiceAutoWakePaused) this.#scheduleVoiceAutoWake(250)
		this.#scheduleVoiceRtcPrewarm(600)
	}

	#suspendVoiceForInactiveDocument(): void {
		if (this.#voiceAutoWakeTimer !== null) {
			window.clearTimeout(this.#voiceAutoWakeTimer)
			this.#voiceAutoWakeTimer = null
		}
		this.#clearVoiceRtcPrewarmTimer()
		if (this.#voiceAutoWakeInFlight) return
		if (this.#voiceClient?.active === true) {
			this.#voiceNextFlushMode = "draft"
			this.#voiceClient.stop("document hidden")
			this.#discardVoiceAutoSendBuffer()
			this.#clearVoicePartialPreview()
			this.#clearVoiceWakePreview()
		} else {
			this.#voiceClient?.reset()
		}
	}

	#suspendVoiceDictationForRemoteLease(): void {
		if (this.#voiceAutoWakeTimer !== null) {
			window.clearTimeout(this.#voiceAutoWakeTimer)
			this.#voiceAutoWakeTimer = null
		}
		this.#clearVoiceRtcPrewarmTimer()
		if (this.#voiceAutoWakeInFlight) return
		const client = this.#voiceClient
		if (client?.active !== true || client.status === "waitingWake") {
			if (client?.active !== true) client?.reset()
			return
		}
		this.#voiceNextFlushMode = "draft"
		client.stop("remote voice active")
		this.#discardVoiceAutoSendBuffer()
		this.#clearVoicePartialPreview()
		this.#clearVoiceWakePreview()
	}

	#documentHasLocalVoiceFocus(): boolean {
		return true
	}

	#ownsVoiceLease(): boolean {
		return this.#voiceLeaseOwnerId === this.#voiceClientId && this.#voiceLeaseExpiresAt > Date.now()
	}

	#claimVoiceLeaseForManualStart(): void {
		if (!this.#ownsVoiceLease()) {
			this.#voiceLeaseOwnerId = this.#voiceClientId
			this.#voiceLeaseExpiresAt = Date.now() + VOICE_LEASE_LOCAL_TTL_MS
			this.#codexComposer.requestRender()
			this.#voiceHud.requestRender()
		}
		this.#onVoiceLeaseRequest("manual")
		this.#scheduleVoiceLeaseHeartbeat()
	}

	#claimVoiceLeaseForActivation(): void {
		if (!this.#ownsVoiceLease()) {
			this.#voiceLeaseOwnerId = this.#voiceClientId
			this.#voiceLeaseExpiresAt = Date.now() + VOICE_LEASE_LOCAL_TTL_MS
			this.#codexComposer.requestRender()
			this.#voiceHud.requestRender()
		}
		this.#onVoiceLeaseRequest("activation")
		this.#scheduleVoiceLeaseHeartbeat()
	}

	#voiceLeaseDebugSnapshot(): AppVoiceLeaseDebugSnapshot {
		const client = this.#voiceClient
		return {
			clientId: this.#voiceClientId,
			ownerId: this.#voiceLeaseOwnerId,
			expiresInMs: Math.max(0, this.#voiceLeaseExpiresAt - Date.now()),
			owns: this.#ownsVoiceLease(),
			localFocus: this.#documentHasLocalVoiceFocus(),
			voiceStatus: client?.status ?? "idle",
			voiceActive: client?.active === true,
			voice: client?.debugSnapshot() ?? null,
			autoWakePaused: this.#voiceAutoWakePaused,
			autoWakeTimerActive: this.#voiceAutoWakeTimer !== null,
			autoWakeInFlight: this.#voiceAutoWakeInFlight,
			prewarmTimerActive: this.#voicePrewarmTimer !== null,
		}
	}

	#scheduleVoiceLeaseHeartbeat(): void {
		if (this.#voiceLeaseHeartbeatTimer !== null || !this.#ownsVoiceLease()) return
		this.#voiceLeaseHeartbeatTimer = window.setTimeout(() => {
			this.#voiceLeaseHeartbeatTimer = null
			if (!this.#documentHasLocalVoiceFocus() || !this.#ownsVoiceLease()) return
			this.#onVoiceLeaseRequest("heartbeat")
			this.#scheduleVoiceLeaseHeartbeat()
		}, 4_000)
	}

	#clearVoiceLeaseHeartbeat(): void {
		if (this.#voiceLeaseHeartbeatTimer === null) return
		window.clearTimeout(this.#voiceLeaseHeartbeatTimer)
		this.#voiceLeaseHeartbeatTimer = null
	}

	#codexRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#codexDocked) return hiddenRect()
		const composerSpace = CODEX_COMPOSER_H + CODEX_COMPOSER_GAP
		const width = Math.min(760, bounds.w - 24)
		const height = Math.min(360, Math.max(120, bounds.h - 120 - composerSpace))
		const raw = readStoredRect(CODEX_RECT_STORAGE_KEY) ?? {
			x: Math.max(12, bounds.w - width - 16),
			y: Math.max(96, bounds.h - height - composerSpace - 18),
			w: width,
			h: height,
		}
		return clampHudPanelRect(raw, bounds, {minW: 260, minH: 160})
	}

	#codexComposerRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#codexDocked || this.#dockTransition?.kind === "codex") return hiddenRect()
		const terminal = this.#codexRect(bounds)
		if (terminal.visible === false) return hiddenRect()
		const maxW = Math.max(1, bounds.w - 24)
		const maxH = Math.max(1, bounds.h - 24)
		const fallbackW = Math.min(Math.max(1, terminal.w), maxW)
		const fallbackH = Math.min(CODEX_COMPOSER_H, maxH)
		const belowY = terminal.y + terminal.h + CODEX_COMPOSER_GAP
		const fallbackY = belowY + fallbackH <= bounds.h - 12
			? belowY
			: Math.max(12, terminal.y - fallbackH - CODEX_COMPOSER_GAP)
		const raw = readStoredRect(CODEX_COMPOSER_RECT_STORAGE_KEY) ?? {
			x: terminal.x,
			y: fallbackY,
			w: fallbackW,
			h: fallbackH,
		}
		const w = clampNumber(raw.w, Math.min(CODEX_COMPOSER_MIN_W, maxW), maxW)
		const h = clampNumber(raw.h, Math.min(CODEX_COMPOSER_MIN_H, maxH), maxH)
		return {
			x: clampNumber(raw.x, 12, Math.max(12, bounds.w - w - 12)),
			y: clampNumber(raw.y, 12, Math.max(12, bounds.h - h - 12)),
			w,
			h,
		}
	}

	#codexEditorRect(bounds: {w: number; h: number}): UiSurfaceRect {
		const composer = this.#codexComposerRect(bounds)
		return this.#codexEditorRectForComposer(composer)
	}

	#codexEditorRectForComposer(composer: UiSurfaceRect): UiSurfaceRect {
		if (composer.visible === false) return hiddenRect()
		const editorH = codexComposerEditorHeight(composer.h, this.#codexAttachments.length > 0)
		return {
			x: composer.x + PANE_FRAME.bodyInsetX,
			y: composer.y + codexComposerEditorTop(),
			w: Math.max(1, composer.w - PANE_FRAME.bodyInsetX * 2),
			h: editorH,
		}
	}

	syncCodexEditorToComposer(composer: UiSurfaceRect, mode: "drag" | "release"): void {
		if (mode === "drag") {
			this.#viewport.hud.setSurfaceRect(this.#codexEditor, this.#codexEditorRectForComposer(composer))
			this.#syncCodexNativeInputOverlay()
			return
		}
		this.#viewport.hud.clearSurfaceRect(this.#codexEditor)
		this.#viewport.hud.relayout()
		this.#syncCodexNativeInputOverlay()
	}

	#settingsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#settingsDocked) return hiddenRect()
		return readStoredRect(SETTINGS_RECT_STORAGE_KEY) ?? {
			x: 16,
			y: 92,
			w: Math.min(480, Math.max(SETTINGS_MIN_W, bounds.w - 32)),
			h: Math.min(680, Math.max(SETTINGS_MIN_H, bounds.h - 126)),
		}
	}

	#todoRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#todoDocked) return hiddenRect()
		return readStoredRect(TODO_RECT_STORAGE_KEY) ?? {
			x: Math.max(16, bounds.w - 440),
			y: 96,
			w: Math.min(420, Math.max(260, bounds.w - 32)),
			h: Math.min(520, Math.max(320, bounds.h - 140)),
		}
	}

	#workspaceFilesRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#workspaceDocked) return hiddenRect()
		const width = Math.min(340, Math.max(248, Math.floor(bounds.w * 0.24)))
		const height = Math.min(720, Math.max(340, bounds.h - 132))
		return readStoredRect(WORKSPACE_FILES_RECT_STORAGE_KEY) ?? {
			x: 16,
			y: 84,
			w: Math.min(width, Math.max(1, bounds.w - 32)),
			h: Math.min(height, Math.max(1, bounds.h - 100)),
		}
	}

	#workspaceEditorRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#workspaceDocked) return hiddenRect()
		const files = this.#workspaceFilesRect(bounds)
		const x = Math.min(Math.max(16, bounds.w - 420), files.x + files.w + 10)
		const width = Math.min(860, Math.max(360, bounds.w - x - 16))
		return readStoredRect(WORKSPACE_EDITOR_RECT_STORAGE_KEY) ?? {
			x,
			y: files.y,
			w: Math.min(width, Math.max(1, bounds.w - x - 16)),
			h: files.h,
		}
	}

	#sqliteTablesRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#sqliteDocked) return hiddenRect()
		const width = Math.min(320, Math.max(248, Math.floor(bounds.w * 0.22)))
		const height = Math.min(700, Math.max(340, bounds.h - 132))
		return readStoredRect(SQLITE_TABLES_RECT_STORAGE_KEY) ?? {
			x: 16,
			y: 96,
			w: Math.min(width, Math.max(1, bounds.w - 32)),
			h: Math.min(height, Math.max(1, bounds.h - 112)),
		}
	}

	#sqliteRowsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#sqliteDocked) return hiddenRect()
		const tables = this.#sqliteTablesRect(bounds)
		const x = Math.min(Math.max(16, bounds.w - 480), tables.x + tables.w + 10)
		const width = Math.min(920, Math.max(420, bounds.w - x - 16))
		return readStoredRect(SQLITE_ROWS_RECT_STORAGE_KEY) ?? {
			x,
			y: tables.y,
			w: Math.min(width, Math.max(1, bounds.w - x - 16)),
			h: tables.h,
		}
	}

	#networkControlsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#networkDocked) return hiddenRect()
		const maxW = Math.max(1, bounds.w - 32)
		const maxH = Math.max(1, bounds.h - 112)
		if (!networkLayoutUsesColumns(bounds.w)) {
			return {
				x: 16,
				y: 84,
				w: maxW,
				h: Math.min(Math.max(180, Math.floor(bounds.h * 0.32)), maxH),
			}
		}
		return readStoredRect(NETWORK_CONTROLS_RECT_STORAGE_KEY) ?? {
			x: 16,
			y: 84,
			w: Math.min(420, Math.max(360, Math.floor(bounds.w * 0.28))),
			h: Math.min(720, maxH),
		}
	}

	#networkTerminalRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#networkDocked) return hiddenRect()
		const controls = this.#networkControlsRect(bounds)
		if (controls.visible === false) return hiddenRect()
		const stored = readStoredRect(NETWORK_TERMINAL_RECT_STORAGE_KEY)
		if (stored !== null) return clampHudPanelRect(stored, bounds, {minW: 260, minH: 160})
		if (!networkLayoutUsesColumns(bounds.w)) {
			const y = controls.y + controls.h + 10
			return clampHudPanelRect({
				x: controls.x,
				y,
				w: controls.w,
				h: Math.max(180, bounds.h - y - 16),
			}, bounds, {minW: 260, minH: 160})
		}
		const x = controls.x + controls.w + 10
		return clampHudPanelRect({
			x,
			y: controls.y,
			w: Math.max(360, bounds.w - x - 16),
			h: controls.h,
		}, bounds, {minW: 260, minH: 160})
	}

	#androidRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#androidDocked) return hiddenRect()
		const width = Math.min(360, Math.max(300, bounds.w - 32))
		const height = Math.min(680, Math.max(420, bounds.h - 132))
		return readStoredRect(ANDROID_RECT_STORAGE_KEY) ?? {
			x: Math.max(16, bounds.w - width - 16),
			y: 84,
			w: width,
			h: height,
		}
	}

	#agentSignalRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#dockTransition?.kind === "codex") return hiddenRect()
		if (!this.#agentSignalPane.isOpen()) return hiddenRect()
		const terminal = this.#codexRect(bounds)
		if (terminal.visible === false) return hiddenRect()
		const panelW = Math.min(AGENT_SIGNAL_PANEL_W, Math.max(1, terminal.w - AGENT_SIGNAL_HEADER_TEXT_X * 2))
		const panelH = Math.min(
			AGENT_SIGNAL_PANEL_H,
			Math.max(1, terminal.h - AGENT_SIGNAL_HEADER_Y - AGENT_SIGNAL_BUTTON_SIZE - 10),
		)
		const panelY = terminal.y + AGENT_SIGNAL_HEADER_Y + AGENT_SIGNAL_BUTTON_SIZE + 6
		return {
			x: clampNumber(
				terminal.x + terminal.w - panelW - AGENT_SIGNAL_HEADER_TEXT_X,
				terminal.x + AGENT_SIGNAL_HEADER_TEXT_X,
				Math.max(terminal.x + AGENT_SIGNAL_HEADER_TEXT_X, terminal.x + terminal.w - panelW - AGENT_SIGNAL_HEADER_TEXT_X),
			),
			y: panelY,
			w: panelW,
			h: panelH,
		}
	}

	#voiceSettingsRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (!this.#voiceSettingsOpen) return hiddenRect()
		if (bounds.w < 80 || bounds.h < 80) return hiddenRect()
		const margin = VOICE_SETTINGS_MARGIN
		const w = Math.min(VOICE_SETTINGS_W, Math.max(1, bounds.w - margin * 2))
		const h = Math.min(VOICE_SETTINGS_H, Math.max(1, bounds.h - margin * 2))
		return readStoredRect(VOICE_SETTINGS_RECT_STORAGE_KEY) ?? {
			x: Math.max(margin, bounds.w - w - margin),
			y: Math.max(margin, Math.round((bounds.h - h) / 2)),
			w,
			h,
		}
	}

	#dockRect(kind: DockKind, bounds: {w: number; h: number}): UiSurfaceRect {
		if (bounds.w < 80 || bounds.h < 80) return hiddenRect()
		if (!this.isDocked(kind) && !this.dockTransitionActive(kind)) return hiddenRect()
		return dockRectForPlacement(kind, this.dockPlacement(kind, bounds), bounds)
	}

	#dockPlacementRaw(kind: DockKind): DockPlacement | null {
		if (kind === "codex") return this.#codexDockPlacement
		if (kind === "settings") return this.#settingsDockPlacement
		if (kind === "todo") return this.#todoDockPlacement
		if (kind === "workspace") return this.#workspaceDockPlacement
		if (kind === "sqlite") return this.#sqliteDockPlacement
		if (kind === "network") return this.#networkDockPlacement
		if (kind === "android") return this.#androidDockPlacement
		return this.#fullscreenDockPlacement
	}

}

type AppWebSqliteTablePaneOptions = {
	onCellEdit(rowid: number, column: string, value: SqliteCellValue): void
	onFrameRectChange?: (rect: PaneRect) => void
	onFrameDockRequest?: () => void
}

class AppWebSqliteTablePane extends UiSurface {
	#payload: SqliteDatabasePayload | null = null
	#status = "Open SQLite database"
	#selectedRowIds: string[] = []
	#selectionAnchorRowId: string | null = null
	#editSession: SqliteCellEditSession | null = null
	#editInput: TextFieldEditState = {value: "", cursor: 0, selectionAnchor: null}
	#frameDrag: PaneFrameDrag | null = null

	constructor(private readonly options: AppWebSqliteTablePaneOptions) {
		super({bgColor: HUD_CODE_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
		this.node.name = "AppWebSqliteTablePane"
	}

	setPayload(payload: SqliteDatabasePayload): void {
		const tableChanged = this.#payload?.path !== payload.path || this.#payload.selectedTable !== payload.selectedTable
		this.#payload = payload
		this.#status = payload.selectedTable === null ? "No tables" : `${payload.selectedTable} · ${payload.rows.length} rows`
		if (tableChanged) {
			this.#clearSelectionState()
			tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
			this.#closeEdit({blur: false})
		} else {
			this.#normalizeSelectionState()
		}
		this.requestRender()
	}

	setStatus(status: string): void {
		this.#status = status
		this.requestRender()
	}

	clearPayload(status: string): void {
		this.#payload = null
		this.#status = status
		this.#clearSelectionState()
		tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
		this.#closeEdit({blur: false})
		this.requestRender()
	}

	protected render(): void {
		const w = Math.max(1, this.rectW)
		const h = Math.max(1, this.rectH)
		this.drawRoundedRect(0, 0, w, h, {
			radius: radii.pane,
			fill: HUD_CODE_BG,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.CONTAINER,
		})
		this.#renderHeader(w)
		this.#renderBody(w, h)
		if (this.#editSession !== null) this.#renderEditOverlay()
	}

	#renderHeader(w: number): void {
		IconButton(this, 8, 6, 22, 22, {
			label: "Свернуть SQLite",
			iconSrc: uiIcons.minus,
			variant: "text",
			radius: 7,
			action: () => this.options.onFrameDockRequest?.(),
		})
		this.drawText("SQLite", 38, 7, {
			fontPx: 13,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, w - 52),
			z: Z.TEXT,
		})
		const rule = paneHeaderRuleRect(w, PANE_FRAME.headerHeight, PANE_FRAME.bodyInsetX)
		this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim, Z.SEPARATOR)
	}

	#renderBody(w: number, h: number): void {
		const payload = this.#payload
		const body = paneBodyRect(w, h, {headerHeight: PANE_FRAME.headerHeight, insetX: 14, topGap: 10, bottomInset: 14})
		const label = payload?.label ?? "app/web/tmp/boundary.sqlite"
		this.drawText(label, body.x, body.y, {
			fontPx: 12,
			material: payload === null ? this.materials.muted : this.materials.text,
			maxWidthPx: Math.max(1, body.w),
			z: Z.TEXT,
		})
		this.drawText(this.#statusLabel(), body.x, body.y + 22, {
			fontPx: 11,
			material: payload === null ? this.materials.muted : this.materials.green,
			maxWidthPx: Math.max(1, body.w),
			z: Z.TEXT,
		})
		if (payload === null) return
		if (payload.selectedTable === null) {
			this.drawText("No tables in database", body.x, body.y + 54, {
				fontPx: 12,
				material: this.materials.muted,
				maxWidthPx: Math.max(1, body.w),
				z: Z.TEXT,
			})
			return
		}
		this.drawText(sqliteSchemaSummary(payload.schema), body.x, body.y + 44, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, body.w),
			z: Z.TEXT,
		})
		const tableY = body.y + 68
		const tableH = Math.max(1, body.y + body.h - tableY)
		const columnNames = sqliteTableColumns(payload)
		const widths = sqliteTableColumnWidths(this, payload, columnNames)
		const selectedSummary = payload.tables.find((table) => table.name === payload.selectedTable)
		const editableTable = selectedSummary?.type === "table"
		const columns: Array<TableColumn<Record<string, SqliteCellValue>>> = columnNames.map((column, index) => ({
			key: column,
			label: sqliteTableColumnLabel(column),
			...(column === "__rowid" ? {getValue: (_row, rowIndex) => sqliteDisplayRowNumber(payload, rowIndex)} : {}),
			width: widths[index] ?? 104,
		}))
		Table(this, body.x, tableY, Math.max(1, body.w), tableH, {
			key: SQLITE_TABLE_SCROLL_KEY,
			columns,
			rows: payload.rows,
			rowHeight: 24,
			headerHeight: 27,
			emptyLabel: "No rows",
			getRowId: (row, rowIndex) => sqliteRowSelectionId(row, rowIndex),
			selectedRowIds: this.#selectedRowIds,
			getHeaderMaterial: ({column}) => column.key === "__rowid" ? this.materials.muted : this.materials.cyan,
			getCellText: ({value}) => sqliteCellLabel(value as SqliteCellValue | undefined),
			getCellMaterial: ({column, value}) => column.key === "__rowid"
				? this.materials.muted
				: value === null || value === undefined ? this.materials.muted : this.materials.text,
			onRowClick: (ctx) => this.#selectRow(ctx),
			...(editableTable ? {onRowDoubleClick: (ctx: TableRowPointerContext<Record<string, SqliteCellValue>>) => this.#editRowCell(ctx)} : {}),
		})
	}

	#statusLabel(): string {
		if (this.#payload === null || this.#selectedRowIds.length === 0) return this.#status
		return `${this.#status} · ${this.#selectedRowIds.length} selected`
	}

	#selectRow(ctx: TableRowPointerContext<Record<string, SqliteCellValue>>): void {
		const payload = this.#payload
		if (payload === null) return
		const rowIds = sqlitePayloadRowIds(payload)
		const update = tableSelectionAfterClick(rowIds, this.#selectedRowIds, String(ctx.rowId), this.#selectionAnchorRowId, ctx.event)
		this.#applySelection(update.selectedRowIds.map(String), String(update.anchorRowId))
	}

	#editRowCell(ctx: TableRowPointerContext<Record<string, SqliteCellValue>>): void {
		if (ctx.cell === null) return
		this.#editCell(ctx.cell)
	}

	#applySelection(selectedRowIds: readonly string[], anchorRowId: string): void {
		const payload = this.#payload
		const rowIds = payload === null ? [] : sqlitePayloadRowIds(payload)
		const next = normalizeTableSelection(rowIds, selectedRowIds).map(String)
		const nextAnchor = next.includes(anchorRowId) ? anchorRowId : next[0] ?? null
		if (sameStringArray(next, this.#selectedRowIds) && nextAnchor === this.#selectionAnchorRowId) return
		this.#selectedRowIds = next
		this.#selectionAnchorRowId = nextAnchor
		this.requestRender()
	}

	#normalizeSelectionState(): void {
		const payload = this.#payload
		const rowIds = payload === null ? [] : sqlitePayloadRowIds(payload)
		const next = normalizeTableSelection(rowIds, this.#selectedRowIds).map(String)
		const nextAnchor = this.#selectionAnchorRowId !== null && next.includes(this.#selectionAnchorRowId)
			? this.#selectionAnchorRowId
			: next[0] ?? null
		this.#selectedRowIds = next
		this.#selectionAnchorRowId = nextAnchor
	}

	#clearSelectionState(): void {
		this.#selectedRowIds = []
		this.#selectionAnchorRowId = null
	}

	#editCell(ctx: TableCellContext<Record<string, SqliteCellValue>>): void {
		const rowid = sqliteRowId(ctx.row["__rowid"])
		if (rowid === null || ctx.column.key === "__rowid") return
		const value = ctx.row[ctx.column.key] ?? null
		this.#openEdit({
			rowid,
			column: ctx.column.key,
			previous: value,
			onSubmit: this.options.onCellEdit,
		})
	}

	#openEdit(session: SqliteCellEditSession): void {
		const raw = sqliteCellPromptValue(session.previous)
		this.#editSession = session
		this.#editInput = {value: raw, cursor: raw.length, selectionAnchor: raw.length > 0 ? 0 : null}
		focusTextField(this, SQLITE_CELL_EDIT_FIELD_KEY, this.#editInput)
		this.canvas?.setFocused(this)
		this.canvas?.inputProxy?.focus()
		this.requestRender()
	}

	#renderEditOverlay(): void {
		const session = this.#editSession
		if (session === null) return
		const rect = this.#editModalRect()
		this.hit(0, 0, this.rectW, this.rectH, () => this.#cancel(), {
			key: "app-web-sqlite-cell-edit-backdrop",
			cursor: "default",
		})
		this.drawRoundedRect(0, 0, this.rectW, this.rectH, {
			radius: 0,
			fill: HUD_LOCAL_BACKDROP_BG,
			z: Z.CONTAINER,
		})
		this.drawRoundedRect(rect.x + 3, rect.y + 4, rect.w, rect.h, {
			radius: radii.pane,
			fill: HUD_MODAL_SHADOW_BG,
			z: Z.ELEMENT,
		})
		this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
			radius: radii.pane,
			fill: HUD_MODAL_BG,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.ELEMENT + 0.01,
		})
		this.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
			key: "app-web-sqlite-cell-edit-panel",
			cursor: "default",
		})
		const pad = 18
		const titleY = rect.y + 16
		this.drawText("Edit SQLite cell", rect.x + pad, titleY, {
			fontPx: 14,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, rect.w - pad * 2),
			z: Z.TEXT,
		})
		this.drawText(`rowid ${session.rowid} · ${session.column}`, rect.x + pad, titleY + 26, {
			fontPx: 11,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, rect.w - pad * 2),
			z: Z.TEXT,
		})
		const fieldY = rect.y + 74
		TextField(this, rect.x + pad, fieldY, Math.max(1, rect.w - pad * 2), 34, {
			key: SQLITE_CELL_EDIT_FIELD_KEY,
			value: this.#editInput.value,
			cursor: this.#editInput.cursor,
			selectionAnchor: this.#editInput.selectionAnchor,
			active: true,
			submitOnEnter: true,
			fontPx: 12,
			sx: {borderRadius: 8},
			onChange: (_value, state) => {
				this.#editInput = state
			},
			onSubmit: () => this.#submit(),
		})
		this.drawText("Use NULL for SQL null. Enter applies, Esc cancels.", rect.x + pad, fieldY + 45, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, rect.w - pad * 2),
			z: Z.TEXT,
		})
		const buttonY = rect.y + rect.h - 44
		const buttonW = 104
		Button(this, rect.x + rect.w - pad - buttonW, buttonY, buttonW, 30, {
			label: "Apply",
			variant: "contained",
			color: "success",
			onClick: () => this.#submit(),
		})
		Button(this, rect.x + rect.w - pad - buttonW * 2 - 10, buttonY, buttonW, 30, {
			label: "Cancel",
			variant: "outlined",
			color: "neutral",
			onClick: () => this.#cancel(),
		})
	}

	onActivate(): void {
		if (this.#editSession !== null) focusTextField(this, SQLITE_CELL_EDIT_FIELD_KEY, this.#editInput)
	}

	onKey(event: KeyboardEvent): void {
		if (this.#editSession === null || event.key !== "Escape") return
		event.preventDefault()
		this.#cancel()
	}

	#submit(): void {
		const session = this.#editSession
		if (session === null) return
		const next = sqliteCellInputValue(this.#editInput.value, session.previous)
		this.#closeEdit()
		session.onSubmit(session.rowid, session.column, next)
	}

	#cancel(): void {
		if (this.#editSession === null) return
		this.#closeEdit()
	}

	#closeEdit(opts: {blur?: boolean} = {}): void {
		if (this.#editSession === null) return
		this.#editSession = null
		this.#editInput = {value: "", cursor: 0, selectionAnchor: null}
		if (opts.blur !== false) {
			this.canvas?.setFocused(null)
			this.canvas?.inputProxy?.blur()
		}
		this.requestRender()
	}

	#editModalRect(): UiSurfaceRect {
		const maxW = Math.max(1, Math.min(SQLITE_CELL_EDIT_MODAL_W, this.rectW - 32))
		const maxH = Math.max(1, Math.min(SQLITE_CELL_EDIT_MODAL_H, this.rectH - 32))
		const modalW = clampNumber(SQLITE_CELL_EDIT_MODAL_W, Math.min(280, maxW), maxW)
		const modalH = clampNumber(SQLITE_CELL_EDIT_MODAL_H, Math.min(164, maxH), maxH)
		return {
			x: clampNumber(this.rectW / 2 - modalW / 2, 16, Math.max(16, this.rectW - modalW - 16)),
			y: clampNumber(this.rectH / 2 - modalH / 2, 16, Math.max(16, this.rectH - modalH - 16)),
			w: modalW,
			h: modalH,
		}
	}

	#frameInteractionOpts(): PaneFrameInteractionOpts {
		return {
			showHeader: true,
			movable: true,
			resizable: true,
			minW: 420,
			minH: PANE_FRAME.headerHeight + 220,
		}
	}

	#beginFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		const opts = this.#frameInteractionOpts()
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, opts)
		if (kind === null) return false
		const frame = this.canvas?.surfaceFrame(this)
		if (frame === undefined || frame === null) return false
		this.#frameDrag = beginPaneFrameDrag(kind, event, frame.rect, opts)
		event.preventDefault()
		const cursor = paneFrameCursor(kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#updateFrameInteraction(event: MouseEvent): boolean {
		const drag = this.#frameDrag
		const frame = this.canvas?.surfaceFrame(this)
		if (drag === null || frame === undefined || frame === null) return false
		const next = paneFrameDragRect(drag, event, frame.bounds)
		this.canvas?.setSurfaceRect(this, next)
		const cursor = paneFrameCursor(drag.kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		if (this.#frameDrag === null) return false
		this.#updateFrameInteraction(event)
		const frame = this.canvas?.surfaceFrame(this)
		this.#frameDrag = null
		this.#syncFrameCursor(localX, localY)
		if (frame !== undefined && frame !== null) this.options.onFrameRectChange?.(frame.rect as PaneRect)
		return true
	}

	#syncFrameCursor(localX: number, localY: number): void {
		if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
		const cursor = paneFrameCursor(kind, false)
		const canvasElement = this.canvas.canvas
		if (canvasElement !== undefined) canvasElement.style.cursor = cursor ?? "default"
	}

	override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
		super.onPointerDown(event, localX, localY)
		if (this.pressedHit !== null) return
		this.#beginFrameInteraction(event, localX, localY)
	}

	override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
		if (this.#updateFrameInteraction(event)) return
		super.onPointerMove(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
		if (this.#endFrameInteraction(event, localX, localY)) return
		super.onPointerUp(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onPointerLeave(): void {
		if (this.#frameDrag !== null) return
		super.onPointerLeave()
	}

	override onDeactivate(): void {
		this.#frameDrag = null
		super.onDeactivate()
	}
}

class AppWebCodexComposerPane extends UiSurface {
	#frameDrag: PaneFrameDrag | null = null
	#voiceSettingsPressTimer: number | null = null
	#voiceSettingsPressStart: {x: number; y: number} | null = null
	#voiceSettingsLongPressOpened = false
	#voiceToggleClickTimer: number | null = null

	constructor(private readonly hud: AppWebHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "AppWebCodexComposerPane"
	}

	protected render(): void {
		const w = Math.max(1, this.rectW)
		const h = Math.max(1, this.rectH)
		const pad = CODEX_COMPOSER_PAD
		this.drawRoundedRect(0, 0, w, h, {
			radius: 8,
			fill: new Color(0.04, 0.06, 0.09, 0.74),
			border: this.hud.codexDropActive() ? palette.cyan : palette.borderDim,
			borderWidth: this.hud.codexDropActive() ? 1.3 : 1,
			z: Z.CONTAINER,
		})
		this.#renderHeader(w)
		const bodyW = Math.max(1, w - pad * 2)
		if (this.hud.codexAttachments().length > 0) {
			const footerY = codexComposerEditorTop() + codexComposerEditorHeight(h, true) + 8
			this.#drawFooter(pad, footerY, bodyW, h - pad)
		}
		if (this.hud.codexDropActive()) this.#drawDropOverlay(w, h)
	}

	#renderHeader(w: number): void {
		const buttonSize = CODEX_COMPOSER_HEADER_BUTTON_SIZE
		const gap = 5
		const dockButtonX = CODEX_COMPOSER_HEADER_INSET_X
		const titleLeft = dockButtonX + buttonSize + gap
		const voiceButtonRect = this.#voiceButtonRect(w)
		const voiceButtonX = voiceButtonRect.x
		const sendButtonX = voiceButtonX - gap - buttonSize
		const transportW = 32
		const transportX = sendButtonX - gap - transportW
		const textMaxW = Math.max(1, transportX - titleLeft - 10)
		const titleW = Math.min(textMaxW, this.measureText("Codex message", 11))
		const titleCx = Math.min(Math.max(w / 2, titleLeft + titleW / 2), Math.max(titleLeft + titleW / 2, transportX - titleW / 2 - 8))
		const status = this.hud.codexComposerStatus()
		const statusW = Math.min(textMaxW, this.measureText(status, 9))
		const statusCx = Math.min(Math.max(w / 2, titleLeft + statusW / 2), Math.max(titleLeft + statusW / 2, transportX - statusW / 2 - 8))
		const buttonY = 6
		IconButton(this, dockButtonX, buttonY, buttonSize, buttonSize, {
			label: "Свернуть Codex",
			iconSrc: uiIcons.minus,
			variant: "text",
			radius: 7,
			action: () => this.hud.setDocked("codex", true),
		})
		this.drawTextCentered("Codex message", titleCx, 10.5, {
			fontPx: 11,
			material: this.materials.cyan,
			maxWidthPx: textMaxW,
			z: Z.TEXT,
		})
		this.drawTextCentered(status, statusCx, 23, {
			fontPx: 9,
			material: this.materials.muted,
			maxWidthPx: textMaxW,
			z: Z.TEXT,
		})
		const badgeH = buttonSize - 2
		this.#drawTransportBadge(transportX, buttonY + Math.max(0, Math.round((buttonSize - badgeH) / 2)), transportW, badgeH)
		const canSubmit = this.hud.codexComposerReady() && codexComposerMessage(this.hud.codexDraft(), this.hud.codexAttachments()).length > 0
		IconButton(this, sendButtonX, buttonY, buttonSize, buttonSize, {
			label: "Отправить",
			iconSrc: uiIcons.send,
			disabled: !canSubmit,
			variant: "text",
			radius: 7,
			action: () => this.hud.submitCodexComposer(),
		})
		ButtonVoice(this, voiceButtonX, voiceButtonRect.y, buttonSize, {
			key: "codex-message-voice",
			snapshot: this.hud.voiceButtonSnapshot(),
			soundPulse: this.hud.voiceSoundPulse(),
			tooltip: "Голосовой ввод",
			onClick: () => this.#queueVoiceToggleClick(),
		})
		const rule = paneHeaderRuleRect(w, PANE_FRAME.headerHeight, PANE_FRAME.bodyInsetX)
		this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim, Z.SEPARATOR)
	}

	#voiceButtonRect(w = Math.max(1, this.rectW)): UiSurfaceRect {
		const buttonSize = CODEX_COMPOSER_HEADER_BUTTON_SIZE
		return {
			x: w - CODEX_COMPOSER_HEADER_INSET_X - buttonSize,
			y: 6,
			w: buttonSize,
			h: buttonSize,
		}
	}

	#voiceButtonHit(localX: number, localY: number): boolean {
		return pointInUiRect(localX, localY, this.#voiceButtonRect())
	}

	#beginVoiceSettingsLongPress(localX: number, localY: number): void {
		this.#cancelVoiceSettingsLongPress()
		this.#voiceSettingsPressStart = {x: localX, y: localY}
		this.#voiceSettingsLongPressOpened = false
		this.#voiceSettingsPressTimer = window.setTimeout(() => {
			this.#voiceSettingsPressTimer = null
			if (this.#voiceSettingsPressStart === null) return
			this.#cancelVoiceToggleClick()
			this.#voiceSettingsLongPressOpened = true
			this.hud.openVoiceSettings()
			super.onDeactivate()
		}, VOICE_SETTINGS_LONG_PRESS_MS)
	}

	#cancelVoiceSettingsLongPress(): void {
		if (this.#voiceSettingsPressTimer !== null) {
			window.clearTimeout(this.#voiceSettingsPressTimer)
			this.#voiceSettingsPressTimer = null
		}
		this.#voiceSettingsPressStart = null
	}

	#openVoiceSettingsFromButton(event: MouseEvent): void {
		event.preventDefault()
		event.stopPropagation()
		this.#cancelVoiceToggleClick()
		this.#cancelVoiceSettingsLongPress()
		this.#voiceSettingsLongPressOpened = false
		this.hud.openVoiceSettings()
		super.onDeactivate()
	}

	#queueVoiceToggleClick(): void {
		this.#cancelVoiceToggleClick()
		this.#voiceToggleClickTimer = window.setTimeout(() => {
			this.#voiceToggleClickTimer = null
			this.hud.toggleVoiceInput()
		}, VOICE_TOGGLE_CLICK_DELAY_MS)
	}

	#cancelVoiceToggleClick(): void {
		if (this.#voiceToggleClickTimer === null) return
		window.clearTimeout(this.#voiceToggleClickTimer)
		this.#voiceToggleClickTimer = null
	}

	#drawTransportBadge(x: number, y: number, w: number, h: number): void {
		const transport = this.hud.voiceTransport()
		const p2p = transport === "p2p"
		const ws = transport === "ws"
		const connecting = transport === "connecting"
		const label = p2p ? "P2P" : ws ? "WS" : connecting ? "..." : "-"
		const fill = p2p
			? new Color(0.04, 0.16, 0.12, 0.78)
			: ws ? new Color(0.05, 0.11, 0.16, 0.74)
				: connecting ? new Color(0.10, 0.10, 0.08, 0.58)
					: new Color(0.05, 0.06, 0.08, 0.42)
		const border = p2p ? palette.green : ws ? palette.cyan : connecting ? palette.borderDim : null
		const material = p2p ? this.materials.green : ws ? this.materials.cyan : this.materials.muted
		this.drawRoundedRect(x, y, w, h, {
			radius: 5,
			fill,
			border,
			borderWidth: p2p || ws ? 1 : 0.7,
			z: Z.ELEMENT,
		})
		const fontPx = label.length > 2 ? 7 : 8
		const textW = this.measureText(label, fontPx)
		this.drawText(label, x + Math.max(2, (w - textW) / 2), y + Math.max(0, (h - fontPx) / 2), {
			fontPx,
			material,
			maxWidthPx: w - 4,
			z: Z.TEXT,
		})
	}

	#drawFooter(x: number, y: number, w: number, maxY: number): void {
		this.#drawAttachmentRow(x, y, w, maxY)
	}

	#drawAttachmentRow(x: number, y: number, w: number, maxY: number): void {
		const attachments = this.hud.codexAttachments()
		let cx = x
		let cy = y
		const gap = 6
		const chipH = 22
		for (const attachment of attachments) {
			if (cy + chipH > maxY - 18) break
			const label = `${attachment.name} · ${formatAttachmentSize(attachment.size)}`
			const chipW = Math.min(w, Math.max(96, Math.ceil(this.measureText(label, 10)) + 34))
			if (cx > x && cx + chipW > x + w) {
				cx = x
				cy += chipH + gap
				if (cy + chipH > maxY - 18) break
			}
			this.drawRoundedRect(cx, cy, chipW, chipH, {
				radius: 7,
				fill: new Color(0.06, 0.12, 0.15, 0.72),
				border: palette.borderDim,
				borderWidth: 1,
				z: Z.ELEMENT,
			})
			this.drawText(label, cx + 9, cy + 5, {
				fontPx: 10,
				material: this.materials.text,
				maxWidthPx: Math.max(1, chipW - 28),
				z: Z.TEXT,
			})
			this.drawText("x", cx + chipW - 16, cy + 5, {
				fontPx: 10,
				material: this.materials.muted,
				maxWidthPx: 8,
				z: Z.TEXT,
			})
			this.hit(cx, cy, chipW, chipH, () => this.hud.removeCodexAttachment(attachment.id), {
				key: `codex-attachment:${attachment.id}`,
				cursor: "pointer",
			})
			cx += chipW + gap
		}
	}

	#drawDropOverlay(w: number, h: number): void {
		this.drawRoundedRect(3, 3, Math.max(1, w - 6), Math.max(1, h - 6), {
			radius: 7,
			fill: new Color(0.02, 0.16, 0.18, 0.34),
			border: palette.cyan,
			borderWidth: 1,
			z: Z.CONTAINER + 0.2,
		})
		this.drawText("Drop image", CODEX_COMPOSER_PAD, h - 25, {
			fontPx: 11,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, w - CODEX_COMPOSER_PAD * 2),
			z: Z.TEXT + 0.2,
		})
	}

	#frameInteractionOpts(): PaneFrameInteractionOpts {
		return {
			showHeader: true,
			movable: true,
			resizable: true,
			minW: CODEX_COMPOSER_MIN_W,
			minH: CODEX_COMPOSER_MIN_H,
		}
	}

	#beginFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		const opts = this.#frameInteractionOpts()
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, opts)
		if (kind === null) return false
		const frame = this.canvas?.surfaceFrame(this)
		if (frame === undefined || frame === null) return false
		this.#frameDrag = beginPaneFrameDrag(kind, event, frame.rect, opts)
		event.preventDefault()
		const cursor = paneFrameCursor(kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#updateFrameInteraction(event: MouseEvent): boolean {
		const drag = this.#frameDrag
		const frame = this.canvas?.surfaceFrame(this)
		if (drag === null || frame === undefined || frame === null) return false
		const next = paneFrameDragRect(drag, event, frame.bounds)
		const applied = this.canvas?.setSurfaceRect(this, next) ?? next
		this.hud.syncCodexEditorToComposer(applied, "drag")
		const cursor = paneFrameCursor(drag.kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		if (this.#frameDrag === null) return false
		this.#updateFrameInteraction(event)
		const frame = this.canvas?.surfaceFrame(this)
		this.#frameDrag = null
		this.#syncFrameCursor(localX, localY)
		if (frame !== undefined && frame !== null) {
			writeStoredRect(CODEX_COMPOSER_RECT_STORAGE_KEY, frame.rect as PaneRect)
			this.hud.syncCodexEditorToComposer(frame.rect, "release")
		}
		return true
	}

	#syncFrameCursor(localX: number, localY: number): void {
		if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
		const cursor = paneFrameCursor(kind, false)
		const canvasElement = this.canvas.canvas
		if (canvasElement !== undefined) canvasElement.style.cursor = cursor ?? "default"
	}

	override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
		if (this.#voiceButtonHit(localX, localY)) {
			if (event.button === 0 && event.detail >= 2) {
				this.#openVoiceSettingsFromButton(event)
				return
			}
			if (event.button === 2 || (event.ctrlKey && event.button === 0)) {
				this.#openVoiceSettingsFromButton(event)
				return
			}
			if (event.button === 0 && (isAndroidBrowser() || isTouchPointerEvent(event))) this.#beginVoiceSettingsLongPress(localX, localY)
		}
		super.onPointerDown(event, localX, localY)
		if (this.pressedHit !== null) return
		this.#beginFrameInteraction(event, localX, localY)
	}

	override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
		const voicePressStart = this.#voiceSettingsPressStart
		if (voicePressStart !== null && Math.hypot(localX - voicePressStart.x, localY - voicePressStart.y) > DOCK_DRAG_THRESHOLD_PX) {
			this.#cancelVoiceSettingsLongPress()
		}
		if (this.#updateFrameInteraction(event)) return
		super.onPointerMove(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
		if (this.#voiceSettingsLongPressOpened) {
			this.#voiceSettingsLongPressOpened = false
			this.#cancelVoiceSettingsLongPress()
			event.preventDefault()
			this.#syncFrameCursor(localX, localY)
			return
		}
		this.#cancelVoiceSettingsLongPress()
		if (this.#endFrameInteraction(event, localX, localY)) return
		super.onPointerUp(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
		if (this.#voiceButtonHit(localX, localY)) {
			this.#openVoiceSettingsFromButton(event)
			return
		}
		super.onContextMenu(event, localX, localY)
	}

	override onPointerLeave(): void {
		if (this.#frameDrag !== null) return
		this.#cancelVoiceSettingsLongPress()
		super.onPointerLeave()
	}

	override onDeactivate(): void {
		this.#frameDrag = null
		this.#cancelVoiceSettingsLongPress()
		this.#cancelVoiceToggleClick()
		this.#voiceSettingsLongPressOpened = false
		super.onDeactivate()
	}
}

class AppWebSettingsPane extends UiSurface {
	#frameDrag: PaneFrameDrag | null = null
	#tab: SettingsTab = "scene"
	#voicePhraseDrafts = new Map<VoiceInputHudPhraseGroupId, string>()

	constructor(private readonly hud: AppWebHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "AppWebSettingsPane"
	}

	setTab(tab: SettingsTab): void {
		if (this.#tab === tab) return
		this.#tab = tab
		this.requestRender()
	}

	protected render(): void {
		const w = Math.max(SETTINGS_MIN_W, this.rectW)
		const h = Math.max(SETTINGS_MIN_H, this.rectH)
		this.drawRoundedRect(0, 0, w, h, {
			radius: radii.pane,
			fill: HUD_PANEL_BG,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.CONTAINER,
		})
		this.#renderHeader(w)
		const body = paneBodyRect(w, h, {headerHeight: PANE_FRAME.headerHeight, insetX: 10, topGap: 8, bottomInset: 10})
		this.#renderBody(body)
	}

	#renderHeader(w: number): void {
		const dockButtonSize = 22
		const dockButtonX = PANE_FRAME.headerTextX
		const titleX = dockButtonX + dockButtonSize + 8
		IconButton(this, dockButtonX, 7, dockButtonSize, dockButtonSize, {
			label: "Свернуть настройки",
			iconSrc: uiIcons.minus,
			action: () => this.hud.setDocked("settings", true),
		})
		this.drawText("Settings", titleX, PANE_FRAME.headerTextY, {
			fontPx: 13,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, w - titleX - PANE_FRAME.headerTextX),
			z: Z.TEXT,
		})
		this.drawText("app/web", titleX + 86, PANE_FRAME.headerTextY + 1, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, w - titleX - PANE_FRAME.headerTextX - 86),
			z: Z.TEXT,
		})
		const rule = paneHeaderRuleRect(w, PANE_FRAME.headerHeight, PANE_FRAME.bodyInsetX)
		this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim, Z.SEPARATOR)
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
			this.#drawSection("Геометрия", APP_WEB_LAYOUT_SETTING_KEYS, x, y, w)
			return
		}
		if (this.#tab === "render") {
			y = this.#drawSection("Космос", ["animationEnabled"], x, y, w)
			y = this.#drawSection("Детализация", ["detailDensityFactor", "detailLevelMultiplier", "baseDepth", "wireframeOpacity"], x, y, w)
			y = this.#drawSection("Тор", ["torusCrossRingRotationDeg", "torusRadialSegments", "torusTubularSegments"], x, y, w)
			this.#drawSection("Подписи", ["labelVisibleLevels", "labelFontSizeMm", "labelSurfaceOffsetMm"], x, y, w)
		}
	}

	#renderScene(x: number, y: number, w: number): number {
		this.#drawStatusRow(x, y, w)
		y += 54
		TextField(this, x, y, w, 34, {
			key: "app-web-root-src",
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
			fill: new Color(0.05, 0.07, 0.10, 0.62),
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

	#renderVoice(x: number, y: number, w: number): number {
		y = this.#drawBooleanRow("Автоотправка", "Отправлять распознанный текст в Codex автоматически.", readCodexVoiceAutoSendEnabled(), x, y, w, (checked) => this.hud.setVoiceAutoSendEnabled(checked))
		y = SliderControl(this, x, y, w, {
			key: "voice-signal-volume",
			label: "Звук микрофона",
			value: readVoiceSignalVolume(),
			min: 0,
			max: MAX_VOICE_SIGNAL_VOLUME,
			step: 0.1,
			format: (value) => `${Math.round(value * 100)}%`,
			onChange: (value) => this.hud.setVoiceSignalVolume(Math.round(value * 20) / 20),
		}) + 12
		y = SliderControl(this, x, y, w, {
			key: "voice-recognition-timeout",
			label: "Тайм-аут распознавания",
			value: readVoiceRecognitionTimeoutSeconds(),
			min: MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			max: MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			step: 1,
			format: (value) => `${Math.round(value)} c`,
			onChange: (value) => this.hud.setVoiceRecognitionTimeoutSeconds(value),
		}) + 12
		y = this.#drawDeactivationMode(x, y, w) + 12
		y = VoicePhraseSettings(this, x, y, w, {
			key: "settings-voice-phrases",
			groups: this.hud.voicePhraseGroups(),
			draftValue: (groupId) => this.#voicePhraseDrafts.get(groupId) ?? "",
			onDraftChange: (groupId, value) => this.#voicePhraseDrafts.set(groupId, value),
			onAddPhrase: (groupId, phrase) => this.hud.addVoicePhrase(groupId, phrase),
			onRemovePhrase: (groupId, phrase) => this.hud.removeVoicePhrase(groupId, phrase),
			onResetPhrases: (groupId) => this.hud.resetVoicePhrases(groupId),
			onFuzzyChange: (groupId, value) => this.hud.setVoicePhraseFuzzyTolerance(groupId, value),
		}) + 12
		y = this.#drawBooleanRow("Сигнал агента", "Звук после окончания вывода агента.", this.hud.agentSoundEnabled(), x, y, w, (checked) => this.hud.setAgentSoundEnabled(checked))
		return SliderControl(this, x, y, w, {
			key: "agent-sound-volume",
			label: "Звук окончания",
			value: this.hud.agentSoundVolume(),
			min: 0,
			max: MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME,
			step: 0.1,
			format: (value) => `${Math.round(value * 100)}%`,
			onChange: (value) => this.hud.setAgentSoundVolume(value),
		})
	}

	#drawSection(title: string, keys: readonly AppWebSettingKey[], x: number, y: number, w: number): number {
		this.drawText(title, x, y, {fontPx: 11, material: this.materials.cyan, maxWidthPx: w, z: Z.TEXT})
		y += 19
		for (const key of keys) y = this.#drawSetting(key, x, y, w)
		return y + 14
	}

	#drawSetting(key: AppWebSettingKey, x: number, y: number, w: number): number {
		const config = APP_WEB_SETTINGS_BY_KEY[key]
		const value = this.hud.settingValue(key)
		if (typeof config.defaultValue === "boolean") {
			return this.#drawBooleanRow(config.label, config.description, value === true, x, y, w, (checked) => this.hud.setSetting(key, checked))
		}
		const min = typeof config.min === "number" ? config.min : 0
		const max = typeof config.max === "number" ? config.max : Math.max(1, Number(config.defaultValue) * 2)
		return SliderControl(this, x, y, w, {
			key: `app-web-setting:${key}`,
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

	#drawDeactivationMode(x: number, y: number, w: number): number {
		this.drawText("Режим деактивации", x, y, {
			fontPx: 10,
			material: this.materials.text,
			maxWidthPx: w,
			z: Z.TEXT,
		})
		const options: Array<{value: VoiceInputHudDeactivationMode; label: string}> = [
			{value: "phrase", label: "Фразы"},
			{value: "timeout", label: "Тайм-аут"},
			{value: "phrase-timeout", label: "Оба"},
		]
		const current = voiceHudDeactivationMode(readVoiceDeactivationMode())
		const gap = 6
		const buttonW = Math.max(1, (w - gap * (options.length - 1)) / options.length)
		for (const [index, option] of options.entries()) {
			const active = current === option.value
			Button(this, x + index * (buttonW + gap), y + 18, buttonW, 28, {
				label: option.label,
				size: "small",
				variant: active ? "contained" : "outlined",
				color: active ? "primary" : "neutral",
				radius: 7,
				action: () => this.hud.setVoiceDeactivationMode(option.value),
			})
		}
		return y + 56
	}

	#contentHeight(): number {
		if (this.#tab === "scene") return 244
		if (this.#tab === "geometry") return 36 + APP_WEB_LAYOUT_SETTING_KEYS.length * 46
		if (this.#tab === "render") {
			const sectionHeight = (rows: number): number => 19 + rows * 46 + 14
			return 4 + sectionHeight(1) + sectionHeight(4) + sectionHeight(3) + sectionHeight(3)
		}
		return 244
	}

	#frameInteractionOpts(): PaneFrameInteractionOpts {
		return {
			showHeader: true,
			movable: true,
			resizable: true,
			minW: SETTINGS_MIN_W,
			minH: SETTINGS_MIN_H,
		}
	}

	#beginFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		const opts = this.#frameInteractionOpts()
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, opts)
		if (kind === null) return false
		const frame = this.canvas?.surfaceFrame(this)
		if (frame === undefined || frame === null) return false
		this.#frameDrag = beginPaneFrameDrag(kind, event, frame.rect, opts)
		event.preventDefault()
		const cursor = paneFrameCursor(kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#updateFrameInteraction(event: MouseEvent): boolean {
		const drag = this.#frameDrag
		const frame = this.canvas?.surfaceFrame(this)
		if (drag === null || frame === undefined || frame === null) return false
		const next = paneFrameDragRect(drag, event, frame.bounds)
		this.canvas?.setSurfaceRect(this, next)
		const cursor = paneFrameCursor(drag.kind, true)
		const canvasElement = this.canvas?.canvas
		if (cursor !== null && canvasElement !== undefined) canvasElement.style.cursor = cursor
		return true
	}

	#endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
		if (this.#frameDrag === null) return false
		this.#updateFrameInteraction(event)
		const frame = this.canvas?.surfaceFrame(this)
		this.#frameDrag = null
		this.#syncFrameCursor(localX, localY)
		if (frame !== undefined && frame !== null) writeStoredRect(SETTINGS_RECT_STORAGE_KEY, frame.rect as PaneRect)
		return true
	}

	#syncFrameCursor(localX: number, localY: number): void {
		if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
		const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
		const cursor = paneFrameCursor(kind, false)
		const canvasElement = this.canvas.canvas
		if (canvasElement !== undefined) canvasElement.style.cursor = cursor ?? "default"
	}

	override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
		super.onPointerDown(event, localX, localY)
		if (this.pressedHit !== null) return
		this.#beginFrameInteraction(event, localX, localY)
	}

	override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
		if (this.#updateFrameInteraction(event)) return
		super.onPointerMove(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
		if (this.#endFrameInteraction(event, localX, localY)) return
		super.onPointerUp(event, localX, localY)
		this.#syncFrameCursor(localX, localY)
	}

	override onPointerLeave(): void {
		if (this.#frameDrag !== null) return
		super.onPointerLeave()
	}

	override onDeactivate(): void {
		this.#frameDrag = null
		super.onDeactivate()
	}
}

class AppWebAgentSignalPane extends UiSurface {
	#open = false

	constructor(private readonly hud: AppWebHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "AppWebAgentSignalPane"
	}

	isOpen(): boolean {
		return this.#open
	}

	toggle(): void {
		this.#setOpen(!this.#open)
	}

	protected render(): void {
		if (this.#open) this.#drawPanel()
	}

	#drawPanel(): void {
		const w = this.rectW
		const panelY = 0
		const panelH = Math.max(1, this.rectH)
		const pad = 12
		const enabled = this.hud.agentSoundEnabled()
		const volume = this.hud.agentSoundVolume()
		this.drawRoundedRect(0, panelY, w, panelH, {
			radius: 8,
			fill: HUD_PANEL_BG,
			border: palette.borderDim,
			borderWidth: 1,
			z: Z.CONTAINER,
		})
		this.drawText("Сигнал агента", pad, panelY + 10, {
			fontPx: 11,
			material: this.materials.text,
			maxWidthPx: Math.max(1, w - pad * 2 - 56),
			z: Z.TEXT,
		})
		const switchW = 44
		const switchH = 22
		const switchX = Math.max(pad, w - pad - switchW)
		const switchY = panelY + 38
		this.drawText("Звук после окончания вывода агента.", pad, panelY + 43, {
			fontPx: 9,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, switchX - pad - 10),
			z: Z.TEXT,
		})
		Switcher(this, switchX, switchY, switchW, switchH, {
			checked: enabled,
			color: "primary",
			key: "app-web-agent-signal-enabled",
			tooltip: "Сигнал агента",
			onChange: (checked) => this.hud.setAgentSoundEnabled(checked),
			sx: {zIndex: Z.ELEMENT + 0.1},
		})
		this.#drawVolumeControl(pad, panelY + 76, Math.max(1, w - pad * 2), volume)
	}

	#drawVolumeControl(x: number, y: number, w: number, value: number): void {
		const clamped = clampHostTerminalAgentSoundVolume(value)
		const ratio = MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME <= 0 ? 0 : clamped / MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME
		this.drawText(`Громкость: ${Math.round(clamped * 100)}%`, x, y - 17, {
			fontPx: 9,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, w),
			z: Z.TEXT,
		})
		const buttonW = 28
		IconButton(this, x, y, buttonW, 22, {
			label: "Сигнал агента тише",
			iconSrc: uiIcons.minus,
			action: () => this.hud.setAgentSoundVolume(clamped - 0.1),
		})
		IconButton(this, x + w - buttonW, y, buttonW, 22, {
			label: "Сигнал агента громче",
			iconSrc: uiIcons.plus,
			action: () => this.hud.setAgentSoundVolume(clamped + 0.1),
		})

		const trackX = x + buttonW + 10
		const trackW = Math.max(1, w - buttonW * 2 - 20)
		const trackY = y + 8
		this.drawRoundedRect(trackX, trackY, trackW, 6, {
			radius: 3,
			fill: palette.borderDim,
			border: null,
			opacity: 0.42,
			z: Z.ELEMENT,
		})
		this.drawRoundedRect(trackX, trackY, Math.max(3, trackW * ratio), 6, {
			radius: 3,
			fill: palette.cyan,
			border: null,
			opacity: 0.64,
			z: Z.ELEMENT + 0.02,
		})
		const knobX = trackX + trackW * ratio
		this.drawRoundedRect(knobX - 5, trackY - 4, 10, 14, {
			radius: 5,
			fill: palette.cyan,
			border: palette.borderBright,
			borderWidth: 1,
			opacity: 0.86,
			z: Z.ELEMENT + 0.04,
		})
		const setFromPointer = (localX: number): void => {
			this.hud.setAgentSoundVolume(((localX - trackX) / trackW) * MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME)
		}
		this.hit(trackX - 4, y, trackW + 8, 22, () => undefined, {
			key: "app-web-agent-signal-volume-track",
			cursor: "pointer",
			onPointerDown: (localX) => setFromPointer(localX),
			onPointerMove: (localX) => setFromPointer(localX),
		})
	}

	#setOpen(open: boolean): void {
		if (this.#open === open) return
		this.#open = open
		this.hud.relayout()
		this.requestRender()
	}
}

class AppWebDockPane extends UiSurface {
	#press: {
		dragging: boolean
		lastX: number
		lastY: number
		startX: number
		startY: number
		timer: ReturnType<typeof setTimeout> | null
		touch: boolean
	} | null = null
	#suppressClick = false

	constructor(private readonly hud: AppWebHud, private readonly kind: DockKind) {
		super({bgColor: null, borderColor: null})
		this.node.name = `AppWebDockPane:${kind}`
	}

	preserveNativeTouchActivation(): boolean {
		return this.kind === "fullscreen" && isAndroidBrowser()
	}

	protected render(): void {
		HudSideTab(this, {
			rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
			key: `app-web-dock:${this.kind}`,
			edge: this.hud.dockEdge(this.kind),
			icon: this.hud.dockIcon(this.kind),
			label: this.hud.dockLabel(this.kind),
			tooltip: this.hud.dockTooltip(this.kind),
			onClick: () => this.#restoreFromClick(),
		})
	}

	override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
		super.onPointerDown(event, localX, localY)
		if (event.button !== 0 || this.pressedHit === null) return
		const point = this.#canvasPoint(event)
		if (point === null) return
		const press = {
			dragging: false,
			lastX: point.x,
			lastY: point.y,
			startX: point.x,
			startY: point.y,
			timer: null as ReturnType<typeof setTimeout> | null,
			touch: isTouchPointerEvent(event),
		}
		press.timer = setTimeout(() => {
			if (this.#press !== press) return
			press.dragging = true
			this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
		}, DOCK_LONG_PRESS_MS)
		this.#press = press
	}

	override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
		const press = this.#press
		if (press === null) {
			super.onPointerMove(event, localX, localY)
			return
		}
		const point = this.#canvasPoint(event)
		if (point !== null) {
			press.lastX = point.x
			press.lastY = point.y
			if (!press.dragging && !press.touch && Math.hypot(press.lastX - press.startX, press.lastY - press.startY) >= DOCK_DRAG_THRESHOLD_PX) {
				press.dragging = true
			}
		}
		if (!press.dragging) {
			super.onPointerMove(event, localX, localY)
			return
		}
		event.preventDefault()
		this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
		if (this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "grabbing"
	}

	override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
		const press = this.#press
		this.#press = null
		if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
		const wasDragging = press?.dragging === true
		const activateTouchFullscreen = this.kind === "fullscreen" && press?.touch === true && !wasDragging && this.pressedHit !== null
		if (activateTouchFullscreen) this.#restoreFromClick()
		if (wasDragging || activateTouchFullscreen) this.#suppressClick = true
		super.onPointerUp(event, localX, localY)
		if (wasDragging || activateTouchFullscreen) this.#suppressClick = false
	}

	override onPointerLeave(): void {
		if (this.#press !== null) return
		super.onPointerLeave()
	}

	override onDeactivate(): void {
		super.onDeactivate()
		this.#cancelPress()
	}

	override dispose(): void {
		this.#cancelPress()
		super.dispose()
	}

	#restoreFromClick(): void {
		if (this.#suppressClick) return
		if (this.hud.dockTransitionActive(this.kind)) return
		this.hud.toggleDockAction(this.kind)
	}

	#cancelPress(): void {
		const press = this.#press
		this.#press = null
		if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
	}

	#moveDockToCanvasPoint(point: {x: number; y: number}): void {
		const frame = this.canvas?.surfaceFrame(this)
		if (frame === undefined || frame === null) return
		this.hud.setDockPlacementFromPoint(this.kind, point, frame.bounds)
	}

	#canvasPoint(event: MouseEvent): {x: number; y: number} | null {
		const canvas = this.canvas?.canvas
		if (canvas === undefined) return null
		const rect = canvas.getBoundingClientRect()
		return {x: event.clientX - rect.left, y: event.clientY - rect.top}
	}
}

function cloneSettings(settings: AppWebHudSettingsSnapshot): AppWebHudSettingsSnapshot {
	return {
		layoutSettings: {...settings.layoutSettings},
		renderSettings: {...settings.renderSettings},
	}
}

function clampSettingValue(key: AppWebSettingKey, value: number): number {
	const config = APP_WEB_SETTINGS_BY_KEY[key]
	const min = typeof config.min === "number" ? config.min : Number.NEGATIVE_INFINITY
	const max = typeof config.max === "number" ? config.max : Number.POSITIVE_INFINITY
	const clamped = clampNumber(Number.isFinite(value) ? value : Number(config.defaultValue), min, max)
	const step = config.step
	if (step === undefined || step <= 0) return clamped
	const rounded = Math.round(clamped / step) * step
	return Math.abs(step - Math.round(step)) < 1e-9 ? Math.round(rounded) : Number(rounded.toFixed(3))
}

function formatSettingValue(value: number, step?: number): string {
	if (!Number.isFinite(value)) return ""
	if (step !== undefined && Math.abs(step - Math.round(step)) >= 1e-9) return String(Number(value.toFixed(2)))
	return String(Math.round(value))
}

function statusKindForPane(kind: PtyStatusKind): TerminalStatusKind {
	if (kind === "running") return "running"
	if (kind === "connected") return "connected"
	if (kind === "disconnected") return "disconnected"
	if (kind === "error") return "error"
	return "idle"
}

function parseTerminalMessage(raw: string): PtyServerMessage | null {
	try {
		const value = JSON.parse(raw) as PtyServerMessage
		if (typeof value === "object" && value !== null && "type" in value) return value
	} catch {
		return null
	}
	return null
}

function shellLabel(shell: string): string {
	const parts = shell.split("/")
	return parts[parts.length - 1] || shell
}

function codexTerminalStatusLabel(label: string): string {
	if (/^restored\s+tmux:/i.test(label)) return "restored"
	if (/^tmux:/i.test(label)) return "connected"
	return label
}

function isTerminalSubmitInput(data: string): boolean {
	return data.includes("\r") || data.includes("\n")
}

const agentSignalIconCache = new Map<string, string>()

function agentSignalIcon(enabled: boolean): string {
	const key = enabled ? "on" : "off"
	const cached = agentSignalIconCache.get(key)
	if (cached !== undefined) return cached
	const stroke = enabled ? "#6fd3ff" : "#8b96a6"
	const slash = enabled
		? ""
		: `<path d="M290 910 910 290" stroke="#ff7f6f" stroke-width="92" stroke-linecap="round"/>`
	const source = `<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${stroke}" stroke-width="86" stroke-linecap="round" stroke-linejoin="round"><path d="M210 690H380L610 870V330L380 510H210v180Z"/><path d="M725 455c66 86 66 204 0 290"/><path d="M850 350c132 146 132 354 0 500"/></g>${slash}</svg>`
	const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
	agentSignalIconCache.set(key, icon)
	return icon
}

function dockRectForPlacement(kind: DockKind, placement: DockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
	const vertical = placement.edge === "left" || placement.edge === "right"
	const long = dockLong(kind)
	const dockW = vertical
		? Math.min(DOCK_SHORT, Math.max(1, bounds.w - DOCK_MARGIN))
		: Math.min(long, Math.max(1, bounds.w - DOCK_MARGIN * 2))
	const dockH = vertical
		? Math.min(long, Math.max(1, bounds.h - DOCK_MARGIN * 2))
		: Math.min(DOCK_SHORT, Math.max(1, bounds.h - DOCK_MARGIN))
	if (vertical) {
		const centerY = clampNumber(
			placement.offset,
			DOCK_MARGIN + dockH / 2,
			Math.max(DOCK_MARGIN + dockH / 2, bounds.h - DOCK_MARGIN - dockH / 2),
		)
		return {
			x: placement.edge === "left" ? 0 : Math.max(0, bounds.w - dockW),
			y: centerY - dockH / 2,
			w: dockW,
			h: dockH,
		}
	}
	const centerX = clampNumber(
		placement.offset,
		DOCK_MARGIN + dockW / 2,
		Math.max(DOCK_MARGIN + dockW / 2, bounds.w - DOCK_MARGIN - dockW / 2),
	)
	return {
		x: centerX - dockW / 2,
		y: placement.edge === "top" ? 0 : Math.max(0, bounds.h - dockH),
		w: dockW,
		h: dockH,
	}
}

function defaultDockPlacement(kind: DockKind, bounds: {w: number; h: number}): DockPlacement {
	const placement = defaultDockPlacementRaw(kind, bounds)
	const rect = dockRectForPlacement(kind, placement, bounds)
	return {
		edge: placement.edge,
		offset: placement.edge === "left" || placement.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
	}
}

function defaultDockPlacementRaw(kind: DockKind, bounds: {w: number; h: number}): DockPlacement {
	if (kind === "codex") return {edge: "bottom", offset: Math.max(0, bounds.w / 2)}
	if (kind === "settings") return {edge: "top", offset: Math.max(0, bounds.w / 2)}
	if (kind === "fullscreen") return {edge: "top", offset: Math.max(0, bounds.w / 2 + 108)}
	if (kind === "android") return {edge: "right", offset: Math.max(0, bounds.h / 2)}
	if (kind === "workspace") return {edge: "left", offset: Math.max(0, bounds.h / 2)}
	if (kind === "sqlite") return {edge: "left", offset: Math.max(0, bounds.h / 2 + 160)}
	if (kind === "network") return {edge: "bottom", offset: Math.max(0, bounds.w / 2 + 160)}
	return {edge: "left", offset: Math.max(0, bounds.h - 70)}
}

function dockPlacementFromPoint(kind: DockKind, point: {x: number; y: number}, bounds: {w: number; h: number}): DockPlacement {
	const distances: Array<{edge: HudSideTabEdge; distance: number}> = [
		{edge: "left", distance: point.x},
		{edge: "right", distance: bounds.w - point.x},
		{edge: "top", distance: point.y},
		{edge: "bottom", distance: bounds.h - point.y},
	]
	let best = distances[0]!
	for (const item of distances.slice(1)) {
		if (item.distance < best.distance) best = item
	}
	const rect = dockRectForPlacement(kind, {
		edge: best.edge,
		offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
	}, bounds)
	return {
		edge: best.edge,
		offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
	}
}

function dockLong(kind: DockKind): number {
	if (kind === "codex") return 150
	if (kind === "settings") return 116
	if (kind === "android") return 108
	if (kind === "workspace") return 124
	if (kind === "sqlite") return 104
	if (kind === "network") return 118
	if (kind === "todo") return 104
	return 40
}

function networkActionForSwitch(key: NetworkWatchServiceKey, checked: boolean): string {
	if (key === "tls") return checked ? "start:tls" : "stop:tls"
	return checked ? "start:redirect" : "stop:redirect"
}

function networkStatusLinesFromOutput(stdout: string): string[] {
	const lines = stdout
		.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => {
			const trimmed = line.trim()
			if (trimmed.length === 0) return false
			if (/^\+-+\+$/.test(trimmed)) return false
			if (/^\|\s*MetaFor network/.test(trimmed)) return false
			return true
		})
	return lines.length > 0 ? lines : ["no network status"]
}

function networkLayoutUsesColumns(width: number): boolean {
	return width >= 900
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(url, init)
	const text = await response.text()
	let payload: unknown = null
	if (text.length > 0) {
		try {
			payload = JSON.parse(text) as unknown
		} catch {
			payload = text
		}
	}
	if (!response.ok) {
		const message = typeof payload === "object" && payload !== null && typeof (payload as {error?: unknown}).error === "string"
			? (payload as {error: string}).error
			: `${response.status} ${response.statusText}`
		throw new Error(message)
	}
	return payload
}

function sqliteDatabasePayloadFromUnknown(payload: unknown): SqliteDatabasePayload {
	const record = asRecord(payload)
	if (record === null || record.ok !== true) throw new Error("sqlite payload is invalid")
	const tables = Array.isArray(record.tables)
		? record.tables.map(sqliteTableSummaryFromUnknown).filter((item): item is SqliteTableSummary => item !== null)
		: []
	const schema = Array.isArray(record.schema)
		? record.schema.map(sqliteColumnInfoFromUnknown).filter((item): item is SqliteColumnInfo => item !== null)
		: []
	const rows = Array.isArray(record.rows)
		? record.rows.map(sqliteRowFromUnknown).filter((item): item is Record<string, SqliteCellValue> => item !== null)
		: []
	return {
		ok: true,
		path: stringValue(record.path) ?? APP_WEB_SQLITE_PATH,
		label: stringValue(record.label) ?? stringValue(record.path) ?? APP_WEB_SQLITE_PATH,
		version: stringValue(record.version) ?? "",
		selectedTable: stringValue(record.selectedTable),
		limit: finiteNumberValue(record.limit) ?? rows.length,
		offset: finiteNumberValue(record.offset) ?? 0,
		tables,
		schema,
		rows,
	}
}

function sqliteTableSummaryFromUnknown(value: unknown): SqliteTableSummary | null {
	const record = asRecord(value)
	if (record === null) return null
	const name = stringValue(record.name)
	if (name === null) return null
	const type = stringValue(record.type)
	return {
		name,
		type: type === "view" ? "view" : "table",
		rowCount: finiteNumberValue(record.rowCount),
	}
}

function sqliteColumnInfoFromUnknown(value: unknown): SqliteColumnInfo | null {
	const record = asRecord(value)
	if (record === null) return null
	const name = stringValue(record.name)
	if (name === null) return null
	return {
		name,
		type: stringValue(record.type) ?? "",
		notNull: record.notNull === true,
		defaultValue: typeof record.defaultValue === "string" ? record.defaultValue : null,
		primaryKey: record.primaryKey === true,
	}
}

function sqliteRowFromUnknown(value: unknown): Record<string, SqliteCellValue> | null {
	const record = asRecord(value)
	if (record === null) return null
	const row: Record<string, SqliteCellValue> = {}
	for (const [key, cell] of Object.entries(record)) row[key] = sqliteCellValueFromUnknown(cell)
	return row
}

function sqliteCellValueFromUnknown(value: unknown): SqliteCellValue {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
	const record = asRecord(value)
	if (record === null) return String(value)
	const cell: Exclude<SqliteCellValue, string | number | boolean | null> = {}
	const type = stringValue(record.type)
	const size = finiteNumberValue(record.size)
	const hex = stringValue(record.hex)
	if (type !== null) cell.type = type
	if (size !== null) cell.size = size
	if (hex !== null) cell.hex = hex
	return cell
}

function sqliteTableItems(tables: readonly SqliteTableSummary[]): FileListItem[] {
	return tables.map((table) => ({
		id: sqliteTableItemId(table.name),
		name: table.name,
		kind: "file",
		path: table.name,
		sizeLabel: table.rowCount === null ? table.type : `${table.rowCount}`,
		statusLabel: table.type,
	}))
}

function sqliteTableItemId(table: string): string {
	return `sqlite:table:${encodeURIComponent(table)}`
}

function sqliteTableNameFromItemId(id: string): string | null {
	const prefix = "sqlite:table:"
	if (!id.startsWith(prefix)) return null
	try {
		return decodeURIComponent(id.slice(prefix.length))
	} catch {
		return null
	}
}

function finiteNumberValue(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false
	for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false
	return true
}

function sqliteSchemaSummary(schema: readonly SqliteColumnInfo[]): string {
	if (schema.length === 0) return "No schema"
	return schema.map((column) => {
		const flags = [
			column.type || "value",
			column.primaryKey ? "pk" : "",
			column.notNull ? "not null" : "",
		].filter(Boolean).join(" ")
		return `${column.name}: ${flags}`
	}).join(" · ")
}

function sqliteTableColumns(payload: SqliteDatabasePayload): string[] {
	const out: string[] = []
	if (payload.rows.some((row) => Object.prototype.hasOwnProperty.call(row, "__rowid"))) out.push("__rowid")
	for (const column of payload.schema) if (!out.includes(column.name)) out.push(column.name)
	for (const row of payload.rows) {
		for (const key of Object.keys(row)) if (!out.includes(key)) out.push(key)
	}
	return out
}

function sqliteTableColumnLabel(column: string): string {
	return column === "__rowid" ? "#" : column
}

function sqliteDisplayRowNumber(payload: SqliteDatabasePayload, rowIndex: number): number {
	return payload.offset + rowIndex + 1
}

function sqliteTableColumnWidths(surface: UiSurface, payload: SqliteDatabasePayload, columns: readonly string[]): number[] {
	const sampleRows = payload.rows.slice(0, 40)
	return columns.map((column) => {
		let width = surface.measureText(sqliteTableColumnLabel(column), 10) + 28
		const schema = payload.schema.find((item) => item.name === column)
		if (schema !== undefined) width = Math.max(width, surface.measureText(schema.type || "value", 9) + 28)
		for (let rowIndex = 0; rowIndex < sampleRows.length; rowIndex += 1) {
			const value = column === "__rowid" ? sqliteDisplayRowNumber(payload, rowIndex) : sampleRows[rowIndex]?.[column] ?? null
			width = Math.max(width, surface.measureText(sqliteCellLabel(value), 10) + 28)
		}
		const min = column === "__rowid" ? 48 : 104
		return Math.min(260, Math.max(min, Math.ceil(width)))
	})
}

function sqlitePayloadRowIds(payload: SqliteDatabasePayload): TableRowId[] {
	return payload.rows.map((row, rowIndex) => sqliteRowSelectionId(row, rowIndex))
}

function sqliteRowSelectionId(row: Record<string, SqliteCellValue>, rowIndex: number): string {
	const rowid = sqliteRowId(row["__rowid"])
	return rowid === null ? `index:${rowIndex}` : `rowid:${rowid}`
}

function sqliteRowId(value: SqliteCellValue | undefined): number | null {
	if (typeof value === "number" && Number.isInteger(value)) return value
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
	return null
}

function sqliteCellLabel(value: SqliteCellValue | undefined): string {
	if (value === undefined || value === null) return "NULL"
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	if (typeof value === "object") {
		const size = typeof value.size === "number" ? `${value.size}b` : "blob"
		const hex = typeof value.hex === "string" && value.hex.length > 0 ? ` ${value.hex}` : ""
		return `<${size}${hex}>`
	}
	return String(value)
}

function sqliteCellPromptValue(value: SqliteCellValue): string {
	if (value === null) return "NULL"
	if (typeof value === "object") return sqliteCellLabel(value)
	return String(value)
}

function sqliteCellInputValue(raw: string, previous: SqliteCellValue): SqliteCellValue {
	const clean = raw.trim()
	if (/^null$/i.test(clean)) return null
	if (typeof previous === "number") {
		const number = Number(clean)
		return Number.isFinite(number) ? number : raw
	}
	if (typeof previous === "boolean") {
		if (/^true$/i.test(clean)) return true
		if (/^false$/i.test(clean)) return false
	}
	return raw
}

function workspaceProcessesFromPayload(payload: unknown): WorkspaceProcess[] {
	const processes = asRecord(payload)?.processes
	if (!Array.isArray(processes)) return []
	return processes.map(workspaceProcessFromPayload).filter((item): item is WorkspaceProcess => item !== null)
}

function workspaceProcessFromPayload(value: unknown): WorkspaceProcess | null {
	const record = asRecord(value)
	if (record === null) return null
	const id = stringValue(record.id) ?? stringValue(record.processId) ?? stringValue(record.moduleId)
	if (id === null) return null
	const runtime = asRecord(record.runtime)
	const content = asRecord(record.content)
	return {
		id,
		label: stringValue(record.label) ?? id,
		modulePath: stringValue(content?.modulePath) ?? null,
		connection: stringValue(runtime?.connection) ?? "unknown",
		paused: runtime?.paused === true,
		protocolUrl: stringValue(runtime?.protocolUrl) ?? "",
	}
}

function workspacePreferredProcessId(processes: readonly WorkspaceProcess[]): string | null {
	const appWeb = processes.find((process) =>
		process.id === "app-web-server.ts" ||
		process.label === "app/web/server.ts" ||
		process.modulePath?.endsWith("/app/web/server.ts") === true ||
		process.modulePath === "app/web/server.ts"
	)
	return appWeb?.id ?? (processes.length === 1 ? processes[0]?.id ?? null : null)
}

function workspaceProcessModulesFromPayload(payload: unknown): WorkspaceProcessModules {
	const record = asRecord(payload)
	if (record === null) throw new Error("modules payload must be an object")
	const processId = stringValue(record.processId) ?? stringValue(record.moduleId)
	if (processId === null) throw new Error("modules payload has no processId")
	const modules = Array.isArray(record.modules)
		? record.modules.map((item) => ({path: stringValue(asRecord(item)?.path) ?? ""})).filter((item) => item.path.length > 0)
		: []
	return {
		processId,
		label: stringValue(record.label) ?? processId,
		root: stringValue(record.root) ?? "",
		workspacePath: stringValue(record.workspacePath) ?? "",
		entrypoint: stringValue(record.entrypoint),
		modules,
	}
}

function workspaceSourceFilesFromPayload(payload: unknown): Pick<WorkspaceProcessModules, "root" | "workspacePath" | "modules"> {
	const record = asRecord(payload)
	if (record === null) throw new Error("source files payload must be an object")
	const files = Array.isArray(record.files)
		? record.files.map((item) => ({path: stringValue(asRecord(item)?.path) ?? ""})).filter((item) => item.path.length > 0)
		: []
	return {
		root: stringValue(record.root) ?? "",
		workspacePath: stringValue(record.workspacePath) ?? "",
		modules: files,
	}
}

function workspaceEntriesFromProcessModules(modules: WorkspaceProcessModules): Map<string, WorkspaceFileEntry> {
	const entries = new Map<string, WorkspaceFileEntry>()
	for (const item of modules.modules) {
		const path = normalizeWorkspacePath(item.path)
		if (path.length === 0) continue
		const name = workspaceBasename(path)
		const id = workspaceProcessFileId(modules.processId, path)
		entries.set(id, {
			sourceKind: "process",
			processId: modules.processId,
			sourceUrl: workspaceAbsolutePath(modules.root, path),
			name,
			path,
		})
	}
	return entries
}

function workspaceEntriesFromSourceFiles(sourceFiles: Pick<WorkspaceProcessModules, "workspacePath" | "modules">): Map<string, WorkspaceFileEntry> {
	const entries = new Map<string, WorkspaceFileEntry>()
	const workspacePath = normalizeWorkspacePath(sourceFiles.workspacePath)
	for (const item of sourceFiles.modules) {
		const sourcePath = normalizeWorkspacePath(item.path)
		if (sourcePath.length === 0) continue
		const path = stripWorkspacePathPrefix(sourcePath, workspacePath)
		if (path.length === 0) continue
		const name = workspaceBasename(path)
		const entry: WorkspaceFileEntry = {
			sourceKind: "source",
			sourcePath,
			name,
			path,
		}
		entries.set(workspaceEntryId(entry), entry)
	}
	return entries
}

function workspaceInspectorItems(options: {
	localLabel: string
	localEntries: ReadonlyMap<string, WorkspaceFileEntry>
	processes: readonly WorkspaceProcess[]
	processLabel: string
	processEntries: ReadonlyMap<string, WorkspaceFileEntry>
	attachedProcessId: string | null
}): FileListItem[] {
	const items: FileListItem[] = []
	if (options.processEntries.size > 0) items.push(...workspaceEntriesToFileItems(options.processEntries, "process"))
	const runtimeChildren: FileListItem[] = [
		{id: "workspace:processes:refresh", name: "Refresh processes", kind: "file", statusLabel: "reload"},
	]
	if (options.attachedProcessId !== null) {
		runtimeChildren.push(
			{id: "workspace:processes:detach", name: "Disconnect", kind: "file", statusLabel: options.attachedProcessId},
			...workspaceProcessActionItems(),
		)
	}
	for (const process of options.processes) {
		runtimeChildren.push({
			id: workspaceProcessItemId(process.id),
			name: process.label,
			kind: "file",
			path: process.protocolUrl,
			statusLabel: processStatusLabel(process),
		})
	}
	items.push({
		id: "workspace:processes",
		name: options.processLabel,
		kind: "directory",
		children: runtimeChildren,
	})
	if (options.localEntries.size > 0) {
		items.push({
			id: "workspace:local:root",
			name: options.localLabel,
			kind: "directory",
			children: workspaceEntriesToFileItems(options.localEntries, "local"),
		})
	}
	return items
}

function workspaceProcessActionItems(): FileListItem[] {
	return [
		{id: "workspace:processes:action:pause", name: "Pause", kind: "file", statusLabel: "debug"},
		{id: "workspace:processes:action:resume", name: "Resume", kind: "file", statusLabel: "debug"},
		{id: "workspace:processes:action:stepOver", name: "Step over", kind: "file", statusLabel: "debug"},
		{id: "workspace:processes:action:stepInto", name: "Step into", kind: "file", statusLabel: "debug"},
		{id: "workspace:processes:action:stepOut", name: "Step out", kind: "file", statusLabel: "debug"},
		{id: "workspace:processes:action:showExecutionPoint", name: "Show execution point", kind: "file", statusLabel: "debug"},
	]
}

function workspaceDefaultExpandedIds(items: readonly FileListItem[]): string[] {
	const ids = ["workspace:processes"]
	if (items.some((item) => item.id === "workspace:local:root")) ids.push("workspace:local:root")
	return ids
}

function workspaceEntriesToFileItems(entries: ReadonlyMap<string, WorkspaceFileEntry>, namespace: "local" | "process"): FileListItem[] {
	const root: WorkspaceTreeNode = {id: "", name: "", dirs: new Map(), files: []}
	for (const entry of entries.values()) {
		const normalizedPath = normalizeWorkspacePath(entry.path)
		const isDirectory = isWorkspaceDirectoryMarker(normalizedPath)
		const parts = normalizedPath.split("/").filter((part) => part.length > 0)
		if (parts.length === 0) continue
		let node = root
		for (const part of isDirectory ? parts : parts.slice(0, -1)) {
			node = workspaceTreeDirectory(node, part)
		}
		if (isDirectory) continue
		node.files.push(entry)
	}
	return workspaceTreeChildren(root, namespace)
}

function workspaceTreeDirectory(node: WorkspaceTreeNode, name: string): WorkspaceTreeNode {
	let child = node.dirs.get(name)
	if (child === undefined) {
		child = {id: node.id.length === 0 ? name : `${node.id}/${name}`, name, dirs: new Map(), files: []}
		node.dirs.set(name, child)
	}
	return child
}

function workspaceTreeChildren(node: WorkspaceTreeNode, namespace: "local" | "process"): FileListItem[] {
	const dirs: FileListItem[] = [...node.dirs.values()]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((child) => ({
			id: `workspace:${namespace}:dir:${child.id}`,
			name: child.name,
			kind: "directory" as const,
			children: workspaceTreeChildren(child, namespace),
		}))
	const files = node.files
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((entry) => {
			const item: FileListItem = {
				id: workspaceEntryId(entry),
				name: entry.name,
				kind: "file",
				path: entry.path,
			}
			if (entry.sourceKind === "process") item.statusLabel = "runtime"
			return item
		})
	return [...dirs, ...files]
}

function workspaceEntryId(entry: WorkspaceFileEntry): string {
	if (entry.sourceKind === "process" && entry.processId !== undefined) return workspaceProcessFileId(entry.processId, entry.path)
	if (entry.sourceKind === "source") return `workspace:source:${entry.sourcePath ?? entry.path}`
	return `workspace:local:${entry.path}`
}

async function collectDirectoryHandleFiles(handle: BrowserDirectoryHandle, prefix: string, entries: Map<string, WorkspaceFileEntry>): Promise<void> {
	const iterator = handle.entries?.()
	if (iterator === undefined) return
	for await (const [name, child] of iterator) {
		const path = prefix.length === 0 ? name : `${prefix}/${name}`
		if (isBrowserDirectoryHandle(child)) {
			await collectDirectoryHandleFiles(child, path, entries)
			continue
		}
		if (!isTextWorkspacePath(path)) continue
		const entry: WorkspaceFileEntry = {
			sourceKind: "local",
			handle: child,
			name,
			path,
		}
		entries.set(workspaceEntryId(entry), entry)
	}
}

function pickDirectoryWithInput(): Promise<{label: string; entries: Map<string, WorkspaceFileEntry>}> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		;(input as HTMLInputElement & {webkitdirectory?: boolean}).webkitdirectory = true
		input.style.position = "fixed"
		input.style.left = "-10000px"
		input.style.top = "-10000px"
		document.body.appendChild(input)
		input.addEventListener("change", () => {
			const files = [...(input.files ?? [])]
			document.body.removeChild(input)
			if (files.length === 0) {
				reject(new DOMException("directory selection canceled", "AbortError"))
				return
			}
			const entries = new Map<string, WorkspaceFileEntry>()
			let label = "Local"
			for (const file of files) {
				const webkitPath = (file as File & {webkitRelativePath?: string}).webkitRelativePath ?? file.name
				const path = normalizeWorkspacePath(webkitPath)
				if (path.includes("/")) label = path.split("/")[0] ?? label
				if (!isTextWorkspacePath(path)) continue
				const rel = path.includes("/") ? path.split("/").slice(1).join("/") : path
				const entry: WorkspaceFileEntry = {sourceKind: "local", file, name: workspaceBasename(rel), path: rel}
				entries.set(workspaceEntryId(entry), entry)
			}
			resolve({label, entries})
		}, {once: true})
		input.click()
	})
}

function workspaceProcessItemId(processId: string): string {
	return `workspace:process:${encodeURIComponent(processId)}`
}

function workspaceProcessIdForItemId(id: string): string | null {
	if (!id.startsWith("workspace:process:")) return null
	if (id.includes(":root")) return null
	const encoded = id.slice("workspace:process:".length)
	if (encoded.length === 0 || encoded.includes(":")) return null
	try {
		return decodeURIComponent(encoded)
	} catch {
		return null
	}
}

function workspaceProcessFileId(processId: string, path: string): string {
	return `workspace:process-file:${encodeURIComponent(processId)}:${path}`
}

function workspaceProcessActionForItemId(id: string): string | null {
	const prefix = "workspace:processes:action:"
	return id.startsWith(prefix) ? id.slice(prefix.length) : null
}

function codexComposerMessage(draft: string, attachments: readonly CodexComposerAttachment[]): string {
	const body = draft.replace(/\r\n?/g, "\n").trim()
	if (attachments.length === 0) return body
	const imageLines = attachments.map((attachment) => `- ${attachment.path}`).join("\n")
	const imageBlock = `Изображения:\n${imageLines}`
	return body.length === 0 ? imageBlock : `${body}\n\n${imageBlock}`
}

function mergeCodexComposerDraft(base: string, addition: string): string {
	const left = base.trim()
	const right = addition.trim()
	if (!left) return right
	if (!right) return left
	return `${left}\n${right}`
}

function codexImageDropFiles(dataTransfer: DataTransfer | null): File[] {
	if (dataTransfer === null) return []
	const files = new Map<string, File>()
	for (const file of Array.from(dataTransfer.files)) {
		if (codexFileLooksImage(file)) files.set(codexDropFileKey(file), file)
	}
	for (const item of Array.from(dataTransfer.items)) {
		if (item.kind !== "file") continue
		const file = item.getAsFile()
		if (file !== null && codexFileLooksImage(file)) files.set(codexDropFileKey(file), file)
	}
	return [...files.values()]
}

function codexFileLooksImage(file: File): boolean {
	if (file.type.startsWith("image/")) return true
	return /\.(?:png|jpe?g|gif|webp|heic|heif|tiff?|bmp|svg)$/i.test(file.name)
}

function codexDropFileKey(file: File): string {
	return `${file.name}:${file.size}:${file.lastModified}`
}

async function uploadCodexAttachment(file: File): Promise<CodexComposerAttachment> {
	if (!codexFileLooksImage(file)) throw new Error("можно прикрепить только изображение")
	if (file.size > CODEX_COMPOSER_MAX_ATTACHMENT_BYTES) throw new Error("изображение больше 16 MB")
	const dataBase64 = base64Bytes(new Uint8Array(await file.arrayBuffer()))
	const response = await fetch("/hud/codex/attachments", {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({
			name: file.name || "image.png",
			type: file.type || "",
			size: file.size,
			dataBase64,
		}),
	})
	const payload = await response.json().catch(() => null)
	const record = asRecord(payload)
	if (!response.ok || record?.["ok"] !== true) {
		const message = typeof record?.["error"] === "string" ? record["error"] : `upload ${response.status}`
		throw new Error(message)
	}
	const attachment = asRecord(record["attachment"])
	if (attachment === null) throw new Error("attachment response is invalid")
	const id = stringValue(attachment["id"]) ?? crypto.randomUUID()
	const name = stringValue(attachment["name"]) ?? (file.name || "image")
	const path = stringValue(attachment["path"])
	const mime = stringValue(attachment["mime"]) ?? (file.type || "image/*")
	const size = typeof attachment["size"] === "number" && Number.isFinite(attachment["size"]) ? attachment["size"] : file.size
	if (path === null) throw new Error("attachment path is missing")
	return {id, name, path, mime, size}
}

function formatAttachmentSize(size: number): string {
	if (!Number.isFinite(size) || size <= 0) return "0 B"
	if (size < 1024) return `${Math.round(size)} B`
	if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`
	return `${Math.round(size / (1024 * 102.4)) / 10} MB`
}

function codexComposerEditorHeight(composerH: number, hasFooter: boolean): number {
	const editorTop = codexComposerEditorTop()
	const footerSpace = hasFooter ? CODEX_COMPOSER_PAD + 30 : CODEX_COMPOSER_PAD
	return Math.max(82, composerH - editorTop - footerSpace)
}

function codexComposerEditorTop(): number {
	return PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap
}

function processStatusLabel(process: WorkspaceProcess): string {
	const state = process.paused ? "paused" : process.connection
	return process.modulePath === null ? state : `${state} · ${workspaceBasename(process.modulePath)}`
}

function workspaceAbsolutePath(root: string, path: string): string {
	if (path.startsWith("file://") || path.startsWith("/")) return path
	const cleanRoot = root.endsWith("/") ? root.slice(0, -1) : root
	return `${cleanRoot}/${path}`
}

function normalizeWorkspacePath(path: string): string {
	return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/")
}

function stripWorkspacePathPrefix(path: string, workspacePath: string): string {
	const normalizedPath = normalizeWorkspacePath(path)
	const normalizedWorkspace = normalizeWorkspacePath(workspacePath)
	if (normalizedWorkspace.length === 0) return normalizedPath
	if (normalizedPath === normalizedWorkspace) return ""
	const prefix = `${normalizedWorkspace}/`
	return normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : normalizedPath
}

function isWorkspaceDirectoryMarker(path: string): boolean {
	return path.trim().replaceAll("\\", "/").endsWith("/")
}

function workspaceBasename(path: string): string {
	const normalized = normalizeWorkspacePath(path)
	return normalized.split("/").filter(Boolean).pop() ?? normalized
}

function isTextWorkspacePath(path: string): boolean {
	return /\.(?:css|cts|cjs|html|js|json|jsx|md|mjs|mts|sql|ts|tsx|toml|wgsl|xml|yaml|yml)$/i.test(path)
}

function isBrowserDirectoryHandle(value: BrowserDirectoryHandle | BrowserFileHandle): value is BrowserDirectoryHandle {
	return value.kind === "directory" || "entries" in value
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError"
}

function isWorkspaceSourceMissingError(error: unknown): boolean {
	return /not found|enoent|no such file|notfounderror/i.test(errorMessage(error))
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null
}

function sameDockPlacement(left: DockPlacement, right: DockPlacement): boolean {
	return left.edge === right.edge && Math.abs(left.offset - right.offset) < 0.5
}

function interpolateRect(from: UiSurfaceRect, to: UiSurfaceRect, t: number): UiSurfaceRect {
	return {
		x: lerp(from.x, to.x, t),
		y: lerp(from.y, to.y, t),
		w: Math.max(1, lerp(from.w, to.w, t)),
		h: Math.max(1, lerp(from.h, to.h, t)),
	}
}

function projectChildRectBetweenParents(sourceParent: UiSurfaceRect, child: UiSurfaceRect, targetParent: UiSurfaceRect): UiSurfaceRect {
	const sourceW = Math.max(1, sourceParent.w)
	const sourceH = Math.max(1, sourceParent.h)
	return {
		x: targetParent.x + ((child.x - sourceParent.x) / sourceW) * targetParent.w,
		y: targetParent.y + ((child.y - sourceParent.y) / sourceH) * targetParent.h,
		w: Math.max(1, (child.w / sourceW) * targetParent.w),
		h: Math.max(1, (child.h / sourceH) * targetParent.h),
	}
}

function dockTransitionEase(t: number): number {
	const clamped = clampNumber(t, 0, 1)
	return clamped < 0.5
		? 4 * clamped * clamped * clamped
		: 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

function inferHudNodePixelScale(nodeX: number, nodeY: number, rect: UiSurfaceRect, bounds: {w: number; h: number}): number {
	const dx = rect.x - bounds.w / 2
	if (Math.abs(dx) > 0.001) return Math.abs(nodeX / dx)
	const dy = bounds.h / 2 - rect.y
	if (Math.abs(dy) > 0.001) return Math.abs(nodeY / dy)
	return 0.001
}

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t
}

function hiddenRect(): UiSurfaceRect {
	return {x: 0, y: 0, w: 1, h: 1, visible: false}
}

function clampHudPanelRect(rect: UiSurfaceRect, bounds: {w: number; h: number}, opts: {minW: number; minH: number; margin?: number}): UiSurfaceRect {
	const desiredMargin = opts.margin ?? 12
	const marginX = Math.min(desiredMargin, Math.max(0, (bounds.w - 1) / 2))
	const marginY = Math.min(desiredMargin, Math.max(0, (bounds.h - 1) / 2))
	const maxW = Math.max(1, bounds.w - marginX * 2)
	const maxH = Math.max(1, bounds.h - marginY * 2)
	const w = clampNumber(rect.w, Math.min(opts.minW, maxW), maxW)
	const h = clampNumber(rect.h, Math.min(opts.minH, maxH), maxH)
	return {
		x: clampNumber(rect.x, marginX, Math.max(marginX, bounds.w - w - marginX)),
		y: clampNumber(rect.y, marginY, Math.max(marginY, bounds.h - h - marginY)),
		w,
		h,
	}
}

function pointInUiRect(x: number, y: number, rect: UiSurfaceRect): boolean {
	if (rect.visible === false) return false
	return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

function voiceStatusLine(status: VoiceInputStatus): string {
	if (status === "connecting") return "подключение голоса"
	if (status === "waitingWake") return "жду wake-up"
	if (status === "listening") return "диктовка активна"
	if (status === "committing") return "распознавание"
	if (status === "error") return "ошибка голоса"
	return "микрофон выключен"
}

function voiceReadableDetail(detail: string): string {
	const text = detail.trim()
	if (!text) return ""
	if (/websocket failed|websocket closed|failed to construct/i.test(text)) return `ASR недоступен: ${voiceSocketErrorEndpoint(text) ?? endpointLabel(readVoiceInputUrl())}`
	if (/permission denied|notallowederror|not allowed/i.test(text)) return "нет доступа к микрофону"
	if (/notfounderror|not found|device not found/i.test(text)) return "микрофон не найден"
	if (/commit timeout/i.test(text)) return "таймаут распознавания фрагмента"
	if (text === VOICE_STOP_COMMAND_DETAIL) return "остановлено голосовой командой"
	return text
}

function voiceSocketErrorEndpoint(text: string): string | null {
	const match = text.match(/wss?:\/\/\S+/i)
	if (match === null) return null
	return endpointLabel(match[0]!)
}

function debugVoiceText(text: string): string {
	const cleaned = cleanupVoiceInputText(text)
	if (cleaned.length === 0) return "-"
	return cleaned.length <= 74 ? cleaned : `${cleaned.slice(0, 71)}...`
}

function formatDebugBytes(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0b"
	if (value < 1024) return `${Math.round(value)}b`
	return `${Math.round(value / 1024)}kb`
}

function formatDebugPercent(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0%"
	return `${Math.round(value * 100)}%`
}

function formatDebugTime(date: Date | null): string {
	return date === null ? "-" : formatTime(date)
}

function voiceSignalForStatusChange(previousStatus: VoiceInputStatus, nextStatus: VoiceInputStatus, detail?: string): HudNotificationKind | null {
	if (nextStatus === "listening" && previousStatus !== "listening" && previousStatus !== "committing") return "activation"
	if (nextStatus === "error") return "error"
	if (nextStatus === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
	if (nextStatus === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) return "stop"
	if (nextStatus === "idle" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
	return null
}

function voiceHudDeactivationMode(mode: VoiceDeactivationMode): VoiceInputHudDeactivationMode {
	if (mode === "timeout") return "timeout"
	if (mode === "phrase") return "phrase"
	return "phrase-timeout"
}

function installHudNotificationSoundUnlock(): void {
	if (hudNotificationSoundUnlockInstalled) return
	hudNotificationSoundUnlockInstalled = true
	const unlock = (): void => {
		primeHudNotificationAudioElements()
		primeHudNotificationAudioContext()
	}
	window.addEventListener("pointerdown", unlock, {capture: true})
	window.addEventListener("pointerup", unlock, {capture: true})
	window.addEventListener("keydown", unlock, {capture: true})
	window.addEventListener("keyup", unlock, {capture: true})
	window.addEventListener("mouseup", unlock, {capture: true})
	window.addEventListener("click", unlock, {capture: true})
	window.addEventListener("touchstart", unlock, {capture: true})
	window.addEventListener("touchend", unlock, {capture: true})
}

function playHudNotificationSound(kind: HudNotificationKind, voiceClient: VoiceInputClient | null): void {
	if (kind === "agent" && !readHostTerminalAgentSoundEnabled()) {
		recordHudNotificationSound(kind, "disabled")
		return
	}
	const rawVolume = hudNotificationVolume(kind)
	const volume = rawVolume
	if (volume <= 0) {
		recordHudNotificationSound(kind, "muted")
		return
	}
	if (kind !== "agent" && kind !== "error") {
		const signalKind: VoiceInputSignalTone = kind
		playBrowserHudNotificationSound(kind, volume, () => {
			playVoiceSignalToneWithFallback(signalKind, volume, voiceClient, () => {
				recordHudNotificationSound(kind, "blocked")
			})
		})
		return
	}
	playBrowserHudNotificationSound(kind, volume)
}

function playVoiceSignalToneWithFallback(
	kind: VoiceInputSignalTone,
	volume: number,
	voiceClient: VoiceInputClient | null,
	onFallback: () => void,
): void {
	let settled = false
	const fallback = (): void => {
		if (settled) return
		settled = true
		onFallback()
	}
	const captureStarted = playVoiceCaptureSignalTone(kind, volume, voiceClient, (played) => {
		if (played) {
			settled = true
			return
		}
		fallback()
	})
	if (!captureStarted) {
		fallback()
		return
	}
	window.setTimeout(fallback, VOICE_SIGNAL_CAPTURE_FALLBACK_MS)
}

function playVoiceCaptureSignalTone(
	kind: VoiceInputSignalTone,
	volume: number,
	voiceClient: VoiceInputClient | null,
	onResult?: (played: boolean) => void,
): boolean {
	return voiceClient?.playSignalTone(kind, volume, (playedKind, method, error) => {
		recordHudNotificationSound(playedKind, method, error)
		onResult?.(!hudNotificationSoundResultFailed(method))
	}) === true
}

function hudNotificationVolume(kind: HudNotificationKind): number {
	return kind === "agent" ? readHostTerminalAgentSoundVolume() : readVoiceSignalVolume()
}

function hudNotificationSoundResultFailed(method: string): boolean {
	return /blocked|failed|timeout|context|closed/i.test(method)
}

function playBrowserHudNotificationSound(kind: HudNotificationKind, volume: number, onBlocked?: () => void): void {
	let fallbackUsed = false
	const playHtmlFallback = (reason: string): void => {
		if (fallbackUsed) return
		fallbackUsed = true
		playHudNotificationHtmlAudio(kind, reason, volume, onBlocked)
	}
	if (playHudNotificationWebAudioTone(kind, volume, playHtmlFallback)) return
	playHudNotificationHtmlAudio(kind, "no webaudio", volume, onBlocked)
}

function ensureHudNotificationAudioContext(): AudioContext | null {
	if (hudNotificationAudioContext !== null) return hudNotificationAudioContext
	try {
		hudNotificationAudioContext = new AudioContext()
		return hudNotificationAudioContext
	} catch {
		return null
	}
}

function playHudNotificationWebAudioTone(kind: HudNotificationKind, volume: number, onError?: (reason: string) => void): boolean {
	const context = ensureHudNotificationAudioContext()
	if (context === null) return false
	const play = (): void => {
		const start = context.currentTime + 0.005
		const spec = hudNotificationTone(kind)
		const end = start + spec.duration
		const gain = context.createGain()
		const tone = context.createOscillator()
		tone.type = spec.type
		tone.frequency.setValueAtTime(spec.startHz, start)
		tone.frequency.exponentialRampToValueAtTime(spec.endHz, end)
		const peakGain = spec.gain * clampNumber(volume, 0, MAX_VOICE_SIGNAL_VOLUME)
		gain.gain.setValueAtTime(0.0001, start)
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), start + 0.018)
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.42), start + spec.duration * 0.45)
		gain.gain.exponentialRampToValueAtTime(0.0001, end)
		tone.connect(gain)
		gain.connect(context.destination)
		tone.start(start)
		tone.stop(end + 0.03)
		tone.addEventListener("ended", () => {
			tone.disconnect()
			gain.disconnect()
		}, {once: true})
		recordHudNotificationSound(kind, `webaudio · ${context.state}`)
	}
	if (context.state === "suspended") {
		let settled = false
		const fallbackTimer = window.setTimeout(() => {
			if (settled) return
			settled = true
			onError?.("resume timeout")
		}, 180)
		void context.resume()
			.then(() => {
				if (settled) return
				settled = true
				window.clearTimeout(fallbackTimer)
				if (context.state !== "running") {
					onError?.(`context ${context.state}`)
					return
				}
				play()
			})
			.catch((error) => {
				if (settled) return
				settled = true
				window.clearTimeout(fallbackTimer)
				recordHudNotificationSound(kind, "webaudio blocked", error)
				onError?.("resume blocked")
			})
		return true
	}
	play()
	return true
}

function playHudNotificationHtmlAudio(kind: HudNotificationKind, reason = "fallback", volume = hudNotificationVolume(kind), onBlocked?: () => void): void {
	const audio = ensureHudNotificationAudioElement(kind)
	if (audio !== null) {
		try {
			audio.pause()
			audio.currentTime = 0
		} catch {
			// Some browsers reject seeking before media metadata is ready.
		}
		audio.muted = false
		audio.volume = htmlNotificationVolume(volume)
		void audio.play()
			.then(() => recordHudNotificationSound(kind, `html · ${reason}`))
			.catch((error) => {
				recordHudNotificationSound(kind, "html blocked", error)
				onBlocked?.()
			})
		return
	}
	recordHudNotificationSound(kind, "html unavailable", reason)
	onBlocked?.()
}

function ensureHudNotificationAudioElement(kind: HudNotificationKind): HTMLAudioElement | null {
	const cached = hudNotificationAudioElements.get(kind)
	if (cached !== undefined) return cached
	try {
		const audio = new Audio(hudNotificationWavDataUrl(kind))
		audio.preload = "auto"
		audio.volume = htmlNotificationVolume(hudNotificationVolume(kind))
		hudNotificationAudioElements.set(kind, audio)
		return audio
	} catch {
		return null
	}
}

function primeHudNotificationAudioElements(): void {
	for (const kind of hudNotificationKinds()) primeHudNotificationAudioElement(kind)
}

function primeHudNotificationAudioElement(kind: HudNotificationKind): void {
	const audio = ensureHudNotificationAudioElement(kind)
	if (audio === null) return
	const restore = (): void => {
		try {
			audio.pause()
			audio.currentTime = 0
		} catch {
			// Best-effort unlock.
		}
		audio.muted = false
		audio.volume = htmlNotificationVolume(hudNotificationVolume(kind))
	}
	audio.muted = true
	audio.volume = 0
	try {
		audio.currentTime = 0
	} catch {
		// Best-effort unlock; restore handles state after the play attempt.
	}
	void audio.play().then(restore).catch(restore)
}

function primeHudNotificationAudioContext(): void {
	const context = ensureHudNotificationAudioContext()
	if (context === null) return
	const prime = (): void => {
		try {
			const source = context.createBufferSource()
			source.buffer = context.createBuffer(1, 1, context.sampleRate)
			source.connect(context.destination)
			source.start()
			source.addEventListener("ended", () => source.disconnect(), {once: true})
		} catch {
			// Audio unlock is best-effort; actual playback has the HTMLAudio fallback.
		}
	}
	if (context.state === "suspended") {
		void context.resume().then(prime).catch(() => undefined)
		return
	}
	prime()
}

function syncHudNotificationAudioVolume(kind: HudNotificationKind): void {
	const audio = hudNotificationAudioElements.get(kind)
	if (audio === undefined) return
	audio.volume = htmlNotificationVolume(hudNotificationVolume(kind))
}

function htmlNotificationVolume(volume: number): number {
	return Math.min(1, clampNumber(volume, 0, MAX_VOICE_SIGNAL_VOLUME) * 0.9)
}

function hudNotificationKinds(): HudNotificationKind[] {
	return ["activation", "deactivation", "stop", "error", "agent"]
}

function hudNotificationTone(kind: HudNotificationKind): {
	startHz: number
	endHz: number
	duration: number
	gain: number
	type: OscillatorType
} {
	if (kind === "activation") return {startHz: 640, endHz: 960, duration: 0.24, gain: 0.34, type: "triangle"}
	if (kind === "deactivation") return {startHz: 740, endHz: 430, duration: 0.22, gain: 0.32, type: "sine"}
	if (kind === "stop") return {startHz: 360, endHz: 210, duration: 0.34, gain: 0.38, type: "square"}
	if (kind === "error") return {startHz: 880, endHz: 220, duration: 0.38, gain: 0.42, type: "square"}
	return {startHz: 520, endHz: 520, duration: 0.12, gain: 0.22, type: "sine"}
}

function hudNotificationWavDataUrl(kind: HudNotificationKind): string {
	const sampleRate = 44_100
	const tone = hudNotificationTone(kind)
	const sampleCount = Math.floor(sampleRate * tone.duration)
	const bytes = new Uint8Array(44 + sampleCount * 2)
	const view = new DataView(bytes.buffer)
	writeAscii(bytes, 0, "RIFF")
	view.setUint32(4, 36 + sampleCount * 2, true)
	writeAscii(bytes, 8, "WAVE")
	writeAscii(bytes, 12, "fmt ")
	view.setUint32(16, 16, true)
	view.setUint16(20, 1, true)
	view.setUint16(22, 1, true)
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * 2, true)
	view.setUint16(32, 2, true)
	view.setUint16(34, 16, true)
	writeAscii(bytes, 36, "data")
	view.setUint32(40, sampleCount * 2, true)
	let phase = 0
	for (let index = 0; index < sampleCount; index += 1) {
		const t = index / sampleRate
		const progress = t / tone.duration
		const frequency = tone.startHz * Math.pow(tone.endHz / tone.startHz, progress)
		const attack = Math.min(1, t / 0.025)
		const release = Math.min(1, Math.max(0, (tone.duration - t) / 0.09))
		const envelope = Math.sin(Math.min(1, progress) * Math.PI) * Math.min(attack, release)
		const wave = tone.type === "square" ? Math.sign(Math.sin(phase)) : Math.sin(phase)
		const sample = wave * envelope * Math.min(0.95, tone.gain + 0.44)
		phase += (Math.PI * 2 * frequency) / sampleRate
		view.setInt16(44 + index * 2, Math.round(sample * 32767), true)
	}
	return `data:audio/wav;base64,${base64Bytes(bytes)}`
}

function recordHudNotificationSound(kind: HudNotificationKind, method: string, error?: unknown): void {
	hudNotificationLastAt = new Date()
	const errorText = error instanceof Error ? error.message : typeof error === "string" ? error : ""
	hudNotificationLastLine = [kind, method, errorText].filter(Boolean).join(" · ")
}

function hudNotificationDebugLine(): string {
	if (!hudNotificationLastLine) return "-"
	return `${formatTime(hudNotificationLastAt ?? new Date())} · ${hudNotificationLastLine}`
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
	for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index)
}

function base64Bytes(bytes: Uint8Array): string {
	let binary = ""
	const chunkSize = 0x8000
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		const chunk = bytes.subarray(offset, offset + chunkSize)
		binary += String.fromCharCode(...chunk)
	}
	return btoa(binary)
}

function readVoiceInputUrl(): string {
	return readVoiceEndpointUrl(VOICE_INPUT_URL_STORAGE_KEY, DEFAULT_VOICE_INPUT_URL, "8787")
}

function readVoiceWakeUrl(): string {
	return readVoiceEndpointUrl(VOICE_WAKE_URL_STORAGE_KEY, DEFAULT_VOICE_WAKE_URL, "4765")
}

function readVoiceEndpointUrl(key: string, fallback: string, legacyLoopbackPort: string): string {
	const stored = readStoredString(key)
	if (stored === null) return fallback
	return isLegacyLoopbackVoiceUrl(stored, legacyLoopbackPort) ? fallback : stored
}

function isLegacyLoopbackVoiceUrl(raw: string, port: string): boolean {
	try {
		const url = new URL(raw, location.href)
		return (url.protocol === "ws:" || url.protocol === "wss:")
			&& (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1" || url.hostname === "[::1]")
			&& url.port === port
			&& url.pathname === "/ws"
	} catch {
		return false
	}
}

function readVoiceInputContext(): string {
	return readStoredString(VOICE_INPUT_CONTEXT_STORAGE_KEY) ?? ""
}

function voiceContextWithTerminal(_terminalText: string): string {
	return [sanitizeVoicePromptContext(readVoiceInputContext())]
		.map((item) => item.trim())
		.filter(Boolean)
		.join("\n\n")
		.slice(-2000)
}

function sanitizeVoicePromptContext(text: string): string {
	return text
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, " ")
		.replace(/[\u2500-\u257F]+/g, " ")
		.replace(/[-_=]{6,}/g, " ")
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => /[\p{L}\p{N}]/u.test(line))
		.join("\n")
}

function readCodexVoiceAutoSendEnabled(): boolean {
	const raw = readStoredString(CODEX_VOICE_AUTO_SEND_STORAGE_KEY) ?? readStoredString(VOICE_AUTO_SEND_STORAGE_KEY)
	if (raw === "true" || raw === "1") return true
	if (raw === "false" || raw === "0") return false
	return DEFAULT_VOICE_AUTO_SEND_ENABLED
}

function readCodexVoiceP2PEnabled(): boolean {
	if (!CODEX_VOICE_P2P_SERVER_AVAILABLE) return false
	return readStoredBoolean(CODEX_VOICE_P2P_STORAGE_KEY, DEFAULT_CODEX_VOICE_P2P_ENABLED)
}

function writeCodexVoiceAutoSendEnabled(enabled: boolean): void {
	writeStoredBoolean(CODEX_VOICE_AUTO_SEND_STORAGE_KEY, enabled)
	writeStoredBoolean(VOICE_AUTO_SEND_STORAGE_KEY, enabled)
	syncInterpreterVoiceSettings({[VOICE_AUTO_SEND_STORAGE_KEY]: enabled ? "1" : "0"})
}

function readVoiceSignalVolume(): number {
	try {
		const raw = localStorage.getItem(VOICE_SIGNAL_VOLUME_STORAGE_KEY)
		if (raw === null) {
			const legacy = readLegacyVoiceSignalVolume()
			return legacy === null ? DEFAULT_VOICE_SIGNAL_VOLUME : clampVoiceSignalVolume(legacy * MAX_VOICE_SIGNAL_VOLUME)
		}
		const value = Number(raw)
		return Number.isFinite(value) ? clampVoiceSignalVolume(value) : DEFAULT_VOICE_SIGNAL_VOLUME
	} catch {
		return DEFAULT_VOICE_SIGNAL_VOLUME
	}
}

function readLegacyVoiceSignalVolume(): number | null {
	try {
		const raw = localStorage.getItem(VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY)
		if (raw === null) return null
		const value = Number(raw)
		return Number.isFinite(value) ? clampNumber(value, 0, 1) : null
	} catch {
		return null
	}
}

function writeVoiceSignalVolume(value: number): void {
	const next = String(clampVoiceSignalVolume(value))
	try {
		localStorage.setItem(VOICE_SIGNAL_VOLUME_STORAGE_KEY, next)
	} catch {
		// Storage can be disabled.
	}
	syncHudNotificationAudioVolume("activation")
	syncHudNotificationAudioVolume("deactivation")
	syncHudNotificationAudioVolume("stop")
	syncInterpreterVoiceSettings({[VOICE_SIGNAL_VOLUME_STORAGE_KEY]: next})
}

function clampVoiceSignalVolume(value: number): number {
	return clampNumber(value, 0, MAX_VOICE_SIGNAL_VOLUME)
}

function readHostTerminalAgentSoundEnabled(): boolean {
	try {
		const raw = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY)
		if (raw === null) return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
		return raw !== "0" && raw !== "false"
	} catch {
		return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
	}
}

function writeHostTerminalAgentSoundEnabled(enabled: boolean): void {
	const next = enabled ? "1" : "0"
	try {
		localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY, next)
	} catch {
		// Storage can be disabled.
	}
	syncInterpreterVoiceSettings({[HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY]: next})
}

function readHostTerminalAgentSoundVolume(): number {
	try {
		const raw = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY)
		if (raw === null) {
			const legacy = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY)
			if (legacy === null) return DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
			const legacyValue = Number(legacy)
			return Number.isFinite(legacyValue) ? clampHostTerminalAgentSoundVolume(legacyValue) : DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
		}
		const value = Number(raw)
		return Number.isFinite(value) ? clampHostTerminalAgentSoundVolume(value) : DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
	} catch {
		return DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME
	}
}

function writeHostTerminalAgentSoundVolume(value: number): void {
	const next = String(clampHostTerminalAgentSoundVolume(value))
	try {
		localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY, next)
	} catch {
		// Storage can be disabled.
	}
	syncHudNotificationAudioVolume("agent")
	syncInterpreterVoiceSettings({[HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY]: next})
}

function clampHostTerminalAgentSoundVolume(value: number): number {
	return clampNumber(value, 0, MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME)
}

function readVoiceDeactivationMode(): VoiceDeactivationMode {
	const raw = readStoredString(VOICE_DEACTIVATION_MODE_STORAGE_KEY)
	if (raw === "phrase" || raw === "timeout" || raw === "phrase-timeout") return raw
	return DEFAULT_VOICE_DEACTIVATION_MODE
}

function writeVoiceDeactivationMode(value: VoiceInputHudDeactivationMode): void {
	writeStoredString(VOICE_DEACTIVATION_MODE_STORAGE_KEY, value)
	syncInterpreterVoiceSettings({[VOICE_DEACTIVATION_MODE_STORAGE_KEY]: value})
}

function readVoiceRecognitionTimeoutSeconds(): number {
	return clampVoiceRecognitionTimeoutSeconds(readStoredNumber(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY, DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS))
}

function writeVoiceRecognitionTimeoutSeconds(value: number): void {
	const next = String(clampVoiceRecognitionTimeoutSeconds(value))
	writeStoredString(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY, next)
	syncInterpreterVoiceSettings({[VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY]: next})
}

function clampVoiceRecognitionTimeoutSeconds(value: number): number {
	return Math.round(clampNumber(value, MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS, MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS))
}

function voicePhraseGroups(wakeLines: string[]) {
	return [
		{
			id: "activation" as const,
			title: "Активация",
			description: "Запускает диктовку.",
			whenLine: "Когда: микрофон ждет wake-up фразу.",
			effectLine: "Что происходит: включается ASR-диктовка.",
			phrases: readVoicePhrases("activation"),
			addLabel: "Добавить",
			placeholder: "Фраза активации",
			resetLabel: "Сброс",
			fuzzyLabel: "Допустимая ошибка",
			fuzzyValue: readVoiceFuzzyTolerance("activation"),
			receivedLabel: "Wake-up получает",
			receivedLines: wakeLines.length > 0 ? wakeLines : ["пока нет данных"],
		},
		{
			id: "deactivation" as const,
			title: "Деактивация",
			description: "Гасит диктовку, wake-up остается.",
			whenLine: "Когда: диктовка уже активна.",
			effectLine: "Что происходит: ASR гаснет, wake-up остается.",
			phrases: readVoicePhrases("deactivation"),
			addLabel: "Добавить",
			placeholder: "Фраза деактивации",
			resetLabel: "Сброс",
			fuzzyLabel: "Допустимая ошибка",
			fuzzyValue: readVoiceFuzzyTolerance("deactivation"),
		},
		{
			id: "stop" as const,
			title: "Остановка",
			description: "Полностью выключает голос.",
			whenLine: "Когда: нужно полностью выключить голос.",
			effectLine: "Что происходит: ASR, wake-up и микрофон закрываются.",
			phrases: readVoicePhrases("stop"),
			addLabel: "Добавить",
			placeholder: "Фраза остановки",
			resetLabel: "Сброс",
			fuzzyLabel: "Допустимая ошибка",
			fuzzyValue: readVoiceFuzzyTolerance("stop"),
		},
	]
}

function readVoicePhrases(groupId: VoiceInputHudPhraseGroupId): string[] {
	try {
		const raw = readVoicePhraseStorage(groupId)
		if (raw !== null) {
			const parsed = JSON.parse(raw) as unknown
			if (Array.isArray(parsed)) {
				const phrases = normalizeVoicePhrases(parsed.map((item) => String(item)))
				if (phrases.length > 0) return phrases
			}
		}
	} catch {
		// Storage can be disabled or manually edited.
	}
	return [...defaultVoicePhrases(groupId)]
}

function readVoicePhraseStorage(groupId: VoiceInputHudPhraseGroupId): string | null {
	const raw = localStorage.getItem(voicePhraseStorageKey(groupId))
	if (raw !== null || groupId !== "activation") return raw
	return localStorage.getItem(VOICE_WAKE_PHRASES_STORAGE_KEY)
}

function storeVoicePhrases(groupId: VoiceInputHudPhraseGroupId, phrases: readonly string[]): void {
	const normalized = normalizeVoicePhrases(phrases)
	const next = normalized.length > 0 ? normalized : [...defaultVoicePhrases(groupId)]
	const key = voicePhraseStorageKey(groupId)
	const raw = JSON.stringify(next)
	writeStoredString(key, raw)
	syncInterpreterVoiceSettings({[key]: raw})
}

function defaultVoicePhrases(groupId: VoiceInputHudPhraseGroupId): readonly string[] {
	if (groupId === "activation") return DEFAULT_VOICE_ACTIVATION_PHRASES
	if (groupId === "deactivation") return DEFAULT_VOICE_DEACTIVATION_PHRASES
	return DEFAULT_VOICE_STOP_PHRASES
}

function voicePhraseStorageKey(groupId: VoiceInputHudPhraseGroupId): string {
	if (groupId === "activation") return VOICE_ACTIVATION_PHRASES_STORAGE_KEY
	if (groupId === "deactivation") return VOICE_DEACTIVATION_PHRASES_STORAGE_KEY
	return VOICE_STOP_PHRASES_STORAGE_KEY
}

function voicePhraseKey(phrase: string): string | undefined {
	const normalized = normalizeVoicePhrases([phrase])[0]
	if (normalized === undefined) return undefined
	return normalized.toLocaleLowerCase("ru-RU").replace(/ё/g, "е")
}

function readVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId): number {
	try {
		const raw = localStorage.getItem(voiceFuzzyStorageKey(groupId))
		if (raw === null) return defaultVoiceFuzzyTolerance(groupId)
		const value = Number(raw)
		return Number.isFinite(value) ? clampVoiceFuzzyTolerance(value) : defaultVoiceFuzzyTolerance(groupId)
	} catch {
		return defaultVoiceFuzzyTolerance(groupId)
	}
}

function writeVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId, value: number): void {
	const key = voiceFuzzyStorageKey(groupId)
	const next = String(clampVoiceFuzzyTolerance(value))
	try {
		localStorage.setItem(key, next)
	} catch {
		// Storage can be disabled.
	}
	syncInterpreterVoiceSettings({[key]: next})
}

function voiceFuzzyStorageKey(groupId: VoiceInputHudPhraseGroupId): string {
	if (groupId === "activation") return VOICE_ACTIVATION_FUZZY_STORAGE_KEY
	if (groupId === "deactivation") return VOICE_DEACTIVATION_FUZZY_STORAGE_KEY
	return VOICE_STOP_FUZZY_STORAGE_KEY
}

function defaultVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId): number {
	if (groupId === "activation") return DEFAULT_VOICE_ACTIVATION_FUZZY
	if (groupId === "deactivation") return DEFAULT_VOICE_DEACTIVATION_FUZZY
	return DEFAULT_VOICE_STOP_FUZZY
}

function clampVoiceFuzzyTolerance(value: number): number {
	return clampNumber(value, 0, 0.5)
}

function shouldFlushVoiceBufferForStatus(previousStatus: VoiceInputStatus, status: VoiceInputStatus): boolean {
	if (status === "idle") return true
	if (status === "listening" && previousStatus === "committing") return true
	if (status === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) return true
	return false
}

function shouldPreserveVoicePartialForStatus(previousStatus: VoiceInputStatus, status: VoiceInputStatus, detail?: string): boolean {
	if (previousStatus !== "listening" && previousStatus !== "committing") return false
	if (status === "error") return isVoiceConnectionLossDetail(detail)
	return status === "waitingWake" && isVoiceConnectionLossDetail(detail)
}

function voiceStatusNeedsRenderHold(status: VoiceInputStatus): boolean {
	return status === "connecting" || status === "listening" || status === "committing"
}

function isVoiceConnectionLossDetail(detail: string | undefined): boolean {
	if (detail === undefined || detail.length === 0) return false
	return /websocket|socket|closed|failed|asr|недоступ|закрыт/i.test(detail)
}

function isVoiceServiceErrorText(text: string): boolean {
	return /ASR недоступен|ASR unavailable|websocket failed|websocket closed/i.test(text)
}

function voiceMessagesFromChunk(chunk: VoiceInputChunk): string[] {
	if (chunk.messages.length > 1) return chunk.messages.map(cleanupVoiceInputText).filter(Boolean)

	const byPause = voiceMessagesFromSegments(chunk.segments)
	if (byPause.length > 1) return byPause

	const source = chunk.messages[0] ?? chunk.text
	const byParagraph = splitVoiceParagraphs(source)
	return byParagraph.length > 0 ? byParagraph : byPause
}

function voiceMessagesFromSegments(segments: VoiceInputSegment[]): string[] {
	const messages: string[] = []
	let current = ""
	let lastEnd: number | null = null

	for (const segment of segments) {
		const text = cleanupVoiceInputText(segment.text ?? "")
		if (!text) continue

		const start = segment.start
		const end = segment.end
		const hasPause =
			current.length > 0 &&
			typeof start === "number" &&
			typeof lastEnd === "number" &&
			start - lastEnd >= VOICE_MESSAGE_PAUSE_SECONDS

		if (hasPause) {
			messages.push(current)
			current = text
		} else {
			current = current ? `${current} ${text}` : text
		}

		if (typeof end === "number") lastEnd = end
	}

	if (current) messages.push(current)
	return messages
}

function splitVoiceParagraphs(text: string): string[] {
	return String(text)
		.replace(/\r\n?/g, "\n")
		.split(/\n\s*\n+/)
		.map(cleanupVoiceInputText)
		.filter(Boolean)
}

function sanitizeCodexTerminalVoiceInput(text: string): string {
	return cleanupVoiceInputText(text)
		.replace(/\x1b\[201~/g, "")
		.replace(/\x1b/g, "")
}

function cleanupVoiceInputText(text: string): string {
	const cleaned = cleanupVoiceText(text).replace(/\s+/g, " ").trim()
	return voiceTextHasContent(cleaned) ? cleaned : ""
}

function voiceTextHasContent(text: string): boolean {
	return /[\p{L}\p{N}]/u.test(text)
}

function mergeVoiceInputText(base: string, addition: string): string {
	const left = cleanupVoiceInputText(base)
	const right = cleanupVoiceInputText(addition)
	if (!left) return right
	if (!right) return left
	const leftKey = voiceInputCompareKey(left)
	const rightKey = voiceInputCompareKey(right)
	if (!rightKey || leftKey === rightKey || leftKey.endsWith(` ${rightKey}`)) return left
	if (rightKey.startsWith(`${leftKey} `)) return right
	return cleanupVoiceInputText(`${left} ${right}`)
}

function voiceInputCompareKey(text: string): string {
	return cleanupVoiceInputText(text)
		.toLocaleLowerCase("ru-RU")
		.replace(/ё/g, "е")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
}

function asVoiceSettingsValues(value: unknown): Partial<Record<typeof VOICE_SETTINGS_STORAGE_KEYS[number], string>> | null {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null
	const next: Partial<Record<typeof VOICE_SETTINGS_STORAGE_KEYS[number], string>> = {}
	for (const [key, item] of Object.entries(value)) {
		if (isVoiceSettingsStorageKey(key) && typeof item === "string") next[key] = item
	}
	return next
}

function syncInterpreterVoiceSettings(values: Record<string, string | null>): void {
	const next: Record<string, string | null> = {}
	for (const [key, value] of Object.entries(values)) {
		if (!isVoiceSettingsStorageKey(key)) continue
		next[key] = value
	}
	if (Object.keys(next).length === 0) return
	void fetch("/hud/voice/settings", {
		method: "POST",
		headers: {"content-type": "application/json"},
		body: JSON.stringify({values: next}),
	}).catch(() => undefined)
}

function isVoiceSettingsStorageKey(key: string): key is typeof VOICE_SETTINGS_STORAGE_KEYS[number] {
	return (VOICE_SETTINGS_STORAGE_KEYS as readonly string[]).includes(key)
}

function endpointLabel(raw: string): string {
	try {
		const url = new URL(raw, location.href)
		const port = url.port || (url.protocol === "wss:" || url.protocol === "https:" ? "443" : "80")
		return `${url.hostname}:${port}`
	} catch {
		return raw
	}
}

function probeVoiceService(rawUrl: string): Promise<Record<string, unknown> | null> {
	return new Promise((resolve, reject) => {
		let settled = false
		let openFallback: number | null = null
		const ws = new WebSocket(voiceInputWebSocketUrl(rawUrl))
		const timeout = window.setTimeout(() => finish(null, new Error("timeout")), VOICE_SERVICE_CHECK_TIMEOUT_MS)

		const finish = (data: Record<string, unknown> | null, error?: Error): void => {
			if (settled) return
			settled = true
			window.clearTimeout(timeout)
			if (openFallback !== null) window.clearTimeout(openFallback)
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
			if (error !== undefined) reject(error)
			else resolve(data)
		}

		ws.addEventListener("open", () => {
			openFallback = window.setTimeout(() => finish(null), 350)
		})
		ws.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return
			try {
				const msg = JSON.parse(event.data) as {type?: string; config?: unknown}
				if (msg.type === "ready") {
					finish(typeof msg.config === "object" && msg.config !== null ? msg.config as Record<string, unknown> : null)
				}
			} catch {
				finish(null)
			}
		})
		ws.addEventListener("error", () => finish(null, new Error("websocket failed")))
		ws.addEventListener("close", () => finish(null, new Error("websocket closed")))
	})
}

function formatTime(date: Date): string {
	return date.toLocaleTimeString("ru-RU", {hour12: false})
}

function readStoredTodoPanelState(): ToDoPanePanelStateSnapshot {
	return readStoredObject(TODO_PANEL_STATE_STORAGE_KEY, {highlightedIds: [], expandedCompletedIds: []})
}

function readStoredDockPlacement(key: string): DockPlacement | null {
	try {
		const raw = localStorage.getItem(key)
		if (raw === null) return null
		const value = JSON.parse(raw) as Partial<DockPlacement>
		if (!isDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
		return {edge: value.edge, offset: value.offset}
	} catch {
		return null
	}
}

function writeStoredDockPlacement(key: string, placement: DockPlacement): void {
	writeStoredJson(key, placement)
}

function isDockEdge(value: unknown): value is HudSideTabEdge {
	return value === "left" || value === "right" || value === "top" || value === "bottom"
}

function readStoredRect(key: string): UiSurfaceRect | null {
	const value = readStoredObject<Partial<UiSurfaceRect>>(key)
	const x = value.x
	const y = value.y
	const w = value.w
	const h = value.h
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) return null
	return {x: x as number, y: y as number, w: w as number, h: h as number}
}

function writeStoredRect(key: string, rect: UiSurfaceRect): void {
	writeStoredJson(key, {x: rect.x, y: rect.y, w: rect.w, h: rect.h})
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
	try {
		const raw = localStorage.getItem(key)
		if (raw === "true" || raw === "1") return true
		if (raw === "false" || raw === "0") return false
	} catch {
		return fallback
	}
	return fallback
}

function writeStoredBoolean(key: string, value: boolean): void {
	try {
		localStorage.setItem(key, value ? "1" : "0")
	} catch {
		// Storage can be disabled.
	}
}

function readStoredNumber(key: string, fallback: number): number {
	try {
		const value = Number(localStorage.getItem(key))
		return Number.isFinite(value) ? value : fallback
	} catch {
		return fallback
	}
}

function writeStoredNumber(key: string, value: number): void {
	try {
		localStorage.setItem(key, String(value))
	} catch {
		// Storage can be disabled.
	}
}

function readStoredString(key: string): string | null {
	try {
		const value = localStorage.getItem(key)
		return value && value.length > 0 ? value : null
	} catch {
		return null
	}
}

function writeStoredString(key: string, value: string): void {
	try {
		localStorage.setItem(key, value)
	} catch {
		// Storage can be disabled.
	}
}

function readStoredObject<T extends object>(key: string, fallback: T): T
function readStoredObject<T extends object>(key: string): Partial<T>
function readStoredObject<T extends object>(key: string, fallback?: T): T | Partial<T> {
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return fallback ?? {}
		const value = JSON.parse(raw)
		if (typeof value === "object" && value !== null) return value as T
	} catch {
		return fallback ?? {}
	}
	return fallback ?? {}
}

function writeStoredJson(key: string, value: unknown): void {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Storage can be disabled.
	}
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}
