/**
 * Interpreter UI.
 *
 * One WebGPU Space contains one equal UIDisplay per launched module. The host
 * terminal is mounted as a HUD overlay so it stays screen-locked while module
 * displays are framed/orbited. Module runtime actions stay scoped to
 * `/modules/:id/...`.
 */

import {UiRuntime, UiSurface, button, drawIconCentered, palette, uiIcons, type UiSurfaceRect} from "@ui/elements"
import {
  EditorPane,
  TerminalPane,
  sourceDisplayLocation,
  sourcePathFromLocation,
  type EditorBreakpoint,
  type EditorTokens,
  type TerminalInputSource,
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
import {VoiceInputClient, type VoiceInputChunk, type VoiceInputSegment, type VoiceInputStatus} from "./voice-input.ts"

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
  terminal: TerminalPane
  socket: WebSocket | null
  sessionId: string | null
  terminalSize: TerminalSize | null
  connectionState: PtyStatusKind
  terminalState: PtyTerminalState | null
  localEchoId: number
}

type VoiceInputTarget =
  | {kind: "module"; controller: ModuleDisplayController}
  | {kind: "host"; controller: HostTerminalController}

type VoiceServiceState = "unknown" | "ok" | "down"

type VoiceHudSnapshot = {
  status: VoiceInputStatus
  statusLine: string
  targetLine: string
  autoEnterLine: string
  detailLine: string
  serviceLine: string
  serviceState: VoiceServiceState
  level: number
}

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
const VOICE_INPUT_URL_STORAGE_KEY = "metafor.interpreter.voice.url"
const VOICE_WAKE_URL_STORAGE_KEY = "metafor.interpreter.voice.wakeUrl"
const VOICE_INPUT_CONTEXT_STORAGE_KEY = "metafor.interpreter.voice.context"
const DEFAULT_VOICE_INPUT_URL = "ws://127.0.0.1:8877/ws"
const DEFAULT_VOICE_WAKE_URL = "ws://127.0.0.1:4765/ws"
const VOICE_SERVICE_CHECK_INTERVAL_MS = 12_000
const VOICE_SERVICE_CHECK_TIMEOUT_MS = 2_500
const VOICE_AUTO_WAKE_RETRY_MS = 3_000
const VOICE_HUD_W = 246
const VOICE_HUD_H = 174
const HOST_TERMINAL_HUD_MIN_H = 220
const HOST_TERMINAL_HUD_MAX_H = 420
const HOST_TERMINAL_HUD_DESKTOP_W = 780
const HOST_TERMINAL_HUD_MARGIN = 16

let uiCanvas: UiRuntime | null = null
let uiLoading = false
let displayHoverOutlinePane: DisplayHoverOutlinePane | null = null
let hostTerminal: HostTerminalController | null = null
let voiceHudPane: VoiceHudPane | null = null
let voiceInputClient: VoiceInputClient | null = null
let voiceActiveTarget: VoiceInputTarget | null = null
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
let voiceServiceState: VoiceServiceState = "unknown"
let voiceServiceDetail = t("voiceServiceUnknown")
let voiceServiceCheckedAt: Date | null = null
let voiceServiceCheckInFlight = false
let voiceServiceCheckTimer: number | null = null
let hostTerminalHudCreated = false
let hostTerminalUnloadInstalled = false
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
    voiceHudPane = new VoiceHudPane(() => void toggleVoiceInput())
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
  installHostTerminalHud()
  if (voiceHudPane !== null) {
    uiCanvas.addHudSurface(voiceHudPane, ({w, h}) => ({
      x: Math.max(8, w - VOICE_HUD_W - 16),
      y: 64,
      w: Math.min(VOICE_HUD_W, Math.max(1, w - 16)),
      h: VOICE_HUD_H,
    }))
  }
  updateVoiceHud()
  scheduleVoiceAutoWake(500)
}

function installHostTerminalHud(): void {
  if (uiCanvas === null || hostTerminalHudCreated) return
  const controller = ensureHostTerminalController()
  hostTerminalHudCreated = true
  uiCanvas.addHudSurface(controller.terminal, hostTerminalHudRect)
  connectHostTerminal(controller)
}

