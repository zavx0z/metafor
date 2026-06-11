import {UiRuntime, UiSurface} from "@ui/elements"
import {Button, Pane, autoButtonWidth} from "@ui/components"
import {TerminalPane, type TerminalInputSource, type TerminalSize, type TerminalStatusKind} from "@ui/panes"
import type {PtyClientMessage, PtyServerMessage, PtyStatusKind, PtyTerminalSize, PtyTerminalState} from "./protocol.ts"

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")

const ui = await UiRuntime.create(canvas)
const SESSION_STORAGE_KEY = "metafor.pty.sessionId"
let socket: WebSocket | null = null
let terminalSize: TerminalSize | null = null
let connectionState: PtyStatusKind = "idle"
let sessionId = readStoredSessionId()
let terminalState: PtyTerminalState | null = null
let localEchoId = 0
let dock: PtyDockPane

const terminal = new TerminalPane({
  title: "PTY Terminal",
  status: "connecting",
  statusKind: "idle",
  fontPx: 13,
  linePx: 18,
  maxScrollback: 10000,
  respondToTerminalQueries: false,
  onInput: (data, source) => sendInput(data, source),
  onResize: (size) => {
    terminalSize = size
    send({type: "terminal.resize", size})
  },
})

function connect(userInitiated: boolean): void {
  if (socket !== null) {
    socket.close()
    socket = null
  }

  if (userInitiated) {
    terminal.writeln("\x1b[90mreconnecting PTY...\x1b[0m")
  }

  setTerminalStatus("idle", "connecting")
  terminal.setInputEnabled(false)
  terminal.rejectLocalEcho()
  terminalState = null
  dock.setBusy(true)

  const nextSocket = new WebSocket(websocketURL({replay: !userInitiated}))
  socket = nextSocket

  nextSocket.addEventListener("open", () => {
    if (socket !== nextSocket) return
    setTerminalStatus("connected", "connected")
    terminal.setInputEnabled(true)
    dock.setBusy(false)
    if (terminalSize !== null) send({type: "terminal.resize", size: terminalSize})
    terminal.focus()
  })

  nextSocket.addEventListener("message", (event) => {
    if (socket !== nextSocket) return
    handleServerMessage(event)
  })

  nextSocket.addEventListener("close", () => {
    if (socket !== nextSocket) return
    socket = null
    dock.setBusy(false)
    terminal.setInputEnabled(false)
    if (connectionState !== "error" && connectionState !== "disconnected") {
      setTerminalStatus("disconnected", "closed")
    }
  })

  nextSocket.addEventListener("error", () => {
    if (socket !== nextSocket) return
    dock.setBusy(false)
    terminal.setInputEnabled(false)
    setTerminalStatus("error", "websocket")
  })
}

function websocketURL(opts: {replay: boolean}): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  const url = new URL(`${protocol}//${location.host}/terminal`)
  url.searchParams.set("replay", opts.replay ? "1" : "0")
  if (sessionId !== null) url.searchParams.set("session", sessionId)
  return url.toString()
}

function sendInput(data: string, source: TerminalInputSource): void {
  const nextLocalEchoId = tryLocalEcho(data, source) ? ++localEchoId : undefined
  send({
    type: "input.write",
    data,
    source,
    ...(nextLocalEchoId === undefined ? {} : {localEchoId: nextLocalEchoId}),
  })
}

function tryLocalEcho(data: string, source: TerminalInputSource): boolean {
  const serverState = terminalState
  const clientState = terminal.getTerminalState()
  if (
    source !== "keyboard" ||
    socket?.readyState !== WebSocket.OPEN ||
    serverState === null ||
    !serverState.localEcho ||
    !clientState.localEcho
  ) return false
  return terminal.tryLocalEcho(data)
}

function send(message: PtyClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message))
  }
}

function handleServerMessage(event: MessageEvent<string>): void {
  const message = parseServerMessage(event.data)
  if (message === null) return

  if (message.type === "terminal.write") {
    terminal.writeAuthoritative(message.data)
    if (message.state !== undefined) terminalState = message.state
    return
  }

  if (message.type === "terminal.state") {
    terminalState = message.state
    return
  }

  if (message.type === "terminal.local-echo") {
    terminalState = message.state
    if (!message.accepted) terminal.rejectLocalEcho()
    return
  }

  if (message.type === "terminal.ready") {
    sessionId = message.sessionId
    terminalState = message.state
    writeStoredSessionId(sessionId)
    setTerminalStatus("connected", shellLabel(message.shell))
    if (terminalSize !== null) send({type: "terminal.resize", size: terminalSize})
    return
  }

  if (message.type === "terminal.status") {
    setTerminalStatus(message.status.kind, message.status.label)
    return
  }

  if (message.type === "terminal.exit") {
    setTerminalStatus("disconnected", "exited")
    terminal.setInputEnabled(false)
    terminal.writeln(`\x1b[90mprocess exited: code=${message.code ?? "null"} signal=${message.signal ?? "null"}\x1b[0m`)
    return
  }

  setTerminalStatus("error", "error")
  terminal.setInputEnabled(false)
  terminal.writeln(`\x1b[31m${message.message}\x1b[0m`)
}

function parseServerMessage(raw: string): PtyServerMessage | null {
  try {
    const value = JSON.parse(raw) as PtyServerMessage
    if (typeof value === "object" && value !== null && "type" in value) return value
  } catch {
    return null
  }
  return null
}

function setTerminalStatus(kind: PtyStatusKind, label: string): void {
  connectionState = kind
  terminal.setStatus(statusKindForPane(kind), label)
  dock.setStatus(kind, label)
}

