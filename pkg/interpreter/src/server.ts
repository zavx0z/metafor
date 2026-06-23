/**
 * HTTP+WebSocket сервер: REST API + полнофункциональный web-UI интерпретатора.
 *
 * Архитектура:
 *   - REST поверх `executeCommand` — для curl/fetch.
 *   - WebSocket `/ws` — пуш state/resumed/console/result в браузерный UI и приём
 *     `{type:"command",...}` сообщений из UI.
 *   - HTML/JS UI отдаётся через Bun fullstack-bundler: `import indexHtml from "../web/index.html"`,
 *     все импорты внутри HTML транспилятся Bun'ом на лету.
 *
 * Файлы (`.events.log`, `.console.log`) сохранены — остаются архивом
 * и читаются через `GET /events` и `GET /console`.
 */

import type {ServerWebSocket, WebSocketHandler} from "bun"
import {existsSync, statSync, openSync, readSync, closeSync, readFileSync, writeFileSync, mkdirSync, watch, type FSWatcher} from "node:fs"
import {basename, dirname, extname, join, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import indexHtml from "../web/index.html"

const WEB_DIR = join(import.meta.dir, "..", "web")
const MANIFEST = {
  name: "MetaFor Interpreter",
  short_name: "interpreter",
  start_url: "/",
  display: "standalone",
}

import {executeCommand} from "./commands.ts"
import {serializeError} from "./errors.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {JsonObject} from "./types.ts"
import {sourceMapMapper} from "./source-map.ts"
import {applyPatch, createReplaceFilePatch, type ApplyPatchFileChange, type ApplyPatchResult} from "./apply-patch.ts"
import {remapBreakpointLine, type BreakpointRegistration} from "./breakpoints.ts"
import {createPtySessionManager, parsePtyClientMessage, type PtySocketData, type TerminalSession} from "@metafor/pty/server"
import type {InterpreterModule, InterpreterModuleManager, StartupModuleOptions} from "./module.ts"
import type {BreakpointSpec} from "./target.ts"
import {workspaceFilesPayload, type WorkspaceFilesModuleContext} from "./workspace-files.ts"
import {sqliteDatabaseFingerprint, sqliteDatabaseInputPath, sqliteDatabasePayload, sqliteJsonError, updateSqliteCell, type SqliteDatabaseFingerprint, type SqliteDatabasePayload} from "./sqlite-db.ts"
import {interpreterRoutes} from "./routes.ts"
import {restartInspectOptionsFromParams} from "./restart-options.ts"
import {
  attachVoiceProxySocket,
  createVoiceProxySocketData,
  detachVoiceProxySocket,
  relayVoiceProxyMessage,
  type VoiceProxyRoute,
  type VoiceProxySocketData,
} from "./voice-proxy.ts"
import {
  deleteTodoMarkdownItem,
  insertTodoMarkdownItem,
  parseMarkdownTodo,
  updateTodoMarkdownItem,
  type TodoMarkdownInsert,
  type TodoMarkdownPatch,
} from "@ui/panes/todo-model"

export type HttpServerOptions = {
  host: string
  port: number
  modules: InterpreterModuleManager
  logger: EventLogger
  eventLogPath: string
  consoleLogPath: string
  startupSqliteDatabases?: string[]
}

export type HttpServer = ReturnType<typeof Bun.serve>

type UiWsClientData = {
  kind: "ui"
  id: number
}

type TerminalWsClientData = PtySocketData & {
  kind: "terminal"
  id: number
}

type RtcSignalWsClientData = {
  kind: "rtc-signal"
  id: number
  room: string
  peerId: string
  connectedAt: number
}

type WsClientData = UiWsClientData | TerminalWsClientData | RtcSignalWsClientData | VoiceProxySocketData

const NDJSON_TAIL_DEFAULT_LIMIT = 200
const NDJSON_TAIL_MAX_LIMIT = 5_000
const UI_HOST_COMMAND_TIMEOUT_MS = 8_000
const ANDROID_API_URL = process.env.METAFOR_ANDROID_API_URL ?? "http://127.0.0.1:3007"
const SQLITE_WATCH_DEBOUNCE_MS = 140
const VALID_STOP_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT"])
const CODEX_ATTACHMENT_DIR = "pkg/interpreter/tmp/codex-attachments"
const CODEX_ATTACHMENT_MAX_BYTES = 16 * 1024 * 1024
const CODEX_ATTACHMENT_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".heif", ".tif", ".tiff", ".bmp", ".svg"])
type InterpreterTerminalSessionManager = ReturnType<typeof createPtySessionManager>
type UiHostCommandDispatcher = (command: string, params: JsonObject) => Promise<JsonObject>
type UiHostPendingRequest = {
  clientId: number
  command: string
  resolve: (value: JsonObject) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
type ModuleContextStore = Map<string, JsonObject>
type ModuleSnapshot = ReturnType<InterpreterModule["snapshot"]>
type SourcePatchReason = "save" | "apply_patch"
type SourcePatchBreakpointUpdate = {
  moduleId: string
  breakpoints: BreakpointRegistration[]
}
type SourcePatchReplayResult = {
  moduleId: string
  status: "replayed" | "skipped" | "failed"
  reason?: string
  target?: ModuleSnapshot["target"]
}
type HudTodoContextStore = {context: JsonObject | null}
type HudSqliteContextStore = {context: JsonObject | null}
type SqliteWatchEntry = {
  path: string
  label: string
  version: string | null
  timer: ReturnType<typeof setTimeout> | null
  watchers: FSWatcher[]
  watchedTargets: Set<string>
}

const rtcRooms = new Map<string, Map<string, ServerWebSocket<RtcSignalWsClientData>>>()

class UiHostCommandError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const terminalSessionsGlobal = globalThis as typeof globalThis & {
  __metaforInterpreterTerminalSessions?: InterpreterTerminalSessionManager
}

function interpreterTerminalSessions(): InterpreterTerminalSessionManager {
  terminalSessionsGlobal.__metaforInterpreterTerminalSessions ??= createPtySessionManager()
  return terminalSessionsGlobal.__metaforInterpreterTerminalSessions
}

function createSqliteWatchRegistry(
  broadcast: (payload: JsonObject) => void,
  logger: EventLogger,
): {
  register(input: string): string | null
  acceptPayload(payload: Pick<SqliteDatabasePayload, "path" | "label" | "version">): void
  acceptFingerprint(fingerprint: SqliteDatabaseFingerprint): void
} {
  const entries = new Map<string, SqliteWatchEntry>()

  const register = (input: string): string | null => {
    let path: string
    try {
      path = sqliteDatabaseInputPath(input)
    } catch (error) {
      logger.event("sqlite.watch.invalid_path", {path: input, error: serializeError(error)})
      return null
    }
    if (entries.has(path)) return path

    const entry: SqliteWatchEntry = {
      path,
      label: basename(path),
      version: null,
      timer: null,
      watchers: [],
      watchedTargets: new Set(),
    }
    entries.set(path, entry)
    primeSqliteWatchEntry(entry)
    installSqliteWatchers(entry)
    logger.event("sqlite.watch.started", {path})
    return path
  }

  const acceptPayload = (payload: Pick<SqliteDatabasePayload, "path" | "label" | "version">): void => {
    register(payload.path)
    const entry = entries.get(payload.path)
    if (entry === undefined) return
    entry.label = payload.label
    if (entry.version === payload.version) return
    entry.version = payload.version
    broadcast(sqliteChangedPayload(entry, true))
  }

  const acceptFingerprint = (fingerprint: SqliteDatabaseFingerprint): void => {
    register(fingerprint.path)
    const entry = entries.get(fingerprint.path)
    if (entry === undefined) return
    entry.label = fingerprint.label
    entry.version = fingerprint.version
  }

  const primeSqliteWatchEntry = (entry: SqliteWatchEntry): void => {
    try {
      const fingerprint = sqliteDatabaseFingerprint(entry.path)
      entry.label = fingerprint.label
      entry.version = fingerprint.version
    } catch {
      entry.version = null
    }
  }

  const installSqliteWatchers = (entry: SqliteWatchEntry): void => {
    const base = basename(entry.path)
    const interested = new Set([base, `${base}-wal`, `${base}-journal`])
    addSqliteWatcher(entry, dirname(entry.path), (filename) => filename === null || interested.has(filename))
    installSqliteFileWatchers(entry)
  }

  const installSqliteFileWatchers = (entry: SqliteWatchEntry): void => {
    if (existsSync(entry.path)) addSqliteWatcher(entry, entry.path)
    if (existsSync(`${entry.path}-wal`)) addSqliteWatcher(entry, `${entry.path}-wal`)
  }

  const addSqliteWatcher = (
    entry: SqliteWatchEntry,
    target: string,
    accepts: (filename: string | null) => boolean = () => true,
  ): void => {
    if (entry.watchedTargets.has(target)) return
    try {
      const watcher = watch(target, {persistent: false}, (_event, filename) => {
        const name = filename === null ? null : String(filename)
        if (!accepts(name)) return
        scheduleSqliteWatchCheck(entry)
      })
      entry.watchers.push(watcher)
      entry.watchedTargets.add(target)
    } catch (error) {
      logger.event("sqlite.watch.failed", {path: entry.path, target, error: serializeError(error)})
    }
  }

  const scheduleSqliteWatchCheck = (entry: SqliteWatchEntry): void => {
    if (entry.timer !== null) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.timer = null
      checkSqliteWatchEntry(entry)
    }, SQLITE_WATCH_DEBOUNCE_MS)
  }

  const checkSqliteWatchEntry = (entry: SqliteWatchEntry): void => {
    try {
      const fingerprint = sqliteDatabaseFingerprint(entry.path)
      installSqliteFileWatchers(entry)
      entry.label = fingerprint.label
      if (entry.version === fingerprint.version) return
      entry.version = fingerprint.version
      broadcast(sqliteChangedPayload(entry, true))
      logger.event("sqlite.watch.changed", {path: entry.path, version: entry.version})
    } catch (error) {
      if (entry.version === null) return
      entry.version = null
      broadcast({
        type: "sqlite-changed",
        path: entry.path,
        label: entry.label,
        version: null,
        available: false,
        error: serializeError(error),
      })
      logger.event("sqlite.watch.missing", {path: entry.path, error: serializeError(error)})
    }
  }

  return {register, acceptPayload, acceptFingerprint}
}

function sqliteChangedPayload(entry: SqliteWatchEntry, available: boolean): JsonObject {
  return {
    type: "sqlite-changed",
    path: entry.path,
    label: entry.label,
    version: entry.version,
    available,
  }
}

