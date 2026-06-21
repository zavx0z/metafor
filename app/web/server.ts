import {file, serve, type Server, type ServerWebSocket} from "bun"
import {Buffer} from "node:buffer"
import {randomUUID} from "node:crypto"
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, type Dirent} from "node:fs"
import {networkInterfaces} from "node:os"
import {basename, dirname, extname, join, relative, resolve} from "node:path"
import "dark/server"
import {createPtySessionManager, parsePtyClientMessage} from "@metafor/pty/server"
import {
  EventLogger,
  InterpreterModuleManager,
  createInterpreterHttpRoutes,
  interpreterRoutes,
  loadConfig,
  type InterpreterHttpRoutes,
} from "@metafor/interpreter/srv"
import {parseMarkdownTodo, updateTodoMarkdownItem} from "@ui/panes/todo-model"
import {createRtcSignalingServer} from "./server/rtc-signaling.ts"
import {createVoiceServer} from "./server/voice.ts"
import type {
	AndroidControlCommand,
	AppClientAsset,
	AppClientBundle,
	AppLogTone,
	AppWebSocketData,
	AppWebTerminalSocketData,
	BoundaryUpdateMessage,
	ClientMaterializePayload,
	ClientMessage,
	ClientRelayoutPayload,
	NetworkAction,
	NetworkTerminalAction,
	NetworkTerminalCommand,
	ServerSnapshotPayload,
	TerminalPtySocketData,
	TodoMarkdownPayload,
} from "./server.t.ts"
import {DEFAULT_APP_WEB_SCENE_SRC} from "./app-config.ts"

const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<AppWebSocketData>>()
let pendingNetworkTerminalCommand: NetworkTerminalCommand | null = null
const terminalSessions = createPtySessionManager({
  cwd: process.cwd(),
  shell: Bun.env.SHELL || "/bin/zsh",
})
const HOST = Bun.env.HOST ?? Bun.env.APP_WEB_HOST ?? "127.0.0.1"
const PORT = Number(Bun.env.PORT ?? 3000)
const TLS_ENABLED = Boolean(Bun.env.TLS_KEY_FILE && Bun.env.TLS_CERT_FILE)
const CHROME_API_URL = Bun.env.METAFOR_CHROME_API_URL ?? "http://localhost:7880"
const {proxy: interpreterProxyRoutes} = interpreterRoutes
const REDIRECT_ENABLED = TLS_ENABLED && (Bun.env.APP_WEB_REDIRECT === "1" || (Bun.env.APP_WEB_REDIRECT !== "0" && PORT === 443))
const REDIRECT_HOST = Bun.env.APP_WEB_REDIRECT_HOST ?? HOST
const REDIRECT_PORT = Number(Bun.env.APP_WEB_REDIRECT_PORT ?? 80)
const APP_WEB_STARTED_AT = new Date()
const LOG_COLOR_ENABLED = Bun.env.NO_COLOR === undefined && Bun.env.FORCE_COLOR !== "0"
const META_SOURCE_DIR = "github"
const CODEX_ATTACHMENT_DIR = "app/web/tmp/codex-attachments"
const CODEX_ATTACHMENT_MAX_BYTES = 16 * 1024 * 1024
const CODEX_ATTACHMENT_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".svg"])
const NETWORK_TMUX_SESSION = Bun.env.NETWORK_TMUX_SESSION ?? "metafor-app-web-net"
const NETWORK_TMUX_WINDOW = Bun.env.NETWORK_TMUX_WINDOW ?? "network"
const SOURCE_FILE_EXTENSIONS = new Set([
  ".css",
  ".cts",
  ".cjs",
  ".gltf",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".ts",
  ".tsx",
  ".toml",
  ".wgsl",
  ".xml",
  ".yaml",
  ".yml",
])
const SOURCE_SKIP_DIRS = new Set([".git", "dist", "node_modules", "tmp"])
const APP_CLIENT_BUNDLE = await buildAppClientBundle()
const embeddedInterpreterConfig = loadConfig({
  ...Bun.env,
  INTERPRETER_HTTP_ENABLED: "0",
  INTERPRETER_DUMP_PATH: Bun.env.APP_WEB_INTERPRETER_DUMP_PATH ?? "app/web/tmp/interpreter/state.json",
})
mkdirSync(dirname(embeddedInterpreterConfig.consoleLogPath), {recursive: true})
const embeddedInterpreterLogger = new EventLogger(embeddedInterpreterConfig.eventLogPath)
const embeddedInterpreterModules = new InterpreterModuleManager(embeddedInterpreterConfig, embeddedInterpreterLogger)
const {fetch: fetchEmbeddedInterpreterRoute} = createInterpreterHttpRoutes({
  host: HOST,
  port: PORT,
  modules: embeddedInterpreterModules,
  logger: embeddedInterpreterLogger,
  eventLogPath: embeddedInterpreterConfig.eventLogPath,
  consoleLogPath: embeddedInterpreterConfig.consoleLogPath,
	startupSqliteDatabases: [Bun.env.BOUNDARY_PATH ?? "app/web/tmp/boundary.sqlite"],
})
const voiceServer = createVoiceServer({
  sockets,
  chromeApiUrl: CHROME_API_URL,
  tlsEnabled: TLS_ENABLED,
  port: PORT,
  appLog,
  errorMessage,
  jsonResponse,
  readJsonObject,
  formatLogBytes,
  compactLogValue,
  shortId,
})
const rtcSignalingServer = createRtcSignalingServer({
  appLog,
  logHttp,
  logWsUpgrade,
  jsonResponse,
})
const redirectServer = REDIRECT_ENABLED ? startHttpRedirectServer() : null

