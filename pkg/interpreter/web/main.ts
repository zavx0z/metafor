/**
 * Interpreter UI.
 *
 * One interpreter owns one HUD and one WebGPU Space. UIDisplays are visual
 * placements; public runtime/source API is scoped to processes.
 */

import {Color, TextureLoader} from "@metafor/engine"
import {
  UiRuntime,
  UiSurface,
  palette,
  radii,
  uiIcons,
  Z,
  type UiRuntimeDisplayCenterChange,
  type UiRuntimeDisplaySnapshot,
  type UiRuntimeViewPointSnapshot,
  type UiRuntimeViewPointVector,
  type UiSurfaceRect,
} from "@ui/elements"
import {Button, ButtonVoice, IconButton, Switcher, Table, TextField, VoiceInputHud, focusTextField, normalizeTableSelection, tableScrollTo, tableSelectionAfterClick, type ButtonVoiceSnapshot, type TableCellContext, type TableColumn, type TableRowId, type TableRowPointerContext, type TextFieldEditState, type VoiceInputHudDeactivationMode, type VoiceInputHudPhraseGroupId, type VoiceInputHudServiceState} from "@ui/components"
import {HudSideTab, type HudSideTabEdge} from "@ui/hud"
import {
  EditorPane,
  FileListPane,
  AndroidPane,
  NetworkWatchPane,
  TerminalPane,
  ToDoPane,
  PANE_FRAME,
  beginPaneFrameDrag,
  networkWatchSectionsFromLines,
  normalizeFileListSelection,
  paneHeaderRuleRect,
  paneFrameCursor,
  paneFrameDragRect,
  paneFrameHit,
  sourceDisplayLocation,
  sourcePathFromLocation,
  codexComposerMessage,
  codexImageDropFiles,
  formatCodexAttachmentSize,
  mergeCodexComposerDraft,
  pickCodexImageFiles,
  uploadCodexAttachments,
  type EditorBreakpoint,
  type EditorSelectionSnapshot,
  type EditorTokens,
  type FileListItem,
  type CodexComposerAttachment,
  type AndroidPaneStatusKind,
  type AndroidPaneSwipe,
  type NetworkWatchPaneSnapshot,
  type NetworkWatchServiceKey,
  type PaneFrameDrag,
  type PaneFrameInteractionOpts,
  type TerminalInputSource,
  type TerminalSelectionSnapshot,
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
import {
  mergeProcessBreakpointSpecs,
  readProcessBreakpointSpecs,
  removeProcessBreakpointSpec,
  storedBreakpointSpecKey,
  writeProcessBreakpointSpecs,
  type StoredBreakpointSpec,
} from "./breakpoint-storage.ts"
import {
  normalizeWorkspaceExpandedIds,
  normalizeWorkspacePath,
  shouldRevealWorkspaceForSourceOpen,
  stripSourceLine,
  workspaceDirectoryIds,
  workspaceFileIdForSourcePath,
  workspaceFileIds,
  workspaceFileIdForSources,
  workspaceFileRevealState,
  workspaceFileSourceUrl as workspaceFileItemSourceUrl,
  workspaceFilesContextSnapshot,
  workspaceFileTree,
  workspaceParentIds,
  workspaceRootLabel,
  type WorkspaceFilesContextSnapshot,
} from "./workspace-files.ts"
import {formatTerminalExpressionResult} from "./terminal-value-format.ts"
import {createAndroidRtcClient, type AndroidRtcAudioStream, type AndroidRtcClient, type AndroidRtcCommand, type AndroidRtcFrame, type RtcControlCommand} from "./android-rtc.ts"
import {RTC_ICE_SERVERS} from "./p2p-signaling.ts"
import {
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  DEFAULT_VOICE_STOP_PHRASES,
  VoiceInputClient,
  VOICE_STOP_COMMAND_DETAIL,
  cleanupVoiceText,
  normalizeVoicePhrases,
  voiceInputWebSocketUrl,
  type VoiceDeactivationMode,
  type VoiceInputChunk,
  type VoiceInputSegment,
  type VoiceInputSignalTone,
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
  | {type: "breakpoints-changed"; moduleId: string; reason: "set" | "remove"; breakpoint?: BreakpointRegistration; removed?: BreakpointRegistration | {breakpointId: string}; breakpoints: BreakpointRegistration[]}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}
  | {type: "ui-host-command"; requestId: number; command: string; params?: unknown}
  | {type: "hud-todo-changed"; todo?: TodoMarkdownPayload}
  | {type: "sqlite-changed"; path: string; label?: string; version?: string | null; available?: boolean; error?: string}
  | {type: "reload"; delayMs?: number}

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
  breakpointsActive: boolean
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

type BreakpointSpec = StoredBreakpointSpec

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
  selections: SourceSelectionContext[]
}
type TerminalSelectionContext = TerminalSelectionSnapshot
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
    selections: SourceSelectionContext[]
  }
  activeFrameIndex: number | null
  currentFrame: Pick<FrameSnapshot, "index" | "function" | "url" | "line" | "column" | "sourceKind" | "scriptId"> | null
  scopes: ScopeContextSnapshot
  workspaceFiles: WorkspaceFilesContextSnapshot
  terminal: {
    focused: boolean
    pendingInput: string
    promptVisible: boolean
    selection: TerminalSelectionContext | null
  }
  hud: {
    todo: ToDoPaneContextSnapshot | null
    sqlite: SqliteHudContextSnapshot | null
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
  openedFileIds: string[]
}

type WorkspaceFilesState = {
  root: string | null
  workspacePath: string
  modulePath: string | null
  rootLabel: string | null
  catalogPaths: readonly string[]
  items: readonly FileListItem[]
  expandedIds: readonly string[]
  selectedIds: readonly string[]
  openedFileIds: readonly string[]
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
  version: string
  selectedTable: string | null
  limit: number
  offset: number
  tables: SqliteTableSummary[]
  schema: SqliteColumnInfo[]
  rows: Array<Record<string, SqliteCellValue>>
}
type SqliteSelectedRowContext = {
  rowId: string
  rowIndex: number
  rowid: number | null
  values: Record<string, SqliteCellValue>
}
type SqliteRowSelectionContext = {
  selectedRowIds: string[]
  selectedRowCount: number
  selectedRows: SqliteSelectedRowContext[]
  selectionTruncated: boolean
}
type SqliteHudContextSnapshot = {
  activeId: string
  docked: boolean
  path: string
  label: string
  selectedTable: string | null
  ready: boolean
  loading: boolean
  selectedRowIds: string[]
  selectedRowCount: number
  selectedRows: SqliteSelectedRowContext[]
  selectionTruncated: boolean
}
type SqliteCellEditSession = {
  rowid: number
  column: string
  previous: SqliteCellValue
  onSubmit(rowid: number, column: string, value: SqliteCellValue): void
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
type NetworkDisplayInfo = DisplayInfoBase & {
  kind: "network"
}
type RemoteDesktopDisplayInfo = DisplayInfoBase & {
  kind: "remote-desktop"
  frame: AndroidRtcFrame | null
}
type DisplayInfo = ModuleDisplayInfo | NetworkDisplayInfo | RemoteDesktopDisplayInfo
type SqliteDisplayController = {
  id: string
  requestedPath: string
  path: string
  label: string
  version: string | null
  selectedTable: string | null
  payload: SqliteDatabasePayload | null
  loading: Promise<void> | null
  refreshCheck: Promise<void> | null
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
    breakpointsActive: boolean
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
      selections: SourceSelectionContext[]
    }
    context: ModuleCurrentContext | null
    activeFrameIndex: number | null
    currentFrame: FrameSnapshot | null
    terminal: {
      canAcceptInput: boolean
      focused: boolean
      pendingInput: string
      promptVisible: boolean
      selection: TerminalSelectionContext | null
      textTail: string[]
    }
    activeCommand: ActiveInterpreterCommand | null
    verboseVisible: boolean
  }
  capabilities: {
    pause: boolean
    resume: boolean
    step: boolean
    setBreakpointsActive: boolean
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
  | {type: "terminal.ready"; shell: string; size: TerminalSize; sessionId: string; restored: boolean; replayBytes: number; state: PtyTerminalState; tmuxSession?: string | null}
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
  breakpointRegistrationsLoaded: boolean
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
  breakpointsActiveCommand: ActiveInterpreterCommand | null
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
  codexComposer: HostTerminalCodexComposerPane
  codexEditor: EditorPane
  title: string
  sessionStorageKey: string
  sessionKey: string
  tmuxSession: string
  initialCommand: string | null
  initialCommandSent: boolean
  socket: WebSocket | null
  sessionId: string | null
  terminalSize: TerminalSize | null
  connectionState: PtyStatusKind
  statusLabel: string
  terminalState: PtyTerminalState | null
  localEchoId: number
  codexDraft: string
  codexAttachments: CodexComposerAttachment[]
  codexAttachmentUploadInFlight: boolean
  codexSubmitAfterAttachmentUpload: boolean
  codexDropActive: boolean
  codexEditorSyncing: boolean
  codexComposerStatus: string
  codexComposerStatusTimer: number | null
  voiceComposerBaseDraft: string | null
  voiceComposerGeneratedDraft: string
  voiceComposerEdited: boolean
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

const COMMAND_TIMEOUT_MS = 10_000
const RELOAD_HEALTH_POLL_MS = 400
const RELOAD_HEALTH_TIMEOUT_MS = 60_000
const RELOAD_HEALTH_REQUEST_TIMEOUT_MS = 1_200
const MODULE_DISPLAY_GAP_MM = 52
const MODULE_DISPLAY_CENTER_Y_MM = 0
const MODULE_DISPLAY_CENTER_Z_MM = 900
const HOST_TERMINAL_SESSION_STORAGE_KEY = "metafor.interpreter.hostTerminal.sessionId"
const HOST_TERMINAL_SESSION_KEY = "interpreter:host-terminal"
const HOST_TERMINAL_TMUX_SESSION = "metafor-interpreter-host"
const HOST_TERMINAL_HUD_RECT_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudRect:v1"
const HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY = "metafor.interpreter.hostTerminal.codexComposerRect:v1"
const HOST_TERMINAL_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.hostTerminal.hudDocked:v1"
const HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.hostTerminal.dockPlacement:v1"
const FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.fullscreen.dockPlacement:v1"
const NETWORK_TERMINAL_SESSION_STORAGE_KEY = "metafor.interpreter.networkTerminal.sessionId:v1"
const NETWORK_TERMINAL_SESSION_KEY = "interpreter:network-terminal"
const NETWORK_TERMINAL_TMUX_SESSION = "metafor-app-web-net"
const NETWORK_TERMINAL_TMUX_FALLBACK_COMMAND = `exec tmux new-session -A -s ${NETWORK_TERMINAL_TMUX_SESSION}\r`
const NETWORK_DISPLAY_ID = "network:tmux"
const REMOTE_DESKTOP_DISPLAY_ID = "remote-desktop:server"
const NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY = "metafor.interpreter.networkTerminal.hudRect:v1"
const NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.networkTerminal.hudDocked:v1"
const NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY = "metafor.interpreter.networkStatus.autoRefresh:v1"
const NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY = "metafor.interpreter.networkProduct.viaInterpreter:v1"
const ANDROID_HUD_RECT_STORAGE_KEY = "metafor.interpreter.android.hudRect:v1"
const ANDROID_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.android.hudDocked:v1"
const ANDROID_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.android.dockPlacement:v1"
const SECONDARY_ANDROID_HUD_RECT_STORAGE_KEY = "metafor.interpreter.android.secondary.hudRect:v1"
const SECONDARY_ANDROID_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.android.secondary.hudDocked:v1"
const SECONDARY_ANDROID_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.android.secondary.dockPlacement:v1"
const VOICE_SETTINGS_RECT_STORAGE_KEY = "metafor.interpreter.voice.settingsRect:v1"
const TODO_HUD_RECT_STORAGE_KEY = "metafor.interpreter.todo.hudRect:v1"
const TODO_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.todo.hudDocked:v1"
const TODO_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.todo.dockPlacement:v1"
const SQLITE_HUD_RECT_STORAGE_KEY = "metafor.interpreter.sqlite.hudRect:v1"
const SQLITE_HUD_DOCKED_STORAGE_KEY = "metafor.interpreter.sqlite.hudDocked:v1"
const SQLITE_DOCK_PLACEMENT_STORAGE_KEY = "metafor.interpreter.sqlite.dockPlacement:v1"
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
const INTERPRETER_VIEWPOINT_STORAGE_KEY = "metafor.interpreter.viewPoint:v1"
const INTERPRETER_DISPLAY_POSITIONS_STORAGE_KEY = "metafor.interpreter.displayPositions:v1"
const TODO_PANEL_STATE_STORAGE_KEY = "metafor.interpreter.todo.panelState:v1"
const INTERPRETER_VIEWPOINT_STORE_DELAY_MS = 120
const INTERPRETER_DISPLAY_POSITION_STORE_DELAY_MS = 120
const WORKSPACE_FILES_STATE_STORAGE_PREFIX = "metafor.interpreter.workspaceFiles:v1"
const DEFAULT_VOICE_INPUT_URL = "/hud/voice/asr/ws"
const DEFAULT_VOICE_WAKE_URL = "/hud/voice/wake/ws"
const DEFAULT_VOICE_SIGNAL_VOLUME = 0.2
const DEFAULT_VOICE_DEACTIVATION_MODE: VoiceDeactivationMode = "phrase-timeout"
const DEFAULT_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const DEFAULT_VOICE_AUTO_SEND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_ENABLED = true
const DEFAULT_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const MAX_VOICE_SIGNAL_VOLUME = 1
const MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS = 3
const MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS = 60
const MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME = 1
const VOICE_SERVICE_CHECK_INTERVAL_MS = 12_000
const VOICE_SERVICE_CHECK_TIMEOUT_MS = 2_500
const VOICE_AUTO_WAKE_RETRY_MS = 3_000
const VOICE_INPUT_HUD_VISIBLE = false
const VOICE_HUD_W = 128
const VOICE_HUD_H = 128
const VOICE_SETTINGS_W = 460
const VOICE_SETTINGS_H = 760
const VOICE_SETTINGS_MARGIN = 16
const VOICE_SETTINGS_LONG_PRESS_MS = 450
const VOICE_SETTINGS_LONG_PRESS_MOVE_PX = 6
const VOICE_TOGGLE_CLICK_DELAY_MS = 320
const HOST_TERMINAL_HUD_MAX_W = 980
const HOST_TERMINAL_HUD_MAX_H = 340
const HOST_TERMINAL_HUD_MIN_W = 720
const HOST_TERMINAL_HUD_MIN_H = 560
const HOST_TERMINAL_HUD_PANEL_MIN_W = 260
const HOST_TERMINAL_HUD_PANEL_MIN_H = 160
const HOST_TERMINAL_DOCK_SHORT = 32
const HOST_TERMINAL_DOCK_LONG = 112
const HOST_TERMINAL_DOCK_MARGIN = 8
const HOST_TERMINAL_DOCK_LONG_PRESS_MS = 320
const HOST_TERMINAL_DOCK_DRAG_THRESHOLD_PX = 6
const ANDROID_HUD_MIN_W = 300
const ANDROID_HUD_MIN_H = 360
const ANDROID_FRAME_REFRESH_MS = 850
const ANDROID_DOCK_SHORT = 30
const ANDROID_DOCK_LONG = 94
const ANDROID_DOCK_MARGIN = 8
const TODO_HUD_MIN_W = 320
const TODO_HUD_MIN_H = 220
const TODO_DOCK_SHORT = 30
const TODO_DOCK_LONG = 84
const TODO_DOCK_MARGIN = 8
const SQLITE_HUD_MIN_W = 520
const SQLITE_HUD_MIN_H = 300
const SQLITE_HUD_HEADER_H = 38
const SQLITE_HUD_CONTENT_PAD = 8
const SQLITE_DOCK_SHORT = 30
const SQLITE_DOCK_LONG = 94
const SQLITE_DOCK_MARGIN = 8
const SQLITE_CONTEXT_SELECTED_ROW_LIMIT = 20
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
const HOST_TERMINAL_CODEX_COMPOSER_H = 268
const HOST_TERMINAL_CODEX_COMPOSER_MIN_W = 420
const HOST_TERMINAL_CODEX_COMPOSER_MIN_H = 220
const HOST_TERMINAL_CODEX_COMPOSER_GAP = 8
const HOST_TERMINAL_CODEX_COMPOSER_PAD = 12
const HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE = 24
const HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE = true
const AGENT_READY_SOUND_IDLE_MS = 2_500
const AGENT_READY_SOUND_COOLDOWN_MS = 1_200
const VOICE_SIGNAL_COOLDOWN_MS = 900
const VOICE_SIGNAL_CAPTURE_FALLBACK_MS = 260
const DEFAULT_VOICE_ACTIVATION_FUZZY = 0
const DEFAULT_VOICE_DEACTIVATION_FUZZY = 0.05
const DEFAULT_VOICE_STOP_FUZZY = 0.06
const WORKSPACE_FILES_LIMIT = 500
const SQLITE_TABLE_SCROLL_KEY = "sqlite-table-scroll"
const SQLITE_CELL_EDIT_FIELD_KEY = "sqlite-cell-edit-value"
const SQLITE_CELL_EDIT_MODAL_W = 500
const SQLITE_CELL_EDIT_MODAL_H = 192
const HUD_PANEL_BG = withAlpha(palette.bg, 0.68)
const HUD_CODE_BG = withAlpha(palette.bgCode, 0.62)
const HUD_LOCAL_BACKDROP_BG = withAlpha(palette.bg, 0.24)
const HUD_MODAL_SHADOW_BG = withAlpha(palette.bgInput, 0.32)
const HUD_MODAL_BG = withAlpha(palette.bgElevated, 0.78)
const HUD_LAYER_TOP = 1_000

type HudNotificationKind = "activation" | "deactivation" | "stop" | "error" | "agent"

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

type NetworkServiceKey = NetworkWatchServiceKey

const DEFAULT_HOST_TERMINAL_HUD_RECT: UiSurfaceRect = {x: 643, y: 60, w: 755, h: 943}
const DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "top", offset: 858}
const DEFAULT_FULLSCREEN_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "top", offset: 984}
const DEFAULT_NETWORK_TERMINAL_HUD_RECT: UiSurfaceRect = {x: 24, y: 520, w: 1080, h: 560}
const NETWORK_DISPLAY_COLUMN_GAP = 8
const NETWORK_DISPLAY_COLUMN_MIN_W = 920
const NETWORK_DISPLAY_INFO_MIN_W = 420
const NETWORK_DISPLAY_INFO_MAX_W = 620
const NETWORK_DISPLAY_INFO_RATIO = 0.34
const NETWORK_STATUS_REFRESH_MS = 2500
const DEFAULT_ANDROID_HUD_RECT: UiSurfaceRect = {x: 24, y: 80, w: 390, h: 720}
const DEFAULT_SECONDARY_ANDROID_HUD_RECT: UiSurfaceRect = {x: 430, y: 80, w: 390, h: 720}
const DEFAULT_ANDROID_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "left", offset: 380}
const DEFAULT_SECONDARY_ANDROID_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "left", offset: 500}
const ANDROID_RTC_FRAME_SRC = "metafor:android-rtc-frame"
const SECONDARY_ANDROID_RTC_FRAME_SRC = "metafor:android-rtc-frame:secondary"
const REMOTE_DESKTOP_RTC_FRAME_SRC = "metafor:remote-desktop-rtc-frame"
const REMOTE_DESKTOP_SNAPSHOT_FRAME_SRC = "metafor:remote-desktop-snapshot-frame"
const REMOTE_DESKTOP_SNAPSHOT_FRAME_SLOTS = 12
const REMOTE_DESKTOP_SNAPSHOT_POLL_MS = 700
const REMOTE_DESKTOP_SNAPSHOT_ERROR_POLL_MS = 1800
const REMOTE_DESKTOP_SNAPSHOT_REQUEST_TIMEOUT_MS = 8_000
const REMOTE_DESKTOP_RTC_FRAME_GRACE_MS = 3000
const REMOTE_DESKTOP_RTC_BLACK_SUPPRESS_MS = 5_000
const REMOTE_DESKTOP_CONNECT_START_LOG_MS = 3_000
const REMOTE_DESKTOP_RTC_VIDEO_DISPLAY_ENABLED = true
const SPACE_OVERVIEW_WATCHDOG_MS = 900
const ANDROID_CONTROL_STATUS_HOLD_MS = 4_000
const PINNED_VOICE_HUD_ANCHOR: VoiceHudAnchorPlacement = {horizontal: "right", vertical: "bottom", offsetX: 0, offsetY: 0}
const DEFAULT_TODO_HUD_RECT: UiSurfaceRect = {x: 16, y: 72, w: 430, h: 560}
const DEFAULT_TODO_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "left", offset: 260}
const DEFAULT_SQLITE_HUD_RECT: UiSurfaceRect = {x: 482, y: 96, w: 960, h: 640}
const DEFAULT_SQLITE_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "right", offset: 360}

let uiCanvas: UiRuntime | null = null
let uiLoading = false
let displayHoverOutlinePane: DisplayHoverOutlinePane | null = null
let todoPane: ToDoPane | null = null
let todoDockPane: HostTerminalDockPane | null = null
let todoContext: ToDoPaneContextSnapshot | null = null
let androidPane: AndroidPane | null = null
let androidDockPane: HostTerminalDockPane | null = null
let secondaryAndroidPane: AndroidPane | null = null
let secondaryAndroidDockPane: HostTerminalDockPane | null = null
let sqliteHudPane: SqliteHudFramePane | null = null
let sqliteDockPane: HostTerminalDockPane | null = null
let hostTerminal: HostTerminalController | null = null
let networkHostTerminal: HostTerminalController | null = null
let hostTerminalDockPane: HostTerminalDockPane | null = null
let fullscreenDockPane: HostTerminalDockPane | null = null
let networkDisplayControlsPane: NetworkWatchPane | null = null
let networkDisplayTerminal: TerminalPane | null = null
let networkDisplayInstalled = false
let remoteDesktopPane: RemoteDesktopPane | null = null
let remoteDesktopDisplayInstalled = false
let remoteDesktopRtcClient: AndroidRtcClient | null = null
let remoteDesktopRtcConnectInFlight = false
let remoteDesktopSnapshotTimer: number | null = null
let remoteDesktopSnapshotInFlight = false
let remoteDesktopLastRtcFrameAt = 0
let remoteDesktopRtcSuppressUntil = 0
let remoteDesktopSnapshotPath: string | null = null
let remoteDesktopSnapshotFrameSlot = 0
let remoteDesktopLastRtcStatusLog = ""
let remoteDesktopLastConnectStartLogAt = 0
let spaceOverviewPinned = false
let spaceOverviewWatchdogTimer: number | null = null
let hostTerminalAgentSignalPane: HostTerminalAgentSignalPane | null = null
let hostTerminalStatusLabelForLayout = t("terminalConnecting")
let hostTerminalHudDocked = readStoredHostTerminalHudDocked()
let hostTerminalDockPlacement: HostTerminalDockPlacement | null = readStoredHostTerminalDockPlacement() ?? DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT
let fullscreenDockPlacement: HostTerminalDockPlacement | null = readStoredFullscreenDockPlacement() ?? DEFAULT_FULLSCREEN_DOCK_PLACEMENT
let hostTerminalHudRectPreview: UiSurfaceRect | null = null
let networkHostTerminalHudDocked = readStoredNetworkTerminalHudDocked()
let networkHostTerminalHudRectPreview: UiSurfaceRect | null = null
let networkServiceSwitches: Record<NetworkServiceKey, boolean> = {tls: true, redirect: true}
let networkProductViaInterpreter = readStoredNetworkProductViaInterpreter()
let networkActionStatus = "ready"
let networkStatusLines: string[] = []
let networkStatusUpdatedAt: Date | null = null
let networkStatusRefreshTimer: number | null = null
let networkStatusRefreshInFlight = false
let networkStatusRefreshGeneration = 0
let networkStatusRefreshAbortController: AbortController | null = null
let networkStatusAutoRefreshEnabled = readStoredNetworkStatusAutoRefreshEnabled()
let androidHudDocked = readStoredAndroidHudDocked()
let androidDockPlacement: HostTerminalDockPlacement | null = readStoredAndroidDockPlacement() ?? DEFAULT_ANDROID_DOCK_PLACEMENT
let androidHudRectPreview: UiSurfaceRect | null = null
let secondaryAndroidHudDocked = readStoredSecondaryAndroidHudDocked()
let secondaryAndroidDockPlacement: HostTerminalDockPlacement | null = readStoredSecondaryAndroidDockPlacement() ?? DEFAULT_SECONDARY_ANDROID_DOCK_PLACEMENT
let secondaryAndroidHudRectPreview: UiSurfaceRect | null = null
let androidFrameRefreshTimer: number | null = null
let androidFrameRefreshInFlight = false
let androidRtcClient: AndroidRtcClient | null = null
let secondaryAndroidRtcClient: AndroidRtcClient | null = null
let androidControlStatusUntil = 0
let secondaryAndroidControlStatusUntil = 0
let todoHudDocked = readStoredTodoHudDocked()
let todoDockPlacement: HostTerminalDockPlacement | null = readStoredTodoDockPlacement() ?? DEFAULT_TODO_DOCK_PLACEMENT
let todoHudRectPreview: UiSurfaceRect | null = null
let sqliteHudDocked = readStoredSqliteHudDocked()
let sqliteDockPlacement: HostTerminalDockPlacement | null = readStoredSqliteDockPlacement() ?? DEFAULT_SQLITE_DOCK_PLACEMENT
let sqliteHudRectPreview: UiSurfaceRect | null = null
let activeSqliteHudId: string | null = null
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
let voiceAutoSendTarget: VoiceInputTarget | null = null
let voiceAutoSendText = ""
let voiceNextFlushMode: "auto" | "draft" = "auto"
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
let hostCodexComposerDragHandlersInstalled = false
let hudNotificationAudioContext: AudioContext | null = null
let remoteDesktopAudioContext: AudioContext | null = null
let remoteDesktopAudioSource: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null
let remoteDesktopAudioPanner: PannerNode | null = null
let remoteDesktopAudioGain: GainNode | null = null
let remoteDesktopAudioStream: MediaStream | null = null
let remoteDesktopAudioElement: HTMLAudioElement | null = null
let remoteDesktopAudioLastCenter: UiRuntimeViewPointVector | null = null
let remoteDesktopAudioUnlocked = false
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
const sqliteHudSurfaceIds = new Set<string>()
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
  suspendVoiceForInactiveDocument()
  stopNetworkStatusRefresh({abort: true})
  flushInterpreterViewPointStorage()
  flushInterpreterDisplayPositionsStorage()
})
window.addEventListener("pagehide", () => suspendVoiceForInactiveDocument())
window.addEventListener("blur", () => suspendVoiceForInactiveDocument())
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    suspendVoiceForInactiveDocument()
    stopNetworkStatusRefresh({abort: true})
    flushInterpreterViewPointStorage()
    flushInterpreterDisplayPositionsStorage()
    return
  }
  if (!documentCanOwnVoice()) suspendVoiceForInactiveDocument()
  else if (!voiceAutoWakePaused) scheduleVoiceAutoWake(250)
  syncNetworkStatusRefresh()
  refreshVisibleSqliteAfterSkippedServerEvent()
})

installVoiceServiceMonitor()
installHudNotificationSoundUnlock()
connect()
void initEngine()

function connect(): void {
  const url = interpreterWebSocketUrl("/ws")
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
      for (const path of msg.sqliteDatabases ?? []) {
        void openSqliteDisplay({
          path,
          reveal: false,
        }).catch((error) => console.error(error))
      }
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
    case "breakpoints-changed":
      handleBreakpointsChanged(msg)
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
    case "sqlite-changed":
      handleSqliteChanged(msg)
      return
    case "reload": {
      const delayMs = typeof msg.delayMs === "number" && Number.isFinite(msg.delayMs)
        ? Math.max(0, msg.delayMs)
        : 0
      scheduleReloadWhenServerReady(delayMs)
      return
    }
  }
}

