import type {BulkViewportController, BulkViewportStats} from "bulk/web"
import {Color} from "@metafor/engine"
import {
	UiSurface,
	Z,
	div,
	palette,
	radii,
	uiIcons,
	type DivScrollContext,
	type UiSurfaceRect,
} from "@ui/elements"
import {
	Button,
	IconButton,
	Switcher,
	TextField,
	VoiceInputHud,
	focusTextField,
	type VoiceInputHudDeactivationMode,
	type VoiceInputHudPhraseGroupId,
	type VoiceInputHudServiceState,
} from "@ui/components"
import {HudSideTab, type HudSideTabEdge} from "@ui/hud"
import {
	AndroidPane,
	EditorPane,
	FileListPane,
	TerminalPane,
	ToDoPane,
	PANE_FRAME,
	beginPaneFrameDrag,
	paneBodyRect,
	paneFrameCursor,
	paneFrameDragRect,
	paneFrameHit,
	paneHeaderRuleRect,
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
	type VoiceDeactivationMode,
	type VoiceInputChunk,
	type VoiceInputSegment,
	type VoiceInputSignalTone,
	type VoiceInputStatus,
} from "../../pkg/interpreter/web/voice-input.ts"
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

export type AppWebHudSettingsSnapshot = {
	layoutSettings: Partial<AppWebLayoutSettings>
	renderSettings: Partial<AppWebRenderSettings>
}

export type AppWebHudOptions = {
	viewport: BulkViewportController
	initialSrc: string
	initialSettings: AppWebHudSettingsSnapshot
	onApply(src: string, settings: AppWebHudSettingsSnapshot): void
	onRenderSettingsChange(settings: Partial<AppWebRenderSettings>): void
	onSettingsPersist(settings: AppWebHudSettingsSnapshot): void
	onVoiceDictationActiveChange(active: boolean): void
}

export type AppWebHudController = {
	currentSrc(): string
	settingsSnapshot(): AppWebHudSettingsSnapshot
	sendAndroidControl(command: AndroidRtcCommand): boolean
	setBusy(busy: boolean): void
	setConnectionStatus(online: boolean): void
	setStats(stats: BulkViewportStats): void
	setTodoMarkdown(text: string, path: string): void
}

type DockKind = "codex" | "settings" | "todo" | "android" | "workspace" | "fullscreen"
type DockPanelKind = Exclude<DockKind, "fullscreen">
type SettingsTab = "scene" | "geometry" | "render" | "voice"

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
	sourceUrl?: string
	sourceKind: "local" | "process"
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