const buildSnapshot = async (
  message: ClientMaterializePayload | ClientRelayoutPayload,
): Promise<ServerSnapshotPayload> => {
  const src = message.src.trim() || DEFAULT_APP_WEB_SCENE_SRC
  const snapshot = await boundary.bulkRuntime()
  return {type: "snapshot", src, snapshot}
}

boundary.entropy((event) => {
  broadcastForceMessage(event.data)
})

function broadcastForceMessage(message: BoundaryUpdateMessage): number {
  const payload = JSON.stringify({
    type: "force",
    parts: message.parts,
  })
  let clients = 0
  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue
    socket.send(payload)
    clients += 1
  }
  return clients
}

const server = serve<AppWebSocketData>({
  hostname: HOST,
  port: PORT,
  development: false,
  ...(Bun.env.TLS_KEY_FILE && Bun.env.TLS_CERT_FILE
    ? {
      tls: {
        key: file(Bun.env.TLS_KEY_FILE),
        cert: file(Bun.env.TLS_CERT_FILE),
        ...(Bun.env.TLS_CA_FILE ? {ca: file(Bun.env.TLS_CA_FILE)} : {}),
        ...(Bun.env.TLS_PASSPHRASE ? {passphrase: Bun.env.TLS_PASSPHRASE} : {}),
      },
    }
    : {}),
  routes: {
    "/": () => appClientAssetResponse(APP_CLIENT_BUNDLE.html),
    "/index.html": () => appClientAssetResponse(APP_CLIENT_BUNDLE.html),
    ...appClientAssetRoutes(APP_CLIENT_BUNDLE),
    "/health": (req: Request) => {
      const started = Date.now()
      const response = Response.json({ok: true})
      if (Bun.env.APP_WEB_LOG_HEALTH === "1") logHttp(req, "health", response.status, started)
      return response
    },
    "/engine-static/JetBrainsMono-Bold.ttf": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/JetBrainsMono-Bold.ttf"))),
    "/models/bots.glb": () => new Response(file(join(import.meta.dir, "../../pkg/engine/static/models/bots.glb"))),
    "/ws": (req: Request, wsServer: Server<AppWebSocketData>) => {
      const ok = wsServer.upgrade(req, {data: {kind: "app-web"}})
      logWsUpgrade(req, "app-web", ok)
      return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
    },
    "/force": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST") {
        logHttp(req, "force", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      const parsed = await readJsonObject(req)
      if (parsed.error !== undefined) {
        logHttp(req, "force", 400, started, `error=${parsed.error}`)
        return jsonResponse({ok: false, error: parsed.error}, 400)
      }
      const parts = parsed.body["parts"]
      if (!Array.isArray(parts)) {
        logHttp(req, "force", 400, started, "error=parts must be an array")
        return jsonResponse({ok: false, error: "parts must be an array"}, 400)
      }
      const message: BoundaryUpdateMessage = {parts: parts as BoundaryUpdateMessage["parts"]}
      try {
        await boundary.absorb(message)
        const clients = broadcastForceMessage(message)
        logHttp(req, "force", 200, started, `parts=${message.parts.length} clients=${clients}`)
        return jsonResponse({ok: true, parts: message.parts.length, clients})
      } catch (error) {
        logHttp(req, "force", 400, started, `error=${errorMessage(error)}`)
        return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 400)
      }
    },
    "/hud/terminal/stream": (req: Request, wsServer: Server<AppWebSocketData>) => {
      const url = new URL(req.url)
      const data: AppWebTerminalSocketData = {
        kind: "terminal",
        replay: url.searchParams.get("replay") !== "0",
        connectedAt: Date.now(),
      }
      const session = url.searchParams.get("session")
      if (session !== null && session.length > 0) data.sessionId = session
      const key = url.searchParams.get("key")
      if (key !== null && key.length > 0) data.sessionKey = key
      const tmux = url.searchParams.get("tmux")
      if (tmux !== null && tmux.length > 0) data.tmuxSession = tmux
      const ok = wsServer.upgrade(req, {data})
      logWsUpgrade(req, "terminal", ok, terminalUpgradeDetail(data))
      return ok ? undefined : new Response("WebSocket upgrade failed", {status: 426})
    },
    "/hud/webrtc/signaling": (req: Request, wsServer: Server<AppWebSocketData>) => {
      return rtcSignalingServer.route(req, wsServer)
    },
    "/hud/todo": (req: Request) => {
      const started = Date.now()
      if (req.method !== "GET") {
        logHttp(req, "todo.read", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      const response = todoMarkdownResponse()
      logHttp(req, "todo.read", response.status, started)
      return response
    },
    "/hud/todo/items/:id": async (req: Request) => {
      const id = routeParam(req, "id")
      if ((req.method === "PATCH" || req.method === "POST") && id !== undefined) {
        const started = Date.now()
        return await patchTodoItem(id, req, started)
      }
      logHttp(req, "not-found", 404, Date.now())
      return new Response("Not Found", {status: 404})
    },
    "/hud/source/files": (req: Request) => {
      const started = Date.now()
      const response = sourceFilesResponse(req, new URL(req.url))
      logHttp(req, "source.files", response.status, started)
      return response
    },
    "/hud/source/file": async (req: Request) => {
      const started = Date.now()
      const response = await sourceFileResponse(req, new URL(req.url))
      logHttp(req, "source.file", response.status, started)
      return response
    },
    "/hud/codex/attachments": async (req: Request) => {
      const started = Date.now()
      const response = await codexAttachmentResponse(req)
      logHttp(req, "codex.attachment", response.status, started)
      return response
    },
    "/hud/voice/settings": async (req: Request) => {
      const started = Date.now()
      if (req.method === "GET") {
        const response = await voiceServer.readInterpreterVoiceSettingsResponse()
        logHttp(req, "voice.read", response.status, started)
        return response
      }
      if (req.method === "POST") {
        const response = await voiceServer.writeInterpreterVoiceSettingsResponse(req)
        logHttp(req, "voice.write", response.status, started)
        return response
      }
      logHttp(req, "voice", 405, started, "method not allowed")
      return new Response("Method Not Allowed", {status: 405})
    },
    "/hud/voice/rtc-debug": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST") {
        logHttp(req, "voice.rtc", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      const response = await voiceServer.writeVoiceRtcDebugResponse(req)
      if (response.status >= 400) logHttp(req, "voice.rtc", response.status, started)
      return response
    },
    "/hud/android/control": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST") {
        logHttp(req, "android", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      const response = await broadcastAndroidControlResponse(req, started)
      return response
    },
    "/hud/terminal/network": (req: Request) => {
      const started = Date.now()
      if (req.method !== "GET") {
        logHttp(req, "network.get", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      const response = jsonResponse(networkTerminalPayload())
      logHttp(req, "network.get", response.status, started)
      return response
    },
    "/hud/terminal/network/show": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST" && req.method !== "GET") {
        logHttp(req, "network.show", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      return await broadcastNetworkTerminalResponse(req, "show", started)
    },
    "/hud/terminal/network/dock": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST") {
        logHttp(req, "network.dock", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      return await broadcastNetworkTerminalResponse(req, "dock", started)
    },
    "/hud/terminal/network/toggle": async (req: Request) => {
      const started = Date.now()
      if (req.method !== "POST") {
        logHttp(req, "network.toggle", 405, started, "method not allowed")
        return new Response("Method Not Allowed", {status: 405})
      }
      return await broadcastNetworkTerminalResponse(req, "toggle", started)
    },
    "/space/network/action": async (req: Request) => {
      const started = Date.now()
      const response = await networkActionResponse(req, started)
      return response
    },
    "/hud/network/action": async (req: Request) => {
      const started = Date.now()
      const response = await networkActionResponse(req, started)
      return response
    },
    "/*": async (req: Request, wsServer: Server<AppWebSocketData>) => {
      const url = new URL(req.url)
      if (interpreterProxyRoutes.acceptsPathname(url.pathname)) {
        return await dispatchEmbeddedInterpreterRequest(req, url, wsServer)
      }
      logHttp(req, "not-found", 404, Date.now())
      return new Response("Not Found", {status: 404})
    },
  },
  websocket: {
    open(ws) {
      if (ws.data.kind === "rtc-signal") {
        rtcSignalingServer.attach(ws)
        return
      }
      if (ws.data.kind === "terminal") {
        try {
          const session = terminalSessions.attach(ws as ServerWebSocket<TerminalPtySocketData>)
          const info = session.info()
          appLog("PTY", "attached", `session=${shortId(info.id)} key=${info.key ?? "-"} tmux=${info.tmuxSession ?? "-"} clients=${info.clients}`, "cyan")
        } catch (error) {
          appLog("ERR", "terminal attach failed", errorMessage(error), "red")
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
            type: "terminal.error",
            message: error instanceof Error ? error.message : "shell failed",
          }))
          ws.close(1011, "shell failed")
        }
        return
      }
      sockets.add(ws)
      appLog("WS", "app client opened", `clients=${sockets.size}`, "green")
      sendPendingNetworkTerminalCommand(ws)
      voiceServer.sendVoiceLeaseSnapshot(ws, "connect")
    },
    message(ws, message) {
      if (ws.data.kind === "rtc-signal") {
        rtcSignalingServer.message(ws, message)
        return
      }
      if (ws.data.kind === "terminal") {
        const payload = parsePtyClientMessage(message)
        const session = ws.data.session
        if (payload === null || session === undefined) return
        if (payload.type === "input.write") {
          session.writeInput(ws as ServerWebSocket<TerminalPtySocketData>, payload.data, payload.localEchoId)
          return
        }
        if (payload.type === "terminal.clear") {
          session.clearScrollback()
          return
        }
        session.resize(payload.size)
        return
      }

      let payload: ClientMessage | null = null
      try {
        payload = JSON.parse(String(message)) as ClientMessage
      } catch {
        return
      }

      if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
        return
      }

      if (payload.type === "hud-voice-lease") {
        voiceServer.handleVoiceLeaseMessage(ws, payload)
        return
      }

      if (payload.type === "materialize" || payload.type === "relayout") {
        const started = Date.now()
        appLog("WS", "snapshot requested", `type=${payload.type} src=${payload.src.trim() || DEFAULT_APP_WEB_SCENE_SRC}`, "cyan")
        void buildSnapshot(payload)
          .then((world) => {
            appLog("WS", "snapshot ready", `type=${payload.type} in ${Date.now() - started}ms`, "green")
            ws.send(JSON.stringify(world))
          })
          .catch((error) => {
            appLog("ERR", "snapshot failed", `type=${payload.type} in ${Date.now() - started}ms error=${errorMessage(error)}`, "red")
            ws.send(JSON.stringify({type: "error", error: error instanceof Error ? error.message : String(error)}))
          })
        return
      }
    },
    close(ws) {
      if (ws.data.kind === "rtc-signal") {
        rtcSignalingServer.detach(ws)
        return
      }
      if (ws.data.kind === "terminal") {
        const session = ws.data.session
        session?.detach(ws as ServerWebSocket<TerminalPtySocketData>)
        if (session !== undefined) {
          const info = session.info()
          appLog("PTY", "detached", `session=${shortId(info.id)} key=${info.key ?? "-"} tmux=${info.tmuxSession ?? "-"} clients=${info.clients}`, "gray")
        }
        delete ws.data.session
        return
      }
      sockets.delete(ws)
      if (ws.data.voiceClientId !== undefined) voiceServer.releaseVoiceLease(ws.data.voiceClientId, "disconnect")
      appLog("WS", "app client closed", `clients=${sockets.size}`, "gray")
    },
  },
})

