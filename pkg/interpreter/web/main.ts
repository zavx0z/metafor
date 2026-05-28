/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

import {UiRuntime, type UiSurfaceRect} from "@ui/elements"
import {EditorPane, sourceDisplayLocation, sourcePathFromLocation, type EditorBreakpoint, type EditorTokens} from "@ui/panes"
import {applyInspectMode} from "../src/inspect-mode.ts"
import {ConsolePane, type ConsoleEntry} from "./console-pane.ts"
import {
  DisplayHoverOutlinePane,
  FramesPane,
  ScopesEvalPane,
  ToolbarPane,
  VerbosePane,
  WelcomePane,
  type BadgeKind,
  type WelcomeState,
  type InterpreterModuleSnapshot,
  type FrameSnapshot,
  type ScopeSnapshot,
  type PropertySnapshot,
} from "./interpreter-ui.ts"
import {getUiLocale, t, toggleUiLocale} from "./i18n.ts"
import {canonicalModulePath, localImportsForSource} from "./module-graph.ts"
import {
  breakpointRegistrationMatchesSource,
  breakpointSpecMatchesModule,
  breakpointSpecMatchesSource,
  sameSourceUrl,
} from "./breakpoint-matching.ts"

type ConnectionInfo = {state: ConnectionState; error: string | null}
type ConnectionState = "connecting" | "connected" | "disconnected"
type ScriptSnapshot = {scriptId: string; url: string; hasSourceMap?: boolean; sources?: string[]}

type ServerMessage =
  | {type: "hello"; inspectorUrl: string; paused: boolean; dump: InterpreterDump | null; scripts: ScriptSnapshot[]; target: TargetSnapshot; sessions?: SessionPaneSnapshot[]; connection: ConnectionInfo}
  | {type: "state"; dump: InterpreterDump}
  | {type: "resumed"}
  | {type: "console"; entries: ConsoleEntry[]}
  | {type: "connection"; state: ConnectionState; error: string | null; inspectorUrl: string}
  | {type: "sessions"; sessions: SessionPaneSnapshot[]}
  | {type: "session"; session: SessionPaneSnapshot}
  | {type: "session-state"; sessionId: string; dump: InterpreterDump; session: SessionPaneSnapshot}
  | {type: "session-resumed"; sessionId: string; session: SessionPaneSnapshot}
  | {type: "session-connection"; sessionId: string; state: ConnectionState; error: string | null; inspectorUrl: string; session: SessionPaneSnapshot}
  | {type: "session-target"; sessionId: string; event: TargetEvent; session: SessionPaneSnapshot}
  | {type: "session-inspector-event"; sessionId: string; ts: string; method: string; params: unknown}
  | ({type: "script"} & ScriptSnapshot)
  | {type: "target"; event: TargetEvent}
  | {type: "inspector-event"; ts: string; method: string; params: unknown}
  | {type: "interpreter-event"; ts: string; event: string; detail: unknown}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}

type TargetEvent =
  | {type: "started"; pid: number; command: string[]; cwd: string | null; startedAt: string}
  | {type: "line"; line: {ts: string; stream: "stdout" | "stderr"; text: string}}
  | {type: "exited"; exitCode: number | null; signalCode: string | null; exitedAt: string}

type TargetSnapshot = {
  state: "idle" | "starting" | "running" | "exited" | "failed"
  pid: number | null
  command: string[]
  cwd: string | null
  startedAt: string | null
  exitedAt: string | null
  exitCode: number | null
}

type SessionLine = {
  ts: string
  stream: "stdout" | "stderr"
  text: string
}

type SessionPaneSnapshot = {
  id: string
  label: string
  inspectorUrl: string
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
    output: SessionLine[]
    pauseOnStart: boolean
  }
}

type InterpreterDump = {
  timestamp: string
  reason: string
  hitBreakpoints: string[]
  frames: FrameSnapshot[]
}

type SourceRuntimeState = "idle" | "loading" | "paused" | "running" | "disconnected"

type Source = {
  lines: string[]
  currentLine: number
  location: string
  tokens?: EditorTokens
}

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

type InterpreterModuleCandidate = {
  scriptId: string
  url: string
  scriptUrl: string
  status: InterpreterModuleSnapshot["status"]
}

type PendingInterpreterModule = {
  url: string
  importerUrl?: string
}

type ActiveSource = {
  scriptId: string
  scriptUrl: string
  sourceUrl: string
  key: string
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`#${id} not in DOM`)
  return element as T
}

const engineCanvas = $<HTMLCanvasElement>("engine-canvas")
const interpreterDebugState = window as unknown as {
  __metaforInterpreter?: unknown
  __metaforInterpreterInit?: {stage: string; error?: string; stack?: string}
}
function setInterpreterDebugInit(state: {stage: string; error?: string; stack?: string}): void {
  interpreterDebugState.__metaforInterpreterInit = state
  document.documentElement.dataset.metaforInterpreterInit = state.stage
  if (state.error === undefined) {
    delete document.documentElement.dataset.metaforInterpreterError
  } else {
    document.documentElement.dataset.metaforInterpreterError = state.error
  }
}
setInterpreterDebugInit({stage: "bootstrap"})
const consolePending: ConsoleEntry[] = []
type CachedSource = {text: string; sourceUrl?: string; tokens?: EditorTokens}
type DraftState = {baseText: string; text: string; savedText: string; status: "clean" | "dirty" | "saved"}
const BREAKPOINTS_STORAGE_KEY = "bd:breakpoints:v1"
const MODULE_GRAPH_LIMIT = 400
const sourceCache = new Map<string, CachedSource>()
const sourceDrafts = new Map<string, DraftState>()
const scriptUrls = new Map<string, string>()
const scriptSources = new Map<string, string[]>()
const pendingInterpreterModules = new Map<string, PendingInterpreterModule>()
const moduleGraphSources = new Map<string, string>()
const moduleGraphFetches = new Set<string>()
let moduleGraphGeneration = 0
let uiCanvas: UiRuntime | null = null
let sourcePane: EditorPane | null = null
let draftEditorPane: EditorPane | null = null
let consolePane: ConsolePane | null = null
let toolbarPane: ToolbarPane | null = null
let displayHoverOutlinePane: DisplayHoverOutlinePane | null = null
let framesPane: FramesPane | null = null
let scopesEvalPane: ScopesEvalPane | null = null
let verbosePane: VerbosePane | null = null
let welcomePane: WelcomePane | null = null
const sessionSnapshots = new Map<string, SessionPaneSnapshot>()
const sessionDisplays = new Map<string, SessionDisplayController>()
const sessionDisplayIds = new Set<string>()
let sessionOrder: string[] = []
let framedSessionKey = ""
let uiLoading = false
let engineLastSource: Source | null = null
let sourceRuntimeState: SourceRuntimeState = "idle"
let resizeObserver: ResizeObserver | null = null
let inspectorUrl = ""
let connectionState: ConnectionState = "connecting"
let connectionError: string | null = null
let welcomeVisible = false
let verboseVisible = localStorage.getItem("bd:verbose") === "1"
let draftVisible = false
let activeSourceKey = ""
let activeSource: ActiveSource | null = null
let engineStatus = "engine: init"
let wsStatusText = "connecting..."
let wsStatusKind: BadgeKind = "neutral"
let runStatusText = "?"
let runStatusKind: BadgeKind = "neutral"
let pendingPauseTimer: number | null = null
let pendingPauseStartedAt = 0
type ActiveInterpreterCommand = {cmd: string; label: string; startedAt: number; timer: number}
let activeInterpreterCommand: ActiveInterpreterCommand | null = null
let breakpointRegistrations: BreakpointRegistration[] = []
const pendingBreakpointLines = new Set<number>()

const targetState = {
  state: "idle" as "idle" | "starting" | "running" | "exited" | "failed",
  pid: null as number | null,
  exitCode: null as number | null,
  startedAt: null as string | null,
  exitedAt: null as string | null,
}

let workspaceFiles: string[] = []
let selectedTargetFile = localStorage.getItem("bd:target:file") ?? ""

let socket: WebSocket | undefined
let currentDump: InterpreterDump | undefined
let activeFrameIndex = 0
let nextRequestId = 1
const COMMAND_TIMEOUT_MS = 10_000
const SESSION_DISPLAY_GAP_MM = 52
const SESSION_DISPLAY_CENTER_Y_MM = 0
const SESSION_DISPLAY_CENTER_Z_MM = 900
type DisplayLayoutMetrics = {widthMm: number; heightMm: number; pixelWidth: number; pixelHeight: number}
const pendingRequests = new Map<number, {
  timer: number
  resolve: (reply: CommandReply) => void
}>()