function scheduleReloadWhenServerReady(delayMs: number): void {
  const startedAt = Date.now()
  const reload = () => {
    const url = new URL(window.location.href)
    url.searchParams.set("_r", String(Date.now()))
    window.location.replace(url.toString())
  }
  const poll = async (): Promise<void> => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), RELOAD_HEALTH_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${interpreterHttpPath("/health")}?_r=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (response.ok) {
        reload()
        return
      }
    } catch {
      // The host can be briefly unavailable while /restart respawns the pane.
    } finally {
      window.clearTimeout(timer)
    }
    if (Date.now() - startedAt >= RELOAD_HEALTH_TIMEOUT_MS) {
      reload()
      return
    }
    window.setTimeout(() => void poll(), RELOAD_HEALTH_POLL_MS)
  }
  window.setTimeout(() => void poll(), delayMs)
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
    case "hud.terminal.network.get":
      return networkTerminalPayload()
    case "hud.terminal.network.dock":
      return setNetworkTerminalDocked(true)
    case "hud.terminal.network.show":
      return focusNetworkDisplay()
    case "hud.terminal.network.toggle":
      return focusNetworkDisplay()
    case "hud.android.get":
      return hudAndroidPayload()
    case "hud.android.show":
      return setHudAndroidDocked(false)
    case "hud.android.dock":
      return setHudAndroidDocked(true)
    case "hud.android.toggle":
      return setHudAndroidDocked(!androidHudDocked)
    case "hud.android.refresh":
      await refreshAndroidFrame()
      return hudAndroidPayload()
    case "hud.android.control":
      return sendAndroidControlCommand(params)
    case "hud.android.secondary.get":
      return secondaryHudAndroidPayload()
    case "hud.android.secondary.show":
      return setSecondaryHudAndroidDocked(false)
    case "hud.android.secondary.dock":
      return setSecondaryHudAndroidDocked(true)
    case "hud.android.secondary.toggle":
      return setSecondaryHudAndroidDocked(!secondaryAndroidHudDocked)
    case "hud.android.secondary.control":
      return sendSecondaryAndroidControlCommand(params)
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
    case "hud.sqlite.get":
      return await refreshedHudSqlitePayload()
    case "hud.sqlite.dock":
      setSqliteHudDocked(true)
      return await refreshedHudSqlitePayload()
    case "hud.sqlite.show":
      setSqliteHudDocked(false)
      return await refreshedHudSqlitePayload()
    case "hud.sqlite.toggle":
      setSqliteHudDocked(!sqliteHudDocked)
      return await refreshedHudSqlitePayload()
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
  setSpaceOverviewPinned(false)
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
  } else if (display.kind === "network") {
    networkDisplayTerminal?.focus()
  } else if (display.kind === "remote-desktop") {
    remoteDesktopPane?.focus()
    connectRemoteDesktopRtc()
  }
  syncNetworkStatusRefresh()
  return {
    resolved: display,
    view,
    ...spacePayload(),
  }
}

function frameSpace(): unknown {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  setSpaceOverviewPinned(true)
  frameAllSpaceDisplays()
  syncNetworkStatusRefresh()
  connectRemoteDesktopRtc()
  return spacePayload()
}

function setSpaceOverviewPinned(pinned: boolean): void {
  if (spaceOverviewPinned === pinned) {
    if (pinned) enforceSpaceOverview()
    return
  }
  spaceOverviewPinned = pinned
  if (pinned) {
    if (spaceOverviewWatchdogTimer === null) {
      spaceOverviewWatchdogTimer = window.setInterval(enforceSpaceOverview, SPACE_OVERVIEW_WATCHDOG_MS)
    }
    enforceSpaceOverview()
    return
  }
  if (spaceOverviewWatchdogTimer !== null) {
    window.clearInterval(spaceOverviewWatchdogTimer)
    spaceOverviewWatchdogTimer = null
  }
}

function frameAllSpaceDisplays(): void {
  if (uiCanvas === null) return
  const displayIds = displayInfos().map((display) => display.displayId)
  if (displayIds.length > 0) uiCanvas.frameDisplays(displayIds)
}

function enforceSpaceOverview(): void {
  if (!spaceOverviewPinned || uiCanvas === null) return
  const displayIds = displayInfos().map((display) => display.displayId)
  if (displayIds.length <= 1) return
  if (uiCanvas.displayMode !== "far") {
    uiCanvas.frameDisplays(displayIds)
  }
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
  setSpaceOverviewPinned(false)
  const body = objectParam(params)
  const view = stringParam(body["view"]) ?? "full"
  const resolved = resolveProcessDisplay(params)
  if (view === "full" && body["dockHostTerminal"] === true) setHostTerminalHudDocked(true)
  const focused = uiCanvas.focusDisplay(resolved.displayId)
  if (!focused) throw new Error(`display not found: ${resolved.displayId}`)
  focusProcessTerminal(resolved.moduleId)
  syncNetworkStatusRefresh()
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
    case "breakpointsActive":
    case "setBreakpointsActive": {
      const active = booleanParam(actionParams["active"])
      if (active === undefined) throw new Error("breakpoints active must be a boolean")
      reply = await runModuleInterpreterCommand(controller, "setBreakpointsActive", {active}, active ? t("unmuteBreakpoints") : t("muteBreakpoints"))
      break
    }
    case "muteBreakpoints":
      reply = await runModuleInterpreterCommand(controller, "muteBreakpoints", {}, t("muteBreakpoints"))
      break
    case "unmuteBreakpoints":
      reply = await runModuleInterpreterCommand(controller, "unmuteBreakpoints", {}, t("unmuteBreakpoints"))
      break
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
  const selection = parseSourceOpenSelection(params)
  const revealInWorkspace = booleanParam(params["revealInWorkspace"]) ?? booleanParam(params["reveal"])
  if (line !== undefined) options.line = line
  if (column !== undefined) options.column = column
  if (selection !== undefined) options.selection = selection
  options.revealInWorkspace = revealInWorkspace ?? true
  return await openWorkspaceSource(controller, sourceUrl, options)
}

async function openInterpreterSelectedSource(controller: ModuleDisplayController): Promise<unknown> {
  const selectedText = controller.sourceContext.selection?.text.trim() ?? ""
  if (selectedText.length === 0) throw new Error("source.openSelection requires selected source text")
  const specifier = importSpecifierFromText(selectedText)
  if (specifier === undefined) throw new Error(`selected text does not contain an import specifier: ${selectedText}`)
  const sourceUrl = resolveSourceSpecifier(controller, specifier)
  const result = await openWorkspaceSource(controller, sourceUrl, {revealInWorkspace: true})
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
  notBefore?: string
  reveal?: boolean
}

type SourceOpenOptions = {
  line?: number
  column?: number
  selection?: SourceOpenSelection
  revealInWorkspace?: boolean
}

type SourceOpenPosition = {
  /** 1-based line for external API callers. */
  line: number
  /** 0-based column, matching editor/context API columns. */
  column: number
}

type SourceOpenSelection = {
  anchor: SourceOpenPosition
  focus: SourceOpenPosition
}

async function openSqliteDisplay(input: string | SqliteOpenParams): Promise<unknown> {
  const path = typeof input === "string" ? input : input.path
  const table = typeof input === "string" ? undefined : input.table
  const notBefore = typeof input === "string" ? undefined : input.notBefore
  const reveal = typeof input === "string" ? true : input.reveal !== false
  try {
    const payload = await fetchSqlitePayload(path, table, notBefore)
    const controller = ensureSqliteDisplayController(payload.path)
    applySqlitePayload(controller, payload)
    if (reveal) showSqliteHudController(controller.id)
    else activateSqliteHudController(controller.id)
    return sqliteDisplayPayload(controller)
  } catch (error) {
    if (!isSqliteMissingError(error)) {
      throw error
    }
    const controller = ensureSqliteDisplayController(path)
    clearSqlitePayload(controller, `Waiting for SQLite database: ${sqliteInitialLabel(path)}`)
    if (reveal) showSqliteHudController(controller.id)
    else activateSqliteHudController(controller.id)
    return sqliteDisplayPayload(controller)
  }
}

function ensureSqliteDisplayController(path: string): SqliteDisplayController {
  const existing = sqliteDisplayForPath(path)
  if (existing !== null) {
    activateSqliteHudController(existing.id)
    return existing
  }
  const id = sqliteDisplayKey(path)
  const controller = createSqliteDisplayController(id, path)
  sqliteDisplays.set(id, controller)
  sqliteOrder = [...sqliteOrder.filter((item) => item !== id), id]
  controller.rows.setStatus(`Waiting for SQLite database: ${sqliteInitialLabel(path)}`)
  installSqliteHudSurfaces(controller)
  activateSqliteHudController(id)
  return controller
}

function sqliteDisplayForPath(path: string): SqliteDisplayController | null {
  const needle = sqliteComparablePath(path)
  for (const controller of sqliteDisplays.values()) {
    if (controller.requestedPath === path || controller.path === path) return controller
    const requested = sqliteComparablePath(controller.requestedPath)
    const current = sqliteComparablePath(controller.path)
    if (requested === needle || current === needle) return controller
    if (needle.endsWith(`/${requested}`) || needle.endsWith(`/${current}`)) return controller
  }
  return sqliteDisplays.get(sqliteDisplayKey(path)) ?? null
}

function sqliteComparablePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
}

function activeSqliteController(): SqliteDisplayController | null {
  if (activeSqliteHudId !== null) {
    const active = sqliteDisplays.get(activeSqliteHudId)
    if (active !== undefined) return active
  }
  for (let index = sqliteOrder.length - 1; index >= 0; index -= 1) {
    const controller = sqliteDisplays.get(sqliteOrder[index]!)
    if (controller !== undefined) return controller
  }
  return null
}

function activateSqliteHudController(id: string): void {
  if (!sqliteDisplays.has(id)) return
  activeSqliteHudId = id
  sqliteHudPane?.requestRender()
  sqliteDockPane?.requestRender()
  relayoutHudSurfaces()
  updateSqliteContext()
}

function showSqliteHudController(id: string): void {
  activateSqliteHudController(id)
  setSqliteHudDocked(false)
}

function installSqliteHudSurfaces(controller: SqliteDisplayController): void {
  if (uiCanvas === null || sqliteHudSurfaceIds.has(controller.id)) return
  sqliteHudSurfaceIds.add(controller.id)
  uiCanvas.addHudSurface(controller.tables, (canvas) => sqliteHudRects(controller.id, canvas).tables)
  uiCanvas.addHudSurface(controller.rows, (canvas) => sqliteHudRects(controller.id, canvas).rows)
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
  const notBefore = stringParam(body["notBefore"])
  const reveal = booleanParam(body["reveal"])
  return {
    path,
    ...(table === undefined ? {} : {table}),
    ...(notBefore === undefined ? {} : {notBefore}),
    ...(reveal === undefined ? {} : {reveal}),
  }
}

function refreshSqliteDisplaysAfterTargetRestart(startedAt: string): void {
  for (const controller of sqliteDisplays.values()) {
    const selectedTable = controller.selectedTable
    clearSqlitePayload(controller, `Waiting for SQLite database: ${sqliteInitialLabel(controller.requestedPath)}`)
    void refreshSqliteDisplay(controller, selectedTable, startedAt).catch(() => undefined)
  }
}

