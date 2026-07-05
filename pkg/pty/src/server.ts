import {basename, join} from "node:path"
import type {ServerWebSocket, Subprocess} from "bun"
import type {PtyClientMessage, PtyServerMessage, PtyTerminalSize, PtyTerminalState} from "./protocol.ts"

export type {PtyClientMessage, PtyInputSource, PtyServerMessage, PtyStatusKind, PtyTerminalSize, PtyTerminalState} from "./protocol.ts"

export type PtySocketData = {
  session?: TerminalSession
  sessionId?: string
  sessionKey?: string
  replay: boolean
  connectedAt: number
}

export type PtyDaemonProxySocketData = {
  ptydTerminalUrl: string
  ptydProxy?: PtyDaemonProxy
}

export type PtyServerOptions = {
  hostname?: string
  port?: number
  shell?: string
  cwd?: string
  defaultSize?: PtyTerminalSize
  maxCols?: number
  maxRows?: number
  maxSessions?: number
  sessionTtlMs?: number
  scrollbackBytes?: number
  entryPath?: string
  stylePath?: string
  indexPath?: string
  fontPath?: string
}

export type PtySessionInfo = {
  id: string
  key: string | null
  shell: string
  cwd: string
  size: PtyTerminalSize
  clients: number
  createdAt: number
  updatedAt: number
  detachedAt: number | null
  exited: boolean
  scrollbackBytes: number
}

type PtyRuntimeOptions = Required<PtyServerOptions>
type PtyHttpServer = ReturnType<typeof Bun.serve<PtySocketData>>
type PtyDaemonProxyPayload = string | ArrayBuffer
type PtyDaemonProxyInput = string | ArrayBuffer | Uint8Array

export type PtyDaemonProxy = {
  upstream: WebSocket
  connected: boolean
  pending: PtyDaemonProxyPayload[]
}

export type PtyDaemonEnsureOptions = {
  baseUrl?: string
  cwd?: string
  command?: string[]
  healthTimeoutMs?: number
  startupTimeoutMs?: number
  log?: (message: string) => void
}

const DEFAULT_SIZE: PtyTerminalSize = {cols: 80, rows: 24}
const DEFAULT_MAX_COLS = 300
const DEFAULT_MAX_ROWS = 120
const DEFAULT_MAX_SESSIONS = 8
const DEFAULT_SESSION_TTL_MS = 30 * 60_000
const DEFAULT_SCROLLBACK_BYTES = 2 * 1024 * 1024
const DEFAULT_PTYD_HOST = "127.0.0.1"
const DEFAULT_PTYD_PORT = 6520
const DEFAULT_PTYD_SESSION_TTL_MS = 24 * 60 * 60_000
const DEFAULT_PTYD_HEALTH_TIMEOUT_MS = 800
const DEFAULT_PTYD_STARTUP_TIMEOUT_MS = 4_000
const TERMIOS_ECHO = 0x00000008
const DEFAULT_TERM_PROGRAM = "iTerm.app"
const DEFAULT_TERM_PROGRAM_VERSION = "3.5"
const DEFAULT_COLORFGBG = "15;0"
const DEFAULT_OSC_FOREGROUND = "rgb:d7dd/e8ff/fbff"
const DEFAULT_OSC_BACKGROUND = "rgb:0e10/151a/20ff"
const DEFAULT_OSC_CURSOR = "rgb:94e2/d5ff/ffff"

let buildAssets = new Map<string, Blob>()
let ptyDaemonEnsurePromise: Promise<void> | null = null

export class PtySessionManager {
  readonly #sessions = new Map<string, TerminalSession>()
  readonly #sessionsByKey = new Map<string, TerminalSession>()
  readonly #options: PtyRuntimeOptions

  constructor(options: PtyRuntimeOptions) {
    this.#options = options
  }

  attach(ws: ServerWebSocket<PtySocketData>): TerminalSession {
    const requestedKey = normalizeSessionKey(ws.data.sessionKey)
    const requestedId = normalizeSessionId(ws.data.sessionId)
    const existingByKey = requestedKey === null ? undefined : this.#sessionsByKey.get(requestedKey)
    if (existingByKey !== undefined && !existingByKey.exited) {
      existingByKey.attach(ws, ws.data.replay)
      return existingByKey
    }
    const existing = requestedKey !== null || requestedId === null ? undefined : this.#sessions.get(requestedId)
    if (existing !== undefined && !existing.exited) {
      existing.attach(ws, ws.data.replay)
      return existing
    }

    this.#evictDetachedIfNeeded()
    const session = new TerminalSession(
      this.#options,
      (id, key) => {
        this.#sessions.delete(id)
        if (key !== null) this.#sessionsByKey.delete(key)
      },
      {
        key: requestedKey,
      },
    )
    this.#sessions.set(session.id, session)
    if (session.key !== null) this.#sessionsByKey.set(session.key, session)
    session.attach(ws, false)
    return session
  }