async function buildAppClientBundle(): Promise<AppClientBundle> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "index.html")],
    loader: {".wgsl": "text"},
    minify: true,
    target: "browser",
  })
  if (!result.success) {
    const detail = result.logs.map((log) => log.message).join("\n")
    throw new Error(`Failed to build app/web client bundle${detail.length > 0 ? `:\n${detail}` : ""}`)
  }

  let html: AppClientAsset | null = null
  const assets = new Map<string, AppClientAsset>()
  for (const output of result.outputs) {
    const pathname = output.path.replace(/^\.\//, "/")
    const asset: AppClientAsset = {
      body: await output.arrayBuffer(),
      type: output.type || "application/octet-stream",
    }
    if (pathname === "/index.html") html = asset
    else assets.set(pathname, asset)
  }
  if (html === null) throw new Error("Failed to build app/web client bundle: index.html output missing")
  return {assets, html}
}

function appClientAssetResponse(asset: AppClientAsset): Response {
  return new Response(asset.body.slice(0), {
    headers: {
      "cache-control": "no-store",
      "content-type": asset.type,
    },
  })
}

function appClientAssetRoutes(bundle: AppClientBundle): Record<string, () => Response> {
  return Object.fromEntries([...bundle.assets].map(([pathname, asset]) => [
    pathname,
    () => appClientAssetResponse(asset),
  ]))
}

