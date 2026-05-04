/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

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

const wsStatus = $("ws-status")
const runStatus = $("run-status")
const inspectorUrlBadge = $("inspector-url")
const framesList = $<HTMLUListElement>("frames")
const scopesContainer = $("scopes")
const evalInput = $<HTMLTextAreaElement>("eval-input")
const evalFrame = $<HTMLInputElement>("eval-frame")
const evalOutput = $("eval-output")
const consoleLog = $("console-log")
const sourceView = $<HTMLPreElement>("source-view")
const sourceLoc = $("source-loc")
const sourceCache = new Map<string, string>()
const connStatus = $("conn-status")
const verboseSection = $("verbose-section")
const verboseLog = $<HTMLPreElement>("verbose-log")
const verboseCount = $("verbose-count")
const verboseFilter = $<HTMLInputElement>("verbose-filter")
const togglePinVerbose = $<HTMLInputElement>("toggle-pin-verbose")
const toggleVerbose = $<HTMLInputElement>("toggle-verbose")
const btnClearVerbose = $<HTMLButtonElement>("btn-clear-verbose")
const welcomeSection = $("welcome-section")
const welcomeContent = $("welcome-content")
const mainEl = document.querySelector("main") as HTMLElement
const scriptUrls = new Map<string, string>()
let inspectorUrl = ""
let connectionState: ConnectionState = "connecting"
let connectionError: string | null = null
let verboseEvents = 0
const VERBOSE_MAX = 1000

const targetState = {
  state: "idle" as "idle" | "starting" | "running" | "exited" | "failed",
  pid: null as number | null,
  exitCode: null as number | null,
  startedAt: null as string | null,
  exitedAt: null as string | null,
}

const buttons = {
  pause: $<HTMLButtonElement>("btn-pause"),
  resume: $<HTMLButtonElement>("btn-resume"),
  stepOver: $<HTMLButtonElement>("btn-step-over"),
  stepInto: $<HTMLButtonElement>("btn-step-into"),
  stepOut: $<HTMLButtonElement>("btn-step-out"),
  eval: $<HTMLButtonElement>("btn-eval"),
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
      inspectorUrlBadge.textContent = msg.inspectorUrl
      for (const s of msg.scripts) scriptUrls.set(s.scriptId, s.url)
      applyConnection(msg.connection)
      if (msg.paused && msg.dump !== null) {
        currentDump = msg.dump
        renderDump(msg.dump)
        setRunStatus("paused", "paused")
      } else if (connectionState === "connected") {
        setRunStatus("running", "live")
      } else {
        setRunStatus("waiting")
      }
      refreshWelcome()
      return
    case "state":
      currentDump = msg.dump
      renderDump(msg.dump)
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      hideWelcome()
      return
    case "resumed":
      currentDump = undefined
      framesList.innerHTML = ""
      scopesContainer.innerHTML = `<div class="muted">running…</div>`
      sourceView.innerHTML = ""
      sourceLoc.textContent = ""
      setRunStatus("running", "live")
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
}

function applyConnection(info: ConnectionInfo): void {
  const previous = connectionState
  connectionState = info.state
  connectionError = info.error
  const cls = info.state === "connected" ? "connected"
    : info.state === "connecting" ? "connecting"
    : "disconnected"
  connStatus.textContent = `inspector: ${info.state}`
  connStatus.className = `badge ${cls}`
  if (info.state !== "connected") {
    setRunStatus("waiting")
    // Любая информация в UI устарела как только инспектор отвалился: очищаем
    // frames/scopes/source/dump и сбрасываем кэш скриптов. Console и verbose
    // оставляем — они логи, не state.
    if (previous === "connected" || currentDump !== undefined) {
      clearLiveState()
    }
  }
}

function clearLiveState(): void {
  currentDump = undefined
  activeFrameIndex = 0
  framesList.innerHTML = ""
  scopesContainer.innerHTML = `<div class="muted">inspector disconnected — данные устарели</div>`
  sourceView.innerHTML = ""
  sourceLoc.textContent = ""
  scriptUrls.clear()
  sourceCache.clear()
}

function hideWelcome(): void {
  welcomeSection.hidden = true
  mainEl.classList.remove("welcome")
}

function refreshWelcome(): void {
  if (connectionState === "connected" || currentDump !== undefined) {
    hideWelcome()
    return
  }
  welcomeSection.hidden = false
  mainEl.classList.add("welcome")
  welcomeContent.innerHTML = renderWelcome()
  bindWelcomeApply()
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
  const status = document.getElementById("welcome-target-status")
  if (status !== null) status.textContent = describeTargetStatus()
}

