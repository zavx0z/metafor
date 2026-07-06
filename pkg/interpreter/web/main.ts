/**
 * Interpreter UI.
 *
 * One interpreter owns one HUD and one WebGPU Space. UIDisplays are visual
 * placements; public runtime/source API is scoped to processes.
 */

import {
  UiRuntime,
  UiSurface,
  flexRow,
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
import {VoiceInputHud, type ButtonVoiceSnapshot, type VoiceInputHudDeactivationMode, type VoiceInputHudPhraseGroupId, type VoiceInputHudServiceState} from "@ui/components"
import {type HudSideTabEdge} from "@ui/hud"
import {
  EditorPane,
  FileListPane,
  AndroidPane,
  NetworkWatchPane,
  TerminalPane,
  ToDoPane,
  PANE_FRAME,
  networkWatchSectionsFromLines,
  normalizeFileListSelection,
  paneBodyRect,
  sourceDisplayLocation,
  sourcePathFromLocation,
  codexComposerMessage,
  codexImageDropFiles,
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
  type TerminalInputSource,
  type TerminalSelectionSnapshot,
  type TerminalPaneOpts,
  type TerminalSize,
  type TerminalStatusKind,
  type ToDoPaneContextSnapshot,
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
  normalizeWorkspaceOpenedFileIds,
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
  type WorkspaceFileVcsStatus,
} from "./workspace-files.ts"
import {
  readStoredWorkspaceFilesState,
  workspaceFilesStorageKey,
  writeStoredWorkspaceFilesState,
} from "./workspace-files-storage.ts"
import {readStoredTodoPanelState, storeTodoPanelState} from "./todo-panel-storage.ts"
import {
  clampHostTerminalAgentSoundVolume,
  MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME,
  readHostTerminalAgentSoundEnabled,
  readHostTerminalAgentSoundVolume,
  writeHostTerminalAgentSoundEnabled,
  writeHostTerminalAgentSoundVolume,
} from "./host-agent-sound-storage.ts"
import {formatTerminalExpressionResult} from "./terminal-value-format.ts"
import {createAndroidRtcClient, type AndroidRtcAudioStream, type AndroidRtcClient, type AndroidRtcCommand, type AndroidRtcFrame, type RtcControlCommand} from "./android-rtc.ts"
import {RTC_ICE_SERVERS} from "./p2p-signaling.ts"
import {
  VoiceInputClient,
  VOICE_STOP_COMMAND_DETAIL,
  voiceInputWebSocketUrl,
  type VoiceDeactivationMode,
  type VoiceInputChunk,
  type VoiceInputSegment,
  type VoiceInputSignalTone,
  type VoiceInputStatus,
} from "./voice-input.ts"
import {hiddenRect, clampNumber, withAlpha} from "./geometry.ts"
import {cleanupVoiceInputText, mergeVoiceInputText, sanitizeHostTerminalVoiceInput, voiceMessagesFromChunk} from "./voice-text.ts"
import {sourceTextEditorLineChanges, sourceTextLineChanges, remapSourceLine, type SourceLineChange} from "./source-lines.ts"
import {parseSourceOpenSelection, type SourceOpenOptions, type SourceOpenPosition} from "./source-open-params.ts"
import {RemoteDesktopPane, isValidRemoteDesktopFrame} from "./remote-desktop-pane.ts"
import {
  iceServersForDiagnostics,
  interpreterHttpPath,
  interpreterWebSocketUrl,
  postInterpreterClientEvent,
  remoteDesktopApiPaths,
  remoteDesktopRandomToken,
  resolveRemoteDesktopRtcConfig,
  responseErrorText,
} from "./remote-desktop-rtc-helpers.ts"
import {
  readStoredInterpreterDisplayPositions,
  readStoredInterpreterViewPoint,
  writeStoredInterpreterDisplayPositions,
  writeStoredInterpreterViewPoint,
} from "./interpreter-view-storage.ts"
import {SqliteTablePane} from "./sqlite-table-pane.ts"
import {
  isSqliteMissingError,
  isSqliteSourcePath,
  sqliteComparablePath,
  sqliteInitialLabel,
  sqliteOpenParams,
  sqliteResponseError,
  sqliteTableItemId,
  sqliteTableItems,
  type SqliteOpenParams,
} from "./sqlite-display-helpers.ts"
import {sameStringArray} from "./array-utils.ts"
import type {SqliteCellValue, SqliteDatabasePayload, SqliteHudContextSnapshot} from "./sqlite-types.ts"
import {WorkspaceFilesChromePane, WorkspaceFilesHeaderPane} from "./workspace-panes.ts"
import {HostTerminalAgentSignalPane, HostTerminalDockPane, SqliteHudFramePane} from "./hud-panes.ts"
import {
  HostTerminalCodexComposerPane,
  hostCodexComposerContentLayout,
  HOST_TERMINAL_CODEX_COMPOSER_H,
  HOST_TERMINAL_CODEX_COMPOSER_MIN_W,
  HOST_TERMINAL_CODEX_COMPOSER_MIN_H,
  HOST_TERMINAL_CODEX_COMPOSER_GAP,
} from "./codex-composer-pane.ts"
import {
  BrowserChatPane,
  BROWSER_CHAT_PANE_DEFAULT_H,
  BROWSER_CHAT_PANE_DEFAULT_W,
  BROWSER_CHAT_PANE_GAP,
  BROWSER_CHAT_PANE_MIN_H,
  BROWSER_CHAT_PANE_MIN_W,
  type BrowserChatPaneMessage,
} from "./browser-chat-pane.ts"
import {
  HOST_TERMINAL_SESSION_STORAGE_KEY,
  NETWORK_TERMINAL_SESSION_STORAGE_KEY,
  readStoredHostTerminalSessionId,
  writeStoredHostTerminalSessionId,
  readStoredHostTerminalHudRect,
  storeHostTerminalHudRect,
  readStoredHostCodexComposerRect,
  storeHostCodexComposerRect,
  readStoredBrowserChatHudRect,
  storeBrowserChatHudRect,
  readStoredBrowserChatComposerRect,
  storeBrowserChatComposerRect,
  readStoredVoiceSettingsRect,
  storeVoiceSettingsRect,
  readStoredNetworkTerminalHudRect,
  storeNetworkTerminalHudRect,
  readStoredAndroidHudRect,
  storeAndroidHudRect,
  readStoredTodoHudRect,
  storeTodoHudRect,
  readStoredSqliteHudRect,
  storeSqliteHudRect,
  readStoredHostTerminalHudDocked,
  writeStoredHostTerminalHudDocked,
  readStoredBrowserChatHudDocked,
  writeStoredBrowserChatHudDocked,
  readStoredNetworkTerminalHudDocked,
  writeStoredNetworkTerminalHudDocked,
  readStoredNetworkStatusAutoRefreshEnabled,
  writeStoredNetworkStatusAutoRefreshEnabled,
  readStoredNetworkProductViaInterpreter,
  writeStoredNetworkProductViaInterpreter,
  readStoredDisplayActionAutoFocusEnabled,
  writeStoredDisplayActionAutoFocusEnabled,
  readStoredAndroidHudDocked,
  writeStoredAndroidHudDocked,
  readStoredTodoHudDocked,
  writeStoredTodoHudDocked,
  readStoredSqliteHudDocked,
  writeStoredSqliteHudDocked,
  readStoredAndroidDockPlacement,
  writeStoredAndroidDockPlacement,
  readStoredHostTerminalDockPlacement,
  readStoredBrowserChatDockPlacement,
  readStoredTodoDockPlacement,
  readStoredSqliteDockPlacement,
  writeStoredHostTerminalDockPlacement,
  writeStoredBrowserChatDockPlacement,
  writeStoredTodoDockPlacement,
  writeStoredSqliteDockPlacement,
  type HostTerminalDockPlacement,
} from "./hud-storage.ts"
import {
  objectParam,
  objectParamMaybe,
  importSpecifierFromText,
  sourceDirname,
  joinSourcePath,
  stringParam,
  numberParam,
  booleanParam,
  firstNumberParam,
  sideParam,
  type DisplaySelectorSide,
} from "./command-params.ts"
import {androidControlCommandFromParams, androidDimension, blobToDataUrl, withAndroidFrameSize} from "./android-control.ts"
import {
  MAX_VOICE_SIGNAL_VOLUME,
  MIN_VOICE_RECOGNITION_TIMEOUT_SECONDS,
  MAX_VOICE_RECOGNITION_TIMEOUT_SECONDS,
  readVoiceInputUrl,
  readVoiceWakeUrl,
  readVoiceInputContext,
  readVoiceSignalVolume,
  clampVoiceSignalVolume,
  writeVoiceSignalVolume,
  readVoiceAutoSendEnabled,
  writeVoiceAutoSendEnabled,
  readVoiceDeactivationMode,
  writeVoiceDeactivationMode,
  readVoiceRecognitionTimeoutSeconds,
  writeVoiceRecognitionTimeoutSeconds,
  readVoicePhrases,
  writeVoicePhrases,
  readVoiceFuzzyTolerance,
  writeVoiceFuzzyTolerance,
  defaultVoicePhrases,
  voicePhraseKey,
} from "./voice-settings-storage.ts"

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
  | {type: "workspace-changed"; reason: "git.commit" | "git.push"; root?: string}
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
  gitBaseText?: string
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
  gitBaseText?: string
  tokens?: EditorTokens
}

type WorkspaceFilesPayload = {
  root?: string
  workspacePath?: string
  modulePath?: string
  entrypoint?: string | null
  files?: Array<{path?: string; vcsStatus?: string; addedLines?: number; deletedLines?: number}>
  modules?: Array<{path?: string; vcsStatus?: string; addedLines?: number; deletedLines?: number}>
}

type WorkspaceFilesState = {
  root: string | null
  workspacePath: string
  modulePath: string | null
  rootLabel: string | null
  catalogPaths: readonly string[]
  vcsStatuses: ReadonlyMap<string, WorkspaceFileVcsStatus>
  lineStats: ReadonlyMap<string, {addedLines: number; deletedLines: number}>
  items: readonly FileListItem[]
  expandedIds: readonly string[]
  selectedIds: readonly string[]
  openedFileIds: readonly string[]
  storageKey: string
  loading: Promise<void> | null
  suppressSelectionOpen: boolean
}

type CommandReply = {ok: boolean; result?: unknown; error?: string}
type ActiveInterpreterCommand = {cmd: string; label: string; startedAt: number}
type DisplayLayoutMetrics = {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}
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
  sourceSavedText: string
  sourceGitBaseText: string | null
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
  codexComposer: HostTerminalCodexComposerPane<HostTerminalController>
  codexEditor: EditorPane
  title: string
  sessionStorageKey: string
  sessionKey: string
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

type BrowserChatMessage = BrowserChatPaneMessage & {
  id: string
  createdAt: number
}

type BrowserChatController = {
  chatPane: BrowserChatPane
  composer: HostTerminalCodexComposerPane<BrowserChatController>
  editor: EditorPane
  codexDraft: string
  codexAttachments: CodexComposerAttachment[]
  codexAttachmentUploadInFlight: boolean
  codexSubmitAfterAttachmentUpload: boolean
  codexDropActive: boolean
  codexEditorSyncing: boolean
  status: string
  statusTimer: number | null
  voiceComposerBaseDraft: string | null
  voiceComposerGeneratedDraft: string
  voiceComposerEdited: boolean
  messages: BrowserChatMessage[]
  sendInFlight: boolean
  readTimer: number | null
  readStartedAt: number
  readStableTicks: number
  readAfterMessageCount: number | null
  lastAssistantText: string
}