function routeParam(req: Request, key: string): string | undefined {
  return (req as Request & { params?: Record<string, string> }).params?.[key]
}

function todoMarkdownResponse(): Response {
  const payload = todoMarkdownPayload()
  if (payload === null) return jsonResponse({ok: false, path: todoMarkdownPath(), error: "TODO.md not found"}, 404)
  return jsonResponse(payload)
}

function todoMarkdownPayload(): TodoMarkdownPayload | null {
  const path = todoMarkdownPath()
  if (!existsSync(path)) return null
  const stat = statSync(path)
  const text = readFileSync(path, "utf8")
  return {
    ok: true,
    path,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    text,
    items: parseMarkdownTodo(text),
  }
}

function todoMarkdownPath(): string {
  return resolve(process.cwd(), "TODO.md")
}

function readTodoMarkdownForEdit(): string {
  const path = todoMarkdownPath()
  return existsSync(path) ? readFileSync(path, "utf8") : "# MetaFor TODO\n"
}

async function patchTodoItem(id: string, req: Request, started = Date.now()): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) {
    logHttp(req, "todo.patch", 400, started, `id=${id} error=${parsed.error}`)
    return jsonResponse({ok: false, error: parsed.error}, 400)
  }
  const checked = asBoolean(parsed.body["checked"])
  if (checked === undefined) {
    logHttp(req, "todo.patch", 400, started, `id=${id} checked=invalid`)
    return jsonResponse({ok: false, error: "checked must be boolean"}, 400)
  }
  try {
    const result = updateTodoMarkdownItem(readTodoMarkdownForEdit(), id, {checked})
    const response = writeTodoMarkdown(result.markdown)
    logHttp(req, "todo.patch", response.status, started, `id=${id} checked=${checked}`)
    return response
  } catch (error) {
    logHttp(req, "todo.patch", 400, started, `id=${id} error=${errorMessage(error)}`)
    return jsonResponse({ok: false, error: error instanceof Error ? error.message : String(error)}, 400)
  }
}

function writeTodoMarkdown(text: string): Response {
  const path = todoMarkdownPath()
  writeFileSync(path, text, "utf8")
  const payload = todoMarkdownPayload()
  if (payload === null) return jsonResponse({ok: false, path, error: "TODO.md not found after write"}, 500)
  const message = JSON.stringify({type: "hud-todo-changed", todo: payload})
  for (const socket of sockets) {
    if (socket.data.kind === "app-web" && socket.readyState === WebSocket.OPEN) socket.send(message)
  }
  return jsonResponse(payload)
}

function sourceFilesResponse(req: Request, url: URL): Response {
  if (req.method !== "GET") return new Response("Method Not Allowed", {status: 405})
  const root = process.cwd()
  const sourceRoot = resolve(root, META_SOURCE_DIR)
  if (!existsSync(sourceRoot)) return jsonResponse({
    ok: false,
    root,
    error: `${META_SOURCE_DIR} directory not found`
  }, 404)
  const limit = clampSourceFileLimit(url.searchParams.get("limit"))
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const rootMarker = `${META_SOURCE_DIR}/`
  const paths = [
    ...(query.length === 0 || rootMarker.includes(query) ? [rootMarker] : []),
    ...collectSourceFiles(root, sourceRoot, query),
  ].slice(0, limit)
  return jsonResponse({
    ok: true,
    root,
    workspacePath: META_SOURCE_DIR,
    files: paths.map((path) => ({path})),
  })
}

async function sourceFileResponse(req: Request, url: URL): Promise<Response> {
  if (req.method === "GET") {
    const resolved = resolveSourceFilePath(url.searchParams.get("path"))
    if (resolved.error !== undefined) return jsonResponse({ok: false, error: resolved.error}, resolved.status)
    if (!existsSync(resolved.abs)) return jsonResponse({
      ok: false,
      path: resolved.path,
      error: "source file not found"
    }, 404)
    const stat = statSync(resolved.abs)
    if (!stat.isFile()) return jsonResponse({ok: false, path: resolved.path, error: "source path is not a file"}, 400)
    return jsonResponse({ok: true, path: resolved.path, text: readFileSync(resolved.abs, "utf8")})
  }
  if (req.method === "POST" || req.method === "PUT") {
    const parsed = await readJsonObject(req)
    if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
    const resolved = resolveSourceFilePath(parsed.body["path"])
    if (resolved.error !== undefined) return jsonResponse({ok: false, error: resolved.error}, resolved.status)
    const text = parsed.body["text"]
    if (typeof text !== "string") return jsonResponse({ok: false, error: "text must be a string"}, 400)
    mkdirSync(dirname(resolved.abs), {recursive: true})
    writeFileSync(resolved.abs, text, "utf8")
    return jsonResponse({ok: true, path: resolved.path})
  }
  return new Response("Method Not Allowed", {status: 405})
}