function connect(): void {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`
  setWsStatus("connecting…")
  socket = new WebSocket(url)

  socket.addEventListener("open", () => {
    setWsStatus("connected", "live")
  })

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
    setWsStatus("disconnected")
    setRunStatus("?")
    setTimeout(connect, 1500)
  })
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "hello":
      inspectorUrl = msg.inspectorUrl
      applySessionSnapshots(msg.sessions ?? [])
      rememberScripts(msg.scripts)
      applyTargetSnapshot(msg.target)
      applyConnection(msg.connection)
      if (msg.paused && msg.dump !== null) {
        currentDump = msg.dump
        renderDump(msg.dump)
        setRunStatus("paused", "paused")
      } else if (connectionState === "connected") {
        setRunStatus("running", "live")
        setSourceRuntimeState("running")
      } else {
        setRunStatus("waiting")
        setSourceRuntimeState("disconnected")
      }
      void refreshBreakpoints()
      refreshWelcome()
      return
    case "state":
      finishInterpreterCommandForEvent("paused")
      clearPendingPause()
      currentDump = msg.dump
      renderDump(msg.dump)
      syncSourceBreakpointMarkers()
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      setSourceRuntimeState("paused")
      hideWelcome()
      void refreshBreakpoints()
      return
    case "resumed":
      finishInterpreterCommandForEvent("resumed")
      clearPendingPause()
      currentDump = undefined
      framesPane?.setFrames([], activeFrameIndex)
      scopesEvalPane?.setFrame(null)
      syncSourceBreakpointMarkers()
      // Держим последнюю source-pane, но явно маркируем running,
      // чтобы это не выглядело как не обновляющийся paused editor.
      setRunStatus("running", "live")
      setSourceRuntimeState("running")
      return
    case "connection":
      applyConnection({state: msg.state, error: msg.error})
      refreshWelcome()
      return
    case "sessions":
      applySessionSnapshots(msg.sessions)
      return
    case "session":
      applySessionSnapshot(msg.session)
      return
    case "session-state":
      applySessionSnapshot(msg.session)
      applySessionDump(msg.sessionId, msg.dump)
      return
    case "session-resumed":
      applySessionSnapshot(msg.session)
      markSessionResumed(msg.sessionId)
      return
    case "session-connection":
    case "session-target":
      applySessionSnapshot(msg.session)
      return
    case "script":
      rememberScript(msg)
      return
    case "console":
      for (const entry of msg.entries) appendConsole(entry)
      return
    case "target":
      handleTargetEvent(msg.event)
      return
    case "inspector-event":
      appendVerbose("inspector", msg.ts, msg.method, msg.params)
      return
    case "session-inspector-event":
      appendVerbose("inspector", msg.ts, msg.method, msg.params, msg.sessionId)
      return
    case "interpreter-event":
      appendVerbose("interpreter", msg.ts, msg.event, msg.detail, sessionIdFromEventDetail(msg.detail))
      return
    case "result":
      resolvePendingRequest(msg)
      pendingRequests.delete(msg.requestId)
      return
  }
  // Triggered by sidecar `POST /reload` — реложим вкладку программно.
  // location.reload() оставляет JS-bundle в HTTP-кэше браузера если
  // chunk-hash не изменился; форсируем обход кэша через query-bump.
  if ((msg as {type: string}).type === "reload") {
    const url = new URL(window.location.href)
    url.searchParams.set("_r", String(Date.now()))
    window.location.replace(url.toString())
  }
}

function applySessionSnapshots(sessions: SessionPaneSnapshot[]): void {
  if (sessions.length === 0) return
  sessionOrder = sessions.map((session) => session.id)
  for (const session of sessions) {
    sessionSnapshots.set(session.id, session)
  }
  syncSessionDisplays()
  for (const session of sessions) {
    if (session.dump !== null) applySessionDump(session.id, session.dump)
  }
}

function applySessionSnapshot(session: SessionPaneSnapshot): void {
  sessionSnapshots.set(session.id, session)
  if (!sessionOrder.includes(session.id)) sessionOrder.push(session.id)
  syncSessionDisplays()
  if (session.dump !== null) applySessionDump(session.id, session.dump)
}

// Пробиваем CSS-кеш на старте: добавляем ?t=<timestamp> к href стилей,
// чтобы Chrome подтянул свежий style.css при каждой загрузке страницы.
for (const link of Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))) {
  const url = new URL(link.href, location.origin)
  url.searchParams.set("t", String(Date.now()))
  link.href = url.toString()
}

function applyConnection(info: ConnectionInfo): void {
  const previous = connectionState
  connectionState = info.state
  connectionError = info.error
  if (info.state !== "connected") {
    clearInterpreterCommand("connection changed")
    clearPendingPause()
    setRunStatus(targetState.state === "running" || targetState.state === "starting" ? "reconnecting" : "waiting", "warn")
    setSourceRuntimeState("disconnected")
    // Любая информация в UI устарела как только инспектор отвалился: очищаем
    // frames/scopes/source/dump и сбрасываем кэш скриптов. Console и verbose
    // оставляем — они логи, не state.
    if (previous === "connected" || currentDump !== undefined) {
      clearLiveState()
    }
  }
  updateToolbar()
  updateWelcomePane()
}

function clearLiveState(runtimeState: SourceRuntimeState = "disconnected"): void {
  currentDump = undefined
  activeFrameIndex = 0
  framesPane?.setFrames([], activeFrameIndex)
  scopesEvalPane?.setFrame(null)
  pushSourceToEngine({lines: [], currentLine: 0, location: ""})
  activeSourceKey = ""
  activeSource = null
  sourcePane?.setBreakpoints([])
  scriptUrls.clear()
  scriptSources.clear()
  pendingInterpreterModules.clear()
  moduleGraphSources.clear()
  moduleGraphFetches.clear()
  moduleGraphGeneration += 1
  breakpointRegistrations = []
  pendingBreakpointLines.clear()
  sourceCache.clear()
  syncInterpreterModules()
  syncDraftEditor()
  setSourceRuntimeState(runtimeState)
}

function hideWelcome(): void {
  if (!welcomeVisible) return
  welcomeVisible = false
  applyEngineLayout()
}

function refreshWelcome(): void {
  if (
    connectionState === "connected"
    || currentDump !== undefined
    || targetState.state === "running"
    || targetState.state === "starting"
  ) {
    hideWelcome()
    return
  }
  welcomeVisible = true
  updateWelcomePane()
  applyEngineLayout()
}

function describeTargetStatus(): string {
  switch (targetState.state) {
    case "idle":     return t("targetIdle")
    case "starting": return t("targetStarting")
    case "running":  return `${t("targetRunning")} (pid=${targetState.pid})`
    case "exited": {
      const code = targetState.exitCode === null ? (getUiLocale() === "ru" ? "неизвестно" : "unknown") : String(targetState.exitCode)
      return targetState.pid === null ? `${t("targetExited")} code=${code}` : `${t("targetExited")} code=${code} (pid=${targetState.pid})`
    }
    case "failed":   return t("targetFailed")
  }
}

function applyTargetSnapshot(snapshot: TargetSnapshot | undefined): void {
  if (snapshot === undefined) return
  targetState.state = snapshot.state
  targetState.pid = snapshot.pid
  targetState.startedAt = snapshot.startedAt
  targetState.exitedAt = snapshot.exitedAt
  targetState.exitCode = snapshot.exitCode
  if (snapshot.command.length > 0) {
    seedModuleGraphFromCommand(snapshot.command)
    const command = shellJoin(snapshot.command)
    localStorage.setItem("bd:target:cmd", command)
  }
  updateToolbar()
  updateWelcomePane()
}

function defaultTargetCommand(): string {
  const url = inspectorUrl || "ws://127.0.0.1:6499/"
  const stored = localStorage.getItem("bd:target:cmd")
  const raw = stored !== null && !isLegacyDefaultTargetCommand(stored)
    ? stored
    : defaultTargetCommandBase()
  return commandTextWithInspectMode(raw, defaultPauseOnStart(), url)
}

function defaultTargetCommandBase(): string {
  const selected = selectedTargetFile.trim()
  if (selected.length > 0) return targetCommandForFile(selected)
  const first = workspaceFiles[0]
  if (first !== undefined) return targetCommandForFile(first)
  return "bun"
}

function isLegacyDefaultTargetCommand(command: string): boolean {
  return command.includes("dark/server.spec.ts") && command.includes("--timeout=2147483647")
}

function defaultPauseOnStart(): boolean {
  return localStorage.getItem("bd:target:brk") !== "0"
}

function handleTargetEvent(event: TargetEvent): void {
  switch (event.type) {
    case "started":
      clearInterpreterCommand("target started")
      clearPendingPause()
      clearLiveState("loading")
      seedModuleGraphFromCommand(event.command)
      targetState.state = "running"
      targetState.pid = event.pid
      targetState.startedAt = event.startedAt
      targetState.exitedAt = null
      targetState.exitCode = null
      setRunStatus("target starting")
      break
    case "exited":
      clearInterpreterCommand("target exited")
      clearPendingPause()
      clearLiveState("disconnected")
      targetState.state = "exited"
      targetState.exitedAt = event.exitedAt
      targetState.exitCode = event.exitCode
      setRunStatus(`exited code=${event.exitCode}`, "warn")
      break
    case "line": {
      // target stdout/stderr попадает в console-tail для удобства
      const entry: ConsoleEntry = {
        ts: event.line.ts,
        text: `[target/${event.line.stream}] ${event.line.text}`,
      }
      if (event.line.stream === "stderr") entry.level = "error"
      appendConsole(entry)
      return
    }
  }
  updateWelcomePane()
}

async function startTargetFromCmd(rawCmd: string, pauseOnStart: boolean): Promise<void> {
  const cmd = commandTextWithInspectMode(rawCmd.trim(), pauseOnStart, inspectorUrl || "ws://127.0.0.1:6499/")
  if (cmd.length === 0) return
  localStorage.setItem("bd:target:cmd", cmd)
  const command = parseShellArgs(cmd)
  if (command.length === 0) return

  localStorage.setItem("bd:target:brk", pauseOnStart ? "1" : "0")

  targetState.state = "starting"
  updateWelcomePane()
  try {
    const breakpoints = readStoredBreakpointSpecs()
    const body: {
      command: string[]
      pauseOnStart: boolean
      breakpoints?: BreakpointSpec[]
    } = {command, pauseOnStart}
    if (breakpoints.length > 0) body.breakpoints = breakpoints
    const res = await fetch("/target/run", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    })
    const data = await res.json() as {ok: boolean; error?: string; snapshot?: {pid: number; state: string}}
    if (!data.ok) {
      targetState.state = "failed"
      connectionError = `spawn failed: ${data.error ?? "unknown"}`
      updateWelcomePane()
      return
    }
    if (data.snapshot !== undefined) {
      targetState.pid = data.snapshot.pid
    }
  } catch (error) {
    targetState.state = "failed"
    connectionError = `fetch failed: ${String(error)}`
  } finally {
    updateWelcomePane()
  }
}

async function stopTarget(): Promise<void> {
  try {
    await fetch("/target/stop", {method: "POST"})
  } catch {}
  updateWelcomePane()
}

type TargetSnapshotView = {state?: string}

async function restartTarget(): Promise<void> {
  clearInterpreterCommand("restart target")
  clearPendingPause()
  appendConsole({ts: new Date().toISOString(), level: "debug", text: `[ui] ${t("restartTarget")}`})
  setRunStatus(t("restartTarget"), "warn")
  setSourceRuntimeState("loading")

  const command = defaultTargetCommand()
  const pauseOnStart = defaultPauseOnStart()

  try {
    await fetch("/target/stop", {method: "POST"})
    let stopped = await waitForTargetStopped(3500)
    if (!stopped) {
      await fetch("/target/stop", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({signal: "SIGKILL"}),
      })
      stopped = await waitForTargetStopped(2000)
    }
    if (!stopped) {
      appendConsole({
        ts: new Date().toISOString(),
        level: "warn",
        text: getUiLocale() === "ru" ? "[ui] target ещё завершается; перезапуск отложен" : "[ui] target is still stopping; restart postponed",
      })
      restoreRunStatus()
      return
    }
    await startTargetFromCmd(command, pauseOnStart)
  } catch (error) {
    appendConsole({ts: new Date().toISOString(), level: "error", text: `[ui] ${t("restartTarget")}: ${String(error)}`})
    restoreRunStatus()
  }
}

function showExecutionPoint(): void {
  if (currentDump === undefined || currentDump.frames.length === 0) return
  activeFrameIndex = 0
  renderDump(currentDump)
  setSourceRuntimeState("paused")
}

async function waitForTargetStopped(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snapshot = await fetch("/target")
      .then((res) => res.json() as Promise<TargetSnapshotView>)
      .catch(() => null)
    const state = snapshot?.state
    if (state !== "running" && state !== "starting") return true
    await delay(120)
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseShellArgs(input: string): string[] {
  const out: string[] = []
  let buf = ""
  let quote: '"' | "'" | null = null
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!
    if (quote !== null) {
      if (c === quote) quote = null
      else buf += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === " " || c === "\t" || c === "\n") {
      if (buf.length > 0) { out.push(buf); buf = "" }
      continue
    }
    buf += c
  }
  if (buf.length > 0) out.push(buf)
  return out
}

function commandTextWithInspectMode(raw: string, pauseOnStart: boolean, url: string): string {
  const parts = parseShellArgs(raw)
  if (parts.length === 0) return raw
  const mode = pauseOnStart ? "brk" : "wait"
  return shellJoin(applyInspectMode(parts, mode, url))
}

function targetCommandForFile(path: string): string {
  const command = path.endsWith(".spec.ts") || path.endsWith(".test.ts")
    ? ["bun", "test", "--timeout=2147483647", path]
    : ["bun", path]
  return shellJoin(command)
}

function shellJoin(parts: string[]): string {
  return parts.map(shellQuote).join(" ")
}

function shellQuote(part: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(part)) return part
  return `'${part.replaceAll("'", "'\\''")}'`
}

function selectTargetFile(path: string): void {
  selectedTargetFile = path
  localStorage.setItem("bd:target:file", path)
  localStorage.setItem("bd:target:cmd", targetCommandForFile(path))
  updateWelcomePane()
}

async function refreshWorkspaceFiles(): Promise<void> {
  try {
    const res = await fetch("/workspace/files?limit=80")
    const data = await res.json() as {files?: Array<{path?: unknown}>}
    workspaceFiles = (data.files ?? [])
      .map((file) => typeof file.path === "string" ? file.path : "")
      .filter((path) => path.length > 0)
    if (selectedTargetFile.length === 0) {
      const preferred = preferredWorkspaceFile(workspaceFiles)
      if (preferred !== undefined) {
        selectedTargetFile = preferred
        localStorage.setItem("bd:target:file", preferred)
      }
    }
  } catch (error) {
    appendConsole({ts: new Date().toISOString(), level: "warn", text: `[ui] workspace files: ${String(error)}`})
  } finally {
    updateWelcomePane()
  }
}

function preferredWorkspaceFile(files: readonly string[]): string | undefined {
  return files.find((file) => file.endsWith(".spec.ts") || file.endsWith(".test.ts")) ?? files[0]
}

function appendVerbose(kind: "inspector" | "interpreter", ts: string, name: string, payload: unknown, sessionId?: string): void {
  if (sessionId === undefined) verbosePane?.append(kind, ts, name, payload)
  if (sessionId !== undefined) sessionDisplays.get(sessionId)?.verbose.append(kind, ts, name, payload)
}

function sessionIdFromEventDetail(detail: unknown): string | undefined {
  if (typeof detail !== "object" || detail === null) return undefined
  const sessionId = (detail as Record<string, unknown>)["sessionId"]
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined
}

function rememberScripts(scripts: ScriptSnapshot[]): void {
  let changed = false
  for (const script of scripts) {
    changed = rememberScriptOnly(script) || changed
  }
  if (changed) syncInterpreterModules()
}

function rememberScript(script: ScriptSnapshot): void {
  if (rememberScriptOnly(script)) syncInterpreterModules()
}

function rememberScriptOnly({scriptId, url, sources}: ScriptSnapshot): boolean {
  if (scriptId.length === 0) return false
  const nextSources = normalizeScriptSources(sources)
  const prevSources = scriptSources.get(scriptId) ?? []
  if (scriptUrls.get(scriptId) === url && stringArraysEqual(prevSources, nextSources)) return false
  scriptUrls.set(scriptId, url)
  if (nextSources.length > 0) scriptSources.set(scriptId, nextSources)
  else scriptSources.delete(scriptId)
  return true
}

function normalizeScriptSources(sources: string[] | undefined): string[] {
  if (sources === undefined) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const source of sources) {
    const clean = source.trim()
    if (clean.length === 0 || seen.has(clean)) continue
    seen.add(clean)
    out.push(clean)
  }
  return out
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function seedModuleGraphFromCommand(command: string[]): void {
  for (const part of command) {
    if (part.startsWith("-") || !isProjectInterpreterModule(part)) continue
    if (selectedTargetFile.length === 0) {
      selectedTargetFile = part
      localStorage.setItem("bd:target:file", part)
    }
    queuePendingModule([part])
  }
}

function rememberModuleGraphSource(sourceUrl: string, source: string): void {
  const key = moduleGraphKey(sourceUrl)
  if (key.length === 0 || !isProjectInterpreterModule(sourceUrl)) return
  if (moduleGraphSources.get(key) === source) return

  moduleGraphSources.set(key, source)
  addPendingModule(sourceUrl)

  if (pendingInterpreterModules.size + moduleGraphSources.size > MODULE_GRAPH_LIMIT) {
    syncInterpreterModules()
    return
  }

  for (const imported of localImportsForSource(sourceUrl, source)) {
    queuePendingModule(imported.candidates, sourceUrl)
  }
  syncInterpreterModules()
}

function queuePendingModule(candidates: string[], importerUrl?: string): void {
  const projectCandidates = candidates.filter(isProjectInterpreterModule)
  if (projectCandidates.length === 0) return

  const visible = projectCandidates[0]
  if (visible !== undefined) addPendingModule(visible, importerUrl)
  syncInterpreterModules()
  void fetchPendingModuleSource(projectCandidates)
}

function addPendingModule(url: string, importerUrl?: string): void {
  const key = moduleGraphKey(url)
  if (key.length === 0 || pendingInterpreterModules.has(key)) return
  const module: PendingInterpreterModule = {url}
  if (importerUrl !== undefined) module.importerUrl = importerUrl
  pendingInterpreterModules.set(key, module)
}

async function fetchPendingModuleSource(candidates: string[]): Promise<void> {
  const fetchKey = candidates.map(moduleGraphKey).filter((key) => key.length > 0).join("\0")
  if (fetchKey.length === 0 || moduleGraphFetches.has(fetchKey)) return
  if (pendingInterpreterModules.size + moduleGraphSources.size > MODULE_GRAPH_LIMIT) return
  const generation = moduleGraphGeneration
  moduleGraphFetches.add(fetchKey)

  for (const candidate of candidates) {
    if (generation !== moduleGraphGeneration) return
    const key = moduleGraphKey(candidate)
    if (key.length === 0 || moduleGraphSources.has(key)) return
    try {
      const res = await fetch(`/source?sourceUrl=${encodeURIComponent(candidate)}&tokens=0&optional=1`)
      if (generation !== moduleGraphGeneration) return
      if (!res.ok) continue
      const data = await res.json() as {url?: string; scriptSource?: string}
      if (generation !== moduleGraphGeneration) return
      if (typeof data.scriptSource !== "string") continue
      rememberModuleGraphSource(data.url ?? candidate, data.scriptSource)
      return
    } catch {}
  }
}

function moduleGraphKey(url: string): string {
  return canonicalModulePath(url)
}

async function refreshBreakpoints(): Promise<void> {
  try {
    const res = await fetch("/breakpoints")
    const data = await res.json() as unknown
    if (!Array.isArray(data)) return
    breakpointRegistrations = data.filter(isBreakpointRegistration)
    mergeStoredBreakpointSpecs(breakpointRegistrations.map((registration) => registration.spec))
    syncSourceBreakpointMarkers()
    syncInterpreterModules()
  } catch (error) {
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] breakpoints refresh failed: ${String(error)}`,
    })
  }
}

