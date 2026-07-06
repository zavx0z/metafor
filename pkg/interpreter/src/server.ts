/**
 * HTTP+WebSocket сервер: Codex-style tools API + полнофункциональный web-UI интерпретатора.
 *
 * Архитектура:
 *   - `POST /tools` поверх runtime/UI функций — для agent-facing команд.
 *   - WebSocket `/ws` — пуш state/resumed/console/result в браузерный UI и приём
 *     `{type:"command",...}` сообщений из UI.
 *   - HTML/JS UI отдаётся через Bun fullstack-bundler: `import indexHtml from "../web/index.html"`,
 *     все импорты внутри HTML транспилятся Bun'ом на лету.
 *
 * Файлы (`.events.log`, `.console.log`) сохранены как архив и читаются через
 * tools `events.tail` и `console.tail`.
 */

import type {ServerWebSocket, WebSocketHandler} from "bun"
import {spawnSync} from "node:child_process"
import {createHash} from "node:crypto"
import {existsSync, statSync, openSync, readSync, closeSync, readFileSync, writeFileSync, mkdirSync, watch, type FSWatcher} from "node:fs"
import {basename, dirname, extname, join, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import indexHtml from "../web/index.html"

const WEB_DIR = join(import.meta.dir, "..", "web")
const INTERPRETER_RESTART_DELAY_MS = 650
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
import {normalizeBreakpointSpec, remapBreakpointLine, type BreakpointRegistration} from "./breakpoints.ts"
import {
  attachPtyDaemonProxy,
  detachPtyDaemonProxy,
  ensurePtyDaemon,
  ptyDaemonBaseUrl,
  ptyDaemonTerminalUrlFromRequest,
  relayPtyDaemonProxyMessage,
  type PtyDaemonProxySocketData,
} from "@metafor/pty/server"
import type {InterpreterModule, InterpreterModuleManager, StartupModuleOptions} from "./module.ts"
import type {BreakpointSpec} from "./target.ts"
import {workspaceFilesPayload, type WorkspaceFilesModuleContext} from "./workspace-files.ts"
import {sqliteDatabaseFingerprint, sqliteDatabaseInputPath, sqliteDatabasePayload, sqliteJsonError, updateSqliteCell, type SqliteDatabaseFingerprint, type SqliteDatabasePayload} from "./sqlite-db.ts"
import {interpreterRoutes, interpreterTools} from "./routes.ts"
import {parseInterpreterToolRequest, type InterpreterToolUse} from "./tools.ts"
import {handleBrowserHostRoute} from "./browser-host.ts"
import {handleChromeDevtoolsRoute} from "./chrome-devtools.ts"
import {remoteDesktopLifecycleCommandResponse, remoteDesktopLifecycleStatusResponse} from "./remote-desktop-lifecycle.ts"
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
  isTodoTaskMarker,
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

type TerminalWsClientData = PtyDaemonProxySocketData & {
  kind: "terminal"
  id: number
  connectedAt: number
}

type RtcSignalWsClientData = {
  kind: "rtc-signal"
  id: number
  room: string
  peerId: string
  path: string
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
  const ptydBaseUrl = ptyDaemonBaseUrl()
  let nextWsClientId = 1
  let nextTerminalClientId = 1
  let nextUiHostRequestId = 1
  const pendingUiHostRequests = new Map<number, UiHostPendingRequest>()
  const moduleContexts: ModuleContextStore = new Map()
  const moduleContextClientIds = new Map<string, number>()
  const hudTodoContext: HudTodoContextStore = {context: null}
  const hudSqliteContext: HudSqliteContextStore = {context: null}

  if (!isLoopbackHost(options.host)) {
    const warning = "process.start in /tools can execute local commands; bind the interpreter to loopback unless this is intentional"
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
        attachRtcSignalSocket(ws as ServerWebSocket<RtcSignalWsClientData>, options.logger)
        return
      }
      if (ws.data.kind === "terminal") {
        options.logger.event("terminal.client.opened", {id: ws.data.id})
        try {
          attachPtyDaemonProxy(ws as ServerWebSocket<TerminalWsClientData>)
          options.logger.event("terminal.proxy.attached", {clientId: ws.data.id, target: ws.data.ptydTerminalUrl})
        } catch (error) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({
            type: "terminal.error",
            message: error instanceof Error ? error.message : "ptyd attach failed",
          }))
          ws.close(1011, "ptyd attach failed")
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
        handleRtcSignalMessage(ws as ServerWebSocket<RtcSignalWsClientData>, raw, options.logger)
        return
      }
      if (ws.data.kind === "terminal") {
        relayPtyDaemonProxyMessage(ws as ServerWebSocket<TerminalWsClientData>, raw)
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
        detachRtcSignalSocket(ws as ServerWebSocket<RtcSignalWsClientData>, options.logger)
        return
      }
      if (ws.data.kind === "terminal") {
        detachPtyDaemonProxy(ws as ServerWebSocket<TerminalWsClientData>)
        options.logger.event("terminal.client.closed", {id: ws.data.id})
        return
      }

      wsClients.delete(ws)
      removeModuleContextClient(moduleContextClientIds, ws.data.id)
      rejectPendingUiHostRequestsForClient(ws.data.id, pendingUiHostRequests)
      options.logger.event("ws.client.closed", {id: ws.data.id, total: wsClients.size})
    },
  }

  type RouteRequest = Request & {params: Record<string, string>}
  type RouteHandler = (req: RouteRequest) => Response | Promise<Response>

  const routePath = (req: Request): string => new URL(req.url).pathname.replace(/\/+$/, "") || "/"
  const route = (method: string, path: string, handler: RouteHandler) => {
    return async (req: RouteRequest): Promise<Response> => {
      const start = Date.now()
      try {
        const response = await handler(req)
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
    }
  }
  const requestRoute = (method: string, handler: (req: RouteRequest, path: string) => Response | Promise<Response>) => {
    return async (req: RouteRequest): Promise<Response> => {
      const path = routePath(req)
      const start = Date.now()
      try {
        const response = await handler(req, path)
        options.logger.event("http.request", {method, path, status: response.status, durationMs: Date.now() - start})
        return response
      } catch (error) {
        const message = serializeError(error)
        options.logger.event("http.error", {method, path, error: message})
        return jsonResponse({ok: false, error: message}, 500)
      }
    }
  }
  const browserRoute = (method: string, path: string) => route(method, path, async (req) => {
    const response = await handleBrowserHostRoute(req, method, path)
    if (response === null) throw new Error(`browser host route did not match ${method} ${path}`)
    return response
  })
  const browserRequestRoute = (method: string) => requestRoute(method, async (req, path) => {
    const response = await handleBrowserHostRoute(req, method, path)
    if (response === null) throw new Error(`browser host route did not match ${method} ${path}`)
    return response
  })
  const browserProxyRoutes = {
    GET: browserRequestRoute("GET"),
    HEAD: browserRequestRoute("HEAD"),
    POST: browserRequestRoute("POST"),
    PUT: browserRequestRoute("PUT"),
    PATCH: browserRequestRoute("PATCH"),
    DELETE: browserRequestRoute("DELETE"),
  }

  function upgradeRtcSignal(req: Request, server: HttpServer): Response | undefined {
    const url = new URL(req.url)
    const path = routePath(req)
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
      path,
      connectedAt: Date.now(),
    }
    const upgraded = server.upgrade(req, {data})
    return upgraded ? undefined : jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
  }

  function upgradeVoiceProxy(req: Request, server: HttpServer): Response | undefined {
    const url = new URL(req.url)
    const path = routePath(req)
    const voiceProxyRoute = voiceProxyRouteForPath(path)
    if (voiceProxyRoute === null) return jsonResponse({ok: false, error: `not found: ${req.method} ${path}`}, 404)
    if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
    const data = createVoiceProxySocketData(voiceProxyRoute)
    const upgraded = server.upgrade(req, {data})
    options.logger.event("voice.proxy.upgrade", {
      route: voiceProxyRoute,
      targetUrl: data.targetUrl,
      accepted: upgraded,
    })
    return upgraded ? undefined : jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
  }

  return {
    routes: {
      "/": indexHtml,
      "/favicon.ico": new Response(null, {status: 204}),
      "/manifest.json": Response.json(MANIFEST),
      "/ws": {
        GET(req: Request, server: HttpServer) {
          const id = nextWsClientId++
          const data: WsClientData = {kind: "ui", id}
          const upgraded = server.upgrade(req, {data})
          return upgraded ? undefined : jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
        },
      },
      "/hud/terminal/stream": {
        async GET(req: Request, server: HttpServer) {
          const url = new URL(req.url)
          if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
          try {
            await ensurePtyDaemon({
              baseUrl: ptydBaseUrl,
              cwd: process.cwd(),
              log: (message) => options.logger.event("ptyd.ensure", {message}),
            })
          } catch (error) {
            return jsonResponse({ok: false, error: serializeError(error)}, 503)
          }
          const id = nextTerminalClientId++
          const data: TerminalWsClientData = {
            kind: "terminal",
            id,
            connectedAt: Date.now(),
            ptydTerminalUrl: ptyDaemonTerminalUrlFromRequest(url, ptydBaseUrl),
          }
          const upgraded = server.upgrade(req, {data})
          return upgraded ? undefined : jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
        },
      },
      "/webrtc/signaling": {GET: upgradeRtcSignal},
      "/hud/android/webrtc/signaling": {GET: upgradeRtcSignal},
      "/hud/voice/wake/ws": {GET: upgradeVoiceProxy},
      "/hud/voice/asr/ws": {GET: upgradeVoiceProxy},
      "/hud/terminal/sessions": {
        async GET() {
          try {
            await ensurePtyDaemon({baseUrl: ptydBaseUrl, cwd: process.cwd()})
            return await fetch(new URL("/terminal/sessions", ptydBaseUrl))
          } catch (error) {
            return jsonResponse({ok: false, error: serializeError(error)}, 503)
          }
        },
      },
      "/hud/terminal/sessions/:id": {
        async DELETE(req: Request & {params: {id: string}}) {
          try {
            await ensurePtyDaemon({baseUrl: ptydBaseUrl, cwd: process.cwd()})
            return await fetch(new URL(`/terminal/sessions/${encodeURIComponent(req.params.id)}`, ptydBaseUrl), {method: "DELETE"})
          } catch (error) {
            return jsonResponse({ok: false, error: serializeError(error)}, 503)
          }
        },
      },
      "/health": {GET: route("GET", "/health", () => jsonResponse(healthPayload(options)))},
      "/tools": {
        GET: route("GET", "/tools", () => jsonResponse({ok: true, tools: interpreterTools})),
        POST: route("POST", "/tools", (req) => interpreterToolsRoute(req, options, moduleContexts, hudTodoContext, hudSqliteContext, broadcast, dispatchUiHostCommand, sqliteWatchRegistry)),
      },
      "/webrtc/rooms": {GET: route("GET", "/webrtc/rooms", () => jsonResponse(rtcRoomsPayload()))},
      "/remote-desktop/lifecycle": {
        GET: route("GET", "/remote-desktop/lifecycle", remoteDesktopLifecycleStatusResponse),
        POST: route("POST", "/remote-desktop/lifecycle", (req) => remoteDesktopLifecycleCommandResponse(req, options.logger)),
      },
      "/browser-display/health": {GET: browserRoute("GET", "/browser-display/health")},
      "/browser-display/state": {GET: browserRoute("GET", "/browser-display/state")},
      "/browser-display/status": {GET: browserRoute("GET", "/browser-display/status")},
      "/browser-display/snapshot": {GET: browserRoute("GET", "/browser-display/snapshot")},
      "/browser-display/navigate": {POST: browserRoute("POST", "/browser-display/navigate")},
      "/browser-display/reload": {POST: browserRoute("POST", "/browser-display/reload")},
      "/browser-display/back": {POST: browserRoute("POST", "/browser-display/back")},
      "/browser-display/forward": {POST: browserRoute("POST", "/browser-display/forward")},
      "/browser-display/devtools": {POST: browserRoute("POST", "/browser-display/devtools")},
      "/browser-display/fullscreen": {POST: browserRoute("POST", "/browser-display/fullscreen")},
      "/browser-display/viewport": {POST: browserRoute("POST", "/browser-display/viewport")},
      "/browser-display/input": {POST: browserRoute("POST", "/browser-display/input")},
      "/browser-display/proxy": browserProxyRoutes,
      "/browser-display/proxy/*": browserProxyRoutes,
      "/remote-desktop/health": {GET: browserRoute("GET", "/remote-desktop/health")},
      "/remote-desktop/state": {GET: browserRoute("GET", "/remote-desktop/state")},
      "/remote-desktop/status": {GET: browserRoute("GET", "/remote-desktop/status")},
      "/remote-desktop/rtc/state": {GET: browserRoute("GET", "/remote-desktop/rtc/state")},
      "/remote-desktop/rtc/restart": {POST: browserRoute("POST", "/remote-desktop/rtc/restart")},
      "/remote-desktop/audio.pcm": {GET: browserRoute("GET", "/remote-desktop/audio.pcm")},
      "/remote-desktop/snapshot": {GET: browserRoute("GET", "/remote-desktop/snapshot"), POST: browserRoute("POST", "/remote-desktop/snapshot")},
      "/remote-desktop/input": {POST: browserRoute("POST", "/remote-desktop/input")},
      "/remote-desktop/browser/windows": {GET: browserRoute("GET", "/remote-desktop/browser/windows")},
      "/remote-desktop/browser/open": {POST: browserRoute("POST", "/remote-desktop/browser/open")},
      "/hud/terminal": {GET: route("GET", "/hud/terminal", () => dispatchUiHostRoute("hud.terminal.get", {}, dispatchUiHostCommand))},
      "/hud/terminal/dock": {POST: route("POST", "/hud/terminal/dock", (req) => dispatchUiHostRouteFromBody("hud.terminal.dock", req, dispatchUiHostCommand))},
      "/hud/terminal/show": {POST: route("POST", "/hud/terminal/show", (req) => dispatchUiHostRouteFromBody("hud.terminal.show", req, dispatchUiHostCommand))},
      "/hud/terminal/toggle": {POST: route("POST", "/hud/terminal/toggle", (req) => dispatchUiHostRouteFromBody("hud.terminal.toggle", req, dispatchUiHostCommand))},
      "/hud/codex/attachments": {POST: route("POST", "/hud/codex/attachments", codexAttachmentResponse)},
      "/hud/terminal/network": {GET: route("GET", "/hud/terminal/network", () => dispatchUiHostRoute("hud.terminal.network.get", {}, dispatchUiHostCommand))},
      "/hud/terminal/network/dock": {POST: route("POST", "/hud/terminal/network/dock", (req) => dispatchUiHostRouteFromBody("hud.terminal.network.dock", req, dispatchUiHostCommand))},
      "/hud/terminal/network/show": {
        GET: route("GET", "/hud/terminal/network/show", () => dispatchUiHostRoute("hud.terminal.network.show", {}, dispatchUiHostCommand)),
        POST: route("POST", "/hud/terminal/network/show", (req) => dispatchUiHostRouteFromBody("hud.terminal.network.show", req, dispatchUiHostCommand)),
      },
      "/hud/terminal/network/toggle": {POST: route("POST", "/hud/terminal/network/toggle", (req) => dispatchUiHostRouteFromBody("hud.terminal.network.toggle", req, dispatchUiHostCommand))},
      "/hud/android": {GET: route("GET", "/hud/android", () => dispatchUiHostRoute("hud.android.get", {}, dispatchUiHostCommand))},
      "/hud/android/dock": {POST: route("POST", "/hud/android/dock", (req) => dispatchUiHostRouteFromBody("hud.android.dock", req, dispatchUiHostCommand))},
      "/hud/android/show": {POST: route("POST", "/hud/android/show", (req) => dispatchUiHostRouteFromBody("hud.android.show", req, dispatchUiHostCommand))},
      "/hud/android/toggle": {POST: route("POST", "/hud/android/toggle", (req) => dispatchUiHostRouteFromBody("hud.android.toggle", req, dispatchUiHostCommand))},
      "/hud/android/refresh": {POST: route("POST", "/hud/android/refresh", () => dispatchUiHostRoute("hud.android.refresh", {}, dispatchUiHostCommand))},
      "/hud/android/control": {POST: route("POST", "/hud/android/control", (req) => dispatchUiHostRouteFromBody("hud.android.control", req, dispatchUiHostCommand))},
      "/android/size": {GET: route("GET", "/android/size", (req) => proxyAndroidRequest(req, "/android/size"))},
      "/android/screencap": {GET: route("GET", "/android/screencap", (req) => proxyAndroidRequest(req, "/android/screencap"))},
      "/android/tap": {POST: route("POST", "/android/tap", (req) => proxyAndroidRequest(req, "/android/tap"))},
      "/android/swipe": {POST: route("POST", "/android/swipe", (req) => proxyAndroidRequest(req, "/android/swipe"))},
      "/android/key": {POST: route("POST", "/android/key", (req) => proxyAndroidRequest(req, "/android/key"))},
      "/hud/todo": {GET: route("GET", "/hud/todo", todoMarkdownResponse), PUT: route("PUT", "/hud/todo", (req) => replaceTodoMarkdown(req, broadcast))},
      "/hud/todo/items": {POST: route("POST", "/hud/todo/items", (req) => createTodoItem(req, broadcast))},
      "/hud/todo/items/:id": {
        PATCH: requestRoute("PATCH", (req) => patchTodoItem(req.params.id!, req, broadcast)),
        POST: requestRoute("POST", (req) => patchTodoItem(req.params.id!, req, broadcast)),
        DELETE: requestRoute("DELETE", (req) => deleteTodoItem(req.params.id!, broadcast)),
      },
      "/hud/todo/panel": {GET: route("GET", "/hud/todo/panel", () => dispatchUiHostRoute("hud.todo.get", {}, dispatchUiHostCommand))},
      "/hud/todo/highlight": {POST: route("POST", "/hud/todo/highlight", (req) => dispatchUiHostRouteFromBody("hud.todo.highlight", req, dispatchUiHostCommand))},
      "/hud/todo/dock": {POST: route("POST", "/hud/todo/dock", (req) => dispatchUiHostRouteFromBody("hud.todo.dock", req, dispatchUiHostCommand))},
      "/hud/todo/show": {POST: route("POST", "/hud/todo/show", (req) => dispatchUiHostRouteFromBody("hud.todo.show", req, dispatchUiHostCommand))},
      "/hud/todo/toggle": {POST: route("POST", "/hud/todo/toggle", (req) => dispatchUiHostRouteFromBody("hud.todo.toggle", req, dispatchUiHostCommand))},
      "/hud/sqlite": {GET: route("GET", "/hud/sqlite", () => dispatchUiHostRoute("hud.sqlite.get", {}, dispatchUiHostCommand))},
      "/hud/sqlite/dock": {POST: route("POST", "/hud/sqlite/dock", (req) => dispatchUiHostRouteFromBody("hud.sqlite.dock", req, dispatchUiHostCommand))},
      "/hud/sqlite/show": {POST: route("POST", "/hud/sqlite/show", (req) => dispatchUiHostRouteFromBody("hud.sqlite.show", req, dispatchUiHostCommand))},
      "/hud/sqlite/toggle": {POST: route("POST", "/hud/sqlite/toggle", (req) => dispatchUiHostRouteFromBody("hud.sqlite.toggle", req, dispatchUiHostCommand))},
      "/sqlite": {GET: route("GET", "/sqlite", (req) => {
        try {
          const url = new URL(req.url)
          sqliteWatchRegistry.register(url.searchParams.get("path") ?? "")
          const payload = sqliteDatabasePayload(url)
          sqliteWatchRegistry.acceptPayload(payload)
          return jsonResponse(payload)
        } catch (error) {
          return sqliteJsonError(error)
        }
      })},
      "/sqlite/fingerprint": {GET: route("GET", "/sqlite/fingerprint", (req) => {
        try {
          const url = new URL(req.url)
          sqliteWatchRegistry.register(url.searchParams.get("path") ?? "")
          const fingerprint = sqliteDatabaseFingerprint(url.searchParams.get("path") ?? "")
          sqliteWatchRegistry.acceptFingerprint(fingerprint)
          return jsonResponse(fingerprint)
        } catch (error) {
          return sqliteJsonError(error)
        }
      })},
      "/sqlite/open": {POST: route("POST", "/sqlite/open", (req) => openSqliteDisplayFromBody(req, dispatchUiHostCommand, sqliteWatchRegistry))},
      "/sqlite/cell": {POST: route("POST", "/sqlite/cell", async (req) => {
        try {
          const payload = await updateSqliteCell(req)
          sqliteWatchRegistry.acceptPayload(payload)
          return jsonResponse(payload)
        } catch (error) {
          return sqliteJsonError(error)
        }
      })},
      "/client-event": {POST: route("POST", "/client-event", (req) => recordClientEvent(req, options))},
      "/JetBrainsMono-Bold.ttf": serveStatic(join(WEB_DIR, "JetBrainsMono-Bold.ttf"), "font/ttf"),
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
  const {routes, websocket, error} = interpreterHttpRoutes
  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    development: false,
    routes,
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
  const openClients = [...clients].filter((item): item is ServerWebSocket<UiWsClientData> => {
    return item.data.kind === "ui" && item.readyState === WebSocket.OPEN
  })
  const moduleId = command.startsWith("processes.") ? uiHostCommandModuleId(params) : undefined
  const preferredClientId = moduleId === undefined ? undefined : moduleContextClientIds.get(moduleId)
  if (preferredClientId !== undefined) {
    const preferred = openClients.find((item) => item.data.id === preferredClientId)
    if (preferred !== undefined) return preferred
  }
  return openClients.at(-1)
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

function attachRtcSignalSocket(ws: ServerWebSocket<RtcSignalWsClientData>, logger: EventLogger): void {
  const peers = rtcRoomPeers(ws.data.room)
  const peerId = ws.data.peerId
  const replaced = peers.get(peerId)
  if (replaced !== undefined && replaced !== ws) {
    peers.delete(peerId)
    broadcastRtcSignal(ws.data.room, peerId, {
      type: "peer-left",
      peerId,
      reason: "replaced",
    })
    replaced.close(4000, "peer replaced")
  }
  const existingPeers = [...peers.keys()]
  peers.set(peerId, ws)
  logger.event("rtc.signal.peer.opened", {
    room: ws.data.room,
    peerId,
    path: ws.data.path,
    existingPeers,
    replaced: replaced !== undefined,
    peerCount: peers.size,
  })
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

function detachRtcSignalSocket(ws: ServerWebSocket<RtcSignalWsClientData>, logger: EventLogger): void {
  const {room, peerId} = ws.data
  const peers = rtcRooms.get(room)
  if (peers === undefined) return
  if (peers.get(peerId) === ws) peers.delete(peerId)
  logger.event("rtc.signal.peer.closed", {
    room,
    peerId,
    path: ws.data.path,
    peerCount: peers.size,
  })
  if (peers.size === 0) {
    rtcRooms.delete(room)
    return
  }
  broadcastRtcSignal(room, peerId, {
    type: "peer-left",
    peerId,
  })
}

function handleRtcSignalMessage(ws: ServerWebSocket<RtcSignalWsClientData>, message: string | Buffer<ArrayBuffer>, logger: EventLogger): void {
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
  const messageType = typeof payload.type === "string" ? payload.type : "unknown"
  const envelope = {
    ...payload,
    from: ws.data.peerId,
    room: ws.data.room,
  }
  if (to !== null) {
    const target = rtcRooms.get(ws.data.room)?.get(to)
    logger.event("rtc.signal.message", {
      room: ws.data.room,
      from: ws.data.peerId,
      to,
      type: messageType,
      targetFound: target !== undefined,
      targetOpen: target?.readyState === WebSocket.OPEN,
      messageBytes: message.length,
      summary: rtcSignalPayloadSummary(payload),
    })
    if (target !== undefined && target.readyState === WebSocket.OPEN) sendRtcJson(target, envelope)
    return
  }
  logger.event("rtc.signal.message", {
    room: ws.data.room,
    from: ws.data.peerId,
    to: null,
    type: messageType,
    targetFound: false,
    targetOpen: false,
    messageBytes: message.length,
    summary: rtcSignalPayloadSummary(payload),
  })
  broadcastRtcSignal(ws.data.room, ws.data.peerId, envelope)
}

function rtcSignalPayloadSummary(payload: Record<string, unknown>): JsonObject {
  const description = asObject(payload["description"])
  const candidate = asObject(payload["candidate"])
  return {
    descriptionType: asString(description?.["type"]) ?? null,
    sdpBytes: typeof description?.["sdp"] === "string" ? description.sdp.length : null,
    candidateBytes: typeof candidate?.["candidate"] === "string" ? candidate.candidate.length : null,
    sdpMid: asString(candidate?.["sdpMid"]) ?? null,
    sdpMLineIndex: asNumber(candidate?.["sdpMLineIndex"]) ?? null,
  }
}

function rtcRoomsPayload(): JsonObject {
  return {
    ok: true,
    rooms: [...rtcRooms.entries()].map(([room, peers]) => ({
      room,
      peerCount: peers.size,
      peers: [...peers.values()].map((socket) => ({
        id: socket.data.id,
        peerId: socket.data.peerId,
        path: socket.data.path,
        readyState: socket.readyState,
        connectedAt: new Date(socket.data.connectedAt).toISOString(),
        ageMs: Date.now() - socket.data.connectedAt,
      })),
    })),
  }
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

function restartInterpreterHost(broadcast: (payload: JsonObject) => void, options: HttpServerOptions): Response {
  const plan = interpreterRestartPlan()
  if (plan.error !== undefined) {
    return jsonResponse({
      ok: false,
      error: plan.error,
      hint: "Запусти interpreter внутри tmux или задай INTERPRETER_RESTART_COMMAND.",
    }, 501)
  }

  broadcast({type: "reload", delayMs: INTERPRETER_RESTART_DELAY_MS + 750})
  options.logger.event("interpreter.restart.requested", {
    mode: plan.mode,
    targetPane: plan.targetPane,
    delayMs: INTERPRETER_RESTART_DELAY_MS,
  })
  scheduleInterpreterRestart(plan.command, options.logger)
  return jsonResponse({
    ok: true,
    restarting: true,
    reloadClients: true,
    delayMs: INTERPRETER_RESTART_DELAY_MS,
    mode: plan.mode,
    targetPane: plan.targetPane,
  }, 202)
}

type InterpreterRestartPlan =
  | {mode: "tmux"; targetPane: string; command: string; error?: undefined}
  | {error: string}

function interpreterRestartPlan(): InterpreterRestartPlan {
  const targetPane = Bun.env.TMUX_PANE?.trim()
  if (targetPane === undefined || targetPane.length === 0) {
    return {error: "interpreter restart requires TMUX_PANE or an external supervisor"}
  }
  const restartCommand = interpreterRestartCommand()
  if (restartCommand === null) return {error: "cannot derive interpreter restart command"}
  return {
    mode: "tmux",
    targetPane,
    command: [
      `sleep ${Math.max(0, INTERPRETER_RESTART_DELAY_MS / 1000).toFixed(3)}`,
      `exec tmux respawn-pane -k -c ${shellQuote(process.cwd())} -t ${shellQuote(targetPane)} ${shellQuote(restartCommand)}`,
    ].join("; "),
  }
}

function interpreterRestartCommand(): string | null {
  const explicit = Bun.env.INTERPRETER_RESTART_COMMAND?.trim()
  if (explicit !== undefined && explicit.length > 0) return explicit
  const script = Bun.env.INTERPRETER_RESTART_SCRIPT?.trim()
  if (script !== undefined && script.length > 0) return `exec ${shellQuote(script)}`
  const argv = currentProcessArgv()
  if (argv.length === 0) return null
  return `${interpreterRestartEnvExports()}exec ${argv.map(shellQuote).join(" ")}`
}

function interpreterRestartEnvExports(): string {
  const keys = Object.keys(Bun.env).filter((key) => (
    key === "PATH"
    || key === "BUN_INSTALL"
    || key === "LANG"
    || key === "FORCE_COLOR"
    || key === "NO_COLOR"
    || key === "BUN_PROTOCOL_URL"
    || key.startsWith("INTERPRETER_")
  )).sort()
  return keys
    .map((key) => {
      const value = Bun.env[key]
      return value === undefined ? "" : `export ${key}=${shellQuote(value)}; `
    })
    .join("")
}

function currentProcessArgv(): string[] {
  try {
    const argv = readFileSync("/proc/self/cmdline", "utf8").split("\0").filter((item) => item.length > 0)
    if (argv.length > 0) return argv
  } catch {
    // /proc is not available on every platform; Bun.argv is good enough there.
  }
  return [process.execPath, ...Bun.argv.slice(1)].filter((item) => item.length > 0)
}

function scheduleInterpreterRestart(command: string, logger: EventLogger): void {
  const detached = `nohup sh -lc ${shellQuote(command)} >/dev/null 2>&1 &`
  setTimeout(() => {
    try {
      Bun.spawn(["sh", "-lc", detached], {
        cwd: process.cwd(),
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      })
    } catch (error) {
      logger.event("interpreter.restart.spawn.failed", {error: serializeError(error)})
    }
  }, 25)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
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

function reloadTodoMarkdown(broadcast: (payload: JsonObject) => void): Response {
  const payload = todoMarkdownPayload()
  if (payload === null) return jsonResponse({ok: false, path: todoMarkdownPath(), error: "TODO.md not found"}, 404)
  broadcast({type: "hud-todo-changed", todo: payload})
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

function asTodoTaskMarker(value: unknown): TodoMarkdownInsert["marker"] {
  if (typeof value !== "string") return undefined
  const marker = value === "X" ? "x" : value
  if (isTodoTaskMarker(marker)) return marker
  return undefined
}

function readTodoMarkdownForEdit(): string {
  const path = todoMarkdownPath()
  return existsSync(path) ? readFileSync(path, "utf8") : "# MetaFor Plan\n"
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
  const marker = asTodoTaskMarker(body["marker"])
  if (marker !== undefined) insert.marker = marker
  const depth = asNumber(body["depth"])
  if (depth !== undefined) insert.depth = depth
  const afterId = asString(body["afterId"])
  if (afterId !== undefined) insert.afterId = afterId
  const section = asString(body["section"])
  if (section !== undefined) insert.section = section
  const sectionId = asString(body["sectionId"])
  if (sectionId !== undefined) insert.sectionId = sectionId
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
  const marker = asTodoTaskMarker(parsed.body["marker"])
  if (marker !== undefined) patch.marker = marker
  if (patch.text === undefined && patch.checked === undefined && patch.marker === undefined) return jsonResponse({ok: false, error: "text, checked, or marker required"}, 400)
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
  if (origin === "null" && isLoopbackHost(url.hostname)) return true
  try {
    const originUrl = new URL(origin)
    if (originUrl.host === url.host) return true
    if (
      originUrl.hostname === url.hostname
      && isRtcSignalingPath(url.pathname)
    ) {
      return true
    }
    if (
      isLoopbackHost(originUrl.hostname)
      && isRtcSignalingPath(url.pathname)
    ) {
      return true
    }
    if (
      isAllowedRtcExternalOrigin(originUrl.hostname)
      && isRtcSignalingPath(url.pathname)
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

function isAllowedRtcExternalOrigin(hostname: string): boolean {
  return hostname === "meta.proizvodstvo1.ru"
    || hostname === "dev.proizvodstvo1.ru"
}

function isRtcSignalingPath(path: string): boolean {
  return path === "/webrtc/signaling" || path === "/hud/android/webrtc/signaling"
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
  const context = contexts.get(module.id)
  if (context === undefined) return runtimeFallbackContext(module)
  return runtimeAuthoritativeContext(module, context)
}

function runtimeAuthoritativeContext(module: ModuleSnapshot, context: JsonObject): JsonObject {
  const runtimeContext = runtimeFallbackContext(module)
  const runtimeSource = asObject(runtimeContext["source"]) ?? {}
  const source = asObject(context["source"]) ?? {}
  const currentFrame = asObject(runtimeContext["currentFrame"])
  const nextSource: JsonObject = {
    ...source,
    state: runtimeSource["state"],
  }

  if (currentFrame !== undefined) {
    nextSource["location"] = runtimeSource["location"]
    nextSource["identity"] = sourceIdentityMatchesFrame(asObject(source["identity"]), currentFrame)
      ? source["identity"]
      : null
  }

  const next: JsonObject = {
    ...context,
    source: nextSource,
    activeFrameIndex: runtimeContext["activeFrameIndex"],
    currentFrame: runtimeContext["currentFrame"],
  }
  if (currentFrame !== undefined) next["updatedAt"] = runtimeContext["updatedAt"]
  return next
}

function sourceIdentityMatchesFrame(identity: JsonObject | undefined, frame: JsonObject): boolean {
  if (identity === undefined) return false

  const frameScriptId = asString(frame["scriptId"])
  const identityScriptId = asString(identity["scriptId"])
  if (frameScriptId !== undefined && identityScriptId !== undefined) return frameScriptId === identityScriptId

  const frameUrl = asString(frame["url"])
  if (frameUrl === undefined || frameUrl.length === 0) return true
  return asString(identity["sourceUrl"]) === frameUrl
    || asString(identity["scriptUrl"]) === frameUrl
    || asString(identity["key"]) === frameUrl
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
  const frame = module.paused ? module.dump?.frames[0] ?? null : null
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
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "")
  if (normalized === "localhost" || normalized === "::1") return true
  const parts = normalized.split(".")
  if (parts.length !== 4 || parts[0] !== "127") return false
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255
  })
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

async function recordClientEvent(req: Request, options: HttpServerOptions): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const scope = compactClientEventSegment(parsed.body["scope"], "ui")
  const label = compactClientEventSegment(parsed.body["label"], "event")
  options.logger.event(`client.${scope}.${label}`, compactClientEventDetail(parsed.body["detail"]))
  return jsonResponse({ok: true})
}

async function captureViewportScreenshot(url: URL, dispatch: UiHostCommandDispatcher): Promise<Response> {
  try {
    const response = await dispatch("ui.captureViewport", {
      format: url.searchParams.get("format") ?? "png",
      quality: numberFromSearchParam(url, "quality"),
    })
    const result = asObject(response["result"])
    if (result === undefined) return jsonResponse({ok: false, error: "viewport capture response is invalid"}, 502)
    const mime = asString(result["mime"]) ?? "image/png"
    const dataBase64 = asString(result["dataBase64"])
    if (dataBase64 === undefined || dataBase64.length === 0) {
      return jsonResponse({ok: false, error: "viewport capture did not return image data"}, 502)
    }
    const bytes = imageBytesFromBase64(dataBase64)
    if (bytes.length === 0) return jsonResponse({ok: false, error: "viewport capture image is empty"}, 502)
    if (bytes.length > CODEX_ATTACHMENT_MAX_BYTES) return jsonResponse({ok: false, error: "viewport capture is larger than 16 MB"}, 413)

    const ext = imageAttachmentExtension("interpreter-viewport.png", mime) ?? ".png"
    const dir = resolve(process.cwd(), CODEX_ATTACHMENT_DIR)
    mkdirSync(dir, {recursive: true})
    const safeName = safeAttachmentFilename(`interpreter-viewport-${Date.now()}${ext}`, ext)
    const id = crypto.randomUUID()
    const path = join(dir, `${Date.now()}-${id.slice(0, 8)}-${safeName}`)
    writeFileSync(path, bytes)

    const payload = {
      ok: true,
      screenshot: {
        id,
        path,
        name: safeName,
        mime: mime.startsWith("image/") ? mime : mimeForImageExtension(ext),
        size: bytes.length,
        width: asNumber(result["width"]) ?? null,
        height: asNumber(result["height"]) ?? null,
        clientWidth: asNumber(result["clientWidth"]) ?? null,
        clientHeight: asNumber(result["clientHeight"]) ?? null,
        devicePixelRatio: asNumber(result["devicePixelRatio"]) ?? null,
        capturedAt: asString(result["capturedAt"]) ?? new Date().toISOString(),
        source: asString(result["source"]) ?? "interpreter-ui",
      },
    }
    if (url.searchParams.get("raw") === "1") {
      const body = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(body).set(bytes)
      return new Response(body, {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": payload.screenshot.mime,
          "content-length": String(bytes.length),
          "x-metafor-screenshot-path": path,
        },
      })
    }
    return jsonResponse(payload)
  } catch (error) {
    const status = error instanceof UiHostCommandError ? error.status : 500
    return jsonResponse({ok: false, error: serializeError(error)}, status)
  }
}

function numberFromSearchParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name)
  if (raw === null || raw.trim().length === 0) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function imageBytesFromBase64(dataBase64: string): Buffer {
  const encoded = dataBase64.replace(/^data:[^;]+;base64,/i, "")
  return Buffer.from(encoded, "base64")
}

function compactClientEventSegment(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "")
  return normalized.length === 0 ? fallback : normalized.slice(0, 48)
}

function compactClientEventDetail(value: unknown): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const detail: JsonObject = {}
  for (const [key, raw] of Object.entries(value).slice(0, 24)) {
    const cleanKey = key.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 48)
    if (cleanKey.length === 0) continue
    if (typeof raw === "string") detail[cleanKey] = raw.slice(0, 500)
    else if (typeof raw === "number" && Number.isFinite(raw)) detail[cleanKey] = raw
    else if (typeof raw === "boolean" || raw === null) detail[cleanKey] = raw
    else if (Array.isArray(raw)) detail[cleanKey] = raw.slice(0, 12).map((item) => (
      typeof item === "string" ? item.slice(0, 240) : typeof item === "number" || typeof item === "boolean" || item === null ? item : String(item).slice(0, 240)
    ))
    else if (raw !== undefined) detail[cleanKey] = String(raw).slice(0, 240)
  }
  return detail
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

function readPatchTextFromParams(params: JsonObject): string | undefined {
  return asString(params["patch"])
    ?? asString(params["input"])
    ?? asString(params["text"])
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
  const hasLocator = hasSourceLocator(body)
  let line = asNumber(body["line"])
  let sourceMatch: JsonObject | undefined
  let sourceLocator: JsonObject | undefined
  const url = asString(body["url"])
  const urlRegex = asString(body["urlRegex"])
  let sourceUrl = asString(body["sourceUrl"])
    ?? asString(body["path"])
    ?? asString(body["modulePath"])
  if (hasLocator) {
    if (urlRegex !== undefined) return jsonResponse({ok: false, error: "source locator requires sourceUrl, path, modulePath or url, not urlRegex"}, 400)
    const located = sourceLocateToolPayload(body)
    if (located["ok"] !== true) {
      return jsonResponse({
        ok: false,
        error: asString(located["error"]) ?? "source locator failed",
        sourceLocator: located["locator"],
        sourceUrl: located["sourceUrl"],
        path: located["path"],
        matchCount: located["matchCount"],
        truncated: located["truncated"],
        matches: located["matches"],
        requestedBreakpoint: body,
      }, 400)
    }
    const match = asObject(located["match"])
    const locatedLine = match === undefined ? undefined : asNumber(match["line"])
    if (!isPositiveInteger(locatedLine)) return jsonResponse({ok: false, error: "source locator returned no line", sourceLocator: located["locator"], requestedBreakpoint: body}, 400)
    if (line !== undefined && line !== locatedLine) {
      return jsonResponse({
        ok: false,
        error: "line does not match source locator",
        line,
        sourceMatch: match,
        sourceLocator: located["locator"],
        requestedBreakpoint: body,
      }, 400)
    }
    line = locatedLine
    sourceMatch = match
    sourceLocator = asObject(located["locator"])
    sourceUrl ??= asString(located["sourceUrl"])
  }
  if (!isPositiveInteger(line)) return jsonResponse({ok: false, error: "line must be a positive integer (1-based) or source locator required"}, 400)
  if (url === undefined && urlRegex === undefined && sourceUrl === undefined) {
    return jsonResponse({ok: false, error: "url, sourceUrl or urlRegex required"}, 400)
  }
  const column = asNumber(body["column"]) ?? (sourceMatch === undefined ? undefined : asNumber(sourceMatch["column"]))
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
  const normalized = normalizeBreakpointSpec(spec)
  if (normalized.error !== undefined) {
    return jsonResponse({ok: false, error: normalized.error, requestedBreakpoint: spec}, 400)
  }

  try {
    const registration = module.breakpoints.add(normalized.spec)
    await module.breakpoints.armPendingByUrl([registration.id])
    await module.breakpoints.applyToScripts(module.snapshots.scripts)
    const breakpoints = module.breakpoints.registrations
    broadcast({type: "breakpoints-changed", moduleId: module.id, reason: "set", breakpoint: registration, breakpoints})
    const response: JsonObject = {ok: true, breakpoint: registration, breakpoints}
    if (normalized.requested !== undefined) response["requestedBreakpoint"] = normalized.requested
    if (normalized.warning !== undefined) response["warning"] = normalized.warning
    if (sourceLocator !== undefined) response["sourceLocator"] = sourceLocator
    if (sourceMatch !== undefined) response["sourceMatch"] = sourceMatch
    return jsonResponse(response)
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
    return jsonResponse({ok: false, error: "id or breakpointId required (получи его через breakpoint.list tool)"}, 400)
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
  const gitBaseSource = gitBaseSourceForFile(options.path)
  return jsonResponse({
    scriptId: options.scriptId,
    url: options.url,
    scriptUrl: options.scriptUrl,
    scriptSource,
    tokens: options.includeTokens ? tokensFor(cacheKey, scriptSource, options.url) : undefined,
    sourceKind: "file",
    cached: false,
    ...(gitBaseSource === undefined ? {} : {gitBaseSource}),
  })
}

async function interpreterToolsRoute(
  req: Request,
  options: HttpServerOptions,
  moduleContexts: ModuleContextStore,
  hudTodoContext: HudTodoContextStore,
  hudSqliteContext: HudSqliteContextStore,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry>,
): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const toolUses = parseInterpreterToolRequest(parsed.body)
  if (toolUses.error !== undefined) return jsonResponse({ok: false, error: toolUses.error}, 400)

  const results = await runInterpreterToolUses(toolUses.toolUses, options, moduleContexts, hudTodoContext, hudSqliteContext, broadcast, dispatchUiHostCommand, sqliteWatchRegistry)
  return interpreterToolsResponse(results)
}

function interpreterToolsResponse(results: JsonObject[]): Response {
  return jsonResponse({
    ok: results.every((result) => result["ok"] === true),
    tool_uses: results,
    results,
  })
}

async function runInterpreterToolUses(
  toolUses: InterpreterToolUse[],
  options: HttpServerOptions,
  moduleContexts: ModuleContextStore | undefined,
  hudTodoContext: HudTodoContextStore | undefined,
  hudSqliteContext: HudSqliteContextStore | undefined,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry> | undefined,
): Promise<JsonObject[]> {
  const results: JsonObject[] = []
  for (const toolUse of toolUses) {
    results.push(await runInterpreterToolUse(toolUse, options, moduleContexts, hudTodoContext, hudSqliteContext, broadcast, dispatchUiHostCommand, sqliteWatchRegistry))
  }
  return results
}

async function runInterpreterToolUse(
  toolUse: InterpreterToolUse,
  options: HttpServerOptions,
  moduleContexts: ModuleContextStore | undefined,
  hudTodoContext: HudTodoContextStore | undefined,
  hudSqliteContext: HudSqliteContextStore | undefined,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry> | undefined,
): Promise<JsonObject> {
  const base = toolResultBase(toolUse)
  try {
    if (isProcessScopedTool(toolUse.recipientName)) {
      const module = moduleForToolUse(toolUse, options)
      if (module === undefined) return {...base, ok: false, error: "processId required"}
      return await runProcessToolUse(module, toolUse, options, broadcast, dispatchUiHostCommand)
    }
    if (toolUse.recipientName === "health.get") return {...base, ok: true, result: healthPayload(options)}
    if (toolUse.recipientName === "context.get") {
      if (moduleContexts === undefined || hudTodoContext === undefined || hudSqliteContext === undefined) return {...base, ok: false, error: "context.get is unavailable in this route scope"}
      return {...base, ok: true, result: contextPayload(options, moduleContexts, hudTodoContext, hudSqliteContext)}
    }
    if (toolUse.recipientName === "space.get") return await toolResultFromResponse(base, await dispatchUiHostRoute("space.get", {}, dispatchUiHostCommand), "space.get failed")
    if (toolUse.recipientName === "space.focus") return await toolResultFromResponse(base, await dispatchUiHostRoute("space.focus", toolUse.parameters, dispatchUiHostCommand), "space.focus failed")
    if (toolUse.recipientName === "space.frame") return await toolResultFromResponse(base, await dispatchUiHostRoute("space.frame", toolUse.parameters, dispatchUiHostCommand), "space.frame failed")
    if (toolUse.recipientName === "viewport.screenshot") return await toolResultFromResponse(base, await captureViewportScreenshot(toolUrlFromParams("/viewport/screenshot", toolUse.parameters), dispatchUiHostCommand), "viewport.screenshot failed")
    if (toolUse.recipientName === "process.list") return {...base, ok: true, result: {ok: true, processes: processPayloads(options)}}
    if (toolUse.recipientName === "process.start") return await toolResultFromResponse(base, await runProcess(jsonToolRequest("/tools", toolUse.parameters), options), "process.start failed")
    if (toolUse.recipientName === "process.get") {
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, await dispatchUiHostRoute("processes.get", {processId}, dispatchUiHostCommand), "process.get failed")
    }
    if (toolUse.recipientName === "process.focus") return await toolResultFromResponse(base, await dispatchUiHostRoute("processes.focus", processRouteParamsForTool(toolUse), dispatchUiHostCommand), "process.focus failed")
    if (toolUse.recipientName === "process.resolve") return await toolResultFromResponse(base, await dispatchUiHostRoute("processes.resolve", toolUse.parameters, dispatchUiHostCommand), "process.resolve failed")
    if (toolUse.recipientName === "process.context") {
      if (moduleContexts === undefined || hudTodoContext === undefined || hudSqliteContext === undefined) return {...base, ok: false, error: "process.context is unavailable in this route scope"}
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, getProcessContext(processId, options, moduleContexts, hudTodoContext, hudSqliteContext), "process.context failed")
    }
    if (toolUse.recipientName === "process.modules") {
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, getProcessModules(processId, toolUrlFromParams("/tools", toolUse.parameters), options), "process.modules failed")
    }
    if (toolUse.recipientName === "process.close") {
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, await closeProcess(processId, toolUse.parameters, options), "process.close failed")
    }
    if (toolUse.recipientName === "breakpoint.list") {
      const module = moduleForToolUse(toolUse, options)
      if (module === undefined) return {...base, ok: false, error: "processId required"}
      return {...base, ok: true, result: {ok: true, processId: module.id, breakpoints: module.breakpoints.registrations}}
    }
    if (toolUse.recipientName === "breakpoint.set") {
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, await setProcessBreakpoint(processId, jsonToolRequest("/tools", toolUse.parameters), options, broadcast), "breakpoint.set failed")
    }
    if (toolUse.recipientName === "breakpoint.remove") {
      const processId = processIdForToolUse(toolUse)
      if (processId === undefined) return {...base, ok: false, error: "processId required"}
      return await toolResultFromResponse(base, await removeProcessBreakpoint(processId, jsonToolRequest("/tools", toolUse.parameters), options, broadcast), "breakpoint.remove failed")
    }

    const hostTool = await runHostToolUse(base, toolUse, broadcast, dispatchUiHostCommand, sqliteWatchRegistry, options)
    if (hostTool !== null) return hostTool
    return {...base, ok: false, error: `unknown tool recipient_name: ${toolUse.recipientName}`}
  } catch (error) {
    return {...base, ok: false, error: serializeError(error)}
  }
}