function collectSourceFiles(root: string, sourceRoot: string, query: string): string[] {
  const out: string[] = []
  const stack = [sourceRoot]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, {withFileTypes: true})
    } catch {
      continue
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1
      return b.name.localeCompare(a.name)
    })
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".storybook") continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SOURCE_SKIP_DIRS.has(entry.name)) {
          const rel = `${relative(root, abs).replaceAll("\\", "/")}/`
          if (query.length === 0 || rel.toLowerCase().includes(query)) out.push(rel)
          stack.push(abs)
        }
        continue
      }
      if (!entry.isFile()) continue
      if (!SOURCE_FILE_EXTENSIONS.has(sourceFileExtension(entry.name))) continue
      const rel = relative(root, abs).replaceAll("\\", "/")
      if (query.length > 0 && !rel.toLowerCase().includes(query)) continue
      out.push(rel)
    }
  }
  return out.sort((a, b) => a.localeCompare(b))
}

function resolveSourceFilePath(value: unknown): { path: string; abs: string; error?: undefined; status?: undefined } | {
  error: string;
  status: number
} {
  if (typeof value !== "string") return {error: "path must be a string", status: 400}
  const path = normalizeSourcePath(value)
  if (!path.startsWith(`${META_SOURCE_DIR}/`)) return {error: `path must be inside ${META_SOURCE_DIR}/`, status: 400}
  if (isWorkspaceDirectoryMarker(path)) return {error: "path must point to a file", status: 400}
  if (!SOURCE_FILE_EXTENSIONS.has(sourceFileExtension(path))) return {
    error: "source file extension is not editable",
    status: 400
  }
  const root = process.cwd()
  const sourceRoot = resolve(root, META_SOURCE_DIR)
  const abs = resolve(root, path)
  const rel = relative(sourceRoot, abs)
  if (rel === "" || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || resolve(sourceRoot, rel) !== abs) {
    return {error: `path escapes ${META_SOURCE_DIR}/`, status: 400}
  }
  return {path, abs}
}

function normalizeSourcePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/")
}

function isWorkspaceDirectoryMarker(path: string): boolean {
  return path.trim().replaceAll("\\", "/").endsWith("/")
}

function sourceFileExtension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot < 0 ? "" : name.slice(dot).toLowerCase()
}

function clampSourceFileLimit(value: string | null): number {
  const limit = value === null ? 1200 : Number(value)
  if (!Number.isFinite(limit)) return 1200
  return Math.min(5000, Math.max(1, Math.floor(limit)))
}

async function codexAttachmentResponse(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", {status: 405})
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const name = typeof parsed.body["name"] === "string" ? parsed.body["name"] : "image.png"
  const mime = typeof parsed.body["type"] === "string" ? parsed.body["type"] : ""
  const dataBase64 = typeof parsed.body["dataBase64"] === "string" ? parsed.body["dataBase64"] : ""
  const ext = imageAttachmentExtension(name, mime)
  if (ext === null) return jsonResponse({ok: false, error: "attachment must be an image"}, 400)
  const encoded = dataBase64.replace(/^data:[^;]+;base64,/i, "")
  if (encoded.length === 0) return jsonResponse({ok: false, error: "dataBase64 is required"}, 400)
  const bytes = Buffer.from(encoded, "base64")
  if (bytes.length === 0) return jsonResponse({ok: false, error: "attachment is empty"}, 400)
  if (bytes.length > CODEX_ATTACHMENT_MAX_BYTES) return jsonResponse({
    ok: false,
    error: "attachment is larger than 16 MB"
  }, 413)
  const dir = resolve(process.cwd(), CODEX_ATTACHMENT_DIR)
  mkdirSync(dir, {recursive: true})
  const safeName = safeAttachmentFilename(name, ext)
  const id = randomUUID()
  const path = join(dir, `${Date.now()}-${id.slice(0, 8)}-${safeName}`)
  writeFileSync(path, bytes)
  return jsonResponse({
    ok: true,
    attachment: {
      id,
      name: safeName,
      path,
      mime: mime.startsWith("image/") ? mime : mimeForImageExtension(ext),
      size: bytes.length,
    },
  })
}

function imageAttachmentExtension(name: string, mime: string): string | null {
  const ext = extname(name).toLowerCase()
  if (CODEX_ATTACHMENT_IMAGE_EXTENSIONS.has(ext)) return ext
  if (mime === "image/jpeg") return ".jpg"
  if (mime === "image/png") return ".png"
  if (mime === "image/gif") return ".gif"
  if (mime === "image/webp") return ".webp"
  if (mime === "image/heic") return ".heic"
  if (mime === "image/heif") return ".heif"
  if (mime === "image/tiff") return ".tiff"
  if (mime === "image/bmp") return ".bmp"
  if (mime === "image/svg+xml") return ".svg"
  return mime.startsWith("image/") ? ".png" : null
}

function safeAttachmentFilename(name: string, ext: string): string {
  const raw = basename(name || `image${ext}`)
  const cleaned = raw
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
  const fallback = `image${ext}`
  const filename = cleaned.length > 0 ? cleaned : fallback
  return CODEX_ATTACHMENT_IMAGE_EXTENSIONS.has(extname(filename).toLowerCase()) ? filename : `${filename}${ext}`
}

