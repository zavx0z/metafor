/**
 * Interpreter UI.
 *
 * One WebGPU Space contains one equal UIDisplay per launched module plus one
 * host terminal UIDisplay. Module runtime actions stay scoped to
 * `/modules/:id/...`.
 */

import {UiRuntime, UiSurface, uiIcons, type UiSurfaceRect} from "@ui/elements"
import {VoiceInputHud, type VoiceInputHudPhraseGroupId, type VoiceInputHudServiceState} from "@ui/components"
import {HudSideTab, type HudSideTabEdge} from "@ui/hud"
import {
  EditorPane,
  TerminalPane,
  sourceDisplayLocation,
  sourcePathFromLocation,
  type EditorBreakpoint,
  type EditorTokens,
  type TerminalInputSource,
  type TerminalPaneOpts,
  type TerminalSize,
  type TerminalStatusKind,
} from "@ui/panes"
import {
  DisplayHoverOutlinePane,
  FramesPane,
  ScopesPane,
  ToolbarPane,
  VerbosePane,
  type BadgeKind,
  type FrameSnapshot,
} from "./interpreter-ui.ts"
import {getUiLocale, t, toggleUiLocale} from "./i18n.ts"
import {
  breakpointRegistrationMatchesSource,
  breakpointSpecMatchesSource,
  sameSourceUrl,
} from "./breakpoint-matching.ts"
import {interactiveRestartPayload} from "./restart.ts"
import {formatTerminalExpressionResult} from "./terminal-value-format.ts"
import {
  DEFAULT_VOICE_ACTIVATION_PHRASES,
  DEFAULT_VOICE_DEACTIVATION_PHRASES,
  DEFAULT_VOICE_STOP_PHRASES,
  VoiceInputClient,
  VOICE_STOP_COMMAND_DETAIL,
  normalizeVoicePhrases,
  type VoiceInputChunk,
  type VoiceInputSegment,
  type VoiceInputStatus,
} from "./voice-input.ts"

type ConnectionInfo = {state: ConnectionState; error: string | null}
type ConnectionState = "connecting" | "connected" | "disconnected"

type ServerMessage =
  | {type: "hello"; modules?: ModulePaneSnapshot[]}
  | {type: "modules"; modules: ModulePaneSnapshot[]}
  | {type: "module"; module: ModulePaneSnapshot}
  | {type: "module-state"; moduleId: string; dump: InterpreterDump; module: ModulePaneSnapshot}
  | {type: "module-resumed"; moduleId: string; module: ModulePaneSnapshot}
  | {type: "module-connection"; moduleId: string; state: ConnectionState; error: string | null; protocolUrl: string; module: ModulePaneSnapshot}
  | {type: "module-target"; moduleId: string; event: TargetEvent; module: ModulePaneSnapshot}
  | {type: "module-protocol-event"; moduleId: string; ts: string; method: string; params: unknown}
  | {type: "interpreter-event"; ts: string; event: string; detail: unknown}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}
  | {type: "reload"}

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

type CachedSource = {
  text: string
  sourceUrl: string
  scriptUrl: string
  tokens?: EditorTokens
}

type CommandReply = {ok: boolean; result?: unknown; error?: string}
type ActiveInterpreterCommand = {cmd: string; label: string; startedAt: number}
type DisplayLayoutMetrics = {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}
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
  toolbar: ToolbarPane
  frames: FramesPane
  scopes: ScopesPane
  source: EditorPane
  terminal: TerminalPane
  verbose: VerbosePane
  sourceCache: Map<string, CachedSource>
  sourceTextKey: string
  sourceIdentity: BreakpointSourceIdentity | null
  breakpointRegistrations: BreakpointRegistration[]
  pendingBreakpointLines: Set<number>
  activeFrameIndex: number
  dump: InterpreterDump | undefined
  sourceLocation: string
  sourceRuntimeState: SourceRuntimeState
  outputLineCount: number
  activeCommand: ActiveInterpreterCommand | null
  verboseVisible: boolean
  terminalInput: {
    buffer: string
    promptVisible: boolean
  }
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
const VOICE_INPUT_URL_STORAGE_KEY = "metafor.interpreter.voice.url"
const VOICE_WAKE_URL_STORAGE_KEY = "metafor.interpreter.voice.wakeUrl"
const VOICE_INPUT_CONTEXT_STORAGE_KEY = "metafor.interpreter.voice.context"
const VOICE_WAKE_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.wakePhrases:v1"
const VOICE_ACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.activationPhrases:v1"
const VOICE_DEACTIVATION_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.deactivationPhrases:v1"
const VOICE_STOP_PHRASES_STORAGE_KEY = "metafor.interpreter.voice.stopPhrases:v1"
const VOICE_HUD_RECT_STORAGE_KEY = "metafor.interpreter.voice.hudRect:v1"
const DEFAULT_VOICE_INPUT_URL = "ws://127.0.0.1:8877/ws"
const DEFAULT_VOICE_WAKE_URL = "ws://127.0.0.1:4765/ws"
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
const AGENT_READY_SOUND_IDLE_MS = 2_500
const AGENT_READY_SOUND_COOLDOWN_MS = 1_200
const VOICE_SIGNAL_COOLDOWN_MS = 900