  list(): PtySessionInfo[] {
    return [...this.#sessions.values()].map((session) => session.info())
  }

  close(id: string): boolean {
    const session = this.#sessions.get(id)
    if (session === undefined) return false
    session.close()
    this.#sessions.delete(id)
    if (session.key !== null) this.#sessionsByKey.delete(session.key)
    return true
  }

  #evictDetachedIfNeeded(): void {
    if (this.#sessions.size < this.#options.maxSessions) return
    const candidates = [...this.#sessions.values()]
      .filter((session) => session.clientCount === 0)
      .sort((a, b) => (a.detachedAt ?? a.updatedAt) - (b.detachedAt ?? b.updatedAt))

    for (const session of candidates) {
      if (this.#sessions.size < this.#options.maxSessions) return
      session.close()
      this.#sessions.delete(session.id)
    }
  }
}

export function createPtySessionManager(options: PtyServerOptions = {}): PtySessionManager {
  return new PtySessionManager(normalizeOptions(options))
}

export function ptyDaemonBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.METAFOR_PTYD_URL?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit
  const host = env.METAFOR_PTYD_HOST?.trim() || DEFAULT_PTYD_HOST
  const port = Number(env.METAFOR_PTYD_PORT ?? DEFAULT_PTYD_PORT)
  return `http://${host}:${Number.isFinite(port) ? port : DEFAULT_PTYD_PORT}`
}

export function ptyDaemonTerminalUrlFromRequest(reqUrl: string | URL, baseUrl = ptyDaemonBaseUrl()): string {
  const source = typeof reqUrl === "string" ? new URL(reqUrl) : reqUrl
  const target = new URL("/terminal", baseUrl)
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:"
  const replay = source.searchParams.get("replay")
  target.searchParams.set("replay", replay ?? "1")
  copySearchParam(source, target, "key")
  copySearchParam(source, target, "session")
  return target.toString()
}

export async function ensurePtyDaemon(options: PtyDaemonEnsureOptions = {}): Promise<void> {
  const baseUrl = options.baseUrl ?? ptyDaemonBaseUrl()
  if (await ptyDaemonHealthy(baseUrl, options.healthTimeoutMs)) return
  ptyDaemonEnsurePromise ??= startPtyDaemon(baseUrl, options).finally(() => {
    ptyDaemonEnsurePromise = null
  })
  await ptyDaemonEnsurePromise
}

export function attachPtyDaemonProxy(ws: ServerWebSocket<PtyDaemonProxySocketData>): PtyDaemonProxy {
  const upstream = new WebSocket(ws.data.ptydTerminalUrl)
  const proxy: PtyDaemonProxy = {upstream, connected: false, pending: []}
  ws.data.ptydProxy = proxy

  upstream.addEventListener("open", () => {
    proxy.connected = true
    const pending = proxy.pending.splice(0)
    for (const item of pending) upstream.send(item)
  })
  upstream.addEventListener("message", (event) => {
    if (ws.readyState !== WebSocket.OPEN) return
    const data = event.data
    if (typeof data === "string" || data instanceof ArrayBuffer) {
      ws.send(data)
      return
    }
    if (data instanceof Uint8Array) {
      ws.send(uint8ArrayToArrayBuffer(data))
      return
    }
    if (data instanceof Blob) {
      void data.arrayBuffer().then((buffer) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(buffer)
      })
    }
  })
  upstream.addEventListener("error", () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: "terminal.error", message: "ptyd websocket error"} satisfies PtyServerMessage))
      ws.close(1011, "ptyd websocket error")
    }
  })
  upstream.addEventListener("close", (event) => {
    if (ws.readyState === WebSocket.OPEN) ws.close(event.code || 1001, event.reason || "ptyd closed")
  })

  return proxy
}