async function runHostToolUse(
  base: JsonObject,
  toolUse: InterpreterToolUse,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
  sqliteWatchRegistry: ReturnType<typeof createSqliteWatchRegistry> | undefined,
  options: HttpServerOptions,
): Promise<JsonObject | null> {
  const hudCommand = hudCommandForTool(toolUse.recipientName)
  if (hudCommand !== null) return await toolResultFromResponse(base, await dispatchUiHostRoute(hudCommand.command, hudCommand.paramsFromBody ? toolUse.parameters : {}, dispatchUiHostCommand), `${toolUse.recipientName} failed`)
  const devtoolsRoute = chromeDevtoolsRouteForTool(toolUse.recipientName)
  if (devtoolsRoute !== null) return await toolResultFromNullableResponse(base, await handleChromeDevtoolsRoute(toolRequest(devtoolsRoute.path, toolUse.parameters, devtoolsRoute.method), devtoolsRoute.method, devtoolsRoute.path), `${toolUse.recipientName} failed`)
  const browserRoute = browserHostRouteForTool(toolUse.recipientName)
  if (browserRoute !== null) return await toolResultFromNullableResponse(base, await handleBrowserHostRoute(toolRequest(browserRoute.path, toolUse.parameters, browserRoute.method), browserRoute.method, browserRoute.path), `${toolUse.recipientName} failed`)
  const remoteLifecycle = remoteDesktopLifecycleRouteForTool(toolUse.recipientName, toolUse.parameters)
  if (remoteLifecycle !== null) {
    const response = remoteLifecycle.method === "GET"
      ? await remoteDesktopLifecycleStatusResponse()
      : await remoteDesktopLifecycleCommandResponse(toolRequest(remoteLifecycle.path, toolUse.parameters, remoteLifecycle.method), options.logger)
    return await toolResultFromResponse(base, response, `${toolUse.recipientName} failed`)
  }
  if (toolUse.recipientName === "todo.get") return await toolResultFromResponse(base, todoMarkdownResponse(), "todo.get failed")
  if (toolUse.recipientName === "todo.replace") return await toolResultFromResponse(base, await replaceTodoMarkdown(jsonToolRequest("/tools", toolUse.parameters), broadcast), "todo.replace failed")
  if (toolUse.recipientName === "todo.create") return await todoMutationToolResult(base, await createTodoItem(jsonToolRequest("/tools", toolUse.parameters), broadcast), "todo.create failed", dispatchUiHostCommand)
  if (toolUse.recipientName === "todo.update") {
    const id = requiredStringParam(toolUse.parameters, "id")
    if (id === undefined) return {...base, ok: false, error: "id required"}
    return await todoMutationToolResult(base, await patchTodoItem(id, jsonToolRequest("/tools", toolUse.parameters), broadcast), "todo.update failed", dispatchUiHostCommand)
  }
  if (toolUse.recipientName === "todo.delete") {
    const id = requiredStringParam(toolUse.parameters, "id")
    if (id === undefined) return {...base, ok: false, error: "id required"}
    return await todoMutationToolResult(base, deleteTodoItem(id, broadcast), "todo.delete failed", dispatchUiHostCommand)
  }
  if (toolUse.recipientName === "todo.reload") return await toolResultFromResponse(base, reloadTodoMarkdown(broadcast), "todo.reload failed")
  if (toolUse.recipientName === "sqlite.get") {
    try {
      const url = toolUrlFromParams("/sqlite", toolUse.parameters)
      sqliteWatchRegistry?.register(url.searchParams.get("path") ?? "")
      const payload = sqliteDatabasePayload(url)
      sqliteWatchRegistry?.acceptPayload(payload)
      return {...base, ok: true, result: payload}
    } catch (error) {
      return {...base, ok: false, error: serializeError(error)}
    }
  }
  if (toolUse.recipientName === "sqlite.fingerprint") {
    try {
      const path = asString(toolUse.parameters["path"]) ?? ""
      sqliteWatchRegistry?.register(path)
      const fingerprint = sqliteDatabaseFingerprint(path)
      sqliteWatchRegistry?.acceptFingerprint(fingerprint)
      return {...base, ok: true, result: fingerprint}
    } catch (error) {
      return {...base, ok: false, error: serializeError(error)}
    }
  }
  if (toolUse.recipientName === "sqlite.open") {
    if (sqliteWatchRegistry === undefined) return {...base, ok: false, error: "sqlite.open is unavailable in this route scope"}
    return await toolResultFromResponse(base, await openSqliteDisplayFromBody(jsonToolRequest("/tools", toolUse.parameters), dispatchUiHostCommand, sqliteWatchRegistry), "sqlite.open failed")
  }
  if (toolUse.recipientName === "sqlite.cell") {
    try {
      const payload = await updateSqliteCell(jsonToolRequest("/tools", toolUse.parameters))
      sqliteWatchRegistry?.acceptPayload(payload)
      return {...base, ok: true, result: payload}
    } catch (error) {
      return {...base, ok: false, error: serializeError(error)}
    }
  }
  const androidRoute = androidRouteForTool(toolUse.recipientName)
  if (androidRoute !== null) return await toolResultFromResponse(base, await proxyAndroidRequest(toolRequest(androidRoute.path, toolUse.parameters, androidRoute.method), androidRoute.path), `${toolUse.recipientName} failed`)
  if (toolUse.recipientName === "events.tail") return {...base, ok: true, result: readNdjsonTail(options.eventLogPath, toolUrlFromParams("/events", toolUse.parameters))}
  if (toolUse.recipientName === "console.tail") return {...base, ok: true, result: readNdjsonTail(options.consoleLogPath, toolUrlFromParams("/console", toolUse.parameters))}
  if (toolUse.recipientName === "host.reload") {
    broadcast({type: "reload"})
    return {...base, ok: true, result: {ok: true}}
  }
  if (toolUse.recipientName === "host.restart") return await toolResultFromResponse(base, restartInterpreterHost(broadcast, options), "host.restart failed")
  return null
}