function toggleLocale(): void {
  toggleUiLocale()
  hostTerminal?.terminal.setTitle(t("hostTerminal"))
  hostTerminal?.terminal.requestRender()
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

class VoiceHudPane extends UiSurface {
  #snapshot: VoiceHudSnapshot = {
    status: "idle",
    statusLine: "",
    targetLine: "",
    autoEnterLine: "",
    detailLine: "",
    serviceLine: "",
    serviceState: "unknown",
    level: 0,
  }

  constructor(private readonly onToggle: () => void) {
    super({bgColor: null, borderColor: null})
  }

  setSnapshot(snapshot: VoiceHudSnapshot): void {
    this.#snapshot = snapshot
    this.requestRender()
  }

  protected render(): void {
    const status = this.#snapshot.status
    const active = status === "waitingWake" || status === "listening" || status === "committing"
    const warn = status === "connecting" || status === "waitingWake" || status === "committing"
    const error = status === "error" || this.#snapshot.serviceState === "down"
    const border = error ? palette.red : warn ? palette.orange : active ? palette.green : palette.borderDim
    const textMaterial = error ? this.materials.red : warn ? this.materials.orange : active ? this.materials.green : this.materials.text
    const buttonSize = 58
    const buttonX = Math.max(0, (this.rectW - buttonSize) / 2)
    const buttonY = 8
    const centerX = buttonX + buttonSize / 2
    const centerY = buttonY + buttonSize / 2

    this.#drawRadialMeter(centerX, centerY, buttonSize / 2 + 7, 18)

    const buttonBorder = error ? "red" : warn ? "orange" : active ? "green" : "border"
    button(this, buttonX, buttonY, buttonSize, buttonSize, {
      key: "engine-voice-hud-toggle",
      tooltip: status === "listening" || status === "committing" || status === "connecting" ? t("voiceStop") : t("voiceStart"),
      onClick: this.onToggle,
      style: (state) => ({
        background: state === "hover" ? "rgba(22, 36, 55, 0.94)" : "rgba(15, 23, 42, 0.9)",
        borderColor: buttonBorder,
        borderRadius: buttonSize / 2,
        zIndex: 0.3,
      }),
      children: () => drawIconCentered(this, uiIcons.mic, centerX, centerY, 22, {z: 0.55}),
    })

    const panelY = buttonY + buttonSize + 22
    const panelW = this.rectW
    const panelH = Math.max(1, this.rectH - panelY)
    this.drawRoundedRect(0, panelY, panelW, panelH, {
      radius: 8,
      fill: palette.bgPanelDim,
      border,
      borderWidth: 1,
      opacity: 0.88,
      z: 0,
    })

    const x = 10
    const textW = panelW - x * 2
    const lines = [
      this.#snapshot.statusLine,
      this.#snapshot.targetLine,
      this.#snapshot.autoEnterLine,
      this.#snapshot.detailLine,
      this.#snapshot.serviceLine,
    ].filter(Boolean)
    for (let index = 0; index < Math.min(4, lines.length); index += 1) {
      this.drawText(lines[index]!, x, panelY + 8 + index * 15, {
        fontPx: index === 0 ? 12 : 11,
        material: index === 0 ? textMaterial : this.materials.muted,
        maxWidthPx: textW,
      })
    }
  }

  #drawRadialMeter(cx: number, cy: number, radius: number, maxBar: number): void {
    const count = 24
    const level = Math.max(0, Math.min(1, this.#snapshot.level))
    for (let index = 0; index < count; index += 1) {
      const threshold = (index + 1) / count
      const phase = (index / count) * Math.PI * 2
      const peak = 0.55 + 0.45 * Math.sin(phase * 3 + level * Math.PI)
      const amount = Math.max(0.16, Math.min(1, level * (0.55 + peak * 0.65)))
      const inner = radius
      const outer = radius + 5 + amount * maxBar
      const x0 = cx + Math.cos(phase) * inner
      const y0 = cy + Math.sin(phase) * inner
      const x1 = cx + Math.cos(phase) * outer
      const y1 = cy + Math.sin(phase) * outer
      const color = level >= threshold * 0.78 ? palette.cyan : palette.borderDim
      this.drawRoundedLine(x0, y0, x1, y1, color, 3, 0.2)
    }
  }
}

function setVoiceActiveTarget(target: VoiceInputTarget): void {
  const changed = voiceActiveTarget?.kind !== target.kind || voiceActiveTarget.controller !== target.controller
  voiceActiveTarget = target
  updateVoiceHud()
  if (changed && !voiceAutoWakeInFlight) scheduleVoiceAutoWake()
}

function ensureVoiceInputClient(): VoiceInputClient {
  if (voiceInputClient !== null) return voiceInputClient
  voiceInputClient = new VoiceInputClient({
    url: readVoiceInputUrl,
    wakeUrl: readVoiceWakeUrl,
    language: "ru",
    context: readVoiceInputContext,
    onStatus: handleVoiceStatus,
    onWake: () => updateVoiceHud("connecting", readVoiceInputUrl()),
    onChunk: handleVoiceInputChunk,
    onLevel: updateVoiceLevel,
  })
  return voiceInputClient
}

function handleVoiceStatus(status: VoiceInputStatus, detail?: string): void {
  updateVoiceHud(status, detail)
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
  uiCanvas?.setFocused(target.controller.terminal)
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
  const messages = voiceMessagesFromChunk(chunk)
  if (messages.length === 0) return
  for (const message of messages) insertVoiceMessage(message)
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
    sendHostTerminalVoiceSubmit(target.controller, text)
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

function sendHostTerminalVoiceSubmit(controller: HostTerminalController, text: string): void {
  sendHostTerminalInput(controller, text, "api")
  sendHostTerminalInput(controller, "\r", "keyboard")
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
    level: voiceHudStatus === "waitingWake" || voiceHudStatus === "listening" || voiceHudStatus === "committing" ? voiceInputLevel : 0,
  })
}

