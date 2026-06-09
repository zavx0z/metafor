/**
 * Interpreter UI.
 *
 * One interpreter owns one HUD and one WebGPU Space. UIDisplays are visual
 * placements; public runtime/source API is scoped to processes.
 */

import {
  UiRuntime,
  UiSurface,
  palette,
  radii,
  uiIcons,
  type UiRuntimeDisplayCenterChange,
  type UiRuntimeDisplaySnapshot,
  type UiRuntimeViewPointSnapshot,
  type UiRuntimeViewPointVector,
  type UiSurfaceRect,
} from "@ui/elements"
import {IconButton, Switcher, VoiceInputHud, type VoiceInputHudDeactivationMode, type VoiceInputHudPhraseGroupId, type VoiceInputHudServiceState} from "@ui/components"
import {HudSideTab, type HudSideTabEdge} from "@ui/hud"
import {
  EditorPane,
  FileListPane,
  TerminalPane,
  ToDoPane,
  normalizeFileListSelection,
  sourceDisplayLocation,
  sourcePathFromLocation,
  type EditorBreakpoint,
  type EditorSelectionSnapshot,
  type EditorTokens,
  type FileListItem,
  type TerminalInputSource,
  type TerminalPaneOpts,
  type TerminalSize,
  type TerminalStatusKind,
  type ToDoPaneContextSnapshot,
  type ToDoPanePanelStateSnapshot,
} from "@ui/panes"
import {
  DisplayHoverOutlinePane,
  FramesPane,
  ScopesPane,
  VerbosePane,
  propertySnapshotMapFromProtocolResponse,
  type FrameSnapshot,
  type ScopeContextSnapshot,
} from "./interpreter-ui.ts"
import {getUiLocale, t, toggleUiLocale} from "./i18n.ts"
import {
  breakpointRegistrationMatchesSource,
  breakpointSpecMatchesSource,
  sameSourceUrl,
} from "./breakpoint-matching.ts"
import {formatTerminalExpressionResult} from "./terminal-value-format.ts"
import {
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  DEFAULT_VOICE_STOP_PHRASES,
  VoiceInputClient,
  VOICE_STOP_COMMAND_DETAIL,
  normalizeVoicePhrases,
  type VoiceDeactivationMode,
  type VoiceInputChunk,
  type VoiceInputSegment,
  type VoiceInputStatus,
} from "./voice-input.ts"

type ConnectionInfo = {state: ConnectionState; error: string | null}
type ConnectionState = "connecting" | "connected" | "disconnected"
type RuntimeControlTone = "neutral" | "live" | "paused" | "warn"

type ServerMessage =
  | {type: "hello"; modules?: ModulePaneSnapshot[]; sqliteDatabases?: string[]}
  | {type: "modules"; modules: ModulePaneSnapshot[]}
  | {type: "module"; module: ModulePaneSnapshot}
  | {type: "module-state"; moduleId: string; dump: InterpreterDump; module: ModulePaneSnapshot}
  | {type: "module-resumed"; moduleId: string; module: ModulePaneSnapshot}
  | {type: "module-connection"; moduleId: string; state: ConnectionState; error: string | null; protocolUrl: string; module: ModulePaneSnapshot}
  | {type: "module-target"; moduleId: string; event: TargetEvent; module: ModulePaneSnapshot}
  | {type: "module-protocol-event"; moduleId: string; ts: string; method: string; params: unknown}
  | {type: "interpreter-event"; ts: string; event: string; detail: unknown}
  | {type: "source-patched"; moduleId: string; reason: "save" | "apply_patch"; files: SourcePatchedFile[]; breakpoints?: SourcePatchedBreakpoints[]}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}
  | {type: "ui-host-command"; requestId: number; command: string; params?: unknown}
  | {type: "hud-todo-changed"; todo?: TodoMarkdownPayload}
  | {type: "reload"}

type SourcePatchedFile = {
  path: string
  oldPath?: string
  sourceUrl: string
  operation: "add" | "update" | "delete" | "move"
  added?: number
  removed?: number
  bytes?: number
  size?: number
  mtimeMs?: number
  lineChanges?: SourceLineChange[]
}

type SourceLineChange = {oldStart: number; oldLines: number; newStart: number; newLines: number}

type SourcePatchedBreakpoints = {
  moduleId: string
  breakpoints: BreakpointRegistration[]
}

type TargetEvent =
  | {type: "started"; pid: number; command: string[]; cwd: string | null; startedAt: string}
  | {type: "line"; line: ModuleLine}
  | {type: "exited"; exitCode: number | null; signalCode: string | null; exitedAt: string}

type ModuleLine = {
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

type ModulePaneSnapshot = {
  id: string
  label: string
  modulePath: string | null
  protocolUrl: string
  connection: ConnectionInfo
  paused: boolean
  scriptCount: number
  hasDump: boolean
  dump: InterpreterDump | null
  target: {
    state: "idle" | "starting" | "running" | "exited" | "failed"
    pid: number | null
    command: string[]
    cwd: string | null
    startedAt: string | null
    exitedAt: string | null
    exitCode: number | null
    signalCode: string | null
    outputLineCount: number
    output: ModuleLine[]
    pauseOnStart: boolean
  }
}

type InterpreterDump = {
  timestamp: string
  reason: string
  hitBreakpoints: string[]
  frames: FrameSnapshot[]
}

type SourceRuntimeState = "idle" | "loading" | "paused" | "running" | "exited" | "failed" | "disconnected"

type BreakpointSpec = {
  url?: string
  sourceUrl?: string
  urlRegex?: string
  line: number
  column?: number
  condition?: string
}

type BreakpointRegistration = {
  id: string
  spec: BreakpointSpec
  installed: Array<{
    breakpointId: string
    scriptId: string
    url: string
    result?: unknown
  }>
}

type BreakpointSourceIdentity = {
  scriptId: string
  scriptUrl: string
  sourceUrl: string
  key: string
}

type Source = {
  text: string
  currentLine: number
  location: string
  identity: BreakpointSourceIdentity | null
  tokens?: EditorTokens
}

type SourceContextPosition = {
  /** 1-based line for API consumers. */
  line: number
  /** 0-based column, matching runtime/breakpoint columns. */
  column: number
}
type SourceSelectionContext = {
  anchor: SourceContextPosition
  focus: SourceContextPosition
  start: SourceContextPosition
  end: SourceContextPosition
  text: string
}
type SourceInteractionContext = {
  cursor: SourceContextPosition
  selection: SourceSelectionContext | null
}
type ModuleCurrentContext = {
  processId: string
  moduleId: string
  displayId: string
  label: string
  updatedAt: string
  display: {
    active: boolean
    visible: boolean
    order: number
  } | null
  source: {
    state: SourceRuntimeState
    location: string
    identity: BreakpointSourceIdentity | null
    dirty: boolean
    cursor: SourceContextPosition
    selection: SourceSelectionContext | null
  }
  activeFrameIndex: number | null
  currentFrame: Pick<FrameSnapshot, "index" | "function" | "url" | "line" | "column" | "sourceKind" | "scriptId"> | null
  scopes: ScopeContextSnapshot
  terminal: {
    focused: boolean
    pendingInput: string
    promptVisible: boolean
  }
  hud: {
    todo: ToDoPaneContextSnapshot | null
  }
}

type CachedSource = {
  text: string
  sourceUrl: string
  scriptUrl: string
  tokens?: EditorTokens
}

type WorkspaceFilesPayload = {
  root?: string
  workspacePath?: string
  modulePath?: string
  entrypoint?: string | null
  files?: Array<{path?: string}>
  modules?: Array<{path?: string}>
}

type WorkspaceFilesStoredState = {
  expandedIds: string[]
  selectedIds: string[]
}

type WorkspaceFilesState = {
  root: string | null
  workspacePath: string
  modulePath: string | null
  rootLabel: string | null
  items: readonly FileListItem[]
  expandedIds: readonly string[]
  selectedIds: readonly string[]
  storageKey: string
  loading: Promise<void> | null
  suppressSelectionOpen: boolean
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
  selectedTable: string | null
  limit: number
  offset: number
  tables: SqliteTableSummary[]
  schema: SqliteColumnInfo[]
  rows: Array<Record<string, SqliteCellValue>>
}

type CommandReply = {ok: boolean; result?: unknown; error?: string}
type ActiveInterpreterCommand = {cmd: string; label: string; startedAt: number}
type DisplayLayoutMetrics = {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}
type DisplaySelectorSide = "left" | "right" | "top" | "bottom" | "center"
type DisplayInfoBase = UiRuntimeDisplaySnapshot & {
  displayId: string
  label: string
  order: number
}
type ModuleDisplayInfo = DisplayInfoBase & {
  kind: "module"
  moduleId: string
}
type SqliteDisplayInfo = DisplayInfoBase & {
  kind: "sqlite"
  moduleId: null
  sqliteId: string
  path: string
}
type DisplayInfo = ModuleDisplayInfo | SqliteDisplayInfo
type SqliteDisplayController = {
  id: string
  requestedPath: string
  path: string
  label: string
  selectedTable: string | null
  payload: SqliteDatabasePayload | null
  loading: Promise<void> | null
  suppressTableSelectionOpen: boolean
  tables: FileListPane
  rows: SqliteTablePane
}
type ProcessWorkspaceInfo = {
  id: string
  processId: string
  kind: "process"
  moduleId: string
  displayId: string
  label: string
  order: number
  content: {
    kind: "module"
    moduleId: string
    processId: string
    modulePath: string | null
  }
  display: ModuleDisplayInfo | null
  runtime: {
    protocolUrl: string
    connection: ConnectionInfo
    paused: boolean
    scriptCount: number
    hasDump: boolean
    target: Omit<ModulePaneSnapshot["target"], "output"> & {
      outputTail: ModuleLine[]
    }
  }
  ui: {
    source: {
      state: SourceRuntimeState | null
      location: string
      identity: BreakpointSourceIdentity | null
      dirty: boolean
      cursor: SourceContextPosition | null
      selection: SourceSelectionContext | null
    }
    context: ModuleCurrentContext | null
    activeFrameIndex: number | null
    currentFrame: FrameSnapshot | null
    terminal: {
      canAcceptInput: boolean
      focused: boolean
      pendingInput: string
      promptVisible: boolean
      textTail: string[]
    }
    activeCommand: ActiveInterpreterCommand | null
    verboseVisible: boolean
  }
  capabilities: {
    pause: boolean
    resume: boolean
    step: boolean
    evaluate: boolean
    sourceOpen: boolean
    restart: boolean
    stop: boolean
    showExecutionPoint: boolean
  }
}
type PtyStatusKind = "idle" | "connected" | "running" | "disconnected" | "error"
type PtyTerminalState = {
  echo: boolean
  localEcho: boolean
  alternateScreen: boolean
  applicationCursorKeys: boolean
  applicationKeypad: boolean
  bracketedPaste: boolean
  cursorVisible: boolean
}
type PtyClientMessage =
  | {type: "input.write"; data: string; source?: TerminalInputSource; localEchoId?: number}
  | {type: "terminal.resize"; size: TerminalSize}
  | {type: "terminal.clear"}
type PtyServerMessage =
  | {type: "terminal.ready"; shell: string; size: TerminalSize; sessionId: string; restored: boolean; replayBytes: number; state: PtyTerminalState}
  | {type: "terminal.write"; data: string; state?: PtyTerminalState}
  | {type: "terminal.state"; state: PtyTerminalState}
  | {type: "terminal.local-echo"; id: number; accepted: boolean; state: PtyTerminalState}
  | {type: "terminal.status"; status: {kind: PtyStatusKind; label: string; detail?: string}}
  | {type: "terminal.exit"; code: number | null; signal: string | null}
  | {type: "terminal.error"; message: string}

type ModuleDisplayController = {
  id: string
  frames: FramesPane
  filesChrome: WorkspaceFilesChromePane
  filesHeader: WorkspaceFilesHeaderPane
  files: FileListPane
  scopes: ScopesPane
  source: EditorPane
  terminal: TerminalPane
  verbose: VerbosePane
  sourceCache: Map<string, CachedSource>
  sourceTextKey: string
  sourceText: string
  sourceIdentity: BreakpointSourceIdentity | null
  sourceDirty: boolean
  sourceSaving: boolean
  breakpointRegistrations: BreakpointRegistration[]
  pendingBreakpointLines: Set<number>
  activeFrameIndex: number
  dump: InterpreterDump | undefined
  sourceLocation: string
  sourceRuntimeState: SourceRuntimeState
  sourceContext: SourceInteractionContext
  outputLineCount: number
  agentTerminalEntries: AgentModuleTerminalEntry[]
  agentOutputLineCount: number
  agentTerminalTargetStartedAt: string | null
  activeCommand: ActiveInterpreterCommand | null
  verboseVisible: boolean
  contextPublishQueued: boolean
  terminalInput: {
    buffer: string
    promptVisible: boolean
  }
  workspaceFiles: WorkspaceFilesState
}

type HostTerminalController = {
  hudTerminal: TerminalPane
  socket: WebSocket | null
  sessionId: string | null
  terminalSize: TerminalSize | null
  connectionState: PtyStatusKind
  terminalState: PtyTerminalState | null
  localEchoId: number
  agentNotifyArmed: boolean
  agentNotifySawOutput: boolean
  agentNotifyLastOutputAt: number
  agentNotifyLastPlayedAt: number
  agentNotifyTimer: number | null
}

type VoiceInputTarget =
  | {kind: "module"; controller: ModuleDisplayController}
  | {kind: "host"; controller: HostTerminalController}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`#${id} not in DOM`)
  return element as T
}

const engineCanvas = $<HTMLCanvasElement>("engine-canvas")

const BREAKPOINTS_STORAGE_KEY = "interpreter:breakpoints:v1"
const COMMAND_TIMEOUT_MS = 10_000
const MODULE_DISPLAY_GAP_MM = 52
const MODULE_DISPLAY_CENTER_Y_MM = 0
const MODULE_DISPLAY_CENTER_Z_MM = 900
const HOST_TERMINAL_SESSION_STORAGE_KEY = "metafor.interpreter.hostTerminal.sessionId"
const HOST_TERMINAL_HUD_RECT_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudRect:v1"
const HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudDocked:v1"
const HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.hostTerminal.dockPlacement:v1"
const TODO_HUD_RECT_STORAGE_KEY = "metafor.interpreter.todo.hudRect:v1"
const TODO_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.todo.hudDocked:v1"
const TODO_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.todo.dockPlacement:v1"
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
const VOICE_HUD_RECT_STORAGE_KEY = "metafor.interpreter.voice.hudRect:v1"
const VOICE_SIGNAL_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v1"
const VOICE_SIGNAL_VOLUME_STORAGE_KEY = "metafor.interpreter.voice.signalVolume:v2"
const HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundEnabled:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY = "metafor.interpreter.hostTerminal.agentSoundVolume:v1"
const HOST_TERMINAL_AGENT_SOUND_VOLUME_LEGACY_STORAGE_KEY = "metafor.interpreter.voice.agentReadyVolume:v1"
const INTERPRETER_VIEWPOINT_STORAGE_KEY = "metafor.interpreter.viewPoint:v1"
const INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY = "metafor.interpreter.displayPositions:v1"
const TODO_PANEL_STATE_STORAGE_KEY = "metafor.interpreter.todo.panelState:v1"
const INTERPRETER_VIEWPOINT_STORE_DELAY_MS = 120
const INTERPRETER_DISPLAY_POSITION_STORE_DELAY_MS = 120
const WORKSPACE_FILES_STATE_STORAGE_PREFIX = "metafor.interpreter.workspaceFiles:v1"
const DEFAULT_VOICE_INPUT_URL = "ws://127.0.0.1:8877/ws"
const DEFAULT_VOICE_WAKE_URL = "ws://127.0.0.1:4765/ws"
const DEFAULT_VOICE_SIGNAL_VOLUME = 0.2
const DEFAULT_VOICE_DEACTIVATION_MODE: VoiceDeactivationMode = "phrase-timeout"
const DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MAX_VOICE_SIGNAL_VOLUME = 3
const MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS = 60
const MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const VOICE_SERVICE_CHECK_INTERVAL_MS = 12_000
const VOICE_SERVICE_CHECK_TIMEOUT_MS = 2_500
const VOICE_AUTO_WAKE_RETRY_MS = 3_000
const VOICE_HUD_W = 128
const VOICE_HUD_H = 128
const HOST_TERMINAL_HUD_MAX_W = 980
const HOST_TERMINAL_HUD_MAX_H = 340
const HOST_TERMINAL_HUD_MIN_W = 720
const HOST_TERMINAL_HUD_MIN_H = 560
const HOST_TERMINAL_HUD_PANEL_MIN_W = 260
const HOST_TERMINAL_HUD_PANEL_MIN_H = 160
const HOST_TERMINAL_DOCK_SHORT = 36
const HOST_TERMINAL_DOCK_LONG = 128
const HOST_TERMINAL_DOCK_MARGIN = 8
const HOST_TERMINAL_DOCK_LONG_PRESS_MS = 360
const TODO_HUD_MIN_W = 320
const TODO_HUD_MIN_H = 220
const TODO_DOCK_SHORT = 34
const TODO_DOCK_LONG = 96
const TODO_DOCK_MARGIN = 8
const TODO_DOCK_LONG_PRESS_MS = 360
const HOST_TERMINAL_BRAND_LABEL = "Codex"
const HOST_TERMINAL_MODEL_LABEL = "GPT 5,5"
const HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE = 22
const HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y = 8
const HOST_TERMINAL_AGENT_SIGNAL_HEADER_GAP = 8
const HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X = 16
const HOST_TERMINAL_AGENT_SIGNAL_STATUS_MIN_W = 96
const HOST_TERMINAL_AGENT_SIGNAL_STATUS_MAX_W = 210
const HOST_TERMINAL_AGENT_SIGNAL_PANEL_W = 300
const HOST_TERMINAL_AGENT_SIGNAL_PANEL_H = 112
const AGENT_READY_SOUND_IDLE_MS = 2_500
const AGENT_READY_SOUND_COOLDOWN_MS = 1_200
const VOICE_SIGNAL_COOLDOWN_MS = 900
const DEFAULT_VOICE_ACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_DEACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_STOP_FUZZY = 0.06
const WORKSPACE_FILES_LIMIT = 500
const SQLITE_OPEN_RETRY_MS = 700

type HudNotificationKind = "activation" | "deactivation" | "stop" | "agent"

type HostTerminalDockPlacement = {
  edge: HudSideTabEdge
  offset: number
}

type VoiceHudHorizontalAnchor = "left" | "right"
type VoiceHudVerticalAnchor = "top" | "bottom"
type VoiceHudAnchorPlacement = {
  horizontal: VoiceHudHorizontalAnchor
  vertical: VoiceHudVerticalAnchor
  offsetX: number
  offsetY: number
}

const DEFAULT_HOST_TERMINAL_HUD_RECT: UiSurfaceRect = {x: 643, y: 60, w: 755, h: 943}
const DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "top", offset: 858}
const DEFAULT_VOICE_HUD_RECT: UiSurfaceRect = {x: 1783, y: 960, w: VOICE_HUD_W, h: VOICE_HUD_H}
const DEFAULT_TODO_HUD_RECT: UiSurfaceRect = {x: 16, y: 72, w: 430, h: 560}
const DEFAULT_TODO_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "left", offset: 260}

let uiCanvas: UiRuntime | null = null
let uiLoading = false
let displayHoverOutlinePane: DisplayHoverOutlinePane | null = null
let todoPane: ToDoPane | null = null
let todoDockPane: TodoDockPane | null = null
let todoContext: ToDoPaneContextSnapshot | null = null
let hostTerminal: HostTerminalController | null = null
let hostTerminalDockPane: HostTerminalDockPane | null = null
let hostTerminalAgentSignalPane: HostTerminalAgentSignalPane | null = null
let hostTerminalStatusLabelForLayout = t("terminalConnecting")
let hostTerminalHudDocked = readStoredHostTerminalHudDocked()
let hostTerminalDockPlacement: HostTerminalDockPlacement | null = readStoredHostTerminalDockPlacement() ?? DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT
let hostTerminalHudRectPreview: UiSurfaceRect | null = null
let todoHudDocked = readStoredTodoHudDocked()
let todoDockPlacement: HostTerminalDockPlacement | null = readStoredTodoDockPlacement() ?? DEFAULT_TODO_DOCK_PLACEMENT
let todoHudRectPreview: UiSurfaceRect | null = null
let voiceHudPane: VoiceInputHud | null = null
let voiceInputClient: VoiceInputClient | null = null
let voiceActiveTarget: VoiceInputTarget | null = null
let voicePartialPreviewTarget: VoiceInputTarget | null = null
let voicePartialPreviewText = ""
let voiceHudErrorTimer: number | null = null
let voiceModuleSubmitQueue: Promise<void> = Promise.resolve()
let voiceHudStatus: VoiceInputStatus = "idle"
let voiceHudDetail = ""
let voiceHudUpdatedAt = new Date()
let voiceInputLevel = 0
let voiceMeterRaf: number | null = null
let voiceAutoWakeTimer: number | null = null
let voiceAutoWakeInFlight = false
let voiceAutoWakePaused = false
let voiceAutoEnterCount = 0
let voiceAutoEnterAt: Date | null = null
let voiceWakePreviewText = ""
let voiceWakePreviewAt: Date | null = null
const voiceWakePreviewHistory: Array<{text: string; at: Date}> = []
let voiceLastPartialText = ""
let voiceLastPartialAt: Date | null = null
let voiceLastChunkText = ""
let voiceLastChunkAt: Date | null = null
let voiceLastErrorText = ""
let voiceLastErrorAt: Date | null = null
let voiceServiceState: VoiceInputHudServiceState = "unknown"
let voiceServiceDetail = t("voiceServiceUnknown")
let voiceServiceCheckedAt: Date | null = null
let voiceServiceCheckInFlight = false
let voiceServiceCheckTimer: number | null = null
let hostTerminalUnloadInstalled = false
let hudNotificationAudioContext: AudioContext | null = null
const hudNotificationAudioElements = new Map<HudNotificationKind, HTMLAudioElement>()
const voiceSignalLastPlayedAt = new Map<HudNotificationKind, number>()
let hudNotificationLastLine = ""
let hudNotificationLastAt: Date | null = null
let resizeObserver: ResizeObserver | null = null
let socket: WebSocket | undefined
let nextRequestId = 1
let framedModuleKey = ""
let interpreterViewPointRestoreAttempted = false
let interpreterViewPointRestored = false
let pendingInterpreterViewPointSnapshot: UiRuntimeViewPointSnapshot | null = null
let interpreterViewPointStoreTimer: number | null = null
const interpreterDisplayPositions = readStoredInterpreterDisplayPositions()
let interpreterDisplayPositionsStoreTimer: number | null = null

const moduleSnapshots = new Map<string, ModulePaneSnapshot>()
const moduleDisplays = new Map<string, ModuleDisplayController>()
const moduleDisplayIds = new Set<string>()
let moduleOrder: string[] = []
const sqliteDisplays = new Map<string, SqliteDisplayController>()
const sqliteDisplayIds = new Set<string>()
let sqliteOrder: string[] = []

const pendingRequests = new Map<number, {
  timer: number
  resolve: (reply: CommandReply) => void
}>()

for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
  const url = new URL(link.href, location.origin)
  url.searchParams.set("t", String(Date.now()))
  link.href = url.toString()
}

window.addEventListener("beforeunload", () => {
  flushInterpreterViewPointStorage()
  flushInterpreterDisplayPositionsStorage()
})
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "hidden") return
  flushInterpreterViewPointStorage()
  flushInterpreterDisplayPositionsStorage()
})

installVoiceServiceMonitor()
installHudNotificationSoundUnlock()
connect()
void initEngine()

function connect(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
  socket = new WebSocket(url)

  socket.addEventListener("message", (event) => {
    let msg: ServerMessage
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : "") as ServerMessage
    } catch {
      return
    }
    handleServerMessage(msg)
  })

  socket.addEventListener("close", () => {
    rejectPendingRequests("ws closed")
    for (const controller of moduleDisplays.values()) {
      setModuleSourceState(controller, "disconnected")
      const snapshot = moduleSnapshots.get(controller.id)
      if (snapshot !== undefined) updateModuleHeaderControls(controller, {
        ...snapshot,
        connection: {state: "disconnected", error: "ws closed"},
      })
    }
    setTimeout(connect, 1500)
  })
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "hello":
      applyModuleSnapshots(msg.modules ?? [])
      for (const path of msg.sqliteDatabases ?? []) void openSqliteDisplay(path).catch((error) => console.error(error))
      return
    case "modules":
      applyModuleSnapshots(msg.modules)
      return
    case "module":
      applyModuleSnapshot(msg.module)
      return
    case "module-state":
      applyModuleSnapshot(msg.module, {renderPausedDump: false})
      applyModuleDump(msg.moduleId, msg.dump)
      return
    case "module-resumed":
      applyModuleSnapshot(msg.module)
      markModuleResumed(msg.moduleId)
      return
    case "module-connection":
    case "module-target":
      applyModuleSnapshot(msg.module)
      return
    case "module-protocol-event":
      appendVerbose("protocol", msg.ts, msg.method, msg.params, msg.moduleId)
      return
    case "interpreter-event":
      appendVerbose("interpreter", msg.ts, msg.event, msg.detail, moduleIdFromEventDetail(msg.detail))
      return
    case "source-patched":
      handleSourcePatched(msg)
      return
    case "result":
      resolvePendingRequest(msg)
      pendingRequests.delete(msg.requestId)
      return
    case "ui-host-command":
      void handleUiHostCommand(msg)
      return
    case "hud-todo-changed":
      loadTodoPaneFromPayload(msg.todo)
      return
    case "reload": {
      const url = new URL(window.location.href)
      url.searchParams.set("_r", String(Date.now()))
      window.location.replace(url.toString())
      return
    }
  }
}

async function handleUiHostCommand(msg: Extract<ServerMessage, {type: "ui-host-command"}>): Promise<void> {
  try {
    const result = await executeUiHostCommand(msg.command, msg.params)
    sendUiHostResult(msg.requestId, {ok: true, result})
  } catch (error) {
    sendUiHostResult(msg.requestId, {ok: false, error: error instanceof Error ? error.message : String(error)})
  }
}

function sendUiHostResult(requestId: number, reply: CommandReply): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: "ui-host-result",
    requestId,
    ok: reply.ok,
    ...(reply.result === undefined ? {} : {result: reply.result}),
    ...(reply.error === undefined ? {} : {error: reply.error}),
  }))
}

async function executeUiHostCommand(command: string, params: unknown): Promise<unknown> {
  switch (command) {
    case "space.get":
      return spacePayload()
    case "space.focus":
      return focusSpace(params)
    case "space.frame":
      return frameSpace()
    case "processes.get":
      return processWorkspacePayload(params)
    case "processes.resolve":
      return processWorkspacePayload(params)
    case "processes.focus":
      return focusProcess(params)
    case "processes.action":
      return await runProcessAction(params)
    case "hud.terminal.get":
      return hudTerminalPayload()
    case "hud.terminal.dock":
      return setHudTerminalDocked(true)
    case "hud.terminal.show":
      return setHudTerminalDocked(false)
    case "hud.terminal.toggle":
      return setHudTerminalDocked(!hostTerminalHudDocked)
    case "hud.todo.get":
      return hudTodoPayload()
    case "hud.todo.highlight":
      return setHudTodoHighlight(params)
    case "hud.todo.reload":
      await loadTodoPane()
      return hudTodoPayload()
    case "hud.todo.dock":
      return setHudTodoDocked(true)
    case "hud.todo.show":
      return setHudTodoDocked(false)
    case "hud.todo.toggle":
      return setHudTodoDocked(!todoHudDocked)
    case "sqlite.open":
      return await openSqliteDisplay(sqliteOpenParams(params))
    default:
      throw new Error(`unknown ui-host command: ${command}`)
  }
}

function spacePayload(): {
  mode: string
  activeDisplayId: string | null
  displays: DisplayInfo[]
} {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  return {
    mode: uiCanvas.displayMode,
    activeDisplayId: uiCanvas.activeDisplayId,
    displays: displayInfos(),
  }
}

function focusSpace(params: unknown): unknown {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  const body = objectParam(params)
  const selector = objectParamMaybe(body["selector"]) ?? body
  const view = stringParam(body["view"]) ?? "full"
  const display = resolveDisplay(selector)
  if (display === null) throw new Error("display not found")
  if (view === "full" && body["dockHostTerminal"] === true) setHostTerminalHudDocked(true)
  const focused = uiCanvas.focusDisplay(display.displayId)
  if (!focused) throw new Error(`display not found: ${display.displayId}`)
  const controller = display.kind === "module" ? moduleDisplays.get(display.moduleId) : undefined
  if (controller !== undefined) {
    scrollAgentModuleTerminalToBottom(controller)
    queuePublishModuleContext(controller)
  }
  return {
    resolved: display,
    view,
    ...spacePayload(),
  }
}

function frameSpace(): unknown {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  const displayIds = displayInfos().map((display) => display.displayId)
  if (displayIds.length > 0) uiCanvas.frameDisplays(displayIds)
  return spacePayload()
}

function processWorkspacePayload(params: unknown): unknown {
  const body = objectParam(params)
  const selector = objectParamMaybe(body["selector"]) ?? body
  const display = resolveProcessDisplay(selector)
  const process = processWorkspaceInfo(display.moduleId, display)
  if (process === null) throw new Error(`process not found: ${display.moduleId}`)
  return process
}

function focusProcess(params: unknown): unknown {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  const body = objectParam(params)
  const view = stringParam(body["view"]) ?? "full"
  const resolved = resolveProcessDisplay(params)
  if (view === "full" && body["dockHostTerminal"] === true) setHostTerminalHudDocked(true)
  const focused = uiCanvas.focusDisplay(resolved.displayId)
  if (!focused) throw new Error(`display not found: ${resolved.displayId}`)
  focusProcessTerminal(resolved.moduleId)
  const process = processWorkspaceInfo(resolved.moduleId, displayInfoForModule(resolved.moduleId))
  if (process === null) throw new Error(`process not found: ${resolved.moduleId}`)
  return {
    resolved,
    view,
    process,
    space: spacePayload(),
  }
}

function focusProcessTerminal(moduleId: string): void {
  const controller = moduleDisplays.get(moduleId)
  if (controller === undefined || !canAcceptTerminalInput(controller)) return
  rebuildModuleTerminalOutput(controller)
  syncModuleTerminalInput(controller)
  showModuleTerminalPrompt(controller)
  controller.terminal.moveCursorToLastTextLineEnd()
  controller.terminal.focus()
  scrollAgentModuleTerminalToBottom(controller)
}