function mimeForImageExtension(ext: string): string {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg"
  if (ext === ".gif") return "image/gif"
  if (ext === ".webp") return "image/webp"
  if (ext === ".heic") return "image/heic"
  if (ext === ".heif") return "image/heif"
  if (ext === ".tif" || ext === ".tiff") return "image/tiff"
  if (ext === ".bmp") return "image/bmp"
  if (ext === ".svg") return "image/svg+xml"
  return "image/png"
}

async function broadcastAndroidControlResponse(req: Request, started = Date.now()): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) {
    logHttp(req, "android", 400, started, `error=${parsed.error}`)
    return jsonResponse({ok: false, error: parsed.error}, 400)
  }
  const command = asAndroidControlCommand(parsed.body)
  if (command === null) {
    logHttp(req, "android", 400, started, "invalid command")
    return jsonResponse({ok: false, error: "invalid android control command"}, 400)
  }
  const message = JSON.stringify({type: "hud-android-control", command})
  let clients = 0
  for (const socket of sockets) {
    if (socket.data.kind !== "app-web" || socket.readyState !== WebSocket.OPEN) continue
    socket.send(message)
    clients += 1
  }
  logHttp(req, "android", 200, started, `${command.type} clients=${clients}`)
  return jsonResponse({ok: true, clients, command})
}

function networkTerminalPayload(): Record<string, unknown> {
  return {
    ok: true,
    pending: pendingNetworkTerminalCommand,
    session: NETWORK_TMUX_SESSION,
    window: NETWORK_TMUX_WINDOW,
    clients: [...sockets].filter((socket) => socket.data.kind === "app-web" && socket.readyState === WebSocket.OPEN).length,
  }
}

async function broadcastNetworkTerminalResponse(req: Request, fallbackAction: NetworkTerminalAction, started = Date.now()): Promise<Response> {
  const parsed = await readOptionalJsonObject(req)
  if ("error" in parsed && parsed.error !== undefined) {
    logHttp(req, `network.${fallbackAction}`, 400, started, `error=${parsed.error}`)
    return jsonResponse({ok: false, error: parsed.error}, 400)
  }
  const command = asNetworkTerminalCommand(parsed.body, fallbackAction)
  pendingNetworkTerminalCommand = command
  const message = JSON.stringify({type: "hud-network-terminal", command})
  let clients = 0
  for (const socket of sockets) {
    if (socket.data.kind !== "app-web" || socket.readyState !== WebSocket.OPEN) continue
    socket.send(message)
    clients += 1
  }
  logHttp(req, `network.${command.action}`, 200, started, `clients=${clients} tmux=${command.tmux ?? NETWORK_TMUX_SESSION}`)
  return jsonResponse({ok: true, clients, command})
}

function sendPendingNetworkTerminalCommand(ws: ServerWebSocket<AppWebSocketData>): void {
  if (ws.data.kind !== "app-web" || pendingNetworkTerminalCommand === null || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({type: "hud-network-terminal", command: pendingNetworkTerminalCommand}))
}

function asNetworkTerminalCommand(body: Record<string, unknown>, fallbackAction: NetworkTerminalAction): NetworkTerminalCommand {
  const action = asNetworkTerminalAction(body["action"]) ?? fallbackAction
  const session = asString(body["session"])
  const key = asString(body["key"])
  const tmux = asString(body["tmux"]) ?? NETWORK_TMUX_SESSION
  return {
    action,
    ...(session === undefined ? {} : {session}),
    ...(key === undefined ? {} : {key}),
    tmux,
  }
}

function asNetworkTerminalAction(value: unknown): NetworkTerminalAction | undefined {
  return value === "show" || value === "dock" || value === "toggle" ? value : undefined
}

async function networkActionResponse(req: Request, started = Date.now()): Promise<Response> {
  if (req.method !== "POST") {
    logHttp(req, "network.action", 405, started, "method not allowed")
    return new Response("Method Not Allowed", {status: 405})
  }
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) {
    logHttp(req, "network.action", 400, started, `error=${parsed.error}`)
    return jsonResponse({ok: false, error: parsed.error}, 400)
  }
  const action = asNetworkAction(parsed.body["action"] ?? parsed.body["cmd"] ?? parsed.body["command"])
  if (action === undefined) {
    logHttp(req, "network.action", 400, started, "action=invalid")
    return jsonResponse({
      ok: false,
      error: "network action must be one of layout/status/start:tls/stop:tls/start:redirect/stop:redirect/tail/clear/stop"
    }, 400)
  }
  if (networkActionRestartsAppWeb(action)) {
    spawnNetworkAction(action, {delayed: true})
    logHttp(req, "network.action", 202, started, `${action} detached`)
    return jsonResponse({ok: true, action, detached: true, durationMs: Date.now() - started}, 202)
  }
  const result = spawnNetworkAction(action, {sync: true})
  const status = result.exitCode === 0 ? 200 : 500
  logHttp(req, "network.action", status, started, `${action} exit=${result.exitCode}`)
  return jsonResponse({
    ok: result.exitCode === 0,
    action,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    stdout: result.stdout,
    stderr: result.stderr,
  }, status)
}

function spawnNetworkAction(action: NetworkAction, opts: { sync: true }): {
  exitCode: number;
  stdout: string;
  stderr: string
}
function spawnNetworkAction(action: NetworkAction, opts?: { delayed?: boolean; sync?: false }): {
  exitCode: number;
  stdout: string;
  stderr: string
}
function spawnNetworkAction(action: NetworkAction, opts: { delayed?: boolean; sync?: boolean } = {}): {
  exitCode: number;
  stdout: string;
  stderr: string
} {
  const script = resolve(process.cwd(), "app/web/run.ts")
  const mode = networkTmuxMode()
  const env = {
    ...process.env,
    NETWORK_TMUX_SESSION,
    NETWORK_TMUX_WINDOW,
    NETWORK_TMUX_MODE: mode,
    ...(opts.delayed === true ? {NETWORK_TMUX_START_DELAY_MS: "450"} : {}),
  }
  const command = [process.execPath, script, `--${mode}`, action]
  if (opts.sync === true) {
    const result = Bun.spawnSync(command, {cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env})
    return {
      exitCode: result.exitCode,
      stdout: new TextDecoder().decode(result.stdout),
      stderr: new TextDecoder().decode(result.stderr),
    }
  }
  Bun.spawn(["nohup", ...command], {cwd: process.cwd(), stdin: "ignore", stdout: "ignore", stderr: "ignore", env})
  return {exitCode: 0, stdout: "", stderr: ""}
}