export function createInterpreterHttpRoutes(options: HttpServerOptions) {
  const wsClients = new Set<ServerWebSocket<WsClientData>>()
  const terminalSessions = interpreterTerminalSessions()
  let nextWsClientId = 1
  let nextTerminalClientId = 1
  let nextUiHostRequestId = 1
  const pendingUiHostRequests = new Map<number, UiHostPendingRequest>()
  const moduleContexts: ModuleContextStore = new Map()
  const moduleContextClientIds = new Map<string, number>()
  const hudTodoContext: HudTodoContextStore = {context: null}
  const hudSqliteContext: HudSqliteContextStore = {context: null}

  if (!isLoopbackHost(options.host)) {
    const warning = "/processes can execute local commands; bind the interpreter to loopback unless this is intentional"
    options.logger.status(`warning: ${warning} (host=${options.host})`)
    options.logger.event("http.non_loopback_host", {host: options.host, warning})
  }

  const broadcast = (payload: JsonObject): void => {
    if (wsClients.size === 0) return
    const text = JSON.stringify(payload)
    for (const client of wsClients) {
      if (client.readyState === 1) client.send(text)
    }
  }
  const sqliteWatchRegistry = createSqliteWatchRegistry(broadcast, options.logger)
  for (const path of options.startupSqliteDatabases ?? []) sqliteWatchRegistry.register(path)

  const dispatchUiHostCommand: UiHostCommandDispatcher = (command, params) => {
    const client = uiHostDispatchClient(wsClients, moduleContextClientIds, command, params)
    if (client === undefined) {
      throw new UiHostCommandError("no connected interpreter UI host", 503)
    }
    const requestId = nextUiHostRequestId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingUiHostRequests.delete(requestId)
        reject(new UiHostCommandError(`ui-host command timed out: ${command}`, 504))
      }, UI_HOST_COMMAND_TIMEOUT_MS)
      pendingUiHostRequests.set(requestId, {
        clientId: client.data.id,
        command,
        resolve,
        reject,
        timer,
      })
      client.send(JSON.stringify({type: "ui-host-command", requestId, command, params}))
    })
  }

  // verbose-стрим: события интерпретатора идут отдельно от protocol events,
  // которые пока привязаны к внутреннему moduleId текущего process.
  options.logger.onEvent((entry) => {
    broadcast({
      type: "interpreter-event",
      ts: entry.timestamp,
      event: entry.event,
      detail: entry,
    })
  })
  const subscribedModules = new Set<string>()
  const broadcastModules = (): void => {
    broadcast({type: "modules", modules: options.modules.snapshots()})
  }
  const subscribeModule = (module: InterpreterModule): void => {
    if (subscribedModules.has(module.id)) return
    subscribedModules.add(module.id)
    module.snapshots.onPause((dump) => {
      broadcast({type: "module-state", moduleId: module.id, dump, module: module.snapshot()})
      broadcastModules()
    })
    module.snapshots.onResume(() => {
      broadcast({type: "module-resumed", moduleId: module.id, module: module.snapshot()})
      broadcastModules()
    })
    module.client.onSocketStateChange((state, error) => {
      broadcast({
        type: "module-connection",
        moduleId: module.id,
        state,
        error: error ?? null,
        protocolUrl: module.client.url,
        module: module.snapshot(),
      })
      broadcastModules()
    })
    module.client.onEvent((method, params) => {
      broadcast({
        type: "module-protocol-event",
        moduleId: module.id,
        ts: new Date().toISOString(),
        method,
        params,
      })
    })
    module.target.onEvent((event) => {
      if (event.type === "started" || event.type === "exited") clearSourceCaches()
      broadcast({type: "module-target", moduleId: module.id, event, module: module.snapshot()})
      broadcastModules()
    })
  }
  for (const module of options.modules.list()) subscribeModule(module)
  options.modules.onEvent((event) => {
    if (event.type !== "removed") {
      subscribeModule(event.module)
      broadcast({type: "module", module: event.module.snapshot()})
    }
    broadcastModules()
  })

  const websocket: WebSocketHandler<WsClientData> = {
    open(ws): void {
      if (ws.data.kind === "voice-proxy") {
        attachVoiceProxySocket(ws as ServerWebSocket<VoiceProxySocketData>)
        options.logger.event("voice.proxy.opened", {
          route: ws.data.route,
          targetUrl: ws.data.targetUrl,
        })
        return
      }
      if (ws.data.kind === "rtc-signal") {
        attachRtcSignalSocket(ws as ServerWebSocket<RtcSignalWsClientData>)
        return
      }
      if (ws.data.kind === "terminal") {
        options.logger.event("terminal.client.opened", {id: ws.data.id})
        try {
          const session = terminalSessions.attach(ws as ServerWebSocket<TerminalWsClientData>)
          options.logger.event("terminal.session.attached", {clientId: ws.data.id, sessionId: session.id})
        } catch (error) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
            type: "terminal.error",
            message: error instanceof Error ? error.message : "shell failed",
          }))
          ws.close(1011, "shell failed")
        }
        return
      }

      wsClients.add(ws)
      options.logger.event("ws.client.opened", {id: ws.data.id, total: wsClients.size})
      const hello: JsonObject = {
        type: "hello",
        modules: options.modules.snapshots(),
        sqliteDatabases: options.startupSqliteDatabases ?? [],
      }
      ws.send(JSON.stringify(hello))
    },
    async message(ws, raw): Promise<void> {
      if (ws.data.kind === "voice-proxy") {
        relayVoiceProxyMessage(ws as ServerWebSocket<VoiceProxySocketData>, raw)
        return
      }
      if (ws.data.kind === "rtc-signal") {
        handleRtcSignalMessage(ws as ServerWebSocket<RtcSignalWsClientData>, raw)
        return
      }
      if (ws.data.kind === "terminal") {
        const payload = parsePtyClientMessage(raw)
        const session = ws.data.session
        if (payload === null || session === undefined) return
        if (payload.type === "input.write") {
          session.writeInput(ws as ServerWebSocket<PtySocketData>, payload.data, payload.localEchoId)
          return
        }
        if (payload.type === "terminal.clear") {
          session.clearScrollback()
          return
        }
        session.resize(payload.size)
        return
      }

      let parsed: unknown
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw)
      try {
        parsed = JSON.parse(text)
      } catch (error) {
        ws.send(JSON.stringify({type: "error", error: `invalid JSON: ${serializeError(error)}`}))
        return
      }

      const message = asObject(parsed)
      const messageType = asString(message?.["type"])
      if (message !== undefined && messageType === "ui-host-result") {
        acceptUiHostResult(message, pendingUiHostRequests)
        return
      }
      if (message !== undefined && messageType === "module-context") {
        acceptModuleContext(message, moduleContexts, moduleContextClientIds, hudTodoContext, hudSqliteContext, options, ws.data.id)
        return
      }
      if (message !== undefined && messageType === "hud-todo-context") {
        acceptHudTodoContext(message, hudTodoContext, options, ws.data.id)
        return
      }
      if (message !== undefined && messageType === "hud-sqlite-context") {
        acceptHudSqliteContext(message, hudSqliteContext, options, ws.data.id)
        return
      }

      if (message === undefined || messageType !== "command") {
        ws.send(JSON.stringify({type: "error", error: 'expected {"type":"command",...}'}))
        return
      }

      const cmd = asString(message["cmd"])
      const requestId = asNumber(message["requestId"])
      const params = asObject(message["params"]) ?? {}
      const moduleId = asString(message["moduleId"])
      if (moduleId === undefined) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: "missing moduleId"}))
        return
      }
      if (cmd === undefined) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: "missing cmd"}))
        return
      }
      const module = options.modules.get(moduleId)
      if (module === undefined) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: `module not found: ${moduleId}`}))
        return
      }

      options.logger.event("ws.command", {clientId: ws.data.id, moduleId, cmd, requestId})
      try {
        const result = await executeCommand({
          client: module.client,
          snapshots: module.snapshots,
          setBreakpointsActive: (active) => module.runtime.setBreakpointsActive(active),
        }, params, cmd)
        if (cmd === "breakpointsActive" || cmd === "setBreakpointsActive" || cmd === "muteBreakpoints" || cmd === "unmuteBreakpoints") {
          broadcast({type: "module", module: module.snapshot()})
        }
        ws.send(JSON.stringify({type: "result", requestId, ok: true, result}))
      } catch (error) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: serializeError(error)}))
      }
    },
    close(ws): void {
      if (ws.data.kind === "voice-proxy") {
        detachVoiceProxySocket(ws as ServerWebSocket<VoiceProxySocketData>)
        options.logger.event("voice.proxy.closed", {
          route: ws.data.route,
          targetUrl: ws.data.targetUrl,
        })
        return
      }
      if (ws.data.kind === "rtc-signal") {
        detachRtcSignalSocket(ws as ServerWebSocket<RtcSignalWsClientData>)
        return
      }
      if (ws.data.kind === "terminal") {
        ws.data.session?.detach(ws as ServerWebSocket<TerminalWsClientData>)
        delete ws.data.session
        options.logger.event("terminal.client.closed", {id: ws.data.id})
        return
      }

      wsClients.delete(ws)
      removeModuleContextClient(moduleContextClientIds, ws.data.id)
      rejectPendingUiHostRequestsForClient(ws.data.id, pendingUiHostRequests)
      options.logger.event("ws.client.closed", {id: ws.data.id, total: wsClients.size})
    },
  }

  return {
    routes: {
      "/": indexHtml,
    },
    async fetch(req: Request, server: HttpServer): Promise<Response | undefined> {
      const url = new URL(req.url)
      const path = url.pathname.replace(/\/+$/, "") || "/"
      const method = req.method.toUpperCase()
      if (method === "GET" && path === "/favicon.ico") return new Response(null, {status: 204})
      if (path === "/manifest.json") return Response.json(MANIFEST)

      if (path === "/ws") {
        const id = nextWsClientId++
        const data: WsClientData = {kind: "ui", id}
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }
      if (path === "/hud/terminal/stream") {
        if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
        const id = nextTerminalClientId++
        const requestedSession = url.searchParams.get("session")
        const sessionKey = url.searchParams.get("key")
        const tmuxSession = url.searchParams.get("tmux")
        const data: TerminalWsClientData = {
          kind: "terminal",
          id,
          connectedAt: Date.now(),
          replay: url.searchParams.get("replay") !== "0",
          ...(requestedSession === null ? {} : {sessionId: requestedSession}),
          ...(sessionKey === null ? {} : {sessionKey}),
          ...(tmuxSession === null ? {} : {tmuxSession}),
        }
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }
      if (path === "/hud/android/webrtc/signaling") {
        if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
        const room = sanitizeRtcId(url.searchParams.get("room") ?? "android-display")
        const peerId = sanitizeRtcId(url.searchParams.get("peer") ?? `peer-${nextWsClientId}`)
        if (room === null || peerId === null) return jsonResponse({ok: false, error: "invalid WebRTC room or peer id"}, 400)
        const id = nextWsClientId++
        const data: RtcSignalWsClientData = {
          kind: "rtc-signal",
          id,
          room,
          peerId,
          connectedAt: Date.now(),
        }
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }
      const voiceProxyRoute = voiceProxyRouteForPath(path)
      if (voiceProxyRoute !== null) {
        if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
        const data = createVoiceProxySocketData(voiceProxyRoute)
        const upgraded = server.upgrade(req, {data})
        options.logger.event("voice.proxy.upgrade", {
          route: voiceProxyRoute,
          targetUrl: data.targetUrl,
          accepted: upgraded,
        })
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }
      if (method === "GET" && path === "/hud/terminal/sessions") {
        return jsonResponse({sessions: terminalSessions.list()})
      }
      if (method === "DELETE" && path.startsWith("/hud/terminal/sessions/")) {
        const id = decodePathParam(path.slice("/hud/terminal/sessions/".length))
        return terminalSessions.close(id)
          ? jsonResponse({ok: true})
          : jsonResponse({ok: false, error: "terminal session not found"}, 404)
      }

      const start = Date.now()
      try {
        const response = await handleRoute(method, path, url, req, options, moduleContexts, hudTodoContext, hudSqliteContext, broadcast, dispatchUiHostCommand, sqliteWatchRegistry)
        options.logger.event("http.request", {
          method,
          path,
          status: response.status,
          durationMs: Date.now() - start,
        })
        return response
      } catch (error) {
        const message = serializeError(error)
        options.logger.event("http.error", {method, path, error: message})
        return jsonResponse({ok: false, error: message}, 500)
      }
    },
    websocket,
    error(error: Error): Response {
      options.logger.event("http.fatal", {error: serializeError(error)})
      return jsonResponse({ok: false, error: serializeError(error)}, 500)
    },
  }
}

