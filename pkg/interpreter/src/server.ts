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
import {existsSync, statSync, openSync, readSync, closeSync, readFileSync} from "node:fs"
import {join, relative, resolve} from "node:path"
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
import {asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {JsonObject} from "./types.ts"
import {sourceMapMapper} from "./source-map.ts"
import {applyPatch, createReplaceFilePatch, type ApplyPatchFileChange, type ApplyPatchResult} from "./apply-patch.ts"
import {remapBreakpointLine, type BreakpointRegistration} from "./breakpoints.ts"
import {createPtySessionManager, parsePtyClientMessage, type PtySocketData, type TerminalSession} from "@metafor/pty/server"
import type {InterpreterModule, InterpreterModuleManager, StartupModuleOptions} from "./module.ts"
import type {BreakpointSpec} from "./target.ts"
import {workspaceFilesPayload, type WorkspaceFilesModuleContext} from "./workspace-files.ts"
import {sqliteDatabaseInputPath, sqliteDatabasePayload, sqliteJsonError, updateSqliteCell} from "./sqlite-db.ts"

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

type WsClientData = UiWsClientData | TerminalWsClientData

const NDJSON_TAIL_DEFAULT_LIMIT = 200
const NDJSON_TAIL_MAX_LIMIT = 5_000
const UI_HOST_COMMAND_TIMEOUT_MS = 8_000
const VALID_STOP_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT"])
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

export function startHttpServer(options: HttpServerOptions): HttpServer {
  const wsClients = new Set<ServerWebSocket<WsClientData>>()
  const terminalSessions = interpreterTerminalSessions()
  let nextWsClientId = 1
  let nextTerminalClientId = 1
  let nextUiHostRequestId = 1
  const pendingUiHostRequests = new Map<number, UiHostPendingRequest>()
  const moduleContexts: ModuleContextStore = new Map()

  if (!isLoopbackHost(options.host)) {
    const warning = "/modules/run can execute local commands; bind the interpreter to loopback unless this is intentional"
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

  const dispatchUiHostCommand: UiHostCommandDispatcher = (command, params) => {
    const client = [...wsClients].find((item) => item.readyState === WebSocket.OPEN)
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

  // verbose-стрим: события интерпретатора идут отдельно от module-scoped
  // protocol events; UI раскладывает их по дисплеям по moduleId.
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
    subscribeModule(event.module)
    broadcast({type: "module", module: event.module.snapshot()})
    broadcastModules()
  })

  const websocket: WebSocketHandler<WsClientData> = {
    open(ws): void {
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
      if (ws.data.kind === "terminal") {
        const payload = parsePtyClientMessage(raw)
        const session = ws.data.session
        if (payload === null || session === undefined) return
        if (payload.type === "input.write") {
          session.write(payload.data, payload.localEchoId)
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
        acceptModuleContext(message, moduleContexts, options, ws.data.id)
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
        }, params, cmd)
        ws.send(JSON.stringify({type: "result", requestId, ok: true, result}))
      } catch (error) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: serializeError(error)}))
      }
    },
    close(ws): void {
      if (ws.data.kind === "terminal") {
        ws.data.session?.detach(ws as ServerWebSocket<TerminalWsClientData>)
        delete ws.data.session
        options.logger.event("terminal.client.closed", {id: ws.data.id})
        return
      }

      wsClients.delete(ws)
      rejectPendingUiHostRequestsForClient(ws.data.id, pendingUiHostRequests)
      options.logger.event("ws.client.closed", {id: ws.data.id, total: wsClients.size})
    },
  }

  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    development: {hmr: false},
    routes: {
      "/": indexHtml,
    },
    async fetch(req, server): Promise<Response | undefined> {
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
      if (path === "/terminal") {
        if (!isAllowedWebSocketOrigin(req, url)) return jsonResponse({ok: false, error: "forbidden origin"}, 403)
        const id = nextTerminalClientId++
        const requestedSession = url.searchParams.get("session")
        const data: TerminalWsClientData = {
          kind: "terminal",
          id,
          connectedAt: Date.now(),
          replay: url.searchParams.get("replay") !== "0",
          ...(requestedSession === null ? {} : {sessionId: requestedSession}),
        }
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }
      if (method === "GET" && path === "/terminal/sessions") {
        return jsonResponse({sessions: terminalSessions.list()})
      }

      const start = Date.now()
      try {
        const response = await handleRoute(method, path, url, req, options, moduleContexts, broadcast, dispatchUiHostCommand)
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

function acceptModuleContext(
  message: JsonObject,
  contexts: ModuleContextStore,
  options: HttpServerOptions,
  clientId: number,
): void {
  const moduleId = asString(message["moduleId"])
  const context = asObject(message["context"])
  if (moduleId === undefined || context === undefined) return
  if (options.modules.get(moduleId) === undefined) return
  contexts.set(moduleId, {
    ...context,
    moduleId,
    origin: "ui",
    receivedAt: new Date().toISOString(),
  })
  options.logger.event("module.context", {clientId, moduleId})
}

function rejectPendingUiHostRequestsForClient(clientId: number, pending: Map<number, UiHostPendingRequest>): void {
  for (const [requestId, request] of pending) {
    if (request.clientId !== clientId) continue
    pending.delete(requestId)
    clearTimeout(request.timer)
    request.reject(new UiHostCommandError(`interpreter UI host disconnected during ${request.command}`, 503))
  }
}

async function dispatchUiHostRouteFromBody(command: string, req: Request, dispatch: UiHostCommandDispatcher): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  return await dispatchUiHostRoute(command, parsed.body, dispatch)
}

async function dispatchUiHostRoute(command: string, params: JsonObject, dispatch: UiHostCommandDispatcher): Promise<Response> {
  try {
    return jsonResponse(await dispatch(command, params))
  } catch (error) {
    const status = error instanceof UiHostCommandError ? error.status : 500
    return jsonResponse({ok: false, command, error: serializeError(error)}, status)
  }
}

async function openSqliteDisplayFromBody(req: Request, dispatch: UiHostCommandDispatcher): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const rawPath = asString(parsed.body["path"])
    ?? asString(parsed.body["sourceUrl"])
    ?? asString(parsed.body["modulePath"])
    ?? asString(parsed.body["database"])
  if (rawPath === undefined) return jsonResponse({ok: false, error: "sqlite.open requires path"}, 400)
  try {
    return await dispatchUiHostRoute("sqlite.open", {
      ...parsed.body,
      path: sqliteDatabaseInputPath(rawPath),
    }, dispatch)
  } catch (error) {
    return sqliteJsonError(error)
  }
}

