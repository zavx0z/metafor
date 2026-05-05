/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

import {XrCanvas, type CardRect} from "./xr-canvas.ts"
import {XrSourceCard, type XrSource, type XrSourceRuntimeState} from "./xr-source-card.ts"
import {XrConsoleCard, type XrConsoleEntry} from "./xr-console-card.ts"
import {
  XrFramesCard,
  XrScopesEvalCard,
  XrToolbarCard,
  XrVerboseCard,
  XrWelcomeCard,
  type BadgeKind,
  type WelcomeState,
  type XrFrameSnapshot,
} from "./xr-debug-ui.ts"

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

type FrameSnapshot = {
  index: number
  function: string
  url: string
  line: number
  column: number
  scriptId?: string
  callFrameId?: string
  scopes: {
    local: ScopeSnapshot[]
    closure: ScopeSnapshot[]
  }
}

type ScopeSnapshot = {
  type: "local" | "closure"
  name?: string
  objectId?: string
  properties: Record<string, PropertySnapshot>
  error?: string
}

type PropertySnapshot = {
  type?: string
  subtype?: string
  className?: string
  value?: unknown
  description?: string
  objectId?: string
  preview?: unknown
}

type ConsoleEntry = {
  ts: string
  level?: string
  text: string
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (element === null) throw new Error(`#${id} not in DOM`)
  return element as T
}

const engineCanvas = $<HTMLCanvasElement>("engine-canvas")
const consolePending: XrConsoleEntry[] = []
type CachedSource = {text: string; tokens?: import("./xr-source-card.ts").XrSourceTokens}
const sourceCache = new Map<string, CachedSource>()
let xrCanvas: XrCanvas | null = null
let sourceCard: XrSourceCard | null = null
let consoleCard: XrConsoleCard | null = null
let toolbarCard: XrToolbarCard | null = null
let framesCard: XrFramesCard | null = null
let scopesEvalCard: XrScopesEvalCard | null = null
let verboseCard: XrVerboseCard | null = null
let welcomeCard: XrWelcomeCard | null = null
let xrLoading = false
let engineLastSource: XrSource | null = null
let xrResizeObserver: ResizeObserver | null = null
const scriptUrls = new Map<string, string>()
let inspectorUrl = ""
let connectionState: ConnectionState = "connecting"
let connectionError: string | null = null
let verboseEvents = 0
let welcomeVisible = false
let verboseVisible = localStorage.getItem("bd:verbose") === "1"
let engineStatus = "engine: init"
let wsStatusText = "connecting..."
let wsStatusKind: BadgeKind = "neutral"
let runStatusText = "?"
let runStatusKind: BadgeKind = "neutral"

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
const pendingRequests = new Map<number, (msg: Extract<ServerMessage, {type: "result"}>) => void>()

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
    setWsStatus("disconnected")
    setRunStatus("?")
    setTimeout(connect, 1500)
  })
}