type HudNotificationKind = "activation" | "deactivation" | "stop" | "agent"

type HostTerminalDockPlacement = {
  edge: HudSideTabEdge
  offset: number
}

let uiCanvas: UiRuntime | null = null
let uiLoading = false
let displayHoverOutlinePane: DisplayHoverOutlinePane | null = null
let hostTerminal: HostTerminalController | null = null
let hostTerminalDockPane: HostTerminalDockPane | null = null
let hostTerminalHudDocked = readStoredHostTerminalHudDocked()
let hostTerminalDockPlacement = readStoredHostTerminalDockPlacement()
let voiceHudPane: VoiceInputHud | null = null
let voiceInputClient: VoiceInputClient | null = null
let voiceActiveTarget: VoiceInputTarget | null = null
let voicePartialPreviewTarget: VoiceInputTarget | null = null
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
let engineStatus = "engine: init"
let framedModuleKey = ""

const moduleSnapshots = new Map<string, ModulePaneSnapshot>()
const moduleDisplays = new Map<string, ModuleDisplayController>()
const moduleDisplayIds = new Set<string>()
let moduleOrder: string[] = []

const pendingRequests = new Map<number, {
  timer: number
  resolve: (reply: CommandReply) => void
}>()

for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
  const url = new URL(link.href, location.origin)
  url.searchParams.set("t", String(Date.now()))
  link.href = url.toString()
}

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
      if (snapshot !== undefined) updateModuleToolbar(controller, {
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
      return
    case "modules":
      applyModuleSnapshots(msg.modules)
      return
    case "module":
      applyModuleSnapshot(msg.module)
      return
    case "module-state":
      applyModuleSnapshot(msg.module)
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
    case "result":
      resolvePendingRequest(msg)
      pendingRequests.delete(msg.requestId)
      return
    case "reload": {
      const url = new URL(window.location.href)
      url.searchParams.set("_r", String(Date.now()))
      window.location.replace(url.toString())
      return
    }
  }
}

function applyModuleSnapshots(modules: ModulePaneSnapshot[]): void {
  if (modules.length === 0) return
  moduleOrder = modules.map((module) => module.id)
  for (const module of modules) moduleSnapshots.set(module.id, module)
  syncModuleDisplays()
  for (const module of modules) {
    const controller = moduleDisplays.get(module.id)
    if (controller !== undefined) updateModuleDisplay(controller, module)
  }
}

function applyModuleSnapshot(module: ModulePaneSnapshot): void {
  moduleSnapshots.set(module.id, module)
  if (!moduleOrder.includes(module.id)) moduleOrder.push(module.id)
  syncModuleDisplays()
  const controller = moduleDisplays.get(module.id)
  if (controller !== undefined) updateModuleDisplay(controller, module)
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
  setEngineStatus("engine: init")
  try {
    uiCanvas = await UiRuntime.create(engineCanvas, {
      virtualDisplay: {
        initial: "near",
        surfaceDisplay: false,
        centerMm: {x: 0, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM},
        farDistanceMm: 1200,
      },
    })
    displayHoverOutlinePane = new DisplayHoverOutlinePane()
    voiceHudPane = new VoiceInputHud({
      onToggle: () => void toggleVoiceInput(),
      onMove: storeVoiceHudRect,
      settings: () => ({
        title: t("voiceInput"),
        debugTabLabel: t("voiceDebugTab"),
        phraseGroups: voicePhraseGroupsForHud(),
        wakeEndpoint: voiceEndpointLabel(readVoiceWakeUrl()),
        inputEndpoint: voiceEndpointLabel(readVoiceInputUrl()),
        serviceLine: voiceServiceLine(),
        debugLines: voiceDebugLines(),
      }),
      onAddPhrase: addVoicePhrase,
      onRemovePhrase: removeVoicePhrase,
      onResetPhrases: resetVoicePhrases,
      startTooltip: () => t("voiceStart"),
      stopTooltip: () => t("voiceStop"),
    })
    installEnginePanes()
    uiCanvas.handleResize()
    syncModuleDisplays()
    resizeObserver = new ResizeObserver(handleEngineResize)
    resizeObserver.observe(engineCanvas)
    requestAnimationFrame(handleEngineResize)
    window.addEventListener("resize", handleEngineResize)
    setEngineStatus("engine: webgpu")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setEngineStatus(`engine failed: ${message}`)
    console.error("interpreter canvas init failed:", error)
  } finally {
    uiLoading = false
  }
}

function setEngineStatus(text: string): void {
  engineStatus = text
  for (const controller of moduleDisplays.values()) {
    const snapshot = moduleSnapshots.get(controller.id)
    if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
  }
}

function handleEngineResize(): void {
  uiCanvas?.handleResize()
  syncModuleDisplays()
}

function installEnginePanes(): void {
  if (uiCanvas === null || displayHoverOutlinePane === null) return
  uiCanvas.addHudSurface(displayHoverOutlinePane, ({w, h}) => ({x: 0, y: 0, w, h}))
  const host = ensureHostTerminalController()
  uiCanvas.addHudSurface(host.hudTerminal, hostTerminalHudRect)
  if (host.socket === null) connectHostTerminal(host)
  hostTerminalDockPane ??= new HostTerminalDockPane(() => setHostTerminalHudDocked(false))
  uiCanvas.addHudSurface(hostTerminalDockPane, hostTerminalDockRect)
  if (voiceHudPane !== null) {
    uiCanvas.addHudSurface(voiceHudPane, voiceHudRect)
  }
  updateVoiceHud()
  scheduleVoiceAutoWake(500)
}