function asNetworkAction(value: unknown): NetworkAction | undefined {
  if (typeof value !== "string") return undefined
  if (
    value === "layout" ||
    value === "status" ||
    value === "start:tls" ||
    value === "stop:tls" ||
    value === "start:redirect" ||
    value === "stop:redirect" ||
    value === "tail" ||
    value === "clear" ||
    value === "stop"
  ) return value
  return undefined
}

function networkActionRestartsAppWeb(action: NetworkAction): boolean {
  return action === "layout" || action === "start:tls" || action === "stop:tls"
}

function networkTmuxMode(): "dev" | "prod" {
  return Bun.env.NETWORK_TMUX_MODE === "dev" ? "dev" : "prod"
}

async function dispatchEmbeddedInterpreterRequest(req: Request, url: URL, wsServer: Server<AppWebSocketData>): Promise<Response> {
  const started = Date.now()
  const upstreamPath = interpreterProxyRoutes.toUpstreamPath(url.pathname)
  if (upstreamPath === null || !interpreterProxyRoutes.acceptsPath(upstreamPath)) {
    logHttp(req, "interp.embedded", 404, started, `blocked upstream=${upstreamPath ?? url.pathname}`)
    return jsonResponse({ok: false, error: "interpreter route not allowed"}, 404)
  }
  const upstream = new URL(req.url)
  upstream.pathname = upstreamPath
  const headers = new Headers()
  const contentType = req.headers.get("content-type")
  if (contentType !== null) headers.set("content-type", contentType)
  try {
    const init: RequestInit = {
      method: req.method,
      headers,
    }
    if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer()
    const embeddedRequest = new Request(upstream, init)
    const response = await fetchEmbeddedInterpreterRoute(
      embeddedRequest,
      wsServer as unknown as Parameters<InterpreterHttpRoutes["fetch"]>[1],
    )
    if (response === undefined) return jsonResponse({
      ok: false,
      error: "embedded interpreter route did not return a response"
    }, 500)
    logHttp(req, "interp.embedded", response.status, started, `upstream=${upstreamPath}`)
    return response
  } catch (error) {
    logHttp(req, "interp.embedded", 502, started, `upstream=${upstream.pathname}${upstream.search} error=${errorMessage(error)}`)
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      hint: "embedded interpreter route failed inside app/web",
    }, 502)
  }
}

function asAndroidControlCommand(value: Record<string, unknown>): AndroidControlCommand | null {
  const type = value["type"]
  if (type === "tap") {
    const x = finiteNumber(value["x"])
    const y = finiteNumber(value["y"])
    return x === null || y === null ? null : withAndroidCommandFrameSize(value, {type, x, y})
  }
  if (type === "swipe") {
    const x1 = finiteNumber(value["x1"])
    const y1 = finiteNumber(value["y1"])
    const x2 = finiteNumber(value["x2"])
    const y2 = finiteNumber(value["y2"])
    const durationMs = finiteNumber(value["durationMs"])
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null
    const command: Extract<AndroidControlCommand, { type: "swipe" }> = durationMs === null
      ? {type: "swipe", x1, y1, x2, y2}
      : {type: "swipe", x1, y1, x2, y2, durationMs}
    return withAndroidCommandFrameSize(value, command)
  }
  if (type === "key") {
    const code = value["code"]
    return typeof code === "string" && code.length > 0 ? {type, code} : null
  }
  if (type === "launch") {
    const packageName = value["packageName"]
    return typeof packageName === "string" && packageName.length > 0 ? {type, packageName} : null
  }
  if (type === "open-accessibility") return {type}
  return null
}

function withAndroidCommandFrameSize<T extends Extract<AndroidControlCommand, { type: "tap" | "swipe" }>>(
  value: Record<string, unknown>,
  command: T,
): T {
  const frameW = finiteNumber(value["frameW"])
  const frameH = finiteNumber(value["frameH"])
  return frameW === null || frameH === null ? command : {...command, frameW, frameH}
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatLogBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0B"
  if (value < 1024) return `${Math.round(value)}B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`
  return `${Math.round(value / 1024 / 102.4) / 10}MB`
}