async function toggleActiveSourceBreakpoint(line: number): Promise<void> {
  const source = activeSource
  if (source === null) {
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: getUiLocale() === "ru" ? "[ui] breakpoint не поставлен: source не загружен" : "[ui] breakpoint skipped: no source loaded",
    })
    return
  }

  const sourceLine = Math.max(1, Math.floor(line))
  const existing = breakpointRegistrationForActiveLine(sourceLine)
  const stored = existing === undefined ? storedBreakpointSpecForActiveLine(sourceLine) : undefined
  pendingBreakpointLines.add(sourceLine)
  syncSourceBreakpointMarkers()

  if (stored !== undefined) {
    removeStoredBreakpointSpec(stored)
    pendingBreakpointLines.delete(sourceLine)
    syncSourceBreakpointMarkers()
    syncInterpreterModules()
    return
  }

  const nextSpec = existing === undefined ? breakpointSpecForSource(source, sourceLine) : null
  if (existing === undefined && nextSpec === null) {
    pendingBreakpointLines.delete(sourceLine)
    syncSourceBreakpointMarkers()
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: getUiLocale() === "ru" ? "[ui] breakpoint не поставлен: у source нет URL" : "[ui] breakpoint skipped: source has no URL",
    })
    return
  }

  try {
    const body = existing === undefined
      ? nextSpec
      : {id: existing.id}
    const res = await fetch("/breakpoint", {
      method: existing === undefined ? "POST" : "DELETE",
      headers: {"content-type": "application/json"},
      body: JSON.stringify(body),
    })
    const data = await res.json() as {ok?: boolean; error?: string; breakpoints?: unknown}
    if (data.ok !== true) {
      appendConsole({
        ts: new Date().toISOString(),
        level: "error",
        text: `[ui] breakpoint: ${data.error ?? "unknown error"}`,
      })
      return
    }
    if (Array.isArray(data.breakpoints)) {
      breakpointRegistrations = data.breakpoints.filter(isBreakpointRegistration)
    } else {
      await refreshBreakpoints()
    }
    if (nextSpec !== null) mergeStoredBreakpointSpecs([nextSpec])
    if (existing !== undefined) removeStoredBreakpointSpec(existing.spec)
    syncInterpreterModules()
  } catch (error) {
    appendConsole({
      ts: new Date().toISOString(),
      level: "error",
      text: `[ui] breakpoint: ${String(error)}`,
    })
  } finally {
    pendingBreakpointLines.delete(sourceLine)
    syncSourceBreakpointMarkers()
  }
}