function toggleLocale(): void {
  toggleUiLocale()
  if (hostTerminal !== null) {
    for (const pane of hostTerminalPanes(hostTerminal)) {
      pane.setTitle(t("hostTerminal"))
      pane.requestRender()
    }
  }
  updateVoiceHud()
  for (const controller of moduleDisplays.values()) {
    controller.source.setTitle(moduleSourceTitle(controller))
    controller.frames.requestRender()
    controller.scopes.requestRender()
    controller.terminal.setTitle(t("terminalTarget"))
    controller.terminal.requestRender()
    controller.verbose.requestRender()
    const snapshot = moduleSnapshots.get(controller.id)
    if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
  }
  uiCanvas?.relayout()
}

function setVerboseVisible(controller: ModuleDisplayController, on: boolean): void {
  controller.verboseVisible = on
  localStorage.setItem(moduleVerboseStorageKey(controller.id), on ? "1" : "0")
  const snapshot = moduleSnapshots.get(controller.id)
  if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
  uiCanvas?.relayout()
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
      icon: uiIcons.log,
      label: t("hostTerminal"),
      tone: "neutral",
      tooltip: t("hostTerminal"),
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
    language: "ru",
    context: readVoiceInputContext,
    onStatus: handleVoiceStatus,
    onWake: () => updateVoiceHud("connecting", readVoiceInputUrl()),
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
  if (status !== "error" && status !== "committing" && (status !== "listening" || detail === undefined || detail === "")) clearVoicePartialPreview()
  updateVoiceHud(status, detail)
  if (voiceSignal !== null) playVoiceSignal(voiceSignal)
}

function voiceSignalForStatusChange(previousStatus: VoiceInputStatus, nextStatus: VoiceInputStatus, detail?: string): HudNotificationKind | null {
  if (nextStatus === "listening" && previousStatus !== "listening" && previousStatus !== "committing") return "activation"
  if (nextStatus === "waitingWake" && (previousStatus === "listening" || previousStatus === "committing" || previousStatus === "connecting")) return "deactivation"
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
  clearVoicePartialPreview()
  const messages = voiceMessagesFromChunk(chunk)
  if (messages.length === 0) return
  voiceLastChunkText = messages.join("\n\n")
  voiceLastChunkAt = new Date()
  for (const message of messages) insertVoiceMessage(message)
  renderVoiceHud()
}

function handleVoicePartial(raw: string): void {
  const target = voiceActiveTarget
  if (target === null || !voiceTargetCanAcceptInput(target)) {
    clearVoicePartialPreview()
    return
  }

  const text = cleanupVoiceInputText(raw)
  if (!text) {
    clearVoicePartialPreview()
    return
  }

  voiceLastPartialText = text
  voiceLastPartialAt = new Date()
  if (target.kind === "module") showModuleTerminalPrompt(target.controller)
  showVoicePartialPreview(target, text)
  renderVoiceHud()
}

function showVoicePartialPreview(target: VoiceInputTarget, text: string): void {
  if (voicePartialPreviewTarget !== null && !sameVoiceInputTarget(voicePartialPreviewTarget, target)) clearVoicePartialPreview()
  voicePartialPreviewTarget = target
  for (const terminal of voicePreviewTerminals(target)) terminal.setInputPreview(text)
}

function clearVoicePartialPreview(): void {
  const target = voicePartialPreviewTarget
  if (target === null) return
  for (const terminal of voicePreviewTerminals(target)) terminal.clearInputPreview()
  voicePartialPreviewTarget = null
}

function clearVoicePartialPreviewForTarget(target: VoiceInputTarget): void {
  if (voicePartialPreviewTarget === null || !sameVoiceInputTarget(voicePartialPreviewTarget, target)) return
  clearVoicePartialPreview()
}

function sameVoiceInputTarget(a: VoiceInputTarget, b: VoiceInputTarget): boolean {
  return a.kind === b.kind && a.controller === b.controller
}

function voicePreviewTerminals(target: VoiceInputTarget): TerminalPane[] {
  if (target.kind === "host") return hostTerminalPanes(target.controller)
  return [target.controller.terminal]
}

function insertVoiceMessage(raw: string): void {
  const text = cleanupVoiceInputText(raw)
  if (!text) return

  const target = voiceActiveTarget
  if (target === null) {
    flashVoiceHudError(t("voiceNoActiveInput"))
    return
  }

  if (target.kind === "host") {
    if (!voiceTargetCanAcceptInput(target)) {
      flashVoiceHudError(t("voiceNoActiveInput"))
      return
    }
    if (!sendHostTerminalVoiceSubmit(target.controller, text)) return
    recordVoiceAutoEnter()
    updateVoiceHud(undefined, `${t("voiceInserted")}: ${text}`)
    return
  }

  voiceModuleSubmitQueue = voiceModuleSubmitQueue.then(() => submitVoiceModuleExpression(target.controller, text))
  void voiceModuleSubmitQueue.catch((error) => flashVoiceHudError(error instanceof Error ? error.message : String(error)))
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
  return splitVoiceParagraphs(source)
}