function handleServerMessage(msg: ServerMessage): void {
  switch (msg.type) {
    case "hello":
      inspectorUrl = msg.inspectorUrl
      for (const s of msg.scripts) scriptUrls.set(s.scriptId, s.url)
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
      currentDump = msg.dump
      renderDump(msg.dump)
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      setSourceRuntimeState("paused")
      hideWelcome()
      return
    case "resumed":
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
      scriptUrls.set(msg.scriptId, msg.url)
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
      pendingRequests.get(msg.requestId)?.(msg)
      pendingRequests.delete(msg.requestId)
      return
  }
  // Triggered by sidecar `POST /reload` — реложим вкладку программно.
  // Перед reload пробиваем кэш стилей через bump query string —
  // некоторые правки достаточно и без full reload.
  if ((msg as {type: string}).type === "reload") {
    location.reload()
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
    setRunStatus("waiting")
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

function clearLiveState(): void {
  currentDump = undefined
  activeFrameIndex = 0
  framesCard?.setFrames([], activeFrameIndex)
  scopesEvalCard?.setFrame(null)
  pushSourceToEngine({lines: [], currentLine: 0, location: ""})
  scriptUrls.clear()
  sourceCache.clear()
  setSourceRuntimeState("disconnected")
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
    case "idle":     return "target не запущен"
    case "starting": return "starting…"
    case "running":  return `running (pid=${targetState.pid})`
    case "exited":   return `exited code=${targetState.exitCode} (pid=${targetState.pid})`
    case "failed":   return "spawn failed"
  }
}

function defaultTargetCommand(): string {
  const url = inspectorUrl || "ws://127.0.0.1:6499/dark"
  return localStorage.getItem("bd:target:cmd")
    ?? `bun test --timeout=2147483647 --inspect-wait=${url} dark/server.spec.ts`
}

function handleTargetEvent(event: TargetEvent): void {
  switch (event.type) {
    case "started":
      targetState.state = "running"
      targetState.pid = event.pid
      targetState.startedAt = event.startedAt
      targetState.exitedAt = null
      targetState.exitCode = null
      break
    case "exited":
      targetState.state = "exited"
      targetState.exitedAt = event.exitedAt
      targetState.exitCode = event.exitCode
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
  const cmd = rawCmd.trim()
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

function bindWelcomeApply(): void {
  const input = document.getElementById("welcome-url-input") as HTMLInputElement | null
  const button = document.getElementById("btn-welcome-apply") as HTMLButtonElement | null
  const status = document.getElementById("welcome-url-status")
  if (input === null || button === null || status === null) return

  const apply = async (): Promise<void> => {
    const next = input.value.trim()
    if (next.length === 0) return
    status.textContent = `→ POST /inspector ${next}`
    button.disabled = true
    try {
      const res = await fetch("/inspector", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({url: next}),
      })
      const data = await res.json() as {ok: boolean; error?: string; previous?: string}
      status.textContent = data.ok
        ? `→ переключаюсь с ${data.previous ?? "?"} на ${next}`
        : `ошибка: ${data.error ?? "unknown"}`
    } catch (error) {
      status.textContent = `fetch failed: ${String(error)}`
    } finally {
      button.disabled = false
    }
  }

  button.addEventListener("click", () => void apply())
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      void apply()
    }
  })

  const cmdInput = document.getElementById("welcome-cmd-input") as HTMLTextAreaElement | null
  const runBtn = document.getElementById("btn-welcome-run") as HTMLButtonElement | null
  const stopBtn = document.getElementById("btn-welcome-stop") as HTMLButtonElement | null
  if (cmdInput !== null && runBtn !== null) {
    runBtn.addEventListener("click", () => void startTargetFromCmd(cmdInput.value, localStorage.getItem("bd:target:brk") === "1"))
    cmdInput.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        void startTargetFromCmd(cmdInput.value, localStorage.getItem("bd:target:brk") === "1")
      }
    })
  }
  if (stopBtn !== null) {
    stopBtn.addEventListener("click", () => void stopTarget())
  }
}

