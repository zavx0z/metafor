/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

import {UiRuntime, type UiSurfaceRect} from "@metafor/elements"
import {EditorPane, sourceDisplayLocation, sourcePathFromLocation, type EditorBreakpoint, type EditorTokens} from "@metafor/components"
import {applyInspectMode} from "../src/inspect-mode.ts"
import {ConsolePane, type ConsoleEntry} from "./console-pane.ts"
import {
  FramesPane,
  HudProbePane,
  ScopesEvalPane,
  ToolbarPane,
  VerbosePane,
  WelcomePane,
  type BadgeKind,
  type WelcomeState,
  type FrameSnapshot,
  type ScopeSnapshot,
  type PropertySnapshot,
} from "./debug-ui.ts"
import {getUiLocale, t, toggleUiLocale} from "./i18n.ts"

type ConnectionInfo = {state: ConnectionState; error: string | null}
type ConnectionState = "connecting" | "connected" | "disconnected"

type ServerMessage =
  | {type: "hello"; inspectorUrl: string; paused: boolean; dump: AgentDump | null; scripts: Array<{scriptId: string; url: string}>; connection: ConnectionInfo}
  | {type: "state"; dump: AgentDump}
  | {type: "resumed"}
  | {type: "console"; entries: ConsoleEntry[]}
  | {type: "connection"; state: ConnectionState; error: string | null; inspectorUrl: string}
  | {type: "script"; scriptId: string; url: string}
  | {type: "target"; event: TargetEvent}
  | {type: "inspector-event"; ts: string; method: string; params: unknown}
  | {type: "agent-event"; ts: string; event: string; detail: unknown}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}

type TargetEvent =
  | {type: "started"; pid: number; command: string[]; cwd: string | null; startedAt: string}
  | {type: "line"; line: {ts: string; stream: "stdout" | "stderr"; text: string}}
  | {type: "exited"; exitCode: number | null; signalCode: string | null; exitedAt: string}

type AgentDump = {
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
const consolePending: ConsoleEntry[] = []
type CachedSource = {text: string; sourceUrl?: string; tokens?: EditorTokens}
type DraftState = {baseText: string; text: string; savedText: string; status: "clean" | "dirty" | "saved"}
const sourceCache = new Map<string, CachedSource>()
const sourceDrafts = new Map<string, DraftState>()
const scriptUrls = new Map<string, string>()
let uiCanvas: UiRuntime | null = null
let sourcePane: EditorPane | null = null
let draftEditorPane: EditorPane | null = null
let consolePane: ConsolePane | null = null
let toolbarPane: ToolbarPane | null = null
let hudProbePane: HudProbePane | null = null
let framesPane: FramesPane | null = null
let scopesEvalPane: ScopesEvalPane | null = null
let verbosePane: VerbosePane | null = null
let welcomePane: WelcomePane | null = null
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
type ActiveDebuggerCommand = {cmd: string; label: string; startedAt: number; timer: number}
let activeDebuggerCommand: ActiveDebuggerCommand | null = null
let breakpointRegistrations: BreakpointRegistration[] = []
const pendingBreakpointLines = new Set<number>()

const targetState = {
  state: "idle" as "idle" | "starting" | "running" | "exited" | "failed",
  pid: null as number | null,
  exitCode: null as number | null,
  startedAt: null as string | null,
  exitedAt: null as string | null,
}

let socket: WebSocket | undefined
let currentDump: AgentDump | undefined
let activeFrameIndex = 0
let nextRequestId = 1
const COMMAND_TIMEOUT_MS = 10_000
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
      rememberScripts(msg.scripts)
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
      finishDebuggerCommandForEvent("paused")
      clearPendingPause()
      currentDump = msg.dump
      renderDump(msg.dump)
      syncSourceBreakpointMarkers()
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      setSourceRuntimeState("paused")
      hideWelcome()
      return
    case "resumed":
      finishDebuggerCommandForEvent("resumed")
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
    case "script":
      rememberScript(msg.scriptId, msg.url)
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
    case "agent-event":
      appendVerbose("agent", msg.ts, msg.event, msg.detail)
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
    clearDebuggerCommand("connection changed")
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
  breakpointRegistrations = []
  pendingBreakpointLines.clear()
  sourceCache.clear()
  syncDraftEditor()
  setSourceRuntimeState(runtimeState)
}

function hideWelcome(): void {
  if (!welcomeVisible) return
  welcomeVisible = false
  applyEngineLayout()
}