async function runProcessToolUse(
  module: InterpreterModule,
  toolUse: InterpreterToolUse,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
): Promise<JsonObject> {
  const base: JsonObject = {recipient_name: toolUse.recipientName}
  if (toolUse.toolUseId !== undefined) base["tool_use_id"] = toolUse.toolUseId

  try {
    if (toolUse.recipientName === "source.read") {
      return {...base, ok: true, result: await sourceReadToolPayload(module, toolUse.parameters)}
    }
    if (toolUse.recipientName === "source.read_many") {
      return {...base, ok: true, result: await sourceReadManyToolPayload(module, toolUse.parameters)}
    }
    if (toolUse.recipientName === "source.locate") {
      const result = sourceLocateToolPayload(toolUse.parameters)
      const ok = result["ok"] === true
      const response: JsonObject = {...base, ok, status: ok ? 200 : 409, result}
      if (!ok) response["error"] = asString(result["error"]) ?? "source.locate failed"
      return response
    }
    if (toolUse.recipientName === "source.open") {
      const payload = await sourceUiActionPayload(module.id, "source.open", toolUse.parameters, dispatchUiHostCommand)
      const ok = payload.status < 400 && payload.body["ok"] !== false
      const response: JsonObject = {...base, ok, status: payload.status, result: payload.body}
      if (!ok) response["error"] = asString(payload.body["error"]) ?? "source.open failed"
      return response
    }
    if (toolUse.recipientName === "source.openSelection") {
      const payload = await sourceUiActionPayload(module.id, "source.openSelection", toolUse.parameters, dispatchUiHostCommand)
      const ok = payload.status < 400 && payload.body["ok"] !== false
      const response: JsonObject = {...base, ok, status: payload.status, result: payload.body}
      if (!ok) response["error"] = asString(payload.body["error"]) ?? "source.openSelection failed"
      return response
    }
    if (toolUse.recipientName === "source.write") {
      const payload = await saveModuleSourcePayload(module.id, toolUse.parameters, options, broadcast)
      const ok = payload.status < 400 && payload.body["ok"] === true
      const response: JsonObject = {...base, ok, status: payload.status, result: payload.body}
      if (!ok) response["error"] = asString(payload.body["error"]) ?? "source.write failed"
      return response
    }
    if (toolUse.recipientName === "source.apply_patch") {
      const patch = readPatchTextFromParams(toolUse.parameters)
      if (patch === undefined || patch.trim().length === 0) return {...base, ok: false, error: "patch required"}
      const payload = await applyModulePatchPayload(module.id, patch, options, broadcast)
      const ok = payload.status < 400 && payload.body["ok"] === true
      const response: JsonObject = {...base, ok, status: payload.status, result: payload.body}
      if (!ok) response["error"] = asString(payload.body["error"]) ?? "source.apply_patch failed"
      return response
    }
    if (toolUse.recipientName === "process.action") {
      const payload = await processActionPayload(module.id, toolUse.parameters, options, dispatchUiHostCommand)
      const ok = payload.status < 400 && payload.body["ok"] !== false
      const response: JsonObject = {...base, ok, status: payload.status, result: payload.body}
      if (!ok) response["error"] = asString(payload.body["error"]) ?? "process.action failed"
      return response
    }
    return {...base, ok: false, error: `unknown tool recipient_name: ${toolUse.recipientName}`}
  } catch (error) {
    return {...base, ok: false, error: serializeError(error)}
  }
}