function renderWelcome(): string {
  const url = inspectorUrl || "ws://127.0.0.1:6499/dark"
  const stateLabel = connectionState === "connecting"
    ? "<span class=\"pulse\">connecting…</span>"
    : `<span class=\"pulse\">disconnected</span> ${connectionError ? `(${escapeHtml(connectionError)})` : ""}`
  const defaultCmd = localStorage.getItem("bd:target:cmd")
    ?? `bun test --timeout=2147483647 --inspect-wait=${url} dark/server.spec.ts`
  const targetRunningHint = targetState.state === "running"
    ? `<div class="muted">target уже запущен (pid=${targetState.pid}). Stop → Run чтобы перезапустить.</div>`
    : ""
  return `
    <p>${stateLabel} → пытаюсь подключиться к <code id="welcome-url">${escapeHtml(url)}</code>.</p>

    <h3>Запустить target из UI</h3>
    <div class="row" style="display:flex;gap:8px;margin:6px 0">
      <textarea id="welcome-cmd-input" rows="2" style="flex:1;background:var(--panel);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:4px 8px;font-family:inherit;font-size:12px;resize:vertical">${escapeHtml(defaultCmd)}</textarea>
    </div>
    <div class="row" style="display:flex;gap:8px;margin:6px 0;align-items:center">
      <button id="btn-welcome-run" type="button">Run target</button>
      <button id="btn-welcome-stop" type="button">Stop target</button>
      <label class="toggle inline" title="sidecar шлёт Debugger.pause до Inspector.initialized — target ловит pause на первой же исполняемой инструкции">
        <input id="welcome-cmd-brk" type="checkbox" ${localStorage.getItem("bd:target:brk") === "1" ? "checked" : ""} />
        pause on start
      </label>
      <span id="welcome-target-status" class="muted">${escapeHtml(describeTargetStatus())}</span>
    </div>
    ${targetRunningHint}

    <h3>Сменить inspector URL</h3>
    <div class="row" style="display:flex;gap:8px;margin:6px 0">
      <input id="welcome-url-input" type="text" value="${escapeHtml(url)}" style="flex:1;background:var(--panel);color:var(--fg);border:1px solid var(--border);border-radius:3px;padding:4px 8px;font-family:inherit;font-size:12px" />
      <button id="btn-welcome-apply" type="button">Apply</button>
    </div>
    <div id="welcome-url-status" class="muted"></div>

    <h3>Когда коннект встанет</h3>
    <ul>
      <li>в основной панели появятся frames и source с подсветкой текущей строки</li>
      <li>можно ставить bp в Chrome: <code>https://debug.bun.sh/#${escapeHtml(stripWs(url))}</code></li>
      <li>тумблер <strong>Verbose</strong> в шапке открывает стрим всех событий Bun-инспектора</li>
    </ul>

    <h3>REST cheatsheet</h3>
    <pre>curl -s http://127.0.0.1:6500/health
curl -s -X POST http://127.0.0.1:6500/target/run -H 'content-type: application/json' \\
  -d '{"command":["bun","test","--inspect-wait=${escapeHtml(url)}","dark/server.spec.ts"]}'
curl -s http://127.0.0.1:6500/target
curl -s -X POST http://127.0.0.1:6500/eval -H 'content-type: application/json' \\
  -d '{"frame":0,"expr":"data.patches[0].path"}'</pre>
  `
}