const VOICE_MESSAGE_PAUSE_SECONDS = 0.65

function voiceMessagesFromSegments(segments: VoiceInputSegment[]): string[] {
  if (segments.length < 2) return []

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
  return text.replace(/\s+/g, " ").trim()
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

function voiceDebugLines(): string[] {
  const ru = getUiLocale() === "ru"
  const target = voiceTargetLabel()
  const previewActive = voicePartialPreviewTarget !== null
  return [
    `${ru ? "статус" : "status"}: ${voiceStatusLabel(voiceHudStatus)}`,
    `${ru ? "деталь" : "detail"}: ${voiceHudDetail || "-"}`,
    `${ru ? "цель" : "target"}: ${target || "-"}`,
    `${ru ? "preview активен" : "preview active"}: ${previewActive ? "yes" : "no"}`,
    `${ru ? "preview символов" : "preview chars"}: ${voiceLastPartialText.length}`,
    `${ru ? "partial" : "partial"}: ${debugVoiceText(voiceLastPartialText)}`,
    `${ru ? "partial время" : "partial at"}: ${formatDebugTime(voiceLastPartialAt)}`,
    `${ru ? "chunk символов" : "chunk chars"}: ${voiceLastChunkText.length}`,
    `${ru ? "chunk" : "chunk"}: ${debugVoiceText(voiceLastChunkText)}`,
    `${ru ? "chunk время" : "chunk at"}: ${formatDebugTime(voiceLastChunkAt)}`,
    `${ru ? "последняя ошибка" : "last error"}: ${debugVoiceText(voiceLastErrorText)}`,
    `${ru ? "ошибка время" : "error at"}: ${formatDebugTime(voiceLastErrorAt)}`,
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
  if (kind !== "agent" && voiceInputClient?.playSignalTone(kind, recordHudNotificationSound) === true) {
    return
  }
  playBrowserHudNotificationSound(kind)
}

function playBrowserHudNotificationSound(kind: HudNotificationKind): void {
  if (playHudNotificationWebAudioTone(kind, (reason) => playHudNotificationHtmlAudio(kind, reason))) return
  playHudNotificationHtmlAudio(kind, "no webaudio")
}

function playHudNotificationHtmlAudio(kind: HudNotificationKind, reason = "fallback"): void {
  const audio = ensureHudNotificationAudioElement(kind)
  if (audio !== null) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // Some browsers reject seeking before media metadata is available.
    }
    audio.muted = false
    audio.volume = 0.9
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
    audio.volume = 0.9
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
    audio.volume = 0.9
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

function playHudNotificationWebAudioTone(kind: HudNotificationKind, onError?: (reason: string) => void): boolean {
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
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(toneSpec.gain, start + 0.018)
    gain.gain.exponentialRampToValueAtTime(toneSpec.gain * 0.42, start + toneSpec.duration * 0.45)
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
  return {startHz: 587.33, endHz: 880, duration: 0.28, gain: 0.3, type: "triangle"}
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
  try {
    localStorage.setItem(voicePhraseStorageKey(groupId), JSON.stringify(next))
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

  const displayMetrics = viewportDisplayMetrics()
  const moduleDisplayIdList = orderedModules.map((module) => moduleDisplayId(module.id))
  const displayIds = moduleDisplayIdList
  const totalW = displayIds.length * displayMetrics.widthMm
    + Math.max(0, displayIds.length - 1) * MODULE_DISPLAY_GAP_MM
  let cursorX = -totalW / 2

  for (const module of orderedModules) {
    const displayId = moduleDisplayId(module.id)
    const x = cursorX + displayMetrics.widthMm / 2
    cursorX += displayMetrics.widthMm + MODULE_DISPLAY_GAP_MM
    const center = {x, y: MODULE_DISPLAY_CENTER_Y_MM, z: MODULE_DISPLAY_CENTER_Z_MM}

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
    } else {
      uiCanvas.resizeDisplay(displayId, displayMetrics)
      uiCanvas.setDisplayCenter(displayId, center)
    }

    const controller = moduleDisplays.get(module.id)
    if (controller !== undefined) updateModuleDisplay(controller, module)
  }

  const frameKey = displayIds.map((id, index) => {
    return `${id}:${index}:${Math.round(displayMetrics.widthMm)}x${Math.round(displayMetrics.heightMm)}:${displayMetrics.pixelWidth}x${displayMetrics.pixelHeight}`
  }).join("\0")

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

function ensureHostTerminalController(): HostTerminalController {
  if (hostTerminal !== null) return hostTerminal
  const controller = {} as HostTerminalController
  const hudTerminal = createHostTerminalPane(controller, "InterpreterHostTerminalHud", {
    fontPx: 12,
    linePx: 17,
    onResize: (size) => resizeHostTerminalFromPane(controller, hudTerminal, size),
    onFrameRectChange: storeHostTerminalHudRect,
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
    onResize?: (size: TerminalSize) => void
    onFrameRectChange?: TerminalPaneOpts["onFrameRectChange"]
    onFrameDockRequest?: TerminalPaneOpts["onFrameDockRequest"]
  },
): TerminalPane {
  let terminal: TerminalPane | null = null
  const terminalOpts: TerminalPaneOpts = {
    title: t("hostTerminal"),
    status: t("terminalConnecting"),
    statusKind: "idle",
    fontPx: opts.fontPx,
    linePx: opts.linePx,
    maxScrollback: 10000,
    cursorLineHighlight: true,
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
  if (opts.onFrameRectChange !== undefined) terminalOpts.onFrameRectChange = opts.onFrameRectChange
  if (opts.onFrameDockRequest !== undefined) terminalOpts.onFrameDockRequest = opts.onFrameDockRequest
  terminal = new TerminalPane(terminalOpts)
  terminal.node.name = name
  return terminal
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
  const url = new URL(`${protocol}//${location.host}/terminal`)
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
  voiceHudPane?.flashSoundIndicator()
  playHudNotificationSound("agent")
}

function setHostTerminalStatus(controller: HostTerminalController, kind: PtyStatusKind, label: string): void {
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

function readStoredVoiceHudRect(): UiSurfaceRect | null {
  try {
    return parseStoredPaneRect(localStorage.getItem(VOICE_HUD_RECT_STORAGE_KEY))
  } catch {
    return null
  }
}

function storeVoiceHudRect(rect: UiSurfaceRect): void {
  const normalized = normalizeStoredPaneRect({...rect, w: VOICE_HUD_W, h: VOICE_HUD_H})
  if (normalized === null) return
  try {
    localStorage.setItem(VOICE_HUD_RECT_STORAGE_KEY, JSON.stringify(normalized))
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

function writeStoredHostTerminalDockPlacement(placement: HostTerminalDockPlacement): void {
  try {
    localStorage.setItem(HOST_TERMINAL_DOCK_PLACEMENT_STORAGE_KEY, JSON.stringify(placement))
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
  uiCanvas?.relayout()
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
  uiCanvas?.relayout()
}

function isHostTerminalDockEdge(value: unknown): value is HudSideTabEdge {
  return value === "left" || value === "right" || value === "top" || value === "bottom"
}

function currentHostTerminalDockEdge(): HudSideTabEdge {
  return hostTerminalDockPlacement?.edge ?? "left"
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

function moduleVerboseStorageKey(moduleId: string): string {
  return `interpreter:module:${moduleId}:verbose`
}

function readModuleVerboseVisible(moduleId: string): boolean {
  return localStorage.getItem(moduleVerboseStorageKey(moduleId)) === "1"
}

function addInterpreterSurfacesToDisplay(displayId: string, controller: ModuleDisplayController): void {
  if (uiCanvas === null) return
  uiCanvas.addSurfaceToDisplay(displayId, controller.frames, (canvas) => interpreterRects(canvas, controller.verboseVisible).frames)
  uiCanvas.addSurfaceToDisplay(displayId, controller.scopes, (canvas) => interpreterRects(canvas, controller.verboseVisible).scopes)
  uiCanvas.addSurfaceToDisplay(displayId, controller.source, (canvas) => interpreterRects(canvas, controller.verboseVisible).source)
  uiCanvas.addSurfaceToDisplay(displayId, controller.terminal, (canvas) => interpreterRects(canvas, controller.verboseVisible).terminal)
  uiCanvas.addSurfaceToDisplay(displayId, controller.verbose, (canvas) => interpreterRects(canvas, controller.verboseVisible).verbose ?? hiddenRect())
  uiCanvas.addSurfaceToDisplay(displayId, controller.toolbar, ({w}) => ({
    x: TOOLBAR_INSET,
    y: TOOLBAR_INSET,
    w: Math.max(1, w - TOOLBAR_INSET * 2),
    h: TOOLBAR_H,
  }))
}

function createModuleDisplayController(module: ModulePaneSnapshot): ModuleDisplayController {
  const controller = {} as ModuleDisplayController
  Object.assign(controller, {
    id: module.id,
    toolbar: new ToolbarPane({
      onPause: () => void runModuleInterpreterCommand(controller, "pause", {}, t("pause")),
      onResume: () => void runModuleInterpreterCommand(controller, "resume", {}, t("resume")),
      onRestartTarget: () => void restartModule(controller.id),
      onStopTarget: () => void stopModule(controller.id),
      onShowExecutionPoint: () => showModuleExecutionPoint(controller),
      onStep: (kind) => void runModuleInterpreterCommand(controller, "step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut")),
      onToggleLocale: () => toggleLocale(),
      onToggleVerbose: () => setVerboseVisible(controller, !controller.verboseVisible),
    }),
    frames: new FramesPane((index) => {
      controller.activeFrameIndex = index
      renderModuleDump(controller, true)
    }),
    scopes: new ScopesPane(),
    source: new EditorPane({
      title: t("sourceWaiting"),
      path: "",
      fontPx: 12,
      linePx: 16,
      readOnly: true,
      showCaret: false,
      introAnimation: false,
      onBreakpointToggle: (line) => void toggleModuleBreakpoint(controller, line),
    }),
    terminal: new TerminalPane({
      title: t("terminalTarget"),
      status: t("waitingStdout"),
      statusKind: "idle",
      fontPx: 12,
      linePx: 16,
      cursorBlink: true,
      inputEnabled: false,
      onInput: (data) => handleModuleTerminalInput(controller, data),
      onFocusChange: (focused) => {
        if (focused) setVoiceActiveTarget({kind: "module", controller})
      },
    }),
    verbose: new VerbosePane(moduleVerboseStorageKey(module.id)),
    sourceCache: new Map<string, CachedSource>(),
    sourceTextKey: "",
    sourceIdentity: null,
    breakpointRegistrations: [],
    pendingBreakpointLines: new Set<number>(),
    activeFrameIndex: 0,
    dump: undefined,
    sourceLocation: "",
    sourceRuntimeState: "idle" as SourceRuntimeState,
    outputLineCount: 0,
    activeCommand: null,
    verboseVisible: readModuleVerboseVisible(module.id),
    terminalInput: {
      buffer: "",
      promptVisible: false,
    },
  } satisfies ModuleDisplayController)

  controller.toolbar.node.name = `InterpreterToolbar:${module.id}`
  controller.frames.node.name = `InterpreterFrames:${module.id}`
  controller.scopes.node.name = `InterpreterScopes:${module.id}`
  controller.source.node.name = `InterpreterSource:${module.id}`
  controller.terminal.node.name = `InterpreterTerminal:${module.id}`
  controller.verbose.node.name = `InterpreterVerbose:${module.id}`
  updateModuleDisplay(controller, module)
  return controller
}

function updateModuleDisplay(controller: ModuleDisplayController, module: ModulePaneSnapshot): void {
  if (module.target.outputLineCount < controller.outputLineCount) {
    controller.terminal.clear()
    controller.terminalInput.buffer = ""
    controller.terminalInput.promptVisible = false
    controller.outputLineCount = 0
  }
  const nextLines = module.target.output.slice(controller.outputLineCount)
  if (nextLines.length > 0) {
    hideModuleTerminalPrompt(controller)
    for (const line of nextLines) appendModuleTargetLine(controller, line)
    controller.outputLineCount = module.target.outputLineCount
  }
  updateModuleTerminalStatus(controller, module)

  const finishedState = module.target.state === "exited"
    ? "exited"
    : module.target.state === "failed"
      ? "failed"
      : null
  if (module.paused && module.dump !== null) {
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

  updateModuleToolbar(controller, module)
  syncModuleTerminalInput(controller)
}

function updateModuleToolbar(controller: ModuleDisplayController, module: ModulePaneSnapshot): void {
  const run = moduleRunStatus(module)
  const targetFinished = module.target.state === "exited" || module.target.state === "failed"
  const targetRunning = module.target.state === "starting" || module.target.state === "running"
  const contextConnected = module.connection.state === "connected"
  const canControlExecution = contextConnected && targetRunning
  const cleanExit = module.target.state === "exited" && module.target.exitCode === 0
  const socketKind: BadgeKind = targetFinished
    ? cleanExit ? "neutral" : "warn"
    : module.connection.state === "connected"
    ? "live"
    : module.connection.state === "connecting"
      ? "neutral"
      : "warn"
  controller.toolbar.setState({
    ws: targetFinished ? "closed" : module.connection.state,
    wsKind: socketKind,
    connection: targetFinished ? "context: finished" : `context: ${module.connection.state}`,
    connectionKind: socketKind,
    run: controller.activeCommand === null ? run.text : t("commandExecuting"),
    runKind: controller.activeCommand === null ? run.kind : "paused",
    commandBusy: controller.activeCommand !== null,
    commandCmd: controller.activeCommand?.cmd ?? "",
    commandLabel: controller.activeCommand?.label ?? "",
    locale: getUiLocale(),
    protocolUrl: module.protocolUrl,
    verbose: controller.verboseVisible,
    engine: engineStatus,
    canPause: canControlExecution && !module.paused,
    canResume: canControlExecution && module.paused,
    canStep: canControlExecution && module.paused,
    canRestart: module.target.command.length > 0,
    canStop: targetRunning,
    canShowExecutionPoint: canControlExecution && module.paused && controller.dump !== undefined && controller.dump.frames.length > 0,
  })
}

function moduleRunStatus(module: ModulePaneSnapshot): {text: string; kind: BadgeKind} {
  if (module.paused) return {text: "paused", kind: "paused"}
  if (module.target.state === "running") return {text: "running", kind: "live"}
  if (module.target.state === "starting") return {text: "module starting", kind: "neutral"}
  if (module.target.state === "exited") return {text: `exited code=${module.target.exitCode}`, kind: module.target.exitCode === 0 ? "neutral" : "warn"}
  if (module.target.state === "failed") return {text: "failed", kind: "warn"}
  return {text: "waiting", kind: "neutral"}
}

function applyModuleDump(moduleId: string, dump: InterpreterDump): void {
  const controller = moduleDisplays.get(moduleId)
  if (controller === undefined) return
  const isNewPause = controller.dump?.timestamp !== dump.timestamp
  controller.dump = dump
  if (isNewPause) controller.activeFrameIndex = 0
  controller.activeFrameIndex = Math.min(controller.activeFrameIndex, Math.max(0, dump.frames.length - 1))
  renderModuleDump(controller, isNewPause)
  const snapshot = moduleSnapshots.get(moduleId)
  if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
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
  if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
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
  const cacheKey = `${scriptId}\0sourcemap\0${frame.url}`
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
      const res = await fetch(`/modules/${encodeURIComponent(controller.id)}/source?scriptId=${encodeURIComponent(scriptId)}&sourceUrl=${encodeURIComponent(frame.url)}&sourceKind=sourcemap`)
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
  const sourceKey = `${payload.identity?.scriptId ?? ""}\0${payload.location}\0${payload.text.length}\0${payload.text.slice(0, 80)}`
  if (controller.sourceTextKey !== sourceKey) {
    controller.sourceTextKey = sourceKey
    controller.source.setText(payload.text)
    if (payload.tokens !== undefined) controller.source.setTokens(payload.tokens)
    else controller.source.setLanguage({path: sourcePathFromLocation(payload.location)})
  }
  const executionLine = state === "paused" && payload.currentLine > 0 ? payload.currentLine : null
  controller.source.setExecutionLine(executionLine, {scroll: executionLine !== null && forceScroll !== false})
  syncModuleBreakpointMarkers(controller)
}

function setModuleSourceState(controller: ModuleDisplayController, state: SourceRuntimeState): void {
  controller.sourceRuntimeState = state
  controller.source.setTitle(moduleSourceTitle(controller))
  if (state !== "paused") controller.source.setExecutionLine(null, {scroll: false})
}

function moduleSourceTitle(controller: ModuleDisplayController): string {
  const snapshot = moduleSnapshots.get(controller.id)
  const label = snapshot?.label ?? controller.id
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
  if (snapshot !== undefined) updateModuleToolbar(controller, snapshot)
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
    if (nextSnapshot !== undefined) updateModuleToolbar(controller, nextSnapshot)
    syncModuleTerminalInput(controller)
  }
}

async function restartModule(moduleId: string): Promise<void> {
  const snapshot = moduleSnapshots.get(moduleId)
  const controller = moduleDisplays.get(moduleId)
  if (controller?.activeCommand !== null && controller?.activeCommand !== undefined) return
  const command = snapshot?.target.command
  if (command === undefined || command.length === 0) return
  await stopModule(moduleId)
  const breakpoints = readStoredBreakpointSpecs()
  const body = interactiveRestartPayload({
    label: snapshot?.label ?? moduleId,
    command,
    breakpoints,
  })
  try {
    await fetch(`/modules/${encodeURIComponent(moduleId)}/run`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] ${t("restartTarget")}: ${String(error)}`,
      })
    }
  }
}

async function stopModule(moduleId: string): Promise<void> {
  const controller = moduleDisplays.get(moduleId)
  if (controller?.activeCommand !== null && controller?.activeCommand !== undefined) return
  try {
    await fetch(`/modules/${encodeURIComponent(moduleId)}/stop`, {method: "POST"})
  } catch (error) {
    if (controller !== undefined) {
      appendModuleTerminal(controller, {
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] module ${moduleId}/stop: ${String(error)}`,
      })
    }
  }
}

type ModuleTerminalEntry = {
  ts: string
  level?: "error" | "warn" | "info"
  text: string
}

function appendModuleTerminal(controller: ModuleDisplayController, entry: ModuleTerminalEntry): void {
  const restorePrompt = controller.terminalInput.promptVisible && canAcceptTerminalInput(controller)
  hideModuleTerminalPrompt(controller)
  controller.terminal.writeln(`${ansiMuted(formatTimestamp(entry.ts))} ${ansiLevel(entry.level)} ${entry.text}`)
  if (restorePrompt) showModuleTerminalPrompt(controller)
}

function appendModuleTargetLine(controller: ModuleDisplayController, line: ModuleLine): void {
  const label = line.stream === "stderr" ? ansiError("err") : ansiCyan("out")
  controller.terminal.writeln(`${ansiMuted(formatTimestamp(line.ts))} ${label} ${line.text}`)
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
    controller.terminalInput.buffer = ""
  }
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
}

function hideModuleTerminalPrompt(controller: ModuleDisplayController): void {
  if (!controller.terminalInput.promptVisible) return
  controller.terminal.write("\r\x1b[K")
  controller.terminalInput.promptVisible = false
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
      continue
    }
    if (ch === "\x7f" || ch === "\b") {
      if (controller.terminalInput.buffer.length === 0) continue
      controller.terminalInput.buffer = controller.terminalInput.buffer.slice(0, -1)
      controller.terminal.write("\b \b")
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
}

function moduleTerminalInputDisplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")
}

function submitModuleTerminalExpression(controller: ModuleDisplayController): void {
  const expr = controller.terminalInput.buffer.trim()
  controller.terminalInput.buffer = ""
  controller.terminal.write("\r\n")
  controller.terminalInput.promptVisible = false
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

async function refreshModuleBreakpoints(controller: ModuleDisplayController): Promise<void> {
  try {
    const res = await fetch(`/modules/${encodeURIComponent(controller.id)}/breakpoints`)
    const data = await res.json() as unknown
    if (!Array.isArray(data)) return
    controller.breakpointRegistrations = data.filter(isBreakpointRegistration)
    mergeStoredBreakpointSpecs(controller.breakpointRegistrations.map((registration) => registration.spec))
    syncModuleBreakpointMarkers(controller)
  } catch (error) {
    appendModuleTerminal(controller, {
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] breakpoints refresh failed: ${String(error)}`,
    })
  }
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
    const res = await fetch(`/modules/${encodeURIComponent(controller.id)}/breakpoint`, {
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

const TOOLBAR_INSET = 4
const TOOLBAR_H = 38
const PAD = 6
const GAP = 8
const BODY_TOP = TOOLBAR_INSET + TOOLBAR_H + PAD

type InterpreterRects = {
  frames: UiSurfaceRect
  scopes: UiSurfaceRect
  source: UiSurfaceRect
  terminal: UiSurfaceRect
  verbose: UiSurfaceRect | null
}

function hiddenRect(): UiSurfaceRect {
  return {x: -10000, y: -10000, w: 1, h: 1, visible: false}
}

function hostTerminalHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (hostTerminalHudDocked) return hiddenRect()
  if (w < HOST_TERMINAL_HUD_MIN_W || h < HOST_TERMINAL_HUD_MIN_H) return hiddenRect()
  const stored = readStoredHostTerminalHudRect()
  if (stored !== null) return clampHostTerminalHudRect(stored, w, h)
  const pad = 16
  const terminalW = Math.min(HOST_TERMINAL_HUD_MAX_W, Math.max(1, w - pad * 2 - VOICE_HUD_W - 20))
  const terminalH = Math.min(HOST_TERMINAL_HUD_MAX_H, Math.max(220, Math.floor(h * 0.31)))
  return clampHostTerminalHudRect({
    x: pad,
    y: Math.max(pad, h - terminalH - pad),
    w: Math.max(1, terminalW),
    h: Math.max(1, terminalH),
  }, w, h)
}

function voiceHudRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  const stored = readStoredVoiceHudRect()
  if (stored !== null) return clampVoiceHudRect(stored, w, h)
  return clampVoiceHudRect({
    x: w - VOICE_HUD_W - 16,
    y: h - VOICE_HUD_H - 16,
    w: VOICE_HUD_W,
    h: VOICE_HUD_H,
  }, w, h)
}

function clampVoiceHudRect(rect: UiSurfaceRect, boundsW: number, boundsH: number): UiSurfaceRect {
  const bw = Math.max(1, Math.round(boundsW))
  const bh = Math.max(1, Math.round(boundsH))
  const margin = bw >= 32 && bh >= 32 ? 8 : 0
  const rectW = Math.min(VOICE_HUD_W, Math.max(1, bw - margin * 2))
  const rectH = Math.min(VOICE_HUD_H, Math.max(1, bh - margin * 2))
  return {
    x: clampNumber(rect.x, margin, Math.max(margin, bw - margin - rectW)),
    y: clampNumber(rect.y, margin, Math.max(margin, bh - margin - rectH)),
    w: rectW,
    h: rectH,
  }
}

function hostTerminalDockRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!hostTerminalHudDocked || w < 80 || h < 80) return hiddenRect()
  return hostTerminalDockRectForPlacement(hostTerminalDockPlacement ?? defaultHostTerminalDockPlacement({w, h}), {w, h})
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

function defaultHostTerminalDockPlacement(bounds: {w: number; h: number}): HostTerminalDockPlacement {
  const dockH = Math.min(HOST_TERMINAL_DOCK_LONG, Math.max(1, bounds.h - HOST_TERMINAL_DOCK_MARGIN * 2))
  const stored = readStoredHostTerminalHudRect()
  const fallbackCenterY = stored === null
    ? bounds.h - dockH / 2 - 16
    : stored.y + Math.min(stored.h, dockH) / 2
  return {
    edge: "left",
    offset: clampNumber(
      fallbackCenterY,
      HOST_TERMINAL_DOCK_MARGIN + dockH / 2,
      Math.max(HOST_TERMINAL_DOCK_MARGIN + dockH / 2, bounds.h - HOST_TERMINAL_DOCK_MARGIN - dockH / 2),
    ),
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
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
  const terminalW = showVerbose ? Math.max(1, bodyW - verboseW - GAP) : bodyW

  if (!showRight) {
    const framesH = Math.min(240, Math.max(142, Math.floor(workspaceH * 0.28)))
    return {
      frames: {x, y, w: leftW, h: framesH},
      scopes: {x, y: y + framesH + GAP, w: leftW, h: Math.max(1, workspaceH - framesH - GAP)},
      source: {x: sourceX, y, w: sourceW, h: workspaceH},
      terminal: {x, y: bottomY, w: bodyW, h: terminalH},
      verbose: null,
    }
  }

  return {
    frames: {x, y, w: leftW, h: workspaceH},
    scopes: {x: w - PAD - rightW, y, w: rightW, h: workspaceH},
    source: {x: sourceX, y, w: sourceW, h: workspaceH},
    terminal: {x, y: bottomY, w: terminalW, h: terminalH},
    verbose: showVerbose
      ? {x: x + terminalW + GAP, y: bottomY, w: verboseW, h: terminalH}
      : null,
  }
}

function sourceLocation(sourceUrl: string, scriptId: string, line: number): string {
  const base = sourceUrl || `scriptId=${scriptId}`
  return line > 0 ? `${base}:${line}` : base
}