const STORAGE_PREFIX = "metafor.app-web.hud"
const CODEX_SESSION_STORAGE_KEY = `${STORAGE_PREFIX}.codex.sessionId:v1`
const CODEX_TERMINAL_SESSION_KEY = "app-web:codex"
const CODEX_TERMINAL_TMUX_SESSION = "metafor-app-web-codex"
const CODEX_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.codex.docked:v1`
const CODEX_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.codex.rect:v1`
const CODEX_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.codex.dockPlacement:v2`
const SETTINGS_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.settings.docked:v1`
const SETTINGS_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.settings.rect:v2`
const SETTINGS_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.settings.dockPlacement:v2`
const TODO_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.todo.docked:v1`
const TODO_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.todo.rect:v1`
const TODO_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.todo.dockPlacement:v2`
const TODO_PANEL_STATE_STORAGE_KEY = `${STORAGE_PREFIX}.todo.panelState:v1`
const WORKSPACE_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.docked:v1`
const WORKSPACE_FILES_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.files.rect:v1`
const WORKSPACE_EDITOR_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.editor.rect:v1`
const WORKSPACE_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.workspace.dockPlacement:v1`
const ANDROID_DOCKED_STORAGE_KEY = `${STORAGE_PREFIX}.android.docked:v1`
const ANDROID_RECT_STORAGE_KEY = `${STORAGE_PREFIX}.android.rect:v1`
const ANDROID_DOCK_PLACEMENT_STORAGE_KEY = `${STORAGE_PREFIX}.android.dockPlacement:v1`
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

type HudNotificationKind = "activation" | "deactivation" | "stop" | "agent"

const DEFAULT_VOICE_INPUT_URL = "ws://127.0.0.1:8877/ws"
const DEFAULT_VOICE_WAKE_URL = "ws://127.0.0.1:4765/ws"
const DEFAULT_VOICE_AUTO_SEND_ENABLED = true
const DEFAULT_VOICE_DEACTIVATION_MODE: VoiceDeactivationMode = "phrase-timeout"
const DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const DEFAULT_VOICE_SIGNAL_VOLUME = 0.2
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MAX_VOICE_SIGNAL_VOLUME = 3
const MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS = 60
const DEFAULT_VOICE_ACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_DEACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_STOP_FUZZY = 0.06
const VOICE_MESSAGE_PAUSE_SECONDS = 1.6
const VOICE_SIGNAL_COOLDOWN_MS = 900
const VOICE_AUTO_WAKE_RETRY_MS = 3_000
const VOICE_HUD_ERROR_MS = 2_400
const VOICE_METER_RENDER_MS = 80
const AGENT_READY_SOUND_IDLE_MS = 2500
const AGENT_READY_SOUND_COOLDOWN_MS = 1200
const CODEX_COMPOSER_KEY = "app-web-codex-composer-input"
const CODEX_COMPOSER_H = 96
const CODEX_COMPOSER_GAP = 8
const CODEX_COMPOSER_PAD = 10
const CODEX_COMPOSER_INPUT_H = 38
const CODEX_COMPOSER_VOICE_SIZE = 58
const CODEX_COMPOSER_SEND_W = 86
const CODEX_COMPOSER_MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
const CODEX_TITLE = "Codex"
const CODEX_MODEL = "GPT-5"
const DOCK_SHORT = 40
const DOCK_MARGIN = 8
const DOCK_LONG_PRESS_MS = 320
const DOCK_DRAG_THRESHOLD_PX = 6
const DOCK_TRANSITION_MS = 260
const HUD_PANEL_Z = 20
const HUD_TODO_PANEL_Z = 22
const HUD_SETTINGS_PANEL_Z = 24
const HUD_AGENT_SIGNAL_Z = 41
const HUD_VOICE_Z = 50
const HUD_DOCK_Z = 60
const SETTINGS_SCROLL_KEY = "app-web-settings-pane:scroll"
const SETTINGS_MIN_W = 360
const SETTINGS_MIN_H = PANE_FRAME.headerHeight + 260
const AGENT_SIGNAL_BUTTON_SIZE = 22
const AGENT_SIGNAL_HEADER_Y = 8
const AGENT_SIGNAL_HEADER_TEXT_X = 16
const AGENT_SIGNAL_PANEL_W = 300
const AGENT_SIGNAL_PANEL_H = 112
const ANDROID_RTC_FRAME_SRC = "metafor:app-web-android-rtc-frame"
const VOICE_SERVICE_CHECK_TIMEOUT_MS = 2500
const HUD_PANEL_BG = new Color(palette.bg.r, palette.bg.g, palette.bg.b, 0.68)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
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
	readonly #onApply: AppWebHudOptions["onApply"]
	readonly #onRenderSettingsChange: AppWebHudOptions["onRenderSettingsChange"]
	readonly #onSettingsPersist: AppWebHudOptions["onSettingsPersist"]
	readonly #onVoiceDictationActiveChange: AppWebHudOptions["onVoiceDictationActiveChange"]
	readonly #settingsPane: AppWebSettingsPane
	readonly #codexDock: AppWebDockPane
	readonly #settingsDock: AppWebDockPane
	readonly #todoDock: AppWebDockPane
	readonly #workspaceDock: AppWebDockPane
	readonly #androidDock: AppWebDockPane
	readonly #fullscreenDock: AppWebDockPane
	readonly #todoPane: ToDoPane
	readonly #workspaceFiles: FileListPane
	readonly #workspaceEditor: EditorPane
	readonly #androidPane: AndroidPane
	readonly #agentSignalPane: AppWebAgentSignalPane
	readonly #voiceHud: VoiceInputHud
	readonly #codexComposer: AppWebCodexComposerPane
	readonly #terminal: TerminalController
	#src: string
	#settings: AppWebHudSettingsSnapshot
	#stats: BulkViewportStats = {shellCount: 0, fieldCount: 0}
	#connected = false
	#busy = true
	#codexDocked = readStoredBoolean(CODEX_DOCKED_STORAGE_KEY, false)
	#settingsDocked = readStoredBoolean(SETTINGS_DOCKED_STORAGE_KEY, false)
	#todoDocked = readStoredBoolean(TODO_DOCKED_STORAGE_KEY, true)
	#workspaceDocked = readStoredBoolean(WORKSPACE_DOCKED_STORAGE_KEY, true)
	#androidDocked = readStoredBoolean(ANDROID_DOCKED_STORAGE_KEY, true)
	#codexDockPlacement: DockPlacement | null = readStoredDockPlacement(CODEX_DOCK_PLACEMENT_STORAGE_KEY)
	#settingsDockPlacement: DockPlacement | null = readStoredDockPlacement(SETTINGS_DOCK_PLACEMENT_STORAGE_KEY)
	#todoDockPlacement: DockPlacement | null = readStoredDockPlacement(TODO_DOCK_PLACEMENT_STORAGE_KEY)
	#workspaceDockPlacement: DockPlacement | null = readStoredDockPlacement(WORKSPACE_DOCK_PLACEMENT_STORAGE_KEY)
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
	#androidRtcClient: AndroidRtcClient | null = null
	#androidControlStatusUntil = 0
	#fullscreen = document.fullscreenElement !== null
	#voiceClient: VoiceInputClient | null = null
	#voiceStatus: VoiceInputStatus = "idle"
	#voiceDetail = ""
	#voiceLevel = 0
	#voiceServiceState: VoiceInputHudServiceState = "unknown"
	#voiceServiceDetail = "ASR не проверен"
	#voiceServiceCheckInFlight = false
	#voiceAutoWakeTimer: number | null = null
	#voiceAutoWakeInFlight = false
	#voiceAutoWakePaused = false
	#voiceMeterTimer: number | null = null
	#voiceDictationActive = false
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
	#codexDraft = ""
	#codexAttachments: CodexComposerAttachment[] = []
	#codexDropActive = false
	#codexComposerStatus = ""
	#codexComposerStatusTimer: number | null = null
	readonly #codexDragOver = (event: DragEvent): void => this.#handleCodexDragOver(event)
	readonly #codexDrop = (event: DragEvent): void => void this.#handleCodexDrop(event)
	readonly #codexDragLeave = (event: DragEvent): void => this.#handleCodexDragLeave(event)

	constructor(options: AppWebHudOptions) {
		this.#viewport = options.viewport
		this.#onApply = options.onApply
		this.#onRenderSettingsChange = options.onRenderSettingsChange
		this.#onSettingsPersist = options.onSettingsPersist
		this.#onVoiceDictationActiveChange = options.onVoiceDictationActiveChange
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
		this.#androidPane = new AndroidPane({
			title: "Android",
			draggable: true,
			resizable: true,
			onRefresh: () => this.#connectAndroidRtc(),
			onTap: (x, y) => this.#sendAndroidControl({type: "tap", x, y}),
			onSwipe: (swipe) => this.#sendAndroidSwipe(swipe),
			onKey: (code) => this.#sendAndroidControl({type: "key", code}),
			onLaunchPackage: (packageName) => this.#sendAndroidControl({type: "launch", packageName}),
			onFrameRectChange: (rect) => writeStoredRect(ANDROID_RECT_STORAGE_KEY, rect),
			onFrameDockRequest: () => this.setDocked("android", true),
		})
		this.#agentSignalPane = new AppWebAgentSignalPane(this)
		this.#terminal = this.#createTerminalController()
		this.#voiceHud = this.#createVoiceHud()
		this.#codexComposer = new AppWebCodexComposerPane(this)
		this.#codexDock = new AppWebDockPane(this, "codex")
		this.#settingsDock = new AppWebDockPane(this, "settings")
		this.#todoDock = new AppWebDockPane(this, "todo")
		this.#workspaceDock = new AppWebDockPane(this, "workspace")
		this.#androidDock = new AppWebDockPane(this, "android")
		this.#fullscreenDock = new AppWebDockPane(this, "fullscreen")

		this.#viewport.hud.addSurface(this.#terminal.pane, (bounds) => this.#codexRect(bounds), {zIndex: HUD_PANEL_Z})
		this.#viewport.hud.addSurface(this.#codexComposer, (bounds) => this.#codexComposerRect(bounds), {zIndex: HUD_PANEL_Z + 0.4})
		this.#viewport.hud.addSurface(this.#settingsPane, (bounds) => this.#settingsRect(bounds), {zIndex: HUD_SETTINGS_PANEL_Z})
		this.#viewport.hud.addSurface(this.#todoPane, (bounds) => this.#todoRect(bounds), {zIndex: HUD_TODO_PANEL_Z})
		this.#viewport.hud.addSurface(this.#workspaceFiles, (bounds) => this.#workspaceFilesRect(bounds), {zIndex: HUD_PANEL_Z + 2})
		this.#viewport.hud.addSurface(this.#workspaceEditor, (bounds) => this.#workspaceEditorRect(bounds), {zIndex: HUD_PANEL_Z + 3})
		this.#viewport.hud.addSurface(this.#androidPane, (bounds) => this.#androidRect(bounds), {zIndex: HUD_PANEL_Z + 1})
		this.#viewport.hud.addSurface(this.#agentSignalPane, (bounds) => this.#agentSignalRect(bounds), {zIndex: HUD_AGENT_SIGNAL_Z})
		this.#viewport.hud.addSurface(this.#voiceHud, (bounds) => this.#voiceRect(bounds), {zIndex: HUD_VOICE_Z})
		this.#viewport.hud.addSurface(this.#codexDock, (bounds) => this.#dockRect("codex", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#settingsDock, (bounds) => this.#dockRect("settings", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#todoDock, (bounds) => this.#dockRect("todo", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#workspaceDock, (bounds) => this.#dockRect("workspace", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#androidDock, (bounds) => this.#dockRect("android", bounds), {zIndex: HUD_DOCK_Z})
		this.#viewport.hud.addSurface(this.#fullscreenDock, (bounds) => this.#dockRect("fullscreen", bounds), {zIndex: HUD_DOCK_Z})

		document.addEventListener("fullscreenchange", () => this.#handleFullscreenChange())
		document.addEventListener("dragover", this.#codexDragOver, {capture: true})
		document.addEventListener("drop", this.#codexDrop, {capture: true})
		document.addEventListener("dragleave", this.#codexDragLeave, {capture: true})
		this.#connectTerminal()
		void this.#loadTodo()
		void this.#refreshWorkspaceProcesses()
		void this.#checkVoiceService()
		this.#updateVoiceHud()
		void this.#importInterpreterVoiceSettings().finally(() => this.#scheduleVoiceAutoWake(500))
		installHudNotificationSoundUnlock()
	}

	currentSrc(): string {
		return this.#src
	}

	settingsSnapshot(): AppWebHudSettingsSnapshot {
		return cloneSettings(this.#settings)
	}

	sendAndroidControl(command: AndroidRtcCommand): boolean {
		return this.#sendAndroidControl(command)
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
		if (this.#voicePartialPreviewText) return this.#voicePartialPreviewText
		if (this.#voiceStatus === "listening" || this.#voiceStatus === "committing") return voiceStatusLine(this.#voiceStatus)
		if (this.#terminal.socket?.readyState !== WebSocket.OPEN) return "Codex terminal не подключен"
		return this.#terminal.statusLabel
	}

	codexComposerReady(): boolean {
		return this.#terminal.socket?.readyState === WebSocket.OPEN
	}

	setCodexDraft(value: string): void {
		if (this.#codexDraft === value) return
		this.#codexDraft = value
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
		this.#sendTerminalInput(payload, "api", message)
		this.#codexDraft = ""
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
		writeVoiceAutoSendEnabled(enabled)
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
			writeStoredBoolean(WORKSPACE_DOCKED_STORAGE_KEY, docked)
		} else if (kind === "android") {
			this.#androidDocked = docked
			writeStoredBoolean(ANDROID_DOCKED_STORAGE_KEY, docked)
			if (docked) this.#androidRtcClient?.disconnect()
			else this.#connectAndroidRtc()
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
		return this.#androidDocked
	}

	#panelSurface(kind: DockPanelKind): UiSurface | null {
		if (kind === "codex") return this.#terminal.pane
		if (kind === "settings") return this.#settingsPane
		if (kind === "todo") return this.#todoPane
		if (kind === "workspace") return this.#workspaceFiles
		return this.#androidPane
	}

	#dockSurface(kind: DockPanelKind): UiSurface | null {
		if (kind === "codex") return this.#codexDock
		if (kind === "settings") return this.#settingsDock
		if (kind === "todo") return this.#todoDock
		if (kind === "workspace") return this.#workspaceDock
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
		return this.#androidDocked
	}

	dockLabel(kind: DockKind): string {
		if (kind === "codex") return CODEX_TITLE
		if (kind === "settings") return "Settings"
		if (kind === "android") return "Android"
		if (kind === "workspace") return "Inspector"
		if (kind === "fullscreen") return ""
		return "TODO"
	}

	dockIcon(kind: DockKind): string {
		if (kind === "codex") return uiIcons.codex
		if (kind === "settings") return uiIcons.manual
		if (kind === "android") return uiIcons.language
		if (kind === "workspace") return uiIcons.database
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
			if (document.fullscreenElement === null) await document.documentElement.requestFullscreen()
			else await document.exitFullscreen()
		} catch (error) {
			console.warn("fullscreen toggle failed:", error)
		}
		this.#handleFullscreenChange()
	}

	#handleFullscreenChange(): void {
		const next = document.fullscreenElement !== null
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
				await this.#attachWorkspaceProcess(autoAttachProcessId)
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

	async #attachWorkspaceProcess(processId: string): Promise<void> {
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
			if (this.#workspaceDocked) this.setDocked("workspace", false)
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
				: await this.#readWorkspaceLocalSource(entry)
			this.#workspaceCurrentEntry = entry
			this.#workspaceEditorDirty = false
			this.#workspaceEditor.setTitle(entry.name)
			this.#workspaceEditor.setLanguage({path: entry.path})
			this.#workspaceEditor.setText(text)
			this.#viewport.hud.setFocused(this.#workspaceEditor)
		} catch (error) {
			this.#workspaceEditor.setTitle(`Open failed - ${errorMessage(error)}`)
		}
	}

	async #readWorkspaceProcessSource(entry: WorkspaceFileEntry): Promise<string> {
		if (entry.processId === undefined || entry.sourceUrl === undefined) throw new Error("process source is missing")
		const url = `/hud/interpreter/processes/${encodeURIComponent(entry.processId)}/source?sourceUrl=${encodeURIComponent(entry.sourceUrl)}&tokens=1`
		const payload = await fetchJson(url)
		const source = (payload as {scriptSource?: unknown}).scriptSource
		if (typeof source !== "string") throw new Error("source payload has no scriptSource")
		return source
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

	#codexHeaderControls(): TerminalHeaderControls {
		const enabled = this.agentSoundEnabled()
		return {
			secondary: [
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
			this.#terminal.pane.setInputEnabled(false)
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

	#stageVoiceDraft(text: string): boolean {
		const body = sanitizeCodexTerminalVoiceInput(text)
		if (body.length === 0) return false
		this.#clearVoicePartialPreview()
		this.#codexDraft = mergeCodexComposerDraft(this.#codexDraft, body)
		this.#setCodexComposerStatus("голос добавлен в поле")
		this.#focusCodexComposer()
		this.#codexComposer.requestRender()
		return true
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
		this.#viewport.hud.setFocused(this.#codexComposer)
		this.#codexComposer.focusInput()
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
			this.#setTerminalStatus(statusKindForPane(message.status.kind), message.status.label)
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
		this.#terminal.statusLabel = label
		this.#terminal.pane.setStatus(kind, label)
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
		if (/\b(ok|failed)$/.test(label)) this.#androidControlStatusUntil = Date.now() + 1_200
	}

	#sendAndroidSwipe(swipe: AndroidPaneSwipe): void {
		this.#sendAndroidControl({type: "swipe", ...swipe})
	}

	#sendAndroidControl(command: AndroidRtcCommand): boolean {
		if (this.#androidDocked) this.setDocked("android", false)
		this.#connectAndroidRtc()
		if (this.#androidRtcClient?.send(command) !== true) {
			this.#androidPane.setStatus("error", "rtc control closed")
			return false
		}
		this.#androidControlStatusUntil = Date.now() + 700
		this.#androidPane.setStatus("connected", "rtc command")
		return true
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
				writeVoiceAutoSendEnabled(value)
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
			onStatus: (status, detail) => this.#handleVoiceStatus(status, detail),
			onWake: (text) => {
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
		const client = this.#ensureVoiceClient()
		try {
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
			const serviceOk = await this.#checkVoiceService()
			if (!serviceOk) {
				this.#flashVoiceHudError(this.#voiceServiceDetail)
				return
			}
			await client.startDictation()
		} catch (error) {
			this.#flashVoiceHudError(error instanceof Error ? error.message : String(error))
		} finally {
			this.#focusVoiceTerminal()
		}
	}

	#stopVoice(): void {
		this.#pauseVoiceAutoWake()
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
		if (transportError) {
			this.#pauseVoiceAutoWake()
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

	#flashVoiceHudError(detail: string): void {
		if (this.#voiceHudErrorTimer !== null) window.clearTimeout(this.#voiceHudErrorTimer)
		this.#setVoiceDictationActive(false)
		const message = voiceReadableDetail(detail)
		this.#voiceLastErrorText = message || "ошибка голоса"
		this.#voiceLastErrorAt = new Date()
		this.#voiceStatus = "error"
		this.#voiceDetail = message
		this.#updateVoiceHud("error", message)
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

	#focusVoiceTerminal(): void {
		this.#focusCodexComposer()
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
		if (this.#voiceAutoWakePaused || this.#voiceAutoWakeInFlight) return
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
		this.#voicePartialPreviewText = preview
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
		this.#queueVoiceAutoSendText(text)
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
			autoSendValue: readVoiceAutoSendEnabled(),
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
		const mode = readVoiceAutoSendEnabled() ? "auto-send" : "manual draft"
		if (this.#voiceAutoEnterAt === null) return `${mode} · sent: 0`
		return `${mode} · ${formatTime(this.#voiceAutoEnterAt)} · sent #${this.#voiceAutoEnterCount}`
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

	#queueVoiceAutoSendText(raw: string): boolean {
		const text = cleanupVoiceInputText(raw)
		if (text.length === 0) return false
		this.#voiceAutoSendText = mergeVoiceInputText(this.#voiceAutoSendText, text)
		this.#voicePartialPreviewText = this.#voiceAutoSendText
		this.#codexComposer.requestRender()
		return true
	}

	#flushVoiceAutoSendBuffer(): boolean {
		const text = cleanupVoiceInputText(this.#voiceAutoSendText)
		const mode = this.#voiceNextFlushMode
		this.#voiceAutoSendText = ""
		this.#voiceNextFlushMode = "auto"
		if (text.length === 0) return false
		const handled = mode !== "draft" && readVoiceAutoSendEnabled()
			? this.#sendVoiceSubmit(text)
			: this.#stageVoiceDraft(text)
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
		return this.#stageVoiceDraft(text)
	}

	async #startVoiceWake(reportErrors: boolean): Promise<boolean> {
		const client = this.#ensureVoiceClient()
		if (client.active) return true
		if (client.status === "error") client.reset()
		if (this.#terminal.socket?.readyState !== WebSocket.OPEN) {
			if (reportErrors) this.#flashVoiceHudError("Codex terminal не подключен")
			return false
		}
		const serviceOk = await this.#checkVoiceService()
		if (!serviceOk) {
			if (reportErrors) this.#flashVoiceHudError(this.#voiceServiceDetail)
			return false
		}
		try {
			await client.start()
			return true
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (/permission denied|notallowederror|not allowed/i.test(message)) this.#pauseVoiceAutoWake()
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

	#codexRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#codexDocked) return hiddenRect()
		const composerSpace = CODEX_COMPOSER_H + CODEX_COMPOSER_GAP
		const width = Math.min(760, bounds.w - 24)
		const height = Math.min(360, Math.max(120, bounds.h - 120 - composerSpace))
		return readStoredRect(CODEX_RECT_STORAGE_KEY) ?? {
			x: Math.max(12, bounds.w - width - 16),
			y: Math.max(96, bounds.h - height - composerSpace - 18),
			w: width,
			h: height,
		}
	}

	#codexComposerRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#codexDocked || this.#dockTransition?.kind === "codex") return hiddenRect()
		const terminal = this.#codexRect(bounds)
		if (terminal.visible === false) return hiddenRect()
		const w = Math.min(Math.max(1, terminal.w), Math.max(1, bounds.w - 24))
		const h = Math.min(CODEX_COMPOSER_H, Math.max(1, bounds.h - 24))
		const belowY = terminal.y + terminal.h + CODEX_COMPOSER_GAP
		const y = belowY + h <= bounds.h - 12
			? belowY
			: Math.max(12, terminal.y - h - CODEX_COMPOSER_GAP)
		return {
			x: clampNumber(terminal.x, 12, Math.max(12, bounds.w - w - 12)),
			y: clampNumber(y, 12, Math.max(12, bounds.h - h - 12)),
			w,
			h,
		}
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
		if (kind === "android") return this.#androidDockPlacement
		return this.#fullscreenDockPlacement
	}

	#voiceRect(bounds: {w: number; h: number}): UiSurfaceRect {
		if (this.#codexDocked || this.#dockTransition?.kind === "codex") return hiddenRect()
		const composer = this.#codexComposerRect(bounds)
		if (composer.visible === false) return hiddenRect()
		const sendX = composer.x + composer.w - CODEX_COMPOSER_PAD - CODEX_COMPOSER_SEND_W
		const x = sendX - CODEX_COMPOSER_GAP - CODEX_COMPOSER_VOICE_SIZE
		return {
			x: clampNumber(x, composer.x + CODEX_COMPOSER_PAD, composer.x + Math.max(CODEX_COMPOSER_PAD, composer.w - CODEX_COMPOSER_VOICE_SIZE - CODEX_COMPOSER_PAD)),
			y: composer.y + CODEX_COMPOSER_PAD + Math.max(0, (CODEX_COMPOSER_INPUT_H - CODEX_COMPOSER_VOICE_SIZE) / 2),
			w: CODEX_COMPOSER_VOICE_SIZE,
			h: CODEX_COMPOSER_VOICE_SIZE,
		}
	}
}