function isProcessScopedTool(recipientName: string): boolean {
  return recipientName === "source.read"
    || recipientName === "source.read_many"
    || recipientName === "source.locate"
    || recipientName === "source.open"
    || recipientName === "source.openSelection"
    || recipientName === "source.write"
    || recipientName === "source.apply_patch"
    || recipientName === "process.action"
}

function moduleForToolUse(toolUse: InterpreterToolUse, options: HttpServerOptions): InterpreterModule | undefined {
  const processId = processIdForToolUse(toolUse)
  return processId === undefined ? undefined : moduleForProcessId(processId, options)
}

function processIdForToolUse(toolUse: InterpreterToolUse): string | undefined {
  return asString(toolUse.parameters["processId"])
}

function processRouteParamsForTool(toolUse: InterpreterToolUse): JsonObject {
  const processId = processIdForToolUse(toolUse)
  return processId === undefined ? toolUse.parameters : processRouteParams(processId, toolUse.parameters)
}

function toolResultBase(toolUse: InterpreterToolUse): JsonObject {
  const base: JsonObject = {recipient_name: toolUse.recipientName}
  if (toolUse.toolUseId !== undefined) base["tool_use_id"] = toolUse.toolUseId
  return base
}

async function toolResultFromNullableResponse(base: JsonObject, response: Response | null, fallbackError: string): Promise<JsonObject> {
  if (response === null) return {...base, ok: false, error: fallbackError}
  return await toolResultFromResponse(base, response, fallbackError)
}