function flashVoiceHudError(detail: string): void {
  if (voiceHudErrorTimer !== null) window.clearTimeout(voiceHudErrorTimer)
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
  const terminal = new TerminalPane({
    title: t("hostTerminal"),
    status: t("terminalConnecting"),
    statusKind: "idle",
    fontPx: 13,
    linePx: 18,
    maxScrollback: 10000,
    cursorLineHighlight: true,
    inputEnabled: false,
    onInput: (data, source) => sendHostTerminalInput(controller, data, source),
    onFocusChange: (focused) => {
      if (focused) setVoiceActiveTarget({kind: "host", controller})
    },
    onResize: (size) => {
      controller.terminalSize = size
      sendHostTerminal(controller, {type: "terminal.resize", size})
    },
  })
  terminal.node.name = "InterpreterHostTerminal"
  Object.assign(controller, {
    terminal,
    socket: null,
    sessionId: readStoredHostTerminalSessionId(),
    terminalSize: null,
    connectionState: "idle" as PtyStatusKind,
    terminalState: null,
    localEchoId: 0,
  } satisfies HostTerminalController)
  hostTerminal = controller
  if (!hostTerminalUnloadInstalled) {
    hostTerminalUnloadInstalled = true
    window.addEventListener("beforeunload", () => hostTerminal?.socket?.close())
  }
  return controller
}

