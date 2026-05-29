import {UiRuntime, UiSurface} from "@ui/elements"
import {Button, Pane, autoButtonWidth} from "@ui/components"
import {TerminalPane, type TerminalInputSource, type TerminalSize, type TerminalStatusKind} from "@ui/panes"
import type {PtyClientMessage, PtyServerMessage, PtyStatusKind, PtyTerminalSize} from "./protocol.ts"

const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null
if (canvas === null) throw new Error("stage-canvas not found")

const ui = await UiRuntime.create(canvas)
let socket: WebSocket | null = null
let terminalSize: TerminalSize | null = null
let connectionState: PtyStatusKind = "idle"
let dock: PtyDockPane

const terminal = new TerminalPane({
  title: "PTY Terminal",
  status: "connecting",
  statusKind: "idle",
  fontPx: 13,
  linePx: 18,
  maxScrollback: 10000,
  cursorLineHighlight: true,
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
  dock.setBusy(true)

  const nextSocket = new WebSocket(websocketURL())
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

function websocketURL(): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${location.host}/terminal`
}

function sendInput(data: string, source: TerminalInputSource): void {
  send({type: "input.write", data, source})
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
    terminal.write(message.data)
    return
  }

  if (message.type === "terminal.ready") {
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
      clear: () => void
      size: () => PtyTerminalSize | null
    }
  }
}

window.__metaforPty = {
  terminal,
  reconnect: () => connect(true),
  clear: () => terminal.clear(),
  size: () => terminalSize,
}