async function refreshSqliteDisplay(controller: SqliteDisplayController, table = controller.selectedTable, notBefore?: string): Promise<SqliteDatabasePayload | null> {
  let payload: SqliteDatabasePayload | null = null
  let missing = false
  let loading!: Promise<void>
  loading = (async () => {
    controller.rows.setStatus("Loading SQLite database")
    payload = await fetchSqlitePayload(controller.path, table ?? undefined, notBefore)
    if (controller.loading !== loading) return
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

function handleSqliteChanged(msg: Extract<ServerMessage, {type: "sqlite-changed"}>): void {
  const controller = sqliteDisplayForPath(msg.path)
  if (controller === null) return
  if (msg.version !== null && msg.version !== undefined && controller.version === msg.version) return
  if (sqliteHudDocked || document.visibilityState === "hidden") {
    controller.version = null
    return
  }
  void refreshSqliteDisplayFromServerEvent(controller).catch((error) => {
    if (!isSqliteMissingError(error)) console.error(error)
  })
}

function refreshVisibleSqliteAfterSkippedServerEvent(): void {
  if (sqliteHudDocked) return
  const controller = activeSqliteController()
  if (controller === null || controller.version !== null) return
  void refreshSqliteDisplayFromServerEvent(controller).catch((error) => {
    if (!isSqliteMissingError(error)) console.error(error)
  })
}

async function refreshSqliteDisplayFromServerEvent(controller: SqliteDisplayController): Promise<void> {
  if (controller.loading !== null || controller.refreshCheck !== null) return
  let refreshCheck!: Promise<void>
  refreshCheck = (async () => {
    await refreshSqliteDisplay(controller, controller.selectedTable)
  })()
  controller.refreshCheck = refreshCheck
  try {
    await refreshCheck
  } catch (error) {
    if (!isSqliteMissingError(error)) console.error(error)
  } finally {
    if (controller.refreshCheck === refreshCheck) controller.refreshCheck = null
  }
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
  controller.loading = null
  controller.path = payload.path
  controller.label = payload.label
  controller.version = payload.version
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
  updateSqliteContext()
}

function clearSqlitePayload(controller: SqliteDisplayController, status: string): void {
  controller.selectedTable = null
  controller.payload = null
  controller.version = null
  controller.suppressTableSelectionOpen = true
  try {
    controller.tables.setTitle(controller.label)
    controller.tables.setItems([])
    controller.tables.setSelectedIds([])
  } finally {
    controller.suppressTableSelectionOpen = false
  }
  controller.rows.clearPayload(status)
  updateSqliteContext()
}

function sqliteDisplayPayload(controller: SqliteDisplayController): unknown {
  const frame = sqliteHudPane === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(sqliteHudPane)
  const selection = controller.rows.contextSnapshot()
  return {
    id: controller.id,
    hud: true,
    active: activeSqliteHudId === controller.id,
    docked: sqliteHudDocked,
    rect: frame?.rect ?? null,
    dockPlacement: sqliteDockPlacement,
    path: controller.path,
    label: controller.label,
    selectedTable: controller.selectedTable,
    ready: controller.payload !== null,
    loading: controller.loading !== null,
    tables: controller.payload?.tables ?? [],
    rowCount: controller.payload?.rows.length ?? 0,
    selectedRowIds: selection.selectedRowIds,
    selectedRowCount: selection.selectedRowCount,
    selectedRows: selection.selectedRows,
    selectionTruncated: selection.selectionTruncated,
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
    sessionId: controller?.sessionId ?? readStoredHostTerminalSessionId(HOST_TERMINAL_SESSION_STORAGE_KEY),
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

async function refreshedHudSqlitePayload(): Promise<unknown> {
  const controller = activeSqliteController()
  if (controller !== null && controller.loading === null) {
    await refreshSqliteDisplay(controller, controller.selectedTable).catch(() => undefined)
  }
  return hudSqlitePayload()
}

function hudSqlitePayload(): unknown {
  const controller = activeSqliteController()
  const frame = sqliteHudPane === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(sqliteHudPane)
  return {
    docked: sqliteHudDocked,
    rect: frame?.rect ?? null,
    dockPlacement: sqliteDockPlacement,
    activeId: controller?.id ?? activeSqliteHudId,
    controller: controller === null ? null : sqliteDisplayPayload(controller),
    databases: sqliteOrder
      .map((id) => sqliteDisplays.get(id))
      .filter((item): item is SqliteDisplayController => item !== undefined)
      .map((item) => ({
        id: item.id,
        path: item.path,
        label: item.label,
        selectedTable: item.selectedTable,
        ready: item.payload !== null,
        loading: item.loading !== null,
        active: activeSqliteHudId === item.id,
      })),
  }
}

function updateSqliteContext(): void {
  const context = sqliteContextSnapshot()
  publishSqliteContext(context)
  queuePublishAllModuleContexts()
}

function publishSqliteContext(context: SqliteHudContextSnapshot | null): void {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify({
    type: "hud-sqlite-context",
    context,
  }))
}

function sqliteContextSnapshot(): SqliteHudContextSnapshot | null {
  const controller = activeSqliteController()
  if (controller === null) return null
  const selection = controller.rows.contextSnapshot()
  return {
    activeId: controller.id,
    docked: sqliteHudDocked,
    path: controller.path,
    label: controller.label,
    selectedTable: controller.selectedTable,
    ready: controller.payload !== null,
    loading: controller.loading !== null,
    selectedRowIds: selection.selectedRowIds,
    selectedRowCount: selection.selectedRowCount,
    selectedRows: selection.selectedRows,
    selectionTruncated: selection.selectionTruncated,
  }
}

function networkTerminalPayload(): unknown {
  const controller = networkHostTerminal
  const frame = networkDisplayTerminal === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(networkDisplayTerminal)
  return {
    docked: true,
    sessionId: controller?.sessionId ?? readStoredHostTerminalSessionId(NETWORK_TERMINAL_SESSION_STORAGE_KEY),
    status: controller?.connectionState ?? "idle",
    statusLabel: controller?.statusLabel ?? t("terminalConnecting"),
    rect: frame?.rect ?? null,
    dockPlacement: null,
  }
}

function setHudAndroidDocked(docked: boolean): unknown {
  setAndroidHudDocked(docked)
  return hudAndroidPayload()
}

function hudAndroidPayload(): unknown {
  const frame = androidPane === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(androidPane)
  const androidFrame = androidPane?.frameSnapshot() ?? null
  return {
    docked: androidHudDocked,
    rect: frame?.rect ?? null,
    rtc: {
      peerId: androidRtcClient?.peerId ?? null,
      peers: androidRtcClient?.peers() ?? [],
    },
    frame: androidFrame === null
      ? null
      : {
          width: androidFrame.width,
          height: androidFrame.height,
          capturedAt: androidFrame.capturedAt ?? null,
        },
  }
}

function setSecondaryHudAndroidDocked(docked: boolean): unknown {
  setSecondaryAndroidHudDocked(docked)
  return secondaryHudAndroidPayload()
}

function secondaryHudAndroidPayload(): unknown {
  const frame = secondaryAndroidPane === null || uiCanvas === null ? null : uiCanvas.surfaceFrame(secondaryAndroidPane)
  const androidFrame = secondaryAndroidPane?.frameSnapshot() ?? null
  return {
    docked: secondaryAndroidHudDocked,
    rect: frame?.rect ?? null,
    rtc: {
      peerId: secondaryAndroidRtcClient?.peerId ?? null,
      peers: secondaryAndroidRtcClient?.peers() ?? [],
    },
    frame: androidFrame === null
      ? null
      : {
          width: androidFrame.width,
          height: androidFrame.height,
          capturedAt: androidFrame.capturedAt ?? null,
        },
  }
}

function setHudTodoHighlight(params: unknown): unknown {
  if (todoPane === null) throw new Error("TODO pane is not ready")
  const ids = todoHighlightIdsFromParams(params)
  if (todoHudDocked) setTodoHudDocked(false)
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
  const networkDisplay = runtimeDisplays.get(NETWORK_DISPLAY_ID)
  if (networkDisplay !== undefined) {
    displays.push({
      ...networkDisplay,
      displayId: NETWORK_DISPLAY_ID,
      kind: "network",
      label: "Network",
      order: order++,
    })
  }
  const remoteDesktopDisplay = runtimeDisplays.get(REMOTE_DESKTOP_DISPLAY_ID)
  if (remoteDesktopDisplay !== undefined) {
    displays.push({
      ...remoteDesktopDisplay,
      displayId: REMOTE_DESKTOP_DISPLAY_ID,
      kind: "remote-desktop",
      label: "Server Desktop",
      frame: remoteDesktopPane?.frameSnapshot() ?? null,
      order: order++,
    })
  }
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
  const breakpointsCommandIdle = controller?.breakpointsActiveCommand === null
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
      breakpointsActive: module.breakpointsActive,
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
        selections: controller?.sourceContext.selections ?? [],
      },
      context: controller === undefined ? null : moduleCurrentContextPayload(controller),
      activeFrameIndex: controller?.activeFrameIndex ?? null,
      currentFrame,
      terminal: {
        canAcceptInput: controller === undefined ? false : canAcceptTerminalInput(controller),
        focused: controller?.terminal.isFocused() ?? false,
        pendingInput: controller?.terminalInput.buffer ?? "",
        promptVisible: controller?.terminalInput.promptVisible ?? false,
        selection: controller?.terminal.selectionSnapshot() ?? null,
        textTail: controller === undefined ? [] : terminalTextTail(controller.terminal, 20),
      },
      activeCommand: controller?.activeCommand ?? null,
      verboseVisible: controller?.verboseVisible ?? false,
    },
    capabilities: {
      pause: commandIdle && connected && targetRunning && !module.paused,
      resume: commandIdle && pausedWithContext,
      step: commandIdle && pausedWithContext,
      setBreakpointsActive: commandIdle && breakpointsCommandIdle,
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
    selections: [],
  }
}

function sourceContextPosition(pos: {line: number; col: number}): SourceContextPosition {
  return {
    line: Math.max(1, Math.floor(pos.line) + 1),
    column: Math.max(0, Math.floor(pos.col)),
  }
}

function sourceContextFromEditorSnapshot(snapshot: EditorSelectionSnapshot): SourceInteractionContext {
  const selections = snapshot.selections.map((selection) => ({
    anchor: sourceContextPosition(selection.anchor),
    focus: sourceContextPosition(selection.focus),
    start: sourceContextPosition(selection.range.start),
    end: sourceContextPosition(selection.range.end),
    text: selection.text,
  }))
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
    selections,
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
      selections: controller.sourceContext.selections,
    },
    activeFrameIndex: controller.activeFrameIndex,
    currentFrame: currentFrameContext(currentFrame),
    scopes: controller.scopes.contextSnapshot(),
    workspaceFiles: workspaceFilesContextSnapshot(controller.workspaceFiles),
    terminal: {
      focused: controller.terminal.isFocused(),
      pendingInput: controller.terminalInput.buffer,
      promptVisible: controller.terminalInput.promptVisible,
      selection: controller.terminal.selectionSnapshot(),
    },
    hud: {
      todo: todoContextSnapshot(),
      sqlite: sqliteContextSnapshot(),
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

function booleanParam(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function parseSourceOpenSelection(params: Record<string, unknown>): SourceOpenSelection | undefined {
  const nested = objectParamMaybe(params["selection"]) ?? objectParamMaybe(params["range"])
  if (nested !== undefined) return parseSourceOpenSelectionObject(nested, "source.open selection")

  const anchor = parseSourceOpenPositionFields(params, ["anchorLine", "startLine", "selectionStartLine"], ["anchorColumn", "anchorCol", "startColumn", "startCol", "selectionStartColumn", "selectionStartCol"])
  const focus = parseSourceOpenPositionFields(params, ["focusLine", "endLine", "selectionEndLine"], ["focusColumn", "focusCol", "endColumn", "endCol", "selectionEndColumn", "selectionEndCol"])
  if (anchor === undefined && focus === undefined) return undefined
  if (anchor === undefined || focus === undefined) throw new Error("source.open selection requires both start/end or anchor/focus positions")
  return {anchor, focus}
}

function parseSourceOpenSelectionObject(params: Record<string, unknown>, label: string): SourceOpenSelection {
  const anchor = parseSourceOpenPosition(params["anchor"])
    ?? parseSourceOpenPosition(params["start"])
    ?? parseSourceOpenPositionFields(params, ["anchorLine", "startLine"], ["anchorColumn", "anchorCol", "startColumn", "startCol"])
  const focus = parseSourceOpenPosition(params["focus"])
    ?? parseSourceOpenPosition(params["end"])
    ?? parseSourceOpenPositionFields(params, ["focusLine", "endLine"], ["focusColumn", "focusCol", "endColumn", "endCol"])
  if (anchor === undefined || focus === undefined) throw new Error(`${label} requires both start/end or anchor/focus positions`)
  return {anchor, focus}
}

function parseSourceOpenPosition(value: unknown): SourceOpenPosition | undefined {
  const object = objectParamMaybe(value)
  if (object === undefined) return undefined
  const line = numberParam(object["line"])
  if (line === undefined) return undefined
  const column = numberParam(object["column"]) ?? numberParam(object["col"]) ?? 0
  return {line, column}
}

function parseSourceOpenPositionFields(params: Record<string, unknown>, lineKeys: readonly string[], columnKeys: readonly string[]): SourceOpenPosition | undefined {
  const line = firstNumberParam(params, lineKeys)
  if (line === undefined) return undefined
  const column = firstNumberParam(params, columnKeys) ?? 0
  return {line, column}
}

function firstNumberParam(params: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = numberParam(params[key])
    if (value !== undefined) return value
  }
  return undefined
}

function sideParam(value: unknown): DisplaySelectorSide | undefined {
  if (value !== "left" && value !== "right" && value !== "top" && value !== "bottom" && value !== "center") return undefined
  return value
}

function handleInterpreterViewPointChange(snapshot: UiRuntimeViewPointSnapshot): void {
  if (spaceOverviewPinned && snapshot.displayMode === "near") setSpaceOverviewPinned(false)
  scheduleInterpreterViewPointStorage(snapshot)
  syncNetworkStatusRefresh()
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
  if (change.displayId === REMOTE_DESKTOP_DISPLAY_ID) updateRemoteDesktopAudioPosition(change.centerMm)
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
  const nextModuleOrder = modules.map((module) => module.id)
  const nextModuleIds = new Set(nextModuleOrder)
  for (const moduleId of [...moduleSnapshots.keys()]) {
    if (!nextModuleIds.has(moduleId)) moduleSnapshots.delete(moduleId)
  }
  const orderChanged = nextModuleOrder.length !== moduleOrder.length
    || nextModuleOrder.some((id, index) => id !== moduleOrder[index])
  moduleOrder = nextModuleOrder
  for (const module of modules) moduleSnapshots.set(module.id, module)
  if (orderChanged || nextModuleOrder.some((id) => !moduleDisplayIds.has(id)) || [...moduleDisplayIds].some((id) => !nextModuleIds.has(id))) {
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
    const hadPendingCommand = controller.activeCommand !== null || controller.breakpointsActiveCommand !== null
    controller.activeCommand = null
    controller.breakpointsActiveCommand = null
    if (!hadPendingCommand) continue
    const snapshot = moduleSnapshots.get(controller.id)
    if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
  }
}

async function initEngine(): Promise<void> {
  if (uiLoading || uiCanvas !== null) return
  uiLoading = true
  try {
    uiCanvas = await UiRuntime.create(engineCanvas, {
      onViewPointChange: handleInterpreterViewPointChange,
      onDisplayCenterChange: storeInterpreterDisplayPosition,
      onDisplayLongPress: () => displayHoverOutlinePane?.revealFlightControl(),
      virtualDisplay: {
        initial: "near",
        surfaceDisplay: false,
        centerMm: {x: 0, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM},
        farDistanceMm: 1200,
      },
    })
    displayHoverOutlinePane = new DisplayHoverOutlinePane({
      onBrowserFullscreenLayoutChange: handleBrowserFullscreenDisplayLayoutChange,
    })
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
    androidPane = new AndroidPane({
      title: "Android",
      draggable: true,
      resizable: true,
      onRefresh: () => connectAndroidRtc(),
      onTap: (x, y) => void sendAndroidTap(x, y),
      onSwipe: (swipe) => void sendAndroidSwipe(swipe),
      onOpenAccessibility: () => void sendAndroidOpenAccessibility(),
      onKey: (code) => void sendAndroidKey(code),
      onLaunchPackage: (packageName) => void sendAndroidLaunchPackage(packageName),
      onFrameRectPreview: previewAndroidHudRect,
      onFrameRectChange: storeAndroidHudRectAndRelayout,
      onFrameDockRequest: () => setAndroidHudDocked(true),
    })
    secondaryAndroidPane = new AndroidPane({
      title: "Android 2",
      draggable: true,
      resizable: true,
      onRefresh: () => connectSecondaryAndroidRtc(),
      onTap: (x, y) => void sendSecondaryAndroidTap(x, y),
      onSwipe: (swipe) => void sendSecondaryAndroidSwipe(swipe),
      onOpenAccessibility: () => void sendSecondaryAndroidOpenAccessibility(),
      onKey: (code) => void sendSecondaryAndroidKey(code),
      onLaunchPackage: (packageName) => void sendSecondaryAndroidLaunchPackage(packageName),
      onFrameRectPreview: previewSecondaryAndroidHudRect,
      onFrameRectChange: storeSecondaryAndroidHudRectAndRelayout,
      onFrameDockRequest: () => setSecondaryAndroidHudDocked(true),
    })
    voiceHudPane = new VoiceInputHud({
      onToggle: () => void toggleVoiceInput(),
      onMove: storeVoiceSettingsRectAndRelayout,
      settingsPresentation: "panel",
      onPulseFrame: () => hostTerminal?.codexComposer.requestRender(),
      onSettingsOpenChange: handleVoiceSettingsOpenChange,
      settings: () => ({
        title: t("voiceInput"),
        generalTabLabel: t("voiceGeneralSettings"),
        debugTabLabel: t("voiceDebugTab"),
        fullStopLabel: t("voiceFullStop"),
        fullStopHint: t("voiceFullStopHint"),
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
        autoSendLabel: t("voiceAutoSend"),
        autoSendHint: t("voiceAutoSendHint"),
        autoSendValue: readVoiceAutoSendEnabled(),
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
      onFullStop: fullyStopVoiceInput,
      onAddPhrase: addVoicePhrase,
      onRemovePhrase: removeVoicePhrase,
      onResetPhrases: resetVoicePhrases,
      onSignalVolumeChange: storeVoiceSignalVolume,
      onAutoSendChange: storeVoiceAutoSendEnabled,
      onDeactivationModeChange: storeVoiceDeactivationMode,
      onRecognitionTimeoutChange: storeVoiceRecognitionTimeoutSeconds,
      onPhraseFuzzyChange: storeVoiceFuzzyTolerance,
    })
    installEnginePanes()
    void loadTodoPane()
    uiCanvas.handleResize()
    syncModuleDisplays()
    displayHoverOutlinePane.refitBrowserFullscreenAfterReload()
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
  syncNetworkStatusRefresh()
}

function handleBrowserFullscreenDisplayLayoutChange(activeDisplayId: string | null): void {
  handleEngineResize()
  refitVoiceHudPlacement()
  const displayId = activeDisplayId ?? uiCanvas?.activeDisplayId ?? null
  setSpaceOverviewPinned(false)
  if (displayId !== null) {
    uiCanvas?.focusDisplay(displayId)
  }
  fullscreenDockPane?.requestRender()
  syncNetworkStatusRefresh()
}

function refitVoiceHudPlacement(): void {
  if (voiceHudPane === null) return
  uiCanvas?.clearSurfaceRect(voiceHudPane)
}

function installEnginePanes(): void {
  if (uiCanvas === null || displayHoverOutlinePane === null) return
  uiCanvas.addHudSurface(displayHoverOutlinePane, ({w, h}) => ({x: 0, y: 0, w, h}), {zIndex: HUD_LAYER_TOP})
  if (todoPane !== null) {
    uiCanvas.addHudSurface(todoPane, todoHudRect)
  }
  todoDockPane ??= new HostTerminalDockPane({
    key: "todo-dock-restore",
    label: "TODO",
    tooltip: "TODO.md",
    icon: uiIcons.apply,
    edge: currentTodoDockEdge,
    restore: () => setTodoHudDocked(false),
    moveTo: (point, bounds) => setTodoDockPlacement(todoDockPlacementFromPoint(point, bounds)),
  })
  uiCanvas.addHudSurface(todoDockPane, todoDockRect, {zIndex: HUD_LAYER_TOP})
  sqliteHudPane ??= new SqliteHudFramePane(
    () => activeSqliteController()?.label ?? "SQLite",
    () => activeSqliteController()?.path ?? "",
    () => setSqliteHudDocked(true),
  )
  uiCanvas.addHudSurface(sqliteHudPane, sqliteHudRect)
  for (const controller of sqliteDisplays.values()) installSqliteHudSurfaces(controller)
  const host = ensureHostTerminalController()
  uiCanvas.addHudSurface(host.hudTerminal, hostTerminalHudRect)
  uiCanvas.addHudSurface(host.codexComposer, hostCodexComposerRect, {zIndex: HUD_LAYER_TOP - 20})
  uiCanvas.addHudSurface(host.codexEditor, hostCodexEditorRect, {zIndex: HUD_LAYER_TOP - 19})
  if (host.socket === null) connectHostTerminal(host)
  installHostCodexComposerDragHandlers()
  const networkTerminal = ensureNetworkHostTerminalController()
  ensureNetworkDisplay()
  if (networkTerminal.socket === null) connectHostTerminal(networkTerminal)
  if (androidPane !== null) {
    uiCanvas.addHudSurface(androidPane, androidHudRect)
    connectAndroidRtc()
  }
  androidDockPane ??= new HostTerminalDockPane({
    key: "android-dock-restore",
    label: "Android",
    tooltip: "Android",
    icon: uiIcons.phone,
    edge: currentAndroidDockEdge,
    restore: () => setAndroidHudDocked(false),
    moveTo: (point, bounds) => setAndroidDockPlacement(androidDockPlacementFromPoint(point, bounds)),
  })
  uiCanvas.addHudSurface(androidDockPane, androidDockRect, {zIndex: HUD_LAYER_TOP})
  if (secondaryAndroidPane !== null) {
    uiCanvas.addHudSurface(secondaryAndroidPane, secondaryAndroidHudRect)
    connectSecondaryAndroidRtc()
  }
  secondaryAndroidDockPane ??= new HostTerminalDockPane({
    key: "android-secondary-dock-restore",
    label: "Android 2",
    tooltip: "Android 2",
    icon: uiIcons.phone,
    edge: currentSecondaryAndroidDockEdge,
    restore: () => setSecondaryAndroidHudDocked(false),
    moveTo: (point, bounds) => setSecondaryAndroidDockPlacement(secondaryAndroidDockPlacementFromPoint(point, bounds)),
  })
  uiCanvas.addHudSurface(secondaryAndroidDockPane, secondaryAndroidDockRect, {zIndex: HUD_LAYER_TOP})
  hostTerminalAgentSignalPane ??= new HostTerminalAgentSignalPane()
  uiCanvas.addHudSurface(hostTerminalAgentSignalPane, hostTerminalAgentSignalRect, {zIndex: HUD_LAYER_TOP})
  hostTerminalDockPane ??= new HostTerminalDockPane(() => setHostTerminalHudDocked(false))
  uiCanvas.addHudSurface(hostTerminalDockPane, hostTerminalDockRect, {zIndex: HUD_LAYER_TOP})
  fullscreenDockPane ??= new HostTerminalDockPane({
    key: "fullscreen-dock-toggle",
    label: "",
    tooltip: () => displayHoverOutlinePane?.browserFullscreenActive() === true ? "Выйти из полного экрана" : "Полный экран",
    icon: () => displayHoverOutlinePane?.browserFullscreenActive() === true ? uiIcons.collapse : uiIcons.expand,
    edge: currentFullscreenDockEdge,
    restore: () => toggleBrowserFullscreenDock(),
    moveTo: (point, bounds) => setFullscreenDockPlacement(fullscreenDockPlacementFromPoint(point, bounds)),
  })
  uiCanvas.addHudSurface(fullscreenDockPane, fullscreenDockRect, {zIndex: HUD_LAYER_TOP})
  sqliteDockPane ??= new HostTerminalDockPane({
    key: "sqlite-dock-restore",
    label: "SQLite",
    tooltip: () => activeSqliteController()?.label ?? "SQLite",
    icon: uiIcons.database,
    edge: currentSqliteDockEdge,
    restore: () => setSqliteHudDocked(false),
    moveTo: (point, bounds) => setSqliteDockPlacement(sqliteDockPlacementFromPoint(point, bounds)),
  })
  uiCanvas.addHudSurface(sqliteDockPane, sqliteDockRect, {zIndex: HUD_LAYER_TOP})
  if (voiceHudPane !== null) {
    uiCanvas.addHudSurface(voiceHudPane, voiceHudSurfaceRect, {zIndex: HUD_LAYER_TOP})
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

async function refreshAndroidFrame(): Promise<void> {
  if (androidPane === null) return
  if (androidFrameRefreshInFlight) return
  androidFrameRefreshInFlight = true
  androidPane.setStatus("running", "capturing")
  try {
    const sizeResponse = await fetch("/android/size", {cache: "no-store"})
    if (!sizeResponse.ok) throw new Error(await sizeResponse.text())
    const size = await sizeResponse.json() as {w?: unknown; h?: unknown; width?: unknown; height?: unknown}
    const width = androidDimension(size.w ?? size.width)
    const height = androidDimension(size.h ?? size.height)
    if (width === null || height === null) throw new Error("android size response is invalid")
    androidPane.setDeviceSize(width, height)
    const frameResponse = await fetch(`/android/screencap?t=${Date.now()}`, {cache: "no-store"})
    if (!frameResponse.ok) throw new Error(await frameResponse.text())
    const src = await blobToDataUrl(await frameResponse.blob())
    androidPane.setFrame({src, width, height, capturedAt: Date.now()})
    androidPane.setStatus("connected", `${width}x${height}`)
    scheduleAndroidFrameRefresh(ANDROID_FRAME_REFRESH_MS)
  } catch (error) {
    androidPane.setStatus("error", error instanceof Error ? error.message : String(error))
    scheduleAndroidFrameRefresh(2_000)
  } finally {
    androidFrameRefreshInFlight = false
  }
}

function scheduleAndroidFrameRefresh(delayMs: number): void {
  if (androidPane === null) return
  if (androidFrameRefreshTimer !== null) window.clearTimeout(androidFrameRefreshTimer)
  androidFrameRefreshTimer = window.setTimeout(() => {
    androidFrameRefreshTimer = null
    void refreshAndroidFrame()
  }, Math.max(0, delayMs))
}

function connectAndroidRtc(): void {
  if (androidPane === null) return
  if (androidRtcClient === null) {
    androidRtcClient = createAndroidRtcClient({
      frameSrc: ANDROID_RTC_FRAME_SRC,
      peerTarget: "primary",
      onFrame: (frame) => {
        androidPane?.setFrame(frame)
        if (Date.now() >= androidControlStatusUntil) androidPane?.setStatus("connected", `${frame.width}x${frame.height} rtc`)
      },
      onStatus: setAndroidRtcStatus,
    })
  }
  androidRtcClient.connect()
}

function setAndroidRtcStatus(kind: AndroidPaneStatusKind, label: string): void {
  androidPane?.setStatus(kind, label)
  if (/\b(ok|failed)\b/.test(label)) androidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
}

function connectSecondaryAndroidRtc(): void {
  if (secondaryAndroidPane === null) return
  if (secondaryAndroidRtcClient === null) {
    secondaryAndroidRtcClient = createAndroidRtcClient({
      frameSrc: SECONDARY_ANDROID_RTC_FRAME_SRC,
      peerTarget: "secondary",
      onFrame: (frame) => {
        secondaryAndroidPane?.setFrame(frame)
        if (Date.now() >= secondaryAndroidControlStatusUntil) {
          secondaryAndroidPane?.setStatus("connected", `${frame.width}x${frame.height} rtc`)
        }
      },
      onStatus: setSecondaryAndroidRtcStatus,
    })
  }
  secondaryAndroidRtcClient.connect()
}

function setSecondaryAndroidRtcStatus(kind: AndroidPaneStatusKind, label: string): void {
  secondaryAndroidPane?.setStatus(kind, label)
  if (/\b(ok|failed)\b/.test(label)) secondaryAndroidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
}

function connectRemoteDesktopRtc(): void {
  if (remoteDesktopPane === null) return
  postRemoteDesktopConnectStart()
  startRemoteDesktopSnapshotFallback()
  if (remoteDesktopRtcConnectInFlight) return
  if (remoteDesktopRtcClient === null) {
    remoteDesktopRtcConnectInFlight = true
    void createRemoteDesktopRtcClient().then((client) => {
      remoteDesktopRtcClient = client
      client.connect()
      primeRemoteDesktopAudio()
    }).catch((error) => {
      remoteDesktopPane?.setStatus("error", error instanceof Error ? `rtc ${error.message}` : "rtc unavailable")
    }).finally(() => {
      remoteDesktopRtcConnectInFlight = false
    })
    return
  }
  remoteDesktopRtcClient.connect()
  primeRemoteDesktopAudio()
}

function postRemoteDesktopConnectStart(): void {
  const now = Date.now()
  if (now - remoteDesktopLastConnectStartLogAt < REMOTE_DESKTOP_CONNECT_START_LOG_MS) return
  remoteDesktopLastConnectStartLogAt = now
  postInterpreterClientEvent("remote-desktop", "connect-start", {
    path: window.location.pathname,
    protocol: window.location.protocol,
    host: window.location.host,
    embeddedPrefix: currentEmbeddedInterpreterPathPrefix() ?? "",
  })
}

type RemoteDesktopRtcResolvedConfig = {
  signalUrls: string[]
  iceServers: RTCIceServer[] | null
}

async function createRemoteDesktopRtcClient(): Promise<AndroidRtcClient> {
  const rtcConfig = await resolveRemoteDesktopRtcConfig()
  const {signalUrls, iceServers} = rtcConfig
  postInterpreterClientEvent("remote-desktop", "signal-urls", {
    count: signalUrls.length,
    urls: signalUrls,
    iceServers: iceServersForDiagnostics(iceServers ?? RTC_ICE_SERVERS),
  })
  return createAndroidRtcClient({
    room: "remote-desktop",
    peerId: `interpreter-desktop-${remoteDesktopRandomToken()}`,
    senderPeerId: "electron-desktop",
    peerTarget: "any",
    ...(signalUrls[0] === undefined ? {} : {signalUrl: signalUrls[0]}),
    signalUrls,
    ...(iceServers === null ? {} : {iceServers}),
    capabilities: ["remote-desktop", "interpreter"],
    frameSrc: REMOTE_DESKTOP_RTC_FRAME_SRC,
    minFrameIntervalMs: 16,
    // Chrome-native desktop capture can legitimately be mostly dark. The
    // Electron black-frame guard is useful for sender diagnostics, but here it
    // hides valid server-desktop frames and keeps the UI stuck on snapshot
    // fallback.
    ignoreBlackFrames: false,
    receiveAudio: true,
    onFrame: (frame) => {
      if (!isValidRemoteDesktopFrame(frame)) return
      if (!REMOTE_DESKTOP_RTC_VIDEO_DISPLAY_ENABLED) return
      if (Date.now() < remoteDesktopRtcSuppressUntil) return
      remoteDesktopLastRtcFrameAt = Date.now()
      remoteDesktopPane?.setFrame(frame)
      remoteDesktopPane?.setStatus("connected", `${frame.width}x${frame.height} rtc`)
    },
    onAudio: connectRemoteDesktopAudio,
    onStatus: setRemoteDesktopRtcStatus,
    onDiagnostic: (label, detail) => postInterpreterClientEvent("remote-desktop", `rtc-${label}`, detail),
  })
}

function setRemoteDesktopRtcStatus(kind: AndroidPaneStatusKind, label: string): void {
  if (label === "rtc black frame") {
    remoteDesktopLastRtcFrameAt = 0
    remoteDesktopRtcSuppressUntil = Date.now() + REMOTE_DESKTOP_RTC_BLACK_SUPPRESS_MS
    scheduleRemoteDesktopSnapshotFallback(0)
  }
  remoteDesktopPane?.setStatus(kind, label)
  const key = `${kind}:${label}`
  if (remoteDesktopLastRtcStatusLog === key) return
  remoteDesktopLastRtcStatusLog = key
  postInterpreterClientEvent("remote-desktop", "rtc-status", {kind, label})
}

function sendRemoteDesktopControl(command: RtcControlCommand): boolean {
  connectRemoteDesktopRtc()
  primeRemoteDesktopAudio()
  const rtcControlOpen = remoteDesktopRtcClient?.peers().some((peer) => peer.channelState === "open") === true
  if (rtcControlOpen && remoteDesktopRtcClient?.send(command) === true) {
    remoteDesktopPane?.setStatus("connected", "rtc command")
    return true
  }
  remoteDesktopPane?.setStatus("running", "desktop command")
  void postRemoteDesktopControl(command)
  return true
}

async function postRemoteDesktopControl(command: RtcControlCommand): Promise<void> {
  let lastError = "desktop input unavailable"
  for (const path of remoteDesktopApiPaths("/input")) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(command),
      })
      if (response.ok) {
        remoteDesktopPane?.setStatus("connected", "desktop command")
        scheduleRemoteDesktopSnapshotFallback(120)
        return
      }
      lastError = `${path} ${response.status}: ${await responseErrorText(response)}`
    } catch (error) {
      lastError = error instanceof Error ? `${path} ${error.message}` : `${path} unavailable`
    }
  }
  remoteDesktopPane?.setStatus("error", `input ${lastError}`)
}

function startRemoteDesktopSnapshotFallback(): void {
  if (remoteDesktopSnapshotTimer !== null) return
  scheduleRemoteDesktopSnapshotFallback(0)
}

function scheduleRemoteDesktopSnapshotFallback(delayMs: number): void {
  if (remoteDesktopPane === null) return
  if (remoteDesktopSnapshotTimer !== null) window.clearTimeout(remoteDesktopSnapshotTimer)
  remoteDesktopSnapshotTimer = window.setTimeout(() => {
    remoteDesktopSnapshotTimer = null
    void refreshRemoteDesktopSnapshotFallback()
  }, Math.max(0, delayMs))
}

async function refreshRemoteDesktopSnapshotFallback(): Promise<void> {
  if (remoteDesktopPane === null) return
  if (REMOTE_DESKTOP_RTC_VIDEO_DISPLAY_ENABLED && Date.now() - remoteDesktopLastRtcFrameAt < REMOTE_DESKTOP_RTC_FRAME_GRACE_MS) {
    scheduleRemoteDesktopSnapshotFallback(REMOTE_DESKTOP_SNAPSHOT_POLL_MS)
    return
  }
  if (remoteDesktopSnapshotInFlight) {
    scheduleRemoteDesktopSnapshotFallback(REMOTE_DESKTOP_SNAPSHOT_POLL_MS)
    return
  }
  remoteDesktopSnapshotInFlight = true
  try {
    const response = await fetchRemoteDesktopSnapshot()
    const blob = await response.blob()
    const bitmap = await decodeRemoteDesktopBitmap(blob)
    const width = bitmap.width
    const height = bitmap.height
    if (width <= 0 || height <= 0) throw new Error(`invalid desktop frame ${width}x${height}`)
    const src = nextRemoteDesktopSnapshotFrameSrc()
    TextureLoader.replaceBitmap(src, bitmap)
    remoteDesktopRtcSuppressUntil = Math.max(remoteDesktopRtcSuppressUntil, Date.now() + REMOTE_DESKTOP_SNAPSHOT_POLL_MS)
    remoteDesktopPane.setFrame({
      src,
      width,
      height,
      capturedAt: Date.now(),
    })
    remoteDesktopPane.setStatus("connected", `${width}x${height} desktop`)
    scheduleRemoteDesktopSnapshotFallback(REMOTE_DESKTOP_SNAPSHOT_POLL_MS)
  } catch (error) {
    remoteDesktopSnapshotPath = null
    remoteDesktopPane?.setStatus("error", error instanceof Error ? `desktop ${error.message}` : "desktop unavailable")
    scheduleRemoteDesktopSnapshotFallback(REMOTE_DESKTOP_SNAPSHOT_ERROR_POLL_MS)
  } finally {
    remoteDesktopSnapshotInFlight = false
  }
}

async function decodeRemoteDesktopBitmap(blob: Blob): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(blob)
  if (bitmap.width > 0 && bitmap.height > 0) return bitmap
  bitmap.close?.()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = "async"
    image.src = objectUrl
    await image.decode()
    const fallback = await createImageBitmap(image)
    if (fallback.width <= 0 || fallback.height <= 0) throw new Error(`decoded ${fallback.width}x${fallback.height}`)
    return fallback
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function nextRemoteDesktopSnapshotFrameSrc(): string {
  const currentSrc = remoteDesktopPane?.frameSnapshot()?.src ?? null
  for (let attempt = 0; attempt < REMOTE_DESKTOP_SNAPSHOT_FRAME_SLOTS; attempt += 1) {
    remoteDesktopSnapshotFrameSlot = (remoteDesktopSnapshotFrameSlot + 1) % REMOTE_DESKTOP_SNAPSHOT_FRAME_SLOTS
    const src = `${REMOTE_DESKTOP_SNAPSHOT_FRAME_SRC}:${remoteDesktopSnapshotFrameSlot}`
    if (src !== currentSrc) return src
  }
  return `${REMOTE_DESKTOP_SNAPSHOT_FRAME_SRC}:${remoteDesktopSnapshotFrameSlot}`
}

function isValidRemoteDesktopFrame(frame: AndroidRtcFrame): boolean {
  return frame.width > 0 && frame.height > 0
}

function remoteDesktopRandomToken(): string {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function fetchRemoteDesktopSnapshot(): Promise<Response> {
  let lastError = "desktop snapshot unavailable"
  for (const path of remoteDesktopApiPaths("/snapshot")) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), REMOTE_DESKTOP_SNAPSHOT_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(`${path}?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
      if (response.ok && contentType.startsWith("image/")) {
        remoteDesktopSnapshotPath = path
        return response
      }
      lastError = response.ok
        ? `${path} ${contentType.length > 0 ? contentType : "non-image response"}`
        : `${path} ${response.status}: ${await responseErrorText(response)}`
    } catch (error) {
      lastError = error instanceof Error ? `${path} ${error.message}` : `${path} unavailable`
    } finally {
      window.clearTimeout(timer)
    }
  }
  throw new Error(lastError)
}

async function responseErrorText(response: Response): Promise<string> {
  const text = await response.text().catch(() => response.statusText)
  const compact = text.replace(/\s+/g, " ").trim()
  return compact.length > 0 ? compact.slice(0, 180) : response.statusText
}

function interpreterRtcSignalUrl(path = remoteDesktopRtcSignalPath()): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${path}`
}

function interpreterWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${interpreterHttpPath(path)}`
}

function interpreterHttpPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`
  const prefix = currentEmbeddedInterpreterPathPrefix()
  return prefix === null ? suffix : `${prefix}${suffix}`
}

function postInterpreterClientEvent(scope: string, label: string, detail: Record<string, unknown> = {}): void {
  const body = JSON.stringify({scope, label, detail})
  void fetch(interpreterHttpPath("/client-event"), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body,
    keepalive: body.length < 60_000,
  }).catch(() => undefined)
}

async function resolveRemoteDesktopRtcConfig(): Promise<RemoteDesktopRtcResolvedConfig> {
  const candidates: string[] = []
  let iceServers: RTCIceServer[] | null = null
  for (const path of remoteDesktopApiPaths("/rtc/state")) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 1_500)
    try {
      const response = await fetch(`${path}?t=${Date.now()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
      if (!response.ok) continue
      const payload = await response.json()
      const signalUrl = remoteDesktopSignalUrlFromState(payload)
      if (signalUrl !== null) candidates.push(...remoteDesktopSignalUrlCandidates(signalUrl))
      iceServers ??= remoteDesktopIceServersFromState(payload)
    } catch {
      // Fall through to the same-origin default below.
    } finally {
      window.clearTimeout(timer)
    }
  }
  candidates.push(...remoteDesktopSignalUrlCandidates(null))
  return {signalUrls: uniqueStrings(candidates), iceServers}
}

function remoteDesktopSignalUrlFromState(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const remoteDesktop = (value as {remoteDesktop?: unknown}).remoteDesktop
  if (typeof remoteDesktop !== "object" || remoteDesktop === null || Array.isArray(remoteDesktop)) return null
  const signalUrl = (remoteDesktop as {signalUrl?: unknown}).signalUrl
  return typeof signalUrl === "string" && signalUrl.trim().length > 0 ? signalUrl.trim() : null
}

function remoteDesktopIceServersFromState(value: unknown): RTCIceServer[] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const remoteDesktop = (value as {remoteDesktop?: unknown}).remoteDesktop
  if (typeof remoteDesktop !== "object" || remoteDesktop === null || Array.isArray(remoteDesktop)) return null
  const iceServers = (remoteDesktop as {iceServers?: unknown}).iceServers
  const parsed = normalizeRtcIceServers(iceServers)
  return parsed.length === 0 ? null : parsed
}

function normalizeRtcIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return []
  return value.map(normalizeRtcIceServer).filter((server): server is RTCIceServer => server !== null)
}

function normalizeRtcIceServer(value: unknown): RTCIceServer | null {
  if (typeof value === "string" && value.trim().length > 0) return {urls: value.trim()}
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const raw = value as {urls?: unknown; username?: unknown; credential?: unknown; credentialType?: unknown}
  const urls = normalizeRtcIceServerUrls(raw.urls)
  if (urls.length === 0) return null
  return {
    urls: urls.length === 1 ? urls[0]! : urls,
    ...(typeof raw.username === "string" ? {username: raw.username} : {}),
    ...(typeof raw.credential === "string" ? {credential: raw.credential} : {}),
    ...(raw.credentialType === "password" || raw.credentialType === "oauth" ? {credentialType: raw.credentialType} : {}),
  }
}

function normalizeRtcIceServerUrls(value: unknown): string[] {
  if (typeof value === "string") return value.trim().length > 0 ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function iceServersForDiagnostics(servers: RTCIceServer[]): string[] {
  return servers.flatMap((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls
    return urls.map((url) => {
      const compact = url.replace(/\/\/[^:@/]+:[^@/]+@/, "//***:***@")
      return compact.length > 160 ? compact.slice(0, 160) : compact
    })
  })
}

function normalizeRemoteDesktopSignalUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, window.location.href)
    if (window.location.protocol === "https:" && url.protocol === "ws:") {
      const sameOrigin = new URL(window.location.href)
      sameOrigin.protocol = "wss:"
      sameOrigin.pathname = url.pathname === "/webrtc/signaling"
        ? remoteDesktopRtcSignalPath()
        : url.pathname
      sameOrigin.search = url.search
      sameOrigin.hash = ""
      return sameOrigin.toString()
    }
    return url.toString()
  } catch {
    return interpreterRtcSignalUrl()
  }
}

function remoteDesktopSignalUrlCandidates(rawUrl: string | null): string[] {
  const candidates: string[] = []
  if (rawUrl !== null) candidates.push(normalizeRemoteDesktopSignalUrl(rawUrl))
  for (const prefix of embeddedInterpreterPathPrefixes()) {
    candidates.push(interpreterRtcSignalUrl(`${prefix}/webrtc/signaling`))
  }
  candidates.push(interpreterRtcSignalUrl("/webrtc/signaling"))
  if (rawUrl !== null && window.location.protocol !== "https:") candidates.push(rawUrl)
  return candidates
}

function remoteDesktopApiPaths(path: string): string[] {
  const suffix = path.startsWith("/") ? path : `/${path}`
  const direct = `/remote-desktop${suffix}`
  const embedded = `/hud/interpreter/remote-desktop${suffix}`
  const preferred = remoteDesktopSnapshotPath === null
    ? []
    : [remoteDesktopSnapshotPath.replace(/\/snapshot$/, suffix)]
  const candidates = isEmbeddedInterpreterOrigin()
    ? [embedded, direct]
    : [direct, embedded]
  return uniqueStrings([...preferred, ...candidates])
}

function remoteDesktopRtcSignalPath(): string {
  return `${embeddedInterpreterPathPrefixes()[0] ?? "/hud/interpreter"}/webrtc/signaling`
}

function isEmbeddedInterpreterOrigin(): boolean {
  return currentEmbeddedInterpreterPathPrefix() !== null
}

function embeddedInterpreterPathPrefix(): string | null {
  return currentEmbeddedInterpreterPathPrefix()
}

function embeddedInterpreterPathPrefixes(): string[] {
  const prefix = currentEmbeddedInterpreterPathPrefix()
  if (prefix === "/hud/interpreter") return ["/hud/interpreter", "/interp"]
  if (prefix === "/interp") return ["/interp", "/hud/interpreter"]
  return ["/hud/interpreter", "/interp"]
}

function currentEmbeddedInterpreterPathPrefix(): string | null {
  const path = window.location.pathname
  if (path === "/hud/interpreter" || path.startsWith("/hud/interpreter/")) return "/hud/interpreter"
  if (path === "/interp" || path.startsWith("/interp/")) return "/interp"
  return null
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function connectRemoteDesktopAudio(audio: AndroidRtcAudioStream | null): void {
  disconnectRemoteDesktopAudioSource()
  if (audio === null) {
    remoteDesktopPane?.setAudioStatus("audio idle")
    return
  }

  const audioTracks = audio.stream.getAudioTracks()
  if (audioTracks.length === 0) {
    remoteDesktopPane?.setAudioStatus("audio no tracks")
    return
  }

  const stream = new MediaStream(audioTracks)
  const element = document.createElement("audio")
  element.autoplay = true
  element.controls = false
  element.muted = true
  element.preload = "auto"
  element.srcObject = stream
  element.volume = remoteDesktopHtmlAudioElementVolume()
  element.setAttribute("playsinline", "true")
  element.style.display = "none"
  element.addEventListener("playing", () => {
    postInterpreterClientEvent("remote-desktop", "audio-playing", {
      muted: element.muted,
      paused: element.paused,
      volume: element.volume,
      contextState: remoteDesktopAudioContext?.state ?? null,
      playbackMode: remoteDesktopAudioPlaybackMode(),
    })
  }, {once: true})
  element.addEventListener("error", () => {
    postInterpreterClientEvent("remote-desktop", "audio-element-error", {
      error: element.error?.message ?? "audio element error",
      code: element.error?.code ?? null,
      contextState: remoteDesktopAudioContext?.state ?? null,
    })
  })
  document.body.appendChild(element)

  remoteDesktopAudioStream = stream
  remoteDesktopAudioElement = element

  const context = ensureRemoteDesktopAudioContext()
  if (context !== null) {
    try {
      const source = context.createMediaElementSource(element)
      const panner = context.createPanner()
      const gain = context.createGain()
      panner.panningModel = "HRTF"
      panner.distanceModel = "inverse"
      panner.refDistance = 4
      panner.maxDistance = 32
      panner.rolloffFactor = 0.16
      gain.gain.value = 1
      setAudioParamPosition(panner, 0, 0, -1)
      source.connect(panner)
      panner.connect(gain)
      gain.connect(context.destination)
      remoteDesktopAudioSource = source
      remoteDesktopAudioPanner = panner
      remoteDesktopAudioGain = gain
      updateRemoteDesktopAudioPosition(remoteDesktopAudioLastCenter)
      context.onstatechange = () => {
        syncRemoteDesktopAudioElementMute()
        primeRemoteDesktopAudio()
      }
    } catch (error) {
      postInterpreterClientEvent("remote-desktop", "audio-webaudio-error", {
        error: error instanceof Error ? error.message : String(error),
        contextState: context.state,
      })
    }
  }
  syncRemoteDesktopAudioElementMute()
  playRemoteDesktopAudioElement()
  postInterpreterClientEvent("remote-desktop", "audio-track", {
    trackCount: audio.trackCount,
    contextState: context?.state ?? null,
    htmlMuted: element.muted,
    htmlPaused: element.paused,
    htmlVolume: element.volume,
    playbackMode: remoteDesktopAudioPlaybackMode(),
  })
  remoteDesktopPane?.setAudioStatus(`${audio.trackCount} audio ${context?.state ?? "html"}`)
  primeRemoteDesktopAudio()
}

function disconnectRemoteDesktopAudioSource(): void {
  if (remoteDesktopAudioElement !== null) {
    remoteDesktopAudioElement.pause()
    remoteDesktopAudioElement.srcObject = null
    remoteDesktopAudioElement.remove()
  }
  remoteDesktopAudioSource?.disconnect()
  remoteDesktopAudioPanner?.disconnect()
  remoteDesktopAudioGain?.disconnect()
  remoteDesktopAudioStream = null
  remoteDesktopAudioElement = null
  remoteDesktopAudioSource = null
  remoteDesktopAudioPanner = null
  remoteDesktopAudioGain = null
}

function ensureRemoteDesktopAudioContext(): AudioContext | null {
  if (remoteDesktopAudioContext !== null) return remoteDesktopAudioContext
  try {
    remoteDesktopAudioContext = new AudioContext()
    setRemoteDesktopAudioListener(remoteDesktopAudioContext)
    return remoteDesktopAudioContext
  } catch {
    return null
  }
}

function primeRemoteDesktopAudio(): void {
  const context = ensureRemoteDesktopAudioContext()
  playRemoteDesktopAudioElement()
  if (context === null) return
  if (context.state === "running") {
    markRemoteDesktopAudioUnlocked("context-running")
    syncRemoteDesktopAudioElementMute()
    return
  }
  void context.resume()
    .then(() => {
      if (context.state === "running") markRemoteDesktopAudioUnlocked("context-resume")
      syncRemoteDesktopAudioElementMute()
      playRemoteDesktopAudioElement()
      remoteDesktopPane?.setAudioStatus(remoteDesktopAudioStream === null ? "audio ready" : `audio ${context.state}`)
    })
    .catch(() => {
      syncRemoteDesktopAudioElementMute()
      playRemoteDesktopAudioElement()
      remoteDesktopPane?.setAudioStatus("audio blocked")
    })
}

function playRemoteDesktopAudioElement(): void {
  const element = remoteDesktopAudioElement
  if (element === null) return
  element.muted = shouldMuteRemoteDesktopHtmlAudioElement()
  element.volume = remoteDesktopHtmlAudioElementVolume()
  if (!element.paused) {
    remoteDesktopPane?.setAudioStatus(remoteDesktopAudioStream === null ? "audio ready" : "audio html playing")
    return
  }
  void element.play()
    .then(() => {
      postInterpreterClientEvent("remote-desktop", "audio-play", {
        muted: element.muted,
        paused: element.paused,
        contextState: remoteDesktopAudioContext?.state ?? null,
        playbackMode: remoteDesktopAudioPlaybackMode(),
      })
      remoteDesktopPane?.setAudioStatus(remoteDesktopAudioStream === null ? "audio ready" : `audio html ${element.muted ? "muted" : "playing"}`)
    })
    .catch((error) => {
      postInterpreterClientEvent("remote-desktop", "audio-play-blocked", {
        error: error instanceof Error ? error.message : String(error),
        contextState: remoteDesktopAudioContext?.state ?? null,
      })
      remoteDesktopPane?.setAudioStatus("audio click to play")
    })
}

function syncRemoteDesktopAudioElementMute(): void {
  if (remoteDesktopAudioElement === null) return
  remoteDesktopAudioElement.muted = shouldMuteRemoteDesktopHtmlAudioElement()
  remoteDesktopAudioElement.volume = remoteDesktopHtmlAudioElementVolume()
}

function shouldMuteRemoteDesktopHtmlAudioElement(): boolean {
  return !remoteDesktopAudioUnlocked
}

function remoteDesktopHtmlAudioElementVolume(): number {
  if (!remoteDesktopAudioUnlocked) return 0
  return 1
}

function remoteDesktopAudioPlaybackMode(): string {
  if (!remoteDesktopAudioUnlocked) return "locked"
  if (remoteDesktopAudioSource !== null && remoteDesktopAudioContext?.state === "running") return "webaudio-spatial"
  return "html-fallback"
}

function markRemoteDesktopAudioUnlocked(reason: string): void {
  if (remoteDesktopAudioUnlocked) return
  remoteDesktopAudioUnlocked = true
  postInterpreterClientEvent("remote-desktop", "audio-unlocked", {
    reason,
    contextState: remoteDesktopAudioContext?.state ?? null,
    hasElement: remoteDesktopAudioElement !== null,
  })
}

function setRemoteDesktopAudioListener(context: AudioContext): void {
  const listener = context.listener as AudioListener & {
    forwardX?: AudioParam
    forwardY?: AudioParam
    forwardZ?: AudioParam
    positionX?: AudioParam
    positionY?: AudioParam
    positionZ?: AudioParam
    setOrientation?: (x: number, y: number, z: number, xUp: number, yUp: number, zUp: number) => void
    setPosition?: (x: number, y: number, z: number) => void
    upX?: AudioParam
    upY?: AudioParam
    upZ?: AudioParam
  }
  setAudioParamPosition(listener, 0, 0, 0)
  if (listener.forwardX !== undefined && listener.forwardY !== undefined && listener.forwardZ !== undefined) {
    listener.forwardX.value = 0
    listener.forwardY.value = 0
    listener.forwardZ.value = -1
  }
  if (listener.upX !== undefined && listener.upY !== undefined && listener.upZ !== undefined) {
    listener.upX.value = 0
    listener.upY.value = 1
    listener.upZ.value = 0
  } else if (typeof listener.setOrientation === "function") {
    listener.setOrientation(0, 0, -1, 0, 1, 0)
  }
}

function updateRemoteDesktopAudioPosition(center: UiRuntimeViewPointVector | null): void {
  remoteDesktopAudioLastCenter = center
  if (center === null || remoteDesktopAudioPanner === null) return
  const x = clampNumber(center.x / 1600, -3, 3)
  const y = clampNumber((center.z - MODULE_DISPLAY_CENTER_Z_MM) / 1600, -1.5, 1.5)
  const z = -clampNumber(Math.abs(center.y - MODULE_DISPLAY_CENTER_Y_MM) / 1800 + 1, 0.75, 6)
  setAudioParamPosition(remoteDesktopAudioPanner, x, y, z)
}

function setAudioParamPosition(target: PannerNode | AudioListener, x: number, y: number, z: number): void {
  const positioned = target as (PannerNode | AudioListener) & {
    positionX?: AudioParam
    positionY?: AudioParam
    positionZ?: AudioParam
    setPosition?: (x: number, y: number, z: number) => void
  }
  if (positioned.positionX !== undefined && positioned.positionY !== undefined && positioned.positionZ !== undefined) {
    positioned.positionX.value = x
    positioned.positionY.value = y
    positioned.positionZ.value = z
    return
  }
  if (typeof positioned.setPosition === "function") positioned.setPosition(x, y, z)
}

async function sendAndroidTap(x: number, y: number): Promise<void> {
  await sendAndroidControlOrFallback({type: "tap", x, y}, "/android/tap", {x, y})
}

async function sendAndroidSwipe(swipe: AndroidPaneSwipe): Promise<void> {
  await sendAndroidControlOrFallback({type: "swipe", ...swipe}, "/android/swipe", swipe)
}

async function sendAndroidOpenAccessibility(): Promise<void> {
  sendAndroidControl({type: "open-accessibility"})
}

async function sendAndroidKey(code: string): Promise<void> {
  await sendAndroidControlOrFallback({type: "key", code}, "/android/key", {code})
}

async function sendAndroidLaunchPackage(packageName: string): Promise<void> {
  await sendAndroidControlOrFallback({type: "launch", packageName}, "/android/key", {code: "KEYCODE_HOME"})
}

function sendAndroidControlCommand(params: unknown): unknown {
  const command = androidControlCommandFromParams(params)
  if (!sendAndroidControl(command)) throw new Error("android rtc control channel is not open")
  return {
    sent: true,
    command,
    android: hudAndroidPayload(),
  }
}

async function sendSecondaryAndroidTap(x: number, y: number): Promise<void> {
  sendSecondaryAndroidControl({type: "tap", x, y})
}

async function sendSecondaryAndroidSwipe(swipe: AndroidPaneSwipe): Promise<void> {
  sendSecondaryAndroidControl({type: "swipe", ...swipe})
}

async function sendSecondaryAndroidOpenAccessibility(): Promise<void> {
  sendSecondaryAndroidControl({type: "open-accessibility"})
}

async function sendSecondaryAndroidKey(code: string): Promise<void> {
  sendSecondaryAndroidControl({type: "key", code})
}

async function sendSecondaryAndroidLaunchPackage(packageName: string): Promise<void> {
  sendSecondaryAndroidControl({type: "launch", packageName})
}

function sendSecondaryAndroidControlCommand(params: unknown): unknown {
  const command = androidControlCommandFromParams(params)
  if (sendSecondaryAndroidControl(command) !== true) throw new Error("secondary android rtc control channel is not open")
  return {
    sent: true,
    command,
    android: secondaryHudAndroidPayload(),
  }
}

function sendSecondaryAndroidControl(command: AndroidRtcCommand): boolean {
  connectSecondaryAndroidRtc()
  if (secondaryAndroidRtcClient?.send(withAndroidFrameSize(command, secondaryAndroidPane)) !== true) {
    secondaryAndroidPane?.setStatus("error", "rtc control closed")
    return false
  }
  secondaryAndroidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
  secondaryAndroidPane?.setStatus("connected", "rtc command")
  return true
}

function sendAndroidControl(command: AndroidRtcCommand): boolean {
  connectAndroidRtc()
  if (androidRtcClient?.send(withAndroidFrameSize(command, androidPane)) !== true) {
    androidPane?.setStatus("error", "rtc control closed")
    return false
  }
  androidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
  androidPane?.setStatus("connected", "rtc command")
  return true
}

async function sendAndroidControlOrFallback(command: AndroidRtcCommand, fallbackPath: string, fallbackBody: Record<string, unknown>): Promise<void> {
  if (androidRtcClient?.send(withAndroidFrameSize(command, androidPane)) === true) {
    androidControlStatusUntil = Date.now() + ANDROID_CONTROL_STATUS_HOLD_MS
    androidPane?.setStatus("connected", "rtc command")
    return
  }
  await postAndroidCommand(fallbackPath, fallbackBody)
}

async function postAndroidCommand(path: string, body: Record<string, unknown>): Promise<void> {
  if (androidPane === null) return
  androidPane.setStatus("running", "command")
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    androidPane.setStatus("connected", "command sent")
    scheduleAndroidFrameRefresh(120)
  } catch (error) {
    androidPane.setStatus("error", error instanceof Error ? error.message : String(error))
    scheduleAndroidFrameRefresh(1_500)
  }
}

function withAndroidFrameSize(command: AndroidRtcCommand, pane: AndroidPane | null): AndroidRtcCommand {
  if (command.type !== "tap" && command.type !== "swipe") return command
  if (command.frameW !== undefined && command.frameH !== undefined) return command
  const frame = pane?.frameSnapshot() ?? null
  if (frame === null) return command
  return {...command, frameW: frame.width, frameH: frame.height}
}

function androidControlCommandFromParams(params: unknown): AndroidRtcCommand {
  if (typeof params !== "object" || params === null || Array.isArray(params)) throw new Error("android control command must be an object")
  const record = params as Record<string, unknown>
  const type = record.type
  if (type === "tap") {
    return withAndroidCommandFrameSize(record, {
      type,
      x: requiredFiniteNumber(record.x, "x"),
      y: requiredFiniteNumber(record.y, "y"),
    })
  }
  if (type === "swipe") {
    const command: AndroidRtcCommand = {
      type,
      x1: requiredFiniteNumber(record.x1, "x1"),
      y1: requiredFiniteNumber(record.y1, "y1"),
      x2: requiredFiniteNumber(record.x2, "x2"),
      y2: requiredFiniteNumber(record.y2, "y2"),
    }
    if (record.durationMs !== undefined) command.durationMs = requiredFiniteNumber(record.durationMs, "durationMs")
    return withAndroidCommandFrameSize(record, command)
  }
  if (type === "key") {
    const code = record.code
    if (typeof code !== "string" || code.length === 0) throw new Error("android key command requires code")
    return {type, code}
  }
  if (type === "launch") {
    const packageName = record.packageName
    if (typeof packageName !== "string" || packageName.length === 0) throw new Error("android launch command requires packageName")
    return {type, packageName}
  }
  if (type === "open-accessibility") return {type}
  throw new Error("unsupported android control command")
}

function withAndroidCommandFrameSize<T extends Extract<AndroidRtcCommand, {type: "tap" | "swipe"}>>(
  record: Record<string, unknown>,
  command: T,
): T {
  if (record.frameW === undefined && record.frameH === undefined) return command
  return {
    ...command,
    frameW: requiredFiniteNumber(record.frameW, "frameW"),
    frameH: requiredFiniteNumber(record.frameH, "frameH"),
  }
}

function requiredFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`android control command requires numeric ${name}`)
  return value
}

function androidDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("android frame is not a data URL"))
    })
    reader.addEventListener("error", () => reject(reader.error ?? new Error("android frame read failed")))
    reader.readAsDataURL(blob)
  })
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
    hostTerminal.title = hostTerminalTitle()
    for (const pane of hostTerminalPanes(hostTerminal)) {
      pane.setTitle(hostTerminal.title)
      pane.requestRender()
    }
  }
  if (networkHostTerminal !== null) {
    for (const pane of hostTerminalPanes(networkHostTerminal)) {
      pane.setTitle(networkHostTerminal.title)
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
    super({bgColor: HUD_PANEL_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "WorkspaceFilesChromePane"
  }

  protected render(): void {}
}

class SqliteTablePane extends UiSurface {
  #payload: SqliteDatabasePayload | null = null
  #status = "Open SQLite database"
  #selectedRowIds: string[] = []
  #selectionAnchorRowId: string | null = null
  #editSession: SqliteCellEditSession | null = null
  #editInput: TextFieldEditState = {value: "", cursor: 0, selectionAnchor: null}
  readonly #onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void
  readonly #onSelectionChange: () => void

  constructor(onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void, onSelectionChange: () => void) {
    super({bgColor: HUD_CODE_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "SqliteTablePane"
    this.#onCellEdit = onCellEdit
    this.#onSelectionChange = onSelectionChange
  }

  setPayload(payload: SqliteDatabasePayload): void {
    const tableChanged = this.#payload?.path !== payload.path || this.#payload.selectedTable !== payload.selectedTable
    this.#payload = payload
    this.#status = payload.selectedTable === null ? "No tables" : `${payload.selectedTable} · ${payload.rows.length} rows`
    const selectionChanged = tableChanged ? this.#clearSelectionState() : this.#normalizeSelectionState()
    if (tableChanged) {
      tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
      this.#closeEdit({blur: false})
    }
    if (selectionChanged) this.#onSelectionChange()
    this.requestRender()
  }

  setStatus(status: string): void {
    this.#status = status
    this.requestRender()
  }

  clearPayload(status: string): void {
    this.#payload = null
    this.#status = status
    const selectionChanged = this.#clearSelectionState()
    tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
    this.#closeEdit({blur: false})
    if (selectionChanged) this.#onSelectionChange()
    this.requestRender()
  }

  selectedRowIds(): readonly string[] {
    return [...this.#selectedRowIds]
  }

  contextSnapshot(limit = SQLITE_CONTEXT_SELECTED_ROW_LIMIT): SqliteRowSelectionContext {
    const payload = this.#payload
    if (payload === null) {
      return {
        selectedRowIds: [],
        selectedRowCount: 0,
        selectedRows: [],
        selectionTruncated: false,
      }
    }
    const selected = new Set(this.#selectedRowIds)
    const selectedRows: SqliteSelectedRowContext[] = []
    for (let rowIndex = 0; rowIndex < payload.rows.length; rowIndex += 1) {
      const row = payload.rows[rowIndex]!
      const rowId = sqliteRowSelectionId(row, rowIndex)
      if (!selected.has(rowId)) continue
      if (selectedRows.length < limit) {
        selectedRows.push({
          rowId,
          rowIndex,
          rowid: sqliteRowId(row["__rowid"]),
          values: {...row},
        })
      }
    }
    return {
      selectedRowIds: [...this.#selectedRowIds],
      selectedRowCount: this.#selectedRowIds.length,
      selectedRows,
      selectionTruncated: selectedRows.length < this.#selectedRowIds.length,
    }
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
    const status = this.#statusLabel()
    this.drawText(status, pad, 34, {
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
    Table(this, pad, tableY, Math.max(1, this.rectW - pad * 2), tableH, {
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
    if (this.#editSession !== null) this.#renderEditOverlay()
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
    this.#onSelectionChange()
    this.requestRender()
  }

  #normalizeSelectionState(): boolean {
    const payload = this.#payload
    const rowIds = payload === null ? [] : sqlitePayloadRowIds(payload)
    const next = normalizeTableSelection(rowIds, this.#selectedRowIds).map(String)
    const nextAnchor = this.#selectionAnchorRowId !== null && next.includes(this.#selectionAnchorRowId)
      ? this.#selectionAnchorRowId
      : next[0] ?? null
    if (sameStringArray(next, this.#selectedRowIds) && nextAnchor === this.#selectionAnchorRowId) return false
    this.#selectedRowIds = next
    this.#selectionAnchorRowId = nextAnchor
    return true
  }

  #clearSelectionState(): boolean {
    if (this.#selectedRowIds.length === 0 && this.#selectionAnchorRowId === null) return false
    this.#selectedRowIds = []
    this.#selectionAnchorRowId = null
    return true
  }

  #editCell(ctx: TableCellContext<Record<string, SqliteCellValue>>): void {
    const rowid = sqliteRowId(ctx.row["__rowid"])
    if (rowid === null || ctx.column.key === "__rowid") return
    const value = ctx.row[ctx.column.key] ?? null
    this.#openEdit({
      rowid,
      column: ctx.column.key,
      previous: value,
      onSubmit: this.#onCellEdit,
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
      key: "sqlite-cell-edit-backdrop",
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
      key: "sqlite-cell-edit-panel",
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

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false
  return true
}

type HostTerminalDockPaneOptions = {
  key: string
  label: string
  tooltip: string | (() => string)
  icon?: string | (() => string)
  edge(): HudSideTabEdge
  restore(): void
  moveTo(point: {x: number; y: number}, bounds: {w: number; h: number}): void
}

class HostTerminalDockPane extends UiSurface {
  #press: {
    lastX: number
    lastY: number
    startX: number
    startY: number
    dragging: boolean
    timer: ReturnType<typeof setTimeout> | null
    touch: boolean
  } | null = null
  #suppressRestoreClick = false
  readonly #options: HostTerminalDockPaneOptions

  constructor(options: (() => void) | HostTerminalDockPaneOptions) {
    super({bgColor: null, borderColor: null})
    this.#options = typeof options === "function"
      ? {
        key: "host-terminal-dock-restore",
        label: HOST_TERMINAL_MODEL_LABEL,
        tooltip: hostTerminalTitle(),
        icon: uiIcons.codex,
        edge: currentHostTerminalDockEdge,
        restore: options,
        moveTo: (point, bounds) => setHostTerminalDockPlacement(hostTerminalDockPlacementFromPoint(point, bounds)),
      }
      : options
    this.node.name = "HostTerminalDockPane"
  }

  protected render(): void {
    HudSideTab(this, {
      rect: {x: 0, y: 0, w: this.rectW, h: this.rectH},
      key: this.#options.key,
      edge: this.#options.edge(),
      icon: typeof this.#options.icon === "function" ? this.#options.icon() : (this.#options.icon ?? uiIcons.codex),
      label: this.#options.label,
      tone: "neutral",
      tooltip: typeof this.#options.tooltip === "function" ? this.#options.tooltip() : this.#options.tooltip,
      onClick: () => this.#restoreFromClick(),
    })
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (event.button !== 0 || this.pressedHit === null) return
    if (isTouchPointerEvent(event)) event.preventDefault()
    const point = this.#canvasPoint(event)
    if (point === null) return
    const press = {
      lastX: point.x,
      lastY: point.y,
      startX: point.x,
      startY: point.y,
      dragging: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      touch: isTouchPointerEvent(event),
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
      if (!press.dragging && !press.touch && Math.hypot(press.lastX - press.startX, press.lastY - press.startY) >= HOST_TERMINAL_DOCK_DRAG_THRESHOLD_PX) {
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
    if (wasDragging) this.#suppressRestoreClick = true
    super.onPointerUp(event, localX, localY)
    if (wasDragging) this.#suppressRestoreClick = false
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
    if (this.#suppressRestoreClick) return
    this.#options.restore()
  }

  #cancelPress(): void {
    const press = this.#press
    this.#press = null
    if (press?.timer !== null && press?.timer !== undefined) clearTimeout(press.timer)
  }

  #moveDockToCanvasPoint(point: {x: number; y: number}): void {
    const frame = this.canvas?.surfaceFrame(this)
    if (frame === undefined || frame === null) return
    this.#options.moveTo(point, frame.bounds)
  }

  #canvasPoint(event: MouseEvent): {x: number; y: number} | null {
    const canvas = this.canvas?.canvas
    if (canvas === undefined) return null
    const rect = canvas.getBoundingClientRect()
    return {x: event.clientX - rect.left, y: event.clientY - rect.top}
  }
}

function networkActionForSwitch(key: NetworkServiceKey, checked: boolean): string {
  if (key === "tls") return checked ? "start:tls" : "stop:tls"
  return checked ? "start:redirect" : "stop:redirect"
}

type NetworkActionPayload = {ok?: boolean; durationMs?: number; stdout?: string; stderr?: string; error?: string}

async function postNetworkAction(action: string, opts: {signal?: AbortSignal} = {}): Promise<{response: Response; payload: NetworkActionPayload}> {
  const requestInit: RequestInit = {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      action,
      tlsMode: networkProductViaInterpreter ? "interpreter" : "direct",
    }),
  }
  if (opts.signal !== undefined) requestInit.signal = opts.signal
  const response = await fetch("/space/network/action", requestInit)
  const payload = await response.json().catch(() => ({})) as NetworkActionPayload
  return {response, payload}
}

async function runNetworkAction(action: string): Promise<void> {
  networkActionStatus = `running ${action}`
  updateNetworkWatchPane()
  try {
    const {response, payload} = await postNetworkAction(action)
    if (!response.ok || payload.ok === false) {
      const message = payload.error ?? payload.stderr ?? `${response.status}`
      networkActionStatus = `${action} failed: ${String(message).slice(0, 64)}`
    } else {
      networkActionStatus = `${action} ok ${payload.durationMs ?? 0}ms`
    }
  } catch (error) {
    networkActionStatus = `${action} failed: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    updateNetworkWatchPane()
    scheduleNetworkStatusRefresh(0, {force: true})
  }
}

function ensureNetworkStatusRefresh(): void {
  if (networkStatusRefreshTimer !== null || networkStatusRefreshInFlight) return
  scheduleNetworkStatusRefresh(networkStatusLines.length === 0 ? 0 : NETWORK_STATUS_REFRESH_MS)
}

function scheduleNetworkStatusRefresh(delayMs: number, opts: {force?: boolean} = {}): void {
  const force = opts.force === true
  if (!networkStatusDisplayActive() || (!force && !networkStatusAutoRefreshActive())) {
    stopNetworkStatusRefresh({abort: !networkStatusDisplayActive() || !networkStatusAutoRefreshEnabled})
    return
  }
  if (networkStatusRefreshTimer !== null) window.clearTimeout(networkStatusRefreshTimer)
  networkStatusRefreshTimer = window.setTimeout(() => {
    networkStatusRefreshTimer = null
    void refreshNetworkStatus({manual: force})
  }, delayMs)
  updateNetworkWatchPane()
}

async function refreshNetworkStatus(opts: {manual?: boolean} = {}): Promise<void> {
  if (networkStatusRefreshInFlight) return
  const manual = opts.manual === true
  if (!networkStatusDisplayActive() || (!manual && !networkStatusAutoRefreshActive())) {
    stopNetworkStatusRefresh({abort: !networkStatusDisplayActive() || !networkStatusAutoRefreshEnabled})
    return
  }
  const generation = networkStatusRefreshGeneration
  const abortController = new AbortController()
  networkStatusRefreshAbortController = abortController
  networkStatusRefreshInFlight = true
  updateNetworkWatchPane()
  try {
    const {response, payload} = await postNetworkAction("status", {signal: abortController.signal})
    if (generation !== networkStatusRefreshGeneration) return
    if (!response.ok || payload.ok === false) {
      const message = payload.error ?? payload.stderr ?? `${response.status}`
      networkStatusLines = [`status failed: ${String(message).slice(0, 160)}`]
    } else {
      networkStatusLines = networkStatusLinesFromOutput(payload.stdout ?? "")
      networkStatusUpdatedAt = new Date()
    }
  } catch (error) {
    if (generation !== networkStatusRefreshGeneration || isAbortError(error)) return
    networkStatusLines = [`status failed: ${error instanceof Error ? error.message : String(error)}`]
  } finally {
    if (generation !== networkStatusRefreshGeneration) return
    if (networkStatusRefreshAbortController === abortController) networkStatusRefreshAbortController = null
    networkStatusRefreshInFlight = false
    updateNetworkWatchPane()
    if (networkStatusAutoRefreshActive()) scheduleNetworkStatusRefresh(NETWORK_STATUS_REFRESH_MS)
  }
}

function syncNetworkStatusRefresh(): void {
  if (networkStatusAutoRefreshActive()) {
    ensureNetworkStatusRefresh()
  } else {
    stopNetworkStatusRefresh({abort: !networkStatusDisplayActive() || !networkStatusAutoRefreshEnabled})
  }
  updateNetworkWatchPane()
}

function stopNetworkStatusRefresh(opts: {abort?: boolean} = {}): void {
  if (networkStatusRefreshTimer !== null) {
    window.clearTimeout(networkStatusRefreshTimer)
    networkStatusRefreshTimer = null
  }
  if (opts.abort === true && networkStatusRefreshAbortController !== null) {
    networkStatusRefreshGeneration += 1
    networkStatusRefreshAbortController.abort()
    networkStatusRefreshAbortController = null
    networkStatusRefreshInFlight = false
  }
  updateNetworkWatchPane()
}

function networkStatusDisplayActive(): boolean {
  return networkDisplayInstalled
    && document.visibilityState !== "hidden"
    && uiCanvas?.displayMode === "near"
    && uiCanvas.activeDisplayId === NETWORK_DISPLAY_ID
}

function networkStatusAutoRefreshActive(): boolean {
  return networkStatusAutoRefreshEnabled && networkStatusDisplayActive()
}

function setNetworkStatusAutoRefreshEnabled(enabled: boolean): void {
  if (networkStatusAutoRefreshEnabled === enabled) return
  networkStatusAutoRefreshEnabled = enabled
  writeStoredNetworkStatusAutoRefreshEnabled(enabled)
  syncNetworkStatusRefresh()
}

function setNetworkProductViaInterpreter(enabled: boolean): void {
  if (networkProductViaInterpreter === enabled) return
  networkProductViaInterpreter = enabled
  writeStoredNetworkProductViaInterpreter(enabled)
  updateNetworkWatchPane()
  void runNetworkAction("start:tls")
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError"
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

function networkWatchPaneSnapshot(): NetworkWatchPaneSnapshot {
  return {
    actionStatus: networkActionStatus,
    services: {...networkServiceSwitches},
    productViaInterpreter: networkProductViaInterpreter,
    autoRefresh: networkStatusAutoRefreshEnabled,
    autoRefreshActive: networkStatusAutoRefreshActive(),
    refreshing: networkStatusRefreshInFlight,
    updatedAt: networkStatusUpdatedAt,
    sections: networkWatchSectionsFromLines(networkStatusLines),
  }
}

function updateNetworkWatchPane(): void {
  networkDisplayControlsPane?.setSnapshot(networkWatchPaneSnapshot())
}

type RemoteDesktopPoint = {x: number; y: number}
type RemoteDesktopPointerState = {
  button: string
  buttons: number
  clickCount: number
  point: RemoteDesktopPoint
}

class RemoteDesktopPane extends UiSurface {
  #statusKind: AndroidPaneStatusKind = "idle"
  #status = "rtc idle"
  #audioStatus = "audio idle"
  #frame: AndroidRtcFrame | null = null
  #visibleFrame: AndroidRtcFrame | null = null
  #lastImageRect: UiSurfaceRect | null = null
  #activePointer: RemoteDesktopPointerState | null = null
  readonly #onRefresh: () => void
  readonly #onInput: (command: RtcControlCommand) => void

  constructor(opts: {onRefresh: () => void; onInput: (command: RtcControlCommand) => void}) {
    super({bgColor: HUD_PANEL_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "RemoteDesktopPane"
    this.#onRefresh = opts.onRefresh
    this.#onInput = opts.onInput
  }

  setStatus(kind: AndroidPaneStatusKind, label: string): void {
    if (this.#statusKind === kind && this.#status === label) return
    this.#statusKind = kind
    this.#status = label
    this.requestRender()
  }

  setAudioStatus(label: string): void {
    if (this.#audioStatus === label) return
    this.#audioStatus = label
    this.requestRender()
  }

  setFrame(frame: AndroidRtcFrame): void {
    if (!isValidRemoteDesktopFrame(frame)) return
    this.#frame = {...frame}
    if (TextureLoader.status(frame.src) === "ready") this.#visibleFrame = this.#frame
    this.requestRender()
  }

  frameSnapshot(): AndroidRtcFrame | null {
    const frame = this.#visibleFrame ?? this.#frame
    return frame === null ? null : {...frame}
  }

  focus(): void {
    this.canvas?.setFocused(this)
  }

  protected render(): void {
    const w = Math.max(360, this.rectW)
    const h = Math.max(240, this.rectH)
    this.drawRoundedRect(0, 0, w, h, {
      radius: radii.pane,
      fill: HUD_PANEL_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.CONTAINER,
    })
    this.#renderBody({x: 1, y: 1, w: Math.max(1, w - 2), h: Math.max(1, h - 2)})
    this.#renderOverlay(w, h)
  }

  #renderOverlay(w: number, h: number): void {
    const pad = 8
    const buttonSize = 24
    const refreshX = w - pad - buttonSize
    const frame = this.#visibleFrame ?? this.#frame
    const status = this.#statusKind === "error" || frame === null ? this.#status : ""
    if (status.length > 0) {
      const statusMaxW = Math.max(1, refreshX - pad - 8)
      const statusW = Math.min(statusMaxW, Math.max(92, Math.ceil(this.measureText(status, 10)) + 18))
      const statusX = Math.max(pad, refreshX - 8 - statusW)
      this.drawRoundedRect(statusX, pad, statusW, buttonSize, {
        radius: 7,
        fill: new Color(0.04, 0.06, 0.09, 0.76),
        border: this.#statusKind === "error" ? palette.red : palette.borderDim,
        borderWidth: 1,
        z: Z.TEXT,
      })
      this.drawText(status, statusX + 9, pad + 7, {
        fontPx: 10,
        material: this.#statusKind === "error" ? this.materials.red : this.materials.muted,
        maxWidthPx: Math.max(1, statusW - 18),
        z: Z.TEXT + 0.02,
      })
    }
    if (this.#audioStatus !== "audio idle") {
      const audioMaxW = Math.max(1, w - pad * 2)
      const audioW = Math.min(audioMaxW, Math.max(104, Math.ceil(this.measureText(this.#audioStatus, 10)) + 18))
      const audioY = Math.max(pad, h - pad - buttonSize)
      this.drawRoundedRect(pad, audioY, audioW, buttonSize, {
        radius: 7,
        fill: new Color(0.04, 0.06, 0.09, 0.7),
        border: palette.borderDim,
        borderWidth: 1,
        z: Z.TEXT,
      })
      this.drawText(this.#audioStatus, pad + 9, audioY + 7, {
        fontPx: 10,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, audioW - 18),
        z: Z.TEXT + 0.02,
      })
    }
    IconButton(this, refreshX, 8, buttonSize, buttonSize, {
      label: "Reconnect remote desktop",
      iconSrc: uiIcons.restart,
      fill: new Color(0.04, 0.06, 0.09, 0.58),
      border: palette.borderDim,
      radius: 7,
      action: this.#onRefresh,
    })
  }

  #renderBody(rect: UiSurfaceRect): void {
    this.#syncVisibleFrame()
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: radii.control,
      fill: HUD_CODE_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.ELEMENT - 0.03,
    })
    const frame = this.#visibleFrame ?? this.#frame
    const imageRect = this.#imageRect(rect, frame)
    this.#lastImageRect = imageRect
    if (imageRect !== null && frame !== null) {
      this.drawImage(frame.src, imageRect.x, imageRect.y, imageRect.w, imageRect.h, {
        fit: "contain",
        z: Z.ELEMENT,
      })
      this.#primePendingFrameTexture(rect, frame)
      this.hit(imageRect.x, imageRect.y, imageRect.w, imageRect.h, () => {}, {
        cursor: "crosshair",
        activeCursor: "crosshair",
        key: "remote-desktop-frame",
      })
      return
    }
    this.drawText(this.#statusKind === "error" ? this.#status : "Waiting for desktop stream", rect.x + 14, rect.y + 16, {
      fontPx: 12,
      material: this.#statusKind === "error" ? this.materials.red : this.materials.muted,
      maxWidthPx: Math.max(1, rect.w - 28),
    })
  }

  #syncVisibleFrame(): void {
    const frame = this.#frame
    if (frame !== null && TextureLoader.status(frame.src) === "ready") this.#visibleFrame = frame
  }

  #primePendingFrameTexture(rect: UiSurfaceRect, drawnFrame: AndroidRtcFrame): void {
    const pendingFrame = this.#frame
    if (pendingFrame === null || pendingFrame.src === drawnFrame.src) return
    this.drawImage(pendingFrame.src, rect.x, rect.y, 1, 1, {
      fit: "contain",
      opacity: 0,
      z: Z.ELEMENT + 0.01,
    })
  }

  #imageRect(rect: UiSurfaceRect, frame: AndroidRtcFrame | null): UiSurfaceRect | null {
    if (frame === null || frame.width <= 0 || frame.height <= 0) return null
    const pad = 1
    const maxW = Math.max(1, rect.w - pad * 2)
    const maxH = Math.max(1, rect.h - pad * 2)
    const scale = Math.min(maxW / frame.width, maxH / frame.height)
    const w = Math.max(1, frame.width * scale)
    const h = Math.max(1, frame.height * scale)
    return {
      x: rect.x + (rect.w - w) / 2,
      y: rect.y + (rect.h - h) / 2,
      w,
      h,
    }
  }

  #localPointToFrame(localX: number, localY: number, opts: {clamp?: boolean} = {}): RemoteDesktopPoint | null {
    const rect = this.#lastImageRect
    const frame = this.#visibleFrame ?? this.#frame
    if (rect === null || frame === null) return null
    if (
      opts.clamp !== true &&
      (localX < rect.x || localY < rect.y || localX > rect.x + rect.w || localY > rect.y + rect.h)
    ) {
      return null
    }
    return {
      x: clampNumber(((localX - rect.x) / rect.w) * frame.width, 0, frame.width - 1),
      y: clampNumber(((localY - rect.y) / rect.h) * frame.height, 0, frame.height - 1),
    }
  }

  #withFrameSize(command: RtcControlCommand): RtcControlCommand {
    const frame = this.#visibleFrame ?? this.#frame
    if (frame === null || !("x" in command)) return command
    return {...command, frameW: frame.width, frameH: frame.height} as RtcControlCommand
  }

  override onWheel(event: WheelEvent, localX: number, localY: number): void {
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) {
      super.onWheel(event, localX, localY)
      return
    }
    event.preventDefault()
    this.#onInput(this.#withFrameSize({
      type: "wheel",
      x: point.x,
      y: point.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
    }))
  }

  onKey(event: KeyboardEvent): void {
    if (event.isComposing) return
    const modifiers = remoteDesktopKeyboardModifiers(event)
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.#onInput({type: "text", text: event.key})
    } else {
      const command = {key: event.key, keyCode: event.code || event.key, modifiers}
      this.#onInput({type: "keyDown", ...command})
      this.#onInput({type: "keyUp", ...command})
    }
    event.preventDefault()
  }

  onInputText(text: string): void {
    if (text.length === 0) return
    this.#onInput({type: "text", text})
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) return
    const button = remoteDesktopMouseButton(event.button)
    const clickCount = Math.max(1, event.detail || 1)
    this.focus()
    this.#activePointer = {
      button,
      buttons: remoteDesktopButtonsMask(button),
      clickCount,
      point,
    }
    this.#onInput({type: "focus"})
    this.#onInput(this.#withFrameSize({
      type: "pointerDown",
      x: point.x,
      y: point.y,
      button,
      buttons: remoteDesktopButtonsMask(button),
      clickCount,
    }))
    event.preventDefault()
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    const active = this.#activePointer
    if (active === null) {
      const point = this.#localPointToFrame(localX, localY)
      if (point === null) {
        super.onPointerMove(event, localX, localY)
        return
      }
      this.#onInput(this.#withFrameSize({
        type: "pointerMove",
        x: point.x,
        y: point.y,
        buttons: 0,
      }))
      event.preventDefault()
      return
    }
    const point = this.#localPointToFrame(localX, localY, {clamp: true})
    if (point === null) return
    active.point = point
    this.#onInput(this.#withFrameSize({
      type: "pointerMove",
      x: point.x,
      y: point.y,
      button: active.button,
      buttons: active.buttons,
    }))
    event.preventDefault()
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    const active = this.#activePointer
    this.#activePointer = null
    const point = this.#localPointToFrame(localX, localY, {clamp: active !== null}) ?? active?.point ?? null
    if (active !== null && point !== null) {
      super.onPointerUp(event, localX, localY)
      this.#onInput(this.#withFrameSize({
        type: "pointerUp",
        x: point.x,
        y: point.y,
        button: active.button,
        buttons: 0,
        clickCount: active.clickCount,
      }))
      event.preventDefault()
      return
    }
    super.onPointerUp(event, localX, localY)
  }

  override onContextMenu(event: MouseEvent, localX: number, localY: number): void {
    const point = this.#localPointToFrame(localX, localY)
    if (point === null) {
      super.onContextMenu(event, localX, localY)
      return
    }
    event.preventDefault()
  }
}