type VoiceInputTarget =
  | {kind: "module"; controller: ModuleDisplayController}
  | {kind: "host"; controller: HostTerminalController}
  | {kind: "browser-chat"; controller: BrowserChatController}

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
const HOST_TERMINAL_SESSION_KEY = "interpreter:host-terminal"
const NETWORK_TERMINAL_SESSION_KEY = "interpreter:network-terminal"
const NETWORK_DISPLAY_ID = "network:terminal"
const REMOTE_DESKTOP_DISPLAY_ID = "remote-desktop:server"
const PHYSICAL_DISPLAY_PIXEL_WIDTH = 1920
const PHYSICAL_DISPLAY_PIXEL_HEIGHT = 1080
const PHYSICAL_DISPLAY_MM_PER_PIXEL = 25.4 / 96
const PHYSICAL_DISPLAY_METRICS: DisplayLayoutMetrics = {
  widthMm: PHYSICAL_DISPLAY_PIXEL_WIDTH * PHYSICAL_DISPLAY_MM_PER_PIXEL,
  heightMm: PHYSICAL_DISPLAY_PIXEL_HEIGHT * PHYSICAL_DISPLAY_MM_PER_PIXEL,
  pixelWidth: PHYSICAL_DISPLAY_PIXEL_WIDTH,
  pixelHeight: PHYSICAL_DISPLAY_PIXEL_HEIGHT,
}
const INTERPRETER_VIEWPOINT_STORE_DELAY_MS = 120
const INTERPRETER_DISPLAY_POSITION_STORE_DELAY_MS = 120
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
const BROWSER_CHAT_DOCK_SHORT = 32
const BROWSER_CHAT_DOCK_LONG = 120
const BROWSER_CHAT_DOCK_MARGIN = 8
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
const HOST_TERMINAL_BRAND_LABEL = "Codex"
const HOST_TERMINAL_MODEL_LABEL = "GPT 5,5"
const HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE = 22
const HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y = 8
const HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X = 16
const HOST_TERMINAL_AGENT_SIGNAL_PANEL_W = 300
const HOST_TERMINAL_AGENT_SIGNAL_PANEL_H = 112
const AGENT_READY_SOUND_IDLE_MS = 2_500
const AGENT_READY_SOUND_COOLDOWN_MS = 1_200
const VOICE_SIGNAL_COOLDOWN_MS = 900
const VOICE_SIGNAL_CAPTURE_FALLBACK_MS = 260
const WORKSPACE_FILES_LIMIT = 500
const HUD_PANEL_BG = withAlpha(palette.bg, 0.68)
const HUD_CODE_BG = withAlpha(palette.bgCode, 0.62)
const HUD_LOCAL_BACKDROP_BG = withAlpha(palette.bg, 0.24)
const HUD_MODAL_SHADOW_BG = withAlpha(palette.bgInput, 0.32)
const HUD_MODAL_BG = withAlpha(palette.bgElevated, 0.78)
const HUD_LAYER_TOP = 1_000

type HudNotificationKind = "activation" | "deactivation" | "stop" | "error" | "agent"

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
const DEFAULT_BROWSER_CHAT_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "right", offset: 220}
const DEFAULT_NETWORK_TERMINAL_HUD_RECT: UiSurfaceRect = {x: 24, y: 520, w: 1080, h: 560}
const NETWORK_DISPLAY_COLUMN_GAP = 8
const NETWORK_DISPLAY_COLUMN_MIN_W = 920
const NETWORK_DISPLAY_INFO_MIN_W = 420
const NETWORK_DISPLAY_INFO_MAX_W = 620
const NETWORK_DISPLAY_INFO_RATIO = 0.34
const NETWORK_STATUS_REFRESH_MS = 2500
const DEFAULT_ANDROID_HUD_RECT: UiSurfaceRect = {x: 24, y: 80, w: 390, h: 720}
const DEFAULT_ANDROID_DOCK_PLACEMENT: HostTerminalDockPlacement = {edge: "left", offset: 380}
const ANDROID_RTC_FRAME_SRC = "metafor:android-rtc-frame"
const REMOTE_DESKTOP_RTC_FRAME_SRC = "metafor:remote-desktop-rtc-frame"
const REMOTE_DESKTOP_CONNECT_START_LOG_MS = 3_000
const REMOTE_DESKTOP_RTC_RECONNECT_DELAY_MS = 500
const REMOTE_DESKTOP_SENDER_RESTART_COOLDOWN_MS = 3_000
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
let displayActionAutoFocusEnabled = readStoredDisplayActionAutoFocusEnabled()
let todoPane: ToDoPane | null = null
let todoDockPane: HostTerminalDockPane | null = null
let todoContext: ToDoPaneContextSnapshot | null = null
let androidPane: AndroidPane | null = null
let androidDockPane: HostTerminalDockPane | null = null
let sqliteHudPane: SqliteHudFramePane | null = null
let sqliteDockPane: HostTerminalDockPane | null = null
let hostTerminal: HostTerminalController | null = null
let networkHostTerminal: HostTerminalController | null = null
let browserChat: BrowserChatController | null = null
let hostTerminalDockPane: HostTerminalDockPane | null = null
let browserChatDockPane: HostTerminalDockPane | null = null
let networkDisplayControlsPane: NetworkWatchPane | null = null
let networkDisplayTerminal: TerminalPane | null = null
let networkDisplayInstalled = false
let remoteDesktopPane: RemoteDesktopPane | null = null
let remoteDesktopDisplayInstalled = false
let remoteDesktopDisplayMetrics: DisplayLayoutMetrics | null = null
let remoteDesktopDisplayMetricsLocked = false
let remoteDesktopRtcClient: AndroidRtcClient | null = null
let remoteDesktopRtcConnectInFlight = false
let remoteDesktopRtcReconnectTimer: number | null = null
let remoteDesktopRtcResetting = false
let remoteDesktopLastRtcStatusLog = ""
let remoteDesktopLastConnectStartLogAt = 0
let remoteDesktopRtcFrameSourceLabel = "rtc"
let remoteDesktopSenderRestartInFlight = false
let remoteDesktopLastSenderRestartAt = 0
let spaceOverviewPinned = false
let spaceOverviewWatchdogTimer: number | null = null
let hostTerminalAgentSignalPane: HostTerminalAgentSignalPane | null = null
let hostTerminalStatusLabelForLayout = t("terminalConnecting")
let hostTerminalHudDocked = readStoredHostTerminalHudDocked()
let hostTerminalDockPlacement: HostTerminalDockPlacement | null = readStoredHostTerminalDockPlacement() ?? DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT
let hostTerminalHudRectPreview: UiSurfaceRect | null = null
let browserChatHudDocked = readStoredBrowserChatHudDocked()
let browserChatDockPlacement: HostTerminalDockPlacement | null = readStoredBrowserChatDockPlacement() ?? DEFAULT_BROWSER_CHAT_DOCK_PLACEMENT
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
let androidFrameRefreshTimer: number | null = null
let androidFrameRefreshInFlight = false
let androidRtcClient: AndroidRtcClient | null = null
let androidControlStatusUntil = 0
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
let browserChatComposerDragHandlersInstalled = false
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
let pageUnloading = false
let reloadScheduled = false
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
  pageUnloading = true
  suspendVoiceForInactiveDocument()
  stopNetworkStatusRefresh({abort: true})
  flushInterpreterViewPointStorage()
  flushInterpreterDisplayPositionsStorage()
})
window.addEventListener("pagehide", () => {
  pageUnloading = true
  suspendVoiceForInactiveDocument()
  flushInterpreterViewPointStorage()
  flushInterpreterDisplayPositionsStorage()
})
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
    if (!pageUnloading) scheduleReloadWhenServerReady(250)
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
    case "workspace-changed":
      handleWorkspaceChanged()
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
  if (reloadScheduled || pageUnloading) return
  reloadScheduled = true
  const startedAt = Date.now()
  const reload = () => {
    flushInterpreterViewPointStorage()
    flushInterpreterDisplayPositionsStorage()
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
      // The host can be briefly unavailable while host.restart respawns the pane.
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
    case "ui.captureViewport":
      return await captureInterpreterViewport(params)
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

async function captureInterpreterViewport(params: unknown): Promise<unknown> {
  if (uiCanvas === null) throw new Error("ui runtime is not ready")
  const rect = engineCanvas.getBoundingClientRect()
  if (engineCanvas.width <= 0 || engineCanvas.height <= 0 || rect.width <= 0 || rect.height <= 0) {
    throw new Error("interpreter canvas is not visible")
  }
  await nextAnimationFrame()
  await nextAnimationFrame()
  const mime = viewportCaptureMime(params)
  const quality = viewportCaptureQuality(params)
  const blob = await canvasToBlob(engineCanvas, mime, quality)
  const dataBase64 = await blobToDataUrl(blob)
  return {
    source: "interpreter-ui-canvas",
    mime: blob.type || mime,
    dataBase64,
    width: engineCanvas.width,
    height: engineCanvas.height,
    clientWidth: rect.width,
    clientHeight: rect.height,
    devicePixelRatio: window.devicePixelRatio,
    capturedAt: new Date().toISOString(),
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      visualScale: window.visualViewport?.scale ?? 1,
    },
    space: {
      mode: uiCanvas.displayMode,
      activeDisplayId: uiCanvas.activeDisplayId,
    },
  }
}

function viewportCaptureMime(params: unknown): "image/png" | "image/jpeg" | "image/webp" {
  const format = typeof params === "object" && params !== null && !Array.isArray(params)
    ? (params as {format?: unknown}).format
    : undefined
  if (format === "jpg" || format === "jpeg" || format === "image/jpeg") return "image/jpeg"
  if (format === "webp" || format === "image/webp") return "image/webp"
  return "image/png"
}

function viewportCaptureQuality(params: unknown): number | undefined {
  if (typeof params !== "object" || params === null || Array.isArray(params)) return undefined
  const value = (params as {quality?: unknown}).quality
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(1, Math.max(0.05, value))
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number | undefined): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error("canvas capture returned empty blob"))
      else resolve(blob)
    }, mime, quality)
  })
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
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
      reply = await openInterpreterSource(controller, actionParams)
      break
    case "source.openSelection":
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
  uiCanvas.addHudSurface(controller.tables, (canvas) => sqliteHudRects(controller.id, canvas).tables, {windowId: "hud:sqlite", zIndex: 1})
  uiCanvas.addHudSurface(controller.rows, (canvas) => sqliteHudRects(controller.id, canvas).rows, {windowId: "hud:sqlite", zIndex: 1})
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

function setHudTodoHighlight(params: unknown): unknown {
  if (todoPane === null) throw new Error("Plan pane is not ready")
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
  writeStoredInterpreterViewPoint(snapshot)
}

function displayCenterWithStored(displayId: string, fallback: UiRuntimeViewPointVector): UiRuntimeViewPointVector {
  return interpreterDisplayPositions.get(displayId) ?? fallback
}