export function relayPtyDaemonProxyMessage(ws: ServerWebSocket<PtyDaemonProxySocketData>, message: PtyDaemonProxyInput): void {
  const proxy = ws.data.ptydProxy
  if (proxy === undefined) return
  const payload = normalizePtyDaemonProxyPayload(message)
  if (proxy.connected && proxy.upstream.readyState === WebSocket.OPEN) {
    proxy.upstream.send(payload)
    return
  }
  if (proxy.pending.length < 256) proxy.pending.push(payload)
}

export function detachPtyDaemonProxy(ws: ServerWebSocket<PtyDaemonProxySocketData>): void {
  const proxy = ws.data.ptydProxy
  delete ws.data.ptydProxy
  if (proxy === undefined) return
  proxy.pending.length = 0
  if (proxy.upstream.readyState === WebSocket.OPEN || proxy.upstream.readyState === WebSocket.CONNECTING) {
    proxy.upstream.close(1000, "client closed")
  }
}

export class TerminalSession {
  readonly #decoder = new TextDecoder()
  readonly #proc: Subprocess<"ignore", "ignore", "ignore">
  readonly #terminal: Bun.Terminal
  readonly #clients = new Set<ServerWebSocket<PtySocketData>>()
  readonly #options: PtyRuntimeOptions
  readonly #onDispose: (id: string, key: string | null) => void
  readonly #scrollback: string[] = []
  readonly #stateTracker = new PtyTerminalStateTracker()
  readonly #probeResponder = new PtyTerminalProbeResponder((data) => this.write(data))
  readonly #key: string | null
  readonly id = crypto.randomUUID()
  readonly createdAt = Date.now()
  #disposeTimer: ReturnType<typeof setTimeout> | null = null
  #disposed = false
  #exited = false
  #size: PtyTerminalSize
  #scrollbackBytes = 0
  #updatedAt = this.createdAt
  #detachedAt: number | null = null