function breakpointSpecForSource(source: ActiveSource, line: number): BreakpointSpec | null {
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

function breakpointRegistrationForActiveLine(line: number): BreakpointRegistration | undefined {
  const source = activeSource
  if (source === null) return undefined
  return breakpointRegistrations.find((registration) => (
    registration.spec.line === line && breakpointRegistrationMatchesSource(registration, source)
  ))
}

function storedBreakpointSpecForActiveLine(line: number): BreakpointSpec | undefined {
  const source = activeSource
  if (source === null) return undefined
  return readStoredBreakpointSpecs().find((spec) => (
    spec.line === line && breakpointSpecMatchesSource(spec, source)
  ))
}

function syncSourceBreakpointMarkers(): void {
  if (sourcePane === null) return
  const source = activeSource
  if (source === null) {
    sourcePane.setBreakpoints([])
    return
  }

  const hitBreakpointIds = new Set(currentDump?.hitBreakpoints ?? [])
  const byLine = new Map<number, EditorBreakpoint>()
  for (const registration of breakpointRegistrations) {
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
    byLine.set(spec.line, {
      line: spec.line,
      verified: false,
      pending: true,
      hit: false,
    })
  }

  for (const line of pendingBreakpointLines) {
    const current = byLine.get(line)
    byLine.set(line, {
      line,
      verified: current?.verified ?? false,
      pending: true,
      hit: current?.hit ?? false,
    })
  }

  sourcePane.setBreakpoints([...byLine.values()].sort((a, b) => a.line - b.line))
}

function syncInterpreterModules(): void {
  framesPane?.setModules(collectInterpreterModules())
}

function collectInterpreterModules(): InterpreterModuleSnapshot[] {
  const byModule = new Map<string, InterpreterModuleCandidate>()

  for (const [scriptId, scriptUrl] of scriptUrls) {
    const sources = scriptSources.get(scriptId) ?? []
    if (sources.length === 0) {
      addInterpreterModule(byModule, scriptId, scriptUrl, scriptUrl, false, "parsed")
    } else {
      for (const source of sources) addInterpreterModule(byModule, scriptId, source, scriptUrl, false, "parsed")
    }
  }

  for (const frame of currentDump?.frames ?? []) {
    if (frame.scriptId === undefined || frame.scriptId.length === 0) continue
    const scriptUrl = scriptUrls.get(frame.scriptId) ?? frame.url
    addInterpreterModule(byModule, frame.scriptId, frame.url || scriptUrl, scriptUrl, true, "active")
  }

  for (const pending of pendingInterpreterModules.values()) {
    addInterpreterModule(byModule, "", pending.url, "", false, "pending")
  }

  const candidates = mergeInterpreterModuleCandidates([...byModule.values()])
  const unique = new Map<string, InterpreterModuleSnapshot>()
  for (const candidate of candidates) {
    if (!isProjectInterpreterModule(candidate.url) && !isProjectInterpreterModule(candidate.scriptUrl)) continue
    const module: InterpreterModuleSnapshot = {
      ...candidate,
      breakpointCount: breakpointCountForModule(candidate.url, candidate.scriptUrl),
    }
    const key = moduleIdentity(candidate.url, candidate.scriptUrl)
    if (!unique.has(key)) unique.set(key, module)
  }

  return [...unique.values()].sort((a, b) => moduleSortName(a.url).localeCompare(moduleSortName(b.url)))
}

function mergeInterpreterModuleCandidates(candidates: InterpreterModuleCandidate[]): InterpreterModuleCandidate[] {
  const merged: InterpreterModuleCandidate[] = []
  for (const candidate of candidates) {
    const existingIndex = merged.findIndex((current) => sameInterpreterModule(current, candidate))
    if (existingIndex < 0) {
      merged.push(candidate)
      continue
    }
    merged[existingIndex] = preferredInterpreterModule(merged[existingIndex]!, candidate)
  }
  return merged
}

function sameInterpreterModule(a: {url: string; scriptUrl: string}, b: {url: string; scriptUrl: string}): boolean {
  return sameModulePath(a.url, b.url)
    || sameModulePath(a.url, b.scriptUrl)
    || sameModulePath(a.scriptUrl, b.url)
    || sameModulePath(a.scriptUrl, b.scriptUrl)
}

function preferredInterpreterModule<T extends {url: string; scriptUrl: string}>(a: T, b: T): T {
  if (interpreterModuleScore(b) > interpreterModuleScore(a)) return b
  return a
}

function interpreterModuleScore(candidate: {url: string; scriptUrl: string; status?: InterpreterModuleSnapshot["status"]}): number {
  let score = 0
  if (candidate.status === "active") score += 100
  else if (candidate.status === "parsed") score += 60
  if (!sameModulePath(candidate.url, candidate.scriptUrl)) score += 20
  if (!isAbsoluteModulePath(candidate.url)) score += 8
  score -= Math.max(0, modulePathParts(candidate.url).length - 2)
  return score
}

function addInterpreterModule(
  modules: Map<string, InterpreterModuleCandidate>,
  scriptId: string,
  url: string,
  scriptUrl: string,
  preferDisplayUrl: boolean,
  status: InterpreterModuleSnapshot["status"],
): void {
  const key = `${scriptId}\0${moduleIdentity(url, scriptUrl)}`
  const existing = modules.get(key)
  if (existing === undefined) {
    modules.set(key, {scriptId, url, scriptUrl, status})
    return
  }
  if (preferDisplayUrl && url.length > 0) existing.url = url
  if (existing.scriptUrl.length === 0 && scriptUrl.length > 0) existing.scriptUrl = scriptUrl
  if (interpreterModuleScore({...existing, status}) > interpreterModuleScore(existing)) existing.status = status
}

function breakpointCountForModule(url: string, scriptUrl: string): number {
  const specs = dedupeBreakpointSpecs([
    ...readStoredBreakpointSpecs(),
    ...breakpointRegistrations.map((registration) => registration.spec),
  ])
  return specs.filter((spec) => breakpointSpecMatchesModule(spec, url, scriptUrl)).length
}

function moduleIdentity(url: string, scriptUrl: string): string {
  return canonicalModulePath(url || scriptUrl) || normalizeModuleUrl(url || scriptUrl)
}

function sameModulePath(a: string, b: string): boolean {
  const aParts = modulePathParts(a)
  const bParts = modulePathParts(b)
  if (aParts.length === 0 || bParts.length === 0) return false
  if (aParts.join("/") === bParts.join("/")) return true
  const shorter = aParts.length <= bParts.length ? aParts : bParts
  const longer = aParts.length <= bParts.length ? bParts : aParts
  if (shorter.length < 2) return false
  return pathEndsWith(longer, shorter)
}

function pathEndsWith(parts: string[], suffix: string[]): boolean {
  if (suffix.length > parts.length) return false
  const offset = parts.length - suffix.length
  for (let i = 0; i < suffix.length; i++) {
    if (parts[offset + i] !== suffix[i]) return false
  }
  return true
}

function modulePathParts(url: string): string[] {
  return canonicalModulePath(url)
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
}

function isAbsoluteModulePath(url: string): boolean {
  const clean = normalizeModuleUrl(url)
  return clean.startsWith("/") || /^[A-Za-z]:\//.test(clean)
}

function moduleSortName(url: string): string {
  const clean = normalizeModuleUrl(url)
  const parts = clean.split("/").filter((part) => part.length > 0 && part !== ".")
  return parts.slice(-3).join("/")
}

function isProjectInterpreterModule(url: string): boolean {
  const clean = normalizeModuleUrl(url)
  if (clean.length === 0) return false
  const lower = clean.toLowerCase()
  if (
    lower.startsWith("node:") ||
    lower.startsWith("bun:") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("internal/") ||
    lower.startsWith("<") ||
    lower.includes("/node_modules/") ||
    lower.includes("/.bun/")
  ) {
    return false
  }
  return /\.(?:[cm]?[jt]sx?|json|ya?ml)$/i.test(clean)
}

function normalizeModuleUrl(url: string): string {
  let clean = url.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  try {
    const parsed = new URL(clean)
    if (parsed.protocol === "file:" || parsed.protocol === "http:" || parsed.protocol === "https:") {
      clean = decodeURIComponent(parsed.pathname)
    }
  } catch {}
  return clean
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

function setWsStatus(text: string, kind: "" | "live" | "paused" = ""): void {
  wsStatusText = text
  wsStatusKind = kind === "live"
    ? "live"
    : kind === "paused"
      ? "paused"
      : text.includes("disconnect") || text.includes("closed")
        ? "warn"
        : "neutral"
  updateToolbar()
}

function setRunStatus(text: string, kind: BadgeKind | "" = ""): void {
  runStatusText = text
  runStatusKind = kind === "" ? "neutral" : kind
  updateToolbar()
}

function setEngineStatus(text: string): void {
  engineStatus = text
  updateToolbar()
}

function updateToolbar(): void {
  const connectionKind: BadgeKind = connectionState === "connected" ? "live"
    : connectionState === "connecting" ? "neutral"
    : "warn"
  toolbarPane?.setState({
    ws: wsStatusText,
    wsKind: wsStatusKind,
    connection: `context: ${connectionState}`,
    connectionKind,
    run: runStatusText,
    runKind: runStatusKind,
    commandBusy: activeInterpreterCommand !== null,
    commandCmd: activeInterpreterCommand?.cmd ?? "",
    commandLabel: activeInterpreterCommand?.label ?? "",
    draftVisible,
    draftStatus: draftToolbarStatus(),
    draftKind: draftToolbarKind(),
    locale: getUiLocale(),
    inspectorUrl,
    verbose: verboseVisible,
    engine: engineStatus,
    welcomeVisible,
    canShowExecutionPoint: currentDump !== undefined && currentDump.frames.length > 0,
  })
}

function updateWelcomePane(): void {
  const state: WelcomeState = {
    connectionState,
    connectionError,
    targetStatus: describeTargetStatus(),
    defaultCommand: defaultTargetCommand(),
    pauseOnStart: defaultPauseOnStart(),
    workspaceFiles,
    selectedTargetFile,
    locale: getUiLocale(),
  }
  welcomePane?.setState(state)
}

function renderDump(dump: InterpreterDump): void {
  framesPane?.setFrames(dump.frames as FrameSnapshot[], activeFrameIndex)
  syncInterpreterModules()

  const top = dump.frames[activeFrameIndex] ?? dump.frames[0]
  if (top !== undefined) {
    scopesEvalPane?.setFrame(top as FrameSnapshot)
    void renderSourceForFrame(top)
  } else {
    scopesEvalPane?.setFrame(null)
  }
}

async function renderSourceForFrame(frame: FrameSnapshot): Promise<void> {
  const scriptId = frame.scriptId
  if (scriptId === undefined) {
    pushSourceToEngine({lines: ["scriptId недоступен для этого фрейма"], currentLine: 0, location: ""})
    return
  }
  await renderSourceForScript({
    scriptId,
    scriptUrl: scriptUrls.get(scriptId) ?? frame.url,
    sourceUrl: frame.url,
    line: frame.line,
    executionLine: frame.line,
    runtimeState: "paused",
  })
}

async function renderSourceForModule(module: InterpreterModuleSnapshot): Promise<void> {
  await renderSourceForScript({
    scriptId: module.scriptId,
    scriptUrl: module.scriptUrl,
    sourceUrl: module.url,
    line: 0,
    executionLine: 0,
    runtimeState: currentDump === undefined ? "idle" : "paused",
  })
}

async function renderSourceForScript(input: {
  scriptId: string
  scriptUrl: string
  sourceUrl: string
  line: number
  executionLine: number
  runtimeState: SourceRuntimeState
}): Promise<void> {
  const location = sourceLocation(input.sourceUrl, input.scriptId, input.line)
  const preferredSourceKind = "sourcemap"
  const cacheKey = `${input.scriptId}\0${preferredSourceKind}\0${input.sourceUrl}`
  let cached = sourceCache.get(cacheKey)
  if (cached === undefined) {
    setSourceRuntimeState("loading")
    setEngineStatus("engine: loading source")
    if (engineLastSource === null || engineLastSource.lines.length === 0) {
      pushSourceToEngine({lines: ["loading…"], currentLine: 0, location})
    }
    try {
      const res = await fetch(`/source?scriptId=${encodeURIComponent(input.scriptId)}&sourceUrl=${encodeURIComponent(input.sourceUrl)}&sourceKind=${encodeURIComponent(preferredSourceKind)}`)
      const data = await res.json() as {
        url?: string
        scriptSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        pushSourceToEngine({lines: [`no source: ${data.error ?? "unknown"}`], currentLine: 0, location})
        setSourceRuntimeState(input.runtimeState)
        return
      }
      cached = {
        text: data.scriptSource,
        ...(data.url === undefined ? {} : {sourceUrl: data.url}),
        ...(data.tokens === undefined ? {} : {tokens: data.tokens}),
      }
      sourceCache.set(cacheKey, cached)
    } catch (error) {
      pushSourceToEngine({lines: [`fetch failed: ${String(error)}`], currentLine: 0, location})
      setSourceRuntimeState(input.runtimeState)
      return
    } finally {
      setEngineStatus("engine: webgpu")
    }
  }

  const sourceUrl = cached.sourceUrl ?? input.sourceUrl
  rememberModuleGraphSource(sourceUrl, cached.text)
  const nextSourceLocation = sourceLocation(sourceUrl, input.scriptId, input.line)
  activeSource = {
    scriptId: input.scriptId,
    scriptUrl: input.scriptUrl,
    sourceUrl,
    key: sourceKeyFromLocation(nextSourceLocation, input.scriptId),
  }
  pushSourceToEngine({
    lines: cached.text.split("\n"),
    currentLine: input.executionLine,
    location: nextSourceLocation,
    ...(cached.tokens === undefined ? {} : {tokens: cached.tokens}),
  })
  activeSourceKey = activeSource.key
  ensureDraftForActiveSource(cached.text, nextSourceLocation)
  syncSourceBreakpointMarkers()
  setSourceRuntimeState(input.runtimeState)
}

function sourceLocation(sourceUrl: string, scriptId: string, line: number): string {
  const base = sourceUrl || `scriptId=${scriptId}`
  return line > 0 ? `${base}:${line}` : base
}

function appendConsole(entry: ConsoleEntry): void {
  const xc: ConsoleEntry = {ts: entry.ts, text: entry.text}
  if (entry.level !== undefined) xc.level = entry.level
  if (consolePane !== null) {
    consolePane.pushEntries([xc])
  } else {
    // pane ещё не инициализирована — буферизируем.
    consolePending.push(xc)
  }
}

type CommandReply = {ok: boolean; result?: unknown; error?: string}

function send(cmd: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<CommandReply> {
  if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
    return Promise.resolve({ok: false, error: "ws not connected"})
  }
  if (sessionId === undefined) return Promise.resolve({ok: false, error: "sessionId is required"})
  const requestId = nextRequestId++
  return new Promise<CommandReply>((resolve) => {
    const timer = window.setTimeout(() => {
      pendingRequests.delete(requestId)
      resolve({ok: false, error: `${cmd} timed out after ${COMMAND_TIMEOUT_MS}ms`})
    }, COMMAND_TIMEOUT_MS)
    pendingRequests.set(requestId, {timer, resolve})
    socket!.send(JSON.stringify({type: "command", cmd, params, requestId, sessionId}))
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
  clearInterpreterCommand(error)
  for (const [requestId, pending] of pendingRequests) {
    window.clearTimeout(pending.timer)
    pending.resolve({ok: false, error})
    pendingRequests.delete(requestId)
  }
}

connect()
void initEngine()

async function initEngine(): Promise<void> {
  if (uiLoading || uiCanvas !== null) return
  uiLoading = true
  setEngineStatus("engine: init")
  setInterpreterDebugInit({stage: "runtime-create"})
  try {
    uiCanvas = await UiRuntime.create(engineCanvas, {
      virtualDisplay: {
        initial: "near",
        surfaceDisplay: false,
        centerMm: {x: 0, y: SESSION_DISPLAY_CENTER_Y_MM, z: SESSION_DISPLAY_CENTER_Z_MM},
        farDistanceMm: 1200,
      },
    })
    setInterpreterDebugInit({stage: "panes-create"})
    toolbarPane = new ToolbarPane({
      onPause: () => void runInterpreterCommand("pause", {}, t("pause")),
      onResume: () => void runInterpreterCommand("resume", {}, t("resume")),
      onRestartTarget: () => void restartTarget(),
      onStopTarget: () => void stopTarget(),
      onShowExecutionPoint: () => showExecutionPoint(),
      onStep: (kind) => void runInterpreterCommand("step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut")),
      onToggleDraft: () => setDraftVisible(!draftVisible),
      onSaveDraft: () => saveActiveDraft(),
      onToggleLocale: () => toggleLocale(),
      onToggleVerbose: () => setVerboseVisible(!verboseVisible),
    })
    displayHoverOutlinePane = new DisplayHoverOutlinePane()
    framesPane = new FramesPane((index) => {
      activeFrameIndex = index
      if (currentDump !== undefined) renderDump(currentDump)
    }, (module) => {
      void renderSourceForModule(module)
    })
    syncInterpreterModules()
    scopesEvalPane = new ScopesEvalPane(async (expr, frame) => {
      const label = t("runEval")
      const command = beginInterpreterCommand("eval", label)
      if (command === null) {
        scopesEvalPane?.setEvalOutput(`${t("commandAlreadyRunning")}: ${activeInterpreterCommand?.label ?? ""}`)
        return
      }
      scopesEvalPane?.setEvalOutput(t("commandExecuting"))
      try {
        const response = await send("eval", {frame, expr})
        scopesEvalPane?.setEvalOutput(JSON.stringify(response))
      } finally {
        clearInterpreterCommandIf(command, "eval finished")
      }
    })
    sourcePane = new EditorPane({
      title: t("sourceWaiting"),
      path: "",
      fontPx: 12,
      linePx: 16,
      readOnly: true,
      showCaret: false,
      introAnimation: false,
      onBreakpointToggle: (line) => void toggleActiveSourceBreakpoint(line),
    })
    draftEditorPane = new EditorPane({
      title: t("editDraft"),
      onChange: (text) => updateActiveDraftText(text),
      onSave: (text) => saveActiveDraft(text),
      path: activeSourceKey,
      fontPx: 12,
      linePx: 16,
    })
    consolePane = new ConsolePane()
    verbosePane = new VerbosePane()
    welcomePane = new WelcomePane({
      onRun: (command, pauseOnStart) => void startTargetFromCmd(command, pauseOnStart),
      onStop: () => void stopTarget(),
      onPauseOnStart: (pause) => {
        localStorage.setItem("bd:target:brk", pause ? "1" : "0")
        updateWelcomePane()
      },
      onSelectFile: (path) => selectTargetFile(path),
      onToggleLocale: () => toggleLocale(),
    })
    setInterpreterDebugInit({stage: "install-panes"})
    installEnginePanes()
    uiCanvas.handleResize()
    syncSessionDisplays()
    resizeObserver = new ResizeObserver(handleEngineResize)
    resizeObserver.observe(engineCanvas)
    requestAnimationFrame(handleEngineResize)
    setTimeout(handleEngineResize, 200)
    window.addEventListener("resize", handleEngineResize)
    setEngineStatus("engine: webgpu")
    updateToolbar()
    updateWelcomePane()
    void refreshWorkspaceFiles()
    refreshWelcome()

    if (currentDump !== undefined) {
      hideWelcome()
      renderDump(currentDump)
      setRunStatus(`paused (${currentDump.reason})`, "paused")
      setSourceRuntimeState("paused")
    }
    if (engineLastSource !== null) updateSourcePane()
    if (consolePending.length > 0) {
      consolePane.pushEntries(consolePending)
      consolePending.length = 0
    }
    // Interpreter helper: window.__metaforInterpreter.scanScene() печатает все Mesh
    // в сцене с их world-position и size. Помогает находить leftover-mesh.
    interpreterDebugState.__metaforInterpreter = {
      canvas: uiCanvas,
      scene: uiCanvas?.scene,
      scanScene(): void {
        if (uiCanvas === null) return
        const canvasW = engineCanvas.getBoundingClientRect().width
        const canvasH = engineCanvas.getBoundingClientRect().height
        const ps = (uiCanvas as unknown as {[k: string]: unknown})["#pixelScale"] as number | undefined
        // Reflection workaround — приватное поле напрямую недоступно;
        // считаем pixelScale по высоте canvas-а.
        const physicalH = 2 * 0.6 * Math.tan(Math.PI / 4 / 2)
        const pixelScale = ps ?? physicalH / canvasH
        const out: Array<Record<string, unknown>> = []
        const walk = (obj: import("@metafor/engine").Object3D, parents: string[] = []): void => {
          const m = obj as import("@metafor/engine").Mesh
          const t = obj as import("@metafor/engine").Text
          const isText = t.isText === true
          const isMesh = !isText && m.geometry !== undefined
          const w = obj.matrixWorld.elements
          const wx = w[12]!
          const wy = w[13]!
          // canvas-px: from world → canvas pixel (top-left origin).
          const pxX = wx / pixelScale + canvasW / 2
          const pxY = -wy / pixelScale + canvasH / 2
          let bounds: [number, number] | null = null
          if (isMesh && m.geometry !== undefined) {
            const arr = (m.geometry.attributes.position?.array as Float32Array | undefined) ?? null
            if (arr !== null && arr.length >= 6) {
              let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
              for (let i = 0; i < arr.length; i += 3) {
                const x = arr[i]!, y = arr[i + 1]!
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
              }
              bounds = [Math.round((maxX - minX) / pixelScale), Math.round((maxY - minY) / pixelScale)]
            }
          }
          if ((isMesh || isText) && obj.visible) {
            out.push({
              path: parents.join(" > ") + (obj.name ? ` > ${obj.name}` : ""),
              type: isText ? "Text" : "Mesh",
              canvasX: Math.round(pxX),
              canvasY: Math.round(pxY),
              boundsW: bounds?.[0] ?? "-",
              boundsH: bounds?.[1] ?? "-",
            })
          }
          for (const c of obj.children) walk(c, [...parents, obj.name || "(unnamed)"])
        }
        walk(uiCanvas.scene)
        // Сортируем по canvasX чтобы группировать кучками.
        out.sort((a, b) => (a.canvasX as number) - (b.canvasX as number))
        console.table(out)
        return undefined
      },
    }
    setInterpreterDebugInit({stage: "ready"})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedState: {stage: string; error: string; stack?: string} = {
      stage: "failed",
      error: message,
    }
    if (error instanceof Error && error.stack !== undefined) failedState.stack = error.stack
    setInterpreterDebugInit(failedState)
    setEngineStatus(`engine failed: ${message}`)
    console.error("canvas init failed:", error)
  } finally {
    uiLoading = false
  }
}

function setVerboseVisible(on: boolean): void {
  verboseVisible = on
  localStorage.setItem("bd:verbose", on ? "1" : "0")
  updateToolbar()
  for (const controller of sessionDisplays.values()) {
    const snapshot = sessionSnapshots.get(controller.id)
    if (snapshot !== undefined) updateSessionToolbar(controller, snapshot)
  }
  applyEngineLayout()
}

function setDraftVisible(on: boolean): void {
  draftVisible = on
  syncDraftEditor()
  updateToolbar()
  applyEngineLayout()
  if (on && draftEditorPane !== null) uiCanvas?.setFocused(draftEditorPane)
}

function toggleLocale(): void {
  toggleUiLocale()
  updateToolbar()
  updateWelcomePane()
  syncDraftEditorTitle()
  applyEngineLayout()
}

function ensureDraftForActiveSource(text: string, location: string): void {
  const key = sourceKeyFromLocation(location)
  activeSourceKey = key
  if (!sourceDrafts.has(key)) sourceDrafts.set(key, {baseText: text, text, savedText: text, status: "clean"})
  syncDraftEditor()
  updateToolbar()
}

function updateActiveDraftText(text: string): void {
  const draft = activeDraft()
  if (draft === null) return
  draft.text = text
  draft.status = text === draft.savedText ? "saved" : text === draft.baseText ? "clean" : "dirty"
  updateToolbar()
}

function saveActiveDraft(text = draftEditorPane?.getText() ?? ""): void {
  const draft = activeDraft()
  if (draft === null) {
    appendConsole({ts: new Date().toISOString(), level: "warn", text: getUiLocale() === "ru" ? "[ui] Черновик не сохранён: source не загружен" : "[ui] Draft save skipped: no source loaded"})
    return
  }
  draft.text = text
  draft.savedText = text
  draft.status = text === draft.baseText ? "clean" : "saved"
  appendConsole({ts: new Date().toISOString(), level: "debug", text: getUiLocale() === "ru" ? "[ui] Черновик сохранён в памяти; файлы не изменялись" : "[ui] Draft saved in memory; files were not modified"})
  syncDraftEditorTitle()
  updateToolbar()
}

function syncDraftEditor(): void {
  if (draftEditorPane === null) return
  const draft = activeDraft()
  if (draft === null) {
    draftEditorPane.setTitle(`${t("editDraft")} · ${t("draftNoSource")}`)
    draftEditorPane.setText("")
    return
  }
  draftEditorPane.setText(draft.text)
  draftEditorPane.setLanguage({path: activeSourceKey})
  syncDraftEditorTitle()
}

function syncDraftEditorTitle(): void {
  const draft = activeDraft()
  if (draftEditorPane === null) return
  const location = engineLastSource?.location ?? activeSourceKey
  const name = sourcePathFromLocation(location) || "source"
  const marker = draft?.status === "dirty" ? t("dirty") : draft?.status === "saved" ? t("savedInMemory") : t("clean")
  draftEditorPane.setTitle(`${t("editDraft")} · ${marker} · ${name}`)
}

function activeDraft(): DraftState | null {
  if (activeSourceKey.length === 0) return null
  return sourceDrafts.get(activeSourceKey) ?? null
}

function draftToolbarStatus(): string {
  const draft = activeDraft()
  if (draft === null) return "no source"
  if (draft.status === "dirty") return "dirty"
  if (draft.status === "saved") return "saved in memory"
  return "clean"
}

function draftToolbarKind(): BadgeKind {
  const draft = activeDraft()
  if (draft === null) return draftVisible ? "warn" : "neutral"
  if (draft.status === "dirty") return "warn"
  if (draft.status === "saved") return "paused"
  return "neutral"
}

function applyEngineLayout(): void {
  uiCanvas?.relayout()
}

type SessionDisplayController = {
  id: string
  toolbar: ToolbarPane
  frames: FramesPane
  scopes: ScopesEvalPane
  source: EditorPane
  console: ConsolePane
  verbose: VerbosePane
  sourceCache: Map<string, CachedSource>
  activeFrameIndex: number
  dump: InterpreterDump | undefined
  sourceLocation: string
  sourceRuntimeState: SourceRuntimeState
  outputLineCount: number
  activeCommand: ActiveInterpreterCommand | null
}

function createSessionDisplayController(session: SessionPaneSnapshot): SessionDisplayController {
  const controller: SessionDisplayController = {
    id: session.id,
    toolbar: new ToolbarPane({
      onPause: () => void runSessionInterpreterCommand(controller, "pause", {}, t("pause")),
      onResume: () => void runSessionInterpreterCommand(controller, "resume", {}, t("resume")),
      onRestartTarget: () => void restartSession(session.id),
      onStopTarget: () => void stopSession(session.id),
      onShowExecutionPoint: () => renderSessionDump(controller),
      onStep: (kind) => void runSessionInterpreterCommand(controller, "step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut")),
      onToggleDraft: () => {},
      onSaveDraft: () => {},
      onToggleLocale: () => toggleLocale(),
      onToggleVerbose: () => setVerboseVisible(!verboseVisible),
    }),
    frames: new FramesPane((index) => {
      controller.activeFrameIndex = index
      renderSessionDump(controller)
    }),
    scopes: new ScopesEvalPane(async (expr, frame) => {
      controller.scopes.setEvalOutput(t("commandExecuting"))
      const response = await runSessionInterpreterCommand(controller, "eval", {frame, expr}, t("runEval"))
      controller.scopes.setEvalOutput(JSON.stringify(response))
    }),
    source: new EditorPane({
      title: t("sourceWaiting"),
      path: "",
      fontPx: 12,
      linePx: 16,
      readOnly: true,
      showCaret: false,
      introAnimation: false,
    }),
    console: new ConsolePane(),
    verbose: new VerbosePane(),
    sourceCache: new Map(),
    activeFrameIndex: 0,
    dump: undefined,
    sourceLocation: "",
    sourceRuntimeState: "idle",
    outputLineCount: 0,
    activeCommand: null,
  }
  controller.toolbar.node.name = `InterpreterToolbar:${session.id}`
  controller.frames.node.name = `InterpreterFrames:${session.id}`
  controller.scopes.node.name = `InterpreterScopes:${session.id}`
  controller.source.node.name = `InterpreterSource:${session.id}`
  controller.console.node.name = `InterpreterConsole:${session.id}`
  controller.verbose.node.name = `InterpreterVerbose:${session.id}`
  updateSessionDisplay(controller, session)
  return controller
}

function updateSessionDisplay(controller: SessionDisplayController, session: SessionPaneSnapshot): void {
  if (session.dump !== null && controller.dump?.timestamp !== session.dump.timestamp) {
    controller.dump = session.dump
  }
  if (session.target.outputLineCount < controller.outputLineCount) {
    controller.console.clear()
    controller.outputLineCount = 0
  }
  const nextLines = session.target.output.slice(controller.outputLineCount)
  if (nextLines.length > 0) {
    controller.console.pushEntries(nextLines.map((line) => ({
      ts: line.ts,
      level: line.stream === "stderr" ? "error" : undefined,
      text: `[target/${line.stream}] ${line.text}`,
    })))
    controller.outputLineCount = session.target.outputLineCount
  }
  updateSessionToolbar(controller, session)
  if (controller.dump !== undefined) renderSessionDump(controller)
}

function updateSessionToolbar(controller: SessionDisplayController, session: SessionPaneSnapshot): void {
  const run = sessionRunStatus(session)
  const connectionKind: BadgeKind = session.connection.state === "connected"
    ? "live"
    : session.connection.state === "connecting"
      ? "neutral"
      : "warn"
  controller.toolbar.setState({
    ws: session.connection.state,
    wsKind: connectionKind,
    connection: `context: ${session.connection.state}`,
    connectionKind,
    run: controller.activeCommand === null ? run.text : t("commandExecuting"),
    runKind: controller.activeCommand === null ? run.kind : "paused",
    commandBusy: controller.activeCommand !== null,
    commandCmd: controller.activeCommand?.cmd ?? "",
    commandLabel: controller.activeCommand?.label ?? "",
    draftVisible: false,
    draftStatus: "clean",
    draftKind: "neutral",
    locale: getUiLocale(),
    inspectorUrl: session.inspectorUrl,
    verbose: verboseVisible,
    engine: engineStatus,
    welcomeVisible: false,
    canShowExecutionPoint: controller.dump !== undefined && controller.dump.frames.length > 0,
  })
}

function sessionRunStatus(session: SessionPaneSnapshot): {text: string; kind: BadgeKind} {
  if (session.paused) return {text: "paused", kind: "paused"}
  if (session.target.state === "running") return {text: "running", kind: "live"}
  if (session.target.state === "starting") return {text: "target starting", kind: "neutral"}
  if (session.target.state === "exited") return {text: `exited code=${session.target.exitCode}`, kind: "warn"}
  if (session.target.state === "failed") return {text: "failed", kind: "warn"}
  return {text: "waiting", kind: "neutral"}
}

function applySessionDump(sessionId: string, dump: InterpreterDump): void {
  const controller = sessionDisplays.get(sessionId)
  if (controller === undefined) return
  controller.dump = dump
  controller.activeFrameIndex = Math.min(controller.activeFrameIndex, Math.max(0, dump.frames.length - 1))
  renderSessionDump(controller)
  const snapshot = sessionSnapshots.get(sessionId)
  if (snapshot !== undefined) updateSessionToolbar(controller, snapshot)
}

function markSessionResumed(sessionId: string): void {
  const controller = sessionDisplays.get(sessionId)
  if (controller === undefined) return
  controller.dump = undefined
  controller.frames.setFrames([], controller.activeFrameIndex)
  controller.scopes.setFrame(null)
  setSessionSourceState(controller, "running")
  const snapshot = sessionSnapshots.get(sessionId)
  if (snapshot !== undefined) updateSessionToolbar(controller, snapshot)
}

function renderSessionDump(controller: SessionDisplayController): void {
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
  void renderSessionSourceForFrame(controller, frame as FrameSnapshot)
}

async function renderSessionSourceForFrame(controller: SessionDisplayController, frame: FrameSnapshot): Promise<void> {
  const scriptId = frame.scriptId
  if (scriptId === undefined || scriptId.length === 0) {
    setSessionSource(controller, {
      lines: ["scriptId недоступен для этого фрейма"],
      currentLine: 0,
      location: "",
    }, "paused")
    return
  }
  const location = sourceLocation(frame.url, scriptId, frame.line)
  const cacheKey = `${scriptId}\0sourcemap\0${frame.url}`
  let cached = controller.sourceCache.get(cacheKey)
  if (cached === undefined) {
    setSessionSourceState(controller, "loading")
    setSessionSource(controller, {lines: ["loading..."], currentLine: 0, location}, "loading")
    try {
      const res = await fetch(`/sessions/${encodeURIComponent(controller.id)}/source?scriptId=${encodeURIComponent(scriptId)}&sourceUrl=${encodeURIComponent(frame.url)}&sourceKind=sourcemap`)
      const data = await res.json() as {
        url?: string
        scriptSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        setSessionSource(controller, {lines: [`no source: ${data.error ?? "unknown"}`], currentLine: 0, location}, "paused")
        return
      }
      cached = {
        text: data.scriptSource,
        ...(data.url === undefined ? {} : {sourceUrl: data.url}),
        ...(data.tokens === undefined ? {} : {tokens: data.tokens}),
      }
      controller.sourceCache.set(cacheKey, cached)
    } catch (error) {
      setSessionSource(controller, {lines: [`fetch failed: ${String(error)}`], currentLine: 0, location}, "paused")
      return
    }
  }
  const sourceUrl = cached.sourceUrl ?? frame.url
  setSessionSource(controller, {
    lines: cached.text.split("\n"),
    currentLine: frame.line,
    location: sourceLocation(sourceUrl, scriptId, frame.line),
    ...(cached.tokens === undefined ? {} : {tokens: cached.tokens}),
  }, "paused")
}

function setSessionSource(controller: SessionDisplayController, payload: Source, state: SourceRuntimeState): void {
  controller.sourceLocation = payload.location
  controller.sourceRuntimeState = state
  controller.source.setTitle(sessionSourceTitle(controller))
  controller.source.setText(payload.lines.join("\n"))
  if (payload.tokens !== undefined) controller.source.setTokens(payload.tokens)
  else controller.source.setLanguage({path: sourcePathFromLocation(payload.location)})
  controller.source.setExecutionLine(payload.currentLine > 0 ? payload.currentLine : null, {scroll: true})
}

function setSessionSourceState(controller: SessionDisplayController, state: SourceRuntimeState): void {
  controller.sourceRuntimeState = state
  controller.source.setTitle(sessionSourceTitle(controller))
}

function sessionSourceTitle(controller: SessionDisplayController): string {
  const snapshot = sessionSnapshots.get(controller.id)
  const label = snapshot?.label ?? controller.id
  if (controller.sourceRuntimeState === "loading") return `${label} - ${t("sourceLoading")}`
  if (controller.sourceRuntimeState === "running") return `${label} - ${t("sourceRunning")}`
  const location = sourceDisplayLocation(controller.sourceLocation) || t("sourceWaiting")
  return `${label} - ${location}`
}

async function runSessionInterpreterCommand(controller: SessionDisplayController, cmd: string, params: Record<string, unknown>, label: string): Promise<CommandReply> {
  if (controller.activeCommand !== null) {
    return {ok: false, error: `${t("commandAlreadyRunning")}: ${controller.activeCommand.label}`}
  }
  const command: ActiveInterpreterCommand = {
    cmd,
    label,
    startedAt: performance.now(),
    timer: window.setInterval(() => {
      const snapshot = sessionSnapshots.get(controller.id)
      if (snapshot !== undefined) updateSessionToolbar(controller, snapshot)
    }, 250),
  }
  controller.activeCommand = command
  const snapshot = sessionSnapshots.get(controller.id)
  if (snapshot !== undefined) updateSessionToolbar(controller, snapshot)
  try {
    return await send(cmd, params, controller.id)
  } finally {
    window.clearInterval(command.timer)
    if (controller.activeCommand === command) controller.activeCommand = null
    const nextSnapshot = sessionSnapshots.get(controller.id)
    if (nextSnapshot !== undefined) updateSessionToolbar(controller, nextSnapshot)
  }
}

async function restartSession(sessionId: string): Promise<void> {
  const snapshot = sessionSnapshots.get(sessionId)
  const command = snapshot?.target.command
  if (command === undefined || command.length === 0) return
  await stopSession(sessionId)
  await fetch(`/sessions/${encodeURIComponent(sessionId)}/run`, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
      label: snapshot?.label ?? sessionId,
      command: command.filter((part) => !part.startsWith("--inspect")),
      pauseOnStart: snapshot?.target.pauseOnStart ?? true,
    }),
  })
}