async function handleRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  options: HttpServerOptions,
  moduleContexts: ModuleContextStore,
  broadcast: (payload: JsonObject) => void,
  dispatchUiHostCommand: UiHostCommandDispatcher,
): Promise<Response> {
  if (method === "GET" && path === "/") return jsonResponse({service: "@metafor/interpreter", routes: routeIndex()})
  if (method === "GET" && path === "/health") return jsonResponse(healthPayload(options))
  if (method === "GET" && path === "/displays") return await dispatchUiHostRoute("displays.list", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/displays/focus") return await dispatchUiHostRouteFromBody("displays.focus", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/displays/frame") return await dispatchUiHostRouteFromBody("displays.frame", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/interpreters") return await dispatchUiHostRoute("interpreters.list", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/interpreters/resolve") return await dispatchUiHostRouteFromBody("interpreters.resolve", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/interpreters/focus") return await dispatchUiHostRouteFromBody("interpreters.focus", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/interpreters/action") return await dispatchUiHostRouteFromBody("interpreters.action", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/context") return jsonResponse(contextPayload(options, moduleContexts))
  if (method === "GET" && path === "/hud/terminal") return await dispatchUiHostRoute("hud.terminal.get", {}, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/dock") return await dispatchUiHostRouteFromBody("hud.terminal.dock", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/show") return await dispatchUiHostRouteFromBody("hud.terminal.show", req, dispatchUiHostCommand)
  if (method === "POST" && path === "/hud/terminal/toggle") return await dispatchUiHostRouteFromBody("hud.terminal.toggle", req, dispatchUiHostCommand)
  if (method === "GET" && path === "/sqlite") {
    try {
      return jsonResponse(sqliteDatabasePayload(url))
    } catch (error) {
      return sqliteJsonError(error)
    }
  }
  if (method === "POST" && path === "/sqlite/open") return await openSqliteDisplayFromBody(req, dispatchUiHostCommand)
  if (method === "POST" && path === "/sqlite/cell") {
    try {
      return jsonResponse(await updateSqliteCell(req))
    } catch (error) {
      return sqliteJsonError(error)
    }
  }
  if (method === "GET" && path === "/modules") return jsonResponse({modules: options.modules.snapshots()})
  if (method === "POST" && path === "/modules/run") return await runModule(req, options)
  const moduleRun = /^\/modules\/([^/]+)\/run$/.exec(path)
  if (method === "POST" && moduleRun !== null) return await runExistingModule(moduleRun[1]!, req, options)
  const moduleStop = /^\/modules\/([^/]+)\/stop$/.exec(path)
  if (method === "POST" && moduleStop !== null) return await stopModule(moduleStop[1]!, req, options)
  const moduleCommand = /^\/modules\/([^/]+)\/command$/.exec(path)
  if (method === "POST" && moduleCommand !== null) return await dispatchModuleCommand(moduleCommand[1]!, req, options)
  const moduleSource = /^\/modules\/([^/]+)\/source$/.exec(path)
  if (method === "GET" && moduleSource !== null) return await getModuleScriptSource(moduleSource[1]!, url, options)
  if (method === "POST" && moduleSource !== null) return await saveModuleSource(moduleSource[1]!, req, options, broadcast)
  const moduleApplyPatch = /^\/modules\/([^/]+)\/apply[-_]patch$/.exec(path)
  if (method === "POST" && moduleApplyPatch !== null) return await applyModulePatch(moduleApplyPatch[1]!, req, options, broadcast)
  const moduleContext = /^\/modules\/([^/]+)\/context$/.exec(path)
  if (method === "GET" && moduleContext !== null) return getModuleContext(moduleContext[1]!, options, moduleContexts)
  const moduleBreakpoints = /^\/modules\/([^/]+)\/breakpoints$/.exec(path)
  if (method === "GET" && moduleBreakpoints !== null) return getModuleBreakpoints(moduleBreakpoints[1]!, options)
  const moduleBreakpoint = /^\/modules\/([^/]+)\/breakpoint$/.exec(path)
  if (method === "POST" && moduleBreakpoint !== null) return await setModuleBreakpoint(moduleBreakpoint[1]!, req, options)
  if (method === "DELETE" && moduleBreakpoint !== null) return await removeModuleBreakpoint(moduleBreakpoint[1]!, req, options)
  if (method === "GET" && path === "/events") return jsonResponse(readNdjsonTail(options.eventLogPath, url))
  if (method === "GET" && path === "/console") return jsonResponse(readNdjsonTail(options.consoleLogPath, url))
  if (method === "GET" && path === "/workspace/files") {
    const module = workspaceFilesModuleContext(url, options)
    return jsonResponse(workspaceFilesPayload(url, module === undefined ? {} : {module}))
  }
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

function routeIndex(): Array<{method: string; path: string; description: string}> {
  return [
    {method: "GET", path: "/health", description: "статус коннекта и параметры"},
    {method: "GET", path: "/displays", description: "список UI-дисплеев и их экранная геометрия"},
    {method: "POST", path: "/displays/focus", description: "{selector:{side|displayId|moduleId|label|order}, view?, dockHostTerminal?} — сфокусировать дисплей; terminal HUD не трогается без явного dockHostTerminal:true"},
    {method: "POST", path: "/displays/frame", description: "вернуть обзор всех дисплеев"},
    {method: "GET", path: "/interpreters", description: "список module interpreters как рабочих станций: display + runtime + текущий UI context"},
    {method: "POST", path: "/interpreters/resolve", description: "{selector:{side|displayId|moduleId|label|order}} — найти один interpreter display"},
    {method: "POST", path: "/interpreters/focus", description: "{selector, view?, dockHostTerminal?} — сфокусировать interpreter display и вернуть его состояние"},
    {method: "POST", path: "/interpreters/action", description: "{selector, action, params?} — выполнить pause|resume|step|evaluate|source.open|source.openSelection|restart|stop|showExecutionPoint в выбранном interpreter"},
    {method: "GET", path: "/context", description: "server-owned текущий контекст модулей: display/source cursor/selection/terminal"},
    {method: "GET", path: "/hud/terminal", description: "состояние host terminal HUD"},
    {method: "POST", path: "/hud/terminal/dock", description: "свернуть host terminal HUD"},
    {method: "POST", path: "/hud/terminal/show", description: "развернуть host terminal HUD"},
    {method: "POST", path: "/hud/terminal/toggle", description: "переключить host terminal HUD"},
    {method: "GET", path: "/sqlite?path=<file.sqlite>&table=<name>", description: "просмотреть SQLite database tables/schema/rows"},
    {method: "POST", path: "/sqlite/open", description: "{path} — открыть SQLite database как отдельный display"},
    {method: "POST", path: "/sqlite/cell", description: "{path, table, rowid, column, value} — обновить SQLite cell по rowid"},
    {method: "GET", path: "/modules", description: "список модулей интерпретатора"},
    {method: "POST", path: "/modules/run", description: "{label?, command, cwd?, env?, pauseOnStart?, breakpoints?} — запустить новый модуль"},
    {method: "POST", path: "/modules/:id/stop", description: "{signal?} — остановить модуль"},
    {method: "POST", path: "/modules/:id/command", description: "{cmd, params?} — команда в конкретный модуль"},
    {method: "GET", path: "/modules/:id/source?scriptId=<id>", description: "исходник скрипта конкретного модуля"},
    {method: "POST", path: "/modules/:id/source", description: "{sourceUrl, text} — сохранить локальный source file через apply_patch и разослать source-patched"},
    {method: "POST", path: "/modules/:id/apply_patch", description: "{patch} — применить apply_patch к workspace и разослать source-patched"},
    {method: "GET", path: "/modules/:id/context", description: "последний текущий контекст конкретного модуля"},
    {method: "GET", path: "/modules/:id/breakpoints", description: "breakpoint registrations конкретного модуля"},
    {method: "POST", path: "/modules/:id/breakpoint", description: "{url|sourceUrl|urlRegex, line, column?, condition?} — breakpoint в конкретном модуле"},
    {method: "DELETE", path: "/modules/:id/breakpoint", description: "{id|breakpointId} — убрать breakpoint из конкретного модуля"},
    {method: "GET", path: "/events?since=<iso>&limit=<n>", description: "хвост event-лога"},
    {method: "GET", path: "/console?since=<iso>&limit=<n>", description: "хвост console-лога"},
    {method: "GET", path: "/workspace/files?moduleId=<id>&q=<text>&limit=<n>", description: "module-scoped workspace files"},
    {method: "WS", path: "/terminal", description: "host PTY terminal stream"},
    {method: "GET", path: "/terminal/sessions", description: "host PTY session diagnostics"},
  ]
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

function workspaceFilesModuleContext(url: URL, options: HttpServerOptions): WorkspaceFilesModuleContext | undefined {
  const moduleId = url.searchParams.get("moduleId") ?? url.searchParams.get("module")
  if (moduleId === null || moduleId.trim().length === 0) return undefined
  const module = options.modules.get(moduleId)
  if (module === undefined) return undefined
  const snapshot = module.snapshot()
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

function contextPayload(options: HttpServerOptions, contexts: ModuleContextStore): JsonObject {
  return {
    ok: true,
    modules: options.modules.snapshots().map((module) => ({
      moduleId: module.id,
      label: module.label,
      displayId: `module:${module.id}`,
      context: contextForModule(module, contexts),
    })),
  }
}

function getModuleContext(moduleId: string, options: HttpServerOptions, contexts: ModuleContextStore): Response {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const snapshot = module.snapshot()
  return jsonResponse({
    ok: true,
    moduleId: snapshot.id,
    label: snapshot.label,
    displayId: `module:${snapshot.id}`,
    context: contextForModule(snapshot, contexts),
  })
}

function contextForModule(module: ModuleSnapshot, contexts: ModuleContextStore): JsonObject {
  return contexts.get(module.id) ?? runtimeFallbackContext(module)
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
    moduleId: module.id,
    displayId: `module:${module.id}`,
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
    },
  }
}

function healthPayload(options: HttpServerOptions): JsonObject {
  const modules = options.modules.snapshots()
  return {
    ok: true,
    moduleCount: modules.length,
    modules,
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

function envStrings(value: unknown): Record<string, string> | undefined {
  const env = asObject(value)
  if (env === undefined) return undefined
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => typeof v === "string") as Array<[string, string]>,
  )
}

async function runModule(req: Request, options: HttpServerOptions): Promise<Response> {
  const parsed = await readModuleRunOptions(req)
  if ("response" in parsed) return parsed.response

  try {
    const module = options.modules.run(parsed.run)
    return jsonResponse({ok: true, module: module.snapshot(), modules: options.modules.snapshots()})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 409)
  }
}

async function runExistingModule(moduleId: string, req: Request, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const parsed = await readModuleRunOptions(req)
  if ("response" in parsed) return parsed.response
  try {
    if (parsed.run.label !== undefined) module.setLabel(parsed.run.label)
    const target = module.runTarget(parsed.run)
    return jsonResponse({ok: true, module: module.snapshot(), target})
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
  const id = asString(body["id"]) ?? asString(body["moduleId"])
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

async function stopModule(moduleId: string, req: Request, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  try {
    const stopped = await stopTargetFor(module, req)
    return jsonResponse({ok: true, module: module.snapshot(), target: stopped})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function dispatchModuleCommand(moduleId: string, req: Request, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const cmd = asString(parsed.body["cmd"])
  if (cmd === undefined) return jsonResponse({ok: false, error: "cmd required"}, 400)
  const params = asObject(parsed.body["params"]) ?? {}
  try {
    const result = await executeCommand({
      client: module.client,
      snapshots: module.snapshots,
    }, params, cmd)
    return jsonResponse({ok: true, cmd, result, module: module.snapshot()})
  } catch (error) {
    return jsonResponse({ok: false, cmd, error: serializeError(error)}, 400)
  }
}

function getModuleBreakpoints(moduleId: string, options: HttpServerOptions): Response {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  return jsonResponse(module.breakpoints.registrations)
}

async function setModuleBreakpoint(moduleId: string, req: Request, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  return await setBreakpoint(req, module)
}

async function removeModuleBreakpoint(moduleId: string, req: Request, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  return await removeBreakpoint(req, module)
}

async function setBreakpoint(req: Request, module: InterpreterModule): Promise<Response> {
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
    return jsonResponse({ok: true, breakpoint: registration, breakpoints: module.breakpoints.registrations})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 500)
  }
}

async function removeBreakpoint(req: Request, module: InterpreterModule): Promise<Response> {
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
    return jsonResponse({ok: false, error: "id or breakpointId required (получи его из /modules/:id/breakpoint или /modules/:id/breakpoints)"}, 400)
  }
  try {
    const removed = await module.breakpoints.remove(idOrBreakpointId)
    return jsonResponse({ok: true, removed, breakpoints: module.breakpoints.registrations})
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

async function stopTargetFor(module: Pick<InterpreterModule, "target">, req: Request): Promise<import("./target.ts").TargetSnapshot> {
  let signal: NodeJS.Signals = "SIGTERM"
  const text = await req.text()
  if (text.length > 0) {
    let body: JsonObject | undefined
    try {
      body = asObject(JSON.parse(text))
    } catch (error) {
      throw new Error(`invalid JSON: ${serializeError(error)}`)
    }
    const sig = asString(body?.["signal"])
    if (sig !== undefined) {
      if (!VALID_STOP_SIGNALS.has(sig)) throw new Error(`signal must be one of ${[...VALID_STOP_SIGNALS].join(", ")}`)
      signal = sig as NodeJS.Signals
    }
  }
  return await module.target.stop(signal)
}

async function getModuleScriptSource(moduleId: string, url: URL, options: HttpServerOptions): Promise<Response> {
  const module = options.modules.get(moduleId)
  if (module === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  return await getScriptSourceForModule(url, module, moduleId)
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

async function applyModulePatch(
  moduleId: string,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  if (options.modules.get(moduleId) === undefined) return jsonResponse({ok: false, error: `module not found: ${moduleId}`}, 404)
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return jsonResponse({ok: false, error: parsed.error}, 400)
  const patch = asString(parsed.body["patch"])
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