  constructor(options: PtyRuntimeOptions, onDispose: (id: string, key: string | null) => void, sessionOptions: {key?: string | null} = {}) {
    this.#options = options
    this.#onDispose = onDispose
    this.#key = sessionOptions.key ?? null
    this.#size = clampSize(options.defaultSize, options)
    this.#proc = Bun.spawn(this.#spawnCommand(), {
      cwd: options.cwd,
      env: terminalEnv(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      terminal: {
        cols: this.#size.cols,
        rows: this.#size.rows,
        name: "xterm-256color",
        data: (_terminal, data) => {
          this.#write(this.#decoder.decode(data, {stream: true}))
        },
        exit: (_terminal, exitCode, signal) => {
          const tail = this.#decoder.decode()
          if (tail) this.#write(tail)
          this.#exited = true
          this.#send({
            type: "terminal.status",
            status: {kind: "disconnected", label: signal ?? `closed ${exitCode}`},
          })
        },
      },
    })

    if (!this.#proc.terminal) {
      throw new Error("Bun did not attach a PTY to the shell process")
    }

    this.#terminal = this.#proc.terminal

    this.#proc.exited
      .then((code) => {
        this.#exited = true
        this.#send({type: "terminal.exit", code, signal: null})
        this.#scheduleDispose()
      })
      .catch((error) => {
        this.#exited = true
        this.#send({
          type: "terminal.error",
          message: error instanceof Error ? error.message : "terminal process failed",
        })
        this.#scheduleDispose()
      })
  }

  get clientCount(): number {
    return this.#clients.size
  }

  get key(): string | null {
    return this.#key
  }

  get detachedAt(): number | null {
    return this.#detachedAt
  }

  get exited(): boolean {
    return this.#exited
  }

  get size(): PtyTerminalSize {
    return this.#size
  }

  get updatedAt(): number {
    return this.#updatedAt
  }

  attach(ws: ServerWebSocket<PtySocketData>, replay: boolean): void {
    this.#clearDisposeTimer()
    const restored = this.#detachedAt !== null || this.#clients.size > 0
    this.#detachedAt = null
    this.#clients.add(ws)
    ws.data.session = this
    ws.data.sessionId = this.id

    send(ws, {
      type: "terminal.ready",
      shell: this.#programLabel(),
      size: this.#size,
      sessionId: this.id,
      restored,
      replayBytes: replay ? this.#scrollbackBytes : 0,
      state: this.#terminalState(),
    })
    send(ws, {
      type: "terminal.status",
      status: {kind: this.#exited ? "disconnected" : "connected", label: this.#statusLabel(restored)},
    })
    if (replay && this.#scrollback.length > 0) {
      send(ws, {type: "terminal.write", data: this.#scrollback.join("")})
    }
  }

  detach(ws: ServerWebSocket<PtySocketData>): void {
    this.#clients.delete(ws)
    if (this.#clients.size === 0) {
      this.#detachedAt = Date.now()
      this.#scheduleDispose()
    }
  }

  write(data: string): void {
    if (!this.#disposed && !this.#terminal.closed && !this.#exited) {
      this.#terminal.write(data)
      this.#updatedAt = Date.now()
    }
  }

  writeInput(ws: ServerWebSocket<PtySocketData>, data: string, localEchoId?: number): void {
    if (this.#disposed || this.#terminal.closed || this.#exited) return
    if (localEchoId !== undefined) {
      const state = this.#terminalState()
      send(ws, {type: "terminal.local-echo", id: localEchoId, accepted: state.localEcho, state})
    }
    this.#terminal.write(data)
    this.#updatedAt = Date.now()
  }

  resize(size: PtyTerminalSize): void {
    if (this.#disposed || this.#terminal.closed || this.#exited) return
    const next = clampSize(size, this.#options)
    this.#size = next
    this.#updatedAt = Date.now()
    this.#terminal.resize(next.cols, next.rows)
  }

  clearScrollback(): void {
    this.#scrollback.length = 0
    this.#scrollbackBytes = 0
  }

  close(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#clearDisposeTimer()

    try {
      this.#proc.kill("SIGHUP")
    } catch {
      // Процесс мог уже завершиться.
    }

    try {
      if (!this.#terminal.closed) this.#terminal.close()
    } catch {
      // Повторное закрытие detached PTY безопасно.
    }

    for (const ws of this.#clients) {
      try {
        ws.close(1001, "terminal session closed")
      } catch {
        // Socket might already be closed.
      }
    }
    this.#clients.clear()
    this.#onDispose(this.id, this.#key)
  }

  info(): PtySessionInfo {
    return {
      id: this.id,
      key: this.#key,
      shell: this.#programLabel(),
      cwd: this.#options.cwd,
      size: this.#size,
      clients: this.#clients.size,
      createdAt: this.createdAt,
      updatedAt: this.#updatedAt,
      detachedAt: this.#detachedAt,
      exited: this.#exited,
      scrollbackBytes: this.#scrollbackBytes,
    }
  }

  #write(data: string): void {
    if (data.length === 0 || this.#disposed) return
    this.#probeResponder.write(data)
    this.#stateTracker.write(data)
    this.#remember(data)
    this.#send({type: "terminal.write", data, state: this.#terminalState()})
  }

  #remember(data: string): void {
    this.#scrollback.push(data)
    this.#scrollbackBytes += byteLength(data)
    while (this.#scrollbackBytes > this.#options.scrollbackBytes && this.#scrollback.length > 0) {
      const removed = this.#scrollback.shift()
      if (removed !== undefined) this.#scrollbackBytes -= byteLength(removed)
    }
    this.#updatedAt = Date.now()
  }

  #send(message: PtyServerMessage): void {
    if (this.#disposed) return
    const encoded = JSON.stringify(message)
    for (const ws of this.#clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(encoded)
    }
  }

  #terminalState(): PtyTerminalState {
    const echo = !this.#terminal.closed && (this.#terminal.localFlags & TERMIOS_ECHO) !== 0
    return this.#stateTracker.state(echo)
  }

  #scheduleDispose(): void {
    if (this.#clients.size > 0 || this.#disposeTimer !== null) return
    this.#disposeTimer = setTimeout(() => this.close(), this.#options.sessionTtlMs)
  }

  #clearDisposeTimer(): void {
    if (this.#disposeTimer === null) return
    clearTimeout(this.#disposeTimer)
    this.#disposeTimer = null
  }

  #statusLabel(restored: boolean): string {
    if (this.#exited) return "exited"
    const label = this.#programLabel()
    return restored ? `restored ${label}` : label
  }

  #spawnCommand(): string[] {
    return [this.#options.shell, "-l"]
  }

  #programLabel(): string {
    return basename(this.#options.shell)
  }
}

type PtyStateParserMode = "text" | "esc" | "csi" | "osc" | "charset"

class PtyTerminalStateTracker {
  #applicationCursorKeys = false
  #applicationKeypad = false
  #bracketedPaste = false
  #alternateScreen = false
  #cursorVisible = true
  #parserMode: PtyStateParserMode = "text"
  #sequence = ""
  #oscEsc = false

  write(data: string): void {
    for (const ch of data) this.#consume(ch)
  }

  state(echo: boolean): PtyTerminalState {
    return {
      echo,
      localEcho: echo && !this.#alternateScreen,
      alternateScreen: this.#alternateScreen,
      applicationCursorKeys: this.#applicationCursorKeys,
      applicationKeypad: this.#applicationKeypad,
      bracketedPaste: this.#bracketedPaste,
      cursorVisible: this.#cursorVisible,
    }
  }

  #consume(ch: string): void {
    if (this.#parserMode === "esc") {
      this.#consumeEsc(ch)
      return
    }
    if (this.#parserMode === "csi") {
      this.#consumeCsi(ch)
      return
    }
    if (this.#parserMode === "osc") {
      this.#consumeOsc(ch)
      return
    }
    if (this.#parserMode === "charset") {
      this.#parserMode = "text"
      return
    }
    if (ch === "\x1b") {
      this.#parserMode = "esc"
      this.#sequence = ""
    }
  }

  #consumeEsc(ch: string): void {
    this.#parserMode = "text"
    if (ch === "[") {
      this.#parserMode = "csi"
      this.#sequence = ""
      return
    }
    if (ch === "]") {
      this.#parserMode = "osc"
      this.#sequence = ""
      this.#oscEsc = false
      return
    }
    if ("()*+-./".includes(ch)) {
      this.#parserMode = "charset"
      return
    }
    if (ch === "c") {
      this.#applicationCursorKeys = false
      this.#applicationKeypad = false
      this.#bracketedPaste = false
      this.#alternateScreen = false
      this.#cursorVisible = true
      return
    }
    if (ch === "=") this.#applicationKeypad = true
    else if (ch === ">") this.#applicationKeypad = false
  }

  #consumeCsi(ch: string): void {
    const code = ch.charCodeAt(0)
    if (code >= 0x40 && code <= 0x7e) {
      this.#parserMode = "text"
      this.#dispatchCsi(this.#sequence, ch)
      this.#sequence = ""
      return
    }
    if (this.#sequence.length < 256) this.#sequence += ch
  }

  #consumeOsc(ch: string): void {
    if (this.#oscEsc) {
      this.#parserMode = ch === "\\" ? "text" : "osc"
      this.#oscEsc = false
      return
    }
    if (ch === "\x07") {
      this.#parserMode = "text"
      return
    }
    if (ch === "\x1b") this.#oscEsc = true
  }

  #dispatchCsi(raw: string, final: string): void {
    if (final !== "h" && final !== "l") return
    const privatePrefix = /^[?><=]+/.exec(raw)?.[0] ?? ""
    if (!privatePrefix.includes("?")) return
    const body = privatePrefix.length > 0 ? raw.slice(privatePrefix.length) : raw
    const enabled = final === "h"
    const params = parseStateCsiParams(body)
    if (params.includes(25)) this.#cursorVisible = enabled
    if (params.includes(1)) this.#applicationCursorKeys = enabled
    if (params.includes(66)) this.#applicationKeypad = enabled
    if (params.includes(2004)) this.#bracketedPaste = enabled
    if (params.includes(47) || params.includes(1047) || params.includes(1049)) this.#alternateScreen = enabled
  }
}

type PtyProbeParserMode = "text" | "esc" | "csi" | "osc" | "charset"

export class PtyTerminalProbeResponder {
  readonly #send: (data: string) => void
  #parserMode: PtyProbeParserMode = "text"
  #sequence = ""
  #oscEsc = false

  constructor(send: (data: string) => void) {
    this.#send = send
  }

  write(data: string): void {
    for (const ch of data) this.#consume(ch)
  }

  #consume(ch: string): void {
    if (this.#parserMode === "esc") {
      this.#consumeEsc(ch)
      return
    }
    if (this.#parserMode === "csi") {
      this.#consumeCsi(ch)
      return
    }
    if (this.#parserMode === "osc") {
      this.#consumeOsc(ch)
      return
    }
    if (this.#parserMode === "charset") {
      this.#parserMode = "text"
      return
    }
    if (ch === "\x1b") {
      this.#parserMode = "esc"
      this.#sequence = ""
    }
  }

  #consumeEsc(ch: string): void {
    this.#parserMode = "text"
    if (ch === "[") {
      this.#parserMode = "csi"
      this.#sequence = ""
      return
    }
    if (ch === "]") {
      this.#parserMode = "osc"
      this.#sequence = ""
      this.#oscEsc = false
      return
    }
    if ("()*+-./".includes(ch)) this.#parserMode = "charset"
  }

  #consumeCsi(ch: string): void {
    const code = ch.charCodeAt(0)
    if (code >= 0x40 && code <= 0x7e) {
      this.#parserMode = "text"
      this.#dispatchCsi(this.#sequence, ch)
      this.#sequence = ""
      return
    }
    if (this.#sequence.length < 256) this.#sequence += ch
  }

  #consumeOsc(ch: string): void {
    if (this.#oscEsc) {
      if (ch === "\\") {
        this.#parserMode = "text"
        this.#dispatchOsc(this.#sequence)
      } else {
        this.#parserMode = "osc"
        if (this.#sequence.length < 1024) this.#sequence += `\x1b${ch}`
      }
      this.#oscEsc = false
      return
    }
    if (ch === "\x07") {
      this.#parserMode = "text"
      this.#dispatchOsc(this.#sequence)
      return
    }
    if (ch === "\x1b") {
      this.#oscEsc = true
      return
    }
    if (this.#sequence.length < 1024) this.#sequence += ch
  }

  #dispatchCsi(raw: string, final: string): void {
    if (final === "c" && raw.length === 0) this.#send("\x1b[?1;2c")
  }

  #dispatchOsc(raw: string): void {
    if (raw === "10;?") this.#send(`\x1b]10;${DEFAULT_OSC_FOREGROUND}\x1b\\`)
    else if (raw === "11;?") this.#send(`\x1b]11;${DEFAULT_OSC_BACKGROUND}\x1b\\`)
    else if (raw === "12;?") this.#send(`\x1b]12;${DEFAULT_OSC_CURSOR}\x1b\\`)
  }
}