async function toolResultFromResponse(base: JsonObject, response: Response, fallbackError: string): Promise<JsonObject> {
  const payload = await jsonAnyPayloadFromResponse(response)
  const ok = payload.status < 400 && payload.body["ok"] !== false
  const result: JsonObject = {...base, ok, status: payload.status, result: payload.body}
  if (!ok) result["error"] = asString(payload.body["error"]) ?? fallbackError
  return result
}

async function todoMutationToolResult(base: JsonObject, response: Response, fallbackError: string, dispatch: UiHostCommandDispatcher): Promise<JsonObject> {
  const payload = await jsonAnyPayloadFromResponse(response)
  const ok = payload.status < 400 && payload.body["ok"] !== false
  const result: JsonObject = {...base, ok, status: payload.status, result: payload.body}
  if (!ok) {
    result["error"] = asString(payload.body["error"]) ?? fallbackError
    return result
  }

  const item = asObject(payload.body["item"])
  const itemId = item === undefined ? undefined : asString(item["id"])
  const visibility: JsonObject = {}
  try {
    visibility["show"] = await dispatch("hud.todo.show", {})
    visibility["highlight"] = await dispatch("hud.todo.highlight", itemId === undefined ? {ids: []} : {id: itemId})
  } catch (error) {
    visibility["ok"] = false
    visibility["error"] = serializeError(error)
  }
  payload.body["visibility"] = visibility
  return result
}