function moduleDisplayRowWidth(moduleDisplayIds: readonly string[], metrics: DisplayLayoutMetrics): number {
  return moduleDisplayIds.length * metrics.widthMm + Math.max(0, moduleDisplayIds.length - 1) * MODULE_DISPLAY_GAP_MM
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
  writeStoredInterpreterDisplayPositions(interpreterDisplayPositions)
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
      autoFocusDisplaysOnAction: displayActionAutoFocusEnabled,
      onBrowserFullscreenLayoutChange: handleBrowserFullscreenDisplayLayoutChange,
      onAutoFocusDisplaysOnActionChange: setDisplayActionAutoFocusEnabled,
    })
    const todoStored = readStoredTodoPanelState()
    todoPane = new ToDoPane({
      title: "Plan",
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
    voiceHudPane = new VoiceInputHud({
      onToggle: () => void toggleVoiceInput(),
      onMove: storeVoiceSettingsRectAndRelayout,
      settingsPresentation: "panel",
      onPulseFrame: () => {
        hostTerminal?.codexComposer.requestRender()
        browserChat?.composer.requestRender()
      },
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
  if (uiCanvas?.displayMode === "near" && displayId !== null) {
    uiCanvas.refitDisplay(displayId)
  } else {
    maybeAutoFocusDisplay(displayId)
  }
  syncNetworkStatusRefresh()
}

function displayActionAutoFocusEnabledNow(): boolean {
  return displayHoverOutlinePane?.autoFocusDisplaysOnAction() ?? displayActionAutoFocusEnabled
}

function setDisplayActionAutoFocusEnabled(enabled: boolean): void {
  displayActionAutoFocusEnabled = enabled
  writeStoredDisplayActionAutoFocusEnabled(enabled)
}

function maybeAutoFocusDisplay(displayId: string | null): boolean {
  if (!displayActionAutoFocusEnabledNow() || uiCanvas === null || displayId === null) return false
  return uiCanvas.focusDisplay(displayId)
}

function refitVoiceHudPlacement(): void {
  if (voiceHudPane === null) return
  uiCanvas?.clearSurfaceRect(voiceHudPane)
}

function installEnginePanes(): void {
  if (uiCanvas === null || displayHoverOutlinePane === null) return
  uiCanvas.addHudSurface(displayHoverOutlinePane, ({w, h}) => ({x: 0, y: 0, w, h}), {zIndex: HUD_LAYER_TOP})
  if (todoPane !== null) {
    uiCanvas.addHudSurface(todoPane, todoHudRect, {windowId: "hud:todo"})
  }
  todoDockPane ??= new HostTerminalDockPane({
    key: "todo-dock-restore",
    label: "Plan",
    tooltip: "Plan",
    icon: uiIcons.apply,
    edge: currentTodoDockEdge,
    restore: () => setTodoHudDocked(false),
    moveTo: (point, bounds) => setTodoDockPlacement(todoDockPlacementFromPoint(point, bounds)),
    isTouchPointerEvent,
  })
  uiCanvas.addHudSurface(todoDockPane, todoDockRect, {zIndex: HUD_LAYER_TOP})
  sqliteHudPane ??= new SqliteHudFramePane({
    title: () => activeSqliteController()?.label ?? "SQLite",
    subtitle: () => activeSqliteController()?.path ?? "",
    onDock: () => setSqliteHudDocked(true),
    onPreviewRect: previewSqliteHudRect,
    onCommitRect: storeSqliteHudRectAndRelayout,
    headerHeight: SQLITE_HUD_HEADER_H,
    minW: SQLITE_HUD_MIN_W,
    minH: SQLITE_HUD_MIN_H,
  })
  uiCanvas.addHudSurface(sqliteHudPane, sqliteHudRect, {windowId: "hud:sqlite"})
  for (const controller of sqliteDisplays.values()) installSqliteHudSurfaces(controller)
  const host = ensureHostTerminalController()
  uiCanvas.addHudSurface(host.hudTerminal, hostTerminalHudRect, {windowId: "hud:terminal"})
  uiCanvas.addHudSurface(host.codexComposer, hostCodexComposerRect, {windowId: "hud:codex"})
  uiCanvas.addHudSurface(host.codexEditor, hostCodexEditorRect, {windowId: "hud:codex", zIndex: 1})
  if (host.socket === null) connectHostTerminal(host)
  installHostCodexComposerDragHandlers()
  const chat = ensureBrowserChatController()
  uiCanvas.addHudSurface(chat.chatPane, browserChatPaneRect, {windowId: "hud:browser-chat"})
  uiCanvas.addHudSurface(chat.composer, browserChatComposerRect, {windowId: "hud:browser-chat-composer"})
  uiCanvas.addHudSurface(chat.editor, browserChatEditorRect, {windowId: "hud:browser-chat-composer", zIndex: 1})
  installBrowserChatComposerDragHandlers()
  if (androidPane !== null) {
    uiCanvas.addHudSurface(androidPane, androidHudRect, {windowId: "hud:android"})
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
    isTouchPointerEvent,
  })
  uiCanvas.addHudSurface(androidDockPane, androidDockRect, {zIndex: HUD_LAYER_TOP})
  hostTerminalAgentSignalPane ??= new HostTerminalAgentSignalPane({
    buttonSize: HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE,
    maxVolume: MAX_HOST_TERMINAL_AGENT_SOUND_VOLUME,
    readEnabled: readHostTerminalAgentSoundEnabled,
    readVolume: readHostTerminalAgentSoundVolume,
    storeEnabled: storeHostTerminalAgentSoundEnabled,
    storeVolume: storeHostTerminalAgentSoundVolume,
    relayout: relayoutHudSurfaces,
    clampVolume: clampHostTerminalAgentSoundVolume,
  })
  uiCanvas.addHudSurface(hostTerminalAgentSignalPane, hostTerminalAgentSignalRect, {zIndex: HUD_LAYER_TOP})
  hostTerminalDockPane ??= new HostTerminalDockPane({
    key: "host-terminal-dock-restore",
    label: HOST_TERMINAL_MODEL_LABEL,
    tooltip: hostTerminalTitle(),
    icon: uiIcons.codex,
    edge: currentHostTerminalDockEdge,
    restore: () => setHostTerminalHudDocked(false),
    moveTo: (point, bounds) => setHostTerminalDockPlacement(hostTerminalDockPlacementFromPoint(point, bounds)),
    isTouchPointerEvent,
  })
  uiCanvas.addHudSurface(hostTerminalDockPane, hostTerminalDockRect, {zIndex: HUD_LAYER_TOP})
  browserChatDockPane ??= new HostTerminalDockPane({
    key: "browser-chat-dock-restore",
    label: "Browser",
    tooltip: "Browser Agent Chat",
    icon: uiIcons.codex,
    edge: currentBrowserChatDockEdge,
    restore: () => setBrowserChatHudDocked(false),
    moveTo: (point, bounds) => setBrowserChatDockPlacement(browserChatDockPlacementFromPoint(point, bounds)),
    isTouchPointerEvent,
  })
  uiCanvas.addHudSurface(browserChatDockPane, browserChatDockRect, {zIndex: HUD_LAYER_TOP})
  sqliteDockPane ??= new HostTerminalDockPane({
    key: "sqlite-dock-restore",
    label: "SQLite",
    tooltip: () => activeSqliteController()?.label ?? "SQLite",
    icon: uiIcons.database,
    edge: currentSqliteDockEdge,
    restore: () => setSqliteHudDocked(false),
    moveTo: (point, bounds) => setSqliteDockPlacement(sqliteDockPlacementFromPoint(point, bounds)),
    isTouchPointerEvent,
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
    pane.setMarkdown(`- [ ] Plan не загружен: ${error instanceof Error ? error.message : String(error)}`, "TODO.md")
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
    console.warn("Plan checkbox update failed:", error)
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

function connectRemoteDesktopRtc(): void {
  if (remoteDesktopPane === null) return
  postRemoteDesktopConnectStart()
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

function resetRemoteDesktopRtc(reason: string): void {
  if (remoteDesktopRtcResetting) return
  const client = remoteDesktopRtcClient
  remoteDesktopRtcClient = null
  remoteDesktopRtcConnectInFlight = false
  if (remoteDesktopRtcReconnectTimer !== null) {
    window.clearTimeout(remoteDesktopRtcReconnectTimer)
    remoteDesktopRtcReconnectTimer = null
  }
  remoteDesktopRtcResetting = true
  try {
    client?.disconnect()
  } finally {
    remoteDesktopRtcResetting = false
  }
  disconnectRemoteDesktopAudioSource()
  remoteDesktopPane?.setStatus("running", `rtc reconnect ${reason}`)
  postInterpreterClientEvent("remote-desktop", "rtc-reconnect", {reason})
  remoteDesktopRtcReconnectTimer = window.setTimeout(() => {
    remoteDesktopRtcReconnectTimer = null
    connectRemoteDesktopRtc()
  }, REMOTE_DESKTOP_RTC_RECONNECT_DELAY_MS)
}

function postRemoteDesktopConnectStart(): void {
  const now = Date.now()
  if (now - remoteDesktopLastConnectStartLogAt < REMOTE_DESKTOP_CONNECT_START_LOG_MS) return
  remoteDesktopLastConnectStartLogAt = now
  postInterpreterClientEvent("remote-desktop", "connect-start", {
    path: window.location.pathname,
    protocol: window.location.protocol,
    host: window.location.host,
  })
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
    senderPeerId: "remote-desktop-host",
    peerTarget: "any",
    ...(signalUrls[0] === undefined ? {} : {signalUrl: signalUrls[0]}),
    signalUrls,
    ...(iceServers === null ? {} : {iceServers}),
    capabilities: ["remote-desktop", "interpreter"],
    frameSrc: REMOTE_DESKTOP_RTC_FRAME_SRC,
    minFrameIntervalMs: 16,
    metadataOnlyFrames: true,
    frameReadMode: "track-processor",
    ignoreBlackFrames: false,
    receiveAudio: true,
    controlResultStatus: "diagnostic",
    onFrame: (frame) => {
      if (!isValidRemoteDesktopFrame(frame)) return
      if (!REMOTE_DESKTOP_RTC_VIDEO_DISPLAY_ENABLED) return
      remoteDesktopPane?.setFrame(frame)
      lockRemoteDesktopDisplayMetricsToFrame(frame)
      remoteDesktopPane?.setStatus("connected", `${frame.width}x${frame.height} ${remoteDesktopRtcFrameSourceLabel}`)
    },
    onAudio: connectRemoteDesktopAudio,
    onStatus: setRemoteDesktopRtcStatus,
    onDiagnostic: handleRemoteDesktopRtcDiagnostic,
    onTargetPeerMissing: requestRemoteDesktopSenderRestart,
  })
}

function handleRemoteDesktopRtcDiagnostic(label: string, detail: Record<string, unknown>): void {
  if (label === "frame-source") {
    remoteDesktopRtcFrameSourceLabel = detail.source === "mediastream-track-processor"
      ? "rtc track"
      : detail.source === "video-element"
        ? "rtc video"
        : "rtc"
  }
  postInterpreterClientEvent("remote-desktop", `rtc-${label}`, detail)
}

function setRemoteDesktopRtcStatus(kind: AndroidPaneStatusKind, label: string): void {
  remoteDesktopPane?.setStatus(kind, label)
  const key = `${kind}:${label}`
  if (remoteDesktopLastRtcStatusLog === key) return
  remoteDesktopLastRtcStatusLog = key
  postInterpreterClientEvent("remote-desktop", "rtc-status", {kind, label})
  if (remoteDesktopRtcResetting) return
  if (kind === "idle" && /\bdisconnected\b/.test(label)) {
    resetRemoteDesktopRtc(label)
    return
  }
  if (isRemoteDesktopRtcTransportFailure(kind, label)) {
    resetRemoteDesktopRtc(label)
  }
}

function isRemoteDesktopRtcTransportFailure(kind: AndroidPaneStatusKind, label: string): boolean {
  if (kind !== "error" && kind !== "idle") return false
  return (
    label === "rtc failed"
    || label === "rtc closed"
    || label === "rtc ice failed"
    || label === "rtc signaling error"
  )
}

function requestRemoteDesktopSenderRestart(peers: string[]): void {
  const now = Date.now()
  if (remoteDesktopSenderRestartInFlight) return
  if (now - remoteDesktopLastSenderRestartAt < REMOTE_DESKTOP_SENDER_RESTART_COOLDOWN_MS) return
  remoteDesktopLastSenderRestartAt = now
  remoteDesktopSenderRestartInFlight = true
  remoteDesktopPane?.setStatus("running", "rtc sender restart")
  postInterpreterClientEvent("remote-desktop", "sender-restart", {reason: "missing-peer", peers})
  void postRemoteDesktopSenderRestart()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      remoteDesktopPane?.setStatus("error", `rtc sender ${message}`)
      postInterpreterClientEvent("remote-desktop", "sender-restart-error", {message})
    })
    .finally(() => {
      remoteDesktopSenderRestartInFlight = false
    })
}

async function postRemoteDesktopSenderRestart(): Promise<void> {
  let lastError = "desktop rtc restart unavailable"
  for (const path of remoteDesktopApiPaths("/rtc/restart")) {
    try {
      const response = await fetch(path, {method: "POST", cache: "no-store"})
      if (response.ok) {
        remoteDesktopPane?.setStatus("running", "rtc sender restarted")
        return
      }
      lastError = `${path} ${response.status}: ${await responseErrorText(response)}`
    } catch (error) {
      lastError = error instanceof Error ? `${path} ${error.message}` : `${path} unavailable`
    }
  }
  throw new Error(lastError)
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
        return
      }
      lastError = `${path} ${response.status}: ${await responseErrorText(response)}`
    } catch (error) {
      lastError = error instanceof Error ? `${path} ${error.message}` : `${path} unavailable`
    }
  }
  remoteDesktopPane?.setStatus("error", `input ${lastError}`)
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
    setModuleSourceHeader(controller)
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

function networkActionForSwitch(key: NetworkServiceKey, checked: boolean): string {
  if (key === "tls") return checked ? "start:tls" : "stop:tls"
  return checked ? "start:redirect" : "stop:redirect"
}