export function createPtyServer(options: PtyServerOptions = {}): ReturnType<typeof Bun.serve<PtySocketData>> {
  const runtime = normalizeOptions(options)
  const manager = new PtySessionManager(runtime)
  return Bun.serve<PtySocketData>({
    hostname: runtime.hostname,
    port: runtime.port,
    routes: {
      "/health": {
        GET: () => Response.json({
          ok: true,
          service: "metafor-ptyd",
          pid: process.pid,
          sessions: manager.list().length,
        }),
      },
      "/": () => indexResponse(runtime),
      "/style.css": () => new Response(Bun.file(runtime.stylePath), {headers: {"content-type": "text/css; charset=utf-8", "cache-control": "no-cache"}}),
      "/entry.js": () => buildEntry(runtime),
      "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(runtime.fontPath), {headers: {"content-type": "font/ttf"}}),
      "/favicon.ico": () => new Response(null, {status: 204}),
      "/terminal/sessions": {
        GET: () => Response.json({sessions: manager.list()}),
      },
      "/terminal/sessions/:id": {
        DELETE(req: Request & {params: {id: string}}) {
          return manager.close(req.params.id) ? Response.json({ok: true}) : Response.json({error: "not found"}, {status: 404})
        },
      },
      "/terminal": {
        GET(req: Request, bunServer: PtyHttpServer) {
          const url = new URL(req.url)
          if (!isAllowedOrigin(req, url)) return new Response("Forbidden", {status: 403})
          const requestedSession = url.searchParams.get("session")
          const sessionKey = url.searchParams.get("key")
          const data: PtySocketData = {
            connectedAt: Date.now(),
            replay: url.searchParams.get("replay") !== "0",
            ...(requestedSession === null ? {} : {sessionId: requestedSession}),
            ...(sessionKey === null ? {} : {sessionKey}),
          }
          const upgraded = bunServer.upgrade(req, {
            data,
          })
          return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 400})
        },
      },
      "/:asset": {
        GET(req: Request & {params: {asset: string}}) {
          const asset = buildAssets.get(`/${req.params.asset}`)
          return asset === undefined ? new Response("Not Found", {status: 404}) : new Response(asset)
        },
      },
    },
    websocket: {
      data: {} as PtySocketData,
      idleTimeout: 0,
      maxPayloadLength: 1024 * 1024,
      open(ws) {
        try {
          manager.attach(ws)
        } catch (error) {
          send(ws, {
            type: "terminal.error",
            message: error instanceof Error ? error.message : "shell failed",
          })
          ws.close(1011, "shell failed")
        }
      },
      message(ws, message) {
        const payload = parsePtyClientMessage(message)
        const session = ws.data.session
        if (payload === null || session === undefined) return

        if (payload.type === "input.write") {
          session.writeInput(ws, payload.data, payload.localEchoId)
          return
        }

        if (payload.type === "terminal.clear") {
          session.clearScrollback()
          return
        }

        session.resize(payload.size)
      },
      close(ws) {
        ws.data.session?.detach(ws)
        delete ws.data.session
      },
    },
  })
}