class AppWebCodexComposerPane extends UiSurface {
	constructor(private readonly hud: AppWebHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "AppWebCodexComposerPane"
	}

	focusInput(): void {
		const value = this.hud.codexDraft()
		focusTextField(this, CODEX_COMPOSER_KEY, {value, cursor: value.length, selectionAnchor: null})
		this.requestRender()
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
		this.#drawInputRow(pad, pad, Math.max(1, w - pad * 2))
		this.#drawAttachmentRow(pad, pad + CODEX_COMPOSER_INPUT_H + 10, Math.max(1, w - pad * 2), h - pad)
		if (this.hud.codexDropActive()) this.#drawDropOverlay(w, h)
	}

	#drawInputRow(x: number, y: number, w: number): void {
		const sendW = Math.min(CODEX_COMPOSER_SEND_W, Math.max(68, Math.floor(w * 0.22)))
		const reservedRight = CODEX_COMPOSER_VOICE_SIZE + CODEX_COMPOSER_GAP + sendW + CODEX_COMPOSER_GAP
		const fieldW = Math.max(72, w - reservedRight)
		const attachments = this.hud.codexAttachments()
		const canSubmit = this.hud.codexComposerReady() && codexComposerMessage(this.hud.codexDraft(), attachments).length > 0
		const placeholder = this.hud.codexComposerReady() ? "Сообщение Codex" : "Codex не подключен"
		TextField(this, x, y, fieldW, CODEX_COMPOSER_INPUT_H, {
			key: CODEX_COMPOSER_KEY,
			value: this.hud.codexDraft(),
			placeholder,
			submitOnEnter: true,
			disabled: !this.hud.codexComposerReady(),
			onChange: (value) => this.hud.setCodexDraft(value),
			onSubmit: () => this.hud.submitCodexComposer(),
			sx: {
				fontSize: 13,
				borderRadius: 8,
				background: "bgInput",
				borderColor: "borderDim",
				color: "text",
				paddingX: 12,
			},
		})
		Button(this, x + w - sendW, y, sendW, CODEX_COMPOSER_INPUT_H, {
			label: "Отправить",
			disabled: !canSubmit,
			color: "primary",
			variant: "contained",
			radius: 8,
			action: () => this.hud.submitCodexComposer(),
		})
	}

	#drawAttachmentRow(x: number, y: number, w: number, maxY: number): void {
		const attachments = this.hud.codexAttachments()
		const status = this.hud.codexComposerStatus()
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
		if (status) {
			this.drawText(status, x, maxY - 13, {
				fontPx: 10,
				material: this.hud.codexComposerReady() ? this.materials.muted : this.materials.orange,
				maxWidthPx: w,
				z: Z.TEXT,
			})
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
}