export type InterpreterHttpRoutes = ReturnType<typeof createInterpreterHttpRoutes>

export function startHttpServer(options: HttpServerOptions): HttpServer {
  const interpreterHttpRoutes = createInterpreterHttpRoutes(options)
  const {routes, fetch, websocket, error} = interpreterHttpRoutes
  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    development: false,
    routes,
    fetch,
    websocket,
    error,
  })

  options.logger.status(`http+ws+ui listening on http://${options.host}:${options.port}`)
  options.logger.event("http.started", {host: options.host, port: options.port})

  return server
}

function acceptUiHostResult(message: JsonObject, pending: Map<number, UiHostPendingRequest>): void {
  const requestId = asNumber(message["requestId"])
  if (requestId === undefined) return
  const request = pending.get(requestId)
  if (request === undefined) return
  pending.delete(requestId)
  clearTimeout(request.timer)
  if (message["ok"] === true) {
    request.resolve({
      ok: true,
      command: request.command,
      result: message["result"] ?? null,
    })
    return
  }
  const error = asString(message["error"]) ?? "ui-host command failed"
  request.reject(new UiHostCommandError(error, 400))
}

function uiHostDispatchClient(
  clients: Set<ServerWebSocket<WsClientData>>,
  moduleContextClientIds: Map<string, number>,
  command: string,
  params: unknown,
): ServerWebSocket<UiWsClientData> | undefined {
  const moduleId = command.startsWith("processes.") ? uiHostCommandModuleId(params) : undefined
  const preferredClientId = moduleId === undefined ? undefined : moduleContextClientIds.get(moduleId)
  if (preferredClientId !== undefined) {
    const preferred = [...clients].find((item): item is ServerWebSocket<UiWsClientData> => {
      return item.data.kind === "ui" && item.data.id === preferredClientId && item.readyState === WebSocket.OPEN
    })
    if (preferred !== undefined) return preferred
  }
  return [...clients].find((item): item is ServerWebSocket<UiWsClientData> => {
    return item.data.kind === "ui" && item.readyState === WebSocket.OPEN
  })
}

function uiHostCommandModuleId(params: unknown): string | undefined {
  const object = asObject(params)
  if (object === undefined) return undefined
  const direct = asString(object["moduleId"]) ?? asString(object["processId"])
  if (direct !== undefined) return direct
  const selector = asObject(object["selector"])
  return asString(selector?.["moduleId"]) ?? asString(selector?.["processId"])
}

function removeModuleContextClient(moduleContextClientIds: Map<string, number>, clientId: number): void {
  for (const [moduleId, mappedClientId] of moduleContextClientIds) {
    if (mappedClientId === clientId) moduleContextClientIds.delete(moduleId)
  }
}

function acceptModuleContext(
  message: JsonObject,
  contexts: ModuleContextStore,
  contextClientIds: Map<string, number>,
  hudTodo: HudTodoContextStore,
  hudSqlite: HudSqliteContextStore,
  options: HttpServerOptions,
  clientId: number,
): void {
  const moduleId = asString(message["moduleId"])
  const context = asObject(message["context"])
  if (moduleId === undefined || context === undefined) return
  if (options.modules.get(moduleId) === undefined) return
  const nextContext: JsonObject = {
    ...context,
    moduleId,
    origin: "ui",
    receivedAt: new Date().toISOString(),
  }
  contexts.set(moduleId, nextContext)
  contextClientIds.set(moduleId, clientId)
  const hud = asObject(nextContext["hud"])
  const todo = asObject(hud?.["todo"])
  if (todo !== undefined) hudTodo.context = todo
  const sqlite = asObject(hud?.["sqlite"])
  if (sqlite !== undefined) hudSqlite.context = sqlite
  options.logger.event("module.context", {clientId, moduleId})
}

function acceptHudTodoContext(
  message: JsonObject,
  hudTodo: HudTodoContextStore,
  options: HttpServerOptions,
  clientId: number,
): void {
  const context = asObject(message["context"])
  if (context === undefined) return
  hudTodo.context = {
    ...context,
    receivedAt: new Date().toISOString(),
  }
  options.logger.event("hud.todo.context", {clientId})
}

function acceptHudSqliteContext(
  message: JsonObject,
  hudSqlite: HudSqliteContextStore,
  options: HttpServerOptions,
  clientId: number,
): void {
  const context = asObject(message["context"])
  hudSqlite.context = context === undefined
    ? null
    : {
        ...context,
        receivedAt: new Date().toISOString(),
      }
  options.logger.event("hud.sqlite.context", {clientId})
}

function rejectPendingUiHostRequestsForClient(clientId: number, pending: Map<number, UiHostPendingRequest>): void {
  for (const [requestId, request] of pending) {
    if (request.clientId !== clientId) continue
    pending.delete(requestId)
    clearTimeout(request.timer)
    request.reject(new UiHostCommandError(`interpreter UI host disconnected during ${request.command}`, 503))
  }
}

function attachRtcSignalSocket(ws: ServerWebSocket<RtcSignalWsClientData>): void {
  const peers = rtcRoomPeers(ws.data.room)
  const requestedPeerId = ws.data.peerId
  let peerId = requestedPeerId
  while (peers.has(peerId)) peerId = `${requestedPeerId}-${crypto.randomUUID().slice(0, 8)}`
  ws.data.peerId = peerId
  const existingPeers = [...peers.keys()]
  peers.set(peerId, ws)
  sendRtcJson(ws, {
    type: "hello",
    room: ws.data.room,
    peerId,
    peers: existingPeers,
  })
  broadcastRtcSignal(ws.data.room, peerId, {
    type: "peer-joined",
    peerId,
  })
}

function detachRtcSignalSocket(ws: ServerWebSocket<RtcSignalWsClientData>): void {
  const {room, peerId} = ws.data
  const peers = rtcRooms.get(room)
  if (peers === undefined) return
  if (peers.get(peerId) === ws) peers.delete(peerId)
  if (peers.size === 0) {
    rtcRooms.delete(room)
    return
  }
  broadcastRtcSignal(room, peerId, {
    type: "peer-left",
    peerId,
  })
}

function handleRtcSignalMessage(ws: ServerWebSocket<RtcSignalWsClientData>, message: string | Buffer<ArrayBuffer>): void {
  if (typeof message !== "string" || message.length > 256 * 1024) return
  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(message) as unknown
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return
    payload = parsed as Record<string, unknown>
  } catch {
    return
  }
  const to = typeof payload.to === "string" ? sanitizeRtcId(payload.to) : null
  const envelope = {
    ...payload,
    from: ws.data.peerId,
    room: ws.data.room,
  }
  if (to !== null) {
    const target = rtcRooms.get(ws.data.room)?.get(to)
    if (target !== undefined && target.readyState === WebSocket.OPEN) sendRtcJson(target, envelope)
    return
  }
  broadcastRtcSignal(ws.data.room, ws.data.peerId, envelope)
}

function rtcRoomPeers(room: string): Map<string, ServerWebSocket<RtcSignalWsClientData>> {
  const existing = rtcRooms.get(room)
  if (existing !== undefined) return existing
  const next = new Map<string, ServerWebSocket<RtcSignalWsClientData>>()
  rtcRooms.set(room, next)
  return next
}

function broadcastRtcSignal(room: string, fromPeerId: string, payload: Record<string, unknown>): void {
  const peers = rtcRooms.get(room)
  if (peers === undefined) return
  for (const [peerId, socket] of peers) {
    if (peerId === fromPeerId || socket.readyState !== WebSocket.OPEN) continue
    sendRtcJson(socket, payload)
  }
}

function sendRtcJson(ws: ServerWebSocket<RtcSignalWsClientData>, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload))
}

function sanitizeRtcId(value: string): string | null {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9_.:-]{1,96}$/.test(normalized)) return null
  return normalized
}

async function dispatchUiHostRouteFromBody(command: string, req: Request, dispatch: UiHostCommandDispatcher): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  return await dispatchUiHostRoute(command, parsed.body, dispatch)
}

async function dispatchUiHostRouteForProcessFromBody(command: string, processId: string, req: Request, dispatch: UiHostCommandDispatcher): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  return await dispatchUiHostRoute(command, processRouteParams(processId, parsed.body), dispatch)
}

async function processActionRoute(processId: string, req: Request, options: HttpServerOptions, dispatch: UiHostCommandDispatcher): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const action = asString(parsed.body["action"]) ?? asString(parsed.body["cmd"]) ?? asString(parsed.body["command"])
  if (action === undefined) return jsonResponse({ok: false, processId, error: "process action must be a string"}, 400)
  const params = asObject(parsed.body["params"]) ?? parsed.body
  if (action === "close" || action === "delete" || action === "remove") return await closeProcess(processId, params, options)
  if (action === "stop") return await stopProcessTarget(processId, params, options)
  if (action === "restart") return await restartProcessTarget(processId, params, options)
  return await dispatchUiHostRoute("processes.action", processRouteParams(processId, parsed.body), dispatch)
}