if (import.meta.main) {
  const server = createPtyServer()
  console.log(`MetaFor PTY listening at ${server.url}`)
}

async function buildEntry(options: PtyRuntimeOptions): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [options.entryPath],
    loader: {
      ".wgsl": "text",
    },
    target: "browser",
    sourcemap: "inline",
  })

  if (!result.success) {
    const body = result.logs.map((log) => String(log)).join("\n")
    return new Response(body, {status: 500, headers: {"content-type": "text/plain; charset=utf-8"}})
  }

  const nextAssets = new Map<string, Blob>()
  let entry: Blob | null = null
  for (const output of result.outputs) {
    const routePath = `/${basename(output.path)}`
    if (routePath === "/client.js") entry = output
    else nextAssets.set(routePath, output)
  }
  buildAssets = nextAssets

  if (entry === null) return new Response("entry.js was not emitted", {status: 500})
  return new Response(entry, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

function indexResponse(options: PtyRuntimeOptions): Response {
  return new Response(Bun.file(options.indexPath), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

function send(ws: ServerWebSocket<PtySocketData>, message: PtyServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

export function parsePtyClientMessage(raw: string | ArrayBuffer | Uint8Array): PtyClientMessage | null {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw))

  try {
    const value = JSON.parse(text) as Partial<PtyClientMessage>
    if (value.type === "input.write" && typeof value.data === "string") {
      return {
        type: "input.write",
        data: value.data,
        ...(value.source === undefined ? {} : {source: value.source}),
        ...(Number.isSafeInteger(value.localEchoId) ? {localEchoId: value.localEchoId} : {}),
      }
    }
    if (value.type === "terminal.resize" && isTerminalSize(value.size)) {
      return {type: "terminal.resize", size: value.size}
    }
    if (value.type === "terminal.clear") {
      return {type: "terminal.clear"}
    }
  } catch {
    return null
  }

  return null
}

function parseStateCsiParams(raw: string): number[] {
  if (raw.length === 0) return []
  return raw
    .split(/[;:]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value))
}

function isTerminalSize(value: unknown): value is PtyTerminalSize {
  if (typeof value !== "object" || value === null) return false
  const size = value as Partial<PtyTerminalSize>
  return Number.isFinite(size.cols) && Number.isFinite(size.rows)
}

function clampSize(size: PtyTerminalSize, options: PtyRuntimeOptions): PtyTerminalSize {
  return {
    cols: clampInt(size.cols, 1, options.maxCols),
    rows: clampInt(size.rows, 1, options.maxRows),
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function copySearchParam(source: URL, target: URL, name: string): void {
  const value = source.searchParams.get(name)
  if (value !== null && value.length > 0) target.searchParams.set(name, value)
}

function normalizePtyDaemonProxyPayload(message: PtyDaemonProxyInput): PtyDaemonProxyPayload {
  if (typeof message === "string" || message instanceof ArrayBuffer) return message
  return uint8ArrayToArrayBuffer(message)
}

function uint8ArrayToArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength)
  copy.set(value)
  return copy.buffer
}

async function ptyDaemonHealthy(baseUrl: string, timeoutMs = DEFAULT_PTYD_HEALTH_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", baseUrl), {signal: AbortSignal.timeout(timeoutMs)})
    if (!response.ok) return false
    const payload = await response.json() as {service?: unknown; ok?: unknown}
    return payload.ok === true && payload.service === "metafor-ptyd"
  } catch {
    return false
  }
}