async function startTargetFromCmd(rawCmd: string): Promise<void> {
  const cmd = rawCmd.trim()
  if (cmd.length === 0) return
  localStorage.setItem("bd:target:cmd", cmd)
  const command = parseShellArgs(cmd)
  if (command.length === 0) return

  const pauseOnStart = (document.getElementById("welcome-cmd-brk") as HTMLInputElement | null)?.checked ?? false
  localStorage.setItem("bd:target:brk", pauseOnStart ? "1" : "0")

  targetState.state = "starting"
  const status = document.getElementById("welcome-target-status")
  if (status !== null) status.textContent = pauseOnStart ? "starting (pause on start)…" : "starting…"
  try {
    const res = await fetch("/target/run", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({command, pauseOnStart}),
    })
    const data = await res.json() as {ok: boolean; error?: string; snapshot?: {pid: number; state: string}}
    if (!data.ok) {
      targetState.state = "failed"
      if (status !== null) status.textContent = `spawn failed: ${data.error ?? "unknown"}`
      return
    }
    if (data.snapshot !== undefined) {
      targetState.pid = data.snapshot.pid
    }
  } catch (error) {
    targetState.state = "failed"
    if (status !== null) status.textContent = `fetch failed: ${String(error)}`
  }
}

async function stopTarget(): Promise<void> {
  try {
    await fetch("/target/stop", {method: "POST"})
  } catch {}
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
    runBtn.addEventListener("click", () => void startTargetFromCmd(cmdInput.value))
    cmdInput.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        void startTargetFromCmd(cmdInput.value)
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
  const filter = verboseFilter.value.trim()
  if (filter.length > 0 && !matchFilter(name, filter)) return

  verboseEvents += 1
  verboseCount.textContent = `(${verboseEvents})`
  const row = document.createElement("div")
  row.className = `row ${kind}`
  const safePayload = payload === undefined ? "" : escapeHtml(truncate(JSON.stringify(payload), 280))
  row.innerHTML = `<span class="ts">${escapeHtml(ts.slice(11, 23))}</span><span class="method">${kind === "agent" ? "@" : ""}${escapeHtml(name)}</span> <span class="params">${safePayload}</span>`
  verboseLog.appendChild(row)

  while (verboseLog.childElementCount > VERBOSE_MAX) {
    verboseLog.firstElementChild?.remove()
  }

  if (togglePinVerbose.checked) verboseLog.scrollTop = verboseLog.scrollHeight
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
  wsStatus.textContent = `ws: ${text}`
  wsStatus.className = `badge${kind ? ` ${kind}` : ""}`
}

function setRunStatus(text: string, kind: "" | "live" | "paused" = ""): void {
  runStatus.textContent = `run: ${text}`
  runStatus.className = `badge${kind ? ` ${kind}` : ""}`
}

function renderDump(dump: AgentDump): void {
  framesList.innerHTML = ""
  for (const frame of dump.frames) {
    const li = document.createElement("li")
    if (frame.index === activeFrameIndex) li.classList.add("active")
    const fn = frame.function || "<anonymous>"
    const loc = frame.url ? `${shortenUrl(frame.url)}:${frame.line}` : `(scriptId ?):${frame.line}`
    li.innerHTML = `<span class="fn">${escapeHtml(fn)}</span><span class="loc">${escapeHtml(loc)}</span>`
    li.addEventListener("click", () => {
      activeFrameIndex = frame.index
      evalFrame.value = String(frame.index)
      renderDump(dump)
    })
    framesList.appendChild(li)
  }

  const top = dump.frames[activeFrameIndex] ?? dump.frames[0]
  if (top !== undefined) {
    renderScopes(top)
    void renderSourceForFrame(top)
  }
}