function stripWs(u: string): string {
  return u.replace(/^wss?:\/\//, "")
}

function appendVerbose(kind: "inspector" | "agent", ts: string, name: string, payload: unknown): void {
  verboseEvents += 1
  verboseCard?.append(kind, ts, name, payload)
}

function matchFilter(name: string, filter: string): boolean {
  for (const part of filter.split(/[\s,]+/).filter(Boolean)) {
    const isNeg = part.startsWith("!")
    const term = isNeg ? part.slice(1) : part
    const re = new RegExp("^" + term.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$")
    const matches = re.test(name)
    if (isNeg && matches) return false
    if (!isNeg && matches) return true
  }
  return filter.split(/[\s,]+/).filter(Boolean).every((p) => p.startsWith("!"))
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function setWsStatus(text: string, kind: "" | "live" | "paused" = ""): void {
  wsStatusText = text
  wsStatusKind = kind === "live" ? "live" : kind === "paused" ? "paused" : "neutral"
  updateToolbar()
}

function setRunStatus(text: string, kind: "" | "live" | "paused" = ""): void {
  runStatusText = text
  runStatusKind = kind === "live" ? "live" : kind === "paused" ? "paused" : "neutral"
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
    pauseOnStart: localStorage.getItem("bd:target:brk") === "1",
  }
  welcomeCard?.setState(state)
}

function renderDump(dump: AgentDump): void {
  framesCard?.setFrames(dump.frames as XrFrameSnapshot[], activeFrameIndex)

  const top = dump.frames[activeFrameIndex] ?? dump.frames[0]
  if (top !== undefined) {
    scopesEvalCard?.setFrame(top as XrFrameSnapshot)
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

  let cached = sourceCache.get(scriptId)
  if (cached === undefined) {
    setSourceRuntimeState("loading")
    setEngineStatus("engine: loading source")
    if (engineLastSource === null || engineLastSource.lines.length === 0) {
      pushSourceToEngine({lines: ["loading…"], currentLine: 0, location})
    }
    try {
      const res = await fetch(`/source?scriptId=${encodeURIComponent(scriptId)}`)
      const data = await res.json() as {
        scriptSource?: string
        tokens?: import("./xr-source-card.ts").XrSourceTokens
        error?: string
      }
      if (typeof data.scriptSource !== "string") {
        pushSourceToEngine({lines: [`no source: ${data.error ?? "unknown"}`], currentLine: 0, location})
        setSourceRuntimeState("paused")
        return
      }
      cached = {text: data.scriptSource, ...(data.tokens === undefined ? {} : {tokens: data.tokens})}
      sourceCache.set(scriptId, cached)
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
  setSourceRuntimeState("paused")
}

function renderScopes(frame: FrameSnapshot): void {
  scopesEvalCard?.setFrame(frame as XrFrameSnapshot)
}

function valueClass(v: PropertySnapshot): string {
  if (v.type === "string") return "string"
  if (v.type === "number") return "number"
  if (v.type === "boolean") return "boolean"
  if (v.type === "function") return "fn"
  if (v.type === "object") return "obj"
  return ""
}

function renderValue(v: PropertySnapshot): string {
  if (v.value !== undefined) {
    if (typeof v.value === "string") return JSON.stringify(v.value)
    return String(v.value)
  }
  if (v.description !== undefined) {
    const desc = String(v.description)
    return desc.length > 120 ? `${desc.slice(0, 120)}…` : desc
  }
  if (v.className !== undefined) return v.className
  if (v.type !== undefined) return v.type
  return "?"
}

function shortenUrl(url: string): string {
  if (url.length <= 60) return url
  const tail = url.split("/").slice(-2).join("/")
  return `…/${tail}`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]!)
}

function appendConsole(entry: ConsoleEntry): void {
  const xc: XrConsoleEntry = {ts: entry.ts, text: entry.text}
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
    pendingRequests.set(requestId, (msg) => {
      const reply: CommandReply = {ok: msg.ok}
      if (msg.result !== undefined) reply.result = msg.result
      if (msg.error !== undefined) reply.error = msg.error
      resolve(reply)
    })
    socket!.send(JSON.stringify({type: "command", cmd, params, requestId}))
  })
}

connect()
void initEngine()

async function initEngine(): Promise<void> {
  if (xrLoading || xrCanvas !== null) return
  xrLoading = true
  setEngineStatus("engine: init")
  try {
    xrCanvas = await XrCanvas.create(engineCanvas)
    toolbarCard = new XrToolbarCard({
      onPause: () => void runDebuggerCommand("pause", {}, "Pause"),
      onResume: () => void runDebuggerCommand("resume", {}, "Resume"),
      onStep: (kind) => void runDebuggerCommand("step", {kind}, `Step ${kind}`),
      onToggleVerbose: () => setVerboseVisible(!verboseVisible),
    })
    framesCard = new XrFramesCard((index) => {
      activeFrameIndex = index
      if (currentDump !== undefined) renderDump(currentDump)
    })
    scopesEvalCard = new XrScopesEvalCard(async (expr, frame) => {
      scopesEvalCard?.setEvalOutput("...")
      const response = await send("eval", {frame, expr})
      scopesEvalCard?.setEvalOutput(JSON.stringify(response))
    })
    sourceCard = new XrSourceCard()
    consoleCard = new XrConsoleCard()
    verboseCard = new XrVerboseCard()
    welcomeCard = new XrWelcomeCard({
      onRun: (command, pauseOnStart) => void startTargetFromCmd(command, pauseOnStart),
      onStop: () => void stopTarget(),
      onApplyInspector: (url) => void applyInspectorUrl(url),
      onPauseOnStart: (pause) => localStorage.setItem("bd:target:brk", pause ? "1" : "0"),
    })
    installEngineCards()
    xrResizeObserver = new ResizeObserver(() => xrCanvas?.handleResize())
    xrResizeObserver.observe(engineCanvas)
    requestAnimationFrame(() => xrCanvas?.handleResize())
    setTimeout(() => xrCanvas?.handleResize(), 200)
    window.addEventListener("resize", () => xrCanvas?.handleResize())
    setEngineStatus("engine: webgpu")
    updateToolbar()
    updateWelcomeCard()
    refreshWelcome()

    if (engineLastSource !== null) sourceCard.setSource(engineLastSource)
    if (consolePending.length > 0) {
      consoleCard.pushEntries(consolePending)
      consolePending.length = 0
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setEngineStatus(`engine failed: ${message}`)
    console.error("xr-canvas init failed:", error)
  } finally {
    xrLoading = false
  }
}

function setVerboseVisible(on: boolean): void {
  verboseVisible = on
  localStorage.setItem("bd:verbose", on ? "1" : "0")
  updateToolbar()
  applyEngineLayout()
}

function applyEngineLayout(): void {
  xrCanvas?.relayout()
}

function installEngineCards(): void {
  if (
    xrCanvas === null ||
    toolbarCard === null ||
    sourceCard === null ||
    consoleCard === null ||
    framesCard === null ||
    scopesEvalCard === null ||
    verboseCard === null ||
    welcomeCard === null
  ) {
    return
  }

  xrCanvas.addCard(welcomeCard, welcomeRect)
  xrCanvas.addCard(framesCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).frames)
  xrCanvas.addCard(scopesEvalCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).scopes)
  xrCanvas.addCard(sourceCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).source)
  xrCanvas.addCard(consoleCard, (canvas) => welcomeVisible ? hiddenRect() : debuggerRects(canvas).console)
  xrCanvas.addCard(verboseCard, (canvas) => {
    if (welcomeVisible) return hiddenRect()
    return debuggerRects(canvas).verbose ?? hiddenRect()
  })
  xrCanvas.addCard(toolbarCard, ({w}) => ({x: 0, y: 0, w: Math.max(1, w), h: TOOLBAR_H}))
}