async function networkActionRoute(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const action = asString(parsed.body["action"]) ?? asString(parsed.body["cmd"]) ?? asString(parsed.body["command"])
  if (action === undefined) return jsonResponse({ok: false, error: "network action must be a string"}, 400)
  if (!isNetworkAction(action)) return jsonResponse({ok: false, action, error: "unknown network action"}, 400)
  const started = Date.now()
  const script = resolve(process.cwd(), "app/web/run.ts")
  const env = {
    ...process.env,
    NETWORK_TMUX_SESSION: asString(parsed.body["session"]) ?? "metafor-app-web-net",
    NETWORK_TMUX_WINDOW: asString(parsed.body["window"]) ?? "network",
    NETWORK_TMUX_MODE: networkTmuxMode(),
    ...(networkActionRestartsCurrentPane(action) ? {NETWORK_TMUX_START_DELAY_MS: "450"} : {}),
  }
  const command = [process.execPath, script, `--${networkTmuxMode()}`, action]
  if (networkActionRestartsCurrentPane(action)) {
    Bun.spawn(["nohup", ...command], {
      cwd: process.cwd(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env,
    })
    return jsonResponse({ok: true, action, detached: true, durationMs: Date.now() - started}, 202)
  }
  const result = Bun.spawnSync(command, {cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env})
  const stdout = new TextDecoder().decode(result.stdout)
  const stderr = new TextDecoder().decode(result.stderr)
  return jsonResponse({
    ok: result.exitCode === 0,
    action,
    exitCode: result.exitCode,
    durationMs: Date.now() - started,
    stdout,
    stderr,
  }, result.exitCode === 0 ? 200 : 500)
}

function networkTmuxMode(): "dev" | "prod" {
  return process.env.NETWORK_TMUX_MODE === "dev" ? "dev" : "prod"
}

function networkActionRestartsCurrentPane(action: string): boolean {
  return action === "layout" || action === "start:tls" || action === "stop:tls"
}

function isNetworkAction(action: string): boolean {
  return [
    "layout",
    "status",
    "start:tls",
    "stop:tls",
    "start:redirect",
    "stop:redirect",
    "tail",
    "clear",
    "stop",
  ].includes(action)
}

async function closeProcess(processId: string, _params: JsonObject, options: HttpServerOptions): Promise<Response> {
  try {
    const removed = await options.modules.remove(processId)
    if (removed === undefined) return processNotFoundResponse(processId)
    return jsonResponse({
      ok: true,
      processId: removed.id,
      removed: processPayload(removed.snapshot()),
      processes: processPayloads(options),
    })
  } catch (error) {
    return jsonResponse({ok: false, processId, error: serializeError(error)}, 400)
  }
}

async function stopProcessTarget(processId: string, params: JsonObject, options: HttpServerOptions): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  try {
    const target = await module.target.stop(stopSignalFromParams(params))
    return jsonResponse({ok: true, processId: module.id, process: processPayload(module.snapshot()), target})
  } catch (error) {
    return jsonResponse({ok: false, processId, error: serializeError(error)}, 400)
  }
}

async function restartProcessTarget(processId: string, params: JsonObject, options: HttpServerOptions): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  try {
    const breakpoints = module.breakpoints.registrations.map((registration) => registration.spec)
    const restartInspect = restartInspectOptionsFromParams(params)
    const target = await module.target.restart({
      ...restartInspect,
      signal: stopSignalFromParams(params),
      breakpoints,
    })
    return jsonResponse({ok: true, processId: module.id, process: processPayload(module.snapshot()), target})
  } catch (error) {
    return jsonResponse({ok: false, processId, error: serializeError(error)}, 400)
  }
}

function stopSignalFromParams(params: JsonObject): NodeJS.Signals {
  const sig = asString(params["signal"])
  if (sig === undefined) return "SIGTERM"
  if (!VALID_STOP_SIGNALS.has(sig)) throw new Error(`signal must be one of ${[...VALID_STOP_SIGNALS].join(", ")}`)
  return sig as NodeJS.Signals
}

function processRouteParams(processId: string, body: JsonObject = {}): JsonObject {
  const selector = asObject(body["selector"]) ?? {}
  return {
    ...body,
    processId,
    selector: {
      ...selector,
      processId,
      moduleId: processId,
    },
  }
}

async function dispatchUiHostRoute(command: string, params: JsonObject, dispatch: UiHostCommandDispatcher): Promise<Response> {
  try {
    return jsonResponse(await dispatch(command, params))
  } catch (error) {
    const status = error instanceof UiHostCommandError ? error.status : 500
    return jsonResponse({ok: false, command, error: serializeError(error)}, status)
  }
}

async function openSqliteDisplayFromBody(
  req: Request,
  dispatch: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry>,
): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const rawPath = asString(parsed.body["path"])
    ?? asString(parsed.body["sourceUrl"])
    ?? asString(parsed.body["modulePath"])
    ?? asString(parsed.body["database"])
  if (rawPath === undefined) return jsonResponse({ok: false, error: "sqlite.open requires path"}, 400)
  try {
    const path = sqliteDatabaseInputPath(rawPath)
    sqliteWatchRegistry.register(path)
    return await dispatchUiHostRoute("sqlite.open", {
      ...parsed.body,
      path,
    }, dispatch)
  } catch (error) {
    return sqliteJsonError(error)
  }
}

async function proxyAndroidRequest(req: Request, path: string): Promise<Response> {
  const incomingUrl = new URL(req.url)
  const target = new URL(`${path}${incomingUrl.search}`, ANDROID_API_URL)
  const headers = new Headers()
  const contentType = req.headers.get("content-type")
  if (contentType !== null) headers.set("content-type", contentType)
  try {
    const init: RequestInit = {
      method: req.method,
      headers,
    }
    if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.arrayBuffer()
    const upstream = await fetch(target, init)
    const responseHeaders = new Headers()
    const upstreamContentType = upstream.headers.get("content-type")
    if (upstreamContentType !== null) responseHeaders.set("content-type", upstreamContentType)
    responseHeaders.set("cache-control", upstream.headers.get("cache-control") ?? "no-store")
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    return jsonResponse({ok: false, androidApi: ANDROID_API_URL, error: serializeError(error)}, 502)
  }
}