function connectHostTerminal(controller: HostTerminalController): void {
  if (controller.socket !== null) {
    controller.socket.close()
    controller.socket = null
  }

  setHostTerminalStatus(controller, "idle", t("terminalConnecting"))
  controller.terminal.setInputEnabled(false)
  controller.terminal.rejectLocalEcho()
  controller.terminalState = null

  const nextSocket = new WebSocket(hostTerminalWebSocketURL(controller))
  controller.socket = nextSocket

  nextSocket.addEventListener("open", () => {
    if (controller.socket !== nextSocket) return
    setHostTerminalStatus(controller, "connected", t("terminalConnected"))
    controller.terminal.setInputEnabled(true)
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
    controller.terminal.setInputEnabled(false)
    if (controller.connectionState !== "error" && controller.connectionState !== "disconnected") {
      setHostTerminalStatus(controller, "disconnected", t("terminalClosed"))
    }
  })

  nextSocket.addEventListener("error", () => {
    if (controller.socket !== nextSocket) return
    controller.terminal.setInputEnabled(false)
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

function sendHostTerminalInput(controller: HostTerminalController, data: string, source: TerminalInputSource): void {
  const localEchoId = tryHostTerminalLocalEcho(controller, data, source) ? ++controller.localEchoId : undefined
  sendHostTerminal(controller, {
    type: "input.write",
    data,
    source,
    ...(localEchoId === undefined ? {} : {localEchoId}),
  })
}

function tryHostTerminalLocalEcho(controller: HostTerminalController, data: string, source: TerminalInputSource): boolean {
  const serverState = controller.terminalState
  const clientState = controller.terminal.getTerminalState()
  if (
    source !== "keyboard" ||
    controller.socket?.readyState !== WebSocket.OPEN ||
    serverState === null ||
    !serverState.localEcho ||
    !clientState.localEcho
  ) return false
  return controller.terminal.tryLocalEcho(data)
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
    controller.terminal.writeAuthoritative(message.data)
    if (message.state !== undefined) controller.terminalState = message.state
    return
  }

  if (message.type === "terminal.state") {
    controller.terminalState = message.state
    return
  }

  if (message.type === "terminal.local-echo") {
    controller.terminalState = message.state
    if (!message.accepted) controller.terminal.rejectLocalEcho()
    return
  }

  if (message.type === "terminal.ready") {
    controller.sessionId = message.sessionId
    controller.terminalState = message.state
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
    setHostTerminalStatus(controller, "disconnected", t("terminalExited"))
    controller.terminal.setInputEnabled(false)
    controller.terminal.writeln(`${ansiMuted(`process exited: code=${message.code ?? "null"} signal=${message.signal ?? "null"}`)}`)
    return
  }

  setHostTerminalStatus(controller, "error", t("terminalError"))
  controller.terminal.setInputEnabled(false)
  controller.terminal.writeln(`${ansiError(message.message)}`)
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

function setHostTerminalStatus(controller: HostTerminalController, kind: PtyStatusKind, label: string): void {
  controller.connectionState = kind
  controller.terminal.setStatus(statusKindForHostTerminal(kind), label)
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
  controller.terminal.write(`${ansiCyan("> ")}${controller.terminalInput.buffer}`)
  controller.terminalInput.promptVisible = true
}

function hideModuleTerminalPrompt(controller: ModuleDisplayController): void {
  if (!controller.terminalInput.promptVisible) return
  controller.terminal.write("\r\x1b[K")
  controller.terminalInput.promptVisible = false
}

function handleModuleTerminalInput(controller: ModuleDisplayController, data: string): void {
  if (!canAcceptTerminalInput(controller)) return
  showModuleTerminalPrompt(controller)
  for (const ch of data) {
    if (ch === "\r" || ch === "\n") {
      submitModuleTerminalExpression(controller)
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
  controller.terminal.write(text)
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
  const margin = Math.max(8, Math.min(HOST_TERMINAL_HUD_MARGIN, Math.floor(w * 0.04)))
  const maxW = Math.max(1, w - margin * 2)
  const terminalW = w >= 1180 ? Math.min(HOST_TERMINAL_HUD_DESKTOP_W, maxW) : maxW
  const maxH = Math.max(1, h - margin * 2)
  const preferredH = Math.floor(h * (w >= 1180 ? 0.32 : 0.38))
  const terminalH = Math.min(
    maxH,
    Math.min(HOST_TERMINAL_HUD_MAX_H, Math.max(HOST_TERMINAL_HUD_MIN_H, preferredH)),
  )
  return {
    x: margin,
    y: Math.max(margin, h - terminalH - margin),
    w: terminalW,
    h: terminalH,
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