function handleEngineResize(): void {
  uiCanvas?.handleResize()
  syncSessionDisplays()
}

function syncSessionDisplays(): void {
  if (uiCanvas === null) return
  const orderedSessions = sessionOrder
    .map((id) => sessionSnapshots.get(id))
    .filter((session): session is SessionPaneSnapshot => session !== undefined)
  if (orderedSessions.length === 0) return

  const displayMetrics = browserDisplayMetrics()
  const displayIds = orderedSessions.map((session) => sessionDisplayId(session.id))
  const totalW = orderedSessions.length * displayMetrics.widthMm
    + Math.max(0, orderedSessions.length - 1) * SESSION_DISPLAY_GAP_MM
  let cursorX = -totalW / 2
  for (let index = 0; index < orderedSessions.length; index++) {
    const session = orderedSessions[index]!
    const displayId = sessionDisplayId(session.id)
    const x = cursorX + displayMetrics.widthMm / 2
    cursorX += displayMetrics.widthMm + SESSION_DISPLAY_GAP_MM
    const center = {x, y: SESSION_DISPLAY_CENTER_Y_MM, z: SESSION_DISPLAY_CENTER_Z_MM}
    if (!sessionDisplayIds.has(session.id)) {
      sessionDisplayIds.add(session.id)
      const controller = createSessionDisplayController(session)
      sessionDisplays.set(session.id, controller)
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
    } else {
      uiCanvas.resizeDisplay(displayId, displayMetrics)
      uiCanvas.setDisplayCenter(displayId, center)
      const controller = sessionDisplays.get(session.id)
      if (controller !== undefined) updateSessionDisplay(controller, session)
    }
  }
  for (const session of orderedSessions) {
    const controller = sessionDisplays.get(session.id)
    if (controller !== undefined) updateSessionDisplay(controller, session)
  }
  if (displayIds.length <= 1) {
    framedSessionKey = displayIds.join("\0")
    uiCanvas.setDisplayMode("near")
    return
  }
  const frameKey = displayIds.map((id, index) => {
    return `${id}:${index}:${Math.round(displayMetrics.widthMm)}x${Math.round(displayMetrics.heightMm)}:${displayMetrics.pixelWidth}x${displayMetrics.pixelHeight}`
  }).join("\0")
  if (framedSessionKey !== frameKey) {
    framedSessionKey = frameKey
    uiCanvas.frameDisplays(displayIds)
  }
}

