/**
 * UI клиента: коннектится к WebSocket /ws того же сервера, рендерит state.
 * Команды (eval, step, resume, pause, props) шлёт через тот же WS как
 * `{type:"command", cmd, params, requestId}` — сервер отвечает `{type:"result", requestId, ok, result|error}`.
 */

type ServerMessage =
  | {type: "hello"; inspectorUrl: string; paused: boolean; dump: AgentDump | null}
  | {type: "state"; dump: AgentDump}
  | {type: "resumed"}
  | {type: "console"; entries: ConsoleEntry[]}
  | {type: "result"; requestId: number; ok: boolean; result?: unknown; error?: string}

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
      inspectorUrlBadge.textContent = msg.inspectorUrl
      if (msg.paused && msg.dump !== null) {
        currentDump = msg.dump
        renderDump(msg.dump)
        setRunStatus("paused", "paused")
      } else {
        setRunStatus("running", "live")
      }
      return
    case "state":
      currentDump = msg.dump
      renderDump(msg.dump)
      setRunStatus(`paused (${msg.dump.reason})`, "paused")
      return
    case "resumed":
      currentDump = undefined
      framesList.innerHTML = ""
      scopesContainer.innerHTML = `<div class="muted">running…</div>`
      setRunStatus("running", "live")
      return
    case "console":
      for (const entry of msg.entries) appendConsole(entry)
      return
    case "result":
      pendingRequests.get(msg.requestId)?.(msg)
      pendingRequests.delete(msg.requestId)
      return
  }
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

connect()