async function jsonAnyPayloadFromResponse(response: Response): Promise<{status: number; body: JsonObject}> {
  const value = await response.json().catch((error) => ({ok: false, error: serializeError(error)}))
  const object = asObject(value)
  return {status: response.status, body: object ?? {ok: response.ok, value}}
}

function jsonToolRequest(path: string, body: JsonObject, method = "POST"): Request {
  return new Request(`http://interpreter${path}`, {
    method,
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  })
}

function toolRequest(path: string, params: JsonObject, method: string): Request {
  if (method === "GET") return new Request(toolUrlFromParams(path, params), {method})
  return jsonToolRequest(path, params, method)
}

function toolUrlFromParams(path: string, params: JsonObject): URL {
  const url = new URL(path, "http://interpreter")
  for (const [key, value] of Object.entries(params)) {
    if (key === "processId" || key === "moduleId" || key === "id") continue
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") url.searchParams.set(key, String(value))
  }
  return url
}

function requiredStringParam(params: JsonObject, name: string): string | undefined {
  const value = asString(params[name])
  return value === undefined || value.trim().length === 0 ? undefined : value
}

function hudCommandForTool(name: string): {command: string; paramsFromBody: boolean} | null {
  const commands: Record<string, {command: string; paramsFromBody: boolean}> = {
    "hud.terminal.get": {command: "hud.terminal.get", paramsFromBody: false},
    "hud.terminal.dock": {command: "hud.terminal.dock", paramsFromBody: true},
    "hud.terminal.show": {command: "hud.terminal.show", paramsFromBody: true},
    "hud.terminal.toggle": {command: "hud.terminal.toggle", paramsFromBody: true},
    "hud.terminal.network.get": {command: "hud.terminal.network.get", paramsFromBody: false},
    "hud.terminal.network.dock": {command: "hud.terminal.network.dock", paramsFromBody: true},
    "hud.terminal.network.show": {command: "hud.terminal.network.show", paramsFromBody: true},
    "hud.terminal.network.toggle": {command: "hud.terminal.network.toggle", paramsFromBody: true},
    "hud.android.get": {command: "hud.android.get", paramsFromBody: false},
    "hud.android.dock": {command: "hud.android.dock", paramsFromBody: true},
    "hud.android.show": {command: "hud.android.show", paramsFromBody: true},
    "hud.android.toggle": {command: "hud.android.toggle", paramsFromBody: true},
    "hud.android.refresh": {command: "hud.android.refresh", paramsFromBody: false},
    "hud.android.control": {command: "hud.android.control", paramsFromBody: true},
    "todo.panel": {command: "hud.todo.get", paramsFromBody: false},
    "todo.highlight": {command: "hud.todo.highlight", paramsFromBody: true},
    "todo.dock": {command: "hud.todo.dock", paramsFromBody: true},
    "todo.show": {command: "hud.todo.show", paramsFromBody: true},
    "todo.toggle": {command: "hud.todo.toggle", paramsFromBody: true},
    "sqlite.panel": {command: "hud.sqlite.get", paramsFromBody: false},
    "sqlite.dock": {command: "hud.sqlite.dock", paramsFromBody: true},
    "sqlite.show": {command: "hud.sqlite.show", paramsFromBody: true},
    "sqlite.toggle": {command: "hud.sqlite.toggle", paramsFromBody: true},
  }
  return commands[name] ?? null
}

function chromeDevtoolsRouteForTool(name: string): {method: string; path: string} | null {
  const routes: Record<string, {method: string; path: string}> = {
    "devtools.targets": {method: "GET", path: "/devtools/targets"},
    "devtools.state": {method: "GET", path: "/devtools/state"},
    "devtools.console": {method: "GET", path: "/devtools/console"},
    "devtools.console.clear": {method: "POST", path: "/devtools/console/clear"},
    "devtools.breakpoint": {method: "POST", path: "/devtools/breakpoints"},
    "devtools.probe": {method: "POST", path: "/devtools/probe"},
    "devtools.reload": {method: "POST", path: "/devtools/reload"},
    "devtools.viewport.sync": {method: "POST", path: "/devtools/viewport/sync"},
    "devtools.resume": {method: "POST", path: "/devtools/resume"},
    "devtools.disable": {method: "POST", path: "/devtools/disable"},
    "devtools.evaluate": {method: "POST", path: "/devtools/evaluate"},
  }
  return routes[name] ?? null
}