async function handleRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  options: HttpServerOptions,
  moduleContexts: ModuleContextStore,
  hudTodoContext: HudTodoContextStore,
  hudSqliteContext: HudSqliteContextStore,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry>,
): Promise<Response> {
  if (method === "GET" && path === "/") return jsonResponse({service: "@metafor/interpreter", routes: interpreterRoutes.index})
  if (method === "GET" && path === "/health") return jsonResponse(healthPayload(options))
  if (method === "GET" && path === "/space") return await dispatchUiHostRoute("space.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/space/focus") return await dispatchUiHostRouteFromBody("space.focus", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/space/frame") return await dispatchUiHostRouteFromBody("space.frame", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/context") return jsonResponse(contextPayload(options, moduleContexts, hudTodoContext, hudSqliteContext))
  if (method === "GET" && path === "/hud/terminal") return await dispatchUiHostRoute("hud.terminal.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/dock") return await dispatchUiHostRouteFromBody("hud.terminal.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/show") return await dispatchUiHostRouteFromBody("hud.terminal.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/toggle") return await dispatchUiHostRouteFromBody("hud.terminal.toggle", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/codex/attachments") return await codexAttachmentResponse(req)
  if (method === "GET" && path === "/hud/terminal/network") return await dispatchUiHostRoute("hud.terminal.network.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/network/dock") return await dispatchUiHostRouteFromBody("hud.terminal.network.dock", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/hud/terminal/network/show") return await dispatchUiHostRoute("hud.terminal.network.show", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/network/show") return await dispatchUiHostRouteFromBody("hud.terminal.network.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/network/toggle") return await dispatchUiHostRouteFromBody("hud.terminal.network.toggle", req, dispatchUiHostCommand)
  if (method === "POST" && (path === "/space/network/action" || path === "/hud/network/action")) return await networkActionRoute(req)
  if (method === "GET" && path === "/hud/android") return await dispatchUiHostRoute("hud.android.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/dock") return await dispatchUiHostRouteFromBody("hud.android.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/show") return await dispatchUiHostRouteFromBody("hud.android.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/toggle") return await dispatchUiHostRouteFromBody("hud.android.toggle", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/refresh") return await dispatchUiHostRoute("hud.android.refresh", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/control") return await dispatchUiHostRouteFromBody("hud.android.control", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/hud/android/secondary") return await dispatchUiHostRoute("hud.android.secondary.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/secondary/dock") return await dispatchUiHostRouteFromBody("hud.android.secondary.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/secondary/show") return await dispatchUiHostRouteFromBody("hud.android.secondary.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/secondary/toggle") return await dispatchUiHostRouteFromBody("hud.android.secondary.toggle", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/android/secondary/control") return await dispatchUiHostRouteFromBody("hud.android.secondary.control", req, dispatchUiHostCommand)
  if (method === "GET" && (path === "/android/size" || path === "/android/screencap")) return await proxyAndroidRequest(req, path)
  if (method === "POST" && (path === "/android/tap" || path === "/android/swipe" || path === "/android/key")) return await proxyAndroidRequest(req, path)
  if (method === "GET" && path === "/hud/todo") return todoMarkdownResponse()
  if (method === "PUT" && path === "/hud/todo") return await replaceTodoMarkdown(req, broadcast)
  if (method === "POST" && path === "/hud/todo/items") return await createTodoItem(req, broadcast)
  if (method === "GET" && path === "/hud/todo/panel") return await dispatchUiHostRoute("hud.todo.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/todo/highlight") return await dispatchUiHostRouteFromBody("hud.todo.highlight", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/todo/reload") return await dispatchUiHostRoute("hud.todo.reload", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/todo/dock") return await dispatchUiHostRouteFromBody("hud.todo.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/todo/show") return await dispatchUiHostRouteFromBody("hud.todo.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/todo/toggle") return await dispatchUiHostRouteFromBody("hud.todo.toggle", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/hud/sqlite") return await dispatchUiHostRoute("hud.sqlite.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/sqlite/dock") return await dispatchUiHostRouteFromBody("hud.sqlite.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/sqlite/show") return await dispatchUiHostRouteFromBody("hud.sqlite.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/sqlite/toggle") return await dispatchUiHostRouteFromBody("hud.sqlite.toggle", req, dispatchUiHostCommand)
  const todoItem = /^\/hud\/todo\/items\/([^/]+)$/.exec(path)
  if ((method === "PATCH" || method === "POST") && todoItem !== null) return await patchTodoItem(decodePathParam(todoItem[1]!), req, broadcast)
  if (method === "DELETE" && todoItem !== null) return deleteTodoItem(decodePathParam(todoItem[1]!), broadcast)
  if (method === "GET" && path === "/sqlite") {
    try {
      sqliteWatchRegistry.register(url.searchParams.get("path") ?? "")
      const payload = sqliteDatabasePayload(url)
      sqliteWatchRegistry.acceptPayload(payload)
      return jsonResponse(payload)
    } catch (error) {
      return sqliteJsonError(error)
    }
  }
  if (method === "GET" && path === "/sqlite/fingerprint") {
    try {
      sqliteWatchRegistry.register(url.searchParams.get("path") ?? "")
      const fingerprint = sqliteDatabaseFingerprint(url.searchParams.get("path") ?? "")
      sqliteWatchRegistry.acceptFingerprint(fingerprint)
      return jsonResponse(fingerprint)
    } catch (error) {
      return sqliteJsonError(error)
    }
  }
  if (method === "POST" && path === "/sqlite/open") return await openSqliteDisplayFromBody(req, dispatchUiHostCommand, sqliteWatchRegistry)
  if (method === "POST" && path === "/sqlite/cell") {
    try {
      const payload = await updateSqliteCell(req)
      sqliteWatchRegistry.acceptPayload(payload)
      return jsonResponse(payload)
    } catch (error) {
      return sqliteJsonError(error)
    }
  }
  if (method === "GET" && path === "/processes") return jsonResponse({processes: processPayloads(options)})
  if (method === "POST" && path === "/processes") return await runProcess(req, options)
  if (method === "POST" && path === "/processes/resolve") return await dispatchUiHostRouteFromBody("processes.resolve", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/processes/focus") return await dispatchUiHostRouteFromBody("processes.focus", req, dispatchUiHostCommand)
  const processDetail = /^\/processes\/([^/]+)$/.exec(path)
  if (method === "GET" && processDetail !== null) return await dispatchUiHostRoute("processes.get", {processId: decodePathParam(processDetail[1]!)}, dispatchUiHostCommand)
  if (method === "DELETE" && processDetail !== null) return await closeProcess(decodePathParam(processDetail[1]!), {}, options)
  const processFocus = /^\/processes\/([^/]+)\/focus$/.exec(path)
  if (method === "POST" && processFocus !== null) return await dispatchUiHostRouteForProcessFromBody("processes.focus", decodePathParam(processFocus[1]!), req, dispatchUiHostCommand)
  const processAction = /^\/processes\/([^/]+)\/action$/.exec(path)
  if (method === "POST" && processAction !== null) return await processActionRoute(decodePathParam(processAction[1]!), req, options, dispatchUiHostCommand)
  const processContext = /^\/processes\/([^/]+)\/context$/.exec(path)
  if (method === "GET" && processContext !== null) return getProcessContext(decodePathParam(processContext[1]!), options, moduleContexts, hudTodoContext, hudSqliteContext)
  const processModules = /^\/processes\/([^/]+)\/modules$/.exec(path)
  if (method === "GET" && processModules !== null) return getProcessModules(decodePathParam(processModules[1]!), url, options)
  const processSource = /^\/processes\/([^/]+)\/source$/.exec(path)
  if (method === "GET" && processSource !== null) return await getProcessScriptSource(decodePathParam(processSource[1]!), url, options)
  if (method === "POST" && processSource !== null) return await saveProcessSource(decodePathParam(processSource[1]!), req, options, broadcast)
  const processApplyPatch = /^\/processes\/([^/]+)\/apply[-_]patch$/.exec(path)
  if (method === "POST" && processApplyPatch !== null) return await applyProcessPatch(decodePathParam(processApplyPatch[1]!), req, options, broadcast)
  const processBreakpoints = /^\/processes\/([^/]+)\/breakpoints$/.exec(path)
  if (method === "GET" && processBreakpoints !== null) return getProcessBreakpoints(decodePathParam(processBreakpoints[1]!), options)
  const processBreakpoint = /^\/processes\/([^/]+)\/breakpoint$/.exec(path)
  if (method === "POST" && processBreakpoint !== null) return await setProcessBreakpoint(decodePathParam(processBreakpoint[1]!), req, options, broadcast)
  if (method === "DELETE" && processBreakpoint !== null) return await removeProcessBreakpoint(decodePathParam(processBreakpoint[1]!), req, options, broadcast)
  if (method === "GET" && path === "/events") return jsonResponse(readNdjsonTail(options.eventLogPath, url))
  if (method === "GET" && path === "/console") return jsonResponse(readNdjsonTail(options.consoleLogPath, url))
  // Триггер хард-релоада UI у всех подключённых WS-клиентов: используется
  // когда мы выкатываем правку в bundle и хотим без юзерских Cmd+Shift+R
  // увидеть свежий код во вкладке.
  if (method === "POST" && path === "/reload") {
    broadcast({type: "reload"})
    return jsonResponse({ok: true})
  }

  if (method === "GET" && path === "/JetBrainsMono-Bold.ttf") {
    return serveStatic(join(WEB_DIR, "JetBrainsMono-Bold.ttf"), "font/ttf")
  }

  return jsonResponse({ok: false, error: `not found: ${method} ${path}`}, 404)
}

function serveStatic(filePath: string, contentType: string): Response {
  const file = Bun.file(filePath)
  return new Response(file, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400",
    },
  })
}

type TodoMarkdownPayload = {
  ok: true
  path: string
  mtimeMs: number
  size: number
  text: string
  items: ReturnType<typeof parseMarkdownTodo>
}

function todoMarkdownResponse(): Response {
  const payload = todoMarkdownPayload()
  if (payload === null) return jsonResponse({ok: false, path: todoMarkdownPath(), error: "TODO.md not found"}, 404)
  return jsonResponse(payload)
}

function todoMarkdownPayload(): TodoMarkdownPayload | null {
  const path = resolve(process.cwd(), "TODO.md")
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

async function replaceTodoMarkdown(req: Request, broadcast: (payload: JsonObject) => void): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const text = asString(parsed.body["text"]) ?? asString(parsed.body["markdown"])
  if (text === undefined) return jsonResponse({ok: false, error: "text must be a string"}, 400)
  return writeTodoMarkdown(text, broadcast)
}

async function createTodoItem(req: Request, broadcast: (payload: JsonObject) => void): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const body = parsed.body
  const text = asString(body["text"])
  if (text === undefined) return jsonResponse({ok: false, error: "text must be a string"}, 400)
  const insert: TodoMarkdownInsert = {text}
  const kind = asString(body["kind"])
  if (kind === "heading" || kind === "task" || kind === "note") insert.kind = kind
  const checked = asBoolean(body["checked"])
  if (checked !== undefined) insert.checked = checked
  const depth = asNumber(body["depth"])
  if (depth !== undefined) insert.depth = depth
  const afterId = asString(body["afterId"])
  if (afterId !== undefined) insert.afterId = afterId
  try {
    const result = insertTodoMarkdownItem(readTodoMarkdownForEdit(), insert)
    return writeTodoMarkdown(result.markdown, broadcast, {item: result.item})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function patchTodoItem(id: string, req: Request, broadcast: (payload: JsonObject) => void): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const patch: TodoMarkdownPatch = {}
  const text = asString(parsed.body["text"])
  if (text !== undefined) patch.text = text
  const checked = asBoolean(parsed.body["checked"])
  if (checked !== undefined) patch.checked = checked
  if (patch.text === undefined && patch.checked === undefined) return jsonResponse({ok: false, error: "text or checked required"}, 400)
  try {
    const result = updateTodoMarkdownItem(readTodoMarkdownForEdit(), id, patch)
    return writeTodoMarkdown(result.markdown, broadcast, {item: result.item})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

function deleteTodoItem(id: string, broadcast: (payload: JsonObject) => void): Response {
  try {
    const result = deleteTodoMarkdownItem(readTodoMarkdownForEdit(), id)
    return writeTodoMarkdown(result.markdown, broadcast, {removed: result.removed})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

function writeTodoMarkdown(text: string, broadcast: (payload: JsonObject) => void, extra: JsonObject = {}): Response {
  const path = todoMarkdownPath()
  writeFileSync(path, text, "utf8")
  const payload = todoMarkdownPayload()
  if (payload === null) return jsonResponse({ok: false, path, error: "TODO.md not found after write"}, 500)
  broadcast({type: "hud-todo-changed", todo: payload})
  return jsonResponse({...payload, ...extra})
}

function isAllowedWebSocketOrigin(req: Request, url: URL): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

function voiceProxyRouteForPath(path: string): VoiceProxyRoute | null {
  if (path === "/hud/voice/wake/ws") return "wake"
  if (path === "/hud/voice/asr/ws") return "asr"
  return null
}

function workspaceFilesModuleContextForSnapshot(snapshot: ModuleSnapshot): WorkspaceFilesModuleContext {
  return {
    id: snapshot.id,
    label: snapshot.label,
    modulePath: snapshot.modulePath,
    target: {
      command: snapshot.target.command,
      cwd: snapshot.target.cwd,
    },
  }
}

function contextPayload(options: HttpServerOptions, contexts: ModuleContextStore, hudTodo: HudTodoContextStore, hudSqlite: HudSqliteContextStore): JsonObject {
  const contextsPayload = processContextsPayload(options, contexts, hudTodo, hudSqlite)
  const active = contextsPayload.find((item) => asObject(item.context["display"])?.["active"] === true) ?? contextsPayload[0] ?? null
  if (active === null) return {ok: true, context: null}
  return {
    ok: true,
    kind: "process",
    processId: active.processId,
    moduleId: active.moduleId,
    label: active.label,
    context: active.context,
  }
}

function processContextsPayload(options: HttpServerOptions, contexts: ModuleContextStore, hudTodo: HudTodoContextStore, hudSqlite: HudSqliteContextStore): Array<{processId: string; moduleId: string; label: string; context: JsonObject}> {
  return options.modules.snapshots().map((module) => ({
    processId: module.id,
    moduleId: module.id,
    label: module.label,
    context: contextWithHud(contextForModule(module, contexts), hudTodo, hudSqlite),
  }))
}

function getProcessContext(processId: string, options: HttpServerOptions, contexts: ModuleContextStore, hudTodo: HudTodoContextStore, hudSqlite: HudSqliteContextStore): Response {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  const snapshot = module.snapshot()
  return jsonResponse({
    ok: true,
    kind: "process",
    processId: snapshot.id,
    moduleId: snapshot.id,
    label: snapshot.label,
    context: contextWithHud(contextForModule(snapshot, contexts), hudTodo, hudSqlite),
  })
}

function getProcessModules(processId: string, url: URL, options: HttpServerOptions): Response {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  const snapshot = module.snapshot()
  const catalog = workspaceFilesPayload(url, {module: workspaceFilesModuleContextForSnapshot(snapshot)})
  return jsonResponse({
    ok: true,
    processId: snapshot.id,
    kind: "module",
    moduleId: snapshot.id,
    label: snapshot.label,
    root: catalog.root,
    workspacePath: catalog.workspacePath,
    entrypoint: catalog.modulePath ?? null,
    modules: catalog.files,
  })
}

function contextForModule(module: ModuleSnapshot, contexts: ModuleContextStore): JsonObject {
  return contexts.get(module.id) ?? runtimeFallbackContext(module)
}

function contextWithHud(context: JsonObject, hudTodo: HudTodoContextStore, hudSqlite: HudSqliteContextStore): JsonObject {
  if (hudTodo.context === null && hudSqlite.context === null) return context
  const hud = asObject(context["hud"]) ?? {}
  const nextHud: JsonObject = {...hud}
  if (hudTodo.context !== null) nextHud["todo"] = hudTodo.context
  if (hudSqlite.context !== null) nextHud["sqlite"] = hudSqlite.context
  return {
    ...context,
    hud: nextHud,
  }
}

function runtimeFallbackContext(module: ModuleSnapshot): JsonObject {
  const frame = module.dump?.frames[0] ?? null
  const sourceState = module.connection.state !== "connected"
    ? "disconnected"
    : module.target.state === "exited"
      ? "exited"
      : module.target.state === "failed"
        ? "failed"
        : module.paused
          ? "paused"
          : module.target.state === "running" || module.target.state === "starting"
            ? "running"
            : "idle"
  const cursor = {
    line: Math.max(1, frame?.line ?? 1),
    column: Math.max(0, frame?.column ?? 0),
  }
  return {
    processId: module.id,
    moduleId: module.id,
    displayId: moduleDisplayId(module.id),
    label: module.label,
    origin: "runtime",
    updatedAt: module.dump?.timestamp ?? new Date().toISOString(),
    receivedAt: null,
    display: null,
    source: {
      state: sourceState,
      location: frame === null ? "" : `${frame.url}:${frame.line}`,
      identity: null,
      cursor,
      selection: null,
      selections: [],
    },
    activeFrameIndex: frame === null ? null : 0,
    currentFrame: frame === null ? null : {
      index: frame.index,
      function: frame.function,
      url: frame.url,
      line: frame.line,
      column: frame.column,
      ...(frame.sourceKind === undefined ? {} : {sourceKind: frame.sourceKind}),
      ...(frame.scriptId === undefined ? {} : {scriptId: frame.scriptId}),
    },
    terminal: {
      focused: false,
      pendingInput: "",
      promptVisible: false,
      selection: null,
    },
  }
}

function moduleDisplayId(moduleId: string): string {
  return `module:${moduleId}`
}

function decodePathParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function moduleForProcessId(processId: string, options: HttpServerOptions): InterpreterModule | undefined {
  return options.modules.get(processId)
}

function processNotFoundResponse(processId: string): Response {
  return jsonResponse({ok: false, processId, error: `process not found: ${processId}`}, 404)
}

function healthPayload(options: HttpServerOptions): JsonObject {
  const modules = options.modules.snapshots()
  return {
    ok: true,
    processCount: modules.length,
    processes: modules.map(processPayload),
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === "127.0.0.1"
    || normalized === "localhost"
    || normalized === "::1"
    || normalized === "[::1]"
}

const SOURCE_CACHE_MAX = 32
const sourceCache = new Map<string, string>()
const tokenCache = new Map<string, import("./syntax.ts").SourceTokens>()

function clearSourceCaches(): void {
  sourceCache.clear()
  tokenCache.clear()
}

function sourceCacheKey(scriptId: string, url: string | undefined): string {
  return `${scriptId}\0${url ?? ""}`
}

function lruSet<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > max) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const value = cache.get(key)
  if (value === undefined) return undefined
  cache.delete(key)
  cache.set(key, value)
  return value
}

function parseCommand(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.some((item) => typeof item !== "string")) return undefined
  return value
}

async function readJsonObject(req: Request): Promise<{body: JsonObject; error?: string}> {
  const text = await req.text()
  if (text.length === 0) return {body: {}}
  try {
    return {body: asObject(JSON.parse(text)) ?? {}}
  } catch (error) {
    return {body: {}, error: `invalid JSON: ${serializeError(error)}`}
  }
}

async function codexAttachmentResponse(req: Request): Promise<Response> {
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
  if (bytes.length > CODEX_ATTACHMENT_MAX_BYTES) return jsonResponse({ok: false, error: "attachment is larger than 16 MB"}, 413)
  const dir = resolve(process.cwd(), CODEX_ATTACHMENT_DIR)
  mkdirSync(dir, {recursive: true})
  const safeName = safeAttachmentFilename(name, ext)
  const id = crypto.randomUUID()
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

async function readPatchText(req: Request): Promise<{patch?: string; error?: string}> {
  const patch = await req.text()
  return patch.length === 0 ? {error: "patch required"} : {patch}
}

function envStrings(value: unknown): Record<string, string> | undefined {
  const env = asObject(value)
  if (env === undefined) return undefined
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => typeof v === "string") as Array<[string, string]>,
  )
}

function processPayloads(options: HttpServerOptions): JsonObject[] {
  return options.modules.snapshots().map(processPayload)
}

function processPayload(snapshot: ModuleSnapshot): JsonObject {
  return {
    id: snapshot.id,
    processId: snapshot.id,
    moduleId: snapshot.id,
    label: snapshot.label,
    space: {
      displayId: moduleDisplayId(snapshot.id),
    },
    content: {
      kind: "module",
      modulePath: snapshot.modulePath,
    },
    runtime: {
      protocolUrl: snapshot.protocolUrl,
      connection: snapshot.connection,
      paused: snapshot.paused,
      breakpointsActive: snapshot.breakpointsActive,
      scriptCount: snapshot.scriptCount,
      hasDump: snapshot.hasDump,
      target: snapshot.target,
    },
  }
}

async function runProcess(req: Request, options: HttpServerOptions): Promise<Response> {
  const parsed = await readModuleRunOptions(req)
  if ("response" in parsed) return parsed.response

  try {
    const module = options.modules.run(parsed.run)
    return jsonResponse({ok: true, process: processPayload(module.snapshot()), processes: processPayloads(options)})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 409)
  }
}

async function readModuleRunOptions(req: Request): Promise<{run: StartupModuleOptions & {id?: string; label?: string; protocolUrl?: string}} | {response: Response}> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return {response: jsonResponse({ok: false, error: parsed.error}, 400)}
  const body = parsed.body
  const command = parseCommand(body["command"])
  if (command === undefined || command.length === 0) {
    return {response: jsonResponse({ok: false, error: "command must be non-empty array of strings"}, 400)}
  }
  const parsedBreakpoints = parseBreakpoints(body["breakpoints"])
  if (parsedBreakpoints.error !== undefined) return {response: jsonResponse({ok: false, error: parsedBreakpoints.error}, 400)}

  const label = asString(body["label"])
  const id = asString(body["processId"]) ?? asString(body["id"])
  const modulePath = asString(body["modulePath"])
  const protocolUrl = asString(body["protocolUrl"])
  const cwd = asString(body["cwd"])
  const env = envStrings(body["env"])
  const pauseOnStart = body["pauseOnStart"] === true
  const run: StartupModuleOptions & {id?: string; label?: string; protocolUrl?: string} = {command, pauseOnStart}
  if (id !== undefined) run.id = id
  if (label !== undefined) run.label = label
  if (modulePath !== undefined) run.modulePath = modulePath
  if (protocolUrl !== undefined) run.protocolUrl = protocolUrl
  if (cwd !== undefined) run.cwd = cwd
  if (env !== undefined) run.env = env
  if (parsedBreakpoints.breakpoints !== undefined) run.breakpoints = parsedBreakpoints.breakpoints
  return {run}
}