async function renderSourceForFrame(frame: FrameSnapshot): Promise<void> {
  const scriptId = frame.scriptId
  if (scriptId === undefined) {
    sourceView.innerHTML = `<div class="muted" style="padding:8px">scriptId недоступен для этого фрейма</div>`
    sourceLoc.textContent = ""
    return
  }
  sourceLoc.textContent = `${frame.url || "scriptId=" + scriptId}:${frame.line}`

  let src = sourceCache.get(scriptId)
  if (src === undefined) {
    sourceView.innerHTML = `<div class="muted" style="padding:8px">loading…</div>`
    try {
      const res = await fetch(`/source?scriptId=${encodeURIComponent(scriptId)}`)
      const data = await res.json() as {scriptSource?: string; error?: string}
      if (typeof data.scriptSource !== "string") {
        sourceView.innerHTML = `<div class="muted" style="padding:8px">no source: ${escapeHtml(data.error ?? "unknown")}</div>`
        return
      }
      src = data.scriptSource
      sourceCache.set(scriptId, src)
    } catch (error) {
      sourceView.innerHTML = `<div class="muted" style="padding:8px">fetch failed: ${escapeHtml(String(error))}</div>`
      return
    }
  }

  const lines = src.split("\n")
  const html: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const isCurrent = lineNo === frame.line
    const cls = isCurrent ? "src-line current" : "src-line"
    const num = String(lineNo).padStart(4, " ")
    html.push(`<span class="${cls}" data-line="${lineNo}"><span class="src-num">${num}</span>${escapeHtml(lines[i] ?? "")}</span>`)
  }
  sourceView.innerHTML = html.join("\n")

  const cur = sourceView.querySelector(".src-line.current") as HTMLElement | null
  if (cur !== null) {
    sourceView.scrollTop = Math.max(0, cur.offsetTop - sourceView.clientHeight / 3)
  }
}

function renderScopes(frame: FrameSnapshot): void {
  scopesContainer.innerHTML = ""
  const groups: Array<[string, ScopeSnapshot[]]> = [
    ["local", frame.scopes.local],
    ["closure", frame.scopes.closure],
  ]
  for (const [groupName, scopes] of groups) {
    if (scopes.length === 0) continue
    for (const scope of scopes) {
      const details = document.createElement("details")
      details.open = groupName === "local" || scope.name !== undefined
      const summary = document.createElement("summary")
      const propCount = Object.keys(scope.properties).length
      const label = scope.name !== undefined
        ? `${groupName} [${scope.name}] (${propCount})`
        : `${groupName} (${propCount})`
      summary.textContent = label
      details.appendChild(summary)

      const props = document.createElement("div")
      props.className = "props"
      for (const [name, value] of Object.entries(scope.properties)) {
        const row = document.createElement("div")
        row.className = "prop"
        const nameSpan = document.createElement("span")
        nameSpan.className = "name"
        nameSpan.textContent = name
        const valueSpan = document.createElement("span")
        valueSpan.className = `value ${valueClass(value)}`
        valueSpan.textContent = renderValue(value)
        row.appendChild(nameSpan)
        row.appendChild(valueSpan)
        props.appendChild(row)
      }
      details.appendChild(props)
      scopesContainer.appendChild(details)
    }
  }
  if (scopesContainer.childElementCount === 0) {
    scopesContainer.innerHTML = `<div class="muted">no scopes for this frame</div>`
  }
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
  const row = document.createElement("div")
  row.className = `row${entry.level ? ` ${entry.level}` : ""}`
  row.innerHTML = `<span class="ts">${escapeHtml(entry.ts)}</span>${escapeHtml(entry.text)}`
  consoleLog.appendChild(row)
  consoleLog.scrollTop = consoleLog.scrollHeight
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

buttons.pause.addEventListener("click", () => void send("pause"))
buttons.resume.addEventListener("click", () => void send("resume"))
buttons.stepOver.addEventListener("click", () => void send("step", {kind: "over"}))
buttons.stepInto.addEventListener("click", () => void send("step", {kind: "into"}))
buttons.stepOut.addEventListener("click", () => void send("step", {kind: "out"}))

buttons.eval.addEventListener("click", async () => {
  const expr = evalInput.value.trim()
  if (expr.length === 0) return
  const frame = Number(evalFrame.value) || 0
  evalOutput.textContent = "…"
  const response = await send("eval", {frame, expr})
  evalOutput.textContent = JSON.stringify(response, null, 2)
})

evalInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault()
    buttons.eval.click()
  }
})

toggleVerbose.addEventListener("change", () => {
  const on = toggleVerbose.checked
  verboseSection.hidden = !on
  if (on) mainEl.classList.add("with-verbose")
  else mainEl.classList.remove("with-verbose")
  localStorage.setItem("bd:verbose", on ? "1" : "0")
})

btnClearVerbose.addEventListener("click", () => {
  verboseLog.innerHTML = ""
  verboseEvents = 0
  verboseCount.textContent = ""
})

verboseFilter.addEventListener("input", () => {
  localStorage.setItem("bd:verbose:filter", verboseFilter.value)
})

const persistedVerbose = localStorage.getItem("bd:verbose")
if (persistedVerbose === "1") {
  toggleVerbose.checked = true
  verboseSection.hidden = false
  mainEl.classList.add("with-verbose")
}
const persistedFilter = localStorage.getItem("bd:verbose:filter")
if (persistedFilter !== null) verboseFilter.value = persistedFilter

connect()