async function runProcessAction(params: unknown): Promise<unknown> {
  const body = objectParam(params)
  const action = stringParam(body["action"]) ?? stringParam(body["cmd"]) ?? stringParam(body["command"])
  if (action === undefined) throw new Error("process action must be a string")

  const display = resolveProcessDisplay(body)
  const controller = moduleDisplays.get(display.moduleId)
  if (controller === undefined) throw new Error(`process display controller not found: ${display.moduleId}`)
  const actionParams = objectParamMaybe(body["params"]) ?? body
  let reply: unknown

  switch (action) {
    case "pause":
      reply = await runModuleInterpreterCommand(controller, "pause", {}, t("pause"))
      break
    case "resume":
      reply = await runModuleInterpreterCommand(controller, "resume", {}, t("resume"))
      break
    case "step": {
      const kind = stringParam(actionParams["kind"])
      if (kind !== "over" && kind !== "into" && kind !== "out") throw new Error('step kind must be "over", "into", or "out"')
      reply = await runModuleInterpreterCommand(controller, "step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut"))
      break
    }
    case "eval":
    case "evaluate":
      reply = await evaluateInterpreterExpression(controller, actionParams)
      break
    case "source.open":
    case "openSource":
      reply = await openInterpreterSource(controller, actionParams)
      break
    case "source.openSelection":
    case "openSelection":
      reply = await openInterpreterSelectedSource(controller)
      break
    case "restart":
      await restartModule(controller.id)
      reply = {ok: true}
      break
    case "stop":
      await stopModule(controller.id)
      reply = {ok: true}
      break
    case "showExecutionPoint":
    case "show-execution-point":
      showModuleExecutionPoint(controller)
      reply = {ok: true}
      break
    default:
      throw new Error(`unknown process action: ${action}`)
  }

  return {
    resolved: display,
    action,
    reply,
    process: processWorkspaceInfo(controller.id, displayInfoForModule(controller.id)),
  }
}

async function evaluateInterpreterExpression(controller: ModuleDisplayController, params: Record<string, unknown>): Promise<unknown> {
  const expr = stringParam(params["expr"]) ?? stringParam(params["expression"])
  if (expr === undefined) throw new Error("evaluate expr must be a string")
  const frame = numberParam(params["frame"]) ?? controller.activeFrameIndex
  if (!Number.isInteger(frame) || frame < 0) throw new Error("evaluate frame must be a non-negative integer")

  rebuildModuleTerminalOutput(controller)
  appendAgentModuleTerminal(controller, {
    ts: new Date().toISOString(),
    level: "agent",
    text: `> ${expr}`,
  })

  const response = await runModuleInterpreterCommand(controller, "eval", {frame, expr}, t("runExpression"))
  if (!response.ok) {
    syncModuleTerminalInput(controller)
    return response
  }

  const formattedAnsi = await formatTerminalExpressionResult(response.result, async (objectId) => {
    const props = await runModuleInterpreterCommand(controller, "props", {
      objectId,
      ownProperties: true,
    }, t("runExpression"))
    if (!props.ok) throw new Error(props.error ?? "props failed")
    return props.result
  })
  appendAgentModuleTerminal(controller, {
    ts: new Date().toISOString(),
    level: "agent",
    text: `=> ${formattedAnsi}`,
  })
  syncModuleTerminalInput(controller)
  return {
    ...response,
    formatted: stripAnsi(formattedAnsi),
    formattedAnsi,
  }
}

async function openInterpreterSource(controller: ModuleDisplayController, params: Record<string, unknown>): Promise<unknown> {
  const directSourceUrl = stringParam(params["sourceUrl"])
    ?? stringParam(params["path"])
    ?? stringParam(params["modulePath"])
  const specifier = stringParam(params["specifier"])
  const sourceUrl = directSourceUrl ?? (specifier === undefined ? undefined : resolveSourceSpecifier(controller, specifier))
  if (sourceUrl === undefined) throw new Error("source.open requires sourceUrl, path, modulePath, or specifier")
  if (isSqliteSourcePath(sourceUrl)) return await openSqliteDisplay(sourceUrl)
  const options: SourceOpenOptions = {}
  const line = numberParam(params["line"])
  const column = numberParam(params["column"])
  if (line !== undefined) options.line = line
  if (column !== undefined) options.column = column
  return await openWorkspaceSource(controller, sourceUrl, options)
}

async function openInterpreterSelectedSource(controller: ModuleDisplayController): Promise<unknown> {
  const selectedText = controller.sourceContext.selection?.text.trim() ?? ""
  if (selectedText.length === 0) throw new Error("source.openSelection requires selected source text")
  const specifier = importSpecifierFromText(selectedText)
  if (specifier === undefined) throw new Error(`selected text does not contain an import specifier: ${selectedText}`)
  const sourceUrl = resolveSourceSpecifier(controller, specifier)
  const result = await openWorkspaceSource(controller, sourceUrl)
  return {
    specifier,
    selection: selectedText,
    sourceUrl,
    result,
  }
}

type SqliteOpenParams = {
  path: string
  table?: string
}

type SourceOpenOptions = {
  line?: number
  column?: number
}

async function openSqliteDisplay(input: string | SqliteOpenParams): Promise<unknown> {
  const path = typeof input === "string" ? input : input.path
  const table = typeof input === "string" ? undefined : input.table
  try {
    const payload = await fetchSqlitePayload(path, table)
    const controller = ensureSqliteDisplayController(payload.path)
    applySqlitePayload(controller, payload)
    syncModuleDisplays()
    return sqliteDisplayPayload(controller)
  } catch (error) {
    if (!isSqliteMissingError(error)) {
      throw error
    }
    const controller = ensureSqliteDisplayController(path)
    clearSqlitePayload(controller, `Waiting for SQLite database: ${sqliteInitialLabel(path)}`)
    syncModuleDisplays()
    waitForSqliteDatabase(controller, path, table)
    return sqliteDisplayPayload(controller)
  }
}

function ensureSqliteDisplayController(path: string): SqliteDisplayController {
  const existing = sqliteDisplayForPath(path)
  if (existing !== null) return existing
  const id = sqliteDisplayKey(path)
  const controller = createSqliteDisplayController(id, path)
  sqliteDisplays.set(id, controller)
  sqliteOrder = [...sqliteOrder.filter((item) => item !== id), id]
  controller.rows.setStatus(`Waiting for SQLite database: ${sqliteInitialLabel(path)}`)
  return controller
}

function sqliteDisplayForPath(path: string): SqliteDisplayController | null {
  for (const controller of sqliteDisplays.values()) {
    if (controller.requestedPath === path || controller.path === path) return controller
  }
  return sqliteDisplays.get(sqliteDisplayKey(path)) ?? null
}

function waitForSqliteDatabase(controller: SqliteDisplayController, path: string, table?: string, notBefore?: string): void {
  if (controller.loading !== null) return
  let loading!: Promise<void>
  loading = (async () => {
    await Promise.resolve()
    let attempts = 0
    while (controller.loading === loading) {
      attempts += 1
      clearSqlitePayload(controller, `Waiting for SQLite database: ${sqliteInitialLabel(path)}`)
      try {
        const payload = await fetchSqlitePayload(path, table, notBefore)
        if (controller.loading !== loading) return
        applySqlitePayload(controller, payload)
        return
      } catch (error) {
        if (!isSqliteMissingError(error)) {
          clearSqlitePayload(controller, error instanceof Error ? error.message : String(error))
          return
        }
        const nextDelay = Math.min(3_000, SQLITE_OPEN_RETRY_MS + attempts * 100)
        await delay(nextDelay)
      }
    }
  })()
  controller.loading = loading
  void loading.finally(() => {
    if (controller.loading === loading) controller.loading = null
  })
}

function sqliteOpenParams(params: unknown): SqliteOpenParams {
  const direct = stringParam(params)
  if (direct !== undefined) return {path: direct}
  const body = objectParam(params)
  const path = stringParam(body["path"])
    ?? stringParam(body["sourceUrl"])
    ?? stringParam(body["modulePath"])
    ?? stringParam(body["database"])
  if (path === undefined) throw new Error("sqlite.open requires path")
  const table = stringParam(body["table"])
  return table === undefined ? {path} : {path, table}
}

function refreshSqliteDisplaysAfterTargetRestart(startedAt: string): void {
  for (const controller of sqliteDisplays.values()) {
    void refreshSqliteDisplay(controller, controller.selectedTable, startedAt).catch(() => undefined)
  }
}

async function refreshSqliteDisplay(controller: SqliteDisplayController, table = controller.selectedTable, notBefore?: string): Promise<SqliteDatabasePayload | null> {
  let payload: SqliteDatabasePayload | null = null
  let missing = false
  const loading = (async () => {
    controller.rows.setStatus("Loading SQLite database")
    payload = await fetchSqlitePayload(controller.path, table ?? undefined, notBefore)
    applySqlitePayload(controller, payload)
  })()
  controller.loading = loading
  try {
    await loading
  } catch (error) {
    if (isSqliteMissingError(error)) {
      missing = true
      clearSqlitePayload(controller, `Waiting for SQLite database: ${sqliteInitialLabel(controller.requestedPath)}`)
    } else {
      clearSqlitePayload(controller, error instanceof Error ? error.message : String(error))
      throw error
    }
  } finally {
    if (controller.loading === loading) controller.loading = null
  }
  if (missing) {
    waitForSqliteDatabase(controller, controller.requestedPath, table ?? undefined, notBefore)
    return null
  }
  if (payload === null) {
    clearSqlitePayload(controller, "SQLite payload was not loaded")
    return null
  }
  return payload
}

async function updateSqliteDisplayCell(
  controller: SqliteDisplayController,
  rowid: number,
  column: string,
  value: SqliteCellValue,
): Promise<SqliteDatabasePayload> {
  if (controller.selectedTable === null) throw new Error("sqlite table is not selected")
  const response = await fetch("/sqlite/cell", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      path: controller.path,
      table: controller.selectedTable,
      rowid,
      column,
      value,
    }),
  })
  if (!response.ok) throw await sqliteResponseError(response)
  const payload = await response.json() as SqliteDatabasePayload
  applySqlitePayload(controller, payload)
  return payload
}

async function fetchSqlitePayload(path: string, table?: string, notBefore?: string): Promise<SqliteDatabasePayload> {
  const params = new URLSearchParams({path})
  if (table !== undefined && table.length > 0) params.set("table", table)
  if (notBefore !== undefined && notBefore.length > 0) params.set("notBefore", notBefore)
  const response = await fetch(`/sqlite?${params.toString()}`)
  if (!response.ok) throw await sqliteResponseError(response)
  const payload = await response.json() as SqliteDatabasePayload
  if (payload?.ok !== true) throw new Error("sqlite payload is invalid")
  return payload
}

async function sqliteResponseError(response: Response): Promise<Error> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as {error?: unknown}
    const error = parsed.error
    if (typeof error === "object" && error !== null && typeof (error as {message?: unknown}).message === "string") {
      return new Error((error as {message: string}).message)
    }
    if (typeof error === "string") return new Error(error)
  } catch {
    // Use raw response text below.
  }
  return new Error(text.length > 0 ? text : `sqlite request failed: ${response.status}`)
}

function applySqlitePayload(controller: SqliteDisplayController, payload: SqliteDatabasePayload): void {
  controller.path = payload.path
  controller.label = payload.label
  controller.selectedTable = payload.selectedTable
  controller.payload = payload
  controller.suppressTableSelectionOpen = true
  try {
    controller.tables.setTitle(payload.label)
    controller.tables.setItems(sqliteTableItems(payload))
    controller.tables.setSelectedIds(payload.selectedTable === null ? [] : [sqliteTableItemId(payload.selectedTable)])
  } finally {
    controller.suppressTableSelectionOpen = false
  }
  controller.rows.setPayload(payload)
}

function clearSqlitePayload(controller: SqliteDisplayController, status: string): void {
  controller.selectedTable = null
  controller.payload = null
  controller.suppressTableSelectionOpen = true
  try {
    controller.tables.setTitle(controller.label)
    controller.tables.setItems([])
    controller.tables.setSelectedIds([])
  } finally {
    controller.suppressTableSelectionOpen = false
  }
  controller.rows.clearPayload(status)
}

function sqliteDisplayPayload(controller: SqliteDisplayController): unknown {
  return {
    id: controller.id,
    displayId: sqliteDisplayId(controller.id),
    path: controller.path,
    label: controller.label,
    selectedTable: controller.selectedTable,
    ready: controller.payload !== null,
    loading: controller.loading !== null,
    tables: controller.payload?.tables ?? [],
    rowCount: controller.payload?.rows.length ?? 0,
  }
}

function sqliteTableItems(payload: SqliteDatabasePayload): FileListItem[] {
  return payload.tables.map((table) => ({
    id: sqliteTableItemId(table.name),
    name: table.name,
    kind: "file",
    path: table.name,
    sizeLabel: table.rowCount === null ? table.type : `${table.rowCount}`,
    statusLabel: table.type,
  }))
}

function sqliteTableItemId(name: string): string {
  return `sqlite-table:${encodeURIComponent(name)}`
}

function sqliteDisplayKey(path: string): string {
  const normalized = path.trim().replaceAll("\\", "/")
  const leaf = normalized.split("/").pop()?.replace(/\.sqlite$/i, "") ?? "database"
  const slug = leaf.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "database"
  return `${slug}-${stableStringHash(normalized)}`
}

function stableStringHash(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sqliteInitialLabel(path: string): string {
  const clean = path.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  return clean.split("/").pop() ?? clean
}

function isSqliteSourcePath(path: string): boolean {
  return /\.sqlite(?:[?#].*)?$/i.test(path.trim().replaceAll("\\", "/"))
}

function isSqliteMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /sqlite database not found|sqlite database not ready|unable to open database file|no such file/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function setHudTerminalDocked(docked: boolean): unknown {
  ensureHostTerminalController()
  setHostTerminalHudDocked(docked)
  return hudTerminalPayload()
}

function hudTerminalPayload(): unknown {
  const controller = hostTerminal
  const frame = controller === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(controller.hudTerminal)
  return {
    docked: hostTerminalHudDocked,
    sessionId: controller?.sessionId ?? readStoredHostTerminalSessionId(),
    status: controller?.connectionState ?? "idle",
    statusLabel: hostTerminalStatusLabelForLayout,
    rect: frame?.rect ?? null,
    dockPlacement: hostTerminalDockPlacement,
  }
}

function setHudTodoDocked(docked: boolean): unknown {
  setTodoHudDocked(docked)
  return hudTodoPayload()
}

function hudTodoPayload(): unknown {
  const frame = todoPane === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(todoPane)
  return {
    docked: todoHudDocked,
    rect: frame?.rect ?? null,
    dockPlacement: todoDockPlacement,
    context: todoContextSnapshot(),
  }
}

function setHudTodoHighlight(params: unknown): unknown {
  if (todoPane === null) throw new Error("TODO pane is not ready")
  const ids = todoHighlightIdsFromParams(params)
  todoPane.setHighlightedIds(ids)
  return hudTodoPayload()
}

function todoHighlightIdsFromParams(params: unknown): string[] {
  const body = objectParam(params)
  const rawIds = body["highlightedIds"] ?? body["ids"]
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((item): item is string => typeof item === "string")
    : []
  const id = stringParam(body["id"]) ?? stringParam(body["itemId"])
  if (id !== undefined) ids.push(id)
  return [...new Set(ids)]
}

function displayInfos(): DisplayInfo[] {
  if (uiCanvas === null) return []
  const runtimeDisplays = new Map(uiCanvas.displaySnapshots().map((display) => [display.id, display]))
  const displays: DisplayInfo[] = []
  let order = 0
  for (const moduleId of moduleOrder) {
    const displayId = moduleDisplayId(moduleId)
    const runtimeDisplay = runtimeDisplays.get(displayId)
    const snapshot = moduleSnapshots.get(moduleId)
    if (runtimeDisplay === undefined || snapshot === undefined) continue
    displays.push({
      ...runtimeDisplay,
      displayId,
      kind: "module",
      moduleId,
      label: snapshot.label,
      order: order++,
    })
  }
  for (const sqliteId of sqliteOrder) {
    const displayId = sqliteDisplayId(sqliteId)
    const runtimeDisplay = runtimeDisplays.get(displayId)
    const controller = sqliteDisplays.get(sqliteId)
    if (runtimeDisplay === undefined || controller === undefined) continue
    displays.push({
      ...runtimeDisplay,
      displayId,
      kind: "sqlite",
      moduleId: null,
      sqliteId,
      path: controller.path,
      label: controller.label,
      order: order++,
    })
  }
  return displays
}

function displayInfoForModule(moduleId: string): ModuleDisplayInfo | null {
  return displayInfos().find((display): display is ModuleDisplayInfo => display.kind === "module" && display.moduleId === moduleId) ?? null
}

function processWorkspaceInfo(moduleId: string, display: ModuleDisplayInfo | null): ProcessWorkspaceInfo | null {
  const module = moduleSnapshots.get(moduleId)
  if (module === undefined) return null
  const controller = moduleDisplays.get(moduleId)
  const currentFrame = controller?.dump?.frames[controller.activeFrameIndex]
    ?? module.dump?.frames[0]
    ?? null
  const {output: _output, ...targetWithoutOutput} = module.target
  const commandIdle = controller?.activeCommand === null
  const targetRunning = module.target.state === "starting" || module.target.state === "running"
  const targetFinished = module.target.state === "exited" || module.target.state === "failed"
  const connected = module.connection.state === "connected"
  const pausedWithContext = connected && module.paused && module.dump !== null && !targetFinished
  return {
    id: module.id,
    processId: module.id,
    kind: "process",
    moduleId: module.id,
    displayId: moduleDisplayId(module.id),
    label: module.label,
    order: display?.order ?? moduleOrder.indexOf(module.id),
    content: {
      kind: "module",
      moduleId: module.id,
      processId: module.id,
      modulePath: module.modulePath,
    },
    display,
    runtime: {
      protocolUrl: module.protocolUrl,
      connection: module.connection,
      paused: module.paused,
      scriptCount: module.scriptCount,
      hasDump: module.hasDump,
      target: {
        ...targetWithoutOutput,
        outputTail: module.target.output.slice(-50),
      },
    },
    ui: {
      source: {
        state: controller?.sourceRuntimeState ?? null,
        location: controller?.sourceLocation ?? "",
        identity: controller?.sourceIdentity ?? null,
        dirty: controller?.sourceDirty ?? false,
        cursor: controller?.sourceContext.cursor ?? null,
        selection: controller?.sourceContext.selection ?? null,
      },
      context: controller === undefined ? null : moduleCurrentContextPayload(controller),
      activeFrameIndex: controller?.activeFrameIndex ?? null,
      currentFrame,
      terminal: {
        canAcceptInput: controller === undefined ? false : canAcceptTerminalInput(controller),
        focused: controller?.terminal.isFocused() ?? false,
        pendingInput: controller?.terminalInput.buffer ?? "",
        promptVisible: controller?.terminalInput.promptVisible ?? false,
        textTail: controller === undefined ? [] : terminalTextTail(controller.terminal, 20),
      },
      activeCommand: controller?.activeCommand ?? null,
      verboseVisible: controller?.verboseVisible ?? false,
    },
    capabilities: {
      pause: commandIdle && connected && targetRunning && !module.paused,
      resume: commandIdle && pausedWithContext,
      step: commandIdle && pausedWithContext,
      evaluate: commandIdle && controller !== undefined && canAcceptTerminalInput(controller),
      sourceOpen: controller !== undefined,
      restart: commandIdle && module.target.command.length > 0,
      stop: commandIdle && targetRunning,
      showExecutionPoint: commandIdle && pausedWithContext && currentFrame !== null,
    },
  }
}

function emptySourceInteractionContext(): SourceInteractionContext {
  return {
    cursor: {line: 1, column: 0},
    selection: null,
  }
}

function sourceContextPosition(pos: {line: number; col: number}): SourceContextPosition {
  return {
    line: Math.max(1, Math.floor(pos.line) + 1),
    column: Math.max(0, Math.floor(pos.col)),
  }
}

function sourceContextFromEditorSnapshot(snapshot: EditorSelectionSnapshot): SourceInteractionContext {
  return {
    cursor: sourceContextPosition(snapshot.cursor),
    selection: snapshot.range === null || snapshot.anchor === null || snapshot.focus === null
      ? null
      : {
          anchor: sourceContextPosition(snapshot.anchor),
          focus: sourceContextPosition(snapshot.focus),
          start: sourceContextPosition(snapshot.range.start),
          end: sourceContextPosition(snapshot.range.end),
          text: snapshot.text,
        },
  }
}

function currentFrameContext(frame: FrameSnapshot | null): ModuleCurrentContext["currentFrame"] {
  if (frame === null) return null
  return {
    index: frame.index,
    function: frame.function,
    url: frame.url,
    line: frame.line,
    column: frame.column,
    ...(frame.sourceKind === undefined ? {} : {sourceKind: frame.sourceKind}),
    ...(frame.scriptId === undefined ? {} : {scriptId: frame.scriptId}),
  }
}

function moduleCurrentContextPayload(controller: ModuleDisplayController): ModuleCurrentContext {
  const snapshot = moduleSnapshots.get(controller.id)
  const display = displayInfoForModule(controller.id)
  const currentFrame = controller.dump?.frames[controller.activeFrameIndex]
    ?? snapshot?.dump?.frames[0]
    ?? null
  return {
    processId: controller.id,
    moduleId: controller.id,
    displayId: moduleDisplayId(controller.id),
    label: snapshot?.label ?? controller.id,
    updatedAt: new Date().toISOString(),
    display: display === null ? null : {
      active: display.active,
      visible: display.visible,
      order: display.order,
    },
    source: {
      state: controller.sourceRuntimeState,
      location: controller.sourceLocation,
      identity: controller.sourceIdentity,
      dirty: controller.sourceDirty,
      cursor: controller.sourceContext.cursor,
      selection: controller.sourceContext.selection,
    },
    activeFrameIndex: controller.activeFrameIndex,
    currentFrame: currentFrameContext(currentFrame),
    scopes: controller.scopes.contextSnapshot(),
    terminal: {
      focused: controller.terminal.isFocused(),
      pendingInput: controller.terminalInput.buffer,
      promptVisible: controller.terminalInput.promptVisible,
    },
    hud: {
      todo: todoContextSnapshot(),
    },
  }
}

function queuePublishModuleContext(controller: ModuleDisplayController): void {
  if (controller.contextPublishQueued) return
  controller.contextPublishQueued = true
  window.requestAnimationFrame(() => {
    controller.contextPublishQueued = false
    publishModuleContext(controller)
  })
}

function publishModuleContext(controller: ModuleDisplayController): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: "module-context",
    moduleId: controller.id,
    context: moduleCurrentContextPayload(controller),
  }))
}

function resolveProcessDisplay(params: unknown): ModuleDisplayInfo {
  const body = objectParam(params)
  const selector = objectParamMaybe(body["selector"]) ?? body
  const display = resolveDisplay(selector)
  if (display === null) throw new Error("process display not found")
  if (display.kind !== "module") throw new Error(`display is not a process: ${display.displayId}`)
  return display
}

function resolveDisplay(selector: Record<string, unknown>): DisplayInfo | null {
  const displays = displayInfos()
  if (displays.length === 0) return null

  const displayId = stringParam(selector["displayId"]) ?? stringParam(selector["id"])
  if (displayId !== undefined) return displays.find((display) => display.displayId === displayId || display.id === displayId) ?? null

  const processId = stringParam(selector["processId"])
  if (processId !== undefined) return displays.find((display) => display.kind === "module" && display.moduleId === processId) ?? null

  const moduleId = stringParam(selector["moduleId"])
  if (moduleId !== undefined) return displays.find((display) => display.kind === "module" && display.moduleId === moduleId) ?? null

  const sqliteId = stringParam(selector["sqliteId"])
  if (sqliteId !== undefined) return displays.find((display) => display.kind === "sqlite" && display.sqliteId === sqliteId) ?? null

  const path = stringParam(selector["path"])
  if (path !== undefined) return displays.find((display) => display.kind === "sqlite" && display.path === path) ?? null

  const order = numberParam(selector["order"]) ?? numberParam(selector["index"])
  if (order !== undefined && Number.isInteger(order)) return displays.find((display) => display.order === order) ?? null

  const label = stringParam(selector["label"])
  if (label !== undefined) {
    const normalized = label.trim().toLowerCase()
    const found = displays.find((display) => display.label.toLowerCase() === normalized)
      ?? displays.find((display) => display.label.toLowerCase().includes(normalized))
    if (found !== undefined) return found
  }

  const side = sideParam(selector["side"])
  if (side !== undefined) return resolveDisplaySide(displays, side)

  return displays.find((display) => display.active) ?? displays[0] ?? null
}

function resolveDisplaySide(displays: DisplayInfo[], side: DisplaySelectorSide): DisplayInfo | null {
  const visible = displays.filter((display) => display.visible && display.screenCenter !== null)
  const candidates = visible.length > 0 ? visible : displays.filter((display) => display.screenCenter !== null)
  if (candidates.length === 0) return displays[0] ?? null
  const sorted = [...candidates]
  if (side === "left") sorted.sort((left, right) => left.screenCenter!.x - right.screenCenter!.x)
  else if (side === "right") sorted.sort((left, right) => right.screenCenter!.x - left.screenCenter!.x)
  else if (side === "top") sorted.sort((left, right) => left.screenCenter!.y - right.screenCenter!.y)
  else if (side === "bottom") sorted.sort((left, right) => right.screenCenter!.y - left.screenCenter!.y)
  else {
    const viewportCenter = {x: engineCanvas.clientWidth / 2, y: engineCanvas.clientHeight / 2}
    sorted.sort((left, right) => {
      const leftDistance = Math.hypot(left.screenCenter!.x - viewportCenter.x, left.screenCenter!.y - viewportCenter.y)
      const rightDistance = Math.hypot(right.screenCenter!.x - viewportCenter.x, right.screenCenter!.y - viewportCenter.y)
      return leftDistance - rightDistance
    })
  }
  return sorted[0] ?? null
}

