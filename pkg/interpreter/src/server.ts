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
import {existsSync, statSync, openSync, readSync, closeSync, readFileSync, readdirSync, type Dirent} from "node:fs"
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
import type {InterpreterModule, InterpreterModuleManager, StartupModuleOptions} from "./module.ts"

export type HttpServerOptions = {
  host: string
  port: number
  modules: InterpreterModuleManager
  logger: EventLogger
  eventLogPath: string
  consoleLogPath: string
}

export type HttpServer = ReturnType<typeof Bun.serve>

type WsClientData = {
  id: number
}

const NDJSON_TAIL_DEFAULT_LIMIT = 200
const NDJSON_TAIL_MAX_LIMIT = 5_000
const VALID_STOP_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT"])

export function startHttpServer(options: HttpServerOptions): HttpServer {
  const wsClients = new Set<ServerWebSocket<WsClientData>>()
  let nextWsClientId = 1

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
      wsClients.add(ws)
      options.logger.event("ws.client.opened", {id: ws.data.id, total: wsClients.size})
      const hello: JsonObject = {
        type: "hello",
        modules: options.modules.snapshots(),
      }
      ws.send(JSON.stringify(hello))
    },
    async message(ws, raw): Promise<void> {
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
      wsClients.delete(ws)
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
        const data: WsClientData = {id}
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }

      const start = Date.now()
      try {
        const response = await handleRoute(method, path, url, req, options, broadcast)
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

async function handleRoute(
  method: string,
  path: string,
  url: URL,
  req: Request,
  options: HttpServerOptions,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  if (method === "GET" && path === "/") return jsonResponse({service: "@metafor/interpreter", routes: routeIndex()})
  if (method === "GET" && path === "/health") return jsonResponse(healthPayload(options))
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
  const moduleBreakpoints = /^\/modules\/([^/]+)\/breakpoints$/.exec(path)
  if (method === "GET" && moduleBreakpoints !== null) return getModuleBreakpoints(moduleBreakpoints[1]!, options)
  const moduleBreakpoint = /^\/modules\/([^/]+)\/breakpoint$/.exec(path)
  if (method === "POST" && moduleBreakpoint !== null) return await setModuleBreakpoint(moduleBreakpoint[1]!, req, options)
  if (method === "DELETE" && moduleBreakpoint !== null) return await removeModuleBreakpoint(moduleBreakpoint[1]!, req, options)
  if (method === "GET" && path === "/events") return jsonResponse(readNdjsonTail(options.eventLogPath, url))
  if (method === "GET" && path === "/console") return jsonResponse(readNdjsonTail(options.consoleLogPath, url))
  if (method === "GET" && path === "/workspace/files") return jsonResponse(workspaceFilesPayload(url))
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
    {method: "GET", path: "/modules", description: "список модулей интерпретатора"},
    {method: "POST", path: "/modules/run", description: "{label?, command, cwd?, env?, pauseOnStart?, breakpoints?} — запустить новый модуль"},
    {method: "POST", path: "/modules/:id/stop", description: "{signal?} — остановить модуль"},
    {method: "POST", path: "/modules/:id/command", description: "{cmd, params?} — команда в конкретный модуль"},
    {method: "GET", path: "/modules/:id/source?scriptId=<id>", description: "исходник скрипта конкретного модуля"},
    {method: "GET", path: "/modules/:id/breakpoints", description: "breakpoint registrations конкретного модуля"},
    {method: "POST", path: "/modules/:id/breakpoint", description: "{url|sourceUrl|urlRegex, line, column?, condition?} — breakpoint в конкретном модуле"},
    {method: "DELETE", path: "/modules/:id/breakpoint", description: "{id|breakpointId} — убрать breakpoint из конкретного модуля"},
    {method: "GET", path: "/events?since=<iso>&limit=<n>", description: "хвост event-лога"},
    {method: "GET", path: "/console?since=<iso>&limit=<n>", description: "хвост console-лога"},
    {method: "GET", path: "/workspace/files?q=<text>&limit=<n>", description: "workspace entrypoints for module selection"},
  ]
}

const WORKSPACE_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
])
const WORKSPACE_SKIP_DIRS = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tmp",
])

function workspaceFilesPayload(url: URL): JsonObject {
  const root = process.cwd()
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase()
  const limit = clampWorkspaceLimit(url.searchParams.get("limit") === null ? 120 : Number(url.searchParams.get("limit")))
  const files: Array<{path: string}> = []
  const stack = [root]

  while (stack.length > 0 && files.length < limit) {
    const dir = stack.pop()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, {withFileTypes: true})
    } catch {
      continue
    }

    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".storybook") continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!WORKSPACE_SKIP_DIRS.has(entry.name)) stack.push(abs)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.endsWith(".d.ts")) continue
      if (!WORKSPACE_FILE_EXTENSIONS.has(extensionOf(entry.name))) continue
      const rel = relative(root, abs).replaceAll("\\", "/")
      if (query.length > 0 && !rel.toLowerCase().includes(query)) continue
      files.push({path: rel})
      if (files.length >= limit) break
    }
  }

  files.sort((a, b) => fileRank(a.path) - fileRank(b.path) || a.path.localeCompare(b.path))
  return {root, files}
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".")
  return dot < 0 ? "" : path.slice(dot).toLowerCase()
}

function fileRank(path: string): number {
  if (path.endsWith(".spec.ts") || path.endsWith(".test.ts")) return 0
  if (path.endsWith(".spec.tsx") || path.endsWith(".test.tsx")) return 1
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return 2
  return 3
}

function clampWorkspaceLimit(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return 120
  return Math.min(value, 500)
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
    const scriptSource = readFileSync(path, "utf8")
    const includeTokens = url.searchParams.get("tokens") !== "0"
    const cacheKey = sourceCacheKey("", `file\0${path}`)
    lruSet(sourceCache, cacheKey, scriptSource, SOURCE_CACHE_MAX)
    return jsonResponse({
      scriptId: "",
      url: sourceUrl,
      scriptSource,
      tokens: includeTokens ? tokensFor(cacheKey, scriptSource, sourceUrl) : undefined,
      sourceKind: "file",
      cached: false,
    })
  } catch (error) {
    return jsonResponse({ok: false, scriptId: "", url: sourceUrl, error: serializeError(error)}, optional ? 200 : 404)
  }
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