function browserHostRouteForTool(name: string): {method: string; path: string} | null {
  const routes: Record<string, {method: string; path: string}> = {
    "browser.health": {method: "GET", path: "/browser-display/health"},
    "browser.state": {method: "GET", path: "/browser-display/state"},
    "browser.status": {method: "GET", path: "/browser-display/status"},
    "browser.navigate": {method: "POST", path: "/browser-display/navigate"},
    "browser.reload": {method: "POST", path: "/browser-display/reload"},
    "browser.back": {method: "POST", path: "/browser-display/back"},
    "browser.forward": {method: "POST", path: "/browser-display/forward"},
    "browser.devtools": {method: "POST", path: "/browser-display/devtools"},
    "browser.fullscreen": {method: "POST", path: "/browser-display/fullscreen"},
    "browser.viewport": {method: "POST", path: "/browser-display/viewport"},
    "browser.input": {method: "POST", path: "/browser-display/input"},
    "remote_desktop.health": {method: "GET", path: "/remote-desktop/health"},
    "remote_desktop.state": {method: "GET", path: "/remote-desktop/state"},
    "remote_desktop.status": {method: "GET", path: "/remote-desktop/status"},
    "remote_desktop.rtc.state": {method: "GET", path: "/remote-desktop/rtc/state"},
    "remote_desktop.rtc.restart": {method: "POST", path: "/remote-desktop/rtc/restart"},
    "remote_desktop.input": {method: "POST", path: "/remote-desktop/input"},
    "remote_desktop.browser.windows": {method: "GET", path: "/remote-desktop/browser/windows"},
    "remote_desktop.browser.open": {method: "POST", path: "/remote-desktop/browser/open"},
  }
  return routes[name] ?? null
}

function remoteDesktopLifecycleRouteForTool(name: string, params: JsonObject): {method: string; path: string} | null {
  if (name === "remote_desktop.lifecycle") return {method: asString(params["action"]) === undefined || params["action"] === "status" ? "GET" : "POST", path: "/remote-desktop/lifecycle"}
  return null
}

function androidRouteForTool(name: string): {method: string; path: string} | null {
  const routes: Record<string, {method: string; path: string}> = {
    "android.size": {method: "GET", path: "/android/size"},
    "android.screencap": {method: "GET", path: "/android/screencap"},
    "android.tap": {method: "POST", path: "/android/tap"},
    "android.swipe": {method: "POST", path: "/android/swipe"},
    "android.key": {method: "POST", path: "/android/key"},
  }
  return routes[name] ?? null
}

async function sourceReadManyToolPayload(module: InterpreterModule, params: JsonObject): Promise<JsonObject> {
  const sources = params["sources"]
  if (!Array.isArray(sources)) throw new Error("sources must be an array")

  const results: JsonObject[] = []
  for (const [index, source] of sources.entries()) {
    const sourceParams = typeof source === "string" ? {sourceUrl: source} : asObject(source)
    if (sourceParams === undefined) {
      results.push({ok: false, index, error: `sources[${index}] must be a string or object`})
      continue
    }
    try {
      results.push({ok: true, index, ...await sourceReadToolPayload(module, sourceParams)})
    } catch (error) {
      results.push({ok: false, index, error: serializeError(error)})
    }
  }

  return {
    ok: results.every((result) => result["ok"] === true),
    sources: results,
  }
}

async function sourceReadToolPayload(module: InterpreterModule, params: JsonObject): Promise<JsonObject> {
  if (params["ranges"] === undefined) {
    return await jsonObjectFromResponse(await getScriptSourceForModule(sourceReadUrlFromParams(params), module, module.id))
  }

  const sourceUrl = asString(params["sourceUrl"])
    ?? asString(params["path"])
    ?? asString(params["modulePath"])
  if (sourceUrl === undefined || sourceUrl.trim().length === 0) throw new Error("sourceUrl required")

  const path = sourceFilePath(sourceUrl)
  if (path === undefined) throw new Error("sourceUrl is not a local file path")

  const scriptSource = readFileSync(path, "utf8")
  const stat = statSync(path)
  const rangePayload = sourceReadRangesPayload(scriptSource, params)
  const gitBaseSource = gitBaseSourceForFile(path)
  return {
    sourceUrl,
    url: sourceUrl,
    path,
    sourceKind: "file",
    cached: false,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    sha256: sha256Text(scriptSource),
    lineCount: sourceTextLines(scriptSource).length,
    ...(gitBaseSource === undefined ? {} : {gitBaseSource}),
    ...(rangePayload === undefined ? {scriptSource, text: scriptSource} : {ranges: rangePayload}),
  }
}

type SourceLocateMatch = {line: number; column: number; text: string}

function sourceLocateToolPayload(params: JsonObject): JsonObject {
  const locatorParams = sourceLocatorParams(params)
  if (asString(locatorParams["urlRegex"]) !== undefined) {
    return {ok: false, error: "source.locate requires a concrete sourceUrl, path, modulePath or url"}
  }
  const sourceUrl = sourceLocatorSourceUrl(locatorParams)
  if (sourceUrl === undefined || sourceUrl.trim().length === 0) return {ok: false, error: "sourceUrl required"}

  const path = sourceFilePath(sourceUrl)
  if (path === undefined) return {ok: false, sourceUrl, url: sourceUrl, error: "sourceUrl is not a local file path"}

  const scriptSource = readFileSync(path, "utf8")
  return sourceLocatePayload(sourceUrl, path, sourceTextLines(scriptSource), locatorParams)
}

function sourceLocatorParams(params: JsonObject): JsonObject {
  const locator = asObject(params["locator"])
  return locator === undefined ? params : {...params, ...locator}
}

function sourceLocatorSourceUrl(params: JsonObject): string | undefined {
  return asString(params["sourceUrl"])
    ?? asString(params["path"])
    ?? asString(params["modulePath"])
    ?? asString(params["url"])
}

function hasSourceLocator(params: JsonObject): boolean {
  const locatorParams = sourceLocatorParams(params)
  return asString(locatorParams["text"]) !== undefined
    || asString(locatorParams["query"]) !== undefined
    || asString(locatorParams["regex"]) !== undefined
}

function sourceLocatePayload(sourceUrl: string, path: string, lines: string[], params: JsonObject): JsonObject {
  const text = asString(params["text"]) ?? asString(params["query"])
  const regex = asString(params["regex"])
  const locator = sourceLocatorSummary(sourceUrl, params)
  if ((text === undefined || text.length === 0) && (regex === undefined || regex.length === 0)) {
    return {ok: false, sourceUrl, url: sourceUrl, path, locator, error: "text, query or regex required"}
  }
  if (text !== undefined && regex !== undefined) {
    return {ok: false, sourceUrl, url: sourceUrl, path, locator, error: "use either text/query or regex, not both"}
  }

  const caseSensitive = asBoolean(params["caseSensitive"]) ?? true
  const bounds = sourceLocateBounds(lines, params, caseSensitive)
  if (bounds.error !== undefined) return {ok: false, sourceUrl, url: sourceUrl, path, locator, error: bounds.error}

  let matches: SourceLocateMatch[]
  if (regex !== undefined) {
    try {
      matches = sourceLocateRegexMatches(lines, regex, asString(params["flags"]) ?? "", bounds.startIndex, bounds.endIndex)
    } catch (error) {
      return {ok: false, sourceUrl, url: sourceUrl, path, locator, error: `invalid regex: ${serializeError(error)}`}
    }
  } else {
    matches = sourceLocateTextMatches(lines, text!, caseSensitive, bounds.startIndex, bounds.endIndex)
  }

  const nearLine = positiveIntegerFromValue(params["nearLine"])
  if (nearLine !== undefined) {
    matches = [...matches].sort((a, b) => Math.abs(a.line - nearLine) - Math.abs(b.line - nearLine) || a.line - b.line || a.column - b.column)
  }

  const contextLines = boundedInteger(params["contextLines"], 2, 0, 8)
  const maxMatches = boundedInteger(params["maxMatches"], 20, 1, 100)
  const occurrence = positiveIntegerFromValue(params["occurrence"])
  const previewMatches = matches.slice(0, maxMatches).map((match) => sourceLocateMatchPayload(lines, match, contextLines))
  const base: JsonObject = {
    ok: false,
    sourceUrl,
    url: sourceUrl,
    path,
    locator,
    matchCount: matches.length,
    truncated: matches.length > maxMatches,
    matches: previewMatches,
  }

  if (matches.length === 0) return {...base, error: "source locator not found"}
  if (occurrence !== undefined) {
    const match = matches[occurrence - 1]
    if (match === undefined) return {...base, error: "source locator occurrence out of range"}
    return {...base, ok: true, match: sourceLocateMatchPayload(lines, match, contextLines)}
  }
  if (matches.length > 1) return {...base, error: "ambiguous source locator"}
  return {...base, ok: true, match: previewMatches[0]}
}

function sourceLocatorSummary(sourceUrl: string, params: JsonObject): JsonObject {
  const locator: JsonObject = {sourceUrl}
  for (const key of ["text", "query", "regex", "flags", "after", "before", "occurrence", "nearLine", "caseSensitive"] as const) {
    if (params[key] !== undefined) locator[key] = params[key]
  }
  return locator
}

function sourceLocateBounds(lines: string[], params: JsonObject, caseSensitive: boolean): {startIndex: number; endIndex: number; error?: string} {
  let startIndex = 0
  let endIndex = lines.length - 1
  const after = asString(params["after"])
  if (after !== undefined) {
    const index = lines.findIndex((line) => sourceLocateIncludes(line, after, caseSensitive))
    if (index < 0) return {startIndex, endIndex, error: "source locator after marker not found"}
    startIndex = index + 1
  }
  const before = asString(params["before"])
  if (before !== undefined) {
    const index = lines.findIndex((line, lineIndex) => lineIndex >= startIndex && sourceLocateIncludes(line, before, caseSensitive))
    if (index < 0) return {startIndex, endIndex, error: "source locator before marker not found"}
    endIndex = index - 1
  }
  return {startIndex, endIndex}
}

function sourceLocateIncludes(line: string, needle: string, caseSensitive: boolean): boolean {
  return caseSensitive ? line.includes(needle) : line.toLowerCase().includes(needle.toLowerCase())
}

function sourceLocateTextMatches(lines: string[], text: string, caseSensitive: boolean, startIndex: number, endIndex: number): SourceLocateMatch[] {
  const matches: SourceLocateMatch[] = []
  const needle = caseSensitive ? text : text.toLowerCase()
  for (let index = startIndex; index <= endIndex; index++) {
    const line = lines[index] ?? ""
    const haystack = caseSensitive ? line : line.toLowerCase()
    let from = 0
    while (from <= haystack.length) {
      const column = haystack.indexOf(needle, from)
      if (column < 0) break
      matches.push({line: index + 1, column, text: line})
      from = column + needle.length
    }
  }
  return matches
}

