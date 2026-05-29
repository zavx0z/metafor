import {basename, join} from "node:path"
import type {ServerWebSocket, Subprocess} from "bun"
import type {PtyClientMessage, PtyServerMessage, PtyTerminalSize} from "./protocol.ts"

type SocketData = {
  session?: TerminalSession
  connectedAt: number
}

const DEFAULT_SIZE: PtyTerminalSize = {cols: 80, rows: 24}
const MAX_COLS = 300
const MAX_ROWS = 120

const hostname = process.env.HOST ?? "127.0.0.1"
const port = Number(process.env.PORT ?? "3002")
const shell = process.env.SHELL ?? "/bin/zsh"
const ENTRY_PATH = join(import.meta.dir, "client.ts")
const STYLE_PATH = join(import.meta.dir, "styles.css")
const INDEX_PATH = join(import.meta.dir, "index.html")
const FONT_PATH = join(import.meta.dir, "../../../ui/panes/playground/JetBrainsMono-Bold.ttf")

let buildAssets = new Map<string, Blob>()

class TerminalSession {
  readonly #decoder = new TextDecoder()
  readonly #proc: Subprocess<"ignore", "ignore", "ignore">
  readonly #terminal: Bun.Terminal
  readonly #ws: ServerWebSocket<SocketData>
  #disposed = false
  #size: PtyTerminalSize

  constructor(ws: ServerWebSocket<SocketData>, size: PtyTerminalSize) {
    this.#ws = ws
    this.#size = clampSize(size)
    this.#proc = Bun.spawn([shell, "-l"], {
      cwd: process.cwd(),
      env: terminalEnv(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      terminal: {
        cols: this.#size.cols,
        rows: this.#size.rows,
        name: "xterm-256color",
        data: (_terminal, data) => {
          this.#send({
            type: "terminal.write",
            data: this.#decoder.decode(data, {stream: true}),
          })
        },
        exit: (_terminal, exitCode, signal) => {
          const tail = this.#decoder.decode()
          if (tail) this.#send({type: "terminal.write", data: tail})
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
        this.#send({type: "terminal.exit", code, signal: null})
      })
      .catch((error) => {
        this.#send({
          type: "terminal.error",
          message: error instanceof Error ? error.message : "terminal process failed",
        })
      })
  }

  get size(): PtyTerminalSize {
    return this.#size
  }

  write(data: string): void {
    if (!this.#disposed && !this.#terminal.closed) {
      this.#terminal.write(data)
    }
  }

  resize(size: PtyTerminalSize): void {
    if (this.#disposed || this.#terminal.closed) return
    const next = clampSize(size)
    this.#size = next
    this.#terminal.resize(next.cols, next.rows)
  }

  close(): void {
    if (this.#disposed) return
    this.#disposed = true

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
  }

  #send(message: PtyServerMessage): void {
    if (!this.#disposed && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(message))
    }
  }
}

const server = Bun.serve<SocketData>({
  hostname,
  port,
  routes: {
    "/": indexResponse,
    "/style.css": () => new Response(Bun.file(STYLE_PATH), {headers: {"content-type": "text/css; charset=utf-8", "cache-control": "no-cache"}}),
    "/entry.js": buildEntry,
    "/JetBrainsMono-Bold.ttf": () => new Response(Bun.file(FONT_PATH), {headers: {"content-type": "font/ttf"}}),
    "/favicon.ico": () => new Response(null, {status: 204}),
  },
  fetch(req, bunServer) {
    const url = new URL(req.url)

    if (url.pathname === "/terminal") {
      if (!isAllowedOrigin(req, url)) return new Response("Forbidden", {status: 403})
      const upgraded = bunServer.upgrade(req, {data: {connectedAt: Date.now()}})
      return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 400})
    }

    const asset = buildAssets.get(url.pathname)
    if (asset !== undefined) return new Response(asset)
    if (req.method === "GET" && acceptsHtml(req)) return indexResponse()
    return new Response(`not found: ${req.method} ${url.pathname}`, {status: 404})
  },
  websocket: {
    data: {} as SocketData,
    idleTimeout: 0,
    maxPayloadLength: 1024 * 1024,
    open(ws) {
      try {
        const session = new TerminalSession(ws, DEFAULT_SIZE)
        ws.data.session = session
        send(ws, {type: "terminal.ready", shell, size: session.size})
        send(ws, {type: "terminal.status", status: {kind: "connected", label: basename(shell)}})
      } catch (error) {
        send(ws, {
          type: "terminal.error",
          message: error instanceof Error ? error.message : "shell failed",
        })
        ws.close(1011, "shell failed")
      }
    },
    message(ws, message) {
      const payload = parseClientMessage(message)
      const session = ws.data.session
      if (payload === null || session === undefined) return

      if (payload.type === "input.write") {
        session.write(payload.data)
        return
      }

      session.resize(payload.size)
    },
    close(ws) {
      ws.data.session?.close()
      ws.data.session = undefined
    },
  },
})

console.log(`MetaFor PTY listening at ${server.url}`)

async function buildEntry(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [ENTRY_PATH],
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

function indexResponse(): Response {
  return new Response(Bun.file(INDEX_PATH), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  })
}

function send(ws: ServerWebSocket<SocketData>, message: PtyServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function parseClientMessage(raw: string | ArrayBuffer | Uint8Array): PtyClientMessage | null {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw))

  try {
    const value = JSON.parse(text) as Partial<PtyClientMessage>
    if (value.type === "input.write" && typeof value.data === "string") {
      return {type: "input.write", data: value.data, source: value.source}
    }
    if (value.type === "terminal.resize" && isTerminalSize(value.size)) {
      return {type: "terminal.resize", size: value.size}
    }
  } catch {
    return null
  }

  return null
}

function isTerminalSize(value: unknown): value is PtyTerminalSize {
  if (typeof value !== "object" || value === null) return false
  const size = value as Partial<PtyTerminalSize>
  return Number.isFinite(size.cols) && Number.isFinite(size.rows)
}

function clampSize(size: PtyTerminalSize): PtyTerminalSize {
  return {
    cols: clampInt(size.cols, 1, MAX_COLS),
    rows: clampInt(size.rows, 1, MAX_ROWS),
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
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

function acceptsHtml(req: Request): boolean {
  const accept = req.headers.get("accept")
  return accept === null || accept.includes("text/html")
}

function terminalEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    COLORTERM: "truecolor",
    CLICOLOR: "1",
    CLICOLOR_FORCE: "1",
    FORCE_COLOR: process.env.FORCE_COLOR ?? "1",
    PROMPT_EOL_MARK: "",
    TERM: "xterm-256color",
  }
  delete env.NO_COLOR
  if (env.LANG === undefined || env.LANG === "C.UTF-8") env.LANG = "en_US.UTF-8"
  if (env.LC_ALL === "C.UTF-8") delete env.LC_ALL
  if (env.LC_CTYPE === "C.UTF-8") env.LC_CTYPE = "en_US.UTF-8"
  return env
}
