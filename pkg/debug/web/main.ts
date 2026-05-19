/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

import {UiCanvas, type CardRect} from "@metafor/elements"
import {EditorCard, sourcePathFromLocation, type EditorTokens} from "@metafor/components"
import {applyInspectMode} from "../src/inspect-mode.ts"
import {SourceCard, type Source, type SourceRuntimeState} from "./source-card.ts"
import {ConsoleCard, type ConsoleEntry} from "./console-card.ts"
import {
  FramesCard,
  ScopesEvalCard,
  ToolbarCard,
  VerboseCard,
  WelcomeCard,
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

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`#${id} not in DOM`)
  return element as T
}

const engineCanvas = $<HTMLCanvasElement>("engine-canvas")
const consolePending: ConsoleEntry[] = []
type CachedSource = {text: string; tokens?: EditorTokens}
type DraftState = {baseText: string; text: string; savedText: string; status: "clean" | "dirty" | "saved"}
const sourceCache = new Map<string, CachedSource>()
const sourceDrafts = new Map<string, DraftState>()
let uiCanvas: UiCanvas | null = null
let sourceCard: SourceCard | null = null
let draftEditorCard: EditorCard | null = null
let consoleCard: ConsoleCard | null = null
let toolbarCard: ToolbarCard | null = null
let framesCard: FramesCard | null = null
let scopesEvalCard: ScopesEvalCard | null = null
let verboseCard: VerboseCard | null = null
let welcomeCard: WelcomeCard | null = null
let uiLoading = false
let engineLastSource: Source | null = null
let resizeObserver: ResizeObserver | null = null
let inspectorUrl = ""
let connectionState: ConnectionState = "connecting"
let connectionError: string | null = null
let welcomeVisible = false
let verboseVisible = localStorage.getItem("bd:verbose") === "1"
let draftVisible = false
let activeSourceKey = ""
let engineStatus = "engine: init"
let wsStatusText = "connecting..."
let wsStatusKind: BadgeKind = "neutral"
let runStatusText = "?"
let runStatusKind: BadgeKind = "neutral"
let pendingPauseTimer: number | null = null
let pendingPauseStartedAt = 0
type ActiveDebuggerCommand = {cmd: string; label: string; startedAt: number; timer: number}
let activeDebuggerCommand: ActiveDebuggerCommand | null = null

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
      refreshWelcome()
      return
    case "state":
      finishDebuggerCommandForEvent("paused")
      clearPendingPause()
      currentDump = msg.dump
      renderDump(msg.dump)
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      setSourceRuntimeState("paused")
      hideWelcome()
      return
    case "resumed":
      finishDebuggerCommandForEvent("resumed")
      clearPendingPause()
      currentDump = undefined
      framesCard?.setFrames([], activeFrameIndex)
      scopesEvalCard?.setFrame(null)
      // Держим последнюю source-карточку, но явно маркируем running,
      // чтобы это не выглядело как не обновляющийся paused editor.
      setRunStatus("running", "live")
      setSourceRuntimeState("running")
      return
    case "connection":
      applyConnection({state: msg.state, error: msg.error})
      refreshWelcome()
      return
    case "script":
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
  updateWelcomeCard()
}

function clearLiveState(runtimeState: SourceRuntimeState = "disconnected"): void {
  currentDump = undefined
  activeFrameIndex = 0
  framesCard?.setFrames([], activeFrameIndex)
  scopesEvalCard?.setFrame(null)
  pushSourceToEngine({lines: [], currentLine: 0, location: ""})
  activeSourceKey = ""
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
  updateWelcomeCard()
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
  updateWelcomeCard()
}