function sourceLocateRegexMatches(lines: string[], pattern: string, flags: string, startIndex: number, endIndex: number): SourceLocateMatch[] {
  const regex = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`)
  const matches: SourceLocateMatch[] = []
  for (let index = startIndex; index <= endIndex; index++) {
    const line = lines[index] ?? ""
    regex.lastIndex = 0
    let match: RegExpExecArray | null = regex.exec(line)
    while (match !== null) {
      matches.push({line: index + 1, column: match.index, text: line})
      if (match[0].length === 0) regex.lastIndex += 1
      match = regex.exec(line)
    }
  }
  return matches
}

function sourceLocateMatchPayload(lines: string[], match: SourceLocateMatch, contextLines: number): JsonObject {
  const startLine = Math.max(1, match.line - contextLines)
  const endLine = Math.min(lines.length, match.line + contextLines)
  return {
    line: match.line,
    column: match.column,
    text: match.text,
    context: {
      startLine,
      endLine,
      text: numberedSourceLines(lines.slice(startLine - 1, endLine), startLine),
    },
  }
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN
  if (!Number.isInteger(number)) return fallback
  return Math.min(Math.max(number, min), max)
}

function sourceReadUrlFromParams(params: JsonObject): URL {
  const url = new URL("http://interpreter/source")
  const scriptId = asString(params["scriptId"])
  const sourceUrl = asString(params["sourceUrl"])
    ?? asString(params["path"])
    ?? asString(params["modulePath"])
  const sourceKind = asString(params["sourceKind"])
  const tokens = params["tokens"]
  if (scriptId !== undefined) url.searchParams.set("scriptId", scriptId)
  if (sourceUrl !== undefined) url.searchParams.set("sourceUrl", sourceUrl)
  if (sourceKind !== undefined) url.searchParams.set("sourceKind", sourceKind)
  if (tokens === false || tokens === 0 || tokens === "0") url.searchParams.set("tokens", "0")
  return url
}

async function jsonObjectFromResponse(response: Response): Promise<JsonObject> {
  const body = asObject(await response.json().catch((error) => ({ok: false, error: serializeError(error)}))) ?? {}
  if (response.status >= 400) throw new Error(asString(body["error"]) ?? `request failed: ${response.status}`)
  return body
}

function sourceReadRangesPayload(scriptSource: string, params: JsonObject): JsonObject[] | undefined {
  const ranges = params["ranges"]
  if (ranges === undefined) return undefined
  if (!Array.isArray(ranges)) throw new Error("ranges must be an array")

  const includeLineNumbers = asBoolean(params["includeLineNumbers"])
    ?? asBoolean(params["lineNumbers"])
    ?? false
  const lines = sourceTextLines(scriptSource)
  return ranges.map((range, index) => sourceReadRangePayload(lines, range, index, includeLineNumbers))
}

function sourceReadRangePayload(lines: string[], value: unknown, index: number, includeLineNumbers: boolean): JsonObject {
  const range = asObject(value)
  if (range === undefined) throw new Error(`ranges[${index}] must be an object`)

  const startLine = positiveIntegerFromValue(range["startLine"])
    ?? positiveIntegerFromValue(range["line"])
    ?? positiveIntegerFromValue(range["start"])
  if (startLine === undefined) throw new Error(`ranges[${index}].startLine must be a positive integer`)

  const explicitEndLine = positiveIntegerFromValue(range["endLine"])
    ?? positiveIntegerFromValue(range["end"])
  const limit = positiveIntegerFromValue(range["limit"])
    ?? positiveIntegerFromValue(range["lineCount"])
  const endLine = explicitEndLine ?? (limit === undefined ? startLine : startLine + limit - 1)
  if (endLine < startLine) throw new Error(`ranges[${index}].endLine must be greater than or equal to startLine`)

  const clippedStartLine = Math.min(Math.max(startLine, 1), lines.length + 1)
  const clippedEndLine = Math.min(endLine, lines.length)
  const selected = clippedStartLine <= clippedEndLine ? lines.slice(clippedStartLine - 1, clippedEndLine) : []
  return {
    index,
    startLine,
    endLine,
    clippedStartLine,
    clippedEndLine,
    lineCount: selected.length,
    text: includeLineNumbers ? numberedSourceLines(selected, clippedStartLine) : selected.join("\n"),
  }
}

function sourceTextLines(scriptSource: string): string[] {
  const lines = scriptSource.split("\n")
  if (scriptSource.endsWith("\n")) lines.pop()
  return lines
}

function numberedSourceLines(lines: string[], startLine: number): string {
  return lines.map((line, index) => `${startLine + index}\t${line}`).join("\n")
}

function positiveIntegerFromValue(value: unknown): number | undefined {
  const number = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

function gitBaseSourceForFile(path: string): string | undefined {
  const repoRoot = gitCommandText(["rev-parse", "--show-toplevel"], dirname(path))?.trim()
  if (repoRoot === undefined || repoRoot.length === 0) return undefined
  const rel = relative(repoRoot, resolve(path)).replaceAll("\\", "/")
  if (rel.length === 0 || rel === ".." || rel.startsWith("../")) return undefined

  const base = gitCommandText(["show", `HEAD:${rel}`], repoRoot)
  if (base !== undefined) return base

  const status = gitCommandText(["status", "--porcelain", "--untracked-files=normal", "--", rel], repoRoot)
  return status !== undefined && status.trim().length > 0 ? "" : undefined
}

function gitCommandText(args: readonly string[], cwd: string): string | undefined {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  return result.status === 0 && typeof result.stdout === "string" ? result.stdout : undefined
}

async function saveModuleSourcePayload(
  moduleId: string,
  params: JsonObject,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<{status: number; body: JsonObject}> {
  if (options.modules.get(moduleId) === undefined) return {status: 404, body: {ok: false, error: `module not found: ${moduleId}`}}
  const sourceUrl = asString(params["sourceUrl"])
    ?? asString(params["path"])
    ?? asString(params["modulePath"])
  const text = asString(params["text"])
    ?? asString(params["scriptSource"])
    ?? asString(params["content"])
  if (sourceUrl === undefined || sourceUrl.trim().length === 0) return {status: 400, body: {ok: false, error: "sourceUrl required"}}
  if (text === undefined) return {status: 400, body: {ok: false, error: "text required"}}

  const filePath = sourceFilePath(sourceUrl)
  if (filePath === undefined) return {status: 400, body: {ok: false, sourceUrl, error: "sourceUrl is not a local file path"}}

  const before = readFileSync(filePath, "utf8")
  const patch = createReplaceFilePatch(filePath, before, text)
  let result: ApplyPatchResult = {ok: true, files: []}
  if (patch !== null) {
    let breakpointUpdates: SourcePatchBreakpointUpdate[] = []
    try {
      result = applyPatch({patch})
      breakpointUpdates = await remapBreakpointsForPatch(options, result, sourceUrl)
    } catch (error) {
      return {status: 400, body: {ok: false, sourceUrl, path: filePath, error: serializeError(error)}}
    }
    clearSourceCaches()
    broadcastSourcePatched(options, broadcast, moduleId, "save", result, sourceUrl, breakpointUpdates)
    broadcastTodoMarkdownForPatch(result, broadcast)
    const replay = await replayModulesForPatch(options, result)
    return {status: 200, body: {
      ok: true,
      moduleId,
      sourceUrl,
      path: filePath,
      bytes: Buffer.byteLength(text, "utf8"),
      mtimeMs: statSync(filePath).mtimeMs,
      size: statSync(filePath).size,
      patch: result,
      replay,
    }}
  }
  const stat = statSync(filePath)
  return {status: 200, body: {
    ok: true,
    moduleId,
    sourceUrl,
    path: filePath,
    bytes: Buffer.byteLength(text, "utf8"),
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    patch: result,
    replay: [],
  }}
}

async function applyModulePatchPayload(
  moduleId: string,
  patch: string,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<{status: number; body: JsonObject}> {
  if (options.modules.get(moduleId) === undefined) return {status: 404, body: {ok: false, error: `module not found: ${moduleId}`}}
  if (patch.trim().length === 0) return {status: 400, body: {ok: false, moduleId, error: "patch required"}}

  try {
    const result = applyPatch({patch})
    const breakpointUpdates = await remapBreakpointsForPatch(options, result)
    if (result.files.length > 0) {
      clearSourceCaches()
      broadcastSourcePatched(options, broadcast, moduleId, "apply_patch", result, undefined, breakpointUpdates)
      broadcastTodoMarkdownForPatch(result, broadcast)
    }
    const replay = await replayModulesForPatch(options, result)
    return {status: 200, body: {ok: true, moduleId, patch: result, breakpoints: breakpointUpdates, replay}}
  } catch (error) {
    return {status: 400, body: {ok: false, moduleId, error: serializeError(error)}}
  }
}

async function processActionPayload(
  processId: string,
  params: JsonObject,
  options: HttpServerOptions,
  dispatch: UiHostCommandDispatcher,
): Promise<{status: number; body: JsonObject}> {
  const action = asString(params["action"]) ?? asString(params["cmd"]) ?? asString(params["command"])
  if (action === undefined) return {status: 400, body: {ok: false, processId, error: "process action must be a string"}}
  const actionParams = asObject(params["params"]) ?? params
  if (action === "close" || action === "delete" || action === "remove") return await jsonPayloadFromResponse(await closeProcess(processId, actionParams, options))
  if (action === "stop") return await jsonPayloadFromResponse(await stopProcessTarget(processId, actionParams, options))
  if (action === "restart") return await jsonPayloadFromResponse(await restartProcessTarget(processId, actionParams, options))
  return await jsonPayloadFromResponse(await dispatchUiHostRoute("processes.action", processRouteParams(processId, params), dispatch))
}

async function sourceUiActionPayload(
  processId: string,
  action: "source.open" | "source.openSelection",
  params: JsonObject,
  dispatch: UiHostCommandDispatcher,
): Promise<{status: number; body: JsonObject}> {
  const body: JsonObject = {action}
  if (Object.keys(params).length > 0) body["params"] = params
  return await jsonPayloadFromResponse(await dispatchUiHostRoute("processes.action", processRouteParams(processId, body), dispatch))
}

async function jsonPayloadFromResponse(response: Response): Promise<{status: number; body: JsonObject}> {
  return {
    status: response.status,
    body: asObject(await response.json().catch((error) => ({ok: false, error: serializeError(error)}))) ?? {},
  }
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

function broadcastTodoMarkdownForPatch(result: ApplyPatchResult, broadcast: (payload: JsonObject) => void): void {
  if (!patchTouchesTodoMarkdown(result)) return
  const payload = todoMarkdownPayload()
  broadcast(payload === null ? {type: "hud-todo-changed"} : {type: "hud-todo-changed", todo: payload})
}

function patchTouchesTodoMarkdown(result: ApplyPatchResult): boolean {
  const todoPath = todoMarkdownPath()
  return result.files.some((file) => (
    resolve(file.path) === todoPath
    || (file.oldPath !== undefined && resolve(file.oldPath) === todoPath)
  ))
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

  const withoutRuntimePrefix = clean.replace(/^r\//, "")
  if (withoutRuntimePrefix !== clean) return existingSourcePath(withoutRuntimePrefix) ?? resolve(process.cwd(), withoutRuntimePrefix)

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