function refreshWelcome(): void {
  if (connectionState === "connected" || currentDump !== undefined) {
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

function defaultTargetCommand(): string {
  const url = inspectorUrl || "ws://127.0.0.1:6499/dark"
  const raw = localStorage.getItem("bd:target:cmd")
    ?? `bun test --timeout=2147483647 --inspect-wait=${url} dark/server.spec.ts`
  return commandTextWithInspectMode(raw, defaultPauseOnStart(), url)
}

function defaultPauseOnStart(): boolean {
  return localStorage.getItem("bd:target:brk") !== "0"
}

function handleTargetEvent(event: TargetEvent): void {
  switch (event.type) {
    case "started":
      clearDebuggerCommand("target started")
      clearPendingPause()
      clearLiveState("loading")
      targetState.state = "running"
      targetState.pid = event.pid
      targetState.startedAt = event.startedAt
      targetState.exitedAt = null
      targetState.exitCode = null
      setRunStatus("target starting")
      break
    case "exited":
      clearDebuggerCommand("target exited")
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
  const cmd = commandTextWithInspectMode(rawCmd.trim(), pauseOnStart, inspectorUrl || "ws://127.0.0.1:6499/dark")
  if (cmd.length === 0) return
  localStorage.setItem("bd:target:cmd", cmd)
  const command = parseShellArgs(cmd)
  if (command.length === 0) return

  localStorage.setItem("bd:target:brk", pauseOnStart ? "1" : "0")

  targetState.state = "starting"
  updateWelcomePane()
  try {
    const res = await fetch("/target/run", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({command, pauseOnStart}),
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
  clearDebuggerCommand("restart target")
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

async function applyInspectorUrl(nextUrl: string): Promise<void> {
  const next = nextUrl.trim()
  if (next.length === 0) return
  try {
    const res = await fetch("/inspector", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({url: next}),
    })
    const data = await res.json() as {ok: boolean; error?: string; previous?: string}
    if (!data.ok) connectionError = data.error ?? "unknown inspector error"
    else {
      inspectorUrl = next
      connectionError = null
    }
  } catch (error) {
    connectionError = `fetch failed: ${String(error)}`
  } finally {
    updateToolbar()
    updateWelcomePane()
  }
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

function shellJoin(parts: string[]): string {
  return parts.map(shellQuote).join(" ")
}

function shellQuote(part: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(part)) return part
  return `'${part.replaceAll("'", "'\\''")}'`
}

function appendVerbose(kind: "inspector" | "agent", ts: string, name: string, payload: unknown): void {
  verbosePane?.append(kind, ts, name, payload)
}

function rememberScripts(scripts: Array<{scriptId: string; url: string}>): void {
  for (const script of scripts) rememberScript(script.scriptId, script.url)
}

function rememberScript(scriptId: string, url: string): void {
  if (scriptId.length === 0) return
  scriptUrls.set(scriptId, url)
}

async function refreshBreakpoints(): Promise<void> {
  try {
    const res = await fetch("/breakpoints")
    const data = await res.json() as unknown
    if (!Array.isArray(data)) return
    breakpointRegistrations = data.filter(isBreakpointRegistration)
    syncSourceBreakpointMarkers()
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
  pendingBreakpointLines.add(sourceLine)
  syncSourceBreakpointMarkers()

  try {
    const body = existing === undefined
      ? {url: source.scriptUrl, line: sourceLine}
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

function breakpointRegistrationForActiveLine(line: number): BreakpointRegistration | undefined {
  return breakpointRegistrations.find((registration) => registration.spec.line === line && breakpointMatchesActiveSource(registration))
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
    if (!breakpointMatchesActiveSource(registration)) continue
    const verified = registration.installed.some((installed) => installed.scriptId === source.scriptId || sameSourceUrl(installed.url, source.scriptUrl))
    const hit = registration.installed.some((installed) => hitBreakpointIds.has(installed.breakpointId))
    byLine.set(registration.spec.line, {
      line: registration.spec.line,
      verified,
      pending: !verified,
      hit,
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

function breakpointMatchesActiveSource(registration: BreakpointRegistration): boolean {
  const source = activeSource
  if (source === null) return false
  if (registration.installed.some((installed) => installed.scriptId === source.scriptId || sameSourceUrl(installed.url, source.scriptUrl))) return true

  const spec = registration.spec
  if (spec.url !== undefined) {
    return sameSourceUrl(spec.url, source.scriptUrl)
      || sameSourceUrl(spec.url, source.sourceUrl)
      || sameSourceUrl(spec.url, source.key)
  }
  if (spec.urlRegex !== undefined) {
    try {
      const regex = new RegExp(spec.urlRegex)
      return [source.scriptUrl, source.sourceUrl, source.key].some((value) => regex.test(value))
    } catch {
      return false
    }
  }
  return false
}

function sameSourceUrl(a: string, b: string): boolean {
  const bVariants = new Set(sourceUrlVariants(b))
  return sourceUrlVariants(a).some((value) => bVariants.has(value))
}

function sourceUrlVariants(value: string): string[] {
  const variants = new Set<string>()
  const add = (next: string): void => {
    if (next.length === 0) return
    variants.add(next)
    variants.add(next.replaceAll("\\", "/"))
  }

  add(value)
  try {
    const url = new URL(value)
    if (url.protocol === "file:") add(decodeURIComponent(url.pathname))
  } catch {}
  return [...variants]
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
    connection: `inspector: ${connectionState}`,
    connectionKind,
    run: runStatusText,
    runKind: runStatusKind,
    commandBusy: activeDebuggerCommand !== null,
    commandCmd: activeDebuggerCommand?.cmd ?? "",
    commandLabel: activeDebuggerCommand?.label ?? "",
    draftVisible,
    draftStatus: draftToolbarStatus(),
    draftKind: draftToolbarKind(),
    locale: getUiLocale(),
    inspectorUrl,
    verbose: verboseVisible,
    engine: engineStatus,
  })
}

function updateWelcomePane(): void {
  const state: WelcomeState = {
    connectionState,
    connectionError,
    inspectorUrl: inspectorUrl || "ws://127.0.0.1:6499/dark",
    targetStatus: describeTargetStatus(),
    defaultCommand: defaultTargetCommand(),
    pauseOnStart: defaultPauseOnStart(),
  }
  welcomePane?.setState(state)
}

function renderDump(dump: AgentDump): void {
  framesPane?.setFrames(dump.frames as FrameSnapshot[], activeFrameIndex)

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
  const location = `${frame.url || "scriptId=" + scriptId}:${frame.line}`

  const preferredSourceKind = "sourcemap"
  const cacheKey = `${scriptId}\0${preferredSourceKind}\0${frame.url}`
  let cached = sourceCache.get(cacheKey)
  if (cached === undefined) {
    setSourceRuntimeState("loading")
    setEngineStatus("engine: loading source")
    if (engineLastSource === null || engineLastSource.lines.length === 0) {
      pushSourceToEngine({lines: ["loading…"], currentLine: 0, location})
    }
    try {
      const res = await fetch(`/source?scriptId=${encodeURIComponent(scriptId)}&sourceUrl=${encodeURIComponent(frame.url)}&sourceKind=${encodeURIComponent(preferredSourceKind)}`)
      const data = await res.json() as {
        url?: string
        scriptSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        pushSourceToEngine({lines: [`no source: ${data.error ?? "unknown"}`], currentLine: 0, location})
        setSourceRuntimeState("paused")
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
      setSourceRuntimeState("paused")
      return
    } finally {
      setEngineStatus("engine: webgpu")
    }
  }

  const scriptUrl = scriptUrls.get(scriptId) ?? frame.url
  const sourceUrl = cached.sourceUrl ?? frame.url
  const sourceLocation = `${sourceUrl || "scriptId=" + scriptId}:${frame.line}`
  activeSource = {
    scriptId,
    scriptUrl,
    sourceUrl,
    key: sourceKeyFromLocation(sourceLocation, scriptId),
  }
  pushSourceToEngine({
    lines: cached.text.split("\n"),
    currentLine: frame.line,
    location: sourceLocation,
    ...(cached.tokens === undefined ? {} : {tokens: cached.tokens}),
  })
  activeSourceKey = activeSource.key
  ensureDraftForActiveSource(cached.text, sourceLocation)
  syncSourceBreakpointMarkers()
  setSourceRuntimeState("paused")
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

function send(cmd: string, params: Record<string, unknown> = {}): Promise<CommandReply> {
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
    socket!.send(JSON.stringify({type: "command", cmd, params, requestId}))
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
  clearDebuggerCommand(error)
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
  try {
    uiCanvas = await UiRuntime.create(engineCanvas, {
      virtualDisplay: {
        initial: "far",
        farDistanceMm: 1200,
      },
    })
    toolbarPane = new ToolbarPane({
      onPause: () => void runDebuggerCommand("pause", {}, t("pause")),
      onResume: () => void runDebuggerCommand("resume", {}, t("resume")),
      onRestartTarget: () => void restartTarget(),
      onStopTarget: () => void stopTarget(),
      onStep: (kind) => void runDebuggerCommand("step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut")),
      onToggleDraft: () => setDraftVisible(!draftVisible),
      onSaveDraft: () => saveActiveDraft(),
      onToggleLocale: () => toggleLocale(),
      onToggleVerbose: () => setVerboseVisible(!verboseVisible),
    })
    hudProbePane = new HudProbePane()
    framesPane = new FramesPane((index) => {
      activeFrameIndex = index
      if (currentDump !== undefined) renderDump(currentDump)
    })
    scopesEvalPane = new ScopesEvalPane(async (expr, frame) => {
      const label = t("runEval")
      const command = beginDebuggerCommand("eval", label)
      if (command === null) {
        scopesEvalPane?.setEvalOutput(`${t("commandAlreadyRunning")}: ${activeDebuggerCommand?.label ?? ""}`)
        return
      }
      scopesEvalPane?.setEvalOutput(t("commandExecuting"))
      try {
        const response = await send("eval", {frame, expr})
        scopesEvalPane?.setEvalOutput(JSON.stringify(response))
      } finally {
        clearDebuggerCommandIf(command, "eval finished")
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
      onApplyInspector: (url) => void applyInspectorUrl(url),
      onPauseOnStart: (pause) => {
        localStorage.setItem("bd:target:brk", pause ? "1" : "0")
        updateWelcomePane()
      },
    })
    installEnginePanes()
    resizeObserver = new ResizeObserver(() => uiCanvas?.handleResize())
    resizeObserver.observe(engineCanvas)
    requestAnimationFrame(() => uiCanvas?.handleResize())
    setTimeout(() => uiCanvas?.handleResize(), 200)
    window.addEventListener("resize", () => uiCanvas?.handleResize())
    setEngineStatus("engine: webgpu")
    updateToolbar()
    updateWelcomePane()
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
    // Debug helper: window.__metaforDebug.scanScene() печатает все Mesh
    // в сцене с их world-position и size. Помогает находить leftover-mesh.
    ;(window as unknown as {__metaforDebug: unknown}).__metaforDebug = {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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

function installEnginePanes(): void {
  if (
    uiCanvas === null ||
    toolbarPane === null ||
    hudProbePane === null ||
    sourcePane === null ||
    draftEditorPane === null ||
    consolePane === null ||
    framesPane === null ||
    scopesEvalPane === null ||
    verbosePane === null ||
    welcomePane === null
  ) {
    return
  }

  uiCanvas.addSurface(welcomePane, welcomeRect)
  uiCanvas.addSurface(framesPane, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).frames)
  uiCanvas.addSurface(scopesEvalPane, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).scopes)
  uiCanvas.addSurface(sourcePane, (canvas) => welcomeVisible || draftVisible ? hiddenRect() : debuggerRects(canvas).source)
  uiCanvas.addSurface(draftEditorPane, (canvas) => welcomeVisible || !draftVisible ? hiddenRect() : debuggerRects(canvas).source)
  uiCanvas.addSurface(consolePane, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).console)
  uiCanvas.addSurface(verbosePane, (canvas) => {
    if (welcomeVisible) return hiddenRect()
    return debuggerRects(canvas).verbose ?? hiddenRect()
  })
  uiCanvas.addSurface(toolbarPane, ({w}) => ({
    x: TOOLBAR_INSET,
    y: TOOLBAR_INSET,
    w: Math.max(1, w - TOOLBAR_INSET * 2),
    h: TOOLBAR_H,
  }))
  uiCanvas.addHudSurface(hudProbePane, ({w, h}) => ({
    x: Math.max(TOOLBAR_INSET, Math.floor((w - HUD_PROBE_W) / 2)),
    y: Math.max(TOOLBAR_INSET + TOOLBAR_H + PAD, h - HUD_PROBE_H - 28),
    w: HUD_PROBE_W,
    h: HUD_PROBE_H,
  }))
}

const TOOLBAR_INSET = 4
const TOOLBAR_H = 38
const HUD_PROBE_W = 210
const HUD_PROBE_H = 46
const PAD = 6
const GAP = 8
const BODY_TOP = TOOLBAR_INSET + TOOLBAR_H + PAD

type DebuggerRects = {
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
  const maxW = Math.max(1, Math.min(1280, w - PAD * 2))
  const paneW = Math.max(320, Math.min(maxW, Math.floor(w * 0.7)))
  // welcome content stack: title + status panel + target/inspector panels.
  // Берём min от bodyH чтобы не вылезать на маленьких окнах.
  const paneH = Math.max(1, Math.min(398, bodyH))
  return {
    x: Math.floor((w - paneW) / 2),
    y: BODY_TOP + Math.floor(Math.max(0, bodyH - paneH) / 2),
    w: paneW,
    h: paneH,
  }
}

function debuggerRects({w, h}: {w: number; h: number}): DebuggerRects {
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
  return sourceDisplayLocation(engineLastSource?.location) || t("sourceWaiting")
}

function sourceKeyFromLocation(location: string, fallback = ""): string {
  const sourcePath = sourcePathFromLocation(location)
  if (sourcePath.length > 0) return sourcePath
  return fallback
}

function beginDebuggerCommand(cmd: string, label: string): ActiveDebuggerCommand | null {
  if (activeDebuggerCommand !== null) {
    if (cmd === "pause" && activeDebuggerCommand.cmd === "resume") {
      clearDebuggerCommand("pause interrupts resume")
    } else {
      appendConsole({
        ts: new Date().toISOString(),
        level: "warn",
        text: `[ui] ${t("commandAlreadyRunning")}: ${activeDebuggerCommand.label}`,
      })
      return null
    }
  }

  if (activeDebuggerCommand !== null) {
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] ${t("commandAlreadyRunning")}: ${activeDebuggerCommand.label}`,
    })
    return null
  }

  const timer = window.setTimeout(() => {
    if (activeDebuggerCommand === null) return
    const waitedMs = Date.now() - activeDebuggerCommand.startedAt
    appendConsole({
      ts: new Date().toISOString(),
      level: "warn",
      text: `[ui] ${activeDebuggerCommand.label}: ${t("commandFailed")} (${waitedMs}ms timeout)`,
    })
    activeDebuggerCommand = null
    restoreRunStatus()
    updateToolbar()
  }, Math.max(COMMAND_TIMEOUT_MS + 5000, 15_000))

  activeDebuggerCommand = {cmd, label, startedAt: Date.now(), timer}
  updateToolbar()
  return activeDebuggerCommand
}

function clearDebuggerCommand(_reason = ""): void {
  if (activeDebuggerCommand === null) return
  window.clearTimeout(activeDebuggerCommand.timer)
  activeDebuggerCommand = null
  updateToolbar()
}

function clearDebuggerCommandIf(command: ActiveDebuggerCommand, reason = ""): void {
  if (activeDebuggerCommand !== command) return
  clearDebuggerCommand(reason)
}

function finishDebuggerCommandForEvent(event: "paused" | "resumed"): void {
  const active = activeDebuggerCommand
  if (active === null) return
  if (event === "paused" && (active.cmd === "pause" || active.cmd === "step")) {
    clearDebuggerCommand("paused")
  }
  if (event === "resumed" && active.cmd === "resume") {
    clearDebuggerCommand("resumed")
  }
}

function restoreRunStatus(): void {
  if (connectionState !== "connected") {
    setRunStatus("waiting")
    return
  }
  setRunStatus(currentDump === undefined ? "running" : "paused", currentDump === undefined ? "live" : "paused")
}

async function runDebuggerCommand(cmd: string, params: Record<string, unknown>, label: string): Promise<void> {
  const command = beginDebuggerCommand(cmd, label)
  if (command === null) return

  const started = new Date().toISOString()
  appendConsole({ts: started, level: "debug", text: `[ui] ${label}: ${t("commandExecuting")}`})
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
      armPendingPause(finished)
      return
    }
    appendConsole({ts: finished, level: "debug", text: `[ui] ${label}: ${t("commandAccepted")}`})
    if (cmd !== "step") clearDebuggerCommandIf(command, "accepted")
    return
  }
  clearDebuggerCommandIf(command, "failed")
  appendConsole({ts: finished, level: "error", text: `[ui] ${label}: ${t("commandFailed")}: ${response.error ?? "unknown error"}`})
  restoreRunStatus()
}

function armPendingPause(ts: string): void {
  pendingPauseStartedAt = Date.now()
  appendConsole({ts, level: "debug", text: `[ui] ${t("pause")}: ${t("commandAccepted")}; ${t("pausePending")}`})
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