async function startTargetFromCmd(rawCmd: string, pauseOnStart: boolean): Promise<void> {
  const cmd = commandTextWithInspectMode(rawCmd.trim(), pauseOnStart, inspectorUrl || "ws://127.0.0.1:6499/dark")
  if (cmd.length === 0) return
  localStorage.setItem("bd:target:cmd", cmd)
  const command = parseShellArgs(cmd)
  if (command.length === 0) return

  localStorage.setItem("bd:target:brk", pauseOnStart ? "1" : "0")

  targetState.state = "starting"
  updateWelcomeCard()
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
      updateWelcomeCard()
      return
    }
    if (data.snapshot !== undefined) {
      targetState.pid = data.snapshot.pid
    }
  } catch (error) {
    targetState.state = "failed"
    connectionError = `fetch failed: ${String(error)}`
  } finally {
    updateWelcomeCard()
  }
}

async function stopTarget(): Promise<void> {
  try {
    await fetch("/target/stop", {method: "POST"})
  } catch {}
  updateWelcomeCard()
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
    updateWelcomeCard()
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
  verboseCard?.append(kind, ts, name, payload)
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
  toolbarCard?.setState({
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

function updateWelcomeCard(): void {
  const state: WelcomeState = {
    connectionState,
    connectionError,
    inspectorUrl: inspectorUrl || "ws://127.0.0.1:6499/dark",
    targetStatus: describeTargetStatus(),
    defaultCommand: defaultTargetCommand(),
    pauseOnStart: defaultPauseOnStart(),
  }
  welcomeCard?.setState(state)
}

function renderDump(dump: AgentDump): void {
  framesCard?.setFrames(dump.frames as FrameSnapshot[], activeFrameIndex)

  const top = dump.frames[activeFrameIndex] ?? dump.frames[0]
  if (top !== undefined) {
    scopesEvalCard?.setFrame(top as FrameSnapshot)
    void renderSourceForFrame(top)
  } else {
    scopesEvalCard?.setFrame(null)
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
        scriptSource?: string
        tokens?: EditorTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        pushSourceToEngine({lines: [`no source: ${data.error ?? "unknown"}`], currentLine: 0, location})
        setSourceRuntimeState("paused")
        return
      }
      cached = {text: data.scriptSource, ...(data.tokens === undefined ? {} : {tokens: data.tokens})}
      sourceCache.set(cacheKey, cached)
    } catch (error) {
      pushSourceToEngine({lines: [`fetch failed: ${String(error)}`], currentLine: 0, location})
      setSourceRuntimeState("paused")
      return
    } finally {
      setEngineStatus("engine: webgpu")
    }
  }

  pushSourceToEngine({
    lines: cached.text.split("\n"),
    currentLine: frame.line,
    location,
    ...(cached.tokens === undefined ? {} : {tokens: cached.tokens}),
  })
  activeSourceKey = sourceKeyFromLocation(location, scriptId)
  ensureDraftForActiveSource(cached.text, location)
  setSourceRuntimeState("paused")
}

function appendConsole(entry: ConsoleEntry): void {
  const xc: ConsoleEntry = {ts: entry.ts, text: entry.text}
  if (entry.level !== undefined) xc.level = entry.level
  if (consoleCard !== null) {
    consoleCard.pushEntries([xc])
  } else {
    // карточка ещё не инициализирована — буферизируем.
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
    uiCanvas = await UiCanvas.create(engineCanvas)
    toolbarCard = new ToolbarCard({
      onPause: () => void runDebuggerCommand("pause", {}, t("pause")),
      onResume: () => void runDebuggerCommand("resume", {}, t("resume")),
      onRestartTarget: () => void restartTarget(),
      onStep: (kind) => void runDebuggerCommand("step", {kind}, kind === "over" ? t("stepOver") : kind === "into" ? t("stepInto") : t("stepOut")),
      onToggleDraft: () => setDraftVisible(!draftVisible),
      onSaveDraft: () => saveActiveDraft(),
      onToggleLocale: () => toggleLocale(),
      onToggleVerbose: () => setVerboseVisible(!verboseVisible),
    })
    framesCard = new FramesCard((index) => {
      activeFrameIndex = index
      if (currentDump !== undefined) renderDump(currentDump)
    })
    scopesEvalCard = new ScopesEvalCard(async (expr, frame) => {
      const label = t("runEval")
      const command = beginDebuggerCommand("eval", label)
      if (command === null) {
        scopesEvalCard?.setEvalOutput(`${t("commandAlreadyRunning")}: ${activeDebuggerCommand?.label ?? ""}`)
        return
      }
      scopesEvalCard?.setEvalOutput(t("commandExecuting"))
      try {
        const response = await send("eval", {frame, expr})
        scopesEvalCard?.setEvalOutput(JSON.stringify(response))
      } finally {
        clearDebuggerCommandIf(command, "eval finished")
      }
    })
    sourceCard = new SourceCard()
    draftEditorCard = new EditorCard({
      title: t("editDraft"),
      onChange: (text) => updateActiveDraftText(text),
      onSave: (text) => saveActiveDraft(text),
      path: activeSourceKey,
      fontPx: 12,
      linePx: 16,
    })
    consoleCard = new ConsoleCard()
    verboseCard = new VerboseCard()
    welcomeCard = new WelcomeCard({
      onRun: (command, pauseOnStart) => void startTargetFromCmd(command, pauseOnStart),
      onStop: () => void stopTarget(),
      onApplyInspector: (url) => void applyInspectorUrl(url),
      onPauseOnStart: (pause) => {
        localStorage.setItem("bd:target:brk", pause ? "1" : "0")
        updateWelcomeCard()
      },
    })
    installEngineCards()
    resizeObserver = new ResizeObserver(() => uiCanvas?.handleResize())
    resizeObserver.observe(engineCanvas)
    requestAnimationFrame(() => uiCanvas?.handleResize())
    setTimeout(() => uiCanvas?.handleResize(), 200)
    window.addEventListener("resize", () => uiCanvas?.handleResize())
    setEngineStatus("engine: webgpu")
    updateToolbar()
    updateWelcomeCard()
    refreshWelcome()

    if (currentDump !== undefined) {
      hideWelcome()
      renderDump(currentDump)
      setRunStatus(`paused (${currentDump.reason})`, "paused")
      setSourceRuntimeState("paused")
    }
    if (engineLastSource !== null) sourceCard.setSource(engineLastSource)
    if (consolePending.length > 0) {
      consoleCard.pushEntries(consolePending)
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
  if (on && draftEditorCard !== null) uiCanvas?.setFocused(draftEditorCard)
}

function toggleLocale(): void {
  toggleUiLocale()
  updateToolbar()
  updateWelcomeCard()
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

function saveActiveDraft(text = draftEditorCard?.getText() ?? ""): void {
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
  if (draftEditorCard === null) return
  const draft = activeDraft()
  if (draft === null) {
    draftEditorCard.setTitle(`${t("editDraft")} · ${t("draftNoSource")}`)
    draftEditorCard.setText("")
    return
  }
  draftEditorCard.setText(draft.text)
  draftEditorCard.setLanguage({path: activeSourceKey})
  syncDraftEditorTitle()
}

function syncDraftEditorTitle(): void {
  const draft = activeDraft()
  if (draftEditorCard === null) return
  const location = engineLastSource?.location ?? activeSourceKey
  const name = sourcePathFromLocation(location) || "source"
  const marker = draft?.status === "dirty" ? t("dirty") : draft?.status === "saved" ? t("savedInMemory") : t("clean")
  draftEditorCard.setTitle(`${t("editDraft")} · ${marker} · ${name}`)
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

function installEngineCards(): void {
  if (
    uiCanvas === null ||
    toolbarCard === null ||
    sourceCard === null ||
    draftEditorCard === null ||
    consoleCard === null ||
    framesCard === null ||
    scopesEvalCard === null ||
    verboseCard === null ||
    welcomeCard === null
  ) {
    return
  }

  uiCanvas.addCard(welcomeCard, welcomeRect)
  uiCanvas.addCard(framesCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).frames)
  uiCanvas.addCard(scopesEvalCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).scopes)
  uiCanvas.addCard(sourceCard, (canvas) => welcomeVisible || draftVisible ? hiddenRect() : debuggerRects(canvas).source)
  uiCanvas.addCard(draftEditorCard, (canvas) => welcomeVisible || !draftVisible ? hiddenRect() : debuggerRects(canvas).source)
  uiCanvas.addCard(consoleCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).console)
  uiCanvas.addCard(verboseCard, (canvas) => {
    if (welcomeVisible) return hiddenRect()
    return debuggerRects(canvas).verbose ?? hiddenRect()
  })
  uiCanvas.addCard(toolbarCard, ({w}) => ({
    x: TOOLBAR_INSET,
    y: TOOLBAR_INSET,
    w: Math.max(1, w - TOOLBAR_INSET * 2),
    h: TOOLBAR_H,
  }))
}

const TOOLBAR_INSET = 8
const TOOLBAR_H = 44
const PAD = 8
const GAP = 8
const BODY_TOP = TOOLBAR_INSET + TOOLBAR_H + PAD

type DebuggerRects = {
  frames: CardRect
  scopes: CardRect
  source: CardRect
  console: CardRect
  verbose: CardRect | null
}

function hiddenRect(): CardRect {
  return {x: -10000, y: -10000, w: 1, h: 1, visible: false}
}

function welcomeRect({w, h}: {w: number; h: number}): CardRect {
  if (!welcomeVisible) return hiddenRect()
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const maxW = Math.max(1, Math.min(1280, w - PAD * 2))
  const cardW = Math.max(320, Math.min(maxW, Math.floor(w * 0.7)))
  // welcome content stack: title + status panel + target/inspector panels.
  // Берём min от bodyH чтобы не вылезать на маленьких окнах.
  const cardH = Math.max(1, Math.min(398, bodyH))
  return {
    x: Math.floor((w - cardW) / 2),
    y: BODY_TOP + Math.floor(Math.max(0, bodyH - cardH) / 2),
    w: cardW,
    h: cardH,
  }
}

function debuggerRects({w, h}: {w: number; h: number}): DebuggerRects {
  const x = PAD
  const y = BODY_TOP
  const bodyW = Math.max(1, w - PAD * 2)
  const bodyH = Math.max(1, h - BODY_TOP - PAD)
  const leftW = w >= 980 ? 310 : Math.max(230, Math.floor(bodyW * 0.28))
  const showVerbose = verboseVisible && w >= 1180
  const verboseW = showVerbose ? Math.min(430, Math.max(340, Math.floor(bodyW * 0.24))) : 0
  const centerX = x + leftW + GAP
  const centerW = Math.max(1, bodyW - leftW - GAP - (showVerbose ? verboseW + GAP : 0))
  const consoleH = Math.min(260, Math.max(170, Math.floor(bodyH * 0.28)))
  const sourceH = Math.max(1, bodyH - consoleH - GAP)
  const framesH = Math.min(168, Math.max(120, Math.floor(bodyH * 0.18)))
  const scopesH = Math.max(1, bodyH - framesH - GAP)

  return {
    frames: {x, y, w: leftW, h: framesH},
    scopes: {x, y: y + framesH + GAP, w: leftW, h: scopesH},
    source: {x: centerX, y, w: centerW, h: sourceH},
    console: {x: centerX, y: y + sourceH + GAP, w: centerW, h: consoleH},
    verbose: showVerbose
      ? {x: w - PAD - verboseW, y, w: verboseW, h: bodyH}
      : null,
  }
}

function pushSourceToEngine(payload: Source): void {
  engineLastSource = payload
  sourceCard?.setSource(payload)
  syncDraftEditorTitle()
}

function setSourceRuntimeState(state: SourceRuntimeState): void {
  sourceCard?.setRuntimeState(state)
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