function getProcessBreakpoints(processId: string, options: HttpServerOptions): Response {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return jsonResponse(module.breakpoints.registrations)
}

async function setProcessBreakpoint(processId: string, req: Request, options: HttpServerOptions, broadcast: (payload: JsonObject) => void): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return await setBreakpoint(req, module, broadcast)
}

async function removeProcessBreakpoint(processId: string, req: Request, options: HttpServerOptions, broadcast: (payload: JsonObject) => void): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return await removeBreakpoint(req, module, broadcast)
}

async function setBreakpoint(req: Request, module: InterpreterModule, broadcast: (payload: JsonObject) => void): Promise<Response> {
  let body: JsonObject = {}
  const text = await req.text()
  if (text.length > 0) {
    try {
      body = asObject(JSON.parse(text)) ?? {}
    } catch (error) {
      return jsonResponse({ok: false, error: `invalid JSON: ${serializeError(error)}`}, 400)
    }
  }
  const line = asNumber(body["line"])
  if (!isPositiveInteger(line)) return jsonResponse({ok: false, error: "line must be a positive integer (1-based)"}, 400)
  const url = asString(body["url"])
  const urlRegex = asString(body["urlRegex"])
  const sourceUrl = asString(body["sourceUrl"])
  if (url === undefined && urlRegex === undefined && sourceUrl === undefined) {
    return jsonResponse({ok: false, error: "url, sourceUrl or urlRegex required"}, 400)
  }
  const column = asNumber(body["column"])
  if (column !== undefined && !isNonNegativeInteger(column)) {
    return jsonResponse({ok: false, error: "column must be a non-negative integer (0-based)"}, 400)
  }
  const condition = asString(body["condition"])
  const spec: import("./target.ts").BreakpointSpec = {line}
  if (url !== undefined) spec.url = url
  if (sourceUrl !== undefined) spec.sourceUrl = sourceUrl
  if (urlRegex !== undefined) spec.urlRegex = urlRegex
  if (column !== undefined) spec.column = column
  if (condition !== undefined) spec.condition = condition

  try {
    const registration = module.breakpoints.add(spec)
    await module.breakpoints.armPendingByUrl([registration.id])
    await module.breakpoints.applyToScripts(module.snapshots.scripts)
    const breakpoints = module.breakpoints.registrations
    broadcast({type: "breakpoints-changed", moduleId: module.id, reason: "set", breakpoint: registration, breakpoints})
    return jsonResponse({ok: true, breakpoint: registration, breakpoints})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 500)
  }
}

async function removeBreakpoint(req: Request, module: InterpreterModule, broadcast: (payload: JsonObject) => void): Promise<Response> {
  let body: JsonObject = {}
  const text = await req.text()
  if (text.length > 0) {
    try {
      body = asObject(JSON.parse(text)) ?? {}
    } catch (error) {
      return jsonResponse({ok: false, error: `invalid JSON: ${serializeError(error)}`}, 400)
    }
  }
  const id = asString(body["id"])
  const breakpointId = asString(body["breakpointId"])
  const idOrBreakpointId = id ?? breakpointId
  if (idOrBreakpointId === undefined) {
    return jsonResponse({ok: false, error: "id or breakpointId required (получи его из /processes/:id/breakpoint или /processes/:id/breakpoints)"}, 400)
  }
  try {
    const removed = await module.breakpoints.remove(idOrBreakpointId)
    const breakpoints = module.breakpoints.registrations
    broadcast({type: "breakpoints-changed", moduleId: module.id, reason: "remove", removed, breakpoints})
    return jsonResponse({ok: true, removed, breakpoints})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 500)
  }
}