function sessionDisplayId(sessionId: string): string {
  return `session:${sessionId}`
}

function addInterpreterSurfacesToDisplay(displayId: string, controller: SessionDisplayController): void {
  if (uiCanvas === null) return
  uiCanvas.addSurfaceToDisplay(displayId, controller.frames, (canvas) => interpreterRects(canvas).frames)
  uiCanvas.addSurfaceToDisplay(displayId, controller.scopes, (canvas) => interpreterRects(canvas).scopes)
  uiCanvas.addSurfaceToDisplay(displayId, controller.source, (canvas) => interpreterRects(canvas).source)
  uiCanvas.addSurfaceToDisplay(displayId, controller.console, (canvas) => interpreterRects(canvas).console)
  uiCanvas.addSurfaceToDisplay(displayId, controller.verbose, (canvas) => interpreterRects(canvas).verbose ?? hiddenRect())
  uiCanvas.addSurfaceToDisplay(displayId, controller.toolbar, ({w}) => ({
    x: TOOLBAR_INSET,
    y: TOOLBAR_INSET,
    w: Math.max(1, w - TOOLBAR_INSET * 2),
    h: TOOLBAR_H,
  }))
}

function browserDisplayMetrics(): DisplayLayoutMetrics {
  const metrics = uiCanvas?.viewportDisplayMetrics()
  if (metrics !== null && metrics !== undefined) {
    return metrics
  }
  const rect = engineCanvas.getBoundingClientRect()
  const pixelWidth = Math.max(1, Math.round(rect.width || window.innerWidth || 1))
  const pixelHeight = Math.max(1, Math.round(rect.height || window.innerHeight || 1))
  return {
    widthMm: pixelWidth,
    heightMm: pixelHeight,
    pixelWidth,
    pixelHeight,
  }
}