function statusKindForPane(kind: PtyStatusKind): TerminalStatusKind {
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

function readStoredSessionId(): string | null {
  try {
    const value = localStorage.getItem(SESSION_STORAGE_KEY)
    return value === null || value.length < 8 ? null : value
  } catch {
    return null
  }
}

function writeStoredSessionId(value: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, value)
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function forgetStoredSessionId(): void {
  sessionId = null
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Storage can be disabled in private contexts.
  }
}

function terminalRect(w: number, h: number): {x: number; y: number; w: number; h: number} {
  const pad = layoutPad(w)
  const dockH = dockHeight(w)
  const gap = 12
  return {
    x: pad,
    y: pad,
    w: Math.max(1, w - pad * 2),
    h: Math.max(120, h - pad * 2 - dockH - gap),
  }
}

function dockRect(w: number, h: number): {x: number; y: number; w: number; h: number} {
  const pad = layoutPad(w)
  const dockH = dockHeight(w)
  return {
    x: pad,
    y: Math.max(pad, h - pad - dockH),
    w: Math.max(1, w - pad * 2),
    h: dockH,
  }
}

function layoutPad(width: number): number {
  return width < 720 ? 10 : 16
}

function dockHeight(width: number): number {
  return width < 720 ? 54 : 62
}

type PtyDockPaneOpts = {
  onReconnect: () => void
  onClear: () => void
  onFocus: () => void
}

class PtyDockPane extends UiSurface {
  readonly #onReconnect: () => void
  readonly #onClear: () => void
  readonly #onFocus: () => void
  #statusKind: PtyStatusKind = "idle"
  #statusLabel = "connecting"
  #busy = false

  constructor(opts: PtyDockPaneOpts) {
    super({bgColor: null, borderColor: null})
    this.node.name = "PtyDockPane"
    this.#onReconnect = opts.onReconnect
    this.#onClear = opts.onClear
    this.#onFocus = opts.onFocus
  }

  setStatus(kind: PtyStatusKind, label: string): void {
    if (this.#statusKind === kind && this.#statusLabel === label) return
    this.#statusKind = kind
    this.#statusLabel = label
    this.requestRender()
  }

  setBusy(busy: boolean): void {
    if (this.#busy === busy) return
    this.#busy = busy
    this.requestRender()
  }

  protected render(): void {
    Pane(this, 0, 0, this.rectW, this.rectH, {
      variant: "glass",
      sx: {background: "rgba(8, 13, 22, 0.72)", borderColor: "rgba(214, 231, 255, 0.20)", borderRadius: 24, padding: 0},
    })

    const status = `${this.#statusKind}: ${this.#statusLabel}`
    this.drawText(status, 22, this.rectH / 2 - 7, {
      fontPx: 12,
      material: statusMaterial(this, this.#statusKind),
      maxWidthPx: Math.max(1, this.rectW - 390),
    })

    const gap = 10
    const focusW = Math.max(84, autoButtonWidth(this, "Focus", 11, 24))
    const clearW = Math.max(84, autoButtonWidth(this, "Clear", 11, 24))
    const reconnectW = Math.max(118, autoButtonWidth(this, this.#busy ? "Connecting" : "Reconnect", 11, 24))
    const totalW = focusW + clearW + reconnectW + gap * 2
    let x = Math.max(22, this.rectW - totalW - 22)
    const y = Math.max(10, (this.rectH - 34) / 2)

    Button(this, x, y, focusW, 34, {
      children: "Focus",
      variant: "outlined",
      color: "neutral",
      fontPx: 11,
      radius: 999,
      onClick: this.#onFocus,
    })
    x += focusW + gap
    Button(this, x, y, clearW, 34, {
      children: "Clear",
      variant: "outlined",
      color: "neutral",
      fontPx: 11,
      radius: 999,
      onClick: this.#onClear,
    })
    x += clearW + gap
    Button(this, x, y, reconnectW, 34, {
      children: this.#busy ? "Connecting" : "Reconnect",
      variant: this.#busy ? "outlined" : "contained",
      color: this.#statusKind === "error" ? "error" : "primary",
      disabled: this.#busy,
      fontPx: 11,
      radius: 999,
      onClick: this.#onReconnect,
    })
  }
}

function statusMaterial(surface: UiSurface, kind: PtyStatusKind) {
  if (kind === "connected") return surface.materials.green
  if (kind === "running") return surface.materials.cyan
  if (kind === "error" || kind === "disconnected") return surface.materials.error
  return surface.materials.muted
}

dock = new PtyDockPane({
  onReconnect: () => connect(true),
  onClear: () => {
    terminal.clear()
    send({type: "terminal.clear"})
    terminal.focus()
  },
  onFocus: () => terminal.focus(),
})

ui.addSurface(terminal, ({w, h}) => terminalRect(w, h))
ui.addSurface(dock, ({w, h}) => dockRect(w, h))
ui.handleResize()

const resizeObserver = new ResizeObserver(() => ui.handleResize())
resizeObserver.observe(canvas)
window.addEventListener("resize", () => ui.handleResize())
window.addEventListener("beforeunload", () => socket?.close())

connect(false)

declare global {
  interface Window {
    __metaforPty?: {
      terminal: TerminalPane
      reconnect: () => void
      newSession: () => void
      clear: () => void
      size: () => PtyTerminalSize | null
    }
  }
}

window.__metaforPty = {
  terminal,
  reconnect: () => connect(true),
  newSession: () => {
    forgetStoredSessionId()
    terminal.clear()
    connect(false)
  },
  clear: () => {
    terminal.clear()
    send({type: "terminal.clear"})
  },
  size: () => terminalSize,
}