function parseBreakpoints(value: unknown): {
  breakpoints?: import("./target.ts").BreakpointSpec[]
  error?: string
} {
  if (value === undefined) return {}
  if (!Array.isArray(value)) return {error: "breakpoints must be an array"}
  const out: import("./target.ts").BreakpointSpec[] = []
  for (const [index, raw] of value.entries()) {
    const obj = asObject(raw)
    if (obj === undefined) return {error: `breakpoints[${index}] must be an object`}
    const line = asNumber(obj["line"])
    if (!isPositiveInteger(line)) return {error: `breakpoints[${index}].line must be a positive integer (1-based)`}
    const url = asString(obj["url"])
    const urlRegex = asString(obj["urlRegex"])
    const sourceUrl = asString(obj["sourceUrl"])
    if (url === undefined && urlRegex === undefined && sourceUrl === undefined) {
      return {error: `breakpoints[${index}] must include url, sourceUrl or urlRegex`}
    }
    const spec: import("./target.ts").BreakpointSpec = {line}
    if (url !== undefined) spec.url = url
    if (sourceUrl !== undefined) spec.sourceUrl = sourceUrl
    if (urlRegex !== undefined) spec.urlRegex = urlRegex
    const column = asNumber(obj["column"])
    if (column !== undefined && !isNonNegativeInteger(column)) {
      return {error: `breakpoints[${index}].column must be a non-negative integer (0-based)`}
    }
    if (column !== undefined) spec.column = column
    const condition = asString(obj["condition"])
    if (condition !== undefined) spec.condition = condition
    out.push(spec)
  }
  return {breakpoints: out}
}

function isPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0
}

async function getProcessScriptSource(processId: string, url: URL, options: HttpServerOptions): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return await getScriptSourceForModule(url, module, processId)
}

async function getScriptSourceForModule(url: URL, module: InterpreterModule, cacheScope: string): Promise<Response> {
  const scriptId = url.searchParams.get("scriptId") ?? ""
  const sourceUrl = url.searchParams.get("sourceUrl") ?? undefined
  if (scriptId.length === 0) return getSourceFile(sourceUrl, url)

  const sourceKind = url.searchParams.get("sourceKind")
  const script = module.snapshots.scriptInfo(scriptId)
  const fileUrl = script?.url
  const mappedSource = sourceKind === "runtime" ? null : sourceMapMapper(script?.sourceMapURL).sourceContent(sourceUrl ?? fileUrl)
  const includeTokens = url.searchParams.get("tokens") !== "0"
  const responseUrl = mappedSource?.source ?? fileUrl ?? ""
  const mappedSourcePath = mappedSource === null ? undefined : sourceFilePath(mappedSource.source)
  if (mappedSourcePath !== undefined && isReadableFile(mappedSourcePath)) {
    try {
      return sourceFileResponse({
        scriptId,
        url: mappedSource?.source ?? responseUrl,
        scriptUrl: fileUrl ?? "",
        path: mappedSourcePath,
        includeTokens,
        cacheScope: `${cacheScope}:${scriptId}`,
      })
    } catch {
      // Fall back to the embedded source map content if the local file becomes unreadable.
    }
  }
  const cacheKey = sourceCacheKey(`${cacheScope}:${scriptId}`, `${mappedSource === null ? "runtime" : "sourcemap"}\0${responseUrl}`)

  const cachedSource = lruGet(sourceCache, cacheKey)
  if (cachedSource !== undefined) {
    return jsonResponse({
      scriptId,
      url: responseUrl,
      scriptUrl: fileUrl ?? "",
      scriptSource: cachedSource,
      tokens: includeTokens ? tokensFor(cacheKey, cachedSource, responseUrl) : undefined,
      sourceKind: mappedSource === null ? "runtime" : "sourcemap",
      cached: true,
    })
  }

  if (mappedSource !== null) {
    lruSet(sourceCache, cacheKey, mappedSource.content, SOURCE_CACHE_MAX)
    return jsonResponse({
      scriptId,
      url: mappedSource.source,
      scriptUrl: fileUrl ?? "",
      scriptSource: mappedSource.content,
      tokens: includeTokens ? tokensFor(cacheKey, mappedSource.content, mappedSource.source) : undefined,
      sourceKind: "sourcemap",
      cached: false,
    })
  }

  try {
    const result = asObject(await module.client.request("Debugger.getScriptSource", {scriptId}))
    const scriptSource = asString(result?.["scriptSource"]) ?? ""
    if (scriptSource.length > 0) lruSet(sourceCache, cacheKey, scriptSource, SOURCE_CACHE_MAX)
    return jsonResponse({
      scriptId,
      url: fileUrl ?? "",
      scriptUrl: fileUrl ?? "",
      scriptSource,
      tokens: includeTokens && scriptSource.length > 0 ? tokensFor(cacheKey, scriptSource, fileUrl ?? "") : undefined,
      sourceKind: "runtime",
      cached: false,
    })
  } catch (error) {
    const fallbackUrl = sourceUrl ?? fileUrl
    if (fallbackUrl !== undefined && fallbackUrl.trim().length > 0) {
      const fallback = getSourceFile(fallbackUrl, url)
      if (fallback.status < 400) return fallback
    }
    return jsonResponse({ok: false, scriptId, error: serializeError(error)}, 500)
  }
}

function getSourceFile(sourceUrl: string | undefined, url: URL): Response {
  const optional = url.searchParams.get("optional") === "1"
  if (sourceUrl === undefined || sourceUrl.trim().length === 0) {
    return jsonResponse({ok: false, error: "scriptId or sourceUrl required"}, optional ? 200 : 400)
  }

  const path = sourceFilePath(sourceUrl)
  if (path === undefined) {
    return jsonResponse({ok: false, scriptId: "", url: sourceUrl, error: "sourceUrl is not a local file path"}, optional ? 200 : 400)
  }

  try {
    const includeTokens = url.searchParams.get("tokens") !== "0"
    return sourceFileResponse({
      scriptId: "",
      url: sourceUrl,
      scriptUrl: "",
      path,
      includeTokens,
      cacheScope: "",
    })
  } catch (error) {
    return jsonResponse({ok: false, scriptId: "", url: sourceUrl, error: serializeError(error)}, optional ? 200 : 404)
  }
}

function sourceFileResponse(options: {
  scriptId: string
  url: string
  scriptUrl: string
  path: string
  includeTokens: boolean
  cacheScope: string
}): Response {
  const scriptSource = readFileSync(options.path, "utf8")
  const stat = statSync(options.path)
  const cacheKey = sourceCacheKey(options.cacheScope, `file\0${options.path}\0${stat.size}\0${stat.mtimeMs}`)
  lruSet(sourceCache, cacheKey, scriptSource, SOURCE_CACHE_MAX)
  return jsonResponse({
    scriptId: options.scriptId,
    url: options.url,
    scriptUrl: options.scriptUrl,
    scriptSource,
    tokens: options.includeTokens ? tokensFor(cacheKey, scriptSource, options.url) : undefined,
    sourceKind: "file",
    cached: false,
  })
}