async function runNetworkAction(action: string): Promise<void> {
  networkActionStatus = `${action} unavailable`
  updateNetworkWatchPane()
  networkStatusLines = ["network actions moved out of interpreter"]
  networkStatusUpdatedAt = new Date()
  updateNetworkWatchPane()
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
  networkStatusRefreshInFlight = true
  updateNetworkWatchPane()
  networkStatusLines = ["network actions moved out of interpreter"]
  networkStatusUpdatedAt = new Date()
  networkStatusRefreshInFlight = false
  updateNetworkWatchPane()
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
  if (target.kind === "host" && target.controller !== hostTerminal) return
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
  if (target.kind === "browser-chat") {
    focusBrowserChatComposer(target.controller)
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
  if (target.kind === "browser-chat") {
    applyBrowserChatVoiceComposerText(target.controller, text)
    target.controller.composer.requestRender()
    return
  }
  for (const terminal of voicePreviewTerminals(target)) terminal.setInputPreview(text)
}

function clearVoicePartialPreview(): void {
  const target = voicePartialPreviewTarget
  if (target === null) return
  if (target.kind === "host" && target.controller === hostTerminal) {
    target.controller.codexComposer.requestRender()
  } else if (target.kind === "browser-chat") {
    target.controller.composer.requestRender()
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
  if (target.kind === "browser-chat") return []
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

  if (target.kind === "browser-chat") return stageBrowserChatDraft(target.controller, text, {focusComposer: false})

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
  const browserChatComposerEdited = target.kind === "browser-chat" && target.controller.voiceComposerEdited
  let handled: boolean
  if (mode !== "draft" && autoSendEnabled && !hostComposerEdited && !browserChatComposerEdited) {
    if (target.kind === "host" && target.controller === hostTerminal) restoreHostVoiceComposerBaseDraft(target.controller)
    if (target.kind === "browser-chat") restoreBrowserChatVoiceComposerBaseDraft(target.controller)
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

function voicePreviewWithBufferedInput(target: VoiceInputTarget, partialText: string): string {
  if (voiceAutoSendTarget === null || !sameVoiceInputTarget(voiceAutoSendTarget, target)) return partialText
  return mergeVoiceInputText(voiceAutoSendText, partialText)
}

function stageVoiceMessagesForTarget(target: VoiceInputTarget, messages: readonly string[], opts: {focusHostComposer?: boolean} = {}): boolean {
  const text = cleanupVoiceInputText(messages.join(" "))
  if (text.length === 0) return false
  if (target.kind === "browser-chat") {
    if (!voiceTargetCanAcceptInput(target)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return false
    }
    return stageBrowserChatDraft(
      target.controller,
      text,
      opts.focusHostComposer === undefined ? {} : {focusComposer: opts.focusHostComposer},
    )
  }
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
  if (target.kind === "browser-chat") {
    if (!voiceTargetCanAcceptInput(target)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return false
    }
    if (!sendBrowserChatVoiceSubmit(target.controller, text)) return false
    recordVoiceAutoEnter()
    updateVoiceHud(undefined, `${t("voiceInserted")}: ${text}`)
    return true
  }
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
    return submitHostCodexComposer(controller, {flushPendingInput: false, focusAfterSubmit: false})
  }
  const payload = controller.terminalState?.bracketedPaste
    ? `\x1b[200~${body}\x1b[201~\r`
    : `${body}\r`
  sendHostTerminalInput(controller, payload, "api", body)
  return true
}

function sendBrowserChatVoiceSubmit(controller: BrowserChatController, text: string): boolean {
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  if (controller.codexAttachmentUploadInFlight) {
    controller.codexSubmitAfterAttachmentUpload = true
    return stageBrowserChatDraft(controller, body, {focusComposer: false})
  }
  const baseDraft = controller.voiceComposerEdited ? controller.codexDraft : (controller.voiceComposerBaseDraft ?? controller.codexDraft)
  const nextDraft = mergeCodexComposerDraft(baseDraft, body)
  clearVoicePartialPreviewForTarget({kind: "browser-chat", controller})
  discardVoiceAutoSendBuffer()
  voiceNextFlushMode = "auto"
  resetBrowserChatVoiceComposerDraftTracking(controller)
  setBrowserChatDraft(controller, nextDraft)
  return submitBrowserChatComposer(controller, {flushPendingInput: false, focusAfterSubmit: false})
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

function submitHostCodexComposer(controller: HostTerminalController, options: {flushPendingInput?: boolean; focusAfterSubmit?: boolean} = {}): boolean {
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
  if (options.focusAfterSubmit ?? true) focusHostCodexComposer(controller)
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

function browserChatComposerStatus(controller: BrowserChatController): string {
  if (controller.status) return controller.status
  if (voiceActiveTarget?.kind === "browser-chat" && voiceActiveTarget.controller === controller && (voiceHudStatus === "listening" || voiceHudStatus === "committing")) {
    return voiceStatusLabel(voiceHudStatus)
  }
  if (controller.sendInFlight) return "sending"
  if (controller.readStartedAt > 0) return "reading Qwen"
  return "ready"
}

function browserChatComposerCanSubmit(controller: BrowserChatController): boolean {
  return !controller.sendInFlight
    && !controller.codexAttachmentUploadInFlight
    && codexComposerMessage(controller.codexDraft, controller.codexAttachments).length > 0
}

function setBrowserChatDraftFromEditor(controller: BrowserChatController, value: string): void {
  if (controller.codexEditorSyncing) return
  if (controller.codexDraft === value) return
  if (controller.voiceComposerBaseDraft !== null && value !== controller.voiceComposerGeneratedDraft) {
    controller.voiceComposerEdited = true
  }
  controller.codexDraft = value
  controller.composer.requestRender()
}

function setBrowserChatDraft(controller: BrowserChatController, value: string): void {
  if (controller.codexDraft === value) return
  controller.codexDraft = value
  syncBrowserChatEditor(controller)
  controller.composer.requestRender()
}

function flushBrowserChatDraftFromEditor(controller: BrowserChatController): void {
  if (controller.codexEditorSyncing) return
  const text = controller.editor.getText()
  if (text !== controller.codexDraft) setBrowserChatDraftFromEditor(controller, text)
}

function syncBrowserChatEditor(controller: BrowserChatController): void {
  if (controller.codexEditorSyncing || controller.editor.getText() === controller.codexDraft) return
  controller.codexEditorSyncing = true
  try {
    controller.editor.setText(controller.codexDraft)
    const lines = controller.codexDraft.split("\n")
    const lastLine = Math.max(0, lines.length - 1)
    controller.editor.setCursor(lastLine, lines[lastLine]?.length ?? 0, {scroll: "nearest"})
  } finally {
    controller.codexEditorSyncing = false
  }
}

function flushBrowserChatComposerPendingInput(controller: BrowserChatController): void {
  flushBrowserChatDraftFromEditor(controller)
  clearVoicePartialPreviewForTarget({kind: "browser-chat", controller}, "preserve")
  flushBrowserChatDraftFromEditor(controller)
}

function submitBrowserChatComposer(controller: BrowserChatController, options: {flushPendingInput?: boolean; focusAfterSubmit?: boolean} = {}): boolean {
  if (options.flushPendingInput ?? true) flushBrowserChatComposerPendingInput(controller)
  if (controller.codexAttachmentUploadInFlight) {
    controller.codexSubmitAfterAttachmentUpload = true
    setBrowserChatStatus(controller, "waiting upload", 2400)
    return false
  }
  if (!browserChatComposerCanSubmit(controller)) return false
  const message = codexComposerMessage(controller.codexDraft, controller.codexAttachments)
  clearVoicePartialPreviewForTarget({kind: "browser-chat", controller})
  discardVoiceAutoSendBuffer()
  voiceNextFlushMode = "auto"
  addBrowserChatMessage(controller, {role: "user", text: message})
  ensureBrowserChatAssistantMessage(controller)
  controller.sendInFlight = true
  setBrowserChatStatus(controller, "sending to Qwen", 6000)
  void sendBrowserChatMessage(controller, message, options.focusAfterSubmit ?? true)
  return true
}

async function sendBrowserChatMessage(controller: BrowserChatController, message: string, focusAfterSubmit: boolean): Promise<void> {
  try {
    const tool = await runHostTool("browser_chat.send", {message, urlContains: "chat.qwen.ai"})
    const result = hostToolResultObject(tool)
    if (tool.ok !== true || result["ok"] !== true) throw new Error(tool.error ?? stringValue(result["error"]) ?? "browser_chat.send failed")
    const previousAssistantText = stringValue(result["previousAssistantText"]) ?? ""
    const previousMessageCount = numberValue(result["previousMessageCount"])
    resetBrowserChatVoiceComposerDraftTracking(controller)
    setBrowserChatDraft(controller, "")
    controller.codexAttachments = []
    setBrowserChatStatus(controller, "sent", 1400)
    if (focusAfterSubmit) focusBrowserChatComposer(controller)
    startBrowserChatPolling(controller, previousAssistantText, previousMessageCount)
  } catch (error) {
    appendBrowserChatSystemMessage(controller, error instanceof Error ? error.message : String(error))
    setBrowserChatStatus(controller, "send failed", 5000)
  } finally {
    controller.sendInFlight = false
    controller.composer.requestRender()
    controller.chatPane.requestRender()
  }
}

function startBrowserChatPolling(controller: BrowserChatController, previousAssistantText: string, afterMessageCount: number | null): void {
  stopBrowserChatPolling(controller, false)
  controller.readStartedAt = performance.now()
  controller.readStableTicks = 0
  controller.readAfterMessageCount = afterMessageCount
  controller.lastAssistantText = previousAssistantText
  scheduleBrowserChatRead(controller, 260)
}

function scheduleBrowserChatRead(controller: BrowserChatController, delayMs = 650): void {
  if (controller.readTimer !== null) window.clearTimeout(controller.readTimer)
  controller.readTimer = window.setTimeout(() => {
    controller.readTimer = null
    void pollBrowserChatRead(controller)
  }, delayMs)
}

async function pollBrowserChatRead(controller: BrowserChatController): Promise<void> {
  if (controller.readStartedAt <= 0) return
  try {
    const tool = await runHostTool("browser_chat.read", {urlContains: "chat.qwen.ai"})
    const result = hostToolResultObject(tool)
    if (tool.ok !== true || result["ok"] !== true) throw new Error(tool.error ?? stringValue(result["error"]) ?? "browser_chat.read failed")
    const text = stringValue(result["lastAssistantText"]) ?? ""
    const messageCount = numberValue(result["messageCount"]) ?? arrayLengthValue(result["messages"])
    const afterBaseline = controller.readAfterMessageCount === null
      || messageCount >= controller.readAfterMessageCount + 2
      || (messageCount > controller.readAfterMessageCount && text !== controller.lastAssistantText)
    if (text.length > 0 && afterBaseline) {
      if (text === controller.lastAssistantText) controller.readStableTicks += 1
      else controller.readStableTicks = 0
      controller.lastAssistantText = text
      updateBrowserChatAssistantMessage(controller, text, true)
    }
    if (text.length > 0 && afterBaseline && controller.readStableTicks >= 3) {
      updateBrowserChatAssistantMessage(controller, text, false)
      stopBrowserChatPolling(controller, true)
      setBrowserChatStatus(controller, "ready", 1200)
      return
    }
    if (performance.now() - controller.readStartedAt > 120_000) {
      stopBrowserChatPolling(controller, true)
      setBrowserChatStatus(controller, "read timeout", 5000)
      return
    }
  } catch (error) {
    appendBrowserChatSystemMessage(controller, error instanceof Error ? error.message : String(error))
    stopBrowserChatPolling(controller, true)
    setBrowserChatStatus(controller, "read failed", 5000)
    return
  }
  scheduleBrowserChatRead(controller)
}

function stopBrowserChatPolling(controller: BrowserChatController, render: boolean): void {
  if (controller.readTimer !== null) {
    window.clearTimeout(controller.readTimer)
    controller.readTimer = null
  }
  controller.readStartedAt = 0
  controller.readStableTicks = 0
  controller.readAfterMessageCount = null
  if (render) {
    controller.chatPane.requestRender()
    controller.composer.requestRender()
  }
}

function addBrowserChatMessage(controller: BrowserChatController, message: Omit<BrowserChatMessage, "id" | "createdAt">): BrowserChatMessage {
  const next: BrowserChatMessage = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...message,
  }
  controller.messages.push(next)
  if (controller.messages.length > 80) controller.messages.splice(0, controller.messages.length - 80)
  controller.chatPane.requestRender()
  return next
}

function ensureBrowserChatAssistantMessage(controller: BrowserChatController): BrowserChatMessage {
  const last = controller.messages[controller.messages.length - 1]
  if (last?.role === "assistant" && last.streaming === true) return last
  return addBrowserChatMessage(controller, {role: "assistant", text: "", streaming: true})
}

function updateBrowserChatAssistantMessage(controller: BrowserChatController, text: string, streaming: boolean): void {
  const message = ensureBrowserChatAssistantMessage(controller)
  message.text = text
  message.streaming = streaming
  controller.chatPane.requestRender()
}

function appendBrowserChatSystemMessage(controller: BrowserChatController, text: string): void {
  addBrowserChatMessage(controller, {role: "system", text})
}

function stageBrowserChatDraft(controller: BrowserChatController, text: string, opts: {focusComposer?: boolean} = {}): boolean {
  const body = sanitizeHostTerminalVoiceInput(text)
  if (body.length === 0) return false
  clearVoicePartialPreviewForTarget({kind: "browser-chat", controller})
  const baseDraft = controller.voiceComposerEdited ? controller.codexDraft : (controller.voiceComposerBaseDraft ?? controller.codexDraft)
  const nextDraft = mergeCodexComposerDraft(baseDraft, body)
  resetBrowserChatVoiceComposerDraftTracking(controller)
  setBrowserChatDraft(controller, nextDraft)
  setBrowserChatStatus(controller, "voice added", 1800)
  if (opts.focusComposer) focusBrowserChatComposer(controller)
  controller.composer.requestRender()
  return true
}

function applyBrowserChatVoiceComposerText(controller: BrowserChatController, text: string): boolean {
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
  setBrowserChatDraft(controller, nextDraft)
  return true
}

function restoreBrowserChatVoiceComposerBaseDraft(controller: BrowserChatController): void {
  if (controller.voiceComposerBaseDraft === null) return
  if (!controller.voiceComposerEdited && controller.codexDraft === controller.voiceComposerGeneratedDraft) {
    setBrowserChatDraft(controller, controller.voiceComposerBaseDraft)
  }
  resetBrowserChatVoiceComposerDraftTracking(controller)
}

function resetBrowserChatVoiceComposerDraftTracking(controller: BrowserChatController): void {
  controller.voiceComposerBaseDraft = null
  controller.voiceComposerGeneratedDraft = ""
  controller.voiceComposerEdited = false
}

function focusBrowserChatComposer(controller: BrowserChatController): void {
  uiCanvas?.setFocused(controller.editor)
}

function setBrowserChatStatus(controller: BrowserChatController, status: string, ttlMs = 2200): void {
  if (controller.statusTimer !== null) {
    window.clearTimeout(controller.statusTimer)
    controller.statusTimer = null
  }
  controller.status = status
  controller.composer.requestRender()
  controller.chatPane.requestRender()
  if (!status) return
  controller.statusTimer = window.setTimeout(() => {
    controller.statusTimer = null
    controller.status = ""
    controller.composer.requestRender()
    controller.chatPane.requestRender()
  }, ttlMs)
}

function removeBrowserChatAttachment(controller: BrowserChatController, id: string): void {
  const next = controller.codexAttachments.filter((attachment) => attachment.id !== id)
  if (next.length === controller.codexAttachments.length) return
  controller.codexAttachments = next
  setBrowserChatStatus(controller, next.length > 0 ? `${next.length} attachments` : "")
  controller.composer.requestRender()
}

async function chooseBrowserChatImages(controller: BrowserChatController): Promise<void> {
  flushBrowserChatComposerPendingInput(controller)
  const files = await pickCodexImageFiles({multiple: true, parent: uiCanvas?.canvas.parentElement ?? document.body})
  if (files.length === 0) return
  await attachBrowserChatImages(controller, files)
}

async function attachBrowserChatImages(controller: BrowserChatController, files: readonly File[]): Promise<void> {
  if (files.length === 0) {
    setBrowserChatStatus(controller, "no image")
    return
  }
  setBrowserChatStatus(controller, "uploading image", 6000)
  controller.codexAttachmentUploadInFlight = true
  let submitAfterUpload = false
  try {
    const uploaded = await uploadCodexAttachments(files)
    controller.codexAttachments = [...controller.codexAttachments, ...uploaded]
    setBrowserChatStatus(controller, `${controller.codexAttachments.length} attachments`)
    focusBrowserChatComposer(controller)
    submitAfterUpload = controller.codexSubmitAfterAttachmentUpload && controller.codexAttachments.length > 0
  } catch (error) {
    setBrowserChatStatus(controller, error instanceof Error ? error.message : String(error), 5000)
  } finally {
    controller.codexAttachmentUploadInFlight = false
    controller.codexSubmitAfterAttachmentUpload = false
    controller.composer.requestRender()
  }
  if (submitAfterUpload) submitBrowserChatComposer(controller)
}

function installBrowserChatComposerDragHandlers(): void {
  if (browserChatComposerDragHandlersInstalled) return
  browserChatComposerDragHandlersInstalled = true
  document.addEventListener("dragover", handleBrowserChatDragOver, {capture: true})
  document.addEventListener("drop", (event) => void handleBrowserChatDrop(event), {capture: true})
  document.addEventListener("dragleave", handleBrowserChatDragLeave, {capture: true})
}

function handleBrowserChatDragOver(event: DragEvent): void {
  const controller = browserChat
  if (controller === null || !dragEventInsideBrowserChatComposer(event)) {
    if (controller !== null) setBrowserChatDropActive(controller, false)
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy"
  setBrowserChatDropActive(controller, true)
}

function handleBrowserChatDragLeave(event: DragEvent): void {
  const controller = browserChat
  if (controller === null) return
  const related = event.relatedTarget
  if (related instanceof Node && document.contains(related)) return
  setBrowserChatDropActive(controller, false)
}

async function handleBrowserChatDrop(event: DragEvent): Promise<void> {
  const controller = browserChat
  if (controller === null || !dragEventInsideBrowserChatComposer(event)) return
  event.preventDefault()
  event.stopPropagation()
  setBrowserChatDropActive(controller, false)
  const files = codexImageDropFiles(event.dataTransfer)
  await attachBrowserChatImages(controller, files)
}

function dragEventInsideBrowserChatComposer(event: DragEvent): boolean {
  const rect = browserChatComposerRect({w: window.innerWidth, h: window.innerHeight})
  if (rect.visible === false) return false
  return event.clientX >= rect.x && event.clientX <= rect.x + rect.w
    && event.clientY >= rect.y && event.clientY <= rect.y + rect.h
}

function setBrowserChatDropActive(controller: BrowserChatController, active: boolean): void {
  if (controller.codexDropActive === active) return
  controller.codexDropActive = active
  controller.composer.requestRender()
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function arrayLengthValue(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
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
  if (target.kind === "browser-chat") return "Browser Agent"
  const snapshot = moduleSnapshots.get(target.controller.id)
  return `${t("voiceTargetModule")}: ${snapshot?.label ?? target.controller.id}`
}

function voiceTargetCanAcceptInput(target: VoiceInputTarget): boolean {
  if (target.kind === "browser-chat") return !target.controller.sendInFlight
  if (target.kind === "host") {
    return target.controller === hostTerminal
      && target.controller.socket?.readyState === WebSocket.OPEN
      && target.controller.connectionState === "connected"
  }
  return false
}

function storeHostTerminalAgentSoundEnabled(enabled: boolean): void {
  writeHostTerminalAgentSoundEnabled(enabled)
  if (hostTerminal !== null) updateHostTerminalHeaderControls(hostTerminal)
  hostTerminalAgentSignalPane?.requestRender()
}

function storeVoiceAutoSendEnabled(enabled: boolean): void {
  writeVoiceAutoSendEnabled(enabled)
  renderVoiceHud()
}

function storeVoiceSignalVolume(value: number): void {
  writeVoiceSignalVolume(value)
  syncHudNotificationAudioVolume("activation")
  syncHudNotificationAudioVolume("deactivation")
  syncHudNotificationAudioVolume("stop")
  renderVoiceHud()
}

function storeHostTerminalAgentSoundVolume(value: number): void {
  writeHostTerminalAgentSoundVolume(value)
  syncHudNotificationAudioVolume("agent")
  hostTerminalAgentSignalPane?.requestRender()
}

function syncHudNotificationAudioVolume(kind: HudNotificationKind): void {
  const audio = hudNotificationAudioElements.get(kind)
  if (audio === undefined) return
  audio.volume = htmlNotificationVolume(hudNotificationVolume(kind))
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

function previewNetworkTerminalHudRect(rect: UiSurfaceRect): void {
  networkHostTerminalHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeNetworkTerminalHudRectAndRelayout(rect: UiSurfaceRect): void {
  networkHostTerminalHudRectPreview = null
  storeNetworkTerminalHudRect(rect)
  relayoutHudSurfaces()
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

function previewTodoHudRect(rect: UiSurfaceRect): void {
  todoHudRectPreview = rect
  relayoutHudSurfaces()
}

function storeTodoHudRectAndRelayout(rect: UiSurfaceRect): void {
  todoHudRectPreview = null
  storeTodoHudRect(rect)
  relayoutHudSurfaces()
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

function storeVoiceDeactivationMode(value: VoiceInputHudDeactivationMode): void {
  const next = voiceClientDeactivationMode(value)
  writeVoiceDeactivationMode(next)
  renderVoiceHud()
  voiceInputClient?.refreshDeactivationSettings()
}

function storeVoiceRecognitionTimeoutSeconds(value: number): void {
  writeVoiceRecognitionTimeoutSeconds(value)
  renderVoiceHud()
  voiceInputClient?.refreshDeactivationSettings()
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

function storeVoicePhrases(groupId: VoiceInputHudPhraseGroupId, phrases: readonly string[]): void {
  writeVoicePhrases(groupId, phrases)
  renderVoiceHud()
  restartVoiceCommandRecognizerAfterSettingsChange()
}

function storeVoiceFuzzyTolerance(groupId: VoiceInputHudPhraseGroupId, value: number): void {
  writeVoiceFuzzyTolerance(groupId, value)
  renderVoiceHud()
  restartVoiceCommandRecognizerAfterSettingsChange()
}

function addVoicePhrase(groupId: VoiceInputHudPhraseGroupId, phrase: string): void {
  storeVoicePhrases(groupId, [...readVoicePhrases(groupId), phrase])
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

  const displayMetrics = physicalDisplayMetrics()
  const moduleDisplayIdList = orderedModules.map((module) => moduleDisplayId(module.id))
  const totalW = moduleDisplayRowWidth(moduleDisplayIdList, displayMetrics)
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
  if (uiCanvas?.activeDisplayId === displayId) {
    const nextModuleId = moduleOrder.find((id) => id !== moduleId && moduleDisplayIds.has(id))
    const nextDisplayId = nextModuleId === undefined ? null : moduleDisplayId(nextModuleId)
    maybeAutoFocusDisplay(nextDisplayId)
  }
  uiCanvas?.removeDisplay(displayId)
}

function ensureRemoteDesktopDisplay(): void {
  if (uiCanvas === null) return
  const metrics = fixedRemoteDesktopDisplayMetrics()
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
    uiCanvas.setDisplayCenter(REMOTE_DESKTOP_DISPLAY_ID, center)
    updateRemoteDesktopAudioPosition(center)
  }
}

function fixedRemoteDesktopDisplayMetrics(): DisplayLayoutMetrics {
  if (remoteDesktopDisplayMetrics !== null) return remoteDesktopDisplayMetrics
  const frame = remoteDesktopPane?.frameSnapshot() ?? null
  const fallback = physicalDisplayMetrics()
  remoteDesktopDisplayMetrics = frame === null ? fallback : remoteDesktopDisplayMetricsForFrame(frame)
  remoteDesktopDisplayMetricsLocked = frame !== null
  return remoteDesktopDisplayMetrics
}

function lockRemoteDesktopDisplayMetricsToFrame(frame: AndroidRtcFrame): void {
  if (remoteDesktopDisplayMetricsLocked) return
  const metrics = remoteDesktopDisplayMetricsForFrame(frame)
  remoteDesktopDisplayMetrics = metrics
  remoteDesktopDisplayMetricsLocked = true
  if (uiCanvas === null || !remoteDesktopDisplayInstalled) return
  const center = displayCenterWithStored(REMOTE_DESKTOP_DISPLAY_ID, remoteDesktopDisplayFallbackCenter(metrics))
  uiCanvas.resizeDisplay(REMOTE_DESKTOP_DISPLAY_ID, metrics)
  uiCanvas.setDisplayCenter(REMOTE_DESKTOP_DISPLAY_ID, center)
  updateRemoteDesktopAudioPosition(center)
}

function remoteDesktopDisplayMetricsForFrame(frame: AndroidRtcFrame): DisplayLayoutMetrics {
  const pixelWidth = Math.max(1, Math.round(frame.width))
  const pixelHeight = Math.max(1, Math.round(frame.height))
  return {
    widthMm: Math.max(1, pixelWidth * PHYSICAL_DISPLAY_MM_PER_PIXEL),
    heightMm: Math.max(1, pixelHeight * PHYSICAL_DISPLAY_MM_PER_PIXEL),
    pixelWidth,
    pixelHeight,
  }
}

function remoteDesktopDisplayFallbackCenter(metrics: DisplayLayoutMetrics): UiRuntimeViewPointVector {
  const moduleMetrics = physicalDisplayMetrics()
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
  const metrics = physicalDisplayMetrics()
  const center = displayCenterWithStored(NETWORK_DISPLAY_ID, networkDisplayFallbackCenter(metrics))
  const controller = ensureNetworkHostTerminalController()
  ensureNetworkDisplayTerminal(controller)

  if (!networkDisplayInstalled) {
    networkDisplayInstalled = true
    networkDisplayControlsPane ??= new NetworkWatchPane({
      title: "Network",
      sessionLabel: "network",
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
  const moduleMetrics = physicalDisplayMetrics()
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
    title: "Network",
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
    chrome: "none",
    bodyInsetX: 0,
    bodyTopGap: 0,
    bodyBottomInset: 0,
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

function createHostCodexComposerPane(controller: HostTerminalController): HostTerminalCodexComposerPane<HostTerminalController> {
  return new HostTerminalCodexComposerPane({
    controller,
    status: hostCodexComposerStatus,
    canSubmit: hostCodexComposerCanSubmit,
    submit: (target) => { submitHostCodexComposer(target) },
    chooseImages: (target) => { void chooseHostCodexImages(target) },
    setDocked: setHostTerminalHudDocked,
    voiceSnapshot: voiceButtonSnapshot,
    voiceSoundPulse: () => voiceHudPane?.soundPulseAmount() ?? 0,
    onVoiceToggle: (target) => {
      setVoiceActiveTarget({kind: "host", controller: target})
      focusHostCodexComposer(target)
      void toggleVoiceInput()
    },
    openVoiceSettings,
    removeAttachment: removeHostCodexAttachment,
    clampRect: clampHostCodexComposerRect,
    syncEditorToComposer: syncHostCodexEditorToComposer,
    storeRect: storeHostCodexComposerRect,
    isAndroidBrowser,
    isTouchPointerEvent,
  })
}

function createBrowserChatEditor(controller: BrowserChatController): EditorPane {
  const editor = new EditorPane({
    path: "browser-agent-message.md",
    fontPx: 12,
    linePx: 17,
    titleFontPx: 11,
    readOnly: false,
    showCaret: true,
    introAnimation: false,
    showHeader: false,
    chrome: "none",
    bodyInsetX: 0,
    bodyTopGap: 0,
    bodyBottomInset: 0,
    indentGuides: false,
    showLineNumbers: false,
    wrapLines: true,
    draggable: false,
    resizable: false,
    onChange: (text) => setBrowserChatDraftFromEditor(controller, text),
    onSave: () => submitBrowserChatComposer(controller),
    onSubmit: () => submitBrowserChatComposer(controller),
  })
  editor.node.name = "InterpreterBrowserChatEditor"
  editor.setSelectionContextMenuEnabled(true)
  return editor
}

function createBrowserChatComposerPane(controller: BrowserChatController): HostTerminalCodexComposerPane<BrowserChatController> {
  return new HostTerminalCodexComposerPane({
    controller,
    title: "Browser Agent message",
    minimizeLabel: "Dock Browser Agent",
    voiceKey: "interpreter-browser-agent-message-voice",
    nodeName: "InterpreterBrowserChatComposerPane",
    status: browserChatComposerStatus,
    canSubmit: browserChatComposerCanSubmit,
    submit: (target) => { submitBrowserChatComposer(target) },
    chooseImages: (target) => { void chooseBrowserChatImages(target) },
    setDocked: setBrowserChatHudDocked,
    voiceSnapshot: voiceButtonSnapshot,
    voiceSoundPulse: () => voiceHudPane?.soundPulseAmount() ?? 0,
    onVoiceToggle: (target) => {
      setVoiceActiveTarget({kind: "browser-chat", controller: target})
      focusBrowserChatComposer(target)
      void toggleVoiceInput()
    },
    openVoiceSettings,
    removeAttachment: removeBrowserChatAttachment,
    clampRect: clampBrowserChatComposerRect,
    syncEditorToComposer: syncBrowserChatEditorToComposer,
    storeRect: storeBrowserChatComposerRect,
    isAndroidBrowser,
    isTouchPointerEvent,
  })
}

function ensureBrowserChatController(): BrowserChatController {
  if (browserChat !== null) return browserChat
  const controller = {} as BrowserChatController
  const chatPane = new BrowserChatPane({
    messages: () => controller.messages,
    status: () => browserChatComposerStatus(controller),
    setDocked: setBrowserChatHudDocked,
    clampRect: clampBrowserChatPaneRect,
    storeRect: storeBrowserChatHudRect,
  })
  const composer = createBrowserChatComposerPane(controller)
  const editor = createBrowserChatEditor(controller)
  Object.assign(controller, {
    chatPane,
    composer,
    editor,
    codexDraft: "",
    codexAttachments: [],
    codexAttachmentUploadInFlight: false,
    codexSubmitAfterAttachmentUpload: false,
    codexDropActive: false,
    codexEditorSyncing: false,
    status: "",
    statusTimer: null,
    voiceComposerBaseDraft: null,
    voiceComposerGeneratedDraft: "",
    voiceComposerEdited: false,
    messages: [],
    sendInFlight: false,
    readTimer: null,
    readStartedAt: 0,
    readStableTicks: 0,
    readAfterMessageCount: null,
    lastAssistantText: "",
  } satisfies BrowserChatController)
  browserChat = controller
  return controller
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
  const codexComposer = createHostCodexComposerPane(controller)
  const codexEditor = createHostCodexEditor(controller)
  Object.assign(controller, {
    hudTerminal,
    codexComposer,
    codexEditor,
    title: hostTerminalTitle(),
    sessionStorageKey: HOST_TERMINAL_SESSION_STORAGE_KEY,
    sessionKey: HOST_TERMINAL_SESSION_KEY,
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
    title: "Network",
    fontPx: 12,
    linePx: 17,
    draggable: true,
    resizable: true,
    onResize: (size) => resizeHostTerminalFromPane(controller, hudTerminal, size),
    onFrameRectPreview: previewNetworkTerminalHudRect,
    onFrameRectChange: storeNetworkTerminalHudRectAndRelayout,
    onFrameDockRequest: () => setNetworkTerminalDocked(true),
  })
  const codexComposer = createHostCodexComposerPane(controller)
  const codexEditor = createHostCodexEditor(controller)
  Object.assign(controller, {
    hudTerminal,
    codexComposer,
    codexEditor,
    title: "Network",
    sessionStorageKey: NETWORK_TERMINAL_SESSION_STORAGE_KEY,
    sessionKey: NETWORK_TERMINAL_SESSION_KEY,
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
    terminalMouseWheelMode: "scrollback",
    draggable: opts.draggable ?? false,
    resizable: opts.resizable ?? false,
    inputEnabled: false,
    onInput: (data, source) => sendHostTerminalInput(controller, data, source),
    onFocusChange: (focused) => {
      if (!focused) return
      if (terminal !== null) resizeHostTerminalFromPane(controller, terminal, terminal.getTerminalSize())
    },
    onAutoscrollPinnedChange: () => updateHostTerminalHeaderControls(controller),
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
        {
          label: t("terminalAgentSignal"),
          iconSrc: agentSignalIcon(readHostTerminalAgentSoundEnabled()),
          tone: readHostTerminalAgentSoundEnabled() ? "live" : "neutral",
          action: () => hostTerminalAgentSignalPane?.toggle(),
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

function setHostTerminalDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = hostTerminalDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  hostTerminalDockPlacement = placement
  writeStoredHostTerminalDockPlacement(placement)
  hostTerminalDockPane?.requestRender()
  relayoutHudSurfaces()
}

function setBrowserChatDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = browserChatDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  browserChatDockPlacement = placement
  writeStoredBrowserChatDockPlacement(placement)
  browserChatDockPane?.requestRender()
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

function setSqliteDockPlacement(placement: HostTerminalDockPlacement): void {
  const previous = sqliteDockPlacement
  if (previous !== null && previous.edge === placement.edge && Math.abs(previous.offset - placement.offset) < 0.5) return
  sqliteDockPlacement = placement
  writeStoredSqliteDockPlacement(placement)
  sqliteDockPane?.requestRender()
  relayoutHudSurfaces()
  updateSqliteContext()
}

function setHostTerminalHudDocked(docked: boolean): void {
  if (hostTerminalHudDocked === docked) {
    if (!docked) hostTerminal?.hudTerminal.focus()
    return
  }
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

function setBrowserChatHudDocked(docked: boolean): void {
  if (browserChatHudDocked === docked) {
    if (!docked && browserChat !== null) focusBrowserChatComposer(browserChat)
    return
  }
  browserChatHudDocked = docked
  writeStoredBrowserChatHudDocked(docked)
  const controller = browserChat
  if (docked) {
    if (controller !== null && uiCanvas !== null) {
      uiCanvas.setFocused(null)
      uiCanvas.inputProxy?.blur()
    }
  } else if (controller !== null) {
    focusBrowserChatComposer(controller)
  }
  controller?.chatPane.requestRender()
  controller?.composer.requestRender()
  browserChatDockPane?.requestRender()
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
  if (androidHudDocked === docked) {
    if (!docked) {
      uiCanvas?.setFocused(androidPane)
      connectAndroidRtc()
    }
    return
  }
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

function setTodoHudDocked(docked: boolean): void {
  if (todoHudDocked === docked) {
    if (!docked) uiCanvas?.setFocused(todoPane)
    return
  }
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
  if (sqliteHudDocked === docked) {
    if (!docked) uiCanvas?.setFocused(sqliteHudPane)
    return
  }
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

function currentHostTerminalDockEdge(): HudSideTabEdge {
  return hostTerminalDockPlacement?.edge ?? DEFAULT_HOST_TERMINAL_DOCK_PLACEMENT.edge
}

function currentBrowserChatDockEdge(): HudSideTabEdge {
  return browserChatDockPlacement?.edge ?? DEFAULT_BROWSER_CHAT_DOCK_PLACEMENT.edge
}

function currentTodoDockEdge(): HudSideTabEdge {
  return todoDockPlacement?.edge ?? DEFAULT_TODO_DOCK_PLACEMENT.edge
}

function currentAndroidDockEdge(): HudSideTabEdge {
  return androidDockPlacement?.edge ?? DEFAULT_ANDROID_DOCK_PLACEMENT.edge
}

function currentSqliteDockEdge(): HudSideTabEdge {
  return sqliteDockPlacement?.edge ?? DEFAULT_SQLITE_DOCK_PLACEMENT.edge
}

function physicalDisplayMetrics(): DisplayLayoutMetrics {
  return {...PHYSICAL_DISPLAY_METRICS}
}

function moduleDisplayId(moduleId: string): string {
  return `module:${moduleId}`
}

function toolsApiPath(): string {
  return "/tools"
}

type ProcessToolUseResponse = {
  ok?: boolean
  result?: unknown
  error?: string
  status?: number
}

type HostToolUseResponse = ProcessToolUseResponse

async function runHostTool(recipientName: string, parameters: Record<string, unknown>): Promise<HostToolUseResponse> {
  const response = await fetch(toolsApiPath(), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({tool_uses: [{recipient_name: recipientName, parameters}]}),
  })
  const payload = await response.json().catch(() => null) as {tool_uses?: HostToolUseResponse[]; error?: string} | null
  const tool = payload?.tool_uses?.[0]
  if (tool !== undefined) return tool
  return {ok: false, status: response.status, error: payload?.error ?? `host tool failed: ${response.status}`}
}

async function runProcessTool(processId: string, recipientName: string, parameters: Record<string, unknown>): Promise<ProcessToolUseResponse> {
  const response = await fetch(toolsApiPath(), {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({tool_uses: [{recipient_name: recipientName, parameters: {...parameters, processId}}]}),
  })
  const payload = await response.json().catch(() => null) as {tool_uses?: ProcessToolUseResponse[]; error?: string} | null
  const tool = payload?.tool_uses?.[0]
  if (tool !== undefined) return tool
  return {ok: false, status: response.status, error: payload?.error ?? `process tool failed: ${response.status}`}
}

function processToolResultObject(tool: ProcessToolUseResponse): Record<string, unknown> {
  return typeof tool.result === "object" && tool.result !== null && !Array.isArray(tool.result)
    ? tool.result as Record<string, unknown>
    : {}
}

function hostToolResultObject(tool: HostToolUseResponse): Record<string, unknown> {
  return typeof tool.result === "object" && tool.result !== null && !Array.isArray(tool.result)
    ? tool.result as Record<string, unknown>
    : {}
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
      onFocusChange: () => {
        queuePublishModuleContext(controller)
      },
    }),
    verbose: new VerbosePane(moduleVerboseStorageKey(module.id)),
    sourceCache: new Map<string, CachedSource>(),
    sourceTextKey: "",
    sourceSavedText: "",
    sourceGitBaseText: null,
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
    vcsStatuses: new Map(),
    lineStats: new Map(),
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
      const tool = await runProcessTool(controller.id, "process.modules", {limit: WORKSPACE_FILES_LIMIT})
      if (tool.ok !== true) throw new Error(tool.error ?? "process.modules failed")
      const data = processToolResultObject(tool) as WorkspaceFilesPayload
      const files = Array.isArray(data.modules) ? data.modules : data.files
      const fileEntries = Array.isArray(files)
        ? files
          .map((file) => ({
            path: typeof file.path === "string" ? file.path : "",
            vcsStatus: workspaceFileVcsStatus(file.vcsStatus),
            addedLines: nonNegativeInteger(file.addedLines),
            deletedLines: nonNegativeInteger(file.deletedLines),
          }))
          .filter((file) => file.path.length > 0)
        : []
      const paths = fileEntries.map((file) => file.path)
      const vcsStatuses = new Map(fileEntries.flatMap((file) => file.vcsStatus === undefined ? [] : [[file.path, file.vcsStatus] as const]))
      const lineStats = new Map(fileEntries.flatMap((file) => file.addedLines === undefined && file.deletedLines === undefined ? [] : [[file.path, {
        addedLines: file.addedLines ?? 0,
        deletedLines: file.deletedLines ?? 0,
      }] as const]))
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
      const items = workspaceFileItems(paths, openedFileIds, vcsStatuses, lineStats)
      controller.workspaceFiles.root = root
      controller.workspaceFiles.workspacePath = workspacePath
      controller.workspaceFiles.modulePath = data.entrypoint ?? data.modulePath ?? controller.workspaceFiles.modulePath
      controller.workspaceFiles.rootLabel = workspaceRootLabel(data.root)
      controller.workspaceFiles.catalogPaths = paths
      controller.workspaceFiles.vcsStatuses = vcsStatuses
      controller.workspaceFiles.lineStats = lineStats
      controller.workspaceFiles.items = items
      controller.workspaceFiles.storageKey = storageKey
      controller.workspaceFiles.openedFileIds = openedFileIds
      controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(storedState.expandedIds, items)
      controller.workspaceFiles.selectedIds = normalizeFileListSelection(storedState.selectedIds, items, "multiple")
      writeStoredWorkspaceFilesState(controller.workspaceFiles)
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
      controller.workspaceFiles.vcsStatuses = new Map()
      controller.workspaceFiles.lineStats = new Map()
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

function workspaceFileItems(
  catalogPaths: readonly string[],
  openedFileIds: readonly string[],
  vcsStatuses: ReadonlyMap<string, WorkspaceFileVcsStatus> = new Map(),
  lineStats: ReadonlyMap<string, {addedLines: number; deletedLines: number}> = new Map(),
): FileListItem[] {
  const catalogItems = workspaceFileTree(catalogPaths, {vcsStatuses, lineStats})
  const catalogFileIds = new Set(workspaceFileIds(catalogItems))
  const mutedFileIds = openedFileIds.filter((id) => !catalogFileIds.has(id))
  return workspaceFileTree([...catalogPaths, ...mutedFileIds], {mutedFileIds, vcsStatuses, lineStats})
}

function workspaceFileVcsStatus(value: unknown): WorkspaceFileVcsStatus | undefined {
  return value === "added" || value === "modified" || value === "deleted" ? value : undefined
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined
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
  writeStoredWorkspaceFilesState(controller.workspaceFiles)
  controller.files.setExpandedIds(controller.workspaceFiles.expandedIds)
}

function updateWorkspaceFilesSelectedState(controller: ModuleDisplayController, ids: readonly string[]): void {
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(ids, controller.workspaceFiles.items, "multiple")
  writeStoredWorkspaceFilesState(controller.workspaceFiles)
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
  const items = workspaceFileItems(controller.workspaceFiles.catalogPaths, openedFileIds, controller.workspaceFiles.vcsStatuses, controller.workspaceFiles.lineStats)
  const changed = !sameStringArray(openedFileIds, controller.workspaceFiles.openedFileIds)
    || findWorkspaceFileItem(controller.workspaceFiles.items, fileId)?.kind !== "file"
  if (!changed) return fileId

  controller.workspaceFiles.openedFileIds = openedFileIds
  controller.workspaceFiles.items = items
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(controller.workspaceFiles.expandedIds, items)
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(controller.workspaceFiles.selectedIds, items, "multiple")
  writeStoredWorkspaceFilesState(controller.workspaceFiles)
  applyWorkspaceFilesToModuleDisplay(controller)
  return fileId
}

function removeOpenedWorkspaceSource(controller: ModuleDisplayController, sourceUrl: string): boolean {
  const fileId = workspaceFileIdForSourcePath(controller.workspaceFiles, sourceUrl)
  if (fileId === null) return false
  const openedFileIds = controller.workspaceFiles.openedFileIds.filter((id) => id !== fileId)
  const items = workspaceFileItems(controller.workspaceFiles.catalogPaths, openedFileIds, controller.workspaceFiles.vcsStatuses, controller.workspaceFiles.lineStats)
  const changed = openedFileIds.length !== controller.workspaceFiles.openedFileIds.length ||
    findWorkspaceFileItem(controller.workspaceFiles.items, fileId)?.kind === "file"
  if (!changed) return false

  controller.workspaceFiles.openedFileIds = openedFileIds
  controller.workspaceFiles.items = items
  controller.workspaceFiles.expandedIds = normalizeWorkspaceExpandedIds(controller.workspaceFiles.expandedIds, items)
  controller.workspaceFiles.selectedIds = normalizeFileListSelection(controller.workspaceFiles.selectedIds.filter((id) => id !== fileId), items, "multiple")
  writeStoredWorkspaceFilesState(controller.workspaceFiles)
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
    const tool = await runProcessTool(controller.id, "source.read", {sourceUrl})
    const data = processToolResultObject(tool) as {
      url?: string
      scriptUrl?: string
      scriptSource?: string
      gitBaseSource?: string
      tokens?: EditorTokens
      sourceKind?: string
      error?: string
    }
    if (tool.ok !== true || typeof data.scriptSource !== "string") {
      const error = tool.error ?? data.error ?? "unknown"
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
      ...(typeof data.gitBaseSource === "string" ? {gitBaseText: data.gitBaseSource} : {}),
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
    setModuleSourceHeader(controller, "no file")
    return
  }

  controller.sourceSaving = true
  setModuleSourceHeader(controller)
  try {
    const tool = await runProcessTool(controller.id, "source.write", {sourceUrl, text})
    const data = processToolResultObject(tool) as {ok?: boolean; error?: string}
    if (tool.ok !== true || data.ok !== true) throw new Error(tool.error ?? data.error ?? "save failed")
    controller.sourceSavedText = text
    syncModuleSourceLineChanges(controller, text)
    controller.sourceDirty = false
    controller.sourceCache.clear()
  } catch (error) {
    setModuleSourceHeader(controller, error instanceof Error ? error.message : String(error))
  } finally {
    controller.sourceSaving = false
    setModuleSourceHeader(controller)
    queuePublishModuleContext(controller)
  }
}

function handleModuleSourceTextChange(controller: ModuleDisplayController, text: string): void {
  const lineChanges = sourceTextLineChanges(controller.sourceText, text)
  controller.sourceText = text
  syncModuleSourceLineChanges(controller, text)
  if (lineChanges.length > 0) applyLocalSourceLineChanges(controller, lineChanges)
  controller.sourceDirty = text !== controller.sourceSavedText
  setModuleSourceHeader(controller)
  queuePublishModuleContext(controller)
}

function syncModuleSourceLineChanges(controller: ModuleDisplayController, text: string): void {
  const gitBaseText = controller.sourceGitBaseText
  controller.source.setLineChanges(gitBaseText === null ? [] : sourceTextEditorLineChanges(gitBaseText, text))
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
  return msg.files.length > 0
}

function handleWorkspaceChanged(): void {
  for (const controller of moduleDisplays.values()) {
    controller.sourceCache.clear()
    void refreshWorkspaceFiles(controller)
    const sourceUrl = currentEditableSourceUrl(controller)
    if (sourceUrl === undefined) continue
    if (controller.sourceDirty || controller.sourceSaving) continue
    void refreshOpenSourceFromDisk(controller, sourceUrl)
  }
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
  const focusPatchedSource = displayActionAutoFocusEnabledNow()
  if (focusPatchedSource) maybeAutoFocusDisplay(moduleDisplayId(controller.id))
  const result = await openWorkspaceSource(controller, target.sourceUrl, {
    line: target.line,
    column: target.column,
    revealInWorkspace: true,
  })
  if (!result.ok) return
  if (focusPatchedSource) {
    uiCanvas?.setFocused(controller.source)
    uiCanvas?.inputProxy?.focus()
  }
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
      const tool = await runProcessTool(controller.id, "source.read", {scriptId, sourceUrl: frame.url, sourceKind})
      const data = processToolResultObject(tool) as {
        url?: string
        scriptUrl?: string
        scriptSource?: string
        gitBaseSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (tool.ok !== true || typeof data.scriptSource !== "string") {
        setModuleSource(controller, {
          text: `no source: ${tool.error ?? data.error ?? "unknown"}`,
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
        ...(typeof data.gitBaseSource === "string" ? {gitBaseText: data.gitBaseSource} : {}),
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
    ...(cached.gitBaseText === undefined ? {} : {gitBaseText: cached.gitBaseText}),
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
  setModuleSourceHeader(controller)
  const sourceKey = [
    payload.identity?.scriptId ?? "",
    payload.identity?.sourceUrl ?? "",
    payload.identity?.scriptUrl ?? "",
    payload.identity?.key ?? "",
    payload.text.length,
    stableStringHash(payload.text),
  ].join("\0")
  controller.sourceSavedText = payload.text
  controller.sourceGitBaseText = payload.gitBaseText ?? null
  controller.sourceText = payload.text
  controller.sourceDirty = false
  if (controller.sourceTextKey !== sourceKey) {
    controller.sourceTextKey = sourceKey
    controller.source.setText(payload.text)
    if (payload.tokens !== undefined) controller.source.setTokens(payload.tokens)
    else controller.source.setLanguage({path: sourcePathFromLocation(payload.location)})
  }
  syncModuleSourceLineChanges(controller, payload.text)
  const executionLine = state === "paused" && payload.currentLine > 0 ? payload.currentLine : null
  controller.source.setExecutionLine(executionLine, {scroll: executionLine !== null && forceScroll !== false})
  syncModuleBreakpointMarkers(controller)
  queuePublishModuleContext(controller)
}

function setModuleSourceState(controller: ModuleDisplayController, state: SourceRuntimeState): void {
  controller.sourceRuntimeState = state
  setModuleSourceHeader(controller)
  if (state !== "paused") controller.source.setExecutionLine(null, {scroll: false})
  queuePublishModuleContext(controller)
}

function setModuleSourceHeader(controller: ModuleDisplayController, subtitleOverride?: string): void {
  const snapshot = moduleSnapshots.get(controller.id)
  const dirty = controller.sourceDirty ? "*" : ""
  const title = subtitleOverride ?? moduleSourceSubtitle(controller)
  const subtitle = snapshot?.label ?? controller.id
  controller.source.setTitle(`${title}${dirty}`, subtitle === title ? "" : subtitle)
}

function moduleSourceSubtitle(controller: ModuleDisplayController): string {
  if (controller.sourceRuntimeState === "loading") return t("sourceLoading")
  if (controller.sourceRuntimeState === "running" && controller.sourceLocation.length > 0) {
    return `${t("sourceLastPaused")}: ${sourceDisplayLocation(controller.sourceLocation)}`
  }
  if (controller.sourceRuntimeState === "running") return t("sourceRunning")
  if (controller.sourceRuntimeState === "exited") return t("sourceExited")
  if (controller.sourceRuntimeState === "failed") return t("sourceFailed")
  if (controller.sourceRuntimeState === "disconnected") return t("sourceDisconnected")
  const location = sourceDisplayLocation(controller.sourceLocation) || t("sourceWaiting")
  return location
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
    const tool = await runProcessTool(moduleId, "process.action", {action: "restart"})
    const data = processToolResultObject(tool) as {ok?: boolean; error?: string}
    if ((tool.ok !== true || data.ok === false) && controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${t("restartTarget")}: ${tool.error ?? data.error ?? "failed"}`,
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
    const tool = await runProcessTool(moduleId, "process.action", {action: "stop"})
    const data = processToolResultObject(tool) as {ok?: boolean; error?: string}
    if ((tool.ok !== true || data.ok === false) && controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] process ${moduleId}/stop: ${tool.error ?? data.error ?? "failed"}`,
      })
    }
    return tool.ok === true && data.ok !== false
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
    const tool = await runProcessTool(controller.id, "breakpoint.list", {})
    if (tool.ok !== true) return
    const data = processToolResultObject(tool)
    const breakpoints = data.breakpoints
    if (!Array.isArray(breakpoints)) return
    controller.breakpointRegistrations = breakpoints.filter(isBreakpointRegistration)
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
      const tool = await runProcessTool(controller.id, "breakpoint.set", spec as Record<string, unknown>)
      const data = processToolResultObject(tool) as {ok?: boolean; error?: string; breakpoints?: unknown}
      if (tool.ok !== true || data.ok !== true) {
        errors.push(tool.error ?? data.error ?? "breakpoint.set failed")
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
    const tool = await runProcessTool(controller.id, existing === undefined ? "breakpoint.set" : "breakpoint.remove", body as Record<string, unknown>)
    const data = processToolResultObject(tool) as {ok?: boolean; error?: string; breakpoints?: unknown}
    if (tool.ok !== true || data.ok !== true) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] breakpoint: ${tool.error ?? data.error ?? "unknown error"}`,
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
  return clampHostCodexComposerRect(raw, bounds.w, bounds.h)
}

function clampHostCodexComposerRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const maxW = Math.max(1, bw - 24)
  const maxH = Math.max(1, bh - 24)
  const rectW = clampNumber(rect.w, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_W, maxW), maxW)
  const rectH = clampNumber(rect.h, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_H, maxH), maxH)
  return {
    x: clampNumber(rect.x, 12, Math.max(12, bw - rectW - 12)),
    y: clampNumber(rect.y, 12, Math.max(12, bh - rectH - 12)),
    w: rectW,
    h: rectH,
  }
}

function hostCodexEditorRect(bounds: {w: number; h: number}): UiSurfaceRect {
  return hostCodexEditorRectForComposer(hostCodexComposerRect(bounds))
}

function hostCodexEditorRectForComposer(composer: UiSurfaceRect): UiSurfaceRect {
  if (composer.visible === false) return hiddenRect()
  const layout = hostCodexComposerContentLayout(composer.w, composer.h, (hostTerminal?.codexAttachments.length ?? 0) > 0)
  return {
    x: composer.x + layout.editor.x,
    y: composer.y + layout.editor.y,
    w: layout.editor.w,
    h: layout.editor.h,
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

function browserChatPaneRect(bounds: {w: number; h: number}): UiSurfaceRect {
  if (browserChatHudDocked) return hiddenRect()
  const stored = readStoredBrowserChatHudRect()
  if (stored !== null) return clampBrowserChatPaneRect(stored, bounds.w, bounds.h)
  const rectW = Math.min(BROWSER_CHAT_PANE_DEFAULT_W, Math.max(1, bounds.w - 24))
  const rectH = Math.min(BROWSER_CHAT_PANE_DEFAULT_H, Math.max(1, bounds.h - HOST_TERMINAL_CODEX_COMPOSER_H - 48))
  return clampBrowserChatPaneRect({
    x: Math.max(12, bounds.w - rectW - 24),
    y: 72,
    w: rectW,
    h: rectH,
  }, bounds.w, bounds.h)
}

function clampBrowserChatPaneRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const maxW = Math.max(1, bw - 24)
  const maxH = Math.max(1, bh - HOST_TERMINAL_CODEX_COMPOSER_H - BROWSER_CHAT_PANE_GAP - 24)
  const rectW = clampNumber(rect.w, Math.min(BROWSER_CHAT_PANE_MIN_W, maxW), maxW)
  const rectH = clampNumber(rect.h, Math.min(BROWSER_CHAT_PANE_MIN_H, maxH), maxH)
  return {
    x: clampNumber(rect.x, 12, Math.max(12, bw - rectW - 12)),
    y: clampNumber(rect.y, 12, Math.max(12, bh - rectH - HOST_TERMINAL_CODEX_COMPOSER_H - BROWSER_CHAT_PANE_GAP - 12)),
    w: rectW,
    h: rectH,
  }
}

function browserChatComposerRect(bounds: {w: number; h: number}): UiSurfaceRect {
  if (browserChatHudDocked) return hiddenRect()
  const pane = browserChatPaneRect(bounds)
  if (pane.visible === false) return hiddenRect()
  const maxW = Math.max(1, bounds.w - 24)
  const maxH = Math.max(1, bounds.h - 24)
  const fallbackW = Math.min(Math.max(1, pane.w), maxW)
  const fallbackH = Math.min(HOST_TERMINAL_CODEX_COMPOSER_H, maxH)
  const belowY = pane.y + pane.h + BROWSER_CHAT_PANE_GAP
  const fallbackY = belowY + fallbackH <= bounds.h - 12
    ? belowY
    : Math.max(12, pane.y - fallbackH - BROWSER_CHAT_PANE_GAP)
  const raw = readStoredBrowserChatComposerRect() ?? {
    x: pane.x,
    y: fallbackY,
    w: fallbackW,
    h: fallbackH,
  }
  return clampBrowserChatComposerRect(raw, bounds.w, bounds.h)
}

function clampBrowserChatComposerRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const maxW = Math.max(1, bw - 24)
  const maxH = Math.max(1, bh - 24)
  const rectW = clampNumber(rect.w, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_W, maxW), maxW)
  const rectH = clampNumber(rect.h, Math.min(HOST_TERMINAL_CODEX_COMPOSER_MIN_H, maxH), maxH)
  return {
    x: clampNumber(rect.x, 12, Math.max(12, bw - rectW - 12)),
    y: clampNumber(rect.y, 12, Math.max(12, bh - rectH - 12)),
    w: rectW,
    h: rectH,
  }
}

function browserChatEditorRect(bounds: {w: number; h: number}): UiSurfaceRect {
  return browserChatEditorRectForComposer(browserChatComposerRect(bounds))
}

function browserChatEditorRectForComposer(composer: UiSurfaceRect): UiSurfaceRect {
  if (composer.visible === false) return hiddenRect()
  const layout = hostCodexComposerContentLayout(composer.w, composer.h, (browserChat?.codexAttachments.length ?? 0) > 0)
  return {
    x: composer.x + layout.editor.x,
    y: composer.y + layout.editor.y,
    w: layout.editor.w,
    h: layout.editor.h,
  }
}

function syncBrowserChatEditorToComposer(controller: BrowserChatController, composer: UiSurfaceRect, mode: "drag" | "release"): void {
  if (uiCanvas === null) return
  if (mode === "drag") {
    uiCanvas.setSurfaceRect(controller.editor, browserChatEditorRectForComposer(composer))
    return
  }
  uiCanvas.clearSurfaceRect(controller.editor)
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
  const body = paneBodyRect(panel.w, panel.h, {
    headerHeight: SQLITE_HUD_HEADER_H,
    insetX: SQLITE_HUD_CONTENT_PAD,
    topGap: SQLITE_HUD_CONTENT_PAD,
    bottomInset: SQLITE_HUD_CONTENT_PAD,
  })
  const tablesW = panel.w >= 900
    ? Math.min(300, Math.max(230, Math.floor(body.w * 0.24)))
    : Math.min(245, Math.max(180, Math.floor(body.w * 0.32)))
  const rects: SqliteRects = {tables: hiddenRect(), rows: hiddenRect()}
  flexRow({
    x: panel.x + body.x,
    y: panel.y + body.y,
    w: body.w,
    h: body.h,
    gap: GAP,
    items: [
      {width: tablesW, height: body.h, draw: (x, y, w, h) => { rects.tables = {x, y, w: Math.max(1, w), h: Math.max(1, h)} }},
      {width: "grow", height: body.h, draw: (x, y, w, h) => { rects.rows = {x, y, w: Math.max(1, w), h: Math.max(1, h)} }},
    ],
  })
  return rects
}

function hostTerminalAgentSignalRect(bounds: {w: number; h: number}): UiSurfaceRect {
  if (hostTerminalAgentSignalPane?.isOpen() !== true) return hiddenRect()
  const terminal = hostTerminalHudRect(bounds)
  if (terminal.visible === false) return hiddenRect()
  const panelW = Math.min(HOST_TERMINAL_AGENT_SIGNAL_PANEL_W, Math.max(1, terminal.w - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X * 2))
  const panelH = Math.min(
    HOST_TERMINAL_AGENT_SIGNAL_PANEL_H,
    Math.max(1, terminal.h - HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y - HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE - 10),
  )
  return {
    x: clampNumber(
      terminal.x + terminal.w - panelW - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X,
      terminal.x + HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X,
      Math.max(terminal.x + HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X, terminal.x + terminal.w - panelW - HOST_TERMINAL_AGENT_SIGNAL_HEADER_TEXT_X),
    ),
    y: terminal.y + HOST_TERMINAL_AGENT_SIGNAL_HEADER_Y + HOST_TERMINAL_AGENT_SIGNAL_BUTTON_SIZE + 6,
    w: panelW,
    h: panelH,
  }
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

function browserChatDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!browserChatHudDocked || w < 80 || h < 80) return hiddenRect()
  return browserChatDockRectForPlacement(browserChatDockPlacement ?? defaultBrowserChatDockPlacement({w, h}), {w, h})
}

function todoDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!todoHudDocked || w < 80 || h < 80) return hiddenRect()
  return todoDockRectForPlacement(todoDockPlacement ?? defaultTodoDockPlacement({w, h}), {w, h})
}

function androidDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!androidHudDocked || w < 80 || h < 80) return hiddenRect()
  return androidDockRectForPlacement(androidDockPlacement ?? defaultAndroidDockPlacement({w, h}), {w, h})
}

function sqliteDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!sqliteHudDocked || activeSqliteController() === null || w < 80 || h < 80) return hiddenRect()
  return sqliteDockRectForPlacement(sqliteDockPlacement ?? defaultSqliteDockPlacement({w, h}), {w, h})
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

function browserChatDockRectForPlacement(placement: HostTerminalDockPlacement, bounds: {w: number; h: number}): UiSurfaceRect {
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(BROWSER_CHAT_DOCK_SHORT, Math.max(1, bounds.w - BROWSER_CHAT_DOCK_MARGIN))
    : Math.min(BROWSER_CHAT_DOCK_LONG, Math.max(1, bounds.w - BROWSER_CHAT_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(BROWSER_CHAT_DOCK_LONG, Math.max(1, bounds.h - BROWSER_CHAT_DOCK_MARGIN * 2))
    : Math.min(BROWSER_CHAT_DOCK_SHORT, Math.max(1, bounds.h - BROWSER_CHAT_DOCK_MARGIN))
  if (vertical) {
    const centerY = clampNumber(
      placement.offset,
      BROWSER_CHAT_DOCK_MARGIN + dockH / 2,
      Math.max(BROWSER_CHAT_DOCK_MARGIN + dockH / 2, bounds.h - BROWSER_CHAT_DOCK_MARGIN - dockH / 2),
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
    BROWSER_CHAT_DOCK_MARGIN + dockW / 2,
    Math.max(BROWSER_CHAT_DOCK_MARGIN + dockW / 2, bounds.w - BROWSER_CHAT_DOCK_MARGIN - dockW / 2),
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

function defaultBrowserChatDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const placement = DEFAULT_BROWSER_CHAT_DOCK_PLACEMENT
  const vertical = placement.edge === "left" || placement.edge === "right"
  const dockW = vertical
    ? Math.min(BROWSER_CHAT_DOCK_SHORT, Math.max(1, bounds.w - BROWSER_CHAT_DOCK_MARGIN))
    : Math.min(BROWSER_CHAT_DOCK_LONG, Math.max(1, bounds.w - BROWSER_CHAT_DOCK_MARGIN * 2))
  const dockH = vertical
    ? Math.min(BROWSER_CHAT_DOCK_LONG, Math.max(1, bounds.h - BROWSER_CHAT_DOCK_MARGIN * 2))
    : Math.min(BROWSER_CHAT_DOCK_SHORT, Math.max(1, bounds.h - BROWSER_CHAT_DOCK_MARGIN))
  const minOffset = vertical
    ? BROWSER_CHAT_DOCK_MARGIN + dockH / 2
    : BROWSER_CHAT_DOCK_MARGIN + dockW / 2
  const maxOffset = vertical
    ? Math.max(minOffset, bounds.h - BROWSER_CHAT_DOCK_MARGIN - dockH / 2)
    : Math.max(minOffset, bounds.w - BROWSER_CHAT_DOCK_MARGIN - dockW / 2)
  return {
    edge: placement.edge,
    offset: clampNumber(placement.offset, minOffset, maxOffset),
  }
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

function browserChatDockPlacementFromPoint(point: {x: number; y: number}, bounds: {w: number; h: number}): HostTerminalDockPlacement {
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
  const rect = browserChatDockRectForPlacement({
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? point.y : point.x,
  }, bounds)
  return {
    edge: best.edge,
    offset: best.edge === "left" || best.edge === "right" ? rect.y + rect.h / 2 : rect.x + rect.w / 2,
  }
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