class AppWebSettingsPane extends UiSurface {
	#frameDrag: PaneFrameDrag | null = null
	#tab: SettingsTab = "scene"

	constructor(private readonly hud: AppWebHud) {
		super({bgColor: null, borderColor: null})
		this.node.name = "AppWebSettingsPane"
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
		const dockButtonX = w - PANE_FRAME.headerTextX - dockButtonSize
		this.drawText("Settings", PANE_FRAME.headerTextX, PANE_FRAME.headerTextY, {
			fontPx: 13,
			material: this.materials.cyan,
			maxWidthPx: Math.max(1, dockButtonX - PANE_FRAME.headerTextX - 12),
			z: Z.TEXT,
		})
		this.drawText("app/web", PANE_FRAME.headerTextX + 86, PANE_FRAME.headerTextY + 1, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: Math.max(1, dockButtonX - PANE_FRAME.headerTextX - 98),
			z: Z.TEXT,
		})
		IconButton(this, dockButtonX, 7, dockButtonSize, dockButtonSize, {
			label: "Свернуть настройки",
			iconSrc: uiIcons.minus,
			action: () => this.hud.setDocked("settings", true),
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
			{id: "voice", label: "Голос"},
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
			return
		}
		this.#renderVoice(x, y, w)
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
		y = this.#drawBooleanRow("Автоотправка", "Отправлять распознанный текст в Codex автоматически.", readVoiceAutoSendEnabled(), x, y, w, (checked) => this.hud.setVoiceAutoSendEnabled(checked))
		y = this.#drawNumberControl({
			key: "voice-signal-volume",
			label: "Звук микрофона",
			value: readVoiceSignalVolume(),
			min: 0,
			max: MAX_VOICE_SIGNAL_VOLUME,
			step: 0.1,
			x,
			y,
			w,
			format: (value) => `${Math.round(value * 100)}%`,
			onChange: (value) => this.hud.setVoiceSignalVolume(Math.round(value * 20) / 20),
		}) + 12
		y = this.#drawNumberControl({
			key: "voice-recognition-timeout",
			label: "Тайм-аут распознавания",
			value: readVoiceRecognitionTimeoutSeconds(),
			min: MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			max: MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS,
			step: 1,
			x,
			y,
			w,
			format: (value) => `${Math.round(value)} c`,
			onChange: (value) => this.hud.setVoiceRecognitionTimeoutSeconds(value),
		}) + 12
		y = this.#drawDeactivationMode(x, y, w) + 12
		y = this.#drawBooleanRow("Сигнал агента", "Звук после окончания вывода агента.", this.hud.agentSoundEnabled(), x, y, w, (checked) => this.hud.setAgentSoundEnabled(checked))
		return this.#drawNumberControl({
			key: "agent-sound-volume",
			label: "Звук окончания",
			value: this.hud.agentSoundVolume(),
			min: 0,
			max: MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME,
			step: 0.1,
			x,
			y,
			w,
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
		return this.#drawNumberControl({
			key: `app-web-setting:${key}`,
			label: config.label,
			value: Number(value),
			min,
			max,
			step: config.step ?? 1,
			x,
			y,
			w,
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

	#drawNumberControl(opts: {
		key: string
		label: string
		value: number
		min: number
		max: number
		step: number
		x: number
		y: number
		w: number
		format(value: number): string
		onChange(value: number): void
	}): number {
		const min = Math.min(opts.min, opts.max)
		const max = Math.max(opts.min, opts.max)
		const value = clampNumber(Number.isFinite(opts.value) ? opts.value : min, min, max)
		const range = Math.max(1, max - min)
		const ratio = clampNumber((value - min) / range, 0, 1)
		this.drawText(opts.label, opts.x, opts.y + 3, {
			fontPx: 10,
			material: this.materials.text,
			maxWidthPx: Math.max(1, opts.w - 120),
			z: Z.TEXT,
		})
		this.drawText(opts.format(value), opts.x + opts.w - 106, opts.y + 3, {
			fontPx: 10,
			material: this.materials.muted,
			maxWidthPx: 52,
			z: Z.TEXT,
		})
		const buttonW = 24
		IconButton(this, opts.x + opts.w - 50, opts.y, buttonW, 22, {
			label: `${opts.label}: меньше`,
			iconSrc: uiIcons.minus,
			action: () => this.#setNumberValue(value - opts.step, min, max, opts.onChange),
		})
		IconButton(this, opts.x + opts.w - 24, opts.y, buttonW, 22, {
			label: `${opts.label}: больше`,
			iconSrc: uiIcons.plus,
			action: () => this.#setNumberValue(value + opts.step, min, max, opts.onChange),
		})
		const trackY = opts.y + 28
		this.drawRoundedRect(opts.x, trackY, opts.w, 5, {radius: 3, fill: palette.borderDim, border: null, opacity: 0.42, z: Z.ELEMENT})
		this.drawRoundedRect(opts.x, trackY, Math.max(3, opts.w * ratio), 5, {radius: 3, fill: palette.cyan, border: null, opacity: 0.62, z: Z.ELEMENT + 0.01})
		const knobX = opts.x + opts.w * ratio
		this.drawRoundedRect(knobX - 5, trackY - 4, 10, 13, {
			radius: 5,
			fill: palette.cyan,
			border: palette.borderBright,
			borderWidth: 1,
			opacity: 0.86,
			z: Z.ELEMENT + 0.04,
		})
		const setFromPointer = (localX: number): void => {
			const next = min + ((localX - opts.x) / opts.w) * range
			this.#setNumberValue(next, min, max, opts.onChange)
		}
		this.hit(opts.x - 4, opts.y + 22, opts.w + 8, 18, () => undefined, {
			key: `${opts.key}:track`,
			cursor: "pointer",
			onPointerDown: (localX) => setFromPointer(localX),
			onPointerMove: (localX) => setFromPointer(localX),
		})
		return opts.y + 46
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

	#setNumberValue(value: number, min: number, max: number, onChange: (value: number) => void): void {
		onChange(clampNumber(value, min, max))
		this.requestRender()
	}

	#contentHeight(): number {
		if (this.#tab === "scene") return 244
		if (this.#tab === "geometry") return 36 + APP_WEB_LAYOUT_SETTING_KEYS.length * 46
		if (this.#tab === "render") {
			const sectionHeight = (rows: number): number => 19 + rows * 46 + 14
			return 4 + sectionHeight(1) + sectionHeight(4) + sectionHeight(3) + sectionHeight(3)
		}
		return 320
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
	} | null = null
	#suppressClick = false

	constructor(private readonly hud: AppWebHud, private readonly kind: DockKind) {
		super({bgColor: null, borderColor: null})
		this.node.name = `AppWebDockPane:${kind}`
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
			if (!press.dragging && Math.hypot(press.lastX - press.startX, press.lastY - press.startY) >= DOCK_DRAG_THRESHOLD_PX) {
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
		if (wasDragging) this.#suppressClick = true
		super.onPointerUp(event, localX, localY)
		if (wasDragging) this.#suppressClick = false
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
	if (kind === "codex") return 184
	if (kind === "settings") return 142
	if (kind === "android") return 132
	if (kind === "workspace") return 150
	if (kind === "todo") return 126
	return 48
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

function formatDebugTime(date: Date | null): string {
	return date === null ? "-" : formatTime(date)
}

function voiceSignalForStatusChange(previousStatus: VoiceInputStatus, nextStatus: VoiceInputStatus, detail?: string): HudNotificationKind | null {
	if (nextStatus === "listening" && previousStatus !== "listening" && previousStatus !== "committing") return "activation"
	if (nextStatus === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
	if (nextStatus === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) return "stop"
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
	window.addEventListener("keydown", unlock, {capture: true})
	window.addEventListener("touchstart", unlock, {capture: true})
}

function playHudNotificationSound(kind: HudNotificationKind, voiceClient: VoiceInputClient | null): void {
	if (kind === "agent" && !readHostTerminalAgentSoundEnabled()) {
		recordHudNotificationSound(kind, "disabled")
		return
	}
	const volume = hudNotificationVolume(kind)
	if (volume <= 0) {
		recordHudNotificationSound(kind, "muted")
		return
	}
	if (kind !== "agent") {
		const signalKind: VoiceInputSignalTone = kind
		if (voiceClient?.playSignalTone(signalKind, volume, (playedKind, method, error) => {
			recordHudNotificationSound(playedKind, method, error)
		}) === true) return
	}
	playBrowserHudNotificationSound(kind, volume)
}

function hudNotificationVolume(kind: HudNotificationKind): number {
	return kind === "agent" ? readHostTerminalAgentSoundVolume() : readVoiceSignalVolume()
}

function playBrowserHudNotificationSound(kind: HudNotificationKind, volume: number): void {
	if (playHudNotificationWebAudioTone(kind, volume, (reason) => playHudNotificationHtmlAudio(kind, reason, volume))) return
	playHudNotificationHtmlAudio(kind, "no webaudio", volume)
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

function playHudNotificationHtmlAudio(kind: HudNotificationKind, reason = "fallback", volume = hudNotificationVolume(kind)): void {
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
			.catch((error) => recordHudNotificationSound(kind, "html blocked", error))
		return
	}
	recordHudNotificationSound(kind, "html unavailable", reason)
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
	return ["activation", "deactivation", "stop", "agent"]
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
	return readStoredString(VOICE_INPUT_URL_STORAGE_KEY) ?? DEFAULT_VOICE_INPUT_URL
}

function readVoiceWakeUrl(): string {
	return readStoredString(VOICE_WAKE_URL_STORAGE_KEY) ?? DEFAULT_VOICE_WAKE_URL
}

function readVoiceInputContext(): string {
	return readStoredString(VOICE_INPUT_CONTEXT_STORAGE_KEY) ?? ""
}

function voiceContextWithTerminal(terminalText: string): string {
	return [readVoiceInputContext(), terminalText.slice(-6000)]
		.map((item) => item.trim())
		.filter(Boolean)
		.join("\n\n")
		.slice(-8000)
}

function readVoiceAutoSendEnabled(): boolean {
	try {
		const raw = localStorage.getItem(VOICE_AUTO_SEND_STORAGE_KEY)
		if (raw === null) return DEFAULT_VOICE_AUTO_SEND_ENABLED
		return raw !== "0" && raw !== "false"
	} catch {
		return DEFAULT_VOICE_AUTO_SEND_ENABLED
	}
}

function writeVoiceAutoSendEnabled(enabled: boolean): void {
	const next = enabled ? "1" : "0"
	try {
		localStorage.setItem(VOICE_AUTO_SEND_STORAGE_KEY, next)
	} catch {
		// Storage can be disabled.
	}
	syncInterpreterVoiceSettings({[VOICE_AUTO_SEND_STORAGE_KEY]: next})
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
	return `${left} ${right}`
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
		const url = new URL(raw)
		return `${url.hostname}:${url.port || (url.protocol === "wss:" ? "443" : "80")}`
	} catch {
		return raw
	}
}

function probeVoiceService(rawUrl: string): Promise<Record<string, unknown> | null> {
	return new Promise((resolve, reject) => {
		let settled = false
		let openFallback: number | null = null
		const ws = new WebSocket(rawUrl)
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