function compactLogValue(value: string, maxLength = 48): string {
  const compact = value.replace(/\s+/g, " ").trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 3))}...`
}

async function readJsonObject(req: Request): Promise<{ body: Record<string, unknown>; error?: undefined } | {
  body: Record<string, never>;
  error: string
}> {
  try {
    const value = await req.json()
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return {body: value as Record<string, unknown>}
    return {body: {}, error: "body must be a JSON object"}
  } catch (error) {
    return {body: {}, error: error instanceof Error ? error.message : String(error)}
  }
}

async function readOptionalJsonObject(req: Request): Promise<{ body: Record<string, unknown>; error?: undefined } | {
  body: Record<string, never>;
  error: string
}> {
  try {
    const text = await req.text()
    if (text.trim().length === 0) return {body: {}}
    const value = JSON.parse(text) as unknown
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return {body: value as Record<string, unknown>}
    return {body: {}, error: "body must be a JSON object"}
  } catch (error) {
    return {body: {}, error: error instanceof Error ? error.message : String(error)}
  }
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {"content-type": "application/json; charset=utf-8"},
  })
}

function appLog(tag: string, label: string, detail: string, tone: AppLogTone): void {
  const prefix = paintLog(tone, `[${tag.padEnd(4)}]`)
  const time = paintLog("gray", formatLogTime(new Date()))
  console.log(`${prefix} ${time}  ${paintLog(tone, label.padEnd(14))} ${detail}`)
}

function appLogBanner(): void {
  console.log("")
  console.log(paintLog("cyan", "+--------------------------------------+"))
  console.log(paintLog("cyan", "| MetaFor app/web server               |"))
  console.log(paintLog("cyan", "+--------------------------------------+"))
}

function logHttp(req: Request, route: string, status: number, started: number, detail = ""): void {
  const url = new URL(req.url)
  const tone = status >= 500 ? "red" : status >= 400 ? "yellow" : "green"
  const path = compactLogPath(url)
  const suffix = detail.length > 0 ? ` ${detail}` : ""
  appLog("HTTP", route, `${status} ${Date.now() - started}ms ${req.method} ${path}${suffix}`, tone)
}

function logWsUpgrade(req: Request, channel: string, ok: boolean, detail = ""): void {
  const url = new URL(req.url)
  const suffix = detail.length > 0 ? ` ${detail}` : ""
  appLog(ok ? "WS" : "WARN", `${channel} upgrade`, `${compactLogPath(url)} ${ok ? "accepted" : "failed"}${suffix}`, ok ? "green" : "yellow")
}

function compactLogPath(url: URL): string {
  const aliases: Array<[string, string]> = [
    ["/hud/interpreter", "/interp"],
    ["/hud/android", "/android"],
    ["/hud/terminal", "/terminal"],
    ["/hud/webrtc", "/rtc"],
    ["/hud/voice", "/voice"],
    ["/hud/todo", "/todo"],
  ]
  let path = url.pathname
  for (const [prefix, alias] of aliases) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      path = `${alias}${path.slice(prefix.length)}`
      break
    }
  }
  return `${path}${url.search}`
}

function terminalUpgradeDetail(data: {
  replay: boolean;
  sessionId?: string;
  sessionKey?: string;
  tmuxSession?: string
}): string {
  return [
    `replay=${data.replay}`,
    data.sessionId === undefined ? undefined : `session=${shortId(data.sessionId)}`,
    data.sessionKey === undefined ? undefined : `key=${data.sessionKey}`,
    data.tmuxSession === undefined ? undefined : `tmux=${data.tmuxSession}`,
  ].filter((item): item is string => item !== undefined).join(" ")
}

function shortId(value: string): string {
  return value.length <= 8 ? value : value.slice(0, 8)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatLogTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  const ms = String(date.getMilliseconds()).padStart(3, "0")
  return `${hours}:${minutes}:${seconds}.${ms}`
}

function formatLogDateTime(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day} ${formatLogTime(date)}`
}

function paintLog(tone: AppLogTone, value: string): string {
  if (!LOG_COLOR_ENABLED) return value
  const colors: Record<AppLogTone | "reset", string> = {
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
    yellow: "\x1b[33m",
  }
  return `${colors[tone]}${value}${colors.reset}`
}

function printServerUrls(): void {
  const protocol = TLS_ENABLED ? "https" : "http"
  const port = server.port
  const urls = new Set<string>()
  urls.add(server.url.href)
  if (HOST === "0.0.0.0" || HOST === "::") {
    urls.add(`${protocol}://localhost:${port}/`)
    for (const address of localNetworkAddresses()) urls.add(`${protocol}://${address}:${port}/`)
  }
  appLogBanner()
  appLog("OK", `${TLS_ENABLED ? "HTTPS" : "HTTP"} online`, `pid=${process.pid} host=${HOST} port=${port}`, "green")
  appLog("CFG", "boundary", `path=${Bun.env.BOUNDARY_PATH ?? "(default)"}`, "magenta")
  if (TLS_ENABLED) {
    appLog("TLS", "key", Bun.env.TLS_KEY_FILE ?? "-", "green")
    appLog("TLS", "cert", Bun.env.TLS_CERT_FILE ?? "-", "green")
  } else {
    appLog("TLS", "disabled", "plain HTTP", "gray")
  }
  appLog("CFG", "chrome api", CHROME_API_URL, "magenta")
  appLog("CFG", "interpreter", "embedded routes at /hud/interpreter/*", "magenta")
  for (const url of urls) appLog("URL", "app entry", url, "cyan")
  if (redirectServer !== null) appLog("URL", "http redirect", redirectServer.url.href, "cyan")
  appLog("URL", "rtc signal", `${protocol === "https" ? "wss" : "ws"}://<host>:${port}/hud/webrtc/signaling`, "cyan")
  appLog("TIME", "started", formatLogDateTime(APP_WEB_STARTED_AT), "gray")
}

function startHttpRedirectServer(): Server<never> {
  try {
    const redirect = serve({
      hostname: REDIRECT_HOST,
      port: REDIRECT_PORT,
      fetch(req) {
        const source = new URL(req.url)
        const target = new URL(req.url)
        target.protocol = "https:"
        target.hostname = source.hostname
        target.port = PORT === 443 ? "" : String(PORT)
        return Response.redirect(target.toString(), 308)
      },
    })
    return redirect
  } catch (error) {
    throw new Error(`Failed to start HTTP redirect on ${REDIRECT_HOST}:${REDIRECT_PORT}: ${errorMessage(error)}`)
  }
}

function localNetworkAddresses(): string[] {
  const addresses: string[] = []
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const item of interfaces ?? []) {
      if (item.family !== "IPv4" || item.internal) continue
      addresses.push(item.address)
    }
  }
  return addresses
}

printServerUrls()