function remoteDesktopKeyboardModifiers(event: KeyboardEvent): string[] {
  const modifiers: string[] = []
  if (event.altKey) modifiers.push("alt")
  if (event.ctrlKey) modifiers.push("control")
  if (event.metaKey) modifiers.push("meta")
  if (event.shiftKey) modifiers.push("shift")
  return modifiers
}

function remoteDesktopMouseButton(button: number): string {
  if (button === 1) return "middle"
  if (button === 2) return "right"
  return "left"
}

function remoteDesktopButtonsMask(button: string): number {
  if (button === "right") return 2
  if (button === "middle") return 4
  return 1
}

class SqliteHudFramePane extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null

  constructor(
    private readonly title: () => string,
    private readonly subtitle: () => string,
    private readonly onDock: () => void,
  ) {
    super({bgColor: HUD_PANEL_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "SqliteHudFramePane"
  }

  protected render(): void {
    const pad = 14
    const dockButtonSize = 22
    const dockButtonX = pad
    const titleX = dockButtonX + dockButtonSize + 8
    const titleW = Math.max(1, this.rectW - titleX - pad)
    IconButton(this, dockButtonX, 8, dockButtonSize, dockButtonSize, {
      label: "Dock SQLite",
      iconSrc: uiIcons.minus,
      color: "neutral",
      action: this.onDock,
    })
    this.drawText("SQLite", titleX, 10, {fontPx: 13, material: this.materials.cyan, maxWidthPx: 76})
    this.drawText(this.title(), titleX + 62, 10, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: Math.max(1, titleW - 62),
    })
    const subtitle = this.subtitle()
    if (subtitle.length > 0) {
      this.drawText(subtitle, titleX, 24, {
        fontPx: 9,
        material: this.materials.muted,
        maxWidthPx: titleW,
      })
    }
    this.drawRect(pad, SQLITE_HUD_HEADER_H - 1, Math.max(1, this.rectW - pad * 2), 1, palette.borderDim)
  }

  override onPointerDown(event: MouseEvent, localX: number, localY: number): void {
    super.onPointerDown(event, localX, localY)
    if (this.pressedHit !== null || event.button !== 0) return
    this.#beginFrameInteraction(event, localX, localY)
  }

  override onPointerMove(event: MouseEvent, localX: number, localY: number): void {
    if (this.#frameDrag !== null) {
      this.#updateFrameInteraction(event)
      return
    }
    super.onPointerMove(event, localX, localY)
    this.#syncFrameCursor(localX, localY)
  }

  override onPointerUp(event: MouseEvent, localX: number, localY: number): void {
    if (this.#endFrameInteraction(event, localX, localY)) return
    super.onPointerUp(event, localX, localY)
  }

  override onPointerLeave(): void {
    super.onPointerLeave()
    if (this.#frameDrag === null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = "default"
  }

  override onDeactivate(): void {
    super.onDeactivate()
    this.#frameDrag = null
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: true,
      resizable: true,
      minW: SQLITE_HUD_MIN_W,
      minH: SQLITE_HUD_MIN_H,
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
    if (cursor !== null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = cursor
    return true
  }

  #updateFrameInteraction(event: MouseEvent): boolean {
    const drag = this.#frameDrag
    const frame = this.canvas?.surfaceFrame(this)
    if (drag === null || frame === undefined || frame === null) return false
    const next = paneFrameDragRect(drag, event, frame.bounds)
    const applied = this.canvas?.setSurfaceRect(this, next)
    if (applied !== undefined && applied !== null) previewSqliteHudRect(applied)
    const cursor = paneFrameCursor(drag.kind, true)
    if (cursor !== null && this.canvas?.canvas !== undefined) this.canvas.canvas.style.cursor = cursor
    return true
  }

  #endFrameInteraction(event: MouseEvent, localX: number, localY: number): boolean {
    if (this.#frameDrag === null) return false
    this.#updateFrameInteraction(event)
    const frame = this.canvas?.surfaceFrame(this)
    this.#frameDrag = null
    this.#syncFrameCursor(localX, localY)
    if (frame !== undefined && frame !== null) storeSqliteHudRectAndRelayout(frame.rect)
    return true
  }

  #syncFrameCursor(localX: number, localY: number): void {
    if (this.canvas === null || this.pressedHit !== null || this.hoveredHit !== null) return
    const kind = paneFrameHit(localX, localY, this.rectW, this.rectH, this.#frameInteractionOpts())
    const cursor = paneFrameCursor(kind, false)
    if (this.canvas.canvas !== undefined) this.canvas.canvas.style.cursor = cursor ?? "default"
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
      fill: HUD_PANEL_BG,
      border: palette.borderDim,
      borderWidth: 1,
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

class HostTerminalCodexComposerPane extends UiSurface {
  #frameDrag: PaneFrameDrag | null = null
  #voiceSettingsPressTimer: number | null = null
  #voiceSettingsPressStart: {x: number; y: number} | null = null
  #voiceSettingsLongPressOpened = false
  #voiceToggleClickTimer: number | null = null

  constructor(private readonly controller: HostTerminalController) {
    super({bgColor: null, borderColor: null})
    this.node.name = "InterpreterHostCodexComposerPane"
  }

  protected render(): void {
    const w = Math.max(1, this.rectW)
    const h = Math.max(1, this.rectH)
    const pad = HOST_TERMINAL_CODEX_COMPOSER_PAD
    this.drawRoundedRect(0, 0, w, h, {
      radius: radii.pane,
      fill: new Color(0.04, 0.06, 0.09, 0.74),
      border: this.controller.codexDropActive ? palette.cyan : palette.borderDim,
      borderWidth: this.controller.codexDropActive ? 1.3 : 1,
      z: Z.CONTAINER,
    })
    this.#renderHeader(w)
    const bodyW = Math.max(1, w - pad * 2)
    if (this.controller.codexAttachments.length > 0) {
      const footerY = PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap + hostCodexComposerEditorHeight(h, true) + 8
      this.#drawAttachmentRow(pad, footerY, bodyW, h - pad)
    }
    if (this.controller.codexDropActive) this.#drawDropOverlay(w, h)
  }

  #renderHeader(w: number): void {
    const buttonSize = HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE
    const gap = 5
    const dockButtonX = PANE_FRAME.headerTextX
    const titleLeft = dockButtonX + buttonSize + gap
    const voiceButtonRect = this.#voiceButtonRect(w)
    const voiceButtonX = voiceButtonRect.x
    const attachButtonX = voiceButtonX - gap - buttonSize
    const sendButtonX = attachButtonX - gap - buttonSize
    const titleMaxW = Math.max(1, sendButtonX - titleLeft - 10)
    const titleW = Math.min(titleMaxW, this.measureText("Codex message", 12))
    const titleCx = Math.min(Math.max(w / 2, titleLeft + titleW / 2), Math.max(titleLeft + titleW / 2, sendButtonX - titleW / 2 - 8))
    const status = hostCodexComposerStatus(this.controller)
    const statusW = Math.min(titleMaxW, this.measureText(status, 10))
    const statusCx = Math.min(Math.max(w / 2, titleLeft + statusW / 2), Math.max(titleLeft + statusW / 2, sendButtonX - statusW / 2 - 8))
    IconButton(this, dockButtonX, 6, buttonSize, buttonSize, {
      label: "Свернуть Codex",
      iconSrc: uiIcons.minus,
      variant: "text",
      radius: 7,
      action: () => setHostTerminalHudDocked(true),
    })
    this.drawTextCentered("Codex message", titleCx, 11, {
      fontPx: 12,
      material: this.materials.cyan,
      maxWidthPx: titleMaxW,
      z: Z.TEXT,
    })
    this.drawTextCentered(status, statusCx, 24, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: titleMaxW,
      z: Z.TEXT,
    })
    IconButton(this, sendButtonX, 6, buttonSize, buttonSize, {
      label: "Отправить",
      iconSrc: uiIcons.send,
      disabled: !hostCodexComposerCanSubmit(this.controller),
      variant: "text",
      radius: 7,
      action: () => submitHostCodexComposer(this.controller),
    })
    IconButton(this, attachButtonX, 6, buttonSize, buttonSize, {
      label: "Прикрепить изображение",
      iconSrc: uiIcons.image,
      variant: "text",
      radius: 7,
      action: () => void chooseHostCodexImages(this.controller),
    })
    if (HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE) {
      ButtonVoice(this, voiceButtonX, 6, buttonSize, {
        key: "interpreter-codex-message-voice",
        snapshot: voiceButtonSnapshot(),
        soundPulse: voiceHudPane?.soundPulseAmount() ?? 0,
        tooltip: "Голосовой ввод",
        onClick: () => this.#queueVoiceToggleClick(),
      })
    }
    const rule = paneHeaderRuleRect(w, PANE_FRAME.headerHeight, PANE_FRAME.bodyInsetX)
    this.drawRect(rule.x, rule.y, rule.w, rule.h, palette.borderDim, Z.SEPARATOR)
  }

  #voiceButtonRect(w = Math.max(1, this.rectW)): UiSurfaceRect {
    const buttonSize = HOST_TERMINAL_CODEX_COMPOSER_HEADER_BUTTON_SIZE
    const gap = 5
    const dockButtonX = w - PANE_FRAME.headerTextX - buttonSize
    return {
      x: dockButtonX - gap - buttonSize,
      y: 6,
      w: buttonSize,
      h: buttonSize,
    }
  }

  #voiceButtonHit(localX: number, localY: number): boolean {
    if (!HOST_TERMINAL_CODEX_COMPOSER_VOICE_BUTTON_VISIBLE) return false
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
      openVoiceSettings()
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
    openVoiceSettings()
    super.onDeactivate()
  }

  #queueVoiceToggleClick(): void {
    this.#cancelVoiceToggleClick()
    this.#voiceToggleClickTimer = window.setTimeout(() => {
      this.#voiceToggleClickTimer = null
      setVoiceActiveTarget({kind: "host", controller: this.controller})
      focusHostCodexComposer(this.controller)
      void toggleVoiceInput()
    }, VOICE_TOGGLE_CLICK_DELAY_MS)
  }

  #cancelVoiceToggleClick(): void {
    if (this.#voiceToggleClickTimer === null) return
    window.clearTimeout(this.#voiceToggleClickTimer)
    this.#voiceToggleClickTimer = null
  }

  #drawAttachmentRow(x: number, y: number, w: number, maxY: number): void {
    let cx = x
    let cy = y
    const gap = 6
    const chipH = 22
    for (const attachment of this.controller.codexAttachments) {
      if (cy + chipH > maxY - 18) break
      const label = `${attachment.name} · ${formatCodexAttachmentSize(attachment.size)}`
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
      this.hit(cx, cy, chipW, chipH, () => removeHostCodexAttachment(this.controller, attachment.id), {
        key: `interpreter-codex-attachment:${attachment.id}`,
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
    this.drawText("Drop image", HOST_TERMINAL_CODEX_COMPOSER_PAD, h - 25, {
      fontPx: 11,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, w - HOST_TERMINAL_CODEX_COMPOSER_PAD * 2),
      z: Z.TEXT + 0.2,
    })
  }

  #frameInteractionOpts(): PaneFrameInteractionOpts {
    return {
      showHeader: true,
      movable: true,
      resizable: true,
      minW: HOST_TERMINAL_CODEX_COMPOSER_MIN_W,
      minH: HOST_TERMINAL_CODEX_COMPOSER_MIN_H,
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
    syncHostCodexEditorToComposer(this.controller, applied, "drag")
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
      storeHostCodexComposerRect(frame.rect)
      syncHostCodexEditorToComposer(this.controller, frame.rect, "release")
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
    if (voicePressStart !== null && Math.hypot(localX - voicePressStart.x, localY - voicePressStart.y) > VOICE_SETTINGS_LONG_PRESS_MOVE_PX) {
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
  if (changed) clearVoicePartialPreview()
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
  const voiceTransportError = status === "error" && isVoiceServiceErrorText(detail ?? "")
  if (status === "error") {
    voiceLastErrorText = voiceReadableDetail(detail ?? voiceStatusDetail(status))
    voiceLastErrorAt = new Date()
  }
  if (voiceTransportError) {
    pauseVoiceAutoWake()
    discardVoiceAutoSendBuffer()
    clearVoicePartialPreview()
    clearVoiceWakePreview()
  } else if (shouldHandleCompletedVoiceCommit(previousStatus, status)) {
    handleCompletedVoiceCommit(status)
  } else if (shouldFlushVoiceBufferForDeactivation(previousStatus, status)) {
    flushVoiceInputForDeactivation()
  } else if (shouldPreserveVoicePartialForStatus(previousStatus, status, detail)) {
    preserveVoicePartialAsTerminalInput()
  }
  if (status === "idle") {
    flushVoiceAutoSendBuffer()
    clearVoiceWakePreview()
  }
  updateVoiceHud(status, detail)
  if (voiceSignal !== null) playVoiceSignal(voiceSignal)
}

function voiceSignalForStatusChange(previousStatus: VoiceInputStatus, nextStatus: VoiceInputStatus, detail?: string): HudNotificationKind | null {
  if (nextStatus === "listening" && previousStatus !== "listening" && previousStatus !== "committing") return "activation"
  if (nextStatus === "error") return "error"
  if (nextStatus === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
  if (nextStatus === "idle" && detail === VOICE_STOP_COMMAND_DETAIL) return "stop"
  if (nextStatus === "idle" && (previousStatus === "listening" || previousStatus === "committing")) return "deactivation"
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
      voiceNextFlushMode = "draft"
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

function fullyStopVoiceInput(): void {
  voiceAutoWakePaused = true
  if (voiceAutoWakeTimer !== null) {
    window.clearTimeout(voiceAutoWakeTimer)
    voiceAutoWakeTimer = null
  }
  voiceNextFlushMode = "draft"
  voiceInputClient?.stop(VOICE_STOP_COMMAND_DETAIL)
  discardVoiceAutoSendBuffer()
  clearVoicePartialPreview()
  clearVoiceWakePreview()
  renderVoiceHud()
}

function focusVoiceTarget(): void {
  const target = voiceActiveTarget
  if (target === null) return
  if (target.kind === "host" && target.controller === hostTerminal) {
    focusHostCodexComposer(target.controller)
    return
  }
  const terminal = target.kind === "host" ? target.controller.hudTerminal : target.controller.terminal
  uiCanvas?.setFocused(terminal)
}

async function startVoiceWake(reportErrors: boolean): Promise<boolean> {
  const client = ensureVoiceInputClient()
  if (client.active) return true
  if (client.status === "error") client.reset()
  if (!documentCanOwnVoice()) return false

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
  if (!documentCanOwnVoice()) return
  if (voiceAutoWakePaused || voiceAutoWakeTimer !== null) return
  voiceAutoWakeTimer = window.setTimeout(() => {
    voiceAutoWakeTimer = null
    void ensureVoiceAutoWake()
  }, delayMs)
}

function pauseVoiceAutoWake(): void {
  voiceAutoWakePaused = true
  if (voiceAutoWakeTimer === null) return
  window.clearTimeout(voiceAutoWakeTimer)
  voiceAutoWakeTimer = null
}

async function ensureVoiceAutoWake(): Promise<void> {
  if (!documentCanOwnVoice()) return
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

function suspendVoiceForInactiveDocument(): void {
  if (voiceAutoWakeTimer !== null) {
    window.clearTimeout(voiceAutoWakeTimer)
    voiceAutoWakeTimer = null
  }
  if (voiceAutoWakeInFlight) return
  if (voiceInputClient?.active === true) {
    voiceNextFlushMode = "draft"
    voiceInputClient.stop("document hidden")
    discardVoiceAutoSendBuffer()
    clearVoicePartialPreview()
    clearVoiceWakePreview()
    renderVoiceHud()
  }
}

function documentCanOwnVoice(): boolean {
  const focused = typeof document.hasFocus === "function" ? document.hasFocus() : true
  return focused && document.visibilityState === "visible" && !document.hidden
}

function handleVoiceInputChunk(chunk: VoiceInputChunk): void {
  const target = voicePartialPreviewTarget ?? voiceActiveTarget
  const messages = voiceMessagesFromChunk(chunk)
  if (messages.length === 0) return
  voiceLastChunkText = messages.join("\n\n")
  voiceLastChunkAt = new Date()
  if (target !== null) {
    queueVoiceAutoSendMessages(target, messages)
  } else {
    flashVoiceHudError(t("voiceNoActiveInput"))
  }
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
    clearVoicePartialPreview()
    return
  }

  const text = cleanupVoiceInputText(raw)
  if (!text) {
    return
  }

  voiceLastPartialText = text
  voiceLastPartialAt = new Date()
  showVoicePartialPreview(target, voicePreviewWithBufferedInput(target, text))
  if (target.kind === "module") showModuleTerminalPrompt(target.controller)
  renderVoiceHud()
}

function showVoicePartialPreview(target: VoiceInputTarget, text: string): void {
  if (voicePartialPreviewTarget !== null && !sameVoiceInputTarget(voicePartialPreviewTarget, target)) {
    clearVoicePartialPreview()
  }
  voicePartialPreviewTarget = target
  voicePartialPreviewText = text
  if (target.kind === "host" && target.controller === hostTerminal) {
    applyHostVoiceComposerText(target.controller, text)
    target.controller.codexComposer.requestRender()
    return
  }
  for (const terminal of voicePreviewTerminals(target)) terminal.setInputPreview(text)
}

function clearVoicePartialPreview(): void {
  const target = voicePartialPreviewTarget
  if (target === null) return
  if (target.kind === "host" && target.controller === hostTerminal) {
    target.controller.codexComposer.requestRender()
  } else {
    for (const terminal of voicePreviewTerminals(target)) terminal.clearInputPreview()
  }
  voicePartialPreviewTarget = null
  voicePartialPreviewText = ""
}

function clearVoiceWakePreview(): void {
  voiceWakePreviewText = ""
  voiceWakePreviewAt = null
  voiceWakePreviewHistory.splice(0)
}

function clearVoicePartialPreviewForTarget(target: VoiceInputTarget, mode: "preserve" | "discard" = "discard"): void {
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

function shouldHandleCompletedVoiceCommit(previousStatus: VoiceInputStatus, status: VoiceInputStatus): boolean {
  return previousStatus === "committing" && (status === "listening" || status === "waitingWake" || status === "idle")
}

function shouldFlushVoiceBufferForDeactivation(previousStatus: VoiceInputStatus, status: VoiceInputStatus): boolean {
  return status === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing")
}

function handleCompletedVoiceCommit(status: VoiceInputStatus): void {
  const finishedDictation = status === "waitingWake" || status === "idle"
  if (finishedDictation) flushVoiceAutoSendBuffer()
}

function flushVoiceInputForDeactivation(): void {
  flushVoiceAutoSendBuffer()
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
  discardVoiceAutoSendBuffer()

  if (target.kind === "module") {
    clearVoicePartialPreview()
    showModuleTerminalPrompt(target.controller)
    appendModuleTerminalInputText(target.controller, text)
    return true
  }

  if (!voiceTargetCanAcceptInput(target)) return false
  return stageHostCodexDraft(target.controller, text, {focusComposer: false})
}

function queueVoiceAutoSendMessages(target: VoiceInputTarget, messages: readonly string[]): boolean {
  return queueVoiceAutoSendText(target, messages.join(" "))
}

function queueVoiceAutoSendText(target: VoiceInputTarget, raw: string): boolean {
  const text = cleanupVoiceInputText(raw)
  if (text.length === 0) return false
  if (voiceAutoSendTarget !== null && !sameVoiceInputTarget(voiceAutoSendTarget, target)) {
    flushVoiceAutoSendBuffer()
  }
  voiceAutoSendTarget = target
  voiceAutoSendText = mergeVoiceInputText(voiceAutoSendText, text)
  showVoicePartialPreview(target, voiceAutoSendText)
  updateVoiceHud(undefined, `${t("voiceDrafted")}: ${voiceAutoSendText}`)
  return true
}

function flushVoiceAutoSendBuffer(): boolean {
  const target = voiceAutoSendTarget
  const text = cleanupVoiceInputText(voiceAutoSendText)
  const mode = voiceNextFlushMode
  voiceAutoSendTarget = null
  voiceAutoSendText = ""
  voiceNextFlushMode = "auto"
  if (target === null || text.length === 0) return false

  const autoSendEnabled = readVoiceAutoSendEnabled()
  const hostComposerEdited = target.kind === "host" && target.controller === hostTerminal && target.controller.voiceComposerEdited
  let handled: boolean
  if (mode !== "draft" && autoSendEnabled && !hostComposerEdited) {
    if (target.kind === "host" && target.controller === hostTerminal) restoreHostVoiceComposerBaseDraft(target.controller)
    handled = insertVoiceMessageForTarget(target, text)
  } else {
    handled = stageVoiceMessagesForTarget(target, [text], {focusHostComposer: !autoSendEnabled || mode === "draft"})
  }
  if (handled) clearVoicePartialPreviewForTarget(target, "discard")
  return handled
}

function discardVoiceAutoSendBuffer(): void {
  voiceAutoSendTarget = null
  voiceAutoSendText = ""
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

function voicePreviewWithBufferedInput(target: VoiceInputTarget, partialText: string): string {
  if (voiceAutoSendTarget === null || !sameVoiceInputTarget(voiceAutoSendTarget, target)) return partialText
  return mergeVoiceInputText(voiceAutoSendText, partialText)
}

function stageVoiceMessagesForTarget(target: VoiceInputTarget, messages: readonly string[], opts: {focusHostComposer?: boolean} = {}): boolean {
  const text = cleanupVoiceInputText(messages.join(" "))
  if (text.length === 0) return false
  if (target.kind === "host") {
    if (!voiceTargetCanAcceptInput(target)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return false
    }
    if (target.controller === hostTerminal) {
      return stageHostCodexDraft(
        target.controller,
        text,
        opts.focusHostComposer === undefined ? {} : {focusComposer: opts.focusHostComposer},
      )
    }
    const body = sanitizeHostTerminalVoiceInput(text)
    if (body.length === 0) return false
    sendHostTerminalInput(target.controller, body, "api", body)
    updateVoiceHud(undefined, `${t("voiceDrafted")}: ${text}`)
    return true
  }

  if (!canAcceptTerminalInput(target.controller)) {
    flashVoiceHudError(t("voiceNoActiveInput"))
    return false
  }
  showModuleTerminalPrompt(target.controller)
  appendModuleTerminalInputText(target.controller, text)
  updateVoiceHud(undefined, `${t("voiceDrafted")}: ${text}`)
  return true
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
  if (controller.codexAttachmentUploadInFlight) {
    controller.codexSubmitAfterAttachmentUpload = true
    return stageHostCodexDraft(controller, body, {focusComposer: false})
  }
  if (controller.codexAttachments.length > 0) {
    const baseDraft = controller.voiceComposerEdited ? controller.codexDraft : (controller.voiceComposerBaseDraft ?? controller.codexDraft)
    const nextDraft = mergeCodexComposerDraft(baseDraft, body)
    clearVoicePartialPreviewForTarget({kind: "host", controller})
    discardVoiceAutoSendBuffer()
    voiceNextFlushMode = "auto"
    resetHostVoiceComposerDraftTracking(controller)
    setHostCodexDraft(controller, nextDraft)
    return submitHostCodexComposer(controller, {flushPendingInput: false})
  }
  const payload = controller.terminalState?.bracketedPaste
    ? `\x1b[200~${body}\x1b[201~\r`
    : `${body}\r`
  sendHostTerminalInput(controller, payload, "api", body)
  return true
}

function hostCodexComposerStatus(controller: HostTerminalController): string {
  if (controller.codexComposerStatus) return controller.codexComposerStatus
  if (voiceActiveTarget?.kind === "host" && voiceActiveTarget.controller === controller && (voiceHudStatus === "listening" || voiceHudStatus === "committing")) {
    return voiceStatusLabel(voiceHudStatus)
  }
  if (controller.socket?.readyState !== WebSocket.OPEN) return "Codex terminal не подключен"
  return controller.statusLabel
}

function hostCodexComposerReady(controller: HostTerminalController): boolean {
  return controller.socket?.readyState === WebSocket.OPEN
}

function hostCodexComposerCanSubmit(controller: HostTerminalController): boolean {
  return hostCodexComposerReady(controller) && codexComposerMessage(controller.codexDraft, controller.codexAttachments).length > 0
}

function voiceButtonSnapshot(): ButtonVoiceSnapshot {
  return {
    status: voiceHudStatus,
    serviceState: voiceServiceState,
    level: voiceHudStatus === "listening" || voiceHudStatus === "committing" ? voiceInputLevel : 0,
  }
}

function setHostCodexDraftFromEditor(controller: HostTerminalController, value: string): void {
  if (controller.codexEditorSyncing) return
  if (controller.codexDraft === value) return
  if (controller.voiceComposerBaseDraft !== null && value !== controller.voiceComposerGeneratedDraft) {
    controller.voiceComposerEdited = true
  }
  controller.codexDraft = value
  controller.codexComposer.requestRender()
}

function setHostCodexDraft(controller: HostTerminalController, value: string): void {
  if (controller.codexDraft === value) return
  controller.codexDraft = value
  syncHostCodexEditor(controller)
  controller.codexComposer.requestRender()
}

function flushHostCodexDraftFromEditor(controller: HostTerminalController): void {
  if (controller.codexEditorSyncing) return
  const text = controller.codexEditor.getText()
  if (text !== controller.codexDraft) setHostCodexDraftFromEditor(controller, text)
}

function syncHostCodexEditor(controller: HostTerminalController): void {
  if (controller.codexEditorSyncing || controller.codexEditor.getText() === controller.codexDraft) return
  controller.codexEditorSyncing = true
  try {
    controller.codexEditor.setText(controller.codexDraft)
    const lines = controller.codexDraft.split("\n")
    const lastLine = Math.max(0, lines.length - 1)
    controller.codexEditor.setCursor(lastLine, lines[lastLine]?.length ?? 0, {scroll: "nearest"})
  } finally {
    controller.codexEditorSyncing = false
  }
}

function flushHostCodexComposerPendingInput(controller: HostTerminalController): void {
  flushHostCodexDraftFromEditor(controller)
  clearVoicePartialPreviewForTarget({kind: "host", controller}, "preserve")
  flushHostCodexDraftFromEditor(controller)
}

function submitHostCodexComposer(controller: HostTerminalController, options: {flushPendingInput?: boolean} = {}): boolean {
  if (options.flushPendingInput ?? true) flushHostCodexComposerPendingInput(controller)
  const message = codexComposerMessage(controller.codexDraft, controller.codexAttachments)
  if (message.length === 0 || !hostCodexComposerReady(controller)) return false
  const payload = controller.terminalState?.bracketedPaste
    ? `\x1b[200~${message}\x1b[201~\r`
    : `${message}\r`
  clearVoicePartialPreviewForTarget({kind: "host", controller})
  discardVoiceAutoSendBuffer()
  voiceNextFlushMode = "auto"
  sendHostTerminalInput(controller, payload, "api", message)
  resetHostVoiceComposerDraftTracking(controller)
  setHostCodexDraft(controller, "")
  controller.codexAttachments = []
  setHostCodexComposerStatus(controller, "отправлено")
  focusHostCodexComposer(controller)
  controller.codexComposer.requestRender()
  return true
}

function stageHostCodexDraft(controller: HostTerminalController, text: string, opts: {focusComposer?: boolean} = {}): boolean {
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  clearVoicePartialPreviewForTarget({kind: "host", controller})
  const baseDraft = controller.voiceComposerEdited ? controller.codexDraft : (controller.voiceComposerBaseDraft ?? controller.codexDraft)
  const nextDraft = mergeCodexComposerDraft(baseDraft, body)
  resetHostVoiceComposerDraftTracking(controller)
  setHostCodexDraft(controller, nextDraft)
  setHostCodexComposerStatus(controller, "голос добавлен в поле")
  if (opts.focusComposer) focusHostCodexComposer(controller)
  controller.codexComposer.requestRender()
  return true
}

function applyHostVoiceComposerText(controller: HostTerminalController, text: string): boolean {
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  if (controller.voiceComposerBaseDraft === null) {
    controller.voiceComposerBaseDraft = controller.codexDraft
    controller.voiceComposerGeneratedDraft = controller.codexDraft
  }
  if (controller.voiceComposerEdited) return true
  const nextDraft = mergeCodexComposerDraft(controller.voiceComposerBaseDraft, body)
  controller.voiceComposerGeneratedDraft = nextDraft
  if (controller.codexDraft === nextDraft) return true
  setHostCodexDraft(controller, nextDraft)
  focusHostCodexComposer(controller)
  return true
}

function restoreHostVoiceComposerBaseDraft(controller: HostTerminalController): void {
  if (controller.voiceComposerBaseDraft === null) return
  if (!controller.voiceComposerEdited && controller.codexDraft === controller.voiceComposerGeneratedDraft) {
    setHostCodexDraft(controller, controller.voiceComposerBaseDraft)
  }
  resetHostVoiceComposerDraftTracking(controller)
}

function resetHostVoiceComposerDraftTracking(controller: HostTerminalController): void {
  controller.voiceComposerBaseDraft = null
  controller.voiceComposerGeneratedDraft = ""
  controller.voiceComposerEdited = false
}

function focusHostCodexComposer(controller: HostTerminalController): void {
  uiCanvas?.setFocused(controller.codexEditor)
}

function setHostCodexComposerStatus(controller: HostTerminalController, status: string, ttlMs = 2200): void {
  if (controller.codexComposerStatusTimer !== null) {
    window.clearTimeout(controller.codexComposerStatusTimer)
    controller.codexComposerStatusTimer = null
  }
  controller.codexComposerStatus = status
  controller.codexComposer.requestRender()
  if (!status) return
  controller.codexComposerStatusTimer = window.setTimeout(() => {
    controller.codexComposerStatusTimer = null
    controller.codexComposerStatus = ""
    controller.codexComposer.requestRender()
  }, ttlMs)
}

function removeHostCodexAttachment(controller: HostTerminalController, id: string): void {
  const next = controller.codexAttachments.filter((attachment) => attachment.id !== id)
  if (next.length === controller.codexAttachments.length) return
  controller.codexAttachments = next
  setHostCodexComposerStatus(controller, next.length > 0 ? `${next.length} влож.` : "")
  controller.codexComposer.requestRender()
}

async function chooseHostCodexImages(controller: HostTerminalController): Promise<void> {
  flushHostCodexComposerPendingInput(controller)
  const files = await pickCodexImageFiles({multiple: true, parent: uiCanvas?.canvas.parentElement ?? document.body})
  if (files.length === 0) return
  await attachHostCodexImages(controller, files)
}

async function attachHostCodexImages(controller: HostTerminalController, files: readonly File[]): Promise<void> {
  if (files.length === 0) {
    setHostCodexComposerStatus(controller, "нет изображения")
    return
  }
  setHostCodexComposerStatus(controller, "загружаю изображение", 6000)
  controller.codexAttachmentUploadInFlight = true
  let submitAfterUpload = false
  try {
    const uploaded = await uploadCodexAttachments(files)
    controller.codexAttachments = [...controller.codexAttachments, ...uploaded]
    setHostCodexComposerStatus(controller, `${controller.codexAttachments.length} влож.`)
    focusHostCodexComposer(controller)
    submitAfterUpload = controller.codexSubmitAfterAttachmentUpload && controller.codexAttachments.length > 0
  } catch (error) {
    setHostCodexComposerStatus(controller, error instanceof Error ? error.message : String(error), 5000)
  } finally {
    controller.codexAttachmentUploadInFlight = false
    controller.codexSubmitAfterAttachmentUpload = false
    controller.codexComposer.requestRender()
  }
  if (submitAfterUpload) submitHostCodexComposer(controller)
}

function installHostCodexComposerDragHandlers(): void {
  if (hostCodexComposerDragHandlersInstalled) return
  hostCodexComposerDragHandlersInstalled = true
  document.addEventListener("dragover", handleHostCodexDragOver, {capture: true})
  document.addEventListener("drop", (event) => void handleHostCodexDrop(event), {capture: true})
  document.addEventListener("dragleave", handleHostCodexDragLeave, {capture: true})
}

function handleHostCodexDragOver(event: DragEvent): void {
  const controller = hostTerminal
  if (controller === null || !dragEventInsideHostCodexComposer(event)) {
    if (controller !== null) setHostCodexDropActive(controller, false)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy"
  setHostCodexDropActive(controller, true)
}

function handleHostCodexDragLeave(event: DragEvent): void {
  const controller = hostTerminal
  if (controller === null) return
  const related = event.relatedTarget
  if (related instanceof Node && document.contains(related)) return
  setHostCodexDropActive(controller, false)
}

async function handleHostCodexDrop(event: DragEvent): Promise<void> {
  const controller = hostTerminal
  if (controller === null || !dragEventInsideHostCodexComposer(event)) return
  event.preventDefault()
  event.stopPropagation()
  setHostCodexDropActive(controller, false)
  const files = codexImageDropFiles(event.dataTransfer)
  await attachHostCodexImages(controller, files)
}

function dragEventInsideHostCodexComposer(event: DragEvent): boolean {
  const rect = hostCodexComposerRect({w: window.innerWidth, h: window.innerHeight})
  if (rect.visible === false) return false
  return event.clientX >= rect.x && event.clientX <= rect.x + rect.w
    && event.clientY >= rect.y && event.clientY <= rect.y + rect.h
}

function setHostCodexDropActive(controller: HostTerminalController, active: boolean): void {
  if (controller.codexDropActive === active) return
  controller.codexDropActive = active
  controller.codexComposer.requestRender()
}

function isAndroidBrowser(): boolean {
  const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
  return /android/i.test(`${nav.userAgent} ${nav.userAgentData?.platform ?? ""}`)
}

function isTouchPointerEvent(event: MouseEvent): boolean {
  const pointer = event as MouseEvent & {
    pointerType?: unknown
    metaforPointerType?: unknown
    sourceCapabilities?: {firesTouchEvents?: boolean} | null
  }
  return pointer.pointerType === "touch" || pointer.metaforPointerType === "touch" || pointer.sourceCapabilities?.firesTouchEvents === true
}

function hostCodexComposerEditorHeight(composerH: number, hasFooter: boolean): number {
  const editorTop = PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap
  const footerSpace = hasFooter ? HOST_TERMINAL_CODEX_COMPOSER_PAD + 30 : HOST_TERMINAL_CODEX_COMPOSER_PAD
  return Math.max(82, composerH - editorTop - footerSpace)
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

const VOICE_MESSAGE_PAUSE_SECONDS = 1.6

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
  const cleaned = cleanupVoiceText(text).replace(/\s+/g, " ").trim()
  return voiceTextHasContent(cleaned) ? cleaned : ""
}

function voiceTextHasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text)
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
  hostTerminal?.codexComposer.requestRender()
}

function openVoiceSettings(): void {
  if (voiceHudPane === null) return
  voiceHudPane.openSettings()
  relayoutHudSurfaces()
  voiceHudPane.requestRender()
}

function handleVoiceSettingsOpenChange(open: boolean): void {
  if (!open && voiceHudPane !== null) uiCanvas?.clearSurfaceRect(voiceHudPane)
  relayoutHudSurfaces()
  voiceHudPane?.requestRender()
  hostTerminal?.codexComposer.requestRender()
}

function flashVoiceHudError(detail: string): void {
  if (voiceHudErrorTimer !== null) window.clearTimeout(voiceHudErrorTimer)
  voiceLastErrorText = voiceReadableDetail(detail)
  voiceLastErrorAt = new Date()
  updateVoiceHud("error", detail)
  playVoiceSignal("error")
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
  const mode = readVoiceAutoSendEnabled() ? t("voiceAutoSendOn") : t("voiceAutoSendOff")
  if (voiceAutoEnterAt === null) return `${mode} · ${t("voiceAutoEnter")}: 0`
  return `${mode} · ${formatHudTime(voiceAutoEnterAt)} · ${t("voiceAutoEnter")} #${voiceAutoEnterCount}`
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
    `${ru ? "автоотправка" : "auto-send"}: ${readVoiceAutoSendEnabled() ? "on" : "off"}`,
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
    const ws = new WebSocket(voiceInputWebSocketUrl(readVoiceInputUrl()))
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
    markRemoteDesktopAudioUnlocked("user-gesture")
    primeHudNotificationAudioElements()
    primeHudNotificationAudioContext()
    primeRemoteDesktopAudio()
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
  const rawVolume = hudNotificationVolume(kind)
  const volume = rawVolume
  if (volume <= 0) {
    recordHudNotificationSound(kind, "muted")
    return
  }
  if (kind !== "agent" && kind !== "error") {
    const signalKind: VoiceInputSignalTone = kind
    playBrowserHudNotificationSound(kind, volume, () => {
      playVoiceSignalToneWithFallback(signalKind, volume, voiceInputClient, () => {
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
  client: VoiceInputClient | null,
  onFallback: () => void,
): void {
  let settled = false
  const fallback = (): void => {
    if (settled) return
    settled = true
    onFallback()
  }
  const captureStarted = playVoiceCaptureSignalTone(kind, volume, client, (played) => {
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

function playVoiceCaptureSignalTone(kind: VoiceInputSignalTone, volume: number, client: VoiceInputClient | null, onResult?: (played: boolean) => void): boolean {
  return client?.playSignalTone(kind, volume, (playedKind, method, error) => {
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
  if (playHudNotificationWebAudioTone(kind, volume, (reason) => playHudNotificationHtmlAudio(kind, reason, volume, onBlocked))) return
  playHudNotificationHtmlAudio(kind, "no webaudio", volume, onBlocked)
}

function playHudNotificationHtmlAudio(kind: HudNotificationKind, reason = "fallback", volume = hudNotificationVolume(kind), onBlocked?: () => void): void {
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
    return readVoiceEndpointUrl(VOICE_INPUT_URL_STORAGE_KEY, DEFAULT_VOICE_INPUT_URL, "8787")
  } catch {
    return DEFAULT_VOICE_INPUT_URL
  }
}

function readVoiceWakeUrl(): string {
  try {
    return readVoiceEndpointUrl(VOICE_WAKE_URL_STORAGE_KEY, DEFAULT_VOICE_WAKE_URL, "4765")
  } catch {
    return DEFAULT_VOICE_WAKE_URL
  }
}

function readVoiceEndpointUrl(key: string, fallback: string, legacyLoopbackPort: string): string {
  const stored = localStorage.getItem(key)
  if (stored === null || stored.trim().length === 0) return fallback
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

function readVoiceAutoSendEnabled(): boolean {
  try {
    const raw = localStorage.getItem(VOICE_AUTO_SEND_STORAGE_KEY)
    if (raw === null) return DEFAULT_VOICE_AUTO_SEND_ENABLED
    return raw !== "0"
  } catch {
    return DEFAULT_VOICE_AUTO_SEND_ENABLED
  }
}

function storeVoiceAutoSendEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VOICE_AUTO_SEND_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
  renderVoiceHud()
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
  const liveModuleIds = new Set(moduleOrder)
  for (const moduleId of [...moduleDisplayIds]) {
    if (liveModuleIds.has(moduleId)) continue
    removeModuleDisplay(moduleId)
  }

  const orderedModules = moduleOrder
    .map((id) => moduleSnapshots.get(id))
    .filter((module): module is ModulePaneSnapshot => module !== undefined)

  const displayMetrics = viewportDisplayMetrics()
  const moduleDisplayIdList = orderedModules.map((module) => moduleDisplayId(module.id))
  const totalW = moduleDisplayIdList.length * displayMetrics.widthMm
    + Math.max(0, moduleDisplayIdList.length - 1) * MODULE_DISPLAY_GAP_MM
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
  ensureRemoteDesktopDisplay()
  ensureNetworkDisplay()

  const displayIds = [
    ...(remoteDesktopDisplayInstalled ? [REMOTE_DESKTOP_DISPLAY_ID] : []),
    ...(networkDisplayInstalled ? [NETWORK_DISPLAY_ID] : []),
    ...moduleDisplayIdList,
  ]

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
  enforceSpaceOverview()
}

function removeModuleDisplay(moduleId: string): void {
  const displayId = moduleDisplayId(moduleId)
  if (voiceActiveTarget?.kind === "module" && voiceActiveTarget.controller.id === moduleId) voiceActiveTarget = null
  if (voicePartialPreviewTarget?.kind === "module" && voicePartialPreviewTarget.controller.id === moduleId) clearVoicePartialPreview()
  moduleDisplays.delete(moduleId)
  moduleDisplayIds.delete(moduleId)
  moduleSnapshots.delete(moduleId)
  interpreterDisplayPositions.delete(displayId)
  if (uiCanvas?.activeDisplayId === displayId) {
    const nextModuleId = moduleOrder.find((id) => id !== moduleId && moduleDisplayIds.has(id))
    const nextDisplayId = nextModuleId === undefined ? null : moduleDisplayId(nextModuleId)
    if (nextDisplayId !== null) uiCanvas.focusDisplay(nextDisplayId)
  }
  uiCanvas?.removeDisplay(displayId)
}

function ensureRemoteDesktopDisplay(): void {
  if (uiCanvas === null) return
  const metrics = viewportDisplayMetrics()
  const center = displayCenterWithStored(REMOTE_DESKTOP_DISPLAY_ID, remoteDesktopDisplayFallbackCenter(metrics))

  if (!remoteDesktopDisplayInstalled) {
    remoteDesktopDisplayInstalled = true
    remoteDesktopPane ??= new RemoteDesktopPane({
      onRefresh: () => connectRemoteDesktopRtc(),
      onInput: (command) => {
        sendRemoteDesktopControl(command)
      },
    })
    uiCanvas.createDisplay({
      id: REMOTE_DESKTOP_DISPLAY_ID,
      widthMm: metrics.widthMm,
      heightMm: metrics.heightMm,
      pixelWidth: metrics.pixelWidth,
      pixelHeight: metrics.pixelHeight,
      centerMm: center,
      background: 0x020617,
      border: null,
    })
    uiCanvas.addSurfaceToDisplay(REMOTE_DESKTOP_DISPLAY_ID, remoteDesktopPane, ({w, h}) => ({x: 0, y: 0, w, h}))
    updateRemoteDesktopAudioPosition(center)
    connectRemoteDesktopRtc()
  } else {
    uiCanvas.resizeDisplay(REMOTE_DESKTOP_DISPLAY_ID, metrics)
    uiCanvas.setDisplayCenter(REMOTE_DESKTOP_DISPLAY_ID, center)
    updateRemoteDesktopAudioPosition(center)
  }
}

function remoteDesktopDisplayFallbackCenter(metrics: DisplayLayoutMetrics): UiRuntimeViewPointVector {
  const moduleMetrics = viewportDisplayMetrics()
  const moduleCount = moduleOrder.length
  if (moduleCount === 0) return {x: 0, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM}
  const moduleTotalW = moduleCount * moduleMetrics.widthMm + Math.max(0, moduleCount - 1) * MODULE_DISPLAY_GAP_MM
  return {
    x: -moduleTotalW / 2 - MODULE_DISPLAY_GAP_MM - metrics.widthMm / 2,
    y: MODULE_DISPLAY_CENTER_Y_MM,
    z: MODULE_DISPLAY_CENTER_Z_MM,
  }
}

function ensureNetworkDisplay(): void {
  if (uiCanvas === null) return
  const metrics = viewportDisplayMetrics()
  const center = displayCenterWithStored(NETWORK_DISPLAY_ID, networkDisplayFallbackCenter(metrics))
  const controller = ensureNetworkHostTerminalController()
  ensureNetworkDisplayTerminal(controller)

  if (!networkDisplayInstalled) {
    networkDisplayInstalled = true
    networkDisplayControlsPane ??= new NetworkWatchPane({
      title: "NetworkMux",
      sessionLabel: `${NETWORK_TERMINAL_TMUX_SESSION}:network`,
      actions: {
        setTlsEnabled: (enabled) => {
          networkServiceSwitches = {...networkServiceSwitches, tls: enabled}
          updateNetworkWatchPane()
          void runNetworkAction(networkActionForSwitch("tls", enabled))
        },
        setRedirectEnabled: (enabled) => {
          networkServiceSwitches = {...networkServiceSwitches, redirect: enabled}
          updateNetworkWatchPane()
          void runNetworkAction(networkActionForSwitch("redirect", enabled))
        },
        setProductViaInterpreter: setNetworkProductViaInterpreter,
        setAutoRefreshEnabled: setNetworkStatusAutoRefreshEnabled,
        rebuildLayout: () => {
          networkServiceSwitches = {tls: true, redirect: true}
          updateNetworkWatchPane()
          void runNetworkAction("layout")
        },
        clearPanes: () => void runNetworkAction("clear"),
        refresh: () => scheduleNetworkStatusRefresh(0, {force: true}),
      },
    })
    updateNetworkWatchPane()
    uiCanvas.createDisplay({
      id: NETWORK_DISPLAY_ID,
      widthMm: metrics.widthMm,
      heightMm: metrics.heightMm,
      pixelWidth: metrics.pixelWidth,
      pixelHeight: metrics.pixelHeight,
      centerMm: center,
      background: 0x020617,
      border: null,
    })
    uiCanvas.addSurfaceToDisplay(NETWORK_DISPLAY_ID, networkDisplayControlsPane, networkDisplayControlsRect)
    if (networkDisplayTerminal !== null) {
      uiCanvas.addSurfaceToDisplay(NETWORK_DISPLAY_ID, networkDisplayTerminal, networkDisplayTerminalRect)
    }
  } else {
    uiCanvas.resizeDisplay(NETWORK_DISPLAY_ID, metrics)
    uiCanvas.setDisplayCenter(NETWORK_DISPLAY_ID, center)
  }
  syncNetworkStatusRefresh()
}

function networkDisplayFallbackCenter(metrics: DisplayLayoutMetrics): UiRuntimeViewPointVector {
  const moduleMetrics = viewportDisplayMetrics()
  const moduleCount = moduleOrder.length
  if (moduleCount === 0) return {x: 0, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM}
  const moduleTotalW = moduleCount * moduleMetrics.widthMm + Math.max(0, moduleCount - 1) * MODULE_DISPLAY_GAP_MM
  return {
    x: moduleTotalW / 2 + MODULE_DISPLAY_GAP_MM + metrics.widthMm / 2,
    y: MODULE_DISPLAY_CENTER_Y_MM,
    z: MODULE_DISPLAY_CENTER_Z_MM,
  }
}

function ensureNetworkDisplayTerminal(controller: HostTerminalController): TerminalPane {
  if (networkDisplayTerminal !== null) return networkDisplayTerminal
  const terminal = createHostTerminalPane(controller, "InterpreterNetworkTerminalDisplay", {
    title: "Network · tmux",
    fontPx: 12,
    linePx: 17,
    fitToRect: true,
    scrollX: true,
    onResize: (size) => resizeHostTerminalFromPane(controller, terminal, size),
  })
  networkDisplayTerminal = terminal
  return terminal
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

function createHostCodexEditor(controller: HostTerminalController): EditorPane {
  const editor = new EditorPane({
    path: "message.md",
    fontPx: 12,
    linePx: 17,
    titleFontPx: 11,
    readOnly: false,
    showCaret: true,
    introAnimation: false,
    showHeader: false,
    indentGuides: false,
    showLineNumbers: false,
    wrapLines: true,
    draggable: false,
    resizable: false,
    onChange: (text) => setHostCodexDraftFromEditor(controller, text),
    onSave: () => submitHostCodexComposer(controller),
    onSubmit: () => submitHostCodexComposer(controller),
  })
  editor.node.name = "InterpreterHostCodexEditor"
  editor.setSelectionContextMenuEnabled(true)
  return editor
}

function ensureHostTerminalController(): HostTerminalController {
  if (hostTerminal !== null) return hostTerminal
  const controller = {} as HostTerminalController
  const hudTerminal = createHostTerminalPane(controller, "InterpreterHostTerminalHud", {
    title: hostTerminalTitle(),
    fontPx: 12,
    linePx: 17,
    draggable: true,
    resizable: true,
    onResize: (size) => resizeHostTerminalFromPane(controller, hudTerminal, size),
    onFrameRectPreview: previewHostTerminalHudRect,
    onFrameRectChange: storeHostTerminalHudRectAndRelayout,
    onFrameDockRequest: () => setHostTerminalHudDocked(true),
  })
  const codexComposer = new HostTerminalCodexComposerPane(controller)
  const codexEditor = createHostCodexEditor(controller)
  Object.assign(controller, {
    hudTerminal,
    codexComposer,
    codexEditor,
    title: hostTerminalTitle(),
    sessionStorageKey: HOST_TERMINAL_SESSION_STORAGE_KEY,
    sessionKey: HOST_TERMINAL_SESSION_KEY,
    tmuxSession: HOST_TERMINAL_TMUX_SESSION,
    initialCommand: null,
    initialCommandSent: false,
    socket: null,
    sessionId: readStoredHostTerminalSessionId(HOST_TERMINAL_SESSION_STORAGE_KEY),
    terminalSize: null,
    connectionState: "idle" as PtyStatusKind,
    statusLabel: t("terminalConnecting"),
    terminalState: null,
    localEchoId: 0,
    codexDraft: "",
    codexAttachments: [],
    codexAttachmentUploadInFlight: false,
    codexSubmitAfterAttachmentUpload: false,
    codexDropActive: false,
    codexEditorSyncing: false,
    codexComposerStatus: "",
    codexComposerStatusTimer: null,
    voiceComposerBaseDraft: null,
    voiceComposerGeneratedDraft: "",
    voiceComposerEdited: false,
    agentNotifyArmed: false,
    agentNotifySawOutput: false,
    agentNotifyLastOutputAt: 0,
    agentNotifyLastPlayedAt: 0,
    agentNotifyTimer: null,
  } satisfies HostTerminalController)
  hostTerminal = controller
  for (const pane of hostTerminalPanes(controller)) pane.setAutoscrollPinned(true)
  updateHostTerminalHeaderControls(controller)
  if (!hostTerminalUnloadInstalled) {
    hostTerminalUnloadInstalled = true
    window.addEventListener("beforeunload", () => {
      hostTerminal?.socket?.close()
      networkHostTerminal?.socket?.close()
    })
  }
  return controller
}

function ensureNetworkHostTerminalController(): HostTerminalController {
  if (networkHostTerminal !== null) return networkHostTerminal
  const controller = {} as HostTerminalController
  const hudTerminal = createHostTerminalPane(controller, "InterpreterNetworkTerminalHud", {
    title: "Network · tmux",
    fontPx: 12,
    linePx: 17,
    draggable: true,
    resizable: true,
    onResize: (size) => resizeHostTerminalFromPane(controller, hudTerminal, size),
    onFrameRectPreview: previewNetworkTerminalHudRect,
    onFrameRectChange: storeNetworkTerminalHudRectAndRelayout,
    onFrameDockRequest: () => setNetworkTerminalDocked(true),
  })
  const codexComposer = new HostTerminalCodexComposerPane(controller)
  const codexEditor = createHostCodexEditor(controller)
  Object.assign(controller, {
    hudTerminal,
    codexComposer,
    codexEditor,
    title: "Network · tmux",
    sessionStorageKey: NETWORK_TERMINAL_SESSION_STORAGE_KEY,
    sessionKey: NETWORK_TERMINAL_SESSION_KEY,
    tmuxSession: NETWORK_TERMINAL_TMUX_SESSION,
    initialCommand: NETWORK_TERMINAL_TMUX_FALLBACK_COMMAND,
    initialCommandSent: false,
    socket: null,
    sessionId: readStoredHostTerminalSessionId(NETWORK_TERMINAL_SESSION_STORAGE_KEY),
    terminalSize: null,
    connectionState: "idle" as PtyStatusKind,
    statusLabel: t("terminalConnecting"),
    terminalState: null,
    localEchoId: 0,
    codexDraft: "",
    codexAttachments: [],
    codexAttachmentUploadInFlight: false,
    codexSubmitAfterAttachmentUpload: false,
    codexDropActive: false,
    codexEditorSyncing: false,
    codexComposerStatus: "",
    codexComposerStatusTimer: null,
    voiceComposerBaseDraft: null,
    voiceComposerGeneratedDraft: "",
    voiceComposerEdited: false,
    agentNotifyArmed: false,
    agentNotifySawOutput: false,
    agentNotifyLastOutputAt: 0,
    agentNotifyLastPlayedAt: 0,
    agentNotifyTimer: null,
  } satisfies HostTerminalController)
  networkHostTerminal = controller
  return controller
}

function createHostTerminalPane(
  controller: HostTerminalController,
  name: string,
  opts: {
    title: string
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
    title: opts.title,
    status: t("terminalConnecting"),
    statusKind: "idle",
    fontPx: opts.fontPx,
    linePx: opts.linePx,
    maxScrollback: 10000,
    respondToTerminalQueries: false,
    terminalQueryMode: "cursor",
    cursorWhenBlurred: true,
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
  if (controller === networkHostTerminal && networkDisplayTerminal !== null) return networkDisplayTerminal
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
  url.searchParams.set("key", controller.sessionKey)
  url.searchParams.set("tmux", controller.tmuxSession)
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
    writeStoredHostTerminalSessionId(controller.sessionStorageKey, message.sessionId)
    setHostTerminalStatus(controller, "connected", shellLabel(message.shell))
    if (voiceActiveTarget === null) setVoiceActiveTarget({kind: "host", controller})
    else scheduleVoiceAutoWake()
    if (controller.terminalSize !== null) sendHostTerminal(controller, {type: "terminal.resize", size: controller.terminalSize})
    const tmuxReady = message.tmuxSession === controller.tmuxSession
    if (controller.initialCommand !== null && !controller.initialCommandSent && !tmuxReady && !message.restored) {
      controller.initialCommandSent = true
      window.setTimeout(() => sendHostTerminalInput(controller, controller.initialCommand ?? "", "api"), 80)
    }
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
  controller.statusLabel = label
  if (controller === hostTerminal) {
    hostTerminalStatusLabelForLayout = label
    hostTerminalAgentSignalPane?.requestRender()
    controller.codexComposer.requestRender()
  }
  controller.connectionState = kind
  const paneKind = statusKindForHostTerminal(kind)
  for (const pane of hostTerminalPanes(controller)) pane.setStatus(paneKind, label)
}

function hostTerminalPanes(controller: HostTerminalController): TerminalPane[] {
  if (controller === networkHostTerminal && networkDisplayTerminal !== null) return [networkDisplayTerminal]
  return [controller.hudTerminal]
}

function updateHostTerminalHeaderControls(controller: HostTerminalController): void {
  if (controller !== hostTerminal) return
  const panes = hostTerminalPanes(controller)
  const pinned = panes.some((pane) => pane.isAutoscrollPinned())
  for (const pane of panes) {
    pane.setHeaderControls({
      primary: [
        {
          label: pinned ? "Автоскролл включен" : "Автоскролл выключен",
          iconSrc: pinned ? uiIcons.autoscroll : uiIcons.manual,
          tone: pinned ? "live" : "neutral",
          active: pinned,
          action: () => {
            const next = !pane.isAutoscrollPinned()
            for (const target of hostTerminalPanes(controller)) target.setAutoscrollPinned(next)
            updateHostTerminalHeaderControls(controller)
          },
        },
      ],
      secondary: [
        {
          label: "Клавиатура терминала",
          iconSrc: uiIcons.keyboard,
          tone: pane.softKeyboardInputMode() === "text" ? "live" : "neutral",
          active: pane.softKeyboardInputMode() === "text",
          action: () => {
            pane.openSoftKeyboard()
            updateHostTerminalHeaderControls(controller)
          },
        },
      ],
    })
  }
}

function setHostTerminalInputEnabled(controller: HostTerminalController, enabled: boolean): void {
  for (const pane of hostTerminalPanes(controller)) pane.setInputEnabled(enabled)
  if (controller === hostTerminal) controller.codexComposer.requestRender()
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

function readStoredHostTerminalSessionId(storageKey: string): string | null {
  try {
    const value = localStorage.getItem(storageKey)
    return value === null || value.length < 8 ? null : value
  } catch {
    return null
  }
}

function writeStoredHostTerminalSessionId(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value)
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

function readStoredHostCodexComposerRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeHostCodexComposerRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(HOST_TERMINAL_CODEX_COMPOSER_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredVoiceSettingsRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(VOICE_SETTINGS_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeVoiceSettingsRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(VOICE_SETTINGS_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function storeVoiceSettingsRectAndRelayout(rect: UiSurfaceRect): void {
  storeVoiceSettingsRect(rect)
  relayoutHudSurfaces()
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

function readStoredNetworkTerminalHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeNetworkTerminalHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(NETWORK_TERMINAL_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function previewNetworkTerminalHudRect(rect: UiSurfaceRect): void {
  networkHostTerminalHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeNetworkTerminalHudRectAndRelayout(rect: UiSurfaceRect): void {
  networkHostTerminalHudRectPreview = null
  storeNetworkTerminalHudRect(rect)
  relayoutHudSurfaces()
}

function readStoredAndroidHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(ANDROID_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeAndroidHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(ANDROID_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function previewAndroidHudRect(rect: UiSurfaceRect): void {
  androidHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeAndroidHudRectAndRelayout(rect: UiSurfaceRect): void {
  androidHudRectPreview = null
  storeAndroidHudRect(rect)
  relayoutHudSurfaces()
}

function readStoredSecondaryAndroidHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(SECONDARY_ANDROID_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeSecondaryAndroidHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(SECONDARY_ANDROID_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function previewSecondaryAndroidHudRect(rect: UiSurfaceRect): void {
  secondaryAndroidHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeSecondaryAndroidHudRectAndRelayout(rect: UiSurfaceRect): void {
  secondaryAndroidHudRectPreview = null
  storeSecondaryAndroidHudRect(rect)
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

function readStoredSqliteHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(SQLITE_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeSqliteHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect(rect)
  if (normalized === null) return
  try {
    localStorage.setItem(SQLITE_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function previewSqliteHudRect(rect: UiSurfaceRect): void {
  sqliteHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeSqliteHudRectAndRelayout(rect: UiSurfaceRect): void {
  sqliteHudRectPreview = null
  storeSqliteHudRect(rect)
  relayoutHudSurfaces()
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

function readStoredNetworkTerminalHudDocked(): boolean {
  try {
    const value = localStorage.getItem(NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY)
    return value === null ? true : value === "1"
  } catch {
    return true
  }
}

function writeStoredNetworkTerminalHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(NETWORK_TERMINAL_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredNetworkStatusAutoRefreshEnabled(): boolean {
  try {
    const value = localStorage.getItem(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY)
    return value === null ? true : value === "1"
  } catch {
    return true
  }
}

function writeStoredNetworkStatusAutoRefreshEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NETWORK_STATUS_AUTO_REFRESH_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredNetworkProductViaInterpreter(): boolean {
  try {
    return localStorage.getItem(NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeStoredNetworkProductViaInterpreter(enabled: boolean): void {
  try {
    localStorage.setItem(NETWORK_PRODUCT_INTERPRETER_STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredAndroidHudDocked(): boolean {
  try {
    const value = localStorage.getItem(ANDROID_HUD_DOCKED_STORAGE_KEY)
    return value === null ? true : value === "1"
  } catch {
    return true
  }
}

function writeStoredAndroidHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(ANDROID_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredSecondaryAndroidHudDocked(): boolean {
  try {
    const value = localStorage.getItem(SECONDARY_ANDROID_HUD_DOCKED_STORAGE_KEY)
    return value === null ? true : value === "1"
  } catch {
    return true
  }
}

function writeStoredSecondaryAndroidHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(SECONDARY_ANDROID_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function readStoredAndroidDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(ANDROID_DOCK_PLACEMENT_STORAGE_KEY)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<HostTerminalDockPlacement>
    if (!isHostTerminalDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
    return {edge: value.edge, offset: value.offset}
  } catch {
    return null
  }
}

function readStoredSecondaryAndroidDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(SECONDARY_ANDROID_DOCK_PLACEMENT_STORAGE_KEY)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<HostTerminalDockPlacement>
    if (!isHostTerminalDockEdge(value.edge) || typeof value.offset !== "number" || !Number.isFinite(value.offset)) return null
    return {edge: value.edge, offset: value.offset}
  } catch {
    return null
  }
}

function writeStoredAndroidDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(ANDROID_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function writeStoredSecondaryAndroidDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(SECONDARY_ANDROID_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
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

function readStoredSqliteHudDocked(): boolean {
  try {
    return localStorage.getItem(SQLITE_HUD_DOCKED_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function writeStoredSqliteHudDocked(docked: boolean): void {
  try {
    localStorage.setItem(SQLITE_HUD_DOCKED_STORAGE_KEY, docked ? "1" : "0")
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

function readStoredFullscreenDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY)
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

function readStoredSqliteDockPlacement(): HostTerminalDockPlacement | null {
  try {
    const raw = localStorage.getItem(SQLITE_DOCK_PLACEMENT_STORAGE_KEY)
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

function writeStoredFullscreenDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(FULLSCREEN_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
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

function writeStoredSqliteDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(SQLITE_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
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

function setFullscreenDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = fullscreenDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  fullscreenDockPlacement = placement
  writeStoredFullscreenDockPlacement(placement)
  fullscreenDockPane?.requestRender()
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

function setAndroidDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = androidDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  androidDockPlacement = placement
  writeStoredAndroidDockPlacement(placement)
  androidDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setSecondaryAndroidDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = secondaryAndroidDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  secondaryAndroidDockPlacement = placement
  writeStoredSecondaryAndroidDockPlacement(placement)
  secondaryAndroidDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setSqliteDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = sqliteDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  sqliteDockPlacement = placement
  writeStoredSqliteDockPlacement(placement)
  sqliteDockPane?.requestRender()
  relayoutHudSurfaces()
  updateSqliteContext()
}

function toggleBrowserFullscreenDock(): void {
  setSpaceOverviewPinned(false)
  displayHoverOutlinePane?.toggleBrowserFullscreen()
  fullscreenDockPane?.requestRender()
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

function setNetworkTerminalDocked(docked: boolean): unknown {
  if (!docked) return focusNetworkDisplay()
  const controller = ensureNetworkHostTerminalController()
  if (!networkHostTerminalHudDocked) {
    networkHostTerminalHudDocked = true
    writeStoredNetworkTerminalHudDocked(true)
  }
  if (uiCanvas !== null && controller.hudTerminal.isFocused()) {
    uiCanvas.setFocused(null)
    uiCanvas.inputProxy?.blur()
  }
  relayoutHudSurfaces()
  return networkTerminalPayload()
}

function focusNetworkDisplay(): unknown {
  setSpaceOverviewPinned(false)
  const controller = ensureNetworkHostTerminalController()
  ensureNetworkDisplay()
  if (controller.socket === null) connectHostTerminal(controller)
  uiCanvas?.focusDisplay(NETWORK_DISPLAY_ID)
  networkDisplayTerminal?.focus()
  syncNetworkStatusRefresh()
  return networkTerminalPayload()
}

function setAndroidHudDocked(docked: boolean): void {
  if (androidHudDocked === docked) return
  androidHudDocked = docked
  writeStoredAndroidHudDocked(docked)
  if (docked) {
    if (androidFrameRefreshTimer !== null) {
      window.clearTimeout(androidFrameRefreshTimer)
      androidFrameRefreshTimer = null
    }
    if (androidPane !== null && uiCanvas !== null) {
      uiCanvas.setFocused(null)
      uiCanvas.inputProxy?.blur()
    }
  } else {
    uiCanvas?.setFocused(androidPane)
    connectAndroidRtc()
  }
  androidPane?.requestRender()
  androidDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setSecondaryAndroidHudDocked(docked: boolean): void {
  if (secondaryAndroidHudDocked === docked) return
  secondaryAndroidHudDocked = docked
  writeStoredSecondaryAndroidHudDocked(docked)
  if (docked) {
    if (secondaryAndroidPane !== null && uiCanvas !== null) {
      uiCanvas.setFocused(null)
      uiCanvas.inputProxy?.blur()
    }
  } else {
    uiCanvas?.setFocused(secondaryAndroidPane)
    connectSecondaryAndroidRtc()
  }
  secondaryAndroidPane?.requestRender()
  secondaryAndroidDockPane?.requestRender()
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

function setSqliteHudDocked(docked: boolean): void {
  if (sqliteHudDocked === docked) return
  sqliteHudDocked = docked
  writeStoredSqliteHudDocked(docked)
  if (docked) {
    uiCanvas?.setFocused(null)
    uiCanvas?.inputProxy?.blur()
  }
  sqliteHudPane?.requestRender()
  sqliteDockPane?.requestRender()
  for (const controller of sqliteDisplays.values()) {
    controller.tables.requestRender()
    controller.rows.requestRender()
  }
  relayoutHudSurfaces()
  updateSqliteContext()
  if (!docked) {
    const controller = activeSqliteController()
    if (controller !== null) void refreshSqliteDisplay(controller, controller.selectedTable).catch((error) => {
      if (!isSqliteMissingError(error)) console.error(error)
    })
  }
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

function currentFullscreenDockEdge(): HudSideTabEdge {
  return fullscreenDockPlacement?.edge ?? DEFAULT_FULLSCREEN_DOCK_PLACEMENT.edge
}

function currentTodoDockEdge(): HudSideTabEdge {
  return todoDockPlacement?.edge ?? DEFAULT_TODO_DOCK_PLACEMENT.edge
}

function currentAndroidDockEdge(): HudSideTabEdge {
  return androidDockPlacement?.edge ?? DEFAULT_ANDROID_DOCK_PLACEMENT.edge
}

function currentSecondaryAndroidDockEdge(): HudSideTabEdge {
  return secondaryAndroidDockPlacement?.edge ?? DEFAULT_SECONDARY_ANDROID_DOCK_PLACEMENT.edge
}

function currentSqliteDockEdge(): HudSideTabEdge {
  return sqliteDockPlacement?.edge ?? DEFAULT_SQLITE_DOCK_PLACEMENT.edge
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

function createSqliteDisplayController(id: string, path: string): SqliteDisplayController {
  const controller = {} as SqliteDisplayController
  const label = sqliteInitialLabel(path)
  Object.assign(controller, {
    id,
    requestedPath: path,
    path,
    label,
    version: null,
    selectedTable: null,
    payload: null,
    loading: null,
    refreshCheck: null,
    suppressTableSelectionOpen: false,
    tables: new FileListPane({
      title: label,
      items: [],
      selectedIds: [],
      selectionMode: "single",
      showHeader: true,
      theme: {
        surface: {
          background: HUD_PANEL_BG,
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
    }, () => updateSqliteContext()),
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
      selectionMode: "multiple",
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
        if (ids.length !== 1) return
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
    breakpointRegistrationsLoaded: false,
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
    breakpointsActiveCommand: null,
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
    catalogPaths: [],
    items: [],
    expandedIds: storedState.expandedIds,
    selectedIds: storedState.selectedIds,
    openedFileIds: storedState.openedFileIds,
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
      const storageKey = workspaceFilesStorageKey(data.root, controller.id)
      const storedState = readStoredWorkspaceFilesState(storageKey)
      const root = data.root ?? null
      const workspacePath = normalizeWorkspacePath(data.workspacePath ?? "")
      const catalogFileIds = new Set(workspaceFileIds(workspaceFileTree(paths)))
      const currentOpenedFileIds = currentWorkspaceFileCandidates(controller)
        .map((source) => workspaceFileIdForSourcePath({root, workspacePath, items: []}, source))
        .filter((id): id is string => id !== null)
      const openedFileIds = normalizeWorkspaceOpenedFileIds([...storedState.openedFileIds, ...currentOpenedFileIds])
        .filter((id) => catalogFileIds.has(id))
      const items = workspaceFileItems(paths, openedFileIds)
      controller.workspaceFiles.root = root
      controller.workspaceFiles.workspacePath = workspacePath
      controller.workspaceFiles.modulePath = data.entrypoint ?? data.modulePath ?? controller.workspaceFiles.modulePath
      controller.workspaceFiles.rootLabel = workspaceRootLabel(data.root)
      controller.workspaceFiles.catalogPaths = paths
      controller.workspaceFiles.items = items
      controller.workspaceFiles.storageKey = storageKey
      controller.workspaceFiles.openedFileIds = openedFileIds
      controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(storedState.expandedIds, items)
      controller.workspaceFiles.selectedIds = normalizeFileListSelection(storedState.selectedIds, items, "multiple")
      writeStoredWorkspaceFilesState(controller)
      applyWorkspaceFilesToModuleDisplay(controller)
      void openInitialWorkspaceSource(controller).catch((error) => {
        console.warn(`initial source open failed for ${controller.id}:`, error)
      })
    } catch (error) {
      console.warn(`workspace files refresh failed for ${controller.id}:`, error)
      controller.workspaceFiles.root = null
      controller.workspaceFiles.workspacePath = ""
      controller.workspaceFiles.rootLabel = null
      controller.workspaceFiles.catalogPaths = []
      controller.workspaceFiles.items = []
      controller.workspaceFiles.expandedIds = []
      controller.workspaceFiles.selectedIds = []
      controller.workspaceFiles.openedFileIds = []
      applyWorkspaceFilesToModuleDisplay(controller)
    } finally {
      controller.workspaceFiles.loading = null
    }
  })()
  return controller.workspaceFiles.loading
}

function workspaceFileItems(catalogPaths: readonly string[], openedFileIds: readonly string[]): FileListItem[] {
  const catalogItems = workspaceFileTree(catalogPaths)
  const catalogFileIds = new Set(workspaceFileIds(catalogItems))
  const mutedFileIds = openedFileIds.filter((id) => !catalogFileIds.has(id))
  return workspaceFileTree([...catalogPaths, ...mutedFileIds], {mutedFileIds})
}

function normalizeWorkspaceOpenedFileIds(ids: readonly string[]): string[] {
  const next: string[] = []
  for (const id of ids) {
    const fileId = workspaceFileIdForSourcePath({
      root: null,
      workspacePath: "",
      items: [],
    }, id)
    if (fileId === null || next.includes(fileId)) continue
    next.push(fileId)
  }
  return next
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

async function openInitialWorkspaceSource(controller: ModuleDisplayController): Promise<void> {
  if (!shouldOpenInitialWorkspaceSource(controller)) return
  const sourceUrl = initialWorkspaceSourceUrl(controller)
  if (sourceUrl === null) return
  await openWorkspaceSource(controller, sourceUrl, {revealInWorkspace: true})
}

function shouldOpenInitialWorkspaceSource(controller: ModuleDisplayController): boolean {
  if (controller.sourceDirty || controller.sourceSaving) return false
  if (controller.sourceTextKey.length > 0 || controller.sourceLocation.length > 0) return false
  if (controller.sourceRuntimeState === "loading" || controller.sourceRuntimeState === "paused") return false
  const snapshot = moduleSnapshots.get(controller.id)
  return !(snapshot?.paused === true && snapshot.dump !== null)
}

function initialWorkspaceSourceUrl(controller: ModuleDisplayController): string | null {
  const selectedFiles = controller.workspaceFiles.selectedIds
    .map((id) => findWorkspaceFileItem(controller.workspaceFiles.items, id))
    .filter((item): item is FileListItem => item?.kind === "file")
  if (selectedFiles.length === 1) return workspaceFileSourceUrl(controller, selectedFiles[0]!)

  const modulePath = controller.workspaceFiles.modulePath
  if (modulePath !== null && modulePath.trim().length > 0) {
    const moduleFileId = workspaceFileIdForSources(controller.workspaceFiles, [modulePath])
    const moduleFile = moduleFileId === null ? null : findWorkspaceFileItem(controller.workspaceFiles.items, moduleFileId)
    if (moduleFile?.kind === "file") return workspaceFileSourceUrl(controller, moduleFile)
  }
  return null
}

function findWorkspaceFileItem(items: readonly FileListItem[], id: string): FileListItem | null {
  for (const item of items) {
    if (item.id === id) return item
    const child = item.children === undefined ? null : findWorkspaceFileItem(item.children, id)
    if (child !== null) return child
  }
  return null
}

function setWorkspaceFilesExpandedIds(controller: ModuleDisplayController, ids: readonly string[]): void {
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(ids, controller.workspaceFiles.items)
  writeStoredWorkspaceFilesState(controller)
  controller.files.setExpandedIds(controller.workspaceFiles.expandedIds)
}

function updateWorkspaceFilesSelectedState(controller: ModuleDisplayController, ids: readonly string[]): void {
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(ids, controller.workspaceFiles.items, "multiple")
  writeStoredWorkspaceFilesState(controller)
  queuePublishModuleContext(controller)
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

function addOpenedWorkspaceSource(controller: ModuleDisplayController, sourceUrl: string): string | null {
  const fileId = workspaceFileIdForSourcePath(controller.workspaceFiles, sourceUrl)
  if (fileId === null) return null

  const openedFileIds = normalizeWorkspaceOpenedFileIds([...controller.workspaceFiles.openedFileIds, fileId])
  const items = workspaceFileItems(controller.workspaceFiles.catalogPaths, openedFileIds)
  const changed = !sameStringArray(openedFileIds, controller.workspaceFiles.openedFileIds)
    || findWorkspaceFileItem(controller.workspaceFiles.items, fileId)?.kind !== "file"
  if (!changed) return fileId

  controller.workspaceFiles.openedFileIds = openedFileIds
  controller.workspaceFiles.items = items
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(controller.workspaceFiles.expandedIds, items)
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(controller.workspaceFiles.selectedIds, items, "multiple")
  writeStoredWorkspaceFilesState(controller)
  applyWorkspaceFilesToModuleDisplay(controller)
  return fileId
}

function removeOpenedWorkspaceSource(controller: ModuleDisplayController, sourceUrl: string): boolean {
  const fileId = workspaceFileIdForSourcePath(controller.workspaceFiles, sourceUrl)
  if (fileId === null) return false
  const openedFileIds = controller.workspaceFiles.openedFileIds.filter((id) => id !== fileId)
  const items = workspaceFileItems(controller.workspaceFiles.catalogPaths, openedFileIds)
  const changed = openedFileIds.length !== controller.workspaceFiles.openedFileIds.length ||
    findWorkspaceFileItem(controller.workspaceFiles.items, fileId)?.kind === "file"
  if (!changed) return false

  controller.workspaceFiles.openedFileIds = openedFileIds
  controller.workspaceFiles.items = items
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(controller.workspaceFiles.expandedIds, items)
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(controller.workspaceFiles.selectedIds.filter((id) => id !== fileId), items, "multiple")
  writeStoredWorkspaceFilesState(controller)
  applyWorkspaceFilesToModuleDisplay(controller)
  return true
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
  if (shouldRevealWorkspaceForSourceOpen(options)) revealWorkspaceSource(controller, sourceUrl)
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
      if (isMissingWorkspaceSourceError(error)) removeOpenedWorkspaceSource(controller, sourceUrl)
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
    const openedFileId = addOpenedWorkspaceSource(controller, responseSourceUrl) ?? addOpenedWorkspaceSource(controller, sourceUrl)
    applySourceOpenPosition(controller, options)
    if (shouldRevealWorkspaceForSourceOpen(options)) {
      if (openedFileId === null) {
        revealWorkspaceSource(controller, responseSourceUrl)
      } else {
        revealWorkspaceFileId(controller, openedFileId)
      }
    }
    return {
      ok: true,
      sourceUrl: responseSourceUrl,
      location: responseSourceUrl,
      scriptUrl: responseScriptUrl,
      sourceKind: data.sourceKind ?? null,
    }
  } catch (error) {
    const message = String(error)
    if (isMissingWorkspaceSourceError(message)) removeOpenedWorkspaceSource(controller, sourceUrl)
    setModuleSource(controller, {
      text: `fetch failed: ${message}`,
      currentLine: 0,
      location,
      identity,
    }, "idle", false)
    return {ok: false, sourceUrl, location, error: message}
  }
}

function isMissingWorkspaceSourceError(value: unknown): boolean {
  return /not found|enoent|no such file|notfounderror/i.test(String(value))
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

  const stored = readStoredBreakpointSpecs(controller.id)
  const nextStored = stored.map((spec) => {
    if (!breakpointSpecMatchesSource(spec, source)) return spec
    const nextLine = remapSourceLine(spec.line, lineChanges)
    return nextLine === spec.line ? spec : {...spec, line: nextLine}
  })
  if (nextStored.some((spec, index) => spec.line !== stored[index]?.line)) {
    writeStoredBreakpointSpecs(controller.id, nextStored)
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
  const refreshFileTree = sourcePatchChangesWorkspaceFileTree(msg)
  for (const controller of moduleDisplays.values()) {
    clearPatchedSourceCache(controller, patchedKeys)
    if (refreshFileTree) void refreshWorkspaceFiles(controller)
    const sourceUrl = controllerPatchedSourceUrl(controller, patchedKeys)
    if (sourceUrl === undefined) continue
    if (controller.sourceDirty || controller.sourceSaving) continue
    void refreshOpenSourceFromDisk(controller, sourceUrl)
  }
  void openSourcePatchedTarget(msg)
}

function sourcePatchChangesWorkspaceFileTree(msg: Extract<ServerMessage, {type: "source-patched"}>): boolean {
  return msg.files.some((file) => file.operation === "add" || file.operation === "delete" || file.operation === "move")
}

type SourcePatchedEditorTarget = {
  sourceUrl: string
  line: number
  column: number
}

function sourcePatchedEditorTarget(files: readonly SourcePatchedFile[]): SourcePatchedEditorTarget | null {
  const file = files.find((item) => item.operation !== "delete" && sourcePatchedFileSourceUrl(item) !== null)
  if (file === undefined) return null
  const sourceUrl = sourcePatchedFileSourceUrl(file)
  if (sourceUrl === null) return null
  const firstChange = file.lineChanges?.[0]
  const line = firstChange === undefined ? 1 : Math.max(1, Math.floor(firstChange.newStart))
  return {sourceUrl, line, column: 0}
}

function sourcePatchedFileSourceUrl(file: SourcePatchedFile): string | null {
  const sourceUrl = file.sourceUrl.trim()
  if (sourceUrl.length > 0) return sourceUrl
  const path = file.path.trim()
  return path.length === 0 ? null : path
}

async function openSourcePatchedTarget(msg: Extract<ServerMessage, {type: "source-patched"}>): Promise<void> {
  const controller = moduleDisplays.get(msg.moduleId)
  if (controller === undefined || controller.sourceDirty || controller.sourceSaving) return
  const target = sourcePatchedEditorTarget(msg.files)
  if (target === null) return
  uiCanvas?.focusDisplay(moduleDisplayId(controller.id))
  const result = await openWorkspaceSource(controller, target.sourceUrl, {
    line: target.line,
    column: target.column,
    revealInWorkspace: true,
  })
  if (!result.ok) return
  uiCanvas?.setFocused(controller.source)
  uiCanvas?.inputProxy?.focus()
  queuePublishModuleContext(controller)
}

function applySourcePatchedBreakpoints(msg: Extract<ServerMessage, {type: "source-patched"}>): void {
  const updates = msg.breakpoints ?? []
  if (updates.length === 0) return
  const patchedKeys = msg.files.flatMap((file) => sourcePatchFileKeys(file))
  for (const update of updates) {
    const controller = moduleDisplays.get(update.moduleId)
    if (controller !== undefined) {
      controller.breakpointRegistrations = update.breakpoints
      controller.breakpointRegistrationsLoaded = true
      syncModuleBreakpointMarkers(controller)
    }
    replaceStoredBreakpointSpecsForPatchedKeys(
      update.moduleId,
      patchedKeys,
      update.breakpoints.map((registration) => registration.spec),
    )
  }
}

function handleBreakpointsChanged(msg: Extract<ServerMessage, {type: "breakpoints-changed"}>): void {
  const registrations = msg.breakpoints.filter(isBreakpointRegistration)
  writeStoredBreakpointSpecs(msg.moduleId, registrations.map((registration) => registration.spec))
  const controller = moduleDisplays.get(msg.moduleId)
  if (controller === undefined) return
  controller.breakpointRegistrations = registrations
  controller.breakpointRegistrationsLoaded = true
  syncModuleBreakpointMarkers(controller)
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

function breakpointSpecMatchesPatchedKeys(spec: BreakpointSpec, patchedKeys: readonly string[]): boolean {
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
  if (options.selection !== undefined) {
    const anchor = sourceOpenPositionToEditor(options.selection.anchor)
    const focus = sourceOpenPositionToEditor(options.selection.focus)
    controller.source.setSelection(anchor.line, anchor.col, focus.line, focus.col, {scroll: "top"})
    return
  }
  if (options.line === undefined) return
  const line = Math.max(1, Math.floor(options.line))
  const column = Math.max(0, Math.floor(options.column ?? 0))
  controller.source.setCursor(line - 1, column)
}

function sourceOpenPositionToEditor(pos: SourceOpenPosition): {line: number; col: number} {
  return {
    line: Math.max(0, Math.floor(pos.line) - 1),
    col: Math.max(0, Math.floor(pos.column)),
  }
}

function workspaceFileSourceUrl(controller: ModuleDisplayController, item: FileListItem): string {
  return workspaceFileItemSourceUrl(controller.workspaceFiles.root, item)
}

function revealCurrentWorkspaceFile(controller: ModuleDisplayController): void {
  const fileId = currentWorkspaceFileId(controller) ?? addCurrentWorkspaceFile(controller)
  if (fileId === null) return
  revealWorkspaceFileId(controller, fileId)
  controller.files.focus()
}

function currentWorkspaceFileId(controller: ModuleDisplayController): string | null {
  return workspaceFileIdForSources(controller.workspaceFiles, currentWorkspaceFileCandidates(controller))
}

function addCurrentWorkspaceFile(controller: ModuleDisplayController): string | null {
  for (const candidate of currentWorkspaceFileCandidates(controller)) {
    const fileId = addOpenedWorkspaceSource(controller, candidate)
    if (fileId !== null) return fileId
  }
  return null
}

function currentWorkspaceFileCandidates(controller: ModuleDisplayController): string[] {
  return [
    controller.sourceLocation,
    controller.sourceIdentity?.sourceUrl,
    controller.sourceIdentity?.scriptUrl,
    controller.sourceIdentity?.key,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
}

function revealWorkspaceSource(controller: ModuleDisplayController, sourceUrl: string): void {
  const reveal = workspaceFileRevealState(controller.workspaceFiles, [sourceUrl])
  if (reveal === null) return
  setWorkspaceFilesExpandedIds(controller, reveal.expandedIds)
  setWorkspaceFilesSelectedIds(controller, reveal.selectedIds)
}

function revealWorkspaceFileId(controller: ModuleDisplayController, fileId: string): void {
  setWorkspaceFilesExpandedIds(controller, [...new Set([...controller.workspaceFiles.expandedIds, ...workspaceParentIds(fileId)])])
  setWorkspaceFilesSelectedIds(controller, [fileId])
}

function workspaceFilesStorageKey(root: string | undefined, moduleId: string): string {
  const normalized = root?.trim().replaceAll("\\", "/").replace(/\/+$/, "")
  const rootKey = normalized === undefined || normalized.length === 0 ? "default" : normalized
  return `${WORKSPACE_FILES_STATE_STORAGE_PREFIX}:${moduleId}:${rootKey}`
}

function readStoredWorkspaceFilesState(storageKey: string): WorkspaceFilesStoredState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw === null) return {expandedIds: [], selectedIds: [], openedFileIds: []}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      expandedIds: storedStringArray(parsed.expandedIds),
      selectedIds: storedStringArray(parsed.selectedIds),
      openedFileIds: normalizeWorkspaceOpenedFileIds(storedStringArray(parsed.openedFileIds)),
    }
  } catch {
    return {expandedIds: [], selectedIds: [], openedFileIds: []}
  }
}

function writeStoredWorkspaceFilesState(controller: ModuleDisplayController): void {
  try {
    localStorage.setItem(controller.workspaceFiles.storageKey, JSON.stringify({
      expandedIds: controller.workspaceFiles.expandedIds,
      selectedIds: controller.workspaceFiles.selectedIds,
      openedFileIds: controller.workspaceFiles.openedFileIds,
    }))
  } catch {
    // Storage can be disabled in private contexts.
  }
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
  const breakpointsCommandIdle = controller.breakpointsActiveCommand === null
  const canPause = commandIdle && canControlExecution && !module.paused
  const canResume = commandIdle && canControlExecution && module.paused
  const canStep = commandIdle && canControlExecution && module.paused
  const canToggleBreakpointsActive = commandIdle && breakpointsCommandIdle
  const canRestart = commandIdle && module.target.command.length > 0
  const canStop = commandIdle && targetRunning
  const canShowExecutionPoint = commandIdle && canControlExecution && module.paused && controller.dump !== undefined && controller.dump.frames.length > 0
  const breakpointsActive = module.breakpointsActive
  const nextBreakpointsActive = !breakpointsActive

  controller.terminal.setHeaderControls({
    primary: [
      runKind === "live"
        ? {
          label: t("pause"),
          iconSrc: uiIcons.debugPause,
          tone: pauseButtonTone(runKind),
          dividerAfter: true,
          disabled: !canPause,
          action: () => void runModuleInterpreterCommand(controller, "pause", {}, t("pause")),
        }
        : {
          label: t("resume"),
          iconSrc: uiIcons.debugResume,
          tone: resumeButtonTone(runKind),
          dividerAfter: true,
          disabled: !canResume,
          action: () => void runModuleInterpreterCommand(controller, "resume", {}, t("resume")),
        },
      {
        label: t("stepOver"),
        iconSrc: uiIcons.debugStepOver,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "over"}, t("stepOver")),
      },
      {
        label: t("stepInto"),
        iconSrc: uiIcons.debugStepInto,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "into"}, t("stepInto")),
      },
      {
        label: t("stepOut"),
        iconSrc: uiIcons.debugStepOut,
        tone: stepButtonTone(runKind),
        disabled: !canStep,
        action: () => void runModuleInterpreterCommand(controller, "step", {kind: "out"}, t("stepOut")),
      },
      {
        label: t("restartTarget"),
        iconSrc: uiIcons.debugRestart,
        tone: "neutral",
        disabled: !canRestart,
        action: () => void restartModule(controller.id),
      },
      {
        label: t("stopTarget"),
        iconSrc: uiIcons.debugStop,
        tone: "warn",
        disabled: !canStop,
        dividerAfter: true,
        action: () => void stopModule(controller.id),
      },
      {
        label: breakpointsActive ? t("muteBreakpoints") : t("unmuteBreakpoints"),
        iconSrc: breakpointsActive ? uiIcons.breakpointActive : uiIcons.breakpointDisabled,
        tone: breakpointsActive ? "warn" : "neutral",
        disabled: !canToggleBreakpointsActive,
        action: () => void runModuleBreakpointsActiveCommand(
          controller,
          nextBreakpointsActive,
        ),
      },
      {
        label: t("showExecutionPoint"),
        iconSrc: uiIcons.debugExecutionPoint,
        tone: canShowExecutionPoint ? "paused" : "neutral",
        disabled: !canShowExecutionPoint,
        action: () => showModuleExecutionPoint(controller),
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

async function runModuleBreakpointsActiveCommand(controller: ModuleDisplayController, active: boolean): Promise<CommandReply> {
  if (controller.breakpointsActiveCommand !== null) {
    return {ok: false, error: `${t("commandAlreadyRunning")}: ${controller.breakpointsActiveCommand.label}`}
  }
  const label = active ? t("unmuteBreakpoints") : t("muteBreakpoints")
  const command: ActiveInterpreterCommand = {
    cmd: active ? "unmuteBreakpoints" : "muteBreakpoints",
    label,
    startedAt: performance.now(),
  }
  controller.breakpointsActiveCommand = command
  const snapshot = moduleSnapshots.get(controller.id)
  if (snapshot !== undefined) updateModuleHeaderControls(controller, snapshot)
  try {
    const response = await send(command.cmd, {}, controller.id)
    if (!response.ok) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${label}: ${response.error ?? "unknown error"}`,
      })
    }
    return response
  } finally {
    if (controller.breakpointsActiveCommand === command) controller.breakpointsActiveCommand = null
    const nextSnapshot = moduleSnapshots.get(controller.id)
    if (nextSnapshot !== undefined) updateModuleHeaderControls(controller, nextSnapshot)
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
  const label = line.stream === "stderr" ? ansiMuted("std") : ansiCyan("out")
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
    controller.breakpointRegistrationsLoaded = true
    mergeStoredBreakpointSpecs(controller.id, controller.breakpointRegistrations.map((registration) => registration.spec))
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
  const registeredKeys = new Set(controller.breakpointRegistrations.map((registration) => breakpointSpecKey(registration.spec)))
  const missing = readStoredBreakpointSpecs(controller.id).filter((spec) => !registeredKeys.has(breakpointSpecKey(spec)))
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
      if (Array.isArray(data.breakpoints)) {
        controller.breakpointRegistrations = data.breakpoints.filter(isBreakpointRegistration)
        controller.breakpointRegistrationsLoaded = true
        writeStoredBreakpointSpecs(controller.id, controller.breakpointRegistrations.map((registration) => registration.spec))
      }
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
  const stored = existing === undefined ? storedBreakpointSpecForLine(controller.id, source, sourceLine) : undefined
  controller.pendingBreakpointLines.add(sourceLine)
  syncModuleBreakpointMarkers(controller)

  if (stored !== undefined) {
    removeStoredBreakpointSpec(controller.id, stored)
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
      controller.breakpointRegistrationsLoaded = true
    } else {
      await refreshModuleBreakpoints(controller)
    }
    if (nextSpec !== null) mergeStoredBreakpointSpecs(controller.id, [nextSpec])
    if (existing !== undefined) removeStoredBreakpointSpec(controller.id, existing.spec)
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

function storedBreakpointSpecForLine(processId: string, source: BreakpointSourceIdentity, line: number): BreakpointSpec | undefined {
  return readStoredBreakpointSpecs(processId).find((spec) => (
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

function readStoredBreakpointSpecs(processId: string): BreakpointSpec[] {
  return readProcessBreakpointSpecs(localStorage, processId)
}

function mergeStoredBreakpointSpecs(processId: string, specs: readonly BreakpointSpec[]): void {
  mergeProcessBreakpointSpecs(localStorage, processId, specs)
}

function removeStoredBreakpointSpec(processId: string, spec: BreakpointSpec): void {
  removeProcessBreakpointSpec(localStorage, processId, spec)
}

function writeStoredBreakpointSpecs(processId: string, specs: readonly BreakpointSpec[]): void {
  writeProcessBreakpointSpecs(localStorage, processId, specs)
}

function replaceStoredBreakpointSpecsForPatchedKeys(
  processId: string,
  patchedKeys: readonly string[],
  specs: readonly BreakpointSpec[],
): void {
  const next = readStoredBreakpointSpecs(processId).filter((spec) => !breakpointSpecMatchesPatchedKeys(spec, patchedKeys))
  next.push(...specs.filter((spec) => breakpointSpecMatchesPatchedKeys(spec, patchedKeys)))
  writeStoredBreakpointSpecs(processId, next)
}

function breakpointSpecKey(spec: BreakpointSpec): string {
  return storedBreakpointSpecKey(spec)
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

function pointInUiRect(x: number, y: number, rect: UiSurfaceRect): boolean {
  if (rect.visible === false) return false
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

function hostTerminalHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (hostTerminalHudDocked) return hiddenRect()
  const composerReserve = HOST_TERMINAL_CODEX_COMPOSER_H + HOST_TERMINAL_CODEX_COMPOSER_GAP + 12
  if (hostTerminalHudRectPreview !== null) return clampHostTerminalHudRect(hostTerminalHudRectPreview, w, h, composerReserve)
  const stored = readStoredHostTerminalHudRect()
  if (stored !== null) return clampHostTerminalHudRect(stored, w, h, composerReserve)
  return clampHostTerminalHudRect(DEFAULT_HOST_TERMINAL_HUD_RECT, w, h, composerReserve)
}

function hostCodexComposerRect(bounds: {w: number; h: number}): UiSurfaceRect {
  if (hostTerminalHudDocked) return hiddenRect()
  const terminal = hostTerminalHudRect(bounds)
  if (terminal.visible === false) return hiddenRect()
  const maxW = Math.max(1, bounds.w - 24)
  const maxH = Math.max(1, bounds.h - 24)
  const fallbackW = Math.min(Math.max(1, terminal.w), maxW)
  const fallbackH = Math.min(HOST_TERMINAL_CODEX_COMPOSER_H, maxH)
  const belowY = terminal.y + terminal.h + HOST_TERMINAL_CODEX_COMPOSER_GAP
  const fallbackY = belowY + fallbackH <= bounds.h - 12
    ? belowY
    : Math.max(12, terminal.y - fallbackH - HOST_TERMINAL_CODEX_COMPOSER_GAP)
  const raw = readStoredHostCodexComposerRect() ?? {
    x: terminal.x,
    y: fallbackY,
    w: fallbackW,
    h: fallbackH,
  }
  const rectW = clampNumber(raw.w, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_W, maxW), maxW)
  const rectH = clampNumber(raw.h, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_H, maxH), maxH)
  return {
    x: clampNumber(raw.x, 12, Math.max(12, bounds.w - rectW - 12)),
    y: clampNumber(raw.y, 12, Math.max(12, bounds.h - rectH - 12)),
    w: rectW,
    h: rectH,
  }
}

function hostCodexEditorRect(bounds: {w: number; h: number}): UiSurfaceRect {
  return hostCodexEditorRectForComposer(hostCodexComposerRect(bounds))
}

function hostCodexEditorRectForComposer(composer: UiSurfaceRect): UiSurfaceRect {
  if (composer.visible === false) return hiddenRect()
  const editorH = hostCodexComposerEditorHeight(composer.h, (hostTerminal?.codexAttachments.length ?? 0) > 0)
  return {
    x: composer.x + HOST_TERMINAL_CODEX_COMPOSER_PAD,
    y: composer.y + PANE_FRAME.headerHeight + PANE_FRAME.bodyTopGap,
    w: Math.max(1, composer.w - HOST_TERMINAL_CODEX_COMPOSER_PAD * 2),
    h: editorH,
  }
}

function syncHostCodexEditorToComposer(controller: HostTerminalController, composer: UiSurfaceRect, mode: "drag" | "release"): void {
  if (uiCanvas === null) return
  if (mode === "drag") {
    uiCanvas.setSurfaceRect(controller.codexEditor, hostCodexEditorRectForComposer(composer))
    return
  }
  uiCanvas.clearSurfaceRect(controller.codexEditor)
  uiCanvas.relayout()
}

function networkTerminalHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (networkHostTerminalHudDocked) return hiddenRect()
  if (networkHostTerminalHudRectPreview !== null) return clampHostTerminalHudRect(networkHostTerminalHudRectPreview, w, h)
  const stored = readStoredNetworkTerminalHudRect()
  if (stored !== null) return clampHostTerminalHudRect(stored, w, h)
  return clampHostTerminalHudRect(DEFAULT_NETWORK_TERMINAL_HUD_RECT, w, h)
}

function networkDisplayControlsRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!networkDisplayUsesColumns(w)) return {x: 0, y: 0, w, h: networkDisplayControlsFallbackHeight(h)}
  return {x: 0, y: 0, w: networkDisplayInfoWidth(w), h}
}

function networkDisplayTerminalRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!networkDisplayUsesColumns(w)) {
    const headerH = networkDisplayControlsFallbackHeight(h)
    return {
      x: 0,
      y: headerH,
      w,
      h: Math.max(1, h - headerH),
    }
  }
  const infoW = networkDisplayInfoWidth(w)
  const x = infoW + NETWORK_DISPLAY_COLUMN_GAP
  return {
    x,
    y: 0,
    w: Math.max(1, w - x),
    h,
  }
}

function networkDisplayUsesColumns(displayW: number): boolean {
  return displayW >= NETWORK_DISPLAY_COLUMN_MIN_W
}

function networkDisplayInfoWidth(displayW: number): number {
  return Math.min(NETWORK_DISPLAY_INFO_MAX_W, Math.max(NETWORK_DISPLAY_INFO_MIN_W, Math.floor(displayW * NETWORK_DISPLAY_INFO_RATIO)))
}

function networkDisplayControlsFallbackHeight(displayH: number): number {
  return Math.min(420, Math.max(220, Math.floor(displayH * 0.42)))
}

function androidHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (androidHudDocked) return hiddenRect()
  if (w < ANDROID_HUD_MIN_W || h < ANDROID_HUD_MIN_H) return hiddenRect()
  if (androidHudRectPreview !== null) return clampAndroidHudRect(androidHudRectPreview, w, h)
  const stored = readStoredAndroidHudRect()
  if (stored !== null) return clampAndroidHudRect(stored, w, h)
  return clampAndroidHudRect(DEFAULT_ANDROID_HUD_RECT, w, h)
}

function secondaryAndroidHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (secondaryAndroidHudDocked) return hiddenRect()
  if (w < ANDROID_HUD_MIN_W || h < ANDROID_HUD_MIN_H) return hiddenRect()
  if (secondaryAndroidHudRectPreview !== null) return clampAndroidHudRect(secondaryAndroidHudRectPreview, w, h)
  const stored = readStoredSecondaryAndroidHudRect()
  if (stored !== null) return clampAndroidHudRect(stored, w, h)
  return clampAndroidHudRect(DEFAULT_SECONDARY_ANDROID_HUD_RECT, w, h)
}

function todoHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (todoHudDocked) return hiddenRect()
  if (w < TODO_HUD_MIN_W || h < TODO_HUD_MIN_H) return hiddenRect()
  if (todoHudRectPreview !== null) return clampTodoHudRect(todoHudRectPreview, w, h)
  const stored = readStoredTodoHudRect()
  if (stored !== null) return clampTodoHudRect(stored, w, h)
  return clampTodoHudRect(DEFAULT_TODO_HUD_RECT, w, h)
}

function sqliteHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (activeSqliteController() === null || sqliteHudDocked) return hiddenRect()
  if (sqliteHudRectPreview !== null) return clampSqliteHudRect(sqliteHudRectPreview, w, h)
  const stored = readStoredSqliteHudRect()
  if (stored !== null) return clampSqliteHudRect(stored, w, h)
  return clampSqliteHudRect(DEFAULT_SQLITE_HUD_RECT, w, h)
}

function sqliteHudRects(controllerId: string, bounds: {w: number; h: number}): SqliteRects {
  if (activeSqliteController()?.id !== controllerId || sqliteHudDocked) {
    return {tables: hiddenRect(), rows: hiddenRect()}
  }
  const panel = sqliteHudRect(bounds)
  if (panel.visible === false) return {tables: hiddenRect(), rows: hiddenRect()}
  const pad = SQLITE_HUD_CONTENT_PAD
  const x = panel.x + pad
  const y = panel.y + SQLITE_HUD_HEADER_H + pad
  const bodyW = Math.max(1, panel.w - pad * 2)
  const bodyH = Math.max(1, panel.h - SQLITE_HUD_HEADER_H - pad * 2)
  const tablesW = panel.w >= 900
    ? Math.min(300, Math.max(230, Math.floor(bodyW * 0.24)))
    : Math.min(245, Math.max(180, Math.floor(bodyW * 0.32)))
  return {
    tables: {x, y, w: tablesW, h: bodyH},
    rows: {x: x + tablesW + GAP, y, w: Math.max(1, bodyW - tablesW - GAP), h: bodyH},
  }
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

function voiceHudSurfaceRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (voiceHudPane?.settingsOpen() === true) return voiceSettingsRect({w, h})
  if (!VOICE_INPUT_HUD_VISIBLE) return hiddenRect()
  return voiceHudRect({w, h})
}

function voiceHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  return voiceHudRectFromAnchor(PINNED_VOICE_HUD_ANCHOR, w, h)
}

function voiceSettingsRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (voiceHudPane?.settingsOpen() !== true) return hiddenRect()
  if (w < 80 || h < 80) return hiddenRect()
  const margin = VOICE_SETTINGS_MARGIN
  const rectW = Math.min(VOICE_SETTINGS_W, Math.max(1, w - margin * 2))
  const rectH = Math.min(VOICE_SETTINGS_H, Math.max(1, h - margin * 2))
  const stored = readStoredVoiceSettingsRect()
  if (stored !== null) return clampVoiceSettingsRect(stored, w, h)
  return clampVoiceSettingsRect({
    x: Math.max(margin, w - rectW - margin),
    y: Math.max(margin, Math.round((h - rectH) / 2)),
    w: rectW,
    h: rectH,
  }, w, h)
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

function clampVoiceSettingsRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const margin = boundsW >= 32 && boundsH >= 32 ? VOICE_SETTINGS_MARGIN : 0
  const w = Math.min(Math.max(1, Math.round(rect.w)), Math.max(1, Math.round(boundsW - margin * 2)))
  const h = Math.min(Math.max(1, Math.round(rect.h)), Math.max(1, Math.round(boundsH - margin * 2)))
  return {
    x: clampNumber(rect.x, margin, Math.max(margin, boundsW - margin - w)),
    y: clampNumber(rect.y, margin, Math.max(margin, boundsH - margin - h)),
    w,
    h,
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

function hostTerminalDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!hostTerminalHudDocked || w < 80 || h < 80) return hiddenRect()
  return hostTerminalDockRectForPlacement(hostTerminalDockPlacement ?? defaultHostTerminalDockPlacement({w, h}), {w, h})
}

function todoDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!todoHudDocked || w < 80 || h < 80) return hiddenRect()
  return todoDockRectForPlacement(todoDockPlacement ?? defaultTodoDockPlacement({w, h}), {w, h})
}

function androidDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!androidHudDocked || w < 80 || h < 80) return hiddenRect()
  return androidDockRectForPlacement(androidDockPlacement ?? defaultAndroidDockPlacement({w, h}), {w, h})
}

function secondaryAndroidDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!secondaryAndroidHudDocked || w < 80 || h < 80) return hiddenRect()
  return androidDockRectForPlacement(secondaryAndroidDockPlacement ?? defaultSecondaryAndroidDockPlacement({w, h}), {w, h})
}

function sqliteDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!sqliteHudDocked || activeSqliteController() === null || w < 80 || h < 80) return hiddenRect()
  return sqliteDockRectForPlacement(sqliteDockPlacement ?? defaultSqliteDockPlacement({w, h}), {w, h})
}

function fullscreenDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (w < 80 || h < 80) return hiddenRect()
  return hostTerminalDockRectForPlacement(fullscreenDockPlacement ?? defaultFullscreenDockPlacement({w, h}), {w, h})
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

function androidDockRectForPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(ANDROID_DOCK_SHORT, Math.max(1, bounds.w - ANDROID_DOCK_MARGIN))
    : Math.min(ANDROID_DOCK_LONG, Math.max(1, bounds.w - ANDROID_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(ANDROID_DOCK_LONG, Math.max(1, bounds.h - ANDROID_DOCK_MARGIN * 2))
    : Math.min(ANDROID_DOCK_SHORT, Math.max(1, bounds.h - ANDROID_DOCK_MARGIN))
  if (vertical) {
    const centerY = clampNumber(
      placement.offset,
      ANDROID_DOCK_MARGIN + dockH / 2,
      Math.max(ANDROID_DOCK_MARGIN + dockH / 2, bounds.h - ANDROID_DOCK_MARGIN - dockH / 2),
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
    ANDROID_DOCK_MARGIN + dockW / 2,
    Math.max(ANDROID_DOCK_MARGIN + dockW / 2, bounds.w - ANDROID_DOCK_MARGIN - dockW / 2),
  )
  return {
    x: centerX - dockW / 2,
    y: placement.edge === "top" ? 0 : Math.max(0, bounds.h - dockH),
    w: dockW,
    h: dockH,
  }
}

function sqliteDockRectForPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(SQLITE_DOCK_SHORT, Math.max(1, bounds.w - SQLITE_DOCK_MARGIN))
    : Math.min(SQLITE_DOCK_LONG, Math.max(1, bounds.w - SQLITE_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(SQLITE_DOCK_LONG, Math.max(1, bounds.h - SQLITE_DOCK_MARGIN * 2))
    : Math.min(SQLITE_DOCK_SHORT, Math.max(1, bounds.h - SQLITE_DOCK_MARGIN))
  if (vertical) {
    const centerY = clampNumber(
      placement.offset,
      SQLITE_DOCK_MARGIN + dockH / 2,
      Math.max(SQLITE_DOCK_MARGIN + dockH / 2, bounds.h - SQLITE_DOCK_MARGIN - dockH / 2),
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
    SQLITE_DOCK_MARGIN + dockW / 2,
    Math.max(SQLITE_DOCK_MARGIN + dockW / 2, bounds.w - SQLITE_DOCK_MARGIN - dockW / 2),
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
  return defaultHostSizedDockPlacement(placement, bounds)
}

function defaultFullscreenDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return defaultHostSizedDockPlacement(DEFAULT_FULLSCREEN_DOCK_PLACEMENT, bounds)
}

function defaultHostSizedDockPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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

function defaultAndroidDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return defaultAndroidDockPlacementFor(DEFAULT_ANDROID_DOCK_PLACEMENT, bounds)
}

function defaultSecondaryAndroidDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return defaultAndroidDockPlacementFor(DEFAULT_SECONDARY_ANDROID_DOCK_PLACEMENT, bounds)
}

function defaultAndroidDockPlacementFor(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(ANDROID_DOCK_SHORT, Math.max(1, bounds.w - ANDROID_DOCK_MARGIN))
    : Math.min(ANDROID_DOCK_LONG, Math.max(1, bounds.w - ANDROID_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(ANDROID_DOCK_LONG, Math.max(1, bounds.h - ANDROID_DOCK_MARGIN * 2))
    : Math.min(ANDROID_DOCK_SHORT, Math.max(1, bounds.h - ANDROID_DOCK_MARGIN))
  const minOffset = vertical
    ? ANDROID_DOCK_MARGIN + dockH / 2
    : ANDROID_DOCK_MARGIN + dockW / 2
  const maxOffset = vertical
    ? Math.max(minOffset, bounds.h - ANDROID_DOCK_MARGIN - dockH / 2)
    : Math.max(minOffset, bounds.w - ANDROID_DOCK_MARGIN - dockW / 2)
  return {
    edge: placement.edge,
    offset: clampNumber(placement.offset, minOffset, maxOffset),
  }
}

function defaultSqliteDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const placement = DEFAULT_SQLITE_DOCK_PLACEMENT
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(SQLITE_DOCK_SHORT, Math.max(1, bounds.w - SQLITE_DOCK_MARGIN))
    : Math.min(SQLITE_DOCK_LONG, Math.max(1, bounds.w - SQLITE_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(SQLITE_DOCK_LONG, Math.max(1, bounds.h - SQLITE_DOCK_MARGIN * 2))
    : Math.min(SQLITE_DOCK_SHORT, Math.max(1, bounds.h - SQLITE_DOCK_MARGIN))
  const minOffset = vertical
    ? SQLITE_DOCK_MARGIN + dockH / 2
    : SQLITE_DOCK_MARGIN + dockW / 2
  const maxOffset = vertical
    ? Math.max(minOffset, bounds.h - SQLITE_DOCK_MARGIN - dockH / 2)
    : Math.max(minOffset, bounds.w - SQLITE_DOCK_MARGIN - dockW / 2)
  return {
    edge: placement.edge,
    offset: clampNumber(placement.offset, minOffset, maxOffset),
  }
}

function hostTerminalDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return hostSizedDockPlacementFromPoint(point, bounds)
}

function fullscreenDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return hostSizedDockPlacementFromPoint(point, bounds)
}

function hostSizedDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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

function androidDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return androidDockPlacementFromPointFor(point, bounds)
}

function secondaryAndroidDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
  return androidDockPlacementFromPointFor(point, bounds)
}

function androidDockPlacementFromPointFor(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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
  const rect = androidDockRectForPlacement({
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
  }, bounds)
  return {
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
  }
}

function sqliteDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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
  const rect = sqliteDockRectForPlacement({
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
  }, bounds)
  return {
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
  }
}

function clampHostTerminalHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number, bottomReserve = 0): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const effectiveH = Math.max(1, bh - Math.max(0, bottomReserve))
  const minW = Math.min(HOST_TERMINAL_HUD_PANEL_MIN_W, bw)
  const minH = Math.min(HOST_TERMINAL_HUD_PANEL_MIN_H, effectiveH)
  const rectW = clampNumber(rect.w, minW, bw)
  const rectH = clampNumber(rect.h, minH, effectiveH)
  return {
    x: clampNumber(rect.x, 0, Math.max(0, bw - rectW)),
    y: clampNumber(rect.y, 0, Math.max(0, effectiveH - rectH)),
    w: rectW,
    h: rectH,
  }
}

function clampAndroidHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const minW = Math.min(ANDROID_HUD_MIN_W, bw)
  const minH = Math.min(ANDROID_HUD_MIN_H, bh)
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

function clampSqliteHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const minW = Math.min(SQLITE_HUD_MIN_W, bw)
  const minH = Math.min(SQLITE_HUD_MIN_H, bh)
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

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
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