function objectParam(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function objectParamMaybe(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function importSpecifierFromText(text: string): string | undefined {
  const clean = text.trim().replace(/;$/, "").trim()
  const direct = /^["'`]([^"'`]+)["'`]$/.exec(clean)
  if (direct?.[1] !== undefined) return direct[1]
  const dynamicImport = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/.exec(clean)
  if (dynamicImport?.[1] !== undefined) return dynamicImport[1]
  const staticImport = /\bfrom\s*["'`]([^"'`]+)["'`]/.exec(clean)
  if (staticImport?.[1] !== undefined) return staticImport[1]
  const sideEffectImport = /^import\s+["'`]([^"'`]+)["'`]/.exec(clean)
  if (sideEffectImport?.[1] !== undefined) return sideEffectImport[1]
  return clean.includes("/") || /\.(?:c|m)?(?:t|j)sx?$/.test(clean) ? clean : undefined
}

function resolveSourceSpecifier(controller: ModuleDisplayController, specifier: string): string {
  const clean = specifier.trim()
  if (!clean.startsWith(".")) return clean
  const base = currentSourceUrlForResolution(controller)
  if (base === undefined) throw new Error(`cannot resolve relative source specifier without current source: ${specifier}`)
  if (base.startsWith("file:")) return new URL(clean, base).toString()
  return joinSourcePath(sourceDirname(base), clean)
}

function currentSourceUrlForResolution(controller: ModuleDisplayController): string | undefined {
  const candidates = [
    controller.sourceIdentity?.scriptUrl,
    controller.sourceIdentity?.sourceUrl,
    sourcePathFromLocation(controller.sourceLocation),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return stripSourceLine(candidate)
  }
  return undefined
}

function sourceDirname(sourceUrl: string): string {
  const clean = stripSourceLine(sourceUrl).replaceAll("\\", "/").replace(/[?#].*$/, "")
  const idx = clean.lastIndexOf("/")
  if (idx < 0) return ""
  if (idx === 0) return "/"
  return clean.slice(0, idx)
}

function joinSourcePath(baseDir: string, path: string): string {
  const joined = baseDir.length === 0 ? path : `${baseDir.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  const absolute = joined.startsWith("/")
  const parts: string[] = []
  for (const part of joined.replaceAll("\\", "/").split("/")) {
    if (part.length === 0 || part === ".") continue
    if (part === "..") {
      if (parts.length > 0 && parts[parts.length - 1] !== "..") parts.pop()
      else if (!absolute) parts.push(part)
      continue
    }
    parts.push(part)
  }
  return absolute ? `/${parts.join("/")}` : parts.join("/")
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function sideParam(value: unknown): DisplaySelectorSide | undefined {
  if (value !== "left" && value !== "right" && value !== "top" && value !== "bottom" && value !== "center") return undefined
  return value
}

function scheduleInterpreterViewPointStorage(snapshot: UiRuntimeViewPointSnapshot): void {
  pendingInterpreterViewPointSnapshot = snapshot
  if (interpreterViewPointStoreTimer !== null) return
  interpreterViewPointStoreTimer = window.setTimeout(() => {
    interpreterViewPointStoreTimer = null
    flushInterpreterViewPointStorage()
  }, INTERPRETER_VIEWPOINT_STORE_DELAY_MS)
}

function flushInterpreterViewPointStorage(): void {
  if (interpreterViewPointStoreTimer !== null) {
    window.clearTimeout(interpreterViewPointStoreTimer)
    interpreterViewPointStoreTimer = null
  }
  const snapshot = pendingInterpreterViewPointSnapshot ?? uiCanvas?.viewPointSnapshot() ?? null
  if (snapshot === null) return
  pendingInterpreterViewPointSnapshot = null
  try {
    localStorage.setItem(INTERPRETER_VIEWPOINT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

function readStoredInterpreterViewPoint(): UiRuntimeViewPointSnapshot | null {
  try {
    const raw = localStorage.getItem(INTERPRETER_VIEWPOINT_STORAGE_KEY)
    if (raw === null) return null
    return normalizeStoredInterpreterViewPoint(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeStoredInterpreterViewPoint(value: unknown): UiRuntimeViewPointSnapshot | null {
  const object = objectParamMaybe(value)
  if (object === undefined) return null
  const displayMode = object["displayMode"]
  if (displayMode !== "near" && displayMode !== "far") return null
  const position = viewPointVectorParam(object["position"])
  const target = viewPointVectorParam(object["target"])
  const up = viewPointVectorParam(object["up"])
  if (position === null || target === null || up === null) return null
  const rawActiveDisplayId = object["activeDisplayId"]
  let activeDisplayId: string | null = null
  if (rawActiveDisplayId !== null && rawActiveDisplayId !== undefined) {
    const parsedActiveDisplayId = stringParam(rawActiveDisplayId)
    if (parsedActiveDisplayId === undefined) return null
    activeDisplayId = parsedActiveDisplayId
  }
  return {displayMode, activeDisplayId, position, target, up}
}

function viewPointVectorParam(value: unknown): UiRuntimeViewPointVector | null {
  const object = objectParamMaybe(value)
  if (object === undefined) return null
  const x = numberParam(object["x"])
  const y = numberParam(object["y"])
  const z = numberParam(object["z"])
  if (x === undefined || y === undefined || z === undefined) return null
  return {x, y, z}
}

function displayCenterWithStored(displayId: string, fallback: UiRuntimeViewPointVector): UiRuntimeViewPointVector {
  return interpreterDisplayPositions.get(displayId) ?? fallback
}

function storeInterpreterDisplayPosition(change: UiRuntimeDisplayCenterChange): void {
  interpreterDisplayPositions.set(change.displayId, change.centerMm)
  scheduleInterpreterDisplayPositionsStorage()
}

function scheduleInterpreterDisplayPositionsStorage(): void {
  if (interpreterDisplayPositionsStoreTimer !== null) return
  interpreterDisplayPositionsStoreTimer = window.setTimeout(() => {
    interpreterDisplayPositionsStoreTimer = null
    flushInterpreterDisplayPositionsStorage()
  }, INTERPRETER_DISPLAY_POSITION_STORE_DELAY_MS)
}

function flushInterpreterDisplayPositionsStorage(): void {
  if (interpreterDisplayPositionsStoreTimer !== null) {
    window.clearTimeout(interpreterDisplayPositionsStoreTimer)
    interpreterDisplayPositionsStoreTimer = null
  }
  try {
    localStorage.setItem(
      INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(interpreterDisplayPositions.entries())),
    )
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

function readStoredInterpreterDisplayPositions(): Map<string, UiRuntimeViewPointVector> {
  try {
    const raw = localStorage.getItem(INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY)
    if (raw === null) return new Map()
    return normalizeStoredInterpreterDisplayPositions(JSON.parse(raw))
  } catch {
    return new Map()
  }
}

function normalizeStoredInterpreterDisplayPositions(value: unknown): Map<string, UiRuntimeViewPointVector> {
  const object = objectParamMaybe(value)
  if (object === undefined) return new Map()
  const positions = new Map<string, UiRuntimeViewPointVector>()
  for (const [displayId, rawPosition] of Object.entries(object)) {
    const position = viewPointVectorParam(rawPosition)
    if (position !== null) positions.set(displayId, position)
  }
  return positions
}

function applyModuleSnapshots(modules: ModulePaneSnapshot[]): void {
  if (modules.length === 0) return
  const nextModuleOrder = modules.map((module) => module.id)
  const orderChanged = nextModuleOrder.length !== moduleOrder.length
    || nextModuleOrder.some((id, index) => id !== moduleOrder[index])
  moduleOrder = nextModuleOrder
  for (const module of modules) moduleSnapshots.set(module.id, module)
  if (orderChanged || nextModuleOrder.some((id) => !moduleDisplayIds.has(id))) {
    syncModuleDisplays()
  }
  for (const module of modules) {
    const controller = moduleDisplays.get(module.id)
    if (controller !== undefined) {
      updateModuleDisplay(controller, module)
      queuePublishModuleContext(controller)
    }
  }
}

function applyModuleSnapshot(module: ModulePaneSnapshot, options: {renderPausedDump?: boolean} = {}): void {
  const existingModule = moduleOrder.includes(module.id)
  moduleSnapshots.set(module.id, module)
  if (!existingModule) moduleOrder.push(module.id)
  if (!existingModule || !moduleDisplayIds.has(module.id)) syncModuleDisplays()
  const controller = moduleDisplays.get(module.id)
  if (controller !== undefined) updateModuleDisplay(controller, module, options)
}

function appendVerbose(kind: "protocol" | "interpreter", ts: string, name: string, payload: unknown, moduleId?: string): void {
  if (moduleId !== undefined) {
    moduleDisplays.get(moduleId)?.verbose.append(kind, ts, name, payload)
    return
  }
  for (const controller of moduleDisplays.values()) controller.verbose.append(kind, ts, name, payload)
}

function moduleIdFromEventDetail(detail: unknown): string | undefined {
  if (typeof detail !== "object" || detail === null) return undefined
  const event = detail as Record<string, unknown>
  const moduleId = event["moduleId"]
  return typeof moduleId === "string" && moduleId.length > 0 ? moduleId : undefined
}

function send(cmd: string, params: Record<string, unknown>, moduleId: string): Promise<CommandReply> {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ok: false, error: "ws not connected"})
  }
  const requestId = nextRequestId++
  return new Promise<CommandReply>((resolve) => {
    const timer = window.setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve({ok: false, error: `${cmd} timed out after ${COMMAND_TIMEOUT_MS}ms`})
    }, COMMAND_TIMEOUT_MS)
    pendingRequests.set(requestId, {timer, resolve})
    socket!.send(JSON.stringify({type: "command", cmd, params, requestId, moduleId}))
  })
}

function resolvePendingRequest(msg: Extract<ServerMessage, {type: "result"}>): void {
  const pending = pendingRequests.get(msg.requestId)
  if (pending === undefined) return
  window.clearTimeout(pending.timer)
  const reply: CommandReply = {ok: msg.ok}
  if (msg.result !== undefined) reply.result = msg.result
  if (msg.error !== undefined) reply.error = msg.error
  pending.resolve(reply)
}

function rejectPendingRequests(error: string): void {
  for (const [requestId, pending] of pendingRequests) {
    window.clearTimeout(pending.timer)
    pending.resolve({ok: false, error})
    pendingRequests.delete(requestId)
  }
  for (const controller of moduleDisplays.values()) {
    if (controller.activeCommand === null) continue
    controller.activeCommand = null
  }
}

async function initEngine(): Promise<void> {
  if (uiLoading || uiCanvas !== null) return
  uiLoading = true
  try {
    uiCanvas = await UiRuntime.create(engineCanvas, {
      onViewPointChange: scheduleInterpreterViewPointStorage,
      onDisplayCenterChange: storeInterpreterDisplayPosition,
      virtualDisplay: {
        initial: "near",
        surfaceDisplay: false,
        centerMm: {x: 0, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM},
        farDistanceMm: 1200,
      },
    })
    displayHoverOutlinePane = new DisplayHoverOutlinePane()
    const todoStored = readStoredTodoPanelState()
    todoPane = new ToDoPane({
      title: "TODO.md",
      path: "TODO.md",
      highlightedIds: todoStored.highlightedIds,
      expandedCompletedIds: todoStored.expandedCompletedIds,
      draggable: true,
      resizable: true,
      onContextChange: updateTodoContext,
      onPanelStateChange: storeTodoPanelState,
      onItemCheckedChange: (id, checked) => {
        void updateTodoItemChecked(id, checked)
      },
      onFrameRectPreview: previewTodoHudRect,
      onFrameRectChange: storeTodoHudRectAndRelayout,
      onFrameDockRequest: () => setTodoHudDocked(true),
    })
    voiceHudPane = new VoiceInputHud({
      onToggle: () => void toggleVoiceInput(),
      onMove: storeVoiceHudRect,
      settings: () => ({
        title: t("voiceInput"),
        debugTabLabel: t("voiceDebugTab"),
        phraseGroups: voicePhraseGroupsForHud(),
        deactivationModeLabel: t("voiceDeactivationMode"),
        deactivationModeValue: voiceHudDeactivationMode(readVoiceDeactivationMode()),
        deactivationModeOptions: [
          {value: "phrase", label: t("voiceDeactivationModePhrase")},
          {value: "timeout", label: t("voiceDeactivationModeTimeout")},
          {value: "phrase-timeout", label: t("voiceDeactivationModeBoth")},
        ],
        recognitionTimeoutLabel: t("voiceRecognitionTimeout"),
        recognitionTimeoutValue: readVoiceRecognitionTimeoutSeconds(),
        recognitionTimeoutMinValue: MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS,
        recognitionTimeoutMaxValue: MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS,
        recognitionTimeoutUnitLabel: t("voiceRecognitionTimeoutUnit"),
        recognitionTimeoutDownLabel: t("voiceRecognitionTimeoutDown"),
        recognitionTimeoutUpLabel: t("voiceRecognitionTimeoutUp"),
        signalVolumeLabel: t("voiceMicSignalVolume"),
        signalVolumeValue: readVoiceSignalVolume(),
        signalVolumeMaxValue: MAX_VOICE_SIGNAL_VOLUME,
        signalVolumeDownLabel: t("voiceSignalVolumeDown"),
        signalVolumeUpLabel: t("voiceSignalVolumeUp"),
        fuzzyDownLabel: t("voiceFuzzyToleranceDown"),
        fuzzyUpLabel: t("voiceFuzzyToleranceUp"),
        fuzzyHintLabel: t("voiceFuzzyToleranceHint"),
        fuzzyStrictLabel: t("voiceFuzzyToleranceStrict"),
        fuzzyLooseLabel: t("voiceFuzzyToleranceLoose"),
        wakeEndpoint: voiceEndpointLabel(readVoiceWakeUrl()),
        inputEndpoint: voiceEndpointLabel(readVoiceInputUrl()),
        serviceLine: voiceServiceLine(),
        liveLine: voiceSettingsLiveLine(),
        debugLines: voiceDebugLines(),
      }),
      onAddPhrase: addVoicePhrase,
      onRemovePhrase: removeVoicePhrase,
      onResetPhrases: resetVoicePhrases,
      onSignalVolumeChange: storeVoiceSignalVolume,
      onDeactivationModeChange: storeVoiceDeactivationMode,
      onRecognitionTimeoutChange: storeVoiceRecognitionTimeoutSeconds,
      onPhraseFuzzyChange: storeVoiceFuzzyTolerance,
    })
    installEnginePanes()
    void loadTodoPane()
    uiCanvas.handleResize()
    syncModuleDisplays()
    resizeObserver = new ResizeObserver(handleEngineResize)
    resizeObserver.observe(engineCanvas)
    requestAnimationFrame(handleEngineResize)
    window.addEventListener("resize", handleEngineResize)
  } catch (error) {
    console.error("interpreter canvas init failed:", error)
  } finally {
    uiLoading = false
  }
}

function handleEngineResize(): void {
  uiCanvas?.handleResize()
  syncModuleDisplays()
}

function installEnginePanes(): void {
  if (uiCanvas === null || displayHoverOutlinePane === null) return
  uiCanvas.addHudSurface(displayHoverOutlinePane, ({w, h}) => ({x: 0, y: 0, w, h}))
  if (todoPane !== null) {
    uiCanvas.addHudSurface(todoPane, todoHudRect)
  }
  todoDockPane ??= new TodoDockPane(() => setTodoHudDocked(false))
  uiCanvas.addHudSurface(todoDockPane, todoDockRect)
  const host = ensureHostTerminalController()
  uiCanvas.addHudSurface(host.hudTerminal, hostTerminalHudRect)
  if (host.socket === null) connectHostTerminal(host)
  hostTerminalAgentSignalPane ??= new HostTerminalAgentSignalPane()
  uiCanvas.addHudSurface(hostTerminalAgentSignalPane, hostTerminalAgentSignalRect)
  hostTerminalDockPane ??= new HostTerminalDockPane(() => setHostTerminalHudDocked(false))
  uiCanvas.addHudSurface(hostTerminalDockPane, hostTerminalDockRect)
  if (voiceHudPane !== null) {
    uiCanvas.addHudSurface(voiceHudPane, voiceHudRect)
  }
  updateVoiceHud()
  scheduleVoiceAutoWake(500)
}

type TodoMarkdownPayload = {
  ok: true
  path: string
  mtimeMs: number
  size: number
  text: string
}

async function loadTodoPane(): Promise<void> {
  const pane = todoPane
  if (pane === null) return
  try {
    const response = await fetch("/hud/todo")
    if (!response.ok) throw new Error(await response.text())
    const payload = await response.json() as TodoMarkdownPayload
    loadTodoPaneFromPayload(payload)
  } catch (error) {
    pane.setMarkdown(`- [ ] TODO.md не загружен: ${error instanceof Error ? error.message : String(error)}`, "TODO.md")
  }
}

function loadTodoPaneFromPayload(payload: TodoMarkdownPayload | undefined): void {
  if (payload === undefined || todoPane === null) {
    void loadTodoPane()
    return
  }
  todoPane.setMarkdown(payload.text, payload.path)
}

async function updateTodoItemChecked(id: string, checked: boolean): Promise<void> {
  try {
    const response = await fetch(`/hud/todo/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({checked}),
    })
    if (!response.ok) throw new Error(await response.text())
    const payload = await response.json() as TodoMarkdownPayload
    loadTodoPaneFromPayload(payload)
  } catch (error) {
    console.warn("TODO checkbox update failed:", error)
    void loadTodoPane()
  }
}

function updateTodoContext(context: ToDoPaneContextSnapshot): void {
  todoContext = context
  storeTodoPanelState(todoPane?.panelStateSnapshot() ?? {highlightedIds: context.highlightedIds, expandedCompletedIds: []})
  publishTodoContext(context)
  queuePublishAllModuleContexts()
}

function publishTodoContext(context: ToDoPaneContextSnapshot): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: "hud-todo-context",
    context,
  }))
}

function todoContextSnapshot(): ToDoPaneContextSnapshot | null {
  if (todoPane !== null) return todoPane.contextSnapshot()
  return todoContext
}

function queuePublishAllModuleContexts(): void {
  for (const controller of moduleDisplays.values()) queuePublishModuleContext(controller)
}

function readStoredTodoPanelState(): ToDoPanePanelStateSnapshot {
  try {
    const raw = localStorage.getItem(TODO_PANEL_STATE_STORAGE_KEY)
    if (raw === null) return emptyTodoPanelState()
    const object = objectParamMaybe(JSON.parse(raw))
    if (object === undefined) return emptyTodoPanelState()
    return {
      highlightedIds: storedStringArray(object["highlightedIds"]),
      expandedCompletedIds: storedStringArray(object["expandedCompletedIds"]),
    }
  } catch {
    return emptyTodoPanelState()
  }
}

function emptyTodoPanelState(): ToDoPanePanelStateSnapshot {
  return {highlightedIds: [], expandedCompletedIds: []}
}

function storeTodoPanelState(state: ToDoPanePanelStateSnapshot): void {
  try {
    localStorage.setItem(TODO_PANEL_STATE_STORAGE_KEY, JSON.stringify({
      highlightedIds: state.highlightedIds,
      expandedCompletedIds: state.expandedCompletedIds,
    }))
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

function toggleLocale(): void {
  toggleUiLocale()
  if (hostTerminal !== null) {
    for (const pane of hostTerminalPanes(hostTerminal)) {
      pane.setTitle(hostTerminalTitle())
      pane.requestRender()
    }
  }
  hostTerminalAgentSignalPane?.requestRender()
  updateVoiceHud()
  for (const controller of moduleDisplays.values()) {
    controller.source.setTitle(moduleSourceTitle(controller))
    controller.frames.requestRender()
    controller.filesHeader.requestRender()
    controller.files.setTitle(t("sourceFiles"))
    controller.files.requestRender()
    controller.scopes.requestRender()
    controller.terminal.setTitle("")
    controller.terminal.requestRender()
    controller.verbose.requestRender()
    const snapshot = moduleSnapshots.get(controller.id)
    if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
  }
  uiCanvas?.relayout()
}

function setVerboseVisible(controller: ModuleDisplayController, on: boolean): void {
  controller.verboseVisible = on
  localStorage.setItem(moduleVerboseStorageKey(controller.id), on ? "1" : "0")
  const snapshot = moduleSnapshots.get(controller.id)
  if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
  uiCanvas?.relayout()
}

class WorkspaceFilesHeaderPane extends UiSurface {
  #rootLabel: string | null = null
  readonly #onRevealCurrent: () => void
  readonly #onCollapseAll: () => void
  readonly #onExpandAll: () => void

  constructor(onRevealCurrent: () => void, onCollapseAll: () => void, onExpandAll: () => void) {
    super({bgColor: null, borderColor: null})
    this.node.name = "WorkspaceFilesHeaderPane"
    this.#onRevealCurrent = onRevealCurrent
    this.#onCollapseAll = onCollapseAll
    this.#onExpandAll = onExpandAll
  }

  setRootLabel(label: string | null): void {
    if (this.#rootLabel === label) return
    this.#rootLabel = label
    this.requestRender()
  }

  protected render(): void {
    const pad = 8
    const titleX = 16
    const buttonY = 6
    const buttonSize = 24
    const gap = 6
    const revealCurrentLabel = t("sourceRevealCurrent")
    const expandLabel = t("sourceExpandAll")
    const collapseLabel = t("sourceCollapseAll")
    const expandX = Math.max(pad, this.rectW - pad - buttonSize)
    const collapseX = Math.max(pad, expandX - gap - buttonSize)
    const revealCurrentX = Math.max(pad, collapseX - gap - buttonSize)
    const titleW = Math.max(1, revealCurrentX - titleX - 8)

    this.drawText(this.#rootLabel ?? t("sourceFiles"), titleX, 9, {
      fontPx: 13,
      material: this.materials.cyan,
      maxWidthPx: titleW,
    })
    this.#drawHeaderAction(revealCurrentX, buttonY, buttonSize, revealCurrentLabel, "revealCurrent", this.#onRevealCurrent)
    this.#drawHeaderAction(collapseX, buttonY, buttonSize, collapseLabel, "collapse", this.#onCollapseAll)
    this.#drawHeaderAction(expandX, buttonY, buttonSize, expandLabel, "expand", this.#onExpandAll)
    this.drawRect(pad, Math.max(0, this.rectH - 1), Math.max(1, this.rectW - pad * 2), 1, palette.borderDim)
  }

  #drawHeaderAction(x: number, y: number, size: number, label: string, kind: WorkspaceHeaderActionKind, action: () => void): void {
    IconButton(this, x, y, size, size, {
      label,
      iconSrc: workspaceHeaderIcon(kind),
      action,
    })
  }
}

type WorkspaceHeaderActionKind = "revealCurrent" | "collapse" | "expand"

function workspaceHeaderIcon(kind: WorkspaceHeaderActionKind): string {
  if (kind === "revealCurrent") return uiIcons.executionPoint
  if (kind === "collapse") return uiIcons.collapse
  return uiIcons.expand
}

class WorkspaceFilesChromePane extends UiSurface {
  constructor() {
    super({bgColor: palette.bg, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "WorkspaceFilesChromePane"
  }

  protected render(): void {}
}

class SqliteTablePane extends UiSurface {
  #payload: SqliteDatabasePayload | null = null
  #status = "Open SQLite database"
  #scrollX = 0
  #scrollY = 0
  readonly #onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void

  constructor(onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void) {
    super({bgColor: palette.bgCode, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "SqliteTablePane"
    this.#onCellEdit = onCellEdit
  }

  setPayload(payload: SqliteDatabasePayload): void {
    const tableChanged = this.#payload?.path !== payload.path || this.#payload.selectedTable !== payload.selectedTable
    this.#payload = payload
    this.#status = payload.selectedTable === null ? "No tables" : `${payload.selectedTable} · ${payload.rows.length} rows`
    if (tableChanged) {
      this.#scrollX = 0
      this.#scrollY = 0
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
    this.#scrollX = 0
    this.#scrollY = 0
    this.requestRender()
  }

  protected render(): void {
    const payload = this.#payload
    const pad = 14
    const headerH = 58
    this.drawText("SQLite", pad, 10, {fontPx: 13, material: this.materials.cyan, maxWidthPx: 120})
    this.drawText(payload?.label ?? this.#status, 78, 10, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: Math.max(1, this.rectW - 78 - pad),
    })
    this.drawText(this.#status, pad, 34, {
      fontPx: 11,
      material: payload === null ? this.materials.muted : this.materials.green,
      maxWidthPx: Math.max(1, this.rectW - pad * 2),
    })
    this.drawRect(pad, headerH - 1, Math.max(1, this.rectW - pad * 2), 1, palette.borderDim)

    if (payload === null) return
    if (payload.selectedTable === null) {
      this.drawText("No tables in database", pad, headerH + 18, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, this.rectW - pad * 2),
      })
      return
    }

    const schema = sqliteSchemaSummary(payload.schema)
    this.drawText(schema, pad, headerH + 10, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, this.rectW - pad * 2),
    })

    const tableY = headerH + 34
    const tableH = Math.max(1, this.rectH - tableY - pad)
    const columns = sqliteTableColumns(payload)
    const widths = sqliteTableColumnWidths(this, payload, columns)
    const totalW = widths.reduce((sum, width) => sum + width, 0)
    const rowH = 24
    const columnHeaderH = 27
    const rowsViewportH = Math.max(1, tableH - columnHeaderH)
    const maxScrollX = Math.max(0, totalW - this.rectW + pad * 2)
    const maxScrollY = Math.max(0, payload.rows.length * rowH - rowsViewportH)
    this.#scrollX = clampNumber(this.#scrollX, 0, maxScrollX)
    this.#scrollY = clampNumber(this.#scrollY, 0, maxScrollY)
    this.wheel(0, tableY, this.rectW, tableH, (event) => {
      event.preventDefault()
      const horizontalDelta = event.shiftKey ? event.deltaY : event.deltaX
      this.#scrollX = clampNumber(this.#scrollX + horizontalDelta, 0, maxScrollX)
      this.#scrollY = clampNumber(this.#scrollY + event.deltaY, 0, maxScrollY)
      this.requestRender()
    }, "sqlite-table-scroll")

    this.pushClip(pad, tableY, Math.max(1, this.rectW - pad * 2), tableH)
    try {
      this.#renderGrid(payload, columns, widths, pad, tableY, tableH, rowH, columnHeaderH)
    } finally {
      this.popClip()
    }
  }

  #renderGrid(
    payload: SqliteDatabasePayload,
    columns: readonly string[],
    widths: readonly number[],
    x0: number,
    y0: number,
    h: number,
    rowH: number,
    columnHeaderH: number,
  ): void {
    const selectedSummary = payload.tables.find((table) => table.name === payload.selectedTable)
    const editableTable = selectedSummary?.type === "table"
    const firstRow = Math.max(0, Math.floor(this.#scrollY / rowH))
    const rowOffset = this.#scrollY - firstRow * rowH
    const visibleRows = Math.ceil(Math.max(1, h - columnHeaderH) / rowH) + 1
    let x = x0 - this.#scrollX

    this.drawRect(x0, y0, Math.max(1, this.rectW - x0 * 2), columnHeaderH, palette.bgPanel)
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex]!
      const w = widths[columnIndex]!
      this.drawRect(x, y0, 1, h, palette.borderRule)
      this.drawText(column, x + 8, y0 + 8, {
        fontPx: 10,
        material: column === "__rowid" ? this.materials.muted : this.materials.cyan,
        maxWidthPx: Math.max(1, w - 16),
      })
      x += w
    }
    this.drawRect(x, y0, 1, h, palette.borderRule)
    this.drawRect(x0, y0 + columnHeaderH - 1, Math.max(1, this.rectW - x0 * 2), 1, palette.borderDim)

    if (payload.rows.length === 0) {
      this.drawText("No rows", x0 + 10, y0 + columnHeaderH + 16, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, this.rectW - x0 * 2 - 20),
      })
      return
    }

    for (let visibleIndex = 0; visibleIndex < visibleRows; visibleIndex += 1) {
      const rowIndex = firstRow + visibleIndex
      const row = payload.rows[rowIndex]
      if (row === undefined) continue
      const y = y0 + columnHeaderH + visibleIndex * rowH - rowOffset
      if (rowIndex % 2 === 1) this.drawRect(x0, y, Math.max(1, this.rectW - x0 * 2), rowH, palette.bgPanelDim)
      this.drawRect(x0, y + rowH - 1, Math.max(1, this.rectW - x0 * 2), 1, palette.borderRule)
      this.#renderRow(row, rowIndex, columns, widths, x0, y, rowH, editableTable)
    }
  }

  #renderRow(
    row: Record<string, SqliteCellValue>,
    rowIndex: number,
    columns: readonly string[],
    widths: readonly number[],
    x0: number,
    y: number,
    rowH: number,
    editableTable: boolean,
  ): void {
    const rowid = sqliteRowId(row["__rowid"])
    let x = x0 - this.#scrollX
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex]!
      const w = widths[columnIndex]!
      const value = row[column] ?? null
      const editable = editableTable && rowid !== null && column !== "__rowid"
      this.drawText(sqliteCellLabel(value), x + 8, y + 7, {
        fontPx: 10,
        material: column === "__rowid" ? this.materials.muted : value === null ? this.materials.muted : this.materials.text,
        maxWidthPx: Math.max(1, w - 16),
      })
      if (editable && x < this.rectW && x + w > 0) {
        this.hit(x, y, w, rowH, () => this.#editCell(rowid, column, value), {
          key: `sqlite-cell:${rowIndex}:${column}`,
          cursor: "text",
        })
      }
      x += w
    }
  }

  #editCell(rowid: number, column: string, value: SqliteCellValue): void {
    const raw = window.prompt(`Edit ${column}`, sqliteCellPromptValue(value))
    if (raw === null) return
    this.#onCellEdit(rowid, column, sqliteCellInputValue(raw, value))
  }
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

function sqliteTableColumnWidths(surface: UiSurface, payload: SqliteDatabasePayload, columns: readonly string[]): number[] {
  const sampleRows = payload.rows.slice(0, 40)
  return columns.map((column) => {
    let width = surface.measureText(column, 10) + 28
    const schema = payload.schema.find((item) => item.name === column)
    if (schema !== undefined) width = Math.max(width, surface.measureText(schema.type || "value", 9) + 28)
    for (const row of sampleRows) width = Math.max(width, surface.measureText(sqliteCellLabel(row[column] ?? null), 10) + 28)
    const min = column === "__rowid" ? 76 : 104
    return Math.min(260, Math.max(min, Math.ceil(width)))
  })
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

class HostTerminalDockPane extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
  } | null = null
  #suppressRestoreClick = false

  constructor(private readonly onRestore: () => void) {
    super({bgColor: null, borderColor: null})
    this.node.name = "HostTerminalDockPane"
  }

  protected render(): void {
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: "host-terminal-dock-restore",
      edge: currentHostTerminalDockEdge(),
      icon: uiIcons.codex,
      label: HOST_TERMINAL_MODEL_LABEL,
      tone: "neutral",
      tooltip: hostTerminalTitle(),
      onClick: () => this.#restoreFromClick(),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    const point = this.#canvasPoint(event)
    if (point === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    }
    press.timer = setTimeout(() => {
      if (this.#press !== press) return
      press.dragging = true
      this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
    }, HOST_TERMINAL_DOCK_LONG_PRESS_MS)
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
    if (wasDragging) this.#suppressRestoreClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressRestoreClick = false
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    this.#cancelPress()
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
    if (this.#suppressRestoreClick) return
    this.onRestore()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #moveDockToCanvasPoint(point: {x: number; y: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    const placement = hostTerminalDockPlacementFromPoint(point, frame.bounds)
    setHostTerminalDockPlacement(placement)
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }
}

class TodoDockPane extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
  } | null = null
  #suppressRestoreClick = false

  constructor(private readonly onRestore: () => void) {
    super({bgColor: null, borderColor: null})
    this.node.name = "TodoDockPane"
  }

  protected render(): void {
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: "todo-dock-restore",
      edge: currentTodoDockEdge(),
      icon: uiIcons.apply,
      label: "TODO",
      tone: "neutral",
      tooltip: "TODO.md",
      onClick: () => this.#restoreFromClick(),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    const point = this.#canvasPoint(event)
    if (point === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
    }
    press.timer = setTimeout(() => {
      if (this.#press !== press) return
      press.dragging = true
      this.#moveDockToCanvasPoint({x: press.lastX, y: press.lastY})
    }, TODO_DOCK_LONG_PRESS_MS)
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
    if (wasDragging) this.#suppressRestoreClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressRestoreClick = false
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    this.#cancelPress()
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
    if (this.#suppressRestoreClick) return
    this.onRestore()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #moveDockToCanvasPoint(point: {x: number; y: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    const placement = todoDockPlacementFromPoint(point, frame.bounds)
    setTodoDockPlacement(placement)
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }
}

class HostTerminalAgentSignalPane extends UiSurface {
  #open = false

  constructor() {
    super({bgColor: null, borderColor: null})
    this.node.name = "HostTerminalAgentSignalPane"
  }

  isOpen(): boolean {
    return this.#open
  }

  protected render(): void {
    if (this.#open) this.#drawPanel()
    this.#drawToggleButton()
  }

  containsPointer(localX: number, localY: number): boolean {
    const size = HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE
    const buttonX = Math.max(0, this.rectW - size)
    if (localX >= buttonX && localX <= buttonX + size && localY >= 0 && localY <= size) return true
    if (!this.#open) return false
    const panelY = this.#panelY()
    return localX >= 0 && localX <= this.rectW && localY >= panelY && localY <= this.rectH
  }

  #drawToggleButton(): void {
    const size = HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE
    const x = Math.max(0, this.rectW - size)
    const enabled = readHostTerminalAgentSoundEnabled()
    IconButton(this, x, 0, size, size, {
      label: t("terminalAgentSignal"),
      iconSrc: agentSignalIcon(enabled),
      action: () => this.#setOpen(!this.#open),
    })
  }

  #drawPanel(): void {
    const w = this.rectW
    const panelY = this.#panelY()
    const panelH = Math.max(1, this.rectH - panelY)
    const pad = 12
    const enabled = readHostTerminalAgentSoundEnabled()
    const volume = readHostTerminalAgentSoundVolume()
    this.drawRoundedRect(0, panelY, w, panelH, {
      radius: 8,
      fill: palette.bgPanel,
      border: palette.borderDim,
      borderWidth: 1,
      opacity: 0.96,
      z: 0.1,
    })
    this.drawText(t("terminalAgentSignal"), pad, panelY + 10, {
      fontPx: 11,
      material: this.materials.text,
      maxWidthPx: Math.max(1, w - pad * 2 - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE - 8),
      z: 0.32,
    })
    const switchW = 44
    const switchH = 22
    const switchX = Math.max(pad, w - pad - switchW)
    const switchY = panelY + 38
    this.drawText(t("terminalAgentSignalDescription"), pad, panelY + 43, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, switchX - pad - 10),
      z: 0.32,
    })
    Switcher(this, switchX, switchY, switchW, switchH, {
      checked: enabled,
      color: "primary",
      key: "host-terminal-agent-signal-enabled-switch",
      tooltip: t("terminalAgentSignal"),
      onChange: storeHostTerminalAgentSoundEnabled,
      sx: {zIndex: 0.18},
    })
    this.#drawVolumeControl(pad, panelY + 76, Math.max(1, w - pad * 2), volume)
  }

  #drawVolumeControl(x: number, y: number, w: number, value: number): void {
    const maxValue = MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME
    const clamped = clampHostTerminalAgentSoundVolume(value)
    const ratio = maxValue <= 0 ? 0 : clamped / maxValue
    const label = `${t("terminalAgentSignalVolume")}: ${Math.round(clamped * 100)}%`
    this.drawText(label, x, y - 17, {
      fontPx: 9,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, w),
      z: 0.32,
    })

    const buttonW = 28
    IconButton(this, x, y, buttonW, 22, {
      label: t("terminalAgentSignalVolumeDown"),
      iconSrc: uiIcons.minus,
      action: () => this.#setVolume(clamped - 0.1),
    })
    IconButton(this, x + w - buttonW, y, buttonW, 22, {
      label: t("terminalAgentSignalVolumeUp"),
      iconSrc: uiIcons.plus,
      action: () => this.#setVolume(clamped + 0.1),
    })

    const trackX = x + buttonW + 10
    const trackW = Math.max(1, w - buttonW * 2 - 20)
    const trackY = y + 8
    this.drawRoundedRect(trackX, trackY, trackW, 6, {
      radius: 3,
      fill: palette.borderDim,
      border: null,
      opacity: 0.42,
      z: 0.16,
    })
    this.drawRoundedRect(trackX, trackY, Math.max(3, trackW * ratio), 6, {
      radius: 3,
      fill: palette.cyan,
      border: null,
      opacity: 0.64,
      z: 0.18,
    })
    const knobX = trackX + trackW * ratio
    this.drawRoundedRect(knobX - 5, trackY - 4, 10, 14, {
      radius: 5,
      fill: palette.cyan,
      border: palette.borderBright,
      borderWidth: 1,
      opacity: 0.86,
      z: 0.22,
    })
    const setFromPointer = (localX: number): void => this.#setVolume(((localX - trackX) / trackW) * maxValue)
    this.hit(trackX - 4, y, trackW + 8, 22, () => undefined, {
      key: "host-terminal-agent-signal-volume-track",
      cursor: "pointer",
      onPointerDown: (localX) => setFromPointer(localX),
      onPointerMove: (localX) => setFromPointer(localX),
    })
  }

  #setVolume(value: number): void {
    storeHostTerminalAgentSoundVolume(Math.round(clampHostTerminalAgentSoundVolume(value) * 20) / 20)
    this.requestRender()
  }

  #setOpen(open: boolean): void {
    if (this.#open === open) return
    this.#open = open
    relayoutHudSurfaces()
    this.requestRender()
  }

  #panelY(): number {
    return HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE + 6
  }
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

function setVoiceActiveTarget(target: VoiceInputTarget): void {
  const changed = voiceActiveTarget?.kind !== target.kind || voiceActiveTarget.controller !== target.controller
  if (changed) preserveVoicePartialAsTerminalInput()
  voiceActiveTarget = target
  updateVoiceHud()
  if (changed && !voiceAutoWakeInFlight) scheduleVoiceAutoWake()
}

function ensureVoiceInputClient(): VoiceInputClient {
  if (voiceInputClient !== null) return voiceInputClient
  voiceInputClient = new VoiceInputClient({
    url: readVoiceInputUrl,
    wakeUrl: readVoiceWakeUrl,
    activationPhrases: () => readVoicePhrases("activation"),
    deactivationPhrases: () => readVoicePhrases("deactivation"),
    stopPhrases: () => readVoicePhrases("stop"),
    phraseFuzzyTolerance: readVoiceFuzzyTolerance,
    deactivationMode: readVoiceDeactivationMode,
    recognitionTimeoutMs: () => readVoiceRecognitionTimeoutSeconds() * 1000,
    language: "ru",
    context: readVoiceInputContext,
    onStatus: handleVoiceStatus,
    onWake: () => updateVoiceHud("connecting", readVoiceInputUrl()),
    onCommandText: handleVoiceCommandText,
    onPartial: handleVoicePartial,
    onChunk: handleVoiceInputChunk,
    onLevel: updateVoiceLevel,
  })
  return voiceInputClient
}

function handleVoiceStatus(status: VoiceInputStatus, detail?: string): void {
  const previousStatus = voiceHudStatus
  if (status === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) voiceAutoWakePaused = true
  const voiceSignal = voiceSignalForStatusChange(previousStatus, status, detail)
  if (status === "error") {
    voiceLastErrorText = voiceReadableDetail(detail ?? voiceStatusDetail(status))
    voiceLastErrorAt = new Date()
  }
  if (status === "idle") clearVoiceWakePreview()
  if (shouldSubmitVoicePartialForCompletedCommit(previousStatus, status)) {
    submitVoicePartialPreview()
  } else if (shouldPreserveVoicePartialForStatus(previousStatus, status, detail)) {
    preserveVoicePartialAsTerminalInput()
  } else if (status !== "error" && status !== "committing" && (status !== "listening" || detail === undefined || detail === "")) {
    preserveVoicePartialAsTerminalInput()
  }
  updateVoiceHud(status, detail)
  if (voiceSignal !== null) playVoiceSignal(voiceSignal)
}

function voiceSignalForStatusChange(previousStatus: VoiceInputStatus, nextStatus: VoiceInputStatus, detail?: string): HudNotificationKind | null {
  if (nextStatus === "listening" && previousStatus !== "listening" && previousStatus !== "committing") return "activation"
  if (nextStatus === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
  if (nextStatus === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) return "stop"
  return null
}

function playVoiceSignal(kind: HudNotificationKind): void {
  const now = performance.now()
  const lastPlayedAt = voiceSignalLastPlayedAt.get(kind) ?? 0
  if (now - lastPlayedAt < VOICE_SIGNAL_COOLDOWN_MS) return
  voiceSignalLastPlayedAt.set(kind, now)
  voiceHudPane?.flashSoundIndicator()
  playHudNotificationSound(kind)
}

async function toggleVoiceInput(): Promise<void> {
  const client = ensureVoiceInputClient()
  try {
    if (client.active) {
      if (client.status === "waitingWake") {
        voiceAutoWakePaused = false
        await client.startDictation()
        return
      }
      voiceAutoWakePaused = false
      await client.sleepToWake()
      return
    }

    voiceAutoWakePaused = false
    if (voiceActiveTarget === null || !voiceTargetCanAcceptInput(voiceActiveTarget)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return
    }
    const serviceOk = await checkVoiceService()
    if (!serviceOk) {
      flashVoiceHudError(voiceServiceDetail)
      return
    }
    await client.startDictation()
  } catch (error) {
    flashVoiceHudError(error instanceof Error ? error.message : String(error))
  } finally {
    focusVoiceTarget()
  }
}

function focusVoiceTarget(): void {
  const target = voiceActiveTarget
  if (target === null) return
  const terminal = target.kind === "host" ? target.controller.hudTerminal : target.controller.terminal
  uiCanvas?.setFocused(terminal)
}

async function startVoiceWake(reportErrors: boolean): Promise<boolean> {
  const client = ensureVoiceInputClient()
  if (client.active) return true
  if (client.status === "error") client.reset()

  if (voiceActiveTarget === null || !voiceTargetCanAcceptInput(voiceActiveTarget)) {
    if (reportErrors) flashVoiceHudError(t("voiceNoActiveInput"))
    return false
  }

  const serviceOk = await checkVoiceService()
  if (!serviceOk) {
    if (reportErrors) flashVoiceHudError(voiceServiceDetail)
    return false
  }

  try {
    await client.start()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (reportErrors) flashVoiceHudError(message)
    else updateVoiceHud("error", message)
    if (/permission denied|notallowederror|not allowed/i.test(message)) voiceAutoWakePaused = true
    return false
  }
}

function scheduleVoiceAutoWake(delayMs = 0): void {
  if (voiceAutoWakePaused || voiceAutoWakeTimer !== null) return
  voiceAutoWakeTimer = window.setTimeout(() => {
    voiceAutoWakeTimer = null
    void ensureVoiceAutoWake()
  }, delayMs)
}

async function ensureVoiceAutoWake(): Promise<void> {
  if (voiceAutoWakePaused || voiceAutoWakeInFlight) return
  if (voiceActiveTarget === null && hostTerminal !== null) setVoiceActiveTarget({kind: "host", controller: hostTerminal})
  const client = ensureVoiceInputClient()
  if (client.active) return

  voiceAutoWakeInFlight = true
  try {
    const started = await startVoiceWake(false)
    if (!started && !voiceAutoWakePaused) scheduleVoiceAutoWake(VOICE_AUTO_WAKE_RETRY_MS)
  } finally {
    voiceAutoWakeInFlight = false
  }
}

function handleVoiceInputChunk(chunk: VoiceInputChunk): void {
  const target = voicePartialPreviewTarget ?? voiceActiveTarget
  const messages = voiceMessagesFromChunk(chunk)
  if (messages.length === 0) return
  voiceLastChunkText = messages.join("\n\n")
  voiceLastChunkAt = new Date()
  let inserted = false
  if (target !== null) {
    for (const message of messages) inserted = insertVoiceMessageForTarget(target, message) || inserted
  } else {
    flashVoiceHudError(t("voiceNoActiveInput"))
  }
  if (inserted && target !== null) clearVoicePartialPreviewForTarget(target, "discard")
  renderVoiceHud()
}

function handleVoiceCommandText(raw: string): void {
  const text = cleanupVoiceInputText(raw)
  if (!text) return
  voiceWakePreviewText = text
  voiceWakePreviewAt = new Date()
  recordVoiceWakePreview(text, voiceWakePreviewAt)
  renderVoiceHud()
}

function recordVoiceWakePreview(text: string, at: Date): void {
  const last = voiceWakePreviewHistory[0]
  if (last?.text === text) {
    last.at = at
    return
  }
  voiceWakePreviewHistory.unshift({text, at})
  voiceWakePreviewHistory.splice(5)
}

function handleVoicePartial(raw: string): void {
  const target = voiceActiveTarget
  if (target === null || !voiceTargetCanAcceptInput(target)) {
    preserveVoicePartialAsTerminalInput()
    return
  }

  const text = cleanupVoiceInputText(raw)
  if (!text) {
    return
  }

  voiceLastPartialText = text
  voiceLastPartialAt = new Date()
  if (target.kind === "module") showModuleTerminalPrompt(target.controller)
  showVoicePartialPreview(target, text)
  renderVoiceHud()
}

function showVoicePartialPreview(target: VoiceInputTarget, text: string): void {
  if (voicePartialPreviewTarget !== null && !sameVoiceInputTarget(voicePartialPreviewTarget, target)) {
    if (!preserveVoicePartialAsTerminalInput()) return
  }
  voicePartialPreviewTarget = target
  voicePartialPreviewText = text
  for (const terminal of voicePreviewTerminals(target)) terminal.setInputPreview(text)
}

function clearVoicePartialPreview(): void {
  const target = voicePartialPreviewTarget
  if (target === null) return
  for (const terminal of voicePreviewTerminals(target)) terminal.clearInputPreview()
  voicePartialPreviewTarget = null
  voicePartialPreviewText = ""
}

function clearVoiceWakePreview(): void {
  voiceWakePreviewText = ""
  voiceWakePreviewAt = null
  voiceWakePreviewHistory.splice(0)
}

function clearVoicePartialPreviewForTarget(target: VoiceInputTarget, mode: "preserve" | "discard" = "preserve"): void {
  if (voicePartialPreviewTarget === null || !sameVoiceInputTarget(voicePartialPreviewTarget, target)) return
  if (mode === "discard") clearVoicePartialPreview()
  else preserveVoicePartialAsTerminalInput()
}

function sameVoiceInputTarget(a: VoiceInputTarget, b: VoiceInputTarget): boolean {
  return a.kind === b.kind && a.controller === b.controller
}

function voicePreviewTerminals(target: VoiceInputTarget): TerminalPane[] {
  if (target.kind === "host") return hostTerminalPanes(target.controller)
  return [target.controller.terminal]
}

function shouldSubmitVoicePartialForCompletedCommit(previousStatus: VoiceInputStatus, status: VoiceInputStatus): boolean {
  return previousStatus === "committing" && status === "listening" && voicePartialPreviewTarget !== null && cleanupVoiceInputText(voicePartialPreviewText).length > 0
}

function shouldPreserveVoicePartialForStatus(previousStatus: VoiceInputStatus, status: VoiceInputStatus, detail?: string): boolean {
  if (voicePartialPreviewTarget === null || voicePartialPreviewText.trim().length === 0) return false
  if (previousStatus !== "listening" && previousStatus !== "committing") return false
  if (status === "error") return isVoiceConnectionLossDetail(detail)
  return status === "waitingWake" && isVoiceConnectionLossDetail(detail)
}

function isVoiceConnectionLossDetail(detail: string | undefined): boolean {
  if (detail === undefined || detail.length === 0) return false
  return /websocket|socket|closed|failed|asr|недоступ|закрыт/i.test(detail)
}

function preserveVoicePartialAsTerminalInput(): boolean {
  const target = voicePartialPreviewTarget
  const text = cleanupVoiceInputText(voicePartialPreviewText)
  if (target === null || text.length === 0) return false

  if (target.kind === "module") {
    clearVoicePartialPreview()
    showModuleTerminalPrompt(target.controller)
    appendModuleTerminalInputText(target.controller, text)
    return true
  }

  if (!voiceTargetCanAcceptInput(target)) return false
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  clearVoicePartialPreview()
  sendHostTerminalInput(target.controller, body, "api", body)
  return true
}

function submitVoicePartialPreview(): boolean {
  const target = voicePartialPreviewTarget
  const text = cleanupVoiceInputText(voicePartialPreviewText)
  if (target === null || text.length === 0) return false
  const inserted = insertVoiceMessageForTarget(target, text)
  if (inserted) clearVoicePartialPreview()
  return inserted
}

function insertVoiceMessage(raw: string): void {
  const text = cleanupVoiceInputText(raw)
  if (!text) return

  const target = voiceActiveTarget
  if (target === null) {
    flashVoiceHudError(t("voiceNoActiveInput"))
    return
  }

  insertVoiceMessageForTarget(target, text)
}

function insertVoiceMessageForTarget(target: VoiceInputTarget, text: string): boolean {
  if (target.kind === "host") {
    if (!voiceTargetCanAcceptInput(target)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return false
    }
    if (!sendHostTerminalVoiceSubmit(target.controller, text)) return false
    recordVoiceAutoEnter()
    updateVoiceHud(undefined, `${t("voiceInserted")}: ${text}`)
    return true
  }

  voiceModuleSubmitQueue = voiceModuleSubmitQueue.then(() => submitVoiceModuleExpression(target.controller, text))
  void voiceModuleSubmitQueue.catch((error) => flashVoiceHudError(error instanceof Error ? error.message : String(error)))
  return true
}

async function submitVoiceModuleExpression(controller: ModuleDisplayController, text: string): Promise<void> {
  if (!canAcceptTerminalInput(controller)) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] ${t("voiceNoActiveInput")}`,
    })
    syncModuleTerminalInput(controller)
    flashVoiceHudError(t("voiceNoActiveInput"))
    return
  }

  showModuleTerminalPrompt(controller)
  appendModuleTerminalInputText(controller, text)
  controller.terminal.write("\r\n")
  controller.terminalInput.buffer = ""
  controller.terminalInput.promptVisible = false
  recordVoiceAutoEnter()
  updateVoiceHud(undefined, `${t("voiceInserted")}: ${text}`)
  await runModuleTerminalExpression(controller, text)
}

function sendHostTerminalVoiceSubmit(controller: HostTerminalController, text: string): boolean {
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  const payload = controller.terminalState?.bracketedPaste
    ? `\x1b[200~${body}\x1b[201~\r`
    : `${body}\r`
  sendHostTerminalInput(controller, payload, "api", body)
  return true
}

function sanitizeHostTerminalVoiceInput(text: string): string {
  return cleanupVoiceInputText(text)
    .replace(/\x1b\[201~/g, "")
    .replace(/\x1b/g, "")
}

function voiceMessagesFromChunk(chunk: VoiceInputChunk): string[] {
  if (chunk.messages.length > 1) return chunk.messages.map(cleanupVoiceInputText).filter(Boolean)

  const byPause = voiceMessagesFromSegments(chunk.segments)
  if (byPause.length > 1) return byPause

  const source = chunk.messages[0] ?? chunk.text
  const byParagraph = splitVoiceParagraphs(source)
  return byParagraph.length > 0 ? byParagraph : byPause
}

const VOICE_MESSAGE_PAUSE_SECONDS = 0.65

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

function cleanupVoiceInputText(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  return voiceTextHasContent(cleaned) ? cleaned : ""
}

function voiceTextHasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
}

function updateVoiceLevel(level: number): void {
  if (voiceHudStatus === "waitingWake") {
    voiceInputLevel = 0
    return
  }

  const next = Math.max(0, Math.min(1, level * 12))
  voiceInputLevel = voiceInputLevel * 0.72 + next * 0.28
  if (voiceMeterRaf !== null) return
  voiceMeterRaf = window.requestAnimationFrame(() => {
    voiceMeterRaf = null
    renderVoiceMeter()
  })
}

function recordVoiceAutoEnter(): void {
  voiceAutoEnterCount += 1
  voiceAutoEnterAt = new Date()
}

function updateVoiceHud(status?: VoiceInputStatus, detail?: string): void {
  const currentStatus = status ?? voiceInputClient?.status ?? "idle"
  const detailText = voiceReadableDetail(detail ?? voiceStatusDetail(currentStatus))
  if (status !== undefined || detail !== undefined || currentStatus !== voiceHudStatus) {
    voiceHudStatus = currentStatus
    voiceHudDetail = detailText
    voiceHudUpdatedAt = new Date()
  }
  renderVoiceHud()
}

function renderVoiceHud(): void {
  const currentStatus = voiceHudStatus
  const target = voiceTargetLabel()
  voiceHudPane?.setSnapshot({
    status: currentStatus,
    statusLine: `${formatHudTime(voiceHudUpdatedAt)} · ${voiceStatusLabel(currentStatus)}`,
    targetLine: target ? `${t("voiceTarget")}: ${target}` : t("voiceNoTarget"),
    autoEnterLine: voiceAutoEnterLine(),
    detailLine: voiceHudDetail,
    serviceLine: voiceServiceLine(),
    serviceState: voiceServiceState,
    level: voiceHudStatus === "listening" || voiceHudStatus === "committing" ? voiceInputLevel : 0,
  })
}

function flashVoiceHudError(detail: string): void {
  if (voiceHudErrorTimer !== null) window.clearTimeout(voiceHudErrorTimer)
  voiceLastErrorText = voiceReadableDetail(detail)
  voiceLastErrorAt = new Date()
  updateVoiceHud("error", detail)
  voiceHudErrorTimer = window.setTimeout(() => {
    voiceHudErrorTimer = null
    if (voiceInputClient?.status !== "error") updateVoiceHud()
  }, 2_400)
}

function voiceStatusDetail(status: VoiceInputStatus): string {
  if (status === "listening") return t("voiceListening")
  if (status === "waitingWake") return t("voiceWaitingWake")
  if (status === "connecting") return t("voiceConnecting")
  if (status === "committing") return t("voiceCommitting")
  if (status === "error") return t("voiceError")
  return ""
}

function voiceStatusLabel(status: VoiceInputStatus): string {
  if (status === "idle") return t("voiceIdle")
  return voiceStatusDetail(status)
}

function voiceReadableDetail(detail: string): string {
  const text = detail.trim()
  if (!text) return ""
  if (/websocket failed|websocket closed|failed to construct/i.test(text)) return `${t("voiceServiceDown")}: ${voiceSocketErrorEndpoint(text) ?? voiceServiceEndpointLabel()}`
  if (/permission denied|notallowederror|not allowed/i.test(text)) return getUiLocale() === "ru" ? "нет доступа к микрофону" : "microphone access denied"
  if (/notfounderror|not found|device not found/i.test(text)) return getUiLocale() === "ru" ? "микрофон не найден" : "microphone not found"
  if (/commit timeout/i.test(text)) return getUiLocale() === "ru" ? "таймаут распознавания фрагмента" : "voice commit timeout"
  if (text === VOICE_STOP_COMMAND_DETAIL) return getUiLocale() === "ru" ? "остановлено голосовой командой" : "stopped by voice command"
  return text
}

function voiceSocketErrorEndpoint(text: string): string | null {
  const match = text.match(/wss?:\/\/\S+/i)
  if (match === null) return null
  return voiceEndpointLabel(match[0]!)
}

function voiceServiceLine(): string {
  const time = voiceServiceCheckedAt === null ? "--:--:--" : formatHudTime(voiceServiceCheckedAt)
  return `${time} · ${voiceServiceDetail}`
}

function voiceAutoEnterLine(): string {
  if (voiceAutoEnterAt === null) return `${t("voiceAutoEnter")}: 0`
  return `${formatHudTime(voiceAutoEnterAt)} · ${t("voiceAutoEnter")} #${voiceAutoEnterCount}`
}

function voiceSettingsLiveLine(): string {
  const ru = getUiLocale() === "ru"
  if (voiceHudStatus === "waitingWake") return `wake-up: ${debugVoiceText(voiceWakePreviewText)}`
  if (voiceHudStatus === "listening" || voiceHudStatus === "committing") return `asr: ${debugVoiceText(voiceLastPartialText)}`
  return `${ru ? "голос" : "voice"}: -`
}

function voiceDebugLines(): string[] {
  const ru = getUiLocale() === "ru"
  const target = voiceTargetLabel()
  const previewActive = voicePartialPreviewTarget !== null
  return [
    `${ru ? "статус" : "status"}: ${voiceStatusLabel(voiceHudStatus)}`,
    `${ru ? "деталь" : "detail"}: ${voiceHudDetail || "-"}`,
    `${ru ? "цель" : "target"}: ${target || "-"}`,
    `${ru ? "wake слышит" : "wake heard"}: ${debugVoiceText(voiceWakePreviewText)}`,
    `${ru ? "wake время" : "wake at"}: ${formatDebugTime(voiceWakePreviewAt)}`,
    `${ru ? "preview активен" : "preview active"}: ${previewActive ? "yes" : "no"}`,
    `${ru ? "preview символов" : "preview chars"}: ${voiceLastPartialText.length}`,
    `${ru ? "partial" : "partial"}: ${debugVoiceText(voiceLastPartialText)}`,
    `${ru ? "partial время" : "partial at"}: ${formatDebugTime(voiceLastPartialAt)}`,
    `${ru ? "chunk символов" : "chunk chars"}: ${voiceLastChunkText.length}`,
    `${ru ? "chunk" : "chunk"}: ${debugVoiceText(voiceLastChunkText)}`,
    `${ru ? "chunk время" : "chunk at"}: ${formatDebugTime(voiceLastChunkAt)}`,
    `${ru ? "последняя ошибка" : "last error"}: ${debugVoiceText(voiceLastErrorText)}`,
    `${ru ? "ошибка время" : "error at"}: ${formatDebugTime(voiceLastErrorAt)}`,
    `${ru ? "громкость микрофона" : "mic signal volume"}: ${Math.round(readVoiceSignalVolume() * 100)}%`,
    `${ru ? "режим деактивации" : "deactivation mode"}: ${readVoiceDeactivationMode()}`,
    `${ru ? "тайм-аут распознавания" : "recognition timeout"}: ${readVoiceRecognitionTimeoutSeconds()}s`,
    `${ru ? "левенштейн" : "levenshtein"}: a ${Math.round(readVoiceFuzzyTolerance("activation") * 100)}% · d ${Math.round(readVoiceFuzzyTolerance("deactivation") * 100)}% · s ${Math.round(readVoiceFuzzyTolerance("stop") * 100)}%`,
    `${ru ? "звук" : "sound"}: ${hudNotificationDebugLine()}`,
  ]
}

function debugVoiceText(text: string): string {
  const cleaned = cleanupVoiceInputText(text)
  if (!cleaned) return "-"
  return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}...`
}

function formatDebugTime(date: Date | null): string {
  return date === null ? "--:--:--" : formatHudTime(date)
}

function hudNotificationDebugLine(): string {
  if (!hudNotificationLastLine) return "-"
  return `${formatDebugTime(hudNotificationLastAt)} · ${hudNotificationLastLine}`
}

function renderVoiceMeter(): void {
  renderVoiceHud()
}

function formatHudTime(date: Date): string {
  return date.toLocaleTimeString(getUiLocale() === "ru" ? "ru-RU" : "en-US", {hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit"})
}

function installVoiceServiceMonitor(): void {
  if (voiceServiceCheckTimer !== null) return
  void checkVoiceService()
  voiceServiceCheckTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void checkVoiceService()
  }, VOICE_SERVICE_CHECK_INTERVAL_MS)
  window.addEventListener("focus", () => {
    void checkVoiceService()
    scheduleVoiceAutoWake()
  })
  window.addEventListener("online", () => {
    void checkVoiceService()
    scheduleVoiceAutoWake()
  })
}

async function checkVoiceService(): Promise<boolean> {
  if (voiceServiceCheckInFlight) return voiceServiceState === "ok"
  voiceServiceCheckInFlight = true
  try {
    const data = await probeVoiceService()
    const model = typeof data?.model === "string" ? data.model : ""
    const device = typeof data?.device === "string" ? data.device : ""
    const compute = typeof data?.computeType === "string" ? data.computeType : ""
    voiceServiceState = "ok"
    voiceServiceDetail = [t("voiceServiceOk"), model, [device, compute].filter(Boolean).join("/")].filter(Boolean).join(" · ")
    voiceServiceCheckedAt = new Date()
    if (voiceHudStatus !== "error" && isVoiceServiceErrorText(voiceLastErrorText)) {
      voiceLastErrorText = ""
      voiceLastErrorAt = null
    }
    renderVoiceHud()
    return true
  } catch (error) {
    voiceServiceState = "down"
    voiceServiceDetail = `${t("voiceServiceDown")}: ${voiceServiceEndpointLabel()}`
    if (error instanceof Error && error.name !== "AbortError") voiceServiceDetail = `${voiceServiceDetail} · ${error.message}`
    voiceServiceCheckedAt = new Date()
    renderVoiceHud()
    return false
  } finally {
    voiceServiceCheckInFlight = false
  }
}

function isVoiceServiceErrorText(text: string): boolean {
  return /ASR недоступен|ASR unavailable|websocket failed|websocket closed/i.test(text)
}

function probeVoiceService(): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    let settled = false
    let openFallback: number | null = null
    const ws = new WebSocket(readVoiceInputUrl())
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

function voiceServiceEndpointLabel(): string {
  return voiceEndpointLabel(readVoiceInputUrl())
}

function voiceEndpointLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, location.href)
    return url.host || rawUrl
  } catch {
    return rawUrl
  }
}

function installHudNotificationSoundUnlock(): void {
  const unlock = (): void => {
    primeHudNotificationAudioElements()
    primeHudNotificationAudioContext()
  }
  window.addEventListener("pointerdown", unlock, {capture: true})
  window.addEventListener("keydown", unlock, {capture: true})
  window.addEventListener("touchstart", unlock, {capture: true})
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

function playHudNotificationSound(kind: HudNotificationKind): void {
  if (kind === "agent" && !readHostTerminalAgentSoundEnabled()) {
    recordHudNotificationSound(kind, "disabled")
    return
  }
  const volume = hudNotificationVolume(kind)
  if (volume <= 0) {
    recordHudNotificationSound(kind, "muted")
    return
  }
  if (kind !== "agent" && voiceInputClient?.playSignalTone(kind, volume, recordHudNotificationSound) === true) {
    return
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

function playHudNotificationHtmlAudio(kind: HudNotificationKind, reason = "fallback", volume = hudNotificationVolume(kind)): void {
  const audio = ensureHudNotificationAudioElement(kind)
  if (audio !== null) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // Some browsers reject seeking before media metadata is available.
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
      // Some browsers reject seeking before media metadata is available.
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

function playHudNotificationWebAudioTone(kind: HudNotificationKind, volume: number, onError?: (reason: string) => void): boolean {
  const context = ensureHudNotificationAudioContext()
  if (context === null) return false

  const play = (): void => {
    const start = context.currentTime + 0.005
    const toneSpec = hudNotificationTone(kind)
    const end = start + toneSpec.duration
    const gain = context.createGain()
    const tone = context.createOscillator()

    tone.type = toneSpec.type
    tone.frequency.setValueAtTime(toneSpec.startHz, start)
    tone.frequency.exponentialRampToValueAtTime(toneSpec.endHz, end)
    const peakGain = toneSpec.gain * clampVoiceSignalVolume(volume)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), start + 0.018)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain * 0.42), start + toneSpec.duration * 0.45)
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

function htmlNotificationVolume(volume: number): number {
  return Math.min(1, clampVoiceSignalVolume(volume) * 0.9)
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
  const durationSeconds = tone.duration
  const sampleCount = Math.floor(sampleRate * durationSeconds)
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
    const progress = t / durationSeconds
    const frequency = tone.startHz * Math.pow(tone.endHz / tone.startHz, progress)
    const attack = Math.min(1, t / 0.025)
    const release = Math.min(1, Math.max(0, (durationSeconds - t) / 0.09))
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
  renderVoiceHud()
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

function voiceTargetLabel(): string {
  const target = voiceActiveTarget
  if (target === null) return ""
  if (target.kind === "host") return t("voiceTargetHost")
  const snapshot = moduleSnapshots.get(target.controller.id)
  return `${t("voiceTargetModule")}: ${snapshot?.label ?? target.controller.id}`
}

function voiceTargetCanAcceptInput(target: VoiceInputTarget): boolean {
  if (target.kind === "host") {
    return target.controller.socket?.readyState === WebSocket.OPEN
      && target.controller.connectionState === "connected"
  }
  return canAcceptTerminalInput(target.controller)
}

function readVoiceInputUrl(): string {
  try {
    return localStorage.getItem(VOICE_INPUT_URL_STORAGE_KEY) || DEFAULT_VOICE_INPUT_URL
  } catch {
    return DEFAULT_VOICE_INPUT_URL
  }
}

function readVoiceWakeUrl(): string {
  try {
    return localStorage.getItem(VOICE_WAKE_URL_STORAGE_KEY) || DEFAULT_VOICE_WAKE_URL
  } catch {
    return DEFAULT_VOICE_WAKE_URL
  }
}

function readVoiceInputContext(): string {
  try {
    return localStorage.getItem(VOICE_INPUT_CONTEXT_STORAGE_KEY) || ""
  } catch {
    return ""
  }
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
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
  } catch {
    return null
  }
}

function readHostTerminalAgentSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY)
    if (raw === null) return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
    return raw !== "0"
  } catch {
    return DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED
  }
}

function storeHostTerminalAgentSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_ENABLED_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
  hostTerminalAgentSignalPane?.requestRender()
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

function storeVoiceSignalVolume(value: number): void {
  const next = clampVoiceSignalVolume(value)
  try {
    localStorage.setItem(VOICE_SIGNAL_VOLUME_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  syncHudNotificationAudioVolume("activation")
  syncHudNotificationAudioVolume("deactivation")
  syncHudNotificationAudioVolume("stop")
  renderVoiceHud()
}

function storeHostTerminalAgentSoundVolume(value: number): void {
  const next = clampHostTerminalAgentSoundVolume(value)
  try {
    localStorage.setItem(HOST_TERMINAL_AGENT_SOUND_VOLUME_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  syncHudNotificationAudioVolume("agent")
  hostTerminalAgentSignalPane?.requestRender()
}

function syncHudNotificationAudioVolume(kind: HudNotificationKind): void {
  const audio = hudNotificationAudioElements.get(kind)
  if (audio === undefined) return
  audio.volume = htmlNotificationVolume(hudNotificationVolume(kind))
}

function clampVoiceSignalVolume(value: number): number {
  return Math.min(MAX_VOICE_SIGNAL_VOLUME, Math.max(0, value))
}

function clampHostTerminalAgentSoundVolume(value: number): number {
  return Math.min(MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME, Math.max(0, value))
}

function readVoiceDeactivationMode(): VoiceDeactivationMode {
  try {
    const raw = localStorage.getItem(VOICE_DEACTIVATION_MODE_STORAGE_KEY)
    if (raw === "timeout" || raw === "phrase-timeout" || raw === "phrase") return raw
    return DEFAULT_VOICE_DEACTIVATION_MODE
  } catch {
    return DEFAULT_VOICE_DEACTIVATION_MODE
  }
}

function storeVoiceDeactivationMode(value: VoiceInputHudDeactivationMode): void {
  const next = voiceClientDeactivationMode(value)
  try {
    localStorage.setItem(VOICE_DEACTIVATION_MODE_STORAGE_KEY, next)
  } catch {
    // Storage can be disabled in private contexts.
  }
  renderVoiceHud()
  voiceInputClient?.refreshDeactivationSettings()
}

function readVoiceRecognitionTimeoutSeconds(): number {
  try {
    const raw = localStorage.getItem(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY)
    if (raw === null) return DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
    const value = Number(raw)
    return Number.isFinite(value) ? clampVoiceRecognitionTimeoutSeconds(value) : DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
  } catch {
    return DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS
  }
}

function storeVoiceRecognitionTimeoutSeconds(value: number): void {
  const next = clampVoiceRecognitionTimeoutSeconds(value)
  try {
    localStorage.setItem(VOICE_RECOGNITION_TIMEOUT_STORAGE_KEY, String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  renderVoiceHud()
  voiceInputClient?.refreshDeactivationSettings()
}

function clampVoiceRecognitionTimeoutSeconds(value: number): number {
  return Math.round(Math.min(MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS, Math.max(MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS, value)))
}

function voiceHudDeactivationMode(mode: VoiceDeactivationMode): VoiceInputHudDeactivationMode {
  return mode
}

function voiceClientDeactivationMode(mode: VoiceInputHudDeactivationMode): VoiceDeactivationMode {
  return mode
}

function voicePhraseGroupsForHud(): Array<{
  id: VoiceInputHudPhraseGroupId
  title: string
  description: string
  whenLine: string
  effectLine: string
  phrases: string[]
  addLabel: string
  placeholder: string
  resetLabel: string
  fuzzyLabel: string
  fuzzyValue: number
  receivedLabel?: string
  receivedLines?: string[]
}> {
  return [
    {
      id: "activation",
      title: t("voiceActivationPhrases"),
      description: t("voiceActivationDescription"),
      whenLine: t("voiceActivationWhen"),
      effectLine: t("voiceActivationEffect"),
      phrases: readVoicePhrases("activation"),
      addLabel: t("voicePhraseAdd"),
      placeholder: t("voiceActivationPhrasePrompt"),
      resetLabel: t("voicePhraseReset"),
      fuzzyLabel: t("voiceFuzzyTolerance"),
      fuzzyValue: readVoiceFuzzyTolerance("activation"),
      receivedLabel: t("voiceActivationReceived"),
      receivedLines: voiceActivationReceivedLines(),
    },
    {
      id: "deactivation",
      title: t("voiceDeactivationPhrases"),
      description: t("voiceDeactivationDescription"),
      whenLine: t("voiceDeactivationWhen"),
      effectLine: t("voiceDeactivationEffect"),
      phrases: readVoicePhrases("deactivation"),
      addLabel: t("voicePhraseAdd"),
      placeholder: t("voiceDeactivationPhrasePrompt"),
      resetLabel: t("voicePhraseReset"),
      fuzzyLabel: t("voiceFuzzyTolerance"),
      fuzzyValue: readVoiceFuzzyTolerance("deactivation"),
    },
    {
      id: "stop",
      title: t("voiceStopPhrases"),
      description: t("voiceStopDescription"),
      whenLine: t("voiceStopWhen"),
      effectLine: t("voiceStopEffect"),
      phrases: readVoicePhrases("stop"),
      addLabel: t("voicePhraseAdd"),
      placeholder: t("voiceStopPhrasePrompt"),
      resetLabel: t("voicePhraseReset"),
      fuzzyLabel: t("voiceFuzzyTolerance"),
      fuzzyValue: readVoiceFuzzyTolerance("stop"),
    },
  ]
}

function voiceActivationReceivedLines(): string[] {
  if (voiceWakePreviewHistory.length === 0) return [getUiLocale() === "ru" ? "пока нет данных" : "no data yet"]
  return voiceWakePreviewHistory.map(({text, at}) => `${formatHudTime(at)} · ${debugVoiceText(text)}`)
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
  try {
    localStorage.setItem(voicePhraseStorageKey(groupId), JSON.stringify(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  renderVoiceHud()
  restartVoiceCommandRecognizerAfterSettingsChange()
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

function storeVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId, value: number): void {
  const next = clampVoiceFuzzyTolerance(value)
  try {
    localStorage.setItem(voiceFuzzyStorageKey(groupId), String(next))
  } catch {
    // Storage can be disabled in private contexts.
  }
  renderVoiceHud()
  restartVoiceCommandRecognizerAfterSettingsChange()
}

function addVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
  const phrases = normalizeVoicePhrases([...readVoicePhrases(groupId), phrase])
  storeVoicePhrases(groupId, phrases)
}

function removeVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
  const normalizedTarget = voicePhraseKey(phrase)
  if (normalizedTarget === undefined) return
  const phrases = readVoicePhrases(groupId).filter((item) => voicePhraseKey(item) !== normalizedTarget)
  storeVoicePhrases(groupId, phrases)
}

function resetVoicePhrases(groupId: VoiceInputHudPhraseGroupId): void {
  storeVoicePhrases(groupId, defaultVoicePhrases(groupId))
}

function voicePhraseKey(phrase: string): string | undefined {
  const normalized = normalizeVoicePhrases([phrase])[0]
  if (normalized === undefined) return undefined
  return normalized.toLocaleLowerCase("ru-RU").replace(/ё/g, "е")
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
  return Math.min(0.5, Math.max(0, value))
}

function restartVoiceCommandRecognizerAfterSettingsChange(): void {
  const client = voiceInputClient
  if (client?.status !== "waitingWake") return
  client.stop()
  scheduleVoiceAutoWake(0)
}

function syncModuleDisplays(): void {
  if (uiCanvas === null) return
  const orderedModules = moduleOrder
    .map((id) => moduleSnapshots.get(id))
    .filter((module): module is ModulePaneSnapshot => module !== undefined)
  const orderedSqliteDisplays = sqliteOrder
    .map((id) => sqliteDisplays.get(id))
    .filter((display): display is SqliteDisplayController => display !== undefined)

  const displayMetrics = viewportDisplayMetrics()
  const moduleDisplayIdList = orderedModules.map((module) => moduleDisplayId(module.id))
  const sqliteDisplayIdList = orderedSqliteDisplays.map((controller) => sqliteDisplayId(controller.id))
  const displayIds = [...moduleDisplayIdList, ...sqliteDisplayIdList]
  const totalW = displayIds.length * displayMetrics.widthMm
    + Math.max(0, displayIds.length - 1) * MODULE_DISPLAY_GAP_MM
  let cursorX = -totalW / 2

  for (const module of orderedModules) {
    const displayId = moduleDisplayId(module.id)
    const x = cursorX + displayMetrics.widthMm / 2
    cursorX += displayMetrics.widthMm + MODULE_DISPLAY_GAP_MM
    const center = displayCenterWithStored(displayId, {x, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM})

    if (!moduleDisplayIds.has(module.id)) {
      moduleDisplayIds.add(module.id)
      const controller = createModuleDisplayController(module)
      moduleDisplays.set(module.id, controller)
      uiCanvas.createDisplay({
        id: displayId,
        widthMm: displayMetrics.widthMm,
        heightMm: displayMetrics.heightMm,
        pixelWidth: displayMetrics.pixelWidth,
        pixelHeight: displayMetrics.pixelHeight,
        centerMm: center,
        background: 0x020617,
        border: 0x334155,
      })
      addInterpreterSurfacesToDisplay(displayId, controller)
      void refreshModuleBreakpoints(controller)
      void refreshWorkspaceFiles(controller)
      updateModuleDisplay(controller, module)
    } else {
      uiCanvas.resizeDisplay(displayId, displayMetrics)
      uiCanvas.setDisplayCenter(displayId, center)
    }
  }

  for (const controller of orderedSqliteDisplays) {
    const displayId = sqliteDisplayId(controller.id)
    const x = cursorX + displayMetrics.widthMm / 2
    cursorX += displayMetrics.widthMm + MODULE_DISPLAY_GAP_MM
    const center = displayCenterWithStored(displayId, {x, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM})

    if (!sqliteDisplayIds.has(controller.id)) {
      sqliteDisplayIds.add(controller.id)
      uiCanvas.createDisplay({
        id: displayId,
        widthMm: displayMetrics.widthMm,
        heightMm: displayMetrics.heightMm,
        pixelWidth: displayMetrics.pixelWidth,
        pixelHeight: displayMetrics.pixelHeight,
        centerMm: center,
        background: 0x06111f,
        border: 0x334155,
      })
      addSqliteSurfacesToDisplay(displayId, controller)
    } else {
      uiCanvas.resizeDisplay(displayId, displayMetrics)
      uiCanvas.setDisplayCenter(displayId, center)
    }
  }

  const frameKey = displayIds.map((id, index) => {
    return `${id}:${index}:${Math.round(displayMetrics.widthMm)}x${Math.round(displayMetrics.heightMm)}:${displayMetrics.pixelWidth}x${displayMetrics.pixelHeight}`
  }).join("\0")

  if (restoreInterpreterViewPointOnce(frameKey)) return
  // После restore новые дисплеи могут доехать асинхронно; не фреймим их
  // автоматически поверх пользовательской камеры.
  if (interpreterViewPointRestored) {
    framedModuleKey = frameKey
    return
  }

  if (displayIds.length <= 1) {
    if (framedModuleKey !== frameKey) {
      framedModuleKey = frameKey
      uiCanvas.setDisplayMode("near")
    }
    return
  }
  if (framedModuleKey !== frameKey) {
    framedModuleKey = frameKey
    uiCanvas.frameDisplays(displayIds)
  }
}

function restoreInterpreterViewPointOnce(frameKey: string): boolean {
  if (uiCanvas === null || interpreterViewPointRestoreAttempted) return false
  interpreterViewPointRestoreAttempted = true
  const snapshot = readStoredInterpreterViewPoint()
  if (snapshot === null) return false
  const restored = uiCanvas.restoreViewPointSnapshot(snapshot)
  if (!restored) return false
  interpreterViewPointRestored = true
  framedModuleKey = frameKey
  return true
}

function ensureHostTerminalController(): HostTerminalController {
  if (hostTerminal !== null) return hostTerminal
  const controller = {} as HostTerminalController
  const hudTerminal = createHostTerminalPane(controller, "InterpreterHostTerminalHud", {
    fontPx: 12,
    linePx: 17,
    draggable: true,
    resizable: true,
    onResize: (size) => resizeHostTerminalFromPane(controller, hudTerminal, size),
    onFrameRectPreview: previewHostTerminalHudRect,
    onFrameRectChange: storeHostTerminalHudRectAndRelayout,
    onFrameDockRequest: () => setHostTerminalHudDocked(true),
  })
  Object.assign(controller, {
    hudTerminal,
    socket: null,
    sessionId: readStoredHostTerminalSessionId(),
    terminalSize: null,
    connectionState: "idle" as PtyStatusKind,
    terminalState: null,
    localEchoId: 0,
    agentNotifyArmed: false,
    agentNotifySawOutput: false,
    agentNotifyLastOutputAt: 0,
    agentNotifyLastPlayedAt: 0,
    agentNotifyTimer: null,
  } satisfies HostTerminalController)
  hostTerminal = controller
  if (!hostTerminalUnloadInstalled) {
    hostTerminalUnloadInstalled = true
    window.addEventListener("beforeunload", () => hostTerminal?.socket?.close())
  }
  return controller
}

function createHostTerminalPane(
  controller: HostTerminalController,
  name: string,
  opts: {
    fontPx: number
    linePx: number
    fitToRect?: boolean
    scrollX?: boolean
    draggable?: boolean
    resizable?: boolean
    onResize?: (size: TerminalSize) => void
    onFrameRectPreview?: TerminalPaneOpts["onFrameRectPreview"]
    onFrameRectChange?: TerminalPaneOpts["onFrameRectChange"]
    onFrameDockRequest?: TerminalPaneOpts["onFrameDockRequest"]
  },
): TerminalPane {
  let terminal: TerminalPane | null = null
  const terminalOpts: TerminalPaneOpts = {
    title: hostTerminalTitle(),
    status: t("terminalConnecting"),
    statusKind: "idle",
    fontPx: opts.fontPx,
    linePx: opts.linePx,
    maxScrollback: 10000,
    cursorLineHighlight: true,
    draggable: opts.draggable ?? false,
    resizable: opts.resizable ?? false,
    inputEnabled: false,
    onInput: (data, source) => sendHostTerminalInput(controller, data, source),
    onFocusChange: (focused) => {
      if (!focused) return
      setVoiceActiveTarget({kind: "host", controller})
      if (terminal !== null) resizeHostTerminalFromPane(controller, terminal, terminal.getTerminalSize())
    },
  }
  if (opts.fitToRect !== undefined) terminalOpts.fitToRect = opts.fitToRect
  if (opts.scrollX !== undefined) terminalOpts.scrollX = opts.scrollX
  if (opts.onResize !== undefined) terminalOpts.onResize = opts.onResize
  if (opts.onFrameRectPreview !== undefined) terminalOpts.onFrameRectPreview = opts.onFrameRectPreview
  if (opts.onFrameRectChange !== undefined) terminalOpts.onFrameRectChange = opts.onFrameRectChange
  if (opts.onFrameDockRequest !== undefined) terminalOpts.onFrameDockRequest = opts.onFrameDockRequest
  terminal = new TerminalPane(terminalOpts)
  terminal.node.name = name
  return terminal
}

function hostTerminalTitle(): string {
  return `${HOST_TERMINAL_BRAND_LABEL} · ${HOST_TERMINAL_MODEL_LABEL}`
}

function resizeHostTerminalFromPane(controller: HostTerminalController, pane: TerminalPane, size: TerminalSize): void {
  if (hostTerminalResizeOwner(controller) !== pane) return
  const next = {
    cols: Math.max(1, Math.round(size.cols)),
    rows: Math.max(1, Math.round(size.rows)),
  }
  if (controller.terminalSize?.cols === next.cols && controller.terminalSize.rows === next.rows) return
  controller.terminalSize = next
  sendHostTerminal(controller, {type: "terminal.resize", size: next})
}

function hostTerminalResizeOwner(controller: HostTerminalController): TerminalPane {
  return controller.hudTerminal
}

function connectHostTerminal(controller: HostTerminalController): void {
  if (controller.socket !== null) {
    controller.socket.close()
    controller.socket = null
  }

  setHostTerminalStatus(controller, "idle", t("terminalConnecting"))
  setHostTerminalInputEnabled(controller, false)
  rejectHostTerminalLocalEcho(controller)
  disarmAgentReadyNotification(controller)
  controller.terminalState = null

  const nextSocket = new WebSocket(hostTerminalWebSocketURL(controller))
  controller.socket = nextSocket

  nextSocket.addEventListener("open", () => {
    if (controller.socket !== nextSocket) return
    setHostTerminalStatus(controller, "connected", t("terminalConnected"))
    setHostTerminalInputEnabled(controller, true)
    if (voiceActiveTarget === null) setVoiceActiveTarget({kind: "host", controller})
    else scheduleVoiceAutoWake()
    if (controller.terminalSize !== null) sendHostTerminal(controller, {type: "terminal.resize", size: controller.terminalSize})
  })

  nextSocket.addEventListener("message", (event) => {
    if (controller.socket !== nextSocket) return
    handleHostTerminalMessage(controller, event)
  })

  nextSocket.addEventListener("close", () => {
    if (controller.socket !== nextSocket) return
    controller.socket = null
    disarmAgentReadyNotification(controller)
    setHostTerminalInputEnabled(controller, false)
    if (controller.connectionState !== "error" && controller.connectionState !== "disconnected") {
      setHostTerminalStatus(controller, "disconnected", t("terminalClosed"))
    }
  })

  nextSocket.addEventListener("error", () => {
    if (controller.socket !== nextSocket) return
    disarmAgentReadyNotification(controller)
    setHostTerminalInputEnabled(controller, false)
    setHostTerminalStatus(controller, "error", t("terminalWebsocket"))
  })
}

function hostTerminalWebSocketURL(controller: HostTerminalController): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${location.host}/hud/terminal/stream`)
  url.searchParams.set("replay", "1")
  if (controller.sessionId !== null) url.searchParams.set("session", controller.sessionId)
  return url.toString()
}

function sendHostTerminalInput(controller: HostTerminalController, data: string, source: TerminalInputSource, localEchoText = data): void {
  if (source === "keyboard" || source === "paste") clearVoicePartialPreviewForTarget({kind: "host", controller})
  if (isHostTerminalSubmitInput(data)) armAgentReadyNotification(controller)
  const localEchoId = tryHostTerminalLocalEcho(controller, localEchoText, source) ? ++controller.localEchoId : undefined
  sendHostTerminal(controller, {
    type: "input.write",
    data,
    source,
    ...(localEchoId === undefined ? {} : {localEchoId}),
  })
}

function tryHostTerminalLocalEcho(controller: HostTerminalController, data: string, source: TerminalInputSource): boolean {
  const serverState = controller.terminalState
  const panes = hostTerminalPanes(controller)
  if (
    (source !== "keyboard" && source !== "api") ||
    controller.socket?.readyState !== WebSocket.OPEN ||
    serverState === null ||
    !serverState.localEcho ||
    panes.some((pane) => !pane.getTerminalState().localEcho)
  ) return false
  let echoed = false
  for (const pane of panes) echoed = pane.tryLocalEcho(data) || echoed
  return echoed
}

function isHostTerminalSubmitInput(data: string): boolean {
  return data.includes("\r") || data.includes("\n")
}

function armAgentReadyNotification(controller: HostTerminalController): void {
  clearAgentReadyNotificationTimer(controller)
  controller.agentNotifyArmed = true
  controller.agentNotifySawOutput = false
  controller.agentNotifyLastOutputAt = 0
}

function disarmAgentReadyNotification(controller: HostTerminalController): void {
  clearAgentReadyNotificationTimer(controller)
  controller.agentNotifyArmed = false
  controller.agentNotifySawOutput = false
  controller.agentNotifyLastOutputAt = 0
}

function sendHostTerminal(controller: HostTerminalController, message: PtyClientMessage): void {
  if (controller.socket?.readyState === WebSocket.OPEN) {
    controller.socket.send(JSON.stringify(message))
  }
}

function handleHostTerminalMessage(controller: HostTerminalController, event: MessageEvent<string>): void {
  const message = parseHostTerminalServerMessage(event.data)
  if (message === null) return

  if (message.type === "terminal.write") {
    writeHostTerminalAuthoritative(controller, message.data)
    if (message.state !== undefined) updateHostTerminalState(controller, message.state, message.data.length > 0)
    return
  }

  if (message.type === "terminal.state") {
    updateHostTerminalState(controller, message.state)
    return
  }

  if (message.type === "terminal.local-echo") {
    updateHostTerminalState(controller, message.state)
    if (!message.accepted) rejectHostTerminalLocalEcho(controller)
    return
  }

  if (message.type === "terminal.ready") {
    controller.sessionId = message.sessionId
    updateHostTerminalState(controller, message.state)
    writeStoredHostTerminalSessionId(message.sessionId)
    setHostTerminalStatus(controller, "connected", shellLabel(message.shell))
    if (voiceActiveTarget === null) setVoiceActiveTarget({kind: "host", controller})
    else scheduleVoiceAutoWake()
    if (controller.terminalSize !== null) sendHostTerminal(controller, {type: "terminal.resize", size: controller.terminalSize})
    return
  }

  if (message.type === "terminal.status") {
    setHostTerminalStatus(controller, message.status.kind, message.status.label)
    return
  }

  if (message.type === "terminal.exit") {
    disarmAgentReadyNotification(controller)
    setHostTerminalStatus(controller, "disconnected", t("terminalExited"))
    setHostTerminalInputEnabled(controller, false)
    writeHostTerminalLine(controller, `${ansiMuted(`process exited: code=${message.code ?? "null"} signal=${message.signal ?? "null"}`)}`)
    return
  }

  disarmAgentReadyNotification(controller)
  setHostTerminalStatus(controller, "error", t("terminalError"))
  setHostTerminalInputEnabled(controller, false)
  writeHostTerminalLine(controller, `${ansiError(message.message)}`)
}

function parseHostTerminalServerMessage(raw: string): PtyServerMessage | null {
  try {
    const value = JSON.parse(raw) as PtyServerMessage
    if (typeof value === "object" && value !== null && "type" in value) return value
  } catch {
    return null
  }
  return null
}

function updateHostTerminalState(controller: HostTerminalController, state: PtyTerminalState, output = false): void {
  controller.terminalState = state
  if (!controller.agentNotifyArmed) return

  if (output) {
    controller.agentNotifySawOutput = true
    controller.agentNotifyLastOutputAt = performance.now()
  }
  if (controller.agentNotifySawOutput) scheduleAgentReadyNotificationCheck(controller)
}

function scheduleAgentReadyNotificationCheck(controller: HostTerminalController): void {
  if (controller.agentNotifyTimer !== null) clearTimeout(controller.agentNotifyTimer)
  const elapsed = performance.now() - controller.agentNotifyLastOutputAt
  const delay = Math.max(0, AGENT_READY_SOUND_IDLE_MS - elapsed)
  controller.agentNotifyTimer = window.setTimeout(() => {
    controller.agentNotifyTimer = null
    maybePlayAgentReadyNotification(controller)
  }, delay)
}

function clearAgentReadyNotificationTimer(controller: HostTerminalController): void {
  if (controller.agentNotifyTimer === null) return
  clearTimeout(controller.agentNotifyTimer)
  controller.agentNotifyTimer = null
}

function maybePlayAgentReadyNotification(controller: HostTerminalController): void {
  if (!controller.agentNotifyArmed || !controller.agentNotifySawOutput) return
  const state = controller.terminalState
  if (state === null || !state.cursorVisible) {
    scheduleAgentReadyNotificationCheck(controller)
    return
  }

  const elapsed = performance.now() - controller.agentNotifyLastOutputAt
  if (elapsed < AGENT_READY_SOUND_IDLE_MS) {
    scheduleAgentReadyNotificationCheck(controller)
    return
  }

  const now = performance.now()
  controller.agentNotifyArmed = false
  clearAgentReadyNotificationTimer(controller)
  if (now - controller.agentNotifyLastPlayedAt < AGENT_READY_SOUND_COOLDOWN_MS) return

  controller.agentNotifyLastPlayedAt = now
  playAgentReadySignal()
}

function playAgentReadySignal(): void {
  playHudNotificationSound("agent")
}

function setHostTerminalStatus(controller: HostTerminalController, kind: PtyStatusKind, label: string): void {
  hostTerminalStatusLabelForLayout = label
  hostTerminalAgentSignalPane?.requestRender()
  controller.connectionState = kind
  const paneKind = statusKindForHostTerminal(kind)
  for (const pane of hostTerminalPanes(controller)) pane.setStatus(paneKind, label)
}

function hostTerminalPanes(controller: HostTerminalController): TerminalPane[] {
  return [controller.hudTerminal]
}

function setHostTerminalInputEnabled(controller: HostTerminalController, enabled: boolean): void {
  for (const pane of hostTerminalPanes(controller)) pane.setInputEnabled(enabled)
}

function rejectHostTerminalLocalEcho(controller: HostTerminalController): void {
  for (const pane of hostTerminalPanes(controller)) pane.rejectLocalEcho()
}

function writeHostTerminalAuthoritative(controller: HostTerminalController, data: string): void {
  for (const pane of hostTerminalPanes(controller)) pane.writeAuthoritative(data)
}

function writeHostTerminalLine(controller: HostTerminalController, line: string): void {
  for (const pane of hostTerminalPanes(controller)) pane.writeln(line)
}

function statusKindForHostTerminal(kind: PtyStatusKind): TerminalStatusKind {
  if (kind === "running") return "running"
  if (kind === "connected") return "connected"
  if (kind === "disconnected") return "disconnected"
  if (kind === "error") return "error"
  return "idle"
}

function shellLabel(shell: string): string {
  const parts = shell.split("/")
  return parts[parts.length - 1] || shell
}

function readStoredHostTerminalSessionId(): string | null {
  try {
    const value = localStorage.getItem(HOST_TERMINAL_SESSION_STORAGE_KEY)
    return value === null || value.length < 8 ? null : value
  } catch {
    return null
  }
}

function writeStoredHostTerminalSessionId(value: string): void {
  try {
    localStorage.setItem(HOST_TERMINAL_SESSION_STORAGE_KEY, value)
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredHostTerminalHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(HOST_TERMINAL_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeHostTerminalHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(HOST_TERMINAL_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function previewHostTerminalHudRect(rect: UiSurfaceRect): void {
  hostTerminalHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeHostTerminalHudRectAndRelayout(rect: UiSurfaceRect): void {
  hostTerminalHudRectPreview = null
  storeHostTerminalHudRect(rect)
  relayoutHudSurfaces()
}

function readStoredTodoHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(TODO_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeTodoHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(TODO_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be unavailable in private contexts.
  }
}

function previewTodoHudRect(rect: UiSurfaceRect): void {
  todoHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeTodoHudRectAndRelayout(rect: UiSurfaceRect): void {
  todoHudRectPreview = null
  storeTodoHudRect(rect)
  relayoutHudSurfaces()
}

function readStoredVoiceHudPlacement(): VoiceHudAnchorPlacement | UiSurfaceRect | null {
  try {
    const raw = localStorage.getItem(VOICE_HUD_RECT_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    const anchor = normalizeStoredVoiceHudAnchor(parsed)
    if (anchor !== null) return anchor
    return normalizeStoredPaneRect(parsed)
  } catch {
    return null
  }
}

function storeVoiceHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect({...rect, w: VOICE_HUD_W, h: VOICE_HUD_H})
  if (normalized === null) return
  const metrics = viewportDisplayMetrics()
  const placement = voiceHudAnchorFromRect(normalized, metrics.pixelWidth, metrics.pixelHeight)
  writeStoredVoiceHudAnchor(placement)
}

function writeStoredVoiceHudAnchor(placement: VoiceHudAnchorPlacement): void {
  try {
    localStorage.setItem(VOICE_HUD_RECT_STORAGE_KEY, JSON.stringify(placement))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredHostTerminalHudDocked(): boolean {
  try {
    return localStorage.getItem(HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeStoredHostTerminalHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredTodoHudDocked(): boolean {
  try {
    return localStorage.getItem(TODO_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeStoredTodoHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(TODO_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredHostTerminalDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<HostTerminalDockPlacement>
    if (!isHostTerminalDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
    return {edge: value.edge, offset: value.offset}
  } catch {
    return null
  }
}

function readStoredTodoDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(TODO_DOCK_PLACEMENT_STORAGE_KEY)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<HostTerminalDockPlacement>
    if (!isHostTerminalDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
    return {edge: value.edge, offset: value.offset}
  } catch {
    return null
  }
}

function writeStoredHostTerminalDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function writeStoredTodoDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(TODO_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function setHostTerminalDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = hostTerminalDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  hostTerminalDockPlacement = placement
  writeStoredHostTerminalDockPlacement(placement)
  hostTerminalDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setTodoDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = todoDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  todoDockPlacement = placement
  writeStoredTodoDockPlacement(placement)
  todoDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setHostTerminalHudDocked(docked: boolean): void {
  if (hostTerminalHudDocked === docked) return
  hostTerminalHudDocked = docked
  writeStoredHostTerminalHudDocked(docked)
  const controller = hostTerminal
  if (docked) {
    uiCanvas?.setFocused(null)
    uiCanvas?.inputProxy?.blur()
  } else {
    controller?.hudTerminal.focus()
  }
  controller?.hudTerminal.requestRender()
  hostTerminalDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setTodoHudDocked(docked: boolean): void {
  if (todoHudDocked === docked) return
  todoHudDocked = docked
  writeStoredTodoHudDocked(docked)
  if (docked && todoPane !== null) {
    uiCanvas?.setFocused(null)
    uiCanvas?.inputProxy?.blur()
  }
  todoPane?.requestRender()
  todoDockPane?.requestRender()
  relayoutHudSurfaces()
}

function relayoutHudSurfaces(): void {
  uiCanvas?.relayout({scope: "hud", forceSetRect: false})
}

function isHostTerminalDockEdge(value: unknown): value is HudSideTabEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom"
}

function currentHostTerminalDockEdge(): HudSideTabEdge {
  return hostTerminalDockPlacement?.edge ?? DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT.edge
}

function currentTodoDockEdge(): HudSideTabEdge {
  return todoDockPlacement?.edge ?? DEFAULT_TODO_DOCK_PLACEMENT.edge
}

function parseStoredPaneRect(raw: string | null): UiSurfaceRect | null {
  if (raw === null) return null
  try {
    return normalizeStoredPaneRect(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeStoredPaneRect(value: unknown): UiSurfaceRect | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const x = finiteStoredNumber(record.x)
  const y = finiteStoredNumber(record.y)
  const w = finiteStoredNumber(record.w)
  const h = finiteStoredNumber(record.h)
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  }
}

function finiteStoredNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function normalizeStoredVoiceHudAnchor(value: unknown): VoiceHudAnchorPlacement | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const horizontal = record.horizontal
  const vertical = record.vertical
  const offsetX = finiteStoredNumber(record.offsetX)
  const offsetY = finiteStoredNumber(record.offsetY)
  if (!isVoiceHudHorizontalAnchor(horizontal) || !isVoiceHudVerticalAnchor(vertical) || offsetX === null || offsetY === null) return null
  return {
    horizontal,
    vertical,
    offsetX: Math.max(0, Math.round(offsetX)),
    offsetY: Math.max(0, Math.round(offsetY)),
  }
}

function isVoiceHudHorizontalAnchor(value: unknown): value is VoiceHudHorizontalAnchor {
  return value === "left" || value === "right"
}

function isVoiceHudVerticalAnchor(value: unknown): value is VoiceHudVerticalAnchor {
  return value === "top" || value === "bottom"
}

function viewportDisplayMetrics(): DisplayLayoutMetrics {
  const metrics = uiCanvas?.viewportDisplayMetrics()
  if (metrics !== null && metrics !== undefined) return metrics
  const rect = engineCanvas.getBoundingClientRect()
  const pixelWidth = Math.max(1, Math.round(rect.width || window.innerWidth || 1))
  const pixelHeight = Math.max(1, Math.round(rect.height || window.innerHeight || 1))
  return {widthMm: pixelWidth, heightMm: pixelHeight, pixelWidth, pixelHeight}
}

function moduleDisplayId(moduleId: string): string {
  return `module:${moduleId}`
}

function processApiPath(processId: string, suffix: string): string {
  return `/processes/${encodeURIComponent(processId)}${suffix}`
}

function sqliteDisplayId(sqliteId: string): string {
  return `sqlite:${sqliteId}`
}

function moduleVerboseStorageKey(moduleId: string): string {
  return `interpreter:module:${moduleId}:verbose`
}

function moduleAgentTerminalStorageKey(moduleId: string): string {
  return `interpreter:module:${moduleId}:agent-terminal:v1`
}

function readModuleVerboseVisible(moduleId: string): boolean {
  return localStorage.getItem(moduleVerboseStorageKey(moduleId)) === "1"
}

function readStoredModuleAgentTerminalEntries(moduleId: string, targetStartedAt: string | null): AgentModuleTerminalEntry[] {
  try {
    const raw = localStorage.getItem(moduleAgentTerminalStorageKey(moduleId))
    if (raw === null) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeAgentModuleTerminalEntry)
      .filter((entry): entry is AgentModuleTerminalEntry => entry !== null && entry.targetStartedAt === targetStartedAt)
      .slice(-200)
  } catch {
    return []
  }
}

function storeModuleAgentTerminalEntries(moduleId: string, entries: AgentModuleTerminalEntry[]): void {
  try {
    localStorage.setItem(moduleAgentTerminalStorageKey(moduleId), JSON.stringify(entries.slice(-200)))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function normalizeAgentModuleTerminalEntry(value: unknown): AgentModuleTerminalEntry | null {
  if (typeof value !== "object" || value === null) return null
  const record = value as Record<string, unknown>
  const ts = stringParam(record.ts)
  const rawText = typeof record.text === "string" ? record.text : undefined
  if (ts === undefined || rawText === undefined) return null
  let text = rawText
  let level: ModuleTerminalEntry["level"] = record.level === "error"
    || record.level === "warn"
    || record.level === "info"
    || record.level === "agent"
    ? record.level
    : "agent"
  if (level === "info") {
    const clean = stripAnsi(text).trimStart()
    if (clean.startsWith("agent >")) {
      level = "agent"
      text = clean.slice("agent".length).trimStart()
    } else if (clean.startsWith("ai >")) {
      level = "agent"
      text = clean.slice("ai".length).trimStart()
    } else if (clean.startsWith("=>")) {
      level = "agent"
      text = clean
    }
  }
  const rawTargetStartedAt = record.targetStartedAt
  const targetStartedAt = typeof rawTargetStartedAt === "string" ? rawTargetStartedAt : null
  return {
    ts,
    text,
    level,
    targetStartedAt,
  }
}

function addInterpreterSurfacesToDisplay(displayId: string, controller: ModuleDisplayController): void {
  if (uiCanvas === null) return
  uiCanvas.addSurfaceToDisplay(displayId, controller.filesChrome, (canvas) => interpreterRects(canvas, controller.verboseVisible).filesChrome)
  uiCanvas.addSurfaceToDisplay(displayId, controller.files, (canvas) => interpreterRects(canvas, controller.verboseVisible).files)
  uiCanvas.addSurfaceToDisplay(displayId, controller.filesHeader, (canvas) => interpreterRects(canvas, controller.verboseVisible).filesHeader)
  uiCanvas.addSurfaceToDisplay(displayId, controller.scopes, (canvas) => interpreterRects(canvas, controller.verboseVisible).scopes)
  uiCanvas.addSurfaceToDisplay(displayId, controller.source, (canvas) => interpreterRects(canvas, controller.verboseVisible).source)
  uiCanvas.addSurfaceToDisplay(displayId, controller.terminal, (canvas) => interpreterRects(canvas, controller.verboseVisible).terminal)
  uiCanvas.addSurfaceToDisplay(displayId, controller.frames, (canvas) => interpreterRects(canvas, controller.verboseVisible).frames)
  uiCanvas.addSurfaceToDisplay(displayId, controller.verbose, (canvas) => interpreterRects(canvas, controller.verboseVisible).verbose ?? hiddenRect())
}

function addSqliteSurfacesToDisplay(displayId: string, controller: SqliteDisplayController): void {
  if (uiCanvas === null) return
  uiCanvas.addSurfaceToDisplay(displayId, controller.tables, (canvas) => sqliteRects(canvas).tables)
  uiCanvas.addSurfaceToDisplay(displayId, controller.rows, (canvas) => sqliteRects(canvas).rows)
}

function createSqliteDisplayController(id: string, path: string): SqliteDisplayController {
  const controller = {} as SqliteDisplayController
  const label = sqliteInitialLabel(path)
  Object.assign(controller, {
    id,
    requestedPath: path,
    path,
    label,
    selectedTable: null,
    payload: null,
    loading: null,
    suppressTableSelectionOpen: false,
    tables: new FileListPane({
      title: label,
      items: [],
      selectedIds: [],
      selectionMode: "single",
      showHeader: true,
      theme: {
        surface: {
          background: palette.bg,
          border: palette.borderDim,
          borderWidthPx: 1,
        },
      },
      onSelectionChange: (_ids, items) => {
        if (controller.suppressTableSelectionOpen) return
        const table = items[0]?.path ?? items[0]?.name
        if (table === undefined || table === controller.selectedTable) return
        void refreshSqliteDisplay(controller, table)
      },
    }),
    rows: new SqliteTablePane((rowid, column, value) => {
      void updateSqliteDisplayCell(controller, rowid, column, value).catch((error) => {
        controller.rows.setStatus(error instanceof Error ? error.message : String(error))
      })
    }),
  } satisfies SqliteDisplayController)
  controller.tables.node.name = `SqliteTables:${id}`
  controller.rows.node.name = `SqliteRows:${id}`
  return controller
}

function createModuleDisplayController(module: ModulePaneSnapshot): ModuleDisplayController {
  const controller = {} as ModuleDisplayController
  const workspaceFiles = initialWorkspaceFilesState(module)
  Object.assign(controller, {
    id: module.id,
    frames: new FramesPane((index) => {
      controller.activeFrameIndex = index
      renderModuleDump(controller, true)
    }),
    filesChrome: new WorkspaceFilesChromePane(),
    filesHeader: new WorkspaceFilesHeaderPane(
      () => revealCurrentWorkspaceFile(controller),
      () => setWorkspaceFilesExpandedIds(controller, []),
      () => setWorkspaceFilesExpandedIds(controller, workspaceDirectoryIds(controller.workspaceFiles.items)),
    ),
    files: new FileListPane({
      title: t("sourceFiles"),
      items: workspaceFiles.items,
      expandedIds: workspaceFiles.expandedIds,
      selectedIds: workspaceFiles.selectedIds,
      selectionMode: "single",
      showHeader: false,
      theme: {
        surface: {
          background: null,
          border: null,
          borderWidthPx: 0,
        },
      },
      onSelectionChange: (ids, items) => {
        updateWorkspaceFilesSelectedState(controller, ids)
        if (controller.workspaceFiles.suppressSelectionOpen) return
        const item = items[0]
        if (item?.kind === "file") void openWorkspaceFile(controller, item)
      },
      onItemOpen: (item) => {
        if (item.kind === "file") void openWorkspaceFile(controller, item)
      },
      onExpandedChange: (ids) => setWorkspaceFilesExpandedIds(controller, ids),
    }),
    scopes: new ScopesPane({
      onContextChange: () => queuePublishModuleContext(controller),
      loadProperties: async (objectId) => {
        const props = await runModuleInterpreterCommand(controller, "props", {
          objectId,
          ownProperties: true,
        }, t("variables"))
        if (!props.ok) throw new Error(props.error ?? "properties failed")
        return propertySnapshotMapFromProtocolResponse(props.result)
      },
    }),
    source: new EditorPane({
      title: t("sourceWaiting"),
      path: "",
      fontPx: 12,
      linePx: 16,
      readOnly: false,
      showCaret: true,
      introAnimation: false,
      onChange: (text) => handleModuleSourceTextChange(controller, text),
      onSave: (text) => void saveModuleSource(controller, text),
      onBreakpointToggle: (line) => void toggleModuleBreakpoint(controller, line),
      onSelectionChange: (snapshot) => {
        controller.sourceContext = sourceContextFromEditorSnapshot(snapshot)
        queuePublishModuleContext(controller)
      },
    }),
    terminal: new TerminalPane({
      title: "",
      status: t("waitingStdout"),
      statusKind: "idle",
      fontPx: 12,
      linePx: 16,
      contentHeightMode: "text",
      cursorBlink: true,
      inputEnabled: false,
      onInput: (data) => handleModuleTerminalInput(controller, data),
      onFocusChange: (focused) => {
        if (focused) setVoiceActiveTarget({kind: "module", controller})
        queuePublishModuleContext(controller)
      },
    }),
    verbose: new VerbosePane(moduleVerboseStorageKey(module.id)),
    sourceCache: new Map<string, CachedSource>(),
    sourceTextKey: "",
    sourceText: "",
    sourceIdentity: null,
    sourceDirty: false,
    sourceSaving: false,
    breakpointRegistrations: [],
    pendingBreakpointLines: new Set<number>(),
    activeFrameIndex: 0,
    dump: undefined,
    sourceLocation: "",
    sourceRuntimeState: "idle" as SourceRuntimeState,
    sourceContext: emptySourceInteractionContext(),
    outputLineCount: 0,
    agentTerminalEntries: readStoredModuleAgentTerminalEntries(module.id, module.target.startedAt),
    agentOutputLineCount: 0,
    agentTerminalTargetStartedAt: module.target.startedAt,
    activeCommand: null,
    verboseVisible: readModuleVerboseVisible(module.id),
    contextPublishQueued: false,
    workspaceFiles,
    terminalInput: {
      buffer: "",
      promptVisible: false,
    },
  } satisfies ModuleDisplayController)

  controller.frames.node.name = `InterpreterFrames:${module.id}`
  controller.filesChrome.node.name = `InterpreterFilesChrome:${module.id}`
  controller.filesHeader.node.name = `InterpreterFilesHeader:${module.id}`
  controller.files.node.name = `InterpreterFiles:${module.id}`
  controller.scopes.node.name = `InterpreterScopes:${module.id}`
  controller.source.node.name = `InterpreterSource:${module.id}`
  controller.terminal.node.name = `InterpreterTerminal:${module.id}`
  controller.verbose.node.name = `InterpreterVerbose:${module.id}`
  updateModuleDisplay(controller, module)
  return controller
}

function updateModuleDisplay(controller: ModuleDisplayController, module: ModulePaneSnapshot, options: {renderPausedDump?: boolean} = {}): void {
  const nextWorkspaceModulePath = module.modulePath ?? null
  if (controller.workspaceFiles.modulePath !== nextWorkspaceModulePath) {
    controller.workspaceFiles.modulePath = nextWorkspaceModulePath
    void refreshWorkspaceFiles(controller)
  }

  if (module.target.startedAt !== controller.agentTerminalTargetStartedAt) {
    controller.agentTerminalTargetStartedAt = module.target.startedAt
    controller.agentTerminalEntries = readStoredModuleAgentTerminalEntries(module.id, module.target.startedAt)
    controller.agentOutputLineCount = 0
    if (module.target.startedAt !== null) refreshSqliteDisplaysAfterTargetRestart(module.target.startedAt)
  }
  if (module.target.outputLineCount < controller.outputLineCount) {
    controller.terminal.clear()
    controller.terminalInput.buffer = ""
    controller.terminalInput.promptVisible = false
    controller.outputLineCount = 0
    controller.agentOutputLineCount = 0
  }
  const nextLines = module.target.output.slice(controller.outputLineCount)
  if (nextLines.length > 0) {
    hideModuleTerminalPrompt(controller)
    for (const line of nextLines) appendModuleTargetLine(controller, line)
    controller.outputLineCount = module.target.outputLineCount
  }
  syncModuleAgentTerminalEntries(controller)
  updateModuleTerminalStatus(controller, module)

  const finishedState = module.target.state === "exited"
    ? "exited"
    : module.target.state === "failed"
      ? "failed"
      : null
  if (module.paused && module.dump !== null && options.renderPausedDump !== false) {
    applyModuleDump(module.id, module.dump)
  } else if (finishedState !== null) {
    if (controller.dump !== undefined) clearModuleLiveContext(controller)
    if (!restoreFinishedModuleSource(controller, module, finishedState)) {
      setModuleSourceState(controller, finishedState)
    }
  } else if (!module.paused && controller.dump !== undefined) {
    markModuleResumed(module.id)
  } else if (!module.paused) {
    if (module.connection.state !== "connected") setModuleSourceState(controller, "disconnected")
    else if (module.target.state === "running" || module.target.state === "starting") setModuleSourceState(controller, "running")
  }

  updateModuleHeaderControls(controller, module)
  syncModuleTerminalInput(controller)
}

function initialWorkspaceFilesState(module: ModulePaneSnapshot): WorkspaceFilesState {
  const storageKey = workspaceFilesStorageKey(undefined, module.id)
  const storedState = readStoredWorkspaceFilesState(storageKey)
  return {
    root: null,
    workspacePath: "",
    modulePath: module.modulePath ?? null,
    rootLabel: null,
    items: [],
    expandedIds: storedState.expandedIds,
    selectedIds: storedState.selectedIds,
    storageKey,
    loading: null,
    suppressSelectionOpen: false,
  }
}

async function refreshWorkspaceFiles(controller: ModuleDisplayController): Promise<void> {
  if (controller.workspaceFiles.loading !== null) return controller.workspaceFiles.loading
  controller.workspaceFiles.loading = (async () => {
    try {
      const res = await fetch(processApiPath(controller.id, `/modules?limit=${WORKSPACE_FILES_LIMIT}`))
      const data = await res.json() as WorkspaceFilesPayload
      const files = Array.isArray(data.modules) ? data.modules : data.files
      const paths = Array.isArray(files)
        ? files.map((file) => typeof file.path === "string" ? file.path : "").filter((path) => path.length > 0)
        : []
      const items = workspaceFileTree(paths)
      const storageKey = workspaceFilesStorageKey(data.root, controller.id)
      const storedState = readStoredWorkspaceFilesState(storageKey)
      controller.workspaceFiles.root = data.root ?? null
      controller.workspaceFiles.workspacePath = normalizeWorkspacePath(data.workspacePath ?? "")
      controller.workspaceFiles.modulePath = data.entrypoint ?? data.modulePath ?? controller.workspaceFiles.modulePath
      controller.workspaceFiles.rootLabel = workspaceRootLabel(data.root)
      controller.workspaceFiles.items = items
      controller.workspaceFiles.storageKey = storageKey
      controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(storedState.expandedIds, items)
      controller.workspaceFiles.selectedIds = normalizeFileListSelection(storedState.selectedIds, items, "single")
      applyWorkspaceFilesToModuleDisplay(controller)
    } catch (error) {
      console.warn(`workspace files refresh failed for ${controller.id}:`, error)
      controller.workspaceFiles.root = null
      controller.workspaceFiles.workspacePath = ""
      controller.workspaceFiles.rootLabel = null
      controller.workspaceFiles.items = []
      controller.workspaceFiles.expandedIds = []
      controller.workspaceFiles.selectedIds = []
      applyWorkspaceFilesToModuleDisplay(controller)
    } finally {
      controller.workspaceFiles.loading = null
    }
  })()
  return controller.workspaceFiles.loading
}

function applyWorkspaceFilesToModuleDisplay(controller: ModuleDisplayController): void {
  const state = controller.workspaceFiles
  state.suppressSelectionOpen = true
  try {
    controller.filesHeader.setRootLabel(state.rootLabel)
    controller.files.setTitle(t("sourceFiles"))
    controller.files.setItems(state.items)
    controller.files.setExpandedIds(state.expandedIds)
    controller.files.setSelectedIds(state.selectedIds)
  } finally {
    state.suppressSelectionOpen = false
  }
}

function setWorkspaceFilesExpandedIds(controller: ModuleDisplayController, ids: readonly string[]): void {
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(ids, controller.workspaceFiles.items)
  writeStoredWorkspaceFilesState(controller)
  controller.files.setExpandedIds(controller.workspaceFiles.expandedIds)
}

function updateWorkspaceFilesSelectedState(controller: ModuleDisplayController, ids: readonly string[]): void {
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(ids, controller.workspaceFiles.items, "single")
  writeStoredWorkspaceFilesState(controller)
}

function setWorkspaceFilesSelectedIds(controller: ModuleDisplayController, ids: readonly string[]): void {
  updateWorkspaceFilesSelectedState(controller, ids)
  controller.workspaceFiles.suppressSelectionOpen = true
  try {
    controller.files.setSelectedIds(controller.workspaceFiles.selectedIds)
  } finally {
    controller.workspaceFiles.suppressSelectionOpen = false
  }
}

type OpenWorkspaceSourceResult =
  | {ok: true; sourceUrl: string; location: string; scriptUrl: string; sourceKind: string | null}
  | {ok: false; sourceUrl: string; location: string; error: string}

async function openWorkspaceFile(controller: ModuleDisplayController, item: FileListItem): Promise<void> {
  const sourceUrl = workspaceFileSourceUrl(controller, item)
  await openWorkspaceSource(controller, sourceUrl)
}

async function openWorkspaceSource(
  controller: ModuleDisplayController,
  sourceUrl: string,
  options: SourceOpenOptions = {},
): Promise<OpenWorkspaceSourceResult> {
  const location = sourceUrl
  const identity: BreakpointSourceIdentity = {
    scriptId: "",
    scriptUrl: "",
    sourceUrl,
    key: sourceUrl,
  }
  revealWorkspaceSource(controller, sourceUrl)
  setModuleSource(controller, {
    text: "loading...",
    currentLine: 0,
    location,
    identity,
  }, "loading", false)

  try {
    const res = await fetch(processApiPath(controller.id, `/source?sourceUrl=${encodeURIComponent(sourceUrl)}`))
    const data = await res.json() as {
      url?: string
      scriptUrl?: string
      scriptSource?: string
      tokens?: EditorTokens
      sourceKind?: string
      error?: string
    }
    if (typeof data.scriptSource !== "string") {
      const error = data.error ?? "unknown"
      setModuleSource(controller, {
        text: `no source: ${error}`,
        currentLine: 0,
        location,
        identity,
      }, "idle", false)
      return {ok: false, sourceUrl, location, error}
    }
    const responseSourceUrl = data.url ?? sourceUrl
    const responseScriptUrl = data.scriptUrl ?? ""
    controller.sourceDirty = false
    setModuleSource(controller, {
      text: data.scriptSource,
      currentLine: 0,
      location: responseSourceUrl,
      identity: {
        scriptId: "",
        scriptUrl: responseScriptUrl,
        sourceUrl: responseSourceUrl,
        key: responseSourceUrl,
      },
      ...(data.tokens === undefined ? {} : {tokens: data.tokens}),
    }, "idle", false)
    applySourceOpenPosition(controller, options)
    revealWorkspaceSource(controller, responseSourceUrl)
    return {
      ok: true,
      sourceUrl: responseSourceUrl,
      location: responseSourceUrl,
      scriptUrl: responseScriptUrl,
      sourceKind: data.sourceKind ?? null,
    }
  } catch (error) {
    const message = String(error)
    setModuleSource(controller, {
      text: `fetch failed: ${message}`,
      currentLine: 0,
      location,
      identity,
    }, "idle", false)
    return {ok: false, sourceUrl, location, error: message}
  }
}

async function saveModuleSource(controller: ModuleDisplayController, text: string): Promise<void> {
  if (controller.sourceSaving) return
  const sourceUrl = currentEditableSourceUrl(controller)
  if (sourceUrl === undefined) {
    controller.source.setTitle(`${moduleSourceTitle(controller)} - no file`)
    return
  }

  controller.sourceSaving = true
  controller.source.setTitle(moduleSourceTitle(controller))
  try {
    const res = await fetch(processApiPath(controller.id, "/source"), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({sourceUrl, text}),
    })
    const data = await res.json() as {ok?: boolean; error?: string}
    if (!res.ok || data.ok !== true) throw new Error(data.error ?? `save failed: ${res.status}`)
    controller.sourceDirty = false
    controller.sourceCache.clear()
  } catch (error) {
    controller.source.setTitle(`${moduleSourceTitle(controller)} - ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    controller.sourceSaving = false
    controller.source.setTitle(moduleSourceTitle(controller))
    queuePublishModuleContext(controller)
  }
}

function handleModuleSourceTextChange(controller: ModuleDisplayController, text: string): void {
  const lineChanges = sourceTextLineChanges(controller.sourceText, text)
  controller.sourceText = text
  if (lineChanges.length > 0) applyLocalSourceLineChanges(controller, lineChanges)
  controller.sourceDirty = true
  controller.source.setTitle(moduleSourceTitle(controller))
  queuePublishModuleContext(controller)
}

function applyLocalSourceLineChanges(controller: ModuleDisplayController, lineChanges: readonly SourceLineChange[]): void {
  const source = controller.sourceIdentity
  if (source === null || lineChanges.length === 0) return

  let breakpointsChanged = false
  controller.breakpointRegistrations = controller.breakpointRegistrations.map((registration) => {
    if (!breakpointRegistrationMatchesSource(registration, source)) return registration
    const nextLine = remapSourceLine(registration.spec.line, lineChanges)
    if (nextLine === registration.spec.line) return registration
    breakpointsChanged = true
    return {...registration, spec: {...registration.spec, line: nextLine}}
  })

  const stored = readStoredBreakpointSpecs()
  const nextStored = stored.map((spec) => {
    if (!breakpointSpecMatchesSource(spec, source)) return spec
    const nextLine = remapSourceLine(spec.line, lineChanges)
    return nextLine === spec.line ? spec : {...spec, line: nextLine}
  })
  if (nextStored.some((spec, index) => spec.line !== stored[index]?.line)) {
    writeStoredBreakpointSpecs(nextStored)
    breakpointsChanged = true
  }

  if (controller.pendingBreakpointLines.size > 0) {
    controller.pendingBreakpointLines = new Set([...controller.pendingBreakpointLines].map((line) => remapSourceLine(line, lineChanges)))
    breakpointsChanged = true
  }

  let executionLine: number | null = null
  const dump = controller.dump
  if (dump !== undefined) {
    let dumpChanged = false
    const frames = dump.frames.map((frame) => {
      if (!frameMatchesSourceIdentity(frame as FrameSnapshot, source)) return frame
      const nextLine = remapSourceLine(frame.line, lineChanges)
      if (nextLine === frame.line) return frame
      dumpChanged = true
      return {...frame, line: nextLine}
    })
    if (dumpChanged) {
      controller.dump = {...dump, frames}
      controller.frames.setFrames(frames as FrameSnapshot[], controller.activeFrameIndex)
    }
    const activeFrame = frames[controller.activeFrameIndex] ?? frames[0]
    if (activeFrame !== undefined && frameMatchesSourceIdentity(activeFrame as FrameSnapshot, source)) {
      executionLine = activeFrame.line
    }
  }

  if (controller.sourceRuntimeState === "paused") controller.source.setExecutionLine(executionLine, {scroll: false})
  if (breakpointsChanged) syncModuleBreakpointMarkers(controller)
}

function sourceTextLineChanges(before: string, after: string): SourceLineChange[] {
  if (before === after) return []
  const oldLines = before.split("\n")
  const newLines = after.split("\n")
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldChanged = oldLines.length - prefix - suffix
  const newChanged = newLines.length - prefix - suffix
  if (oldChanged === newChanged) return []
  return [{
    oldStart: prefix + 1,
    oldLines: oldChanged,
    newStart: prefix + 1,
    newLines: newChanged,
  }]
}

function remapSourceLine(line: number, changes: readonly SourceLineChange[]): number {
  let current = Math.max(1, Math.floor(line))
  for (const change of changes) {
    const oldStart = Math.max(1, Math.floor(change.oldStart))
    const oldLines = Math.max(0, Math.floor(change.oldLines))
    const newStart = Math.max(1, Math.floor(change.newStart))
    const newLines = Math.max(0, Math.floor(change.newLines))
    const delta = newLines - oldLines

    if (oldLines === 0) {
      if (current >= oldStart) current += newLines
      continue
    }

    const oldEnd = oldStart + oldLines - 1
    if (current < oldStart) continue
    if (current > oldEnd) {
      current += delta
      continue
    }
    current = newLines === 0
      ? Math.max(1, newStart)
      : newStart + Math.min(current - oldStart, newLines - 1)
  }
  return Math.max(1, current)
}

function frameMatchesSourceIdentity(frame: FrameSnapshot, source: BreakpointSourceIdentity): boolean {
  return [source.sourceUrl, source.scriptUrl, source.key].some((candidate) => (
    candidate.trim().length > 0 && sameSourceUrl(frame.url, candidate)
  ))
}

function currentEditableSourceUrl(controller: ModuleDisplayController): string | undefined {
  const candidates = [
    controller.sourceIdentity?.sourceUrl,
    controller.sourceIdentity?.scriptUrl,
    sourcePathFromLocation(controller.sourceLocation),
  ]
  for (const candidate of candidates) {
    const clean = typeof candidate === "string" ? stripSourceLine(candidate.trim()) : ""
    if (clean.length > 0) return clean
  }
  return undefined
}

function handleSourcePatched(msg: Extract<ServerMessage, {type: "source-patched"}>): void {
  applySourcePatchedBreakpoints(msg)
  const patchedKeys = msg.files.flatMap((file) => sourcePatchFileKeys(file))
  for (const controller of moduleDisplays.values()) {
    clearPatchedSourceCache(controller, patchedKeys)
    const sourceUrl = controllerPatchedSourceUrl(controller, patchedKeys)
    if (sourceUrl === undefined) continue
    if (controller.sourceDirty || controller.sourceSaving) continue
    void refreshOpenSourceFromDisk(controller, sourceUrl)
  }
}

function applySourcePatchedBreakpoints(msg: Extract<ServerMessage, {type: "source-patched"}>): void {
  const updates = msg.breakpoints ?? []
  if (updates.length === 0) return
  const patchedKeys = msg.files.flatMap((file) => sourcePatchFileKeys(file))
  const nextStored = readStoredBreakpointSpecs().filter((spec) => !breakpointSpecMatchesPatchedKeys(spec, patchedKeys))
  for (const update of updates) {
    const controller = moduleDisplays.get(update.moduleId)
    if (controller !== undefined) {
      controller.breakpointRegistrations = update.breakpoints
      syncModuleBreakpointMarkers(controller)
    }
    for (const registration of update.breakpoints) {
      if (!breakpointSpecMatchesPatchedKeys(registration.spec, patchedKeys)) continue
      nextStored.push(registration.spec)
    }
  }
  writeStoredBreakpointSpecs(nextStored)
}

function controllerPatchedSourceUrl(
  controller: ModuleDisplayController,
  changed: readonly string[],
): string | undefined {
  for (const candidate of [
    controller.sourceIdentity?.sourceUrl,
    controller.sourceIdentity?.scriptUrl,
    sourcePathFromLocation(controller.sourceLocation),
  ]) {
    const candidateKeys = sourceChangeKeyVariants(candidate)
    if (candidateKeys.some((candidateKey) => changed.some((changedKey) => sourceChangeKeysMatch(candidateKey, changedKey)))) {
      return currentEditableSourceUrl(controller) ?? changed[0]
    }
  }
  return undefined
}

function clearPatchedSourceCache(controller: ModuleDisplayController, changed: readonly string[]): void {
  for (const [cacheKey, cached] of controller.sourceCache) {
    const candidates = [
      cacheKey.split("\0").at(-1),
      cached.sourceUrl,
      cached.scriptUrl,
    ]
    const candidateKeys = candidates.flatMap((candidate) => sourceChangeKeyVariants(candidate))
    if (candidateKeys.some((candidateKey) => changed.some((changedKey) => sourceChangeKeysMatch(candidateKey, changedKey)))) {
      controller.sourceCache.delete(cacheKey)
    }
  }
}

function sourcePatchFileKeys(file: SourcePatchedFile): string[] {
  return [
    ...sourceChangeKeyVariants(file.sourceUrl),
    ...sourceChangeKeyVariants(file.path),
    ...sourceChangeKeyVariants(file.oldPath),
  ]
}

function sourceChangeKeyVariants(value: string | undefined): string[] {
  if (value === undefined) return []
  const normalized = stripSourceLine(value.trim().replaceAll("\\", "/").replace(/[?#].*$/, ""))
  if (normalized.length === 0) return []
  const withoutRuntimePrefix = normalized.replace(/^r\//, "")
  return normalized === withoutRuntimePrefix ? [normalized] : [normalized, withoutRuntimePrefix]
}

function sourceChangeKeysMatch(candidate: string, changed: string): boolean {
  if (candidate === changed) return true
  return candidate.endsWith(`/${changed}`) || changed.endsWith(`/${candidate}`)
}

function breakpointSpecMatchesPatchedKeys(spec: BreakpointSpec, patchedKeys: string[]): boolean {
  if (spec.urlRegex !== undefined) {
    try {
      const regex = new RegExp(spec.urlRegex)
      if (patchedKeys.some((patchedKey) => regex.test(patchedKey))) return true
    } catch {}
  }
  for (const candidate of [
    spec.url,
    spec.sourceUrl,
  ]) {
    const candidateKeys = sourceChangeKeyVariants(candidate)
    if (candidateKeys.some((candidateKey) => patchedKeys.some((patchedKey) => sourceChangeKeysMatch(candidateKey, patchedKey)))) return true
  }
  return false
}

async function refreshOpenSourceFromDisk(controller: ModuleDisplayController, sourceUrl: string): Promise<void> {
  const cursor = controller.sourceContext.cursor
  const line = Math.max(1, Math.floor(cursor.line))
  const column = Math.max(0, Math.floor(cursor.column))
  await openWorkspaceSource(controller, sourceUrl, {line, column})
}

function applySourceOpenPosition(controller: ModuleDisplayController, options: SourceOpenOptions): void {
  if (options.line === undefined) return
  const line = Math.max(1, Math.floor(options.line))
  const column = Math.max(0, Math.floor(options.column ?? 0))
  controller.source.setCursor(line - 1, column)
}

function workspaceFileSourceUrl(controller: ModuleDisplayController, item: FileListItem): string {
  const itemPath = typeof item.path === "string" && item.path.length > 0 ? item.path : item.id
  const root = controller.workspaceFiles.root
  if (root === null || root.trim().length === 0) return itemPath
  return `${root.replaceAll("\\", "/").replace(/\/+$/, "")}/${itemPath.replaceAll("\\", "/").replace(/^\/+/, "")}`
}

function workspaceFileTree(paths: readonly string[]): FileListItem[] {
  const root: WorkspaceTreeNode = {id: "", name: "", dirs: new Map(), files: []}
  for (const rawPath of paths) {
    const path = normalizeWorkspaceFilePath(rawPath)
    if (path === null) continue
    const parts = path.split("/")
    const fileName = parts.pop()
    if (fileName === undefined || fileName.length === 0) continue
    let node = root
    let currentPath = ""
    for (const part of parts) {
      currentPath = currentPath.length === 0 ? part : `${currentPath}/${part}`
      let child = node.dirs.get(part)
      if (child === undefined) {
        child = {id: currentPath, name: part, dirs: new Map(), files: []}
        node.dirs.set(part, child)
      }
      node = child
    }
    node.files.push({
      id: path,
      name: fileName,
      kind: "file",
      path,
    })
  }
  return workspaceTreeChildren(root)
}

type WorkspaceTreeNode = {
  id: string
  name: string
  dirs: Map<string, WorkspaceTreeNode>
  files: FileListItem[]
}

function workspaceTreeChildren(node: WorkspaceTreeNode): FileListItem[] {
  const dirs = [...node.dirs.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((dir): FileListItem => ({
      id: dir.id,
      name: dir.name,
      kind: "directory",
      path: dir.id,
      children: workspaceTreeChildren(dir),
    }))
  const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

function normalizeWorkspaceFilePath(path: string): string | null {
  const normalized = path.trim().replaceAll("\\", "/")
  if (normalized.length === 0) return null
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".")
  if (parts.length === 0 || parts.some((part) => part === "..")) return null
  return parts.join("/")
}

function workspaceDirectoryIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind !== "directory") continue
    ids.push(item.id)
    if (item.children !== undefined) ids.push(...workspaceDirectoryIds(item.children))
  }
  return ids
}

function revealCurrentWorkspaceFile(controller: ModuleDisplayController): void {
  const fileId = currentWorkspaceFileId(controller)
  if (fileId === null) return
  setWorkspaceFilesExpandedIds(controller, [...new Set([...controller.workspaceFiles.expandedIds, ...workspaceParentIds(fileId)])])
  setWorkspaceFilesSelectedIds(controller, [fileId])
}

function currentWorkspaceFileId(controller: ModuleDisplayController): string | null {
  const candidates = [
    controller.sourceLocation,
    controller.sourceIdentity?.sourceUrl,
    controller.sourceIdentity?.scriptUrl,
    controller.sourceIdentity?.key,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
  return workspaceFileIdForSources(controller, candidates)
}

function revealWorkspaceSource(controller: ModuleDisplayController, sourceUrl: string): void {
  const fileId = workspaceFileIdForSources(controller, [sourceUrl])
  if (fileId === null) return
  setWorkspaceFilesExpandedIds(controller, [...new Set([...controller.workspaceFiles.expandedIds, ...workspaceParentIds(fileId)])])
  setWorkspaceFilesSelectedIds(controller, [fileId])
}

function workspaceFileIdForSources(controller: ModuleDisplayController, sources: readonly string[]): string | null {
  const knownIds = new Set(workspaceFileIds(controller.workspaceFiles.items))
  for (const candidate of sources) {
    const direct = workspaceFileIdCandidates(candidate, controller.workspaceFiles)
    for (const id of direct) {
      if (knownIds.has(id)) return id
    }
  }

  for (const candidate of sources) {
    const normalized = normalizeSourceFilePath(candidate)
    if (normalized.length === 0) continue
    const suffixMatches = [...knownIds].filter((id) => normalized === id || normalized.endsWith(`/${id}`))
    if (suffixMatches.length === 1) return suffixMatches[0]!
  }
  return null
}

function workspaceFileIdCandidates(source: string, state: WorkspaceFilesState): string[] {
  const candidates = new Set<string>()
  const add = (value: string): void => {
    const normalized = normalizeWorkspacePath(value)
    if (normalized.length === 0) return
    candidates.add(normalized)
    const withoutPrefix = stripWorkspacePathPrefix(normalized, state.workspacePath)
    if (withoutPrefix.length > 0) candidates.add(withoutPrefix)
  }

  const normalized = normalizeSourceFilePath(source)
  add(normalized)
  if (normalized.startsWith("r/")) add(normalized.slice(2))

  const root = normalizeSourceFilePath(state.root ?? "")
  if (root.length > 0 && normalized.startsWith(`${root}/`)) add(normalized.slice(root.length + 1))

  return [...candidates]
}

function stripWorkspacePathPrefix(path: string, workspacePath: string): string {
  const prefix = normalizeWorkspacePath(workspacePath)
  if (prefix.length === 0) return path
  if (path === prefix) return ""
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : path
}

function workspaceParentIds(fileId: string): string[] {
  const parts = fileId.split("/")
  const parents: string[] = []
  let current = ""
  for (let idx = 0; idx < parts.length - 1; idx++) {
    current = current.length === 0 ? parts[idx]! : `${current}/${parts[idx]!}`
    parents.push(current)
  }
  return parents
}

function workspaceFileIds(items: readonly FileListItem[]): string[] {
  const ids: string[] = []
  for (const item of items) {
    if (item.kind === "file") ids.push(item.id)
    if (item.children !== undefined) ids.push(...workspaceFileIds(item.children))
  }
  return ids
}

function normalizeWorkspaceExpandedIds(ids: readonly string[], items: readonly FileListItem[]): string[] {
  const known = new Set(workspaceDirectoryIds(items))
  const next: string[] = []
  for (const id of ids) {
    if (!known.has(id) || next.includes(id)) continue
    next.push(id)
  }
  return next
}

function workspaceRootLabel(root: string | undefined): string | null {
  if (root === undefined) return null
  const normalized = root.trim().replaceAll("\\", "/").replace(/\/+$/, "")
  if (normalized.length === 0) return null
  const parts = normalized.split("/").filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? normalized
}

function workspaceFilesStorageKey(root: string | undefined, moduleId: string): string {
  const normalized = root?.trim().replaceAll("\\", "/").replace(/\/+$/, "")
  const rootKey = normalized === undefined || normalized.length === 0 ? "default" : normalized
  return `${WORKSPACE_FILES_STATE_STORAGE_PREFIX}:${moduleId}:${rootKey}`
}

function readStoredWorkspaceFilesState(storageKey: string): WorkspaceFilesStoredState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return {expandedIds: [], selectedIds: []}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      expandedIds: storedStringArray(parsed.expandedIds),
      selectedIds: storedStringArray(parsed.selectedIds),
    }
  } catch {
    return {expandedIds: [], selectedIds: []}
  }
}

function writeStoredWorkspaceFilesState(controller: ModuleDisplayController): void {
  try {
    localStorage.setItem(controller.workspaceFiles.storageKey, JSON.stringify({
      expandedIds: controller.workspaceFiles.expandedIds,
      selectedIds: controller.workspaceFiles.selectedIds,
    }))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function normalizeSourceFilePath(path: string): string {
  const clean = stripSourceLine(path).trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.startsWith("file:")) {
    try {
      const url = new URL(clean)
      return normalizeWorkspacePath(decodeURIComponent(url.pathname))
    } catch {
      return normalizeWorkspacePath(clean)
    }
  }
  return normalizeWorkspacePath(clean)
}

function stripSourceLine(path: string): string {
  const idx = path.lastIndexOf(":")
  if (idx < 0) return path
  return /^\d+$/.test(path.slice(idx + 1)) ? path.slice(0, idx) : path
}

function normalizeWorkspacePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
}

function storedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const next: string[] = []
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || next.includes(item)) continue
    next.push(item)
  }
  return next
}

function updateModuleHeaderControls(controller: ModuleDisplayController, module: ModulePaneSnapshot): void {
  const run = moduleRunStatus(module)
  const runKind = controller.activeCommand === null ? run.kind : "paused"
  const targetRunning = module.target.state === "starting" || module.target.state === "running"
  const contextConnected = module.connection.state === "connected"
  const canControlExecution = contextConnected && targetRunning
  const commandIdle = controller.activeCommand === null
  const canPause = commandIdle && canControlExecution && !module.paused
  const canResume = commandIdle && canControlExecution && module.paused
  const canStep = commandIdle && canControlExecution && module.paused
  const canRestart = commandIdle && module.target.command.length > 0
  const canStop = commandIdle && targetRunning
  const canShowExecutionPoint = commandIdle && canControlExecution && module.paused && controller.dump !== undefined && controller.dump.frames.length > 0
  const actionUnavailableTooltip = t("runtimeActionUnavailable")

  controller.terminal.setHeaderControls({
    primary: [
      runKind === "live"
        ? {
          label: t("pause"),
          iconSrc: uiIcons.pause,
          tone: pauseButtonTone(runKind),
          dividerAfter: true,
          disabled: !canPause,
          disabledTooltip: actionUnavailableTooltip,
          action: () => void runModuleInterpreterCommand(controller, "pause", {}, t("pause")),
        }
        : {
          label: t("resume"),
          iconSrc: uiIcons.resume,
          tone: resumeButtonTone(runKind),
          dividerAfter: true,
          disabled: !canResume,
          disabledTooltip: actionUnavailableTooltip,
          action: () => void runModuleInterpreterCommand(controller, "resume", {}, t("resume")),
        },
      {
        label: t("stepOver"),
        iconSrc: uiIcons.stepOver,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "over"}, t("stepOver")),
      },
      {
        label: t("stepInto"),
        iconSrc: uiIcons.stepInto,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        disabledTooltip: actionUnavailableTooltip,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "into"}, t("stepInto")),
      },
      {
        label: t("stepOut"),
        iconSrc: uiIcons.stepOut,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        disabledTooltip: actionUnavailableTooltip,
        dividerAfter: true,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "out"}, t("stepOut")),
      },
      {
        label: t("restartTarget"),
        iconSrc: uiIcons.restart,
        tone: "neutral",
        disabled: !canRestart,
        disabledTooltip: actionUnavailableTooltip,
        action: () => void restartModule(controller.id),
      },
      {
        label: t("showExecutionPoint"),
        iconSrc: uiIcons.executionPoint,
        tone: canShowExecutionPoint ? "paused" : "neutral",
        disabled: !canShowExecutionPoint,
        disabledTooltip: t("waitingFrames"),
        action: () => showModuleExecutionPoint(controller),
      },
      {
        label: t("stopTarget"),
        iconSrc: uiIcons.stop,
        tone: "warn",
        disabled: !canStop,
        disabledTooltip: actionUnavailableTooltip,
        action: () => void stopModule(controller.id),
      },
    ],
    secondary: [
      {
        label: controller.verboseVisible ? t("hideVerbose") : t("showVerbose"),
        iconSrc: uiIcons.log,
        tone: controller.verboseVisible ? "paused" : "neutral",
        action: () => setVerboseVisible(controller, !controller.verboseVisible),
      },
      {
        label: languageTooltip(getUiLocale()),
        iconSrc: uiIcons.language,
        tone: "neutral",
        action: () => toggleLocale(),
      },
    ],
  })
}

function moduleRunStatus(module: ModulePaneSnapshot): {text: string; kind: RuntimeControlTone} {
  if (module.paused) return {text: "paused", kind: "paused"}
  if (module.target.state === "running") return {text: "running", kind: "live"}
  if (module.target.state === "starting") return {text: "module starting", kind: "neutral"}
  if (module.target.state === "exited") return {text: `exited code=${module.target.exitCode}`, kind: module.target.exitCode === 0 ? "neutral" : "warn"}
  if (module.target.state === "failed") return {text: "failed", kind: "warn"}
  return {text: "waiting", kind: "neutral"}
}

function pauseButtonTone(runKind: RuntimeControlTone): RuntimeControlTone {
  return runKind === "live" ? "warn" : "neutral"
}

function resumeButtonTone(runKind: RuntimeControlTone): RuntimeControlTone {
  return runKind === "paused" ? "live" : "neutral"
}

function stepButtonTone(runKind: RuntimeControlTone): RuntimeControlTone {
  return "neutral"
}

function languageTooltip(locale: "ru" | "en"): string {
  return locale === "ru" ? "Язык: русский" : "Language: English"
}

function applyModuleDump(moduleId: string, dump: InterpreterDump): void {
  const controller = moduleDisplays.get(moduleId)
  if (controller === undefined) return
  const isNewPause = controller.dump?.timestamp !== dump.timestamp
  controller.dump = dump
  if (!isNewPause) {
    const snapshot = moduleSnapshots.get(moduleId)
    if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
    return
  }
  controller.activeFrameIndex = 0
  controller.activeFrameIndex = Math.min(controller.activeFrameIndex, Math.max(0, dump.frames.length - 1))
  renderModuleDump(controller, isNewPause)
  const snapshot = moduleSnapshots.get(moduleId)
  if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
}

function clearModuleLiveContext(controller: ModuleDisplayController): void {
  controller.dump = undefined
  controller.frames.setFrames([], controller.activeFrameIndex)
  controller.scopes.setFrame(null)
  syncModuleBreakpointMarkers(controller)
}

function restoreFinishedModuleSource(controller: ModuleDisplayController, module: ModulePaneSnapshot, state: "exited" | "failed"): boolean {
  const frame = module.dump?.frames[0]
  if (frame === undefined) return false

  if (controller.sourceTextKey.length > 0 && controller.sourceLocation.length > 0) {
    setModuleSourceState(controller, state)
    return true
  }

  void renderModuleSourceForFrame(controller, frame as FrameSnapshot, true, state)
  return true
}

function markModuleResumed(moduleId: string): void {
  const controller = moduleDisplays.get(moduleId)
  if (controller === undefined) return
  clearModuleLiveContext(controller)
  setModuleSourceState(controller, "running")
  const snapshot = moduleSnapshots.get(moduleId)
  if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
}

function showModuleExecutionPoint(controller: ModuleDisplayController): void {
  const snapshot = moduleSnapshots.get(controller.id)
  if (snapshot?.paused !== true || controller.dump === undefined || controller.dump.frames.length === 0) return
  controller.activeFrameIndex = 0
  renderModuleDump(controller, true)
  setModuleSourceState(controller, "paused")
}

function renderModuleDump(controller: ModuleDisplayController, forceScroll = false): void {
  const dump = controller.dump
  if (dump === undefined) {
    controller.frames.setFrames([], controller.activeFrameIndex)
    controller.scopes.setFrame(null)
    return
  }
  controller.frames.setFrames(dump.frames as FrameSnapshot[], controller.activeFrameIndex)
  const frame = dump.frames[controller.activeFrameIndex] ?? dump.frames[0]
  if (frame === undefined) {
    controller.scopes.setFrame(null)
    return
  }
  controller.scopes.setFrame(frame as FrameSnapshot)
  void renderModuleSourceForFrame(controller, frame as FrameSnapshot, forceScroll)
}

async function renderModuleSourceForFrame(controller: ModuleDisplayController, frame: FrameSnapshot, forceScroll: boolean, finalState: SourceRuntimeState = "paused"): Promise<void> {
  const scriptId = frame.scriptId
  if (scriptId === undefined || scriptId.length === 0) {
    setModuleSource(controller, {
      text: "scriptId недоступен для этого фрейма",
      currentLine: 0,
      location: "",
      identity: null,
    }, finalState, forceScroll)
    return
  }
  const location = sourceLocation(frame.url, scriptId, frame.line)
  const sourceKind = frame.sourceKind === "runtime" ? "runtime" : "sourcemap"
  const cacheKey = sourceKind === "runtime"
    ? `${scriptId}\0runtime\0${frame.url}`
    : `sourcemap\0${frame.url}`
  let cached = controller.sourceCache.get(cacheKey)
  if (cached === undefined) {
    setModuleSourceState(controller, "loading")
    setModuleSource(controller, {
      text: "loading...",
      currentLine: 0,
      location,
      identity: null,
    }, "loading", false)
    try {
      const res = await fetch(processApiPath(controller.id, `/source?scriptId=${encodeURIComponent(scriptId)}&sourceUrl=${encodeURIComponent(frame.url)}&sourceKind=${sourceKind}`))
      const data = await res.json() as {
        url?: string
        scriptUrl?: string
        scriptSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        setModuleSource(controller, {
          text: `no source: ${data.error ?? "unknown"}`,
          currentLine: 0,
          location,
          identity: null,
        }, finalState, false)
        return
      }
      cached = {
        text: data.scriptSource,
        sourceUrl: data.url ?? frame.url,
        scriptUrl: data.scriptUrl ?? "",
        ...(data.tokens === undefined ? {} : {tokens: data.tokens}),
      }
      controller.sourceCache.set(cacheKey, cached)
    } catch (error) {
      setModuleSource(controller, {
        text: `fetch failed: ${String(error)}`,
        currentLine: 0,
        location,
        identity: null,
      }, finalState, false)
      return
    }
  }

  const sourceUrl = cached.sourceUrl || frame.url
  const scriptUrl = cached.scriptUrl || frame.url
  controller.sourceDirty = false
  setModuleSource(controller, {
    text: cached.text,
    currentLine: frame.line,
    location: sourceLocation(sourceUrl, scriptId, frame.line),
    identity: {
      scriptId,
      scriptUrl,
      sourceUrl,
      key: sourceUrl || scriptUrl || frame.url,
    },
    ...(cached.tokens === undefined ? {} : {tokens: cached.tokens}),
  }, finalState, forceScroll)
}

function setModuleSource(controller: ModuleDisplayController, payload: Source, state: SourceRuntimeState, forceScroll: boolean): void {
  controller.sourceLocation = payload.location
  controller.sourceRuntimeState = state
  controller.sourceIdentity = payload.identity
  controller.source.setTitle(moduleSourceTitle(controller))
  const sourceKey = [
    payload.identity?.scriptId ?? "",
    payload.identity?.sourceUrl ?? "",
    payload.identity?.scriptUrl ?? "",
    payload.identity?.key ?? "",
    payload.text.length,
    stableStringHash(payload.text),
  ].join("\0")
  controller.sourceText = payload.text
  if (controller.sourceTextKey !== sourceKey) {
    controller.sourceTextKey = sourceKey
    controller.source.setText(payload.text)
    if (payload.tokens !== undefined) controller.source.setTokens(payload.tokens)
    else controller.source.setLanguage({path: sourcePathFromLocation(payload.location)})
  }
  const executionLine = state === "paused" && payload.currentLine > 0 ? payload.currentLine : null
  controller.source.setExecutionLine(executionLine, {scroll: executionLine !== null && forceScroll !== false})
  syncModuleBreakpointMarkers(controller)
  queuePublishModuleContext(controller)
}

function setModuleSourceState(controller: ModuleDisplayController, state: SourceRuntimeState): void {
  controller.sourceRuntimeState = state
  controller.source.setTitle(moduleSourceTitle(controller))
  if (state !== "paused") controller.source.setExecutionLine(null, {scroll: false})
  queuePublishModuleContext(controller)
}

function moduleSourceTitle(controller: ModuleDisplayController): string {
  const snapshot = moduleSnapshots.get(controller.id)
  const dirty = controller.sourceDirty ? "*" : ""
  const label = `${snapshot?.label ?? controller.id}${dirty}`
  if (controller.sourceRuntimeState === "loading") return `${label} - ${t("sourceLoading")}`
  if (controller.sourceRuntimeState === "running" && controller.sourceLocation.length > 0) {
    return `${label} - ${t("sourceLastPaused")}: ${sourceDisplayLocation(controller.sourceLocation)}`
  }
  if (controller.sourceRuntimeState === "running") return `${label} - ${t("sourceRunning")}`
  if (controller.sourceRuntimeState === "exited") return `${label} - ${t("sourceExited")}`
  if (controller.sourceRuntimeState === "failed") return `${label} - ${t("sourceFailed")}`
  if (controller.sourceRuntimeState === "disconnected") return `${label} - ${t("sourceDisconnected")}`
  const location = sourceDisplayLocation(controller.sourceLocation) || t("sourceWaiting")
  return `${label} - ${location}`
}

async function runModuleInterpreterCommand(controller: ModuleDisplayController, cmd: string, params: Record<string, unknown>, label: string): Promise<CommandReply> {
  if (controller.activeCommand !== null) {
    return {ok: false, error: `${t("commandAlreadyRunning")}: ${controller.activeCommand.label}`}
  }
  const command: ActiveInterpreterCommand = {
    cmd,
    label,
    startedAt: performance.now(),
  }
  controller.activeCommand = command
  const snapshot = moduleSnapshots.get(controller.id)
  if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
  syncModuleTerminalInput(controller)
  try {
    const response = await send(cmd, params, controller.id)
    if (!response.ok) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${label}: ${response.error ?? "unknown error"}`,
      })
    }
    return response
  } finally {
    if (controller.activeCommand === command) controller.activeCommand = null
    const nextSnapshot = moduleSnapshots.get(controller.id)
    if (nextSnapshot !== undefined) updateModuleHeaderControls(controller, nextSnapshot)
    syncModuleTerminalInput(controller)
  }
}

async function restartModule(moduleId: string): Promise<void> {
  const snapshot = moduleSnapshots.get(moduleId)
  const controller = moduleDisplays.get(moduleId)
  if (controller?.activeCommand !== null && controller?.activeCommand !== undefined) return
  if (snapshot === undefined || snapshot.target.command.length === 0) return
  const activeCommand: ActiveInterpreterCommand = {
    cmd: "restart",
    label: t("restartTarget"),
    startedAt: performance.now(),
  }
  if (controller !== undefined) {
    controller.activeCommand = activeCommand
    updateModuleHeaderControls(controller, snapshot)
    syncModuleTerminalInput(controller)
  }
  try {
    const res = await fetch(processApiPath(moduleId, "/action"), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({action: "restart"}),
    })
    const data = await res.json().catch(() => null) as {ok?: boolean; error?: string} | null
    if ((!res.ok || data?.ok === false) && controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${t("restartTarget")}: ${data?.error ?? res.statusText}`,
      })
    }
  } catch (error) {
    if (controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${t("restartTarget")}: ${String(error)}`,
      })
    }
  } finally {
    if (controller?.activeCommand === activeCommand) controller.activeCommand = null
    const nextSnapshot = moduleSnapshots.get(moduleId)
    if (controller !== undefined && nextSnapshot !== undefined) updateModuleHeaderControls(controller, nextSnapshot)
    if (controller !== undefined) syncModuleTerminalInput(controller)
  }
}

async function stopModule(moduleId: string, options: {force?: boolean} = {}): Promise<boolean> {
  const controller = moduleDisplays.get(moduleId)
  if (options.force !== true && controller?.activeCommand !== null && controller?.activeCommand !== undefined) return false
  try {
    const res = await fetch(processApiPath(moduleId, "/action"), {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({action: "stop"}),
    })
    const data = await res.json().catch(() => null) as {ok?: boolean; error?: string} | null
    if ((!res.ok || data?.ok === false) && controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] process ${moduleId}/stop: ${data?.error ?? res.statusText}`,
      })
    }
    return res.ok && data?.ok !== false
  } catch (error) {
    if (controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] process ${moduleId}/stop: ${String(error)}`,
      })
    }
    return false
  }
}

type ModuleTerminalEntry = {
  ts: string
  level?: "error" | "warn" | "info" | "agent"
  text: string
}

type AgentModuleTerminalEntry = ModuleTerminalEntry & {
  targetStartedAt: string | null
}

function appendModuleTerminal(controller: ModuleDisplayController, entry: ModuleTerminalEntry, opts: {restorePrompt?: boolean} = {}): void {
  const restorePrompt = opts.restorePrompt !== false && controller.terminalInput.promptVisible && canAcceptTerminalInput(controller)
  hideModuleTerminalPrompt(controller)
  controller.terminal.writeln(`${ansiMuted(formatTimestamp(entry.ts))} ${ansiLevel(entry.level)} ${terminalOutputText(entry.text)}`)
  if (restorePrompt) showModuleTerminalPrompt(controller)
}

function appendAgentModuleTerminal(controller: ModuleDisplayController, entry: ModuleTerminalEntry): void {
  const module = moduleSnapshots.get(controller.id)
  const targetStartedAt = module?.target.startedAt ?? null
  const next: AgentModuleTerminalEntry = {
    ...entry,
    targetStartedAt,
  }
  controller.agentTerminalTargetStartedAt = targetStartedAt
  controller.agentTerminalEntries.push(next)
  if (controller.agentTerminalEntries.length > 200) {
    controller.agentTerminalEntries = controller.agentTerminalEntries.slice(-200)
    controller.agentOutputLineCount = Math.min(controller.agentOutputLineCount, controller.agentTerminalEntries.length)
  }
  storeModuleAgentTerminalEntries(controller.id, controller.agentTerminalEntries)
  appendModuleTerminal(controller, next, {restorePrompt: false})
  scrollAgentModuleTerminalToBottom(controller)
  controller.agentOutputLineCount = controller.agentTerminalEntries.length
}

function syncModuleAgentTerminalEntries(controller: ModuleDisplayController): void {
  if (controller.agentOutputLineCount >= controller.agentTerminalEntries.length) return
  const next = controller.agentTerminalEntries.slice(controller.agentOutputLineCount)
  for (const entry of next) appendModuleTerminal(controller, entry, {restorePrompt: false})
  scrollAgentModuleTerminalToBottom(controller)
  controller.agentOutputLineCount = controller.agentTerminalEntries.length
}

function scrollAgentModuleTerminalToBottom(controller: ModuleDisplayController): void {
  controller.terminal.scrollToBottom()
  requestAnimationFrame(() => controller.terminal.scrollToBottom())
}

function appendModuleTargetLine(controller: ModuleDisplayController, line: ModuleLine): void {
  const label = line.stream === "stderr" ? ansiError("err") : ansiCyan("out")
  controller.terminal.writeln(`${ansiMuted(formatTimestamp(line.ts))} ${label} ${terminalOutputText(line.text)}`)
}

function terminalOutputText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")
}

function rebuildModuleTerminalOutput(controller: ModuleDisplayController): void {
  const module = moduleSnapshots.get(controller.id)
  if (module === undefined) return
  controller.terminal.clear()
  controller.terminalInput.promptVisible = false
  controller.outputLineCount = 0
  controller.agentOutputLineCount = 0

  for (const line of module.target.output) appendModuleTargetLine(controller, line)
  controller.outputLineCount = module.target.outputLineCount
  syncModuleAgentTerminalEntries(controller)
}

function updateModuleTerminalStatus(controller: ModuleDisplayController, module: ModulePaneSnapshot): void {
  const status = moduleTerminalStatus(module)
  controller.terminal.setStatus(status.kind, status.label)
}

function moduleTerminalStatus(module: ModulePaneSnapshot): {kind: TerminalStatusKind; label: string} {
  if (module.target.state === "running" || module.target.state === "starting") return {kind: "running", label: moduleRunStatus(module).text}
  if (module.target.state === "exited") return {kind: module.target.exitCode === 0 ? "idle" : "error", label: `exit ${module.target.exitCode}`}
  if (module.target.state === "failed") return {kind: "error", label: "failed"}
  if (module.connection.state === "disconnected") return {kind: "disconnected", label: "disconnected"}
  if (module.connection.state === "connected") return {kind: "connected", label: "connected"}
  return {kind: "idle", label: t("waitingStdout")}
}

function syncModuleTerminalInput(controller: ModuleDisplayController): void {
  const canAccept = canAcceptTerminalInput(controller)
  controller.terminal.setInputEnabled(canAccept)
  if (canAccept) showModuleTerminalPrompt(controller)
  else {
    hideModuleTerminalPrompt(controller)
  }
  queuePublishModuleContext(controller)
}

function canAcceptTerminalInput(controller: ModuleDisplayController): boolean {
  if (controller.activeCommand !== null) return false
  const module = moduleSnapshots.get(controller.id)
  if (module === undefined) return false
  return module.connection.state === "connected"
    && module.paused
    && module.dump !== null
    && module.target.state !== "exited"
    && module.target.state !== "failed"
}

function showModuleTerminalPrompt(controller: ModuleDisplayController): void {
  if (controller.terminalInput.promptVisible) return
  controller.terminal.write(`${ansiCyan("> ")}${moduleTerminalInputDisplayText(controller.terminalInput.buffer)}`)
  controller.terminalInput.promptVisible = true
  queuePublishModuleContext(controller)
}

function hideModuleTerminalPrompt(controller: ModuleDisplayController): void {
  if (!controller.terminalInput.promptVisible) return
  controller.terminal.write("\r\x1b[K")
  controller.terminalInput.promptVisible = false
  queuePublishModuleContext(controller)
}

function handleModuleTerminalInput(controller: ModuleDisplayController, data: string): void {
  if (!canAcceptTerminalInput(controller)) return
  clearVoicePartialPreviewForTarget({kind: "module", controller})
  showModuleTerminalPrompt(controller)
  for (const ch of data) {
    if (ch === "\r") {
      submitModuleTerminalExpression(controller)
      continue
    }
    if (ch === "\n") {
      appendModuleTerminalInputText(controller, "\n")
      continue
    }
    if (ch === "\x03") {
      controller.terminal.write("^C\r\n")
      controller.terminalInput.buffer = ""
      controller.terminalInput.promptVisible = false
      showModuleTerminalPrompt(controller)
      queuePublishModuleContext(controller)
      continue
    }
    if (ch === "\x7f" || ch === "\b") {
      if (controller.terminalInput.buffer.length === 0) continue
      controller.terminalInput.buffer = controller.terminalInput.buffer.slice(0, -1)
      controller.terminal.write("\b \b")
      queuePublishModuleContext(controller)
      continue
    }
    if (ch === "\t") {
      appendModuleTerminalInputText(controller, "  ")
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    appendModuleTerminalInputText(controller, ch)
  }
}

function appendModuleTerminalInputText(controller: ModuleDisplayController, text: string): void {
  controller.terminalInput.buffer += text
  controller.terminal.write(moduleTerminalInputDisplayText(text))
  queuePublishModuleContext(controller)
}

function moduleTerminalInputDisplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")
}

function submitModuleTerminalExpression(controller: ModuleDisplayController): void {
  const expr = controller.terminalInput.buffer.trim()
  controller.terminalInput.buffer = ""
  controller.terminal.write("\r\n")
  controller.terminalInput.promptVisible = false
  queuePublishModuleContext(controller)
  if (expr.length === 0) {
    showModuleTerminalPrompt(controller)
    return
  }
  void runModuleTerminalExpression(controller, expr)
}

async function runModuleTerminalExpression(controller: ModuleDisplayController, expr: string): Promise<void> {
  if (!canAcceptTerminalInput(controller)) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: t("expressionUnavailable"),
    })
    syncModuleTerminalInput(controller)
    return
  }
  controller.terminal.setInputEnabled(false)
  const frame = controller.dump?.frames[controller.activeFrameIndex]
  const response = await runModuleInterpreterCommand(controller, "eval", {
    frame: frame?.index ?? controller.activeFrameIndex,
    expr,
  }, t("runExpression"))
  if (response.ok) {
    const resultText = await formatTerminalExpressionResult(response.result, async (objectId) => {
      const props = await runModuleInterpreterCommand(controller, "props", {
        objectId,
        ownProperties: true,
      }, t("runExpression"))
      if (!props.ok) throw new Error(props.error ?? "props failed")
      return props.result
    })
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "info",
      text: `${ansiGreen("=>")} ${resultText}`,
    })
  }
  syncModuleTerminalInput(controller)
}

function formatTimestamp(ts: string): string {
  const tIndex = ts.indexOf("T")
  if (tIndex < 0) return ts
  const dot = ts.indexOf(".", tIndex)
  return ts.slice(tIndex + 1, dot < 0 ? undefined : dot)
}

function ansiLevel(level: ModuleTerminalEntry["level"]): string {
  if (level === "error") return ansiError("err")
  if (level === "warn") return ansiWarn("warn")
  if (level === "agent") return ansiCyan("ai")
  return ansiCyan("ui")
}

function ansiMuted(value: string): string {
  return `\x1b[90m${value}\x1b[0m`
}

function ansiCyan(value: string): string {
  return `\x1b[36m${value}\x1b[0m`
}

function ansiError(value: string): string {
  return `\x1b[31m${value}\x1b[0m`
}

function ansiWarn(value: string): string {
  return `\x1b[33m${value}\x1b[0m`
}

function ansiGreen(value: string): string {
  return `\x1b[32m${value}\x1b[0m`
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "")
}

function terminalTextTail(terminal: TerminalPane, limit: number): string[] {
  return terminal.toText()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(-Math.max(0, limit))
}

async function refreshModuleBreakpoints(controller: ModuleDisplayController): Promise<void> {
  try {
    const res = await fetch(processApiPath(controller.id, "/breakpoints"))
    const data = await res.json() as unknown
    if (!Array.isArray(data)) return
    controller.breakpointRegistrations = data.filter(isBreakpointRegistration)
    mergeStoredBreakpointSpecs(controller.breakpointRegistrations.map((registration) => registration.spec))
    syncModuleBreakpointMarkers(controller)
    await syncStoredModuleBreakpoints(controller)
  } catch (error) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] breakpoints refresh failed: ${String(error)}`,
    })
  }
}

async function syncStoredModuleBreakpoints(controller: ModuleDisplayController): Promise<void> {
  await removeForeignModuleBreakpoints(controller)
  const registeredKeys = new Set(controller.breakpointRegistrations.map((registration) => breakpointSpecKey(registration.spec)))
  const missing = readStoredBreakpointSpecs().filter((spec) => (
    storedBreakpointSpecMatchesModule(spec, controller)
    && !registeredKeys.has(breakpointSpecKey(spec))
  ))
  if (missing.length === 0) return

  const errors: string[] = []
  for (const spec of missing) {
    try {
      const res = await fetch(processApiPath(controller.id, "/breakpoint"), {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(spec),
      })
      const data = await res.json() as {ok?: boolean; error?: string; breakpoints?: unknown}
      if (!res.ok || data.ok !== true) {
        errors.push(data.error ?? res.statusText)
        continue
      }
      if (Array.isArray(data.breakpoints)) controller.breakpointRegistrations = data.breakpoints.filter(isBreakpointRegistration)
    } catch (error) {
      errors.push(String(error))
    }
  }

  if (errors.length > 0) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] breakpoints sync failed: ${errors[0]}`,
    })
  }
  syncModuleBreakpointMarkers(controller)
}

async function removeForeignModuleBreakpoints(controller: ModuleDisplayController): Promise<void> {
  const foreign = controller.breakpointRegistrations.filter((registration) => !storedBreakpointSpecMatchesModule(registration.spec, controller))
  for (const registration of foreign) {
    try {
      const res = await fetch(processApiPath(controller.id, "/breakpoint"), {
        method: "DELETE",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({id: registration.id}),
      })
      const data = await res.json() as {ok?: boolean; breakpoints?: unknown}
      if (res.ok && data.ok === true && Array.isArray(data.breakpoints)) {
        controller.breakpointRegistrations = data.breakpoints.filter(isBreakpointRegistration)
      }
    } catch {}
  }
}

function storedBreakpointSpecMatchesModule(spec: BreakpointSpec, controller: ModuleDisplayController): boolean {
  if (spec.urlRegex !== undefined) return true
  const snapshot = moduleSnapshots.get(controller.id)
  const modulePath = snapshot?.modulePath ?? controller.workspaceFiles.modulePath ?? inferredBreakpointModulePath(controller, snapshot)
  if (modulePath === null || modulePath.trim().length === 0) return true

  const moduleParts = breakpointPathParts(modulePath)
  if (moduleParts.length < 2) return true
  const moduleDirParts = moduleParts.slice(0, -1)
  const moduleLeafDirParts = moduleDirParts.slice(-1)
  const candidates = [spec.url, spec.sourceUrl].filter((value): value is string => value !== undefined && value.trim().length > 0)
  if (candidates.length === 0) return true

  return candidates.some((candidate) => {
    const candidateParts = breakpointPathParts(candidate)
    return pathStartsWith(candidateParts, moduleDirParts)
      || pathStartsWith(candidateParts, moduleLeafDirParts)
      || samePathParts(candidateParts, moduleParts)
  })
}

function inferredBreakpointModulePath(controller: ModuleDisplayController, snapshot: ModulePaneSnapshot | undefined): string | null {
  for (const candidate of [snapshot?.label, controller.id]) {
    if (candidate === undefined) continue
    const normalized = candidate.trim().replaceAll("\\", "/")
    if (normalized.includes("/")) return normalized
    const dash = normalized.indexOf("-")
    if (dash > 0 && normalized.endsWith(".ts")) return `${normalized.slice(0, dash)}/${normalized.slice(dash + 1)}`
  }
  return null
}

function breakpointPathParts(value: string): string[] {
  const normalized = normalizeSourceFilePath(value).replace(/^r\//, "")
  return normalized.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..")
}

function pathStartsWith(parts: readonly string[], prefix: readonly string[]): boolean {
  if (prefix.length === 0 || parts.length < prefix.length) return false
  return prefix.every((part, index) => parts[index] === part)
}

function samePathParts(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((part, index) => b[index] === part)
}

async function toggleModuleBreakpoint(controller: ModuleDisplayController, line: number): Promise<void> {
  const source = controller.sourceIdentity
  if (source === null) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: getUiLocale() === "ru" ? "[ui] breakpoint не поставлен: source не загружен" : "[ui] breakpoint skipped: no source loaded",
    })
    return
  }

  const sourceLine = Math.max(1, Math.floor(line))
  const existing = moduleBreakpointRegistrationForLine(controller, source, sourceLine)
  const stored = existing === undefined ? storedBreakpointSpecForLine(source, sourceLine) : undefined
  controller.pendingBreakpointLines.add(sourceLine)
  syncModuleBreakpointMarkers(controller)

  if (stored !== undefined) {
    removeStoredBreakpointSpec(stored)
    controller.pendingBreakpointLines.delete(sourceLine)
    syncModuleBreakpointMarkers(controller)
    return
  }

  const nextSpec = existing === undefined ? breakpointSpecForSource(source, sourceLine) : null
  if (existing === undefined && nextSpec === null) {
    controller.pendingBreakpointLines.delete(sourceLine)
    syncModuleBreakpointMarkers(controller)
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: getUiLocale() === "ru" ? "[ui] breakpoint не поставлен: у source нет URL" : "[ui] breakpoint skipped: source has no URL",
    })
    return
  }

  try {
    const body = existing === undefined ? nextSpec : {id: existing.id}
    const res = await fetch(processApiPath(controller.id, "/breakpoint"), {
      method: existing === undefined ? "POST" : "DELETE",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    })
    const data = await res.json() as {ok?: boolean; error?: string; breakpoints?: unknown}
    if (data.ok !== true) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] breakpoint: ${data.error ?? "unknown error"}`,
      })
      return
    }
    if (Array.isArray(data.breakpoints)) {
      controller.breakpointRegistrations = data.breakpoints.filter(isBreakpointRegistration)
    } else {
      await refreshModuleBreakpoints(controller)
    }
    if (nextSpec !== null) mergeStoredBreakpointSpecs([nextSpec])
    if (existing !== undefined) removeStoredBreakpointSpec(existing.spec)
  } catch (error) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "error",
      text: `[ui] breakpoint: ${String(error)}`,
    })
  } finally {
    controller.pendingBreakpointLines.delete(sourceLine)
    syncModuleBreakpointMarkers(controller)
  }
}

function syncModuleBreakpointMarkers(controller: ModuleDisplayController): void {
  const source = controller.sourceIdentity
  if (source === null) {
    controller.source.setBreakpoints([])
    return
  }

  const hitBreakpointIds = new Set(controller.dump?.hitBreakpoints ?? [])
  const byLine = new Map<number, EditorBreakpoint>()
  for (const registration of controller.breakpointRegistrations) {
    if (!breakpointRegistrationMatchesSource(registration, source)) continue
    const verified = registration.installed.some((installed) => (
      (source.scriptId.length > 0 && installed.scriptId === source.scriptId)
      || sameSourceUrl(installed.url, source.scriptUrl)
      || sameSourceUrl(installed.url, source.sourceUrl)
      || sameSourceUrl(installed.url, source.key)
    ))
    const hit = registration.installed.some((installed) => hitBreakpointIds.has(installed.breakpointId))
    byLine.set(registration.spec.line, {
      line: registration.spec.line,
      verified,
      pending: !verified,
      hit,
    })
  }

  for (const spec of readStoredBreakpointSpecs()) {
    if (!breakpointSpecMatchesSource(spec, source) || byLine.has(spec.line)) continue
    byLine.set(spec.line, {line: spec.line, verified: false, pending: true, hit: false})
  }

  for (const line of controller.pendingBreakpointLines) {
    const current = byLine.get(line)
    byLine.set(line, {
      line,
      verified: current?.verified ?? false,
      pending: true,
      hit: current?.hit ?? false,
    })
  }

  controller.source.setBreakpoints([...byLine.values()].sort((a, b) => a.line - b.line))
}

function moduleBreakpointRegistrationForLine(controller: ModuleDisplayController, source: BreakpointSourceIdentity, line: number): BreakpointRegistration | undefined {
  return controller.breakpointRegistrations.find((registration) => (
    registration.spec.line === line && breakpointRegistrationMatchesSource(registration, source)
  ))
}

function storedBreakpointSpecForLine(source: BreakpointSourceIdentity, line: number): BreakpointSpec | undefined {
  return readStoredBreakpointSpecs().find((spec) => (
    spec.line === line && breakpointSpecMatchesSource(spec, source)
  ))
}

function breakpointSpecForSource(source: BreakpointSourceIdentity, line: number): BreakpointSpec | null {
  const url = firstNonEmpty(source.scriptUrl, source.sourceUrl, source.key)
  if (url === null) return null
  const spec: BreakpointSpec = {url, line}
  if (source.sourceUrl.trim().length > 0 && !sameSourceUrl(source.sourceUrl, url)) {
    spec.sourceUrl = source.sourceUrl
  }
  return spec
}

function firstNonEmpty(...values: string[]): string | null {
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function isBreakpointRegistration(value: unknown): value is BreakpointRegistration {
  if (typeof value !== "object" || value === null) return false
  const object = value as Record<string, unknown>
  const spec = object["spec"] as Record<string, unknown> | undefined
  return typeof object["id"] === "string"
    && typeof spec === "object"
    && spec !== null
    && typeof spec["line"] === "number"
    && Array.isArray(object["installed"])
}

function readStoredBreakpointSpecs(): BreakpointSpec[] {
  const raw = localStorage.getItem(BREAKPOINTS_STORAGE_KEY)
  if (raw === null) return []
  try {
    return dedupeBreakpointSpecs(parseStoredBreakpointSpecs(JSON.parse(raw)))
  } catch {
    return []
  }
}

function mergeStoredBreakpointSpecs(specs: BreakpointSpec[]): void {
  const next = dedupeBreakpointSpecs([...readStoredBreakpointSpecs(), ...specs])
  writeStoredBreakpointSpecs(next)
}

function removeStoredBreakpointSpec(spec: BreakpointSpec): void {
  const targetKey = breakpointSpecKey(spec)
  const next = readStoredBreakpointSpecs().filter((current) => breakpointSpecKey(current) !== targetKey)
  writeStoredBreakpointSpecs(next)
}

function writeStoredBreakpointSpecs(specs: BreakpointSpec[]): void {
  const next = dedupeBreakpointSpecs(specs)
  if (next.length === 0) {
    localStorage.removeItem(BREAKPOINTS_STORAGE_KEY)
    return
  }
  localStorage.setItem(BREAKPOINTS_STORAGE_KEY, JSON.stringify(next))
}

function parseStoredBreakpointSpecs(value: unknown): BreakpointSpec[] {
  if (!Array.isArray(value)) return []
  const out: BreakpointSpec[] = []
  for (const item of value) {
    const spec = normalizeBreakpointSpec(item)
    if (spec !== null) out.push(spec)
  }
  return out
}

function normalizeBreakpointSpec(value: unknown): BreakpointSpec | null {
  if (typeof value !== "object" || value === null) return null
  const object = value as Record<string, unknown>
  const line = object["line"]
  if (typeof line !== "number" || !Number.isInteger(line) || line <= 0) return null

  const url = typeof object["url"] === "string" ? object["url"].trim() : ""
  const sourceUrl = typeof object["sourceUrl"] === "string" ? object["sourceUrl"].trim() : ""
  const urlRegex = typeof object["urlRegex"] === "string" ? object["urlRegex"].trim() : ""
  if (url.length === 0 && sourceUrl.length === 0 && urlRegex.length === 0) return null

  const spec: BreakpointSpec = {line}
  if (url.length > 0) spec.url = url
  if (sourceUrl.length > 0) spec.sourceUrl = sourceUrl
  if (urlRegex.length > 0) spec.urlRegex = urlRegex

  const column = object["column"]
  if (typeof column === "number" && Number.isInteger(column) && column >= 0) spec.column = column

  const condition = typeof object["condition"] === "string" ? object["condition"].trim() : ""
  if (condition.length > 0) spec.condition = condition

  return spec
}

function dedupeBreakpointSpecs(specs: BreakpointSpec[]): BreakpointSpec[] {
  const byKey = new Map<string, BreakpointSpec>()
  for (const spec of specs) {
    const normalized = normalizeBreakpointSpec(spec)
    if (normalized === null) continue
    byKey.set(breakpointSpecKey(normalized), normalized)
  }
  return [...byKey.values()].sort((a, b) => {
    const urlA = a.sourceUrl ?? a.url ?? a.urlRegex ?? ""
    const urlB = b.sourceUrl ?? b.url ?? b.urlRegex ?? ""
    if (urlA !== urlB) return urlA.localeCompare(urlB)
    if (a.line !== b.line) return a.line - b.line
    return (a.column ?? 0) - (b.column ?? 0)
  })
}

function breakpointSpecKey(spec: BreakpointSpec): string {
  return [
    spec.url ?? "",
    spec.sourceUrl ?? "",
    spec.urlRegex ?? "",
    String(spec.line),
    String(spec.column ?? 0),
    spec.condition ?? "",
  ].join("\0")
}

const PAD = 6
const GAP = 8
const BODY_TOP = PAD
const WORKSPACE_FILES_HEADER_H = 36

type InterpreterRects = {
  filesChrome: UiSurfaceRect
  filesHeader: UiSurfaceRect
  files: UiSurfaceRect
  scopes: UiSurfaceRect
  source: UiSurfaceRect
  terminal: UiSurfaceRect
  frames: UiSurfaceRect
  verbose: UiSurfaceRect | null
}

type SqliteRects = {
  tables: UiSurfaceRect
  rows: UiSurfaceRect
}

function hiddenRect(): UiSurfaceRect {
  return {x: -10000, y: -10000, w: 1, h: 1, visible: false}
}

function hostTerminalHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (hostTerminalHudDocked) return hiddenRect()
  if (w < HOST_TERMINAL_HUD_MIN_W || h < HOST_TERMINAL_HUD_MIN_H) return hiddenRect()
  if (hostTerminalHudRectPreview !== null) return clampHostTerminalHudRect(hostTerminalHudRectPreview, w, h)
  const stored = readStoredHostTerminalHudRect()
  if (stored !== null) return clampHostTerminalHudRect(stored, w, h)
  return clampHostTerminalHudRect(DEFAULT_HOST_TERMINAL_HUD_RECT, w, h)
}

function todoHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (todoHudDocked) return hiddenRect()
  if (w < TODO_HUD_MIN_W || h < TODO_HUD_MIN_H) return hiddenRect()
  if (todoHudRectPreview !== null) return clampTodoHudRect(todoHudRectPreview, w, h)
  const stored = readStoredTodoHudRect()
  if (stored !== null) return clampTodoHudRect(stored, w, h)
  return clampTodoHudRect(DEFAULT_TODO_HUD_RECT, w, h)
}

function hostTerminalAgentSignalRect(bounds: {w: number; h: number}): UiSurfaceRect {
  const terminal = hostTerminalHudRect(bounds)
  if (terminal.visible === false) return hiddenRect()
  const open = hostTerminalAgentSignalPane?.isOpen() === true
  const buttonX = hostTerminalAgentSignalButtonX(terminal)
  const buttonY = terminal.y + HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y
  if (!open) {
    return {
      x: buttonX,
      y: buttonY,
      w: HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE,
      h: HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE,
    }
  }

  const panelW = Math.min(HOST_TERMINAL_AGENT_SIGNAL_PANEL_W, Math.max(1, terminal.w - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X * 2))
  const panelH = Math.min(
    HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE + 6 + HOST_TERMINAL_AGENT_SIGNAL_PANEL_H,
    Math.max(1, terminal.h - HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y - 6),
  )
  const x = clampNumber(
    buttonX - (panelW - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE),
    terminal.x + HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X,
    Math.max(terminal.x + HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X, terminal.x + terminal.w - panelW - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X),
  )
  return {
    x,
    y: buttonY,
    w: panelW,
    h: panelH,
  }
}

function hostTerminalAgentSignalButtonX(terminal: UiSurfaceRect): number {
  const statusW = Math.min(
    HOST_TERMINAL_AGENT_SIGNAL_STATUS_MAX_W,
    Math.max(HOST_TERMINAL_AGENT_SIGNAL_STATUS_MIN_W, Math.ceil(hostTerminalStatusLabelForLayout.length * 7) + 32),
  )
  const dockButtonX = terminal.x
    + terminal.w
    - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X
    - statusW
    - HOST_TERMINAL_AGENT_SIGNAL_HEADER_GAP
    - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE
  return clampNumber(
    dockButtonX - HOST_TERMINAL_AGENT_SIGNAL_HEADER_GAP - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE,
    terminal.x + HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X,
    terminal.x + terminal.w - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE,
  )
}

function voiceHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  const stored = readStoredVoiceHudPlacement()
  if (stored !== null) {
    if (isVoiceHudAnchorPlacement(stored)) return voiceHudRectFromAnchor(stored, w, h)
    const placement = voiceHudAnchorFromRect(stored, w, h)
    writeStoredVoiceHudAnchor(placement)
    return voiceHudRectFromAnchor(placement, w, h)
  }
  return voiceHudRectFromAnchor(voiceHudAnchorFromRect(DEFAULT_VOICE_HUD_RECT, w, h), w, h)
}

function clampVoiceHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const frame = voiceHudFrameForBounds(boundsW, boundsH)
  return {
    x: clampNumber(rect.x, frame.margin, Math.max(frame.margin, frame.bw - frame.margin - frame.rectW)),
    y: clampNumber(rect.y, frame.margin, Math.max(frame.margin, frame.bh - frame.margin - frame.rectH)),
    w: frame.rectW,
    h: frame.rectH,
  }
}

function voiceHudFrameForBounds(boundsW: number, boundsH: number): {bw: number; bh: number; margin: number; rectW: number; rectH: number} {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const margin = bw >= 32 && bh >= 32 ? 8 : 0
  const rectW = Math.min(VOICE_HUD_W, Math.max(1, bw - margin * 2))
  const rectH = Math.min(VOICE_HUD_H, Math.max(1, bh - margin * 2))
  return {bw, bh, margin, rectW, rectH}
}

function voiceHudRectFromAnchor(anchor: VoiceHudAnchorPlacement, boundsW: number, boundsH: number): UiSurfaceRect {
  const frame = voiceHudFrameForBounds(boundsW, boundsH)
  const x = anchor.horizontal === "left"
    ? frame.margin + anchor.offsetX
    : frame.bw - frame.margin - frame.rectW - anchor.offsetX
  const y = anchor.vertical === "top"
    ? frame.margin + anchor.offsetY
    : frame.bh - frame.margin - frame.rectH - anchor.offsetY
  return clampVoiceHudRect({x, y, w: frame.rectW, h: frame.rectH}, boundsW, boundsH)
}

function voiceHudAnchorFromRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): VoiceHudAnchorPlacement {
  const frame = voiceHudFrameForBounds(boundsW, boundsH)
  const clamped = clampVoiceHudRect(rect, boundsW, boundsH)
  const leftOffset = Math.max(0, clamped.x - frame.margin)
  const rightOffset = Math.max(0, frame.bw - frame.margin - clamped.x - clamped.w)
  const topOffset = Math.max(0, clamped.y - frame.margin)
  const bottomOffset = Math.max(0, frame.bh - frame.margin - clamped.y - clamped.h)
  return {
    horizontal: leftOffset <= rightOffset ? "left" : "right",
    vertical: topOffset <= bottomOffset ? "top" : "bottom",
    offsetX: Math.round(Math.min(leftOffset, rightOffset)),
    offsetY: Math.round(Math.min(topOffset, bottomOffset)),
  }
}

function isVoiceHudAnchorPlacement(value: VoiceHudAnchorPlacement | UiSurfaceRect): value is VoiceHudAnchorPlacement {
  return "horizontal" in value && "vertical" in value
}

function hostTerminalDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!hostTerminalHudDocked || w < 80 || h < 80) return hiddenRect()
  return hostTerminalDockRectForPlacement(hostTerminalDockPlacement ?? defaultHostTerminalDockPlacement({w, h}), {w, h})
}

function todoDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!todoHudDocked || w < 80 || h < 80) return hiddenRect()
  return todoDockRectForPlacement(todoDockPlacement ?? defaultTodoDockPlacement({w, h}), {w, h})
}

function hostTerminalDockRectForPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(HOST_TERMINAL_DOCK_SHORT, Math.max(1, bounds.w - HOST_TERMINAL_DOCK_MARGIN))
    : Math.min(HOST_TERMINAL_DOCK_LONG, Math.max(1, bounds.w - HOST_TERMINAL_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(HOST_TERMINAL_DOCK_LONG, Math.max(1, bounds.h - HOST_TERMINAL_DOCK_MARGIN * 2))
    : Math.min(HOST_TERMINAL_DOCK_SHORT, Math.max(1, bounds.h - HOST_TERMINAL_DOCK_MARGIN))
  if (vertical) {
    const centerY = clampNumber(
      placement.offset,
      HOST_TERMINAL_DOCK_MARGIN + dockH / 2,
      Math.max(HOST_TERMINAL_DOCK_MARGIN + dockH / 2, bounds.h - HOST_TERMINAL_DOCK_MARGIN - dockH / 2),
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
    HOST_TERMINAL_DOCK_MARGIN + dockW / 2,
    Math.max(HOST_TERMINAL_DOCK_MARGIN + dockW / 2, bounds.w - HOST_TERMINAL_DOCK_MARGIN - dockW / 2),
  )
  return {
    x: centerX - dockW / 2,
    y: placement.edge === "top" ? 0 : Math.max(0, bounds.h - dockH),
    w: dockW,
    h: dockH,
  }
}

function todoDockRectForPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(TODO_DOCK_SHORT, Math.max(1, bounds.w - TODO_DOCK_MARGIN))
    : Math.min(TODO_DOCK_LONG, Math.max(1, bounds.w - TODO_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(TODO_DOCK_LONG, Math.max(1, bounds.h - TODO_DOCK_MARGIN * 2))
    : Math.min(TODO_DOCK_SHORT, Math.max(1, bounds.h - TODO_DOCK_MARGIN))
  if (vertical) {
    const centerY = clampNumber(
      placement.offset,
      TODO_DOCK_MARGIN + dockH / 2,
      Math.max(TODO_DOCK_MARGIN + dockH / 2, bounds.h - TODO_DOCK_MARGIN - dockH / 2),
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
    TODO_DOCK_MARGIN + dockW / 2,
    Math.max(TODO_DOCK_MARGIN + dockW / 2, bounds.w - TODO_DOCK_MARGIN - dockW / 2),
  )
  return {
    x: centerX - dockW / 2,
    y: placement.edge === "top" ? 0 : Math.max(0, bounds.h - dockH),
    w: dockW,
    h: dockH,
  }
}

function defaultHostTerminalDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const placement = DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(HOST_TERMINAL_DOCK_SHORT, Math.max(1, bounds.w - HOST_TERMINAL_DOCK_MARGIN))
    : Math.min(HOST_TERMINAL_DOCK_LONG, Math.max(1, bounds.w - HOST_TERMINAL_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(HOST_TERMINAL_DOCK_LONG, Math.max(1, bounds.h - HOST_TERMINAL_DOCK_MARGIN * 2))
    : Math.min(HOST_TERMINAL_DOCK_SHORT, Math.max(1, bounds.h - HOST_TERMINAL_DOCK_MARGIN))
  const minOffset = vertical
    ? HOST_TERMINAL_DOCK_MARGIN + dockH / 2
    : HOST_TERMINAL_DOCK_MARGIN + dockW / 2
  const maxOffset = vertical
    ? Math.max(minOffset, bounds.h - HOST_TERMINAL_DOCK_MARGIN - dockH / 2)
    : Math.max(minOffset, bounds.w - HOST_TERMINAL_DOCK_MARGIN - dockW / 2)
  return {
    edge: placement.edge,
    offset: clampNumber(
      placement.offset,
      minOffset,
      maxOffset,
    ),
  }
}

function defaultTodoDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const placement = DEFAULT_TODO_DOCK_PLACEMENT
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(TODO_DOCK_SHORT, Math.max(1, bounds.w - TODO_DOCK_MARGIN))
    : Math.min(TODO_DOCK_LONG, Math.max(1, bounds.w - TODO_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(TODO_DOCK_LONG, Math.max(1, bounds.h - TODO_DOCK_MARGIN * 2))
    : Math.min(TODO_DOCK_SHORT, Math.max(1, bounds.h - TODO_DOCK_MARGIN))
  const minOffset = vertical
    ? TODO_DOCK_MARGIN + dockH / 2
    : TODO_DOCK_MARGIN + dockW / 2
  const maxOffset = vertical
    ? Math.max(minOffset, bounds.h - TODO_DOCK_MARGIN - dockH / 2)
    : Math.max(minOffset, bounds.w - TODO_DOCK_MARGIN - dockW / 2)
  return {
    edge: placement.edge,
    offset: clampNumber(placement.offset, minOffset, maxOffset),
  }
}

function hostTerminalDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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
  const rect = hostTerminalDockRectForPlacement({
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
  }, bounds)
  return {
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
  }
}

function todoDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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
  const rect = todoDockRectForPlacement({
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
  }, bounds)
  return {
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
  }
}

function clampHostTerminalHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const minW = Math.min(HOST_TERMINAL_HUD_PANEL_MIN_W, bw)
  const minH = Math.min(HOST_TERMINAL_HUD_PANEL_MIN_H, bh)
  const rectW = clampNumber(rect.w, minW, bw)
  const rectH = clampNumber(rect.h, minH, bh)
  return {
    x: clampNumber(rect.x, 0, Math.max(0, bw - rectW)),
    y: clampNumber(rect.y, 0, Math.max(0, bh - rectH)),
    w: rectW,
    h: rectH,
  }
}

function clampTodoHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const minW = Math.min(TODO_HUD_MIN_W, bw)
  const minH = Math.min(TODO_HUD_MIN_H, bh)
  const rectW = clampNumber(rect.w, minW, bw)
  const rectH = clampNumber(rect.h, minH, bh)
  return {
    x: clampNumber(rect.x, 0, Math.max(0, bw - rectW)),
    y: clampNumber(rect.y, 0, Math.max(0, bh - rectH)),
    w: rectW,
    h: rectH,
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sqliteRects({w, h}: {w: number; h: number}): SqliteRects {
  const x = PAD
  const y = BODY_TOP
  const bodyW = Math.max(1, w - PAD * 2)
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const tablesW = w >= 980
    ? Math.min(330, Math.max(250, Math.floor(bodyW * 0.22)))
    : Math.min(260, Math.max(190, Math.floor(bodyW * 0.30)))
  return {
    tables: {x, y, w: tablesW, h: bodyH},
    rows: {x: x + tablesW + GAP, y, w: Math.max(1, bodyW - tablesW - GAP), h: bodyH},
  }
}

function interpreterRects({w, h}: {w: number; h: number}, verboseVisible: boolean): InterpreterRects {
  const x = PAD
  const y = BODY_TOP
  const bodyW = Math.max(1, w - PAD * 2)
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const terminalH = Math.min(260, Math.max(188, Math.floor(bodyH * 0.24)))
  const workspaceH = Math.max(1, bodyH - terminalH - GAP)
  const bottomY = y + workspaceH + GAP
  const showRight = w >= 1180
  const showVerbose = verboseVisible && w >= 1180
  const leftW = w >= 980
    ? Math.min(292, Math.max(238, Math.floor(bodyW * 0.16)))
    : Math.max(220, Math.floor(bodyW * 0.28))
  const rightW = showRight
    ? Math.min(390, Math.max(320, Math.floor(bodyW * 0.22)))
    : 0
  const sourceX = x + leftW + GAP
  const sourceW = Math.max(1, bodyW - leftW - GAP - (showRight ? rightW + GAP : 0))
  const verboseW = showVerbose ? Math.min(520, Math.max(380, Math.floor(bodyW * 0.34))) : 0
  const terminalX = sourceX
  const terminalW = Math.max(1, bodyW - leftW - GAP - (showVerbose ? verboseW + GAP : 0))
  const verboseX = terminalX + terminalW + GAP

  if (!showRight) {
    const filesH = Math.min(320, Math.max(168, Math.floor(workspaceH * 0.42)))
    const filesHeaderH = Math.min(WORKSPACE_FILES_HEADER_H, Math.max(1, filesH))
    return {
      filesChrome: {x, y, w: leftW, h: filesH},
      filesHeader: {x, y, w: leftW, h: filesHeaderH},
      files: {x, y: y + filesHeaderH, w: leftW, h: Math.max(1, filesH - filesHeaderH)},
      scopes: {x, y: y + filesH + GAP, w: leftW, h: Math.max(1, workspaceH - filesH - GAP)},
      source: {x: sourceX, y, w: sourceW, h: workspaceH},
      terminal: {x: terminalX, y: bottomY, w: terminalW, h: terminalH},
      frames: {x, y: bottomY, w: leftW, h: terminalH},
      verbose: null,
    }
  }

  return {
    filesChrome: {x, y, w: leftW, h: workspaceH},
    filesHeader: {x, y, w: leftW, h: WORKSPACE_FILES_HEADER_H},
    files: {x, y: y + WORKSPACE_FILES_HEADER_H, w: leftW, h: Math.max(1, workspaceH - WORKSPACE_FILES_HEADER_H)},
    scopes: {x: w - PAD - rightW, y, w: rightW, h: workspaceH},
    source: {x: sourceX, y, w: sourceW, h: workspaceH},
    terminal: {x: terminalX, y: bottomY, w: terminalW, h: terminalH},
    frames: {x, y: bottomY, w: leftW, h: terminalH},
    verbose: showVerbose
      ? {x: verboseX, y: bottomY, w: verboseW, h: terminalH}
      : null,
  }
}

function sourceLocation(sourceUrl: string, scriptId: string, line: number): string {
  const base = sourceUrl || `scriptId=${scriptId}`
  return line > 0 ? `${base}:${line}` : base
}