const TOOLBAR_H = 46
const PAD = 8
const GAP = 8

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
  const bodyH = Math.max(1, h - TOOLBAR_H - PAD * 2)
  const maxW = Math.max(1, Math.min(1440, w - PAD * 2))
  const cardW = Math.max(320, Math.min(maxW, Math.floor(w * 0.86)))
  const cardH = Math.max(1, Math.min(560, bodyH))
  return {
    x: Math.floor((w - cardW) / 2),
    y: TOOLBAR_H + PAD + Math.floor(Math.max(0, bodyH - cardH) / 2),
    w: cardW,
    h: cardH,
  }
}

function debuggerRects({w, h}: {w: number; h: number}): DebuggerRects {
  const x = PAD
  const y = TOOLBAR_H + PAD
  const bodyW = Math.max(1, w - PAD * 2)
  const bodyH = Math.max(1, h - TOOLBAR_H - PAD * 2)
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

function pushSourceToEngine(payload: XrSource): void {
  engineLastSource = payload
  sourceCard?.setSource(payload)
}

function setSourceRuntimeState(state: XrSourceRuntimeState): void {
  sourceCard?.setRuntimeState(state)
}

async function runDebuggerCommand(cmd: string, params: Record<string, unknown>, label: string): Promise<void> {
  const started = new Date().toISOString()
  appendConsole({ts: started, level: "debug", text: `[ui] ${label} requested`})
  if (cmd === "pause") setRunStatus("pausing…", "paused")
  if (cmd === "resume") setRunStatus("resuming…", "live")
  if (cmd === "step") setRunStatus(`${label.toLowerCase()}…`, "paused")

  const response = await send(cmd, params)
  const finished = new Date().toISOString()
  if (response.ok) {
    appendConsole({ts: finished, level: "debug", text: `[ui] ${label} accepted`})
    return
  }
  appendConsole({ts: finished, level: "error", text: `[ui] ${label} failed: ${response.error ?? "unknown error"}`})
  if (connectionState === "connected") {
    setRunStatus(currentDump === undefined ? "running" : "paused", currentDump === undefined ? "live" : "paused")
  } else {
    setRunStatus("waiting")
  }
}