async function saveModuleSource(
  moduleId: string,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  if (options.modules.get(moduleId) === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const sourceUrl = asString(parsed.body["sourceUrl"])
    ?? asString(parsed.body["path"])
    ?? asString(parsed.body["modulePath"])
  const text = asString(parsed.body["text"])
    ?? asString(parsed.body["scriptSource"])
    ?? asString(parsed.body["content"])
  if (sourceUrl === undefined || sourceUrl.trim().length === 0) return jsonResponse({ok: false, error: "sourceUrl required"}, 400)
  if (text === undefined) return jsonResponse({ok: false, error: "text required"}, 400)

  const filePath = sourceFilePath(sourceUrl)
  if (filePath === undefined) return jsonResponse({ok: false, sourceUrl, error: "sourceUrl is not a local file path"}, 400)

  const before = readFileSync(filePath, "utf8")
  const patch = createReplaceFilePatch(filePath, before, text)
  let result: ApplyPatchResult = {ok: true, files: []}
  if (patch !== null) {
    let breakpointUpdates: SourcePatchBreakpointUpdate[] = []
    try {
      result = applyPatch({patch})
      breakpointUpdates = await remapBreakpointsForPatch(options, result, sourceUrl)
    } catch (error) {
      return jsonResponse({ok: false, sourceUrl, path: filePath, error: serializeError(error)}, 400)
    }
    clearSourceCaches()
    broadcastSourcePatched(options, broadcast, moduleId, "save", result, sourceUrl, breakpointUpdates)
    const replay = await replayModulesForPatch(options, result)
    return jsonResponse({
      ok: true,
      moduleId,
      sourceUrl,
      path: filePath,
      bytes: Buffer.byteLength(text, "utf8"),
      mtimeMs: statSync(filePath).mtimeMs,
      size: statSync(filePath).size,
      patch: result,
      replay,
    })
  }
  const stat = statSync(filePath)
  return jsonResponse({
    ok: true,
    moduleId,
    sourceUrl,
    path: filePath,
    bytes: Buffer.byteLength(text, "utf8"),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    patch: result,
    replay: [],
  })
}

async function saveProcessSource(
  processId: string,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return await saveModuleSource(module.id, req, options, broadcast)
}

async function applyModulePatch(
  moduleId: string,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  if (options.modules.get(moduleId) === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const parsed = await readPatchText(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const patch = parsed.patch
  if (patch === undefined || patch.trim().length === 0) return jsonResponse({ok: false, error: "patch required"}, 400)

  try {
    const result = applyPatch({patch})
    const breakpointUpdates = await remapBreakpointsForPatch(options, result)
    if (result.files.length > 0) {
      clearSourceCaches()
      broadcastSourcePatched(options, broadcast, moduleId, "apply_patch", result, undefined, breakpointUpdates)
    }
    const replay = await replayModulesForPatch(options, result)
    return jsonResponse({ok: true, moduleId, patch: result, breakpoints: breakpointUpdates, replay})
  } catch (error) {
    return jsonResponse({ok: false, moduleId, error: serializeError(error)}, 400)
  }
}

async function applyProcessPatch(
  processId: string,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  const module = moduleForProcessId(processId, options)
  if (module === undefined) return processNotFoundResponse(processId)
  return await applyModulePatch(module.id, req, options, broadcast)
}

async function remapBreakpointsForPatch(
  options: HttpServerOptions,
  result: ApplyPatchResult,
  sourceUrl?: string,
): Promise<SourcePatchBreakpointUpdate[]> {
  const byModule = new Map<string, BreakpointRegistration[]>()
  for (const file of result.files) {
    if (file.lineChanges.length === 0) continue
    const changeSourceUrl = sourceUrl ?? sourceUrlFromPath(file.path)
    for (const module of options.modules.list()) {
      const remapped = await module.breakpoints.remapLinesForSource({
        path: file.path,
        sourceUrl: changeSourceUrl,
        lineChanges: file.lineChanges,
      }, module.snapshots.scripts)
      if (remapped.length === 0) continue
      byModule.set(module.id, module.breakpoints.registrations)
    }
  }
  return [...byModule].map(([moduleId, breakpoints]) => ({moduleId, breakpoints}))
}

async function replayModulesForPatch(options: HttpServerOptions, result: ApplyPatchResult): Promise<SourcePatchReplayResult[]> {
  const modules = affectedModulesForPatch(options, result)
  const replayed: SourcePatchReplayResult[] = []
  for (const module of modules) {
    const snapshot = module.snapshot()
    if (snapshot.target.command.length === 0) {
      replayed.push({moduleId: module.id, status: "skipped", reason: "target has no command"})
      continue
    }
    if (snapshot.target.state !== "running" && snapshot.target.state !== "starting") {
      replayed.push({moduleId: module.id, status: "skipped", reason: `target is ${snapshot.target.state}`})
      continue
    }
    try {
      const breakpoints = module.breakpoints.registrations.map((registration) => registration.spec)
      const runTo = replayRunToForPatch(module, result)
      const target = await module.replayTarget({
        breakpoints,
        ...(runTo === undefined ? {} : {runTo}),
      })
      replayed.push({moduleId: module.id, status: "replayed", target})
      options.logger.event("source.patch.replay", {moduleId: module.id, fileCount: result.files.length, runTo, target})
    } catch (error) {
      const reason = serializeError(error)
      replayed.push({moduleId: module.id, status: "failed", reason})
      options.logger.event("source.patch.replay.failed", {moduleId: module.id, error: reason})
    }
  }
  return replayed
}

function replayRunToForPatch(module: InterpreterModule, result: ApplyPatchResult): BreakpointSpec | undefined {
  const frame = module.snapshot().dump?.frames[0]
  if (frame === undefined || frame.line <= 0 || frame.url.trim().length === 0) return undefined

  let line = frame.line
  let affected = false
  for (const file of result.files) {
    if (!patchFileMatchesSource(file, frame.url)) continue
    affected = true
    if (file.lineChanges.length > 0) line = remapBreakpointLine(line, file.lineChanges)
  }
  if (!affected) return undefined

  const spec: BreakpointSpec = {line}
  const scriptUrl = frame.scriptId === undefined ? undefined : module.snapshots.scriptInfo(frame.scriptId)?.url
  if (frame.sourceKind === "runtime") {
    spec.url = frame.url
  } else {
    spec.sourceUrl = frame.url
    if (scriptUrl !== undefined && scriptUrl.length > 0) spec.url = scriptUrl
  }
  return spec
}

function affectedModulesForPatch(options: HttpServerOptions, result: ApplyPatchResult): InterpreterModule[] {
  const out: InterpreterModule[] = []
  for (const module of options.modules.list()) {
    if (result.files.some((file) => patchFileAffectsModule(file, module))) out.push(module)
  }
  return out
}

function patchFileAffectsModule(file: ApplyPatchFileChange, module: InterpreterModule): boolean {
  const paths = [
    file.path,
    file.oldPath,
    sourceUrlFromPath(file.path),
    ...(file.oldPath === undefined ? [] : [sourceUrlFromPath(file.oldPath)]),
  ].filter((value): value is string => value !== undefined && value.length > 0)

  if (module.modulePath !== null && paths.some((path) => sameSourcePath(path, module.modulePath!))) return true
  for (const registration of module.breakpoints.registrations) {
    for (const source of [registration.spec.url, registration.spec.sourceUrl]) {
      if (source !== undefined && paths.some((path) => sameSourcePath(path, source))) return true
    }
    if (registration.spec.urlRegex !== undefined && paths.some((path) => sourceRegexMatches(registration.spec.urlRegex!, path))) return true
  }
  for (const script of module.snapshots.scripts) {
    if (paths.some((path) => sameSourcePath(path, script.url))) return true
    const mapper = sourceMapMapper(script.sourceMapURL)
    if (mapper.sources().some((source) => paths.some((path) => sameSourcePath(path, source)))) return true
  }
  return false
}

function patchFileMatchesSource(file: ApplyPatchFileChange, source: string): boolean {
  return [
    file.path,
    file.oldPath,
    sourceUrlFromPath(file.path),
    ...(file.oldPath === undefined ? [] : [sourceUrlFromPath(file.oldPath)]),
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .some((path) => sameSourcePath(path, source))
}

function broadcastSourcePatched(
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
  moduleId: string,
  reason: SourcePatchReason,
  result: ApplyPatchResult,
  sourceUrl?: string,
  breakpoints: SourcePatchBreakpointUpdate[] = [],
): void {
  const files = result.files.map((file) => sourcePatchFilePayload(file, sourceUrl))
  options.logger.event("source.patched", {moduleId, reason, files, breakpoints})
  broadcast({type: "source-patched", moduleId, reason, files, breakpoints})
}

function sourcePatchFilePayload(file: ApplyPatchFileChange, sourceUrl: string | undefined): JsonObject {
  let size: number | undefined
  let mtimeMs: number | undefined
  if (file.operation !== "delete") {
    try {
      const stat = statSync(file.path)
      size = stat.size
      mtimeMs = stat.mtimeMs
    } catch {
      // The patch has already been applied; stat failures are diagnostic only.
    }
  }
  return {
    ...file,
    sourceUrl: sourceUrl ?? sourceUrlFromPath(file.path),
    ...(size === undefined ? {} : {size}),
    ...(mtimeMs === undefined ? {} : {mtimeMs}),
  }
}

function sourceUrlFromPath(path: string): string {
  const rel = relative(process.cwd(), path).replaceAll("\\", "/")
  return rel.startsWith("..") ? path : rel
}

function sameSourcePath(a: string, b: string): boolean {
  const aVariants = sourcePathVariants(a)
  const bVariants = sourcePathVariants(b)
  return aVariants.some((left) => bVariants.some((right) => (
    left === right
    || left.endsWith(`/${right}`)
    || right.endsWith(`/${left}`)
  )))
}

function sourceRegexMatches(pattern: string, path: string): boolean {
  try {
    const regex = new RegExp(pattern)
    return sourcePathVariants(path).some((variant) => regex.test(variant))
  } catch {
    return false
  }
}

function sourcePathVariants(input: string): string[] {
  const out = new Set<string>()
  const clean = input.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.length === 0) return []
  out.add(clean)
  if (clean.startsWith("file:")) {
    try {
      out.add(fileURLToPath(clean).replaceAll("\\", "/"))
    } catch {}
  }
  const withoutRuntimePrefix = clean.replace(/^r\//, "")
  out.add(withoutRuntimePrefix)
  const absolute = sourceFilePath(clean)
  if (absolute !== undefined) {
    out.add(absolute.replaceAll("\\", "/"))
    out.add(sourceUrlFromPath(absolute))
  }
  return [...out].filter((item) => item.length > 0)
}

function sourceFilePath(sourceUrl: string): string | undefined {
  const clean = sourceUrl.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
  if (clean.startsWith("file:")) {
    try {
      return existingSourcePath(fileURLToPath(clean)) ?? fileURLToPath(clean)
    } catch {
      return undefined
    }
  }
  if (/^[A-Za-z]:\//.test(clean) || clean.startsWith("/")) return existingSourcePath(clean) ?? clean

  const stripped = clean.replace(/^(?:\.\.\/)+/, "").replace(/^\.\//, "")
  return existingSourcePath(stripped) ?? resolve(process.cwd(), stripped)
}

function existingSourcePath(path: string): string | undefined {
  const normalized = path.replaceAll("\\", "/")
  const direct = /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")
    ? normalized
    : resolve(process.cwd(), normalized)
  if (isReadableFile(direct)) return direct

  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..")
  for (let offset = 1; offset < parts.length; offset++) {
    const suffix = resolve(process.cwd(), parts.slice(offset).join("/"))
    if (isReadableFile(suffix)) return suffix
  }
  return undefined
}

function isReadableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

function tokensFor(cacheKey: string, source: string, path: string): import("./syntax.ts").SourceTokens {
  const cached = lruGet(tokenCache, cacheKey)
  if (cached !== undefined) return cached
  const {tokenizeSource} = require("./syntax.ts") as typeof import("./syntax.ts")
  const tokens = tokenizeSource(source, {path})
  lruSet(tokenCache, cacheKey, tokens, SOURCE_CACHE_MAX)
  return tokens
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {"content-type": "application/json; charset=utf-8"},
  })
}

type NdjsonTailResult = {
  path: string
  count: number
  total: number
  truncated: boolean
  lines: JsonObject[]
}

function readNdjsonTail(path: string, url: URL): NdjsonTailResult {
  const since = url.searchParams.get("since") ?? undefined
  const limitParam = url.searchParams.get("limit") ?? undefined
  const limit = clampLimit(limitParam ? Number(limitParam) : NDJSON_TAIL_DEFAULT_LIMIT)

  if (!existsSync(path)) {
    return {path, count: 0, total: 0, truncated: false, lines: []}
  }

  const allLines = readNdjsonLines(path)
  const filtered = since !== undefined ? allLines.filter((line) => isAfter(line, since)) : allLines
  const total = filtered.length
  const tail = filtered.slice(-limit)

  return {
    path,
    count: tail.length,
    total,
    truncated: tail.length < total,
    lines: tail,
  }
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return NDJSON_TAIL_DEFAULT_LIMIT
  if (value > NDJSON_TAIL_MAX_LIMIT) return NDJSON_TAIL_MAX_LIMIT
  return value
}

function readNdjsonLines(path: string): JsonObject[] {
  // Читаем последние ~2 MiB файла — этого хватает для хвоста, но не вытягивает огромные логи в память.
  const chunkSize = 2 * 1024 * 1024
  const stat = statSync(path)
  const start = stat.size > chunkSize ? stat.size - chunkSize : 0
  const fd = openSync(path, "r")
  const buffer = Buffer.alloc(stat.size - start)
  try {
    readSync(fd, buffer, 0, buffer.byteLength, start)
  } finally {
    closeSync(fd)
  }

  const text = buffer.toString("utf8")
  const lines: JsonObject[] = []
  let firstLineSkipped = start === 0
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    if (!firstLineSkipped) {
      // первая строка может быть обрезана — пропускаем
      firstLineSkipped = true
      continue
    }
    try {
      const parsed = JSON.parse(trimmed)
      const obj = asObject(parsed)
      if (obj !== undefined) lines.push(obj)
    } catch {
      // строка повреждена — пропускаем молча, не валим API
    }
  }
  return lines
}

function isAfter(line: JsonObject, sinceIso: string): boolean {
  const ts = asString(line["ts"]) ?? asString(line["timestamp"])
  const seq = asNumber(line["seq"])
  if (ts === undefined && seq === undefined) return true

  const sinceNum = Number(sinceIso)
  if (!Number.isNaN(sinceNum) && seq !== undefined) {
    return seq > sinceNum
  }
  if (ts !== undefined) {
    const lineTime = Date.parse(ts)
    const sinceTime = Date.parse(sinceIso)
    if (!Number.isNaN(lineTime) && !Number.isNaN(sinceTime)) return lineTime > sinceTime
  }
  return true
}