async function stopSession(sessionId: string): Promise<void> {
  try {
    await fetch(`/sessions/${encodeURIComponent(sessionId)}/stop`, {method: "POST"})
  } catch (error) {
    appendConsole({ts: new Date().toISOString(), level: "error", text: `[ui] session ${sessionId}/stop: ${String(error)}`})
  }
}

function installEnginePanes(): void {
  if (
    uiCanvas === null ||
    displayHoverOutlinePane === null
  ) {
    return
  }

  uiCanvas.addHudSurface(displayHoverOutlinePane, ({w, h}) => ({
    x: 0,
    y: 0,
    w,
    h,
  }))
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
  console: UiSurfaceRect
  verbose: UiSurfaceRect | null
}

function hiddenRect(): UiSurfaceRect {
  return {x: -10000, y: -10000, w: 1, h: 1, visible: false}
}

function welcomeRect({w, h}: {w: number; h: number}): UiSurfaceRect {
  if (!welcomeVisible) return hiddenRect()
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const maxW = Math.max(1, Math.min(1040, w - PAD * 2))
  const paneW = Math.max(360, Math.min(maxW, Math.floor(w * 0.58)))
  const paneH = Math.max(1, Math.min(374, bodyH))
  return {
    x: Math.floor((w - paneW) / 2),
    y: BODY_TOP + Math.floor(Math.max(0, bodyH - paneH) / 2),
    w: paneW,
    h: paneH,
  }
}