async function startPtyDaemon(baseUrl: string, options: PtyDaemonEnsureOptions): Promise<void> {
  const url = new URL(baseUrl)
  const host = url.hostname || DEFAULT_PTYD_HOST
  const port = Number(url.port || (url.protocol === "https:" ? 443 : DEFAULT_PTYD_PORT))
  const command = options.command ?? [process.execPath, "pkg/pty/src/server.ts"]
  const env = {
    ...process.env,
    HOST: host,
    PORT: String(Number.isFinite(port) ? port : DEFAULT_PTYD_PORT),
    METAFOR_PTYD: "1",
    PTY_SESSION_TTL_MS: process.env.PTY_SESSION_TTL_MS ?? String(DEFAULT_PTYD_SESSION_TTL_MS),
  }
  const proc = Bun.spawn(command, {
    cwd: options.cwd ?? process.cwd(),
    env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    detached: true,
  })
  if ("unref" in proc && typeof proc.unref === "function") proc.unref()
  options.log?.(`started metafor-ptyd pid=${proc.pid} url=${baseUrl}`)

  const startedAt = Date.now()
  const timeoutMs = options.startupTimeoutMs ?? DEFAULT_PTYD_STARTUP_TIMEOUT_MS
  while (Date.now() - startedAt < timeoutMs) {
    if (await ptyDaemonHealthy(baseUrl, options.healthTimeoutMs)) return
    await sleep(120)
  }
  throw new Error(`metafor-ptyd did not become healthy at ${baseUrl}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAllowedOrigin(req: Request, url: URL): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

export function terminalEnv(base: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...base,
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    COLORFGBG: base.COLORFGBG ?? DEFAULT_COLORFGBG,
    FORCE_COLOR: base.FORCE_COLOR ?? "3",
    PROMPT_EOL_MARK: "",
    TERM: "xterm-256color",
    TERM_PROGRAM: base.TERM_PROGRAM ?? DEFAULT_TERM_PROGRAM,
    TERM_PROGRAM_VERSION: base.TERM_PROGRAM_VERSION ?? DEFAULT_TERM_PROGRAM_VERSION,
  }
  delete env.NO_COLOR
  delete env.CLICOLOR_FORCE
  if (env.LANG === undefined || env.LANG === "C.UTF-8") env.LANG = "en_US.UTF-8"
  if (env.LC_ALL === "C.UTF-8") delete env.LC_ALL
  if (env.LC_CTYPE === "C.UTF-8") env.LC_CTYPE = "en_US.UTF-8"
  return env
}

function normalizeOptions(options: PtyServerOptions): PtyRuntimeOptions {
  return {
    hostname: options.hostname ?? process.env.HOST ?? "127.0.0.1",
    port: options.port ?? Number(process.env.PORT ?? "3002"),
    shell: options.shell ?? process.env.SHELL ?? "/bin/zsh",
    cwd: options.cwd ?? process.cwd(),
    defaultSize: options.defaultSize ?? DEFAULT_SIZE,
    maxCols: options.maxCols ?? Number(process.env.PTY_MAX_COLS ?? DEFAULT_MAX_COLS),
    maxRows: options.maxRows ?? Number(process.env.PTY_MAX_ROWS ?? DEFAULT_MAX_ROWS),
    maxSessions: options.maxSessions ?? Number(process.env.PTY_MAX_SESSIONS ?? DEFAULT_MAX_SESSIONS),
    sessionTtlMs: options.sessionTtlMs ?? Number(process.env.PTY_SESSION_TTL_MS ?? DEFAULT_SESSION_TTL_MS),
    scrollbackBytes: options.scrollbackBytes ?? Number(process.env.PTY_SCROLLBACK_BYTES ?? DEFAULT_SCROLLBACK_BYTES),
    entryPath: options.entryPath ?? join(import.meta.dir, "client.ts"),
    stylePath: options.stylePath ?? join(import.meta.dir, "styles.css"),
    indexPath: options.indexPath ?? join(import.meta.dir, "index.html"),
    fontPath: options.fontPath ?? join(import.meta.dir, "../../../ui/panes/playground/JetBrainsMono-Bold.ttf"),
  }
}

function normalizeSessionId(value: string | undefined): string | null {
  if (value === undefined || value.length < 8 || value.length > 128) return null
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : null
}

function normalizeSessionKey(value: string | undefined): string | null {
  if (value === undefined || value.length < 2 || value.length > 128) return null
  return /^[a-zA-Z0-9._:-]+$/.test(value) ? value : null
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