function interpreterRects({w, h}: {w: number; h: number}): InterpreterRects {
  const x = PAD
  const y = BODY_TOP
  const bodyW = Math.max(1, w - PAD * 2)
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const consoleH = Math.min(260, Math.max(188, Math.floor(bodyH * 0.24)))
  const workspaceH = Math.max(1, bodyH - consoleH - GAP)
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
  const consoleSplitW = showVerbose
    ? Math.min(520, Math.max(380, Math.floor(bodyW * 0.34)))
    : 0
  const consoleW = showVerbose ? Math.max(1, bodyW - consoleSplitW - GAP) : bodyW

  if (!showRight) {
    const framesH = Math.min(240, Math.max(142, Math.floor(workspaceH * 0.28)))
    return {
      frames: {x, y, w: leftW, h: framesH},
      scopes: {x, y: y + framesH + GAP, w: leftW, h: Math.max(1, workspaceH - framesH - GAP)},
      source: {x: sourceX, y, w: sourceW, h: workspaceH},
      console: {x, y: bottomY, w: bodyW, h: consoleH},
      verbose: null,
    }
  }

  return {
    frames: {x, y, w: leftW, h: workspaceH},
    scopes: {x: w - PAD - rightW, y, w: rightW, h: workspaceH},
    source: {x: sourceX, y, w: sourceW, h: workspaceH},
    console: {x, y: bottomY, w: consoleW, h: consoleH},
    verbose: showVerbose
      ? {x: x + consoleW + GAP, y: bottomY, w: consoleSplitW, h: consoleH}
      : null,
  }
}

function pushSourceToEngine(payload: Source): void {
  engineLastSource = payload
  updateSourcePane()
  syncDraftEditorTitle()
}

function setSourceRuntimeState(state: SourceRuntimeState): void {
  if (sourceRuntimeState === state) return
  sourceRuntimeState = state
  updateSourcePaneTitle()
}

function updateSourcePane(): void {
  if (sourcePane === null) return
  updateSourcePaneTitle()
  if (engineLastSource === null) {
    sourcePane.setText("")
    sourcePane.setExecutionLine(null)
    return
  }
  sourcePane.setText(engineLastSource.lines.join("\n"))
  if (engineLastSource.tokens !== undefined) sourcePane.setTokens(engineLastSource.tokens)
  else sourcePane.setLanguage({path: sourcePathFromLocation(engineLastSource.location)})
  sourcePane.setExecutionLine(engineLastSource.currentLine > 0 ? engineLastSource.currentLine : null, {scroll: true})
  syncSourceBreakpointMarkers()
}

function updateSourcePaneTitle(): void {
  sourcePane?.setTitle(sourceHeaderLocation())
}

function sourceHeaderLocation(): string {
  if (sourceRuntimeState === "disconnected") return t("sourceDisconnected")
  if (sourceRuntimeState === "loading") return t("sourceLoading")
  if (sourceRuntimeState === "running" && engineLastSource !== null) return `${t("sourceLastPaused")}: ${sourceDisplayLocation(engineLastSource.location)}`
  if (sourceRuntimeState === "running") return t("sourceRunning")
  const location = sourceDisplayLocation(engineLastSource?.location) || t("sourceWaiting")
  if (sourceRuntimeState === "paused" && currentDump !== undefined) {
    const hit = currentDump.hitBreakpoints.length > 0 ? ` #${currentDump.hitBreakpoints.join(",")}` : ""
    return `${location} - ${currentDump.reason}${hit}`
  }
  return location
}

function sourceKeyFromLocation(location: string, fallback = ""): string {
  const sourcePath = sourcePathFromLocation(location)
  if (sourcePath.length > 0) return sourcePath
  return fallback
}

function beginInterpreterCommand(cmd: string, label: string): ActiveInterpreterCommand | null {
  if (activeInterpreterCommand !== null) {
    if (cmd === "pause" && activeInterpreterCommand.cmd === "resume") {
      clearInterpreterCommand("pause interrupts resume")
    } else {
      appendConsole({
        ts: new Date().toISOString(),
        level: "warn",
        text: `[ui] ${t("commandAlreadyRunning")}: ${activeInterpreterCommand.label}`,
      })
      return null
    }
  }

  if (activeInterpreterCommand !== null) {
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] ${t("commandAlreadyRunning")}: ${activeInterpreterCommand.label}`,
    })
    return null
  }

  const timer = window.setTimeout(() => {
    if (activeInterpreterCommand === null) return
    const waitedMs = Date.now() - activeInterpreterCommand.startedAt
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] ${activeInterpreterCommand.label}: ${t("commandFailed")} (${waitedMs}ms timeout)`,
    })
    activeInterpreterCommand = null
    restoreRunStatus()
    updateToolbar()
  }, Math.max(COMMAND_TIMEOUT_MS + 5000, 15_000))

  activeInterpreterCommand = {cmd, label, startedAt: Date.now(), timer}
  updateToolbar()
  return activeInterpreterCommand
}

function clearInterpreterCommand(_reason = ""): void {
  if (activeInterpreterCommand === null) return
  window.clearTimeout(activeInterpreterCommand.timer)
  activeInterpreterCommand = null
  updateToolbar()
}

function clearInterpreterCommandIf(command: ActiveInterpreterCommand, reason = ""): void {
  if (activeInterpreterCommand !== command) return
  clearInterpreterCommand(reason)
}

function finishInterpreterCommandForEvent(event: "paused" | "resumed"): void {
  const active = activeInterpreterCommand
  if (active === null) return
  if (event === "paused" && (active.cmd === "pause" || active.cmd === "step")) {
    clearInterpreterCommand("paused")
  }
  if (event === "resumed" && active.cmd === "resume") {
    clearInterpreterCommand("resumed")
  }
}

function restoreRunStatus(): void {
  if (connectionState !== "connected") {
    setRunStatus("waiting")
    return
  }
  setRunStatus(currentDump === undefined ? "running" : "paused", currentDump === undefined ? "live" : "paused")
}

async function runInterpreterCommand(cmd: string, params: Record<string, unknown>, label: string): Promise<void> {
  const command = beginInterpreterCommand(cmd, label)
  if (command === null) return

  if (cmd === "pause") {
    clearPendingPause()
    setRunStatus(t("pauseRequested"), "paused")
  }
  if (cmd === "resume") setRunStatus(getUiLocale() === "ru" ? "продолжение..." : "resuming...", "live")
  if (cmd === "step") setRunStatus(`${label.toLowerCase()}…`, "paused")

  const response = await send(cmd, params)
  const finished = new Date().toISOString()
  if (response.ok) {
    if (cmd === "pause") {
      armPendingPause()
      return
    }
    if (cmd !== "step") clearInterpreterCommandIf(command, "accepted")
    return
  }
  clearInterpreterCommandIf(command, "failed")
  appendConsole({ts: finished, level: "error", text: `[ui] ${label}: ${t("commandFailed")}: ${response.error ?? "unknown error"}`})
  restoreRunStatus()
}

function armPendingPause(): void {
  pendingPauseStartedAt = Date.now()
  setRunStatus(t("pausePending"), "paused")
  pendingPauseTimer = window.setTimeout(() => {
    pendingPauseTimer = null
    if (currentDump !== undefined || connectionState !== "connected") return
    const waitedMs = Date.now() - pendingPauseStartedAt
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: getUiLocale() === "ru"
        ? `[ui] Пауза всё ещё ожидается ${waitedMs}ms; Bun остановится на ближайшей JS-точке`
        : `[ui] Pause is still pending after ${waitedMs}ms; Bun will stop at the next interruptible JS point`,
    })
    setRunStatus(t("pausePending"), "paused")
  }, 1800)
}

function clearPendingPause(): void {
  if (pendingPauseTimer !== null) {
    clearTimeout(pendingPauseTimer)
    pendingPauseTimer = null
  }
  pendingPauseStartedAt = 0
}
