/**
 * HTTP+WebSocket сервер: REST API + полнофункциональный web-UI для совместной отладки.
 *
 * Архитектура:
 *   - REST поверх `executeCommand` (то же что stdin/file-loop) — для curl/fetch.
 *   - WebSocket `/ws` — пуш state/resumed/console/result в браузерный UI и приём
 *     `{type:"command",...}` сообщений из UI.
 *   - HTML/JS UI отдаётся через Bun fullstack-bundler: `import indexHtml from "../web/index.html"`,
 *     все импорты внутри HTML транспилятся Bun'ом на лету.
 *
 * Файлы (`.agent-events.log`, `.agent-console.log`) сохранены — остаются архивом
 * и читаются через `GET /events` и `GET /console`.
 */

import type {ServerWebSocket, WebSocketHandler} from "bun"
import {existsSync, statSync, openSync, readSync, closeSync} from "node:fs"
import {join} from "node:path"
import indexHtml from "../web/index.html"

const WEB_DIR = join(import.meta.dir, "..", "web")
const MANIFEST = {
  name: "MetaFor Debug",
  short_name: "debug",
  start_url: "/",
  display: "standalone",
}

import {executeCommand, type CommandContext} from "./commands.ts"
import type {BreakpointStore} from "./breakpoints.ts"
import type {ConsoleLogStore} from "./console.ts"
import {serializeError} from "./errors.ts"
import {asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {SnapshotStore} from "./snapshot.ts"
import type {InspectorClient} from "./inspector-client.ts"
import type {TargetSupervisor} from "./target.ts"
import type {JsonObject} from "./types.ts"
import {sourceMapMapper} from "./source-map.ts"

export type HttpServerOptions = {
  host: string
  port: number
  client: InspectorClient
  snapshots: SnapshotStore
  consoleLogs: ConsoleLogStore
  breakpoints: BreakpointStore
  target: TargetSupervisor
  logger: EventLogger
  eventLogPath: string
  consoleLogPath: string
  inspectorUrl: string
}

export type HttpServer = ReturnType<typeof Bun.serve>

type WsClientData = {
  id: number
}

const NDJSON_TAIL_DEFAULT_LIMIT = 200
const NDJSON_TAIL_MAX_LIMIT = 5_000
const VALID_STOP_SIGNALS = new Set(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGQUIT"])

export function startHttpServer(options: HttpServerOptions): HttpServer {
  const ctx: CommandContext = {
    client: options.client,
    snapshots: options.snapshots,
    logger: options.logger,
  }

  const wsClients = new Set<ServerWebSocket<WsClientData>>()
  let nextWsClientId = 1

  if (!isLoopbackHost(options.host)) {
    const warning = "/target/run can execute local commands; bind the debug server to loopback unless this is intentional"
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

  options.snapshots.onPause((dump) => broadcast({type: "state", dump}))
  options.snapshots.onResume(() => broadcast({type: "resumed"}))
  options.snapshots.onScriptParsed((scriptId, url) => {
    broadcast({type: "script", scriptId, url})
  })
  options.consoleLogs.onEntry((entry) => {
    broadcast({
      type: "console",
      entries: [{
        ts: entry.timestamp,
        level: entry.level ?? entry.type,
        text: entry.text ?? "",
      }],
    })
  })
  options.client.onSocketStateChange((state, error) => {
    if (state !== "connected") clearSourceCaches()
    broadcast({
      type: "connection",
      state,
      error: error ?? null,
      inspectorUrl: options.client.url,
    })
  })

  // verbose-стрим: всё что приходит от Bun-инспектора и всё что наш агент логирует
  // — отдельными WS-сообщениями. UI умеет фильтровать/выключать.
  options.client.onEvent((method, params) => {
    broadcast({
      type: "inspector-event",
      ts: new Date().toISOString(),
      method,
      params,
    })
  })
  options.logger.onEvent((entry) => {
    broadcast({
      type: "agent-event",
      ts: entry.timestamp,
      event: entry.event,
      detail: entry,
    })
  })
  options.target.onEvent((event) => {
    if (event.type === "started" || event.type === "exited") clearSourceCaches()
    broadcast({type: "target", event})
  })

  const websocket: WebSocketHandler<WsClientData> = {
    open(ws): void {
      wsClients.add(ws)
      options.logger.event("ws.client.opened", {id: ws.data.id, total: wsClients.size})
      const hello: JsonObject = {
        type: "hello",
        inspectorUrl: options.client.url,
        paused: options.snapshots.paused,
        dump: options.snapshots.dump ?? null,
        scriptCount: options.snapshots.scripts.length,
        scripts: scriptsView(options.snapshots.scripts),
        connection: {
          state: options.client.socketState,
          error: options.client.lastError ?? null,
        },
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
      if (cmd === undefined) {
        ws.send(JSON.stringify({type: "result", requestId, ok: false, error: "missing cmd"}))
        return
      }

      options.logger.event("ws.command", {clientId: ws.data.id, cmd, requestId})
      try {
        const result = await executeCommand(ctx, params, cmd)
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
    development: {hmr: true},
    routes: {
      "/": indexHtml,
    },
    async fetch(req, server): Promise<Response | undefined> {
      const url = new URL(req.url)
      const path = url.pathname.replace(/\/+$/, "") || "/"
      const method = req.method.toUpperCase()
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
        const response = await handleRoute(method, path, url, req, options, ctx, broadcast)
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
  ctx: CommandContext,
  broadcast: (payload: JsonObject) => void,
): Promise<Response> {
  if (method === "GET" && path === "/") return jsonResponse({service: "@metafor/bun-debug", routes: routeIndex()})
  if (method === "GET" && path === "/health") return jsonResponse(healthPayload(options))
  if (method === "GET" && path === "/state") return jsonResponse(options.snapshots.dump ?? null)
  if (method === "GET" && path === "/scripts") return jsonResponse(scriptsView(options.snapshots.scripts))
  if (method === "GET" && path === "/frames") {
    return jsonResponse({
      paused: options.snapshots.paused,
      frames: options.snapshots.callFrames,
      dump: options.snapshots.dump ?? null,
    })
  }
  if (method === "GET" && path === "/events") return jsonResponse(readNdjsonTail(options.eventLogPath, url))
  if (method === "GET" && path === "/console") return jsonResponse(readNdjsonTail(options.consoleLogPath, url))
  if (method === "GET" && path === "/breakpoints") return jsonResponse(options.breakpoints.registrations)
  if (method === "GET" && path === "/source") return await getScriptSource(url, options)

  if (method === "POST" && path === "/eval") return await dispatchPost(req, "eval", ctx)
  if (method === "POST" && path === "/props") return await dispatchPost(req, "props", ctx)
  if (method === "POST" && path === "/step") return await dispatchPost(req, "step", ctx)
  if (method === "POST" && path === "/pause") return await dispatchPost(req, "pause", ctx)
  if (method === "POST" && path === "/resume") return await dispatchPost(req, "resume", ctx)
  if (method === "POST" && path === "/frames") return await dispatchPost(req, "frames", ctx)
  if (method === "POST" && path === "/inspector") return await reconnectInspector(req, options)
  if (method === "GET" && path === "/target") return jsonResponse(options.target.snapshot())
  if (method === "POST" && path === "/target/run") return await runTarget(req, options)
  if (method === "POST" && path === "/target/stop") return await stopTarget(req, options)
  if (method === "POST" && path === "/breakpoint") return await setBreakpoint(req, options)
  if (method === "DELETE" && path === "/breakpoint") return await removeBreakpoint(req, options)
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
    {method: "GET", path: "/state", description: "последний snapshot Debugger.paused (или null)"},
    {method: "GET", path: "/scripts", description: "карта scriptId → url"},
    {method: "GET", path: "/frames", description: "callFrames + dump"},
    {method: "GET", path: "/events?since=<iso>&limit=<n>", description: "хвост event-лога"},
    {method: "GET", path: "/console?since=<iso>&limit=<n>", description: "хвост console-лога"},
    {method: "GET", path: "/source?scriptId=<id>", description: "исходник скрипта (Debugger.getScriptSource)"},
    {method: "POST", path: "/eval", description: "{frame?, expr} — Debugger.evaluateOnCallFrame"},
    {method: "POST", path: "/props", description: "{objectId, ownProperties?} — Runtime.getProperties"},
    {method: "POST", path: "/step", description: '{kind: "over"|"into"|"out"}'},
    {method: "POST", path: "/pause", description: "Debugger.pause"},
    {method: "POST", path: "/resume", description: "Debugger.resume"},
    {method: "POST", path: "/inspector", description: "{url} — переподключиться к другому Bun-инспектору"},
    {method: "GET", path: "/target", description: "состояние target-процесса (если запущен через /target/run)"},
    {method: "POST", path: "/target/run", description: "{command, cwd?, env?, pauseOnStart?, breakpoints?:[{url|urlRegex, line(1-based), column?, condition?}]}"},
    {method: "POST", path: "/target/stop", description: "{signal?} — SIGTERM (по умолчанию) → SIGKILL через 3с"},
    {method: "GET", path: "/breakpoints", description: "agent breakpoint registrations + installed Bun breakpointIds"},
    {method: "POST", path: "/breakpoint", description: "{url|urlRegex, line, column?, condition?} — pending spec + Debugger.setBreakpoint by scriptId on scriptParsed"},
    {method: "DELETE", path: "/breakpoint", description: "{id|breakpointId} — remove agent registration or concrete Bun breakpointId"},
  ]
}

function healthPayload(options: HttpServerOptions): JsonObject {
  return {
    ok: true,
    inspectorUrl: options.client.url,
    inspectorState: options.client.socketState,
    inspectorError: options.client.lastError ?? null,
    paused: options.snapshots.paused,
    scriptCount: options.snapshots.scripts.length,
    breakpointCount: options.breakpoints.registrations.length,
    hasDump: options.snapshots.dump !== undefined,
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === "127.0.0.1"
    || normalized === "localhost"
    || normalized === "::1"
    || normalized === "[::1]"
}

async function dispatchPost(req: Request, cmd: string, ctx: CommandContext): Promise<Response> {
  let body: JsonObject = {}
  const text = await req.text()
  if (text.length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return jsonResponse({ok: false, cmd, error: `invalid JSON body: ${serializeError(error)}`}, 400)
    }
    const obj = asObject(parsed)
    if (obj === undefined) return jsonResponse({ok: false, cmd, error: "body must be a JSON object"}, 400)
    body = obj
  }

  ctx.logger.event("http.command", {cmd, hasBody: Object.keys(body).length > 0})

  try {
    const result = await executeCommand(ctx, body, cmd)
    return jsonResponse({ok: true, cmd, result})
  } catch (error) {
    return jsonResponse({ok: false, cmd, error: serializeError(error)}, 400)
  }
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

// Слим-проекция scripts для внешнего API: data-URL sourceMapURL может весить
// сотни КБ на скрипт; UI и REST потребители знают только про hasSourceMap.
function scriptsView(scripts: ReadonlyArray<import("./snapshot.ts").ScriptInfo>): Array<{
  scriptId: string
  url: string
  hasSourceMap: boolean
}> {
  return scripts.map((s) => ({
    scriptId: s.scriptId,
    url: s.url,
    hasSourceMap: s.sourceMapURL !== undefined && s.sourceMapURL.length > 0,
  }))
}

function parseCommand(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.some((item) => typeof item !== "string")) return undefined
  return value
}

async function runTarget(req: Request, options: HttpServerOptions): Promise<Response> {
  let body: JsonObject = {}
  const text = await req.text()
  if (text.length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return jsonResponse({ok: false, error: `invalid JSON: ${serializeError(error)}`}, 400)
    }
    body = asObject(parsed) ?? {}
  }

  const command = parseCommand(body["command"])
  if (command === undefined || command.length === 0) {
    return jsonResponse({ok: false, error: "command must be non-empty array of strings (e.g. ['bun','test',...])"}, 400)
  }
  const cwd = asString(body["cwd"])
  const env = asObject(body["env"])
  const envStrings: Record<string, string> | undefined = env === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(env).filter(([, v]) => typeof v === "string") as Array<[string, string]>,
      )

  const pauseOnStart = body["pauseOnStart"] === true
  const parsedBreakpoints = parseBreakpoints(body["breakpoints"])
  if (parsedBreakpoints.error !== undefined) {
    return jsonResponse({ok: false, error: parsedBreakpoints.error}, 400)
  }

  try {
    const opts: {
      command: string[]
      cwd?: string
      env?: Record<string, string>
      pauseOnStart?: boolean
      inspectorUrl?: string
      breakpoints?: import("./target.ts").BreakpointSpec[]
    } = {command, inspectorUrl: options.inspectorUrl}
    if (cwd !== undefined) opts.cwd = cwd
    if (envStrings !== undefined) opts.env = envStrings
    if (pauseOnStart) opts.pauseOnStart = true
    if (parsedBreakpoints.breakpoints !== undefined) opts.breakpoints = parsedBreakpoints.breakpoints
    const snapshot = options.target.start(opts)
    return jsonResponse({ok: true, snapshot})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 409)
  }
}

async function setBreakpoint(req: Request, options: HttpServerOptions): Promise<Response> {
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
  if (url === undefined && urlRegex === undefined) {
    return jsonResponse({ok: false, error: "either url or urlRegex required"}, 400)
  }
  const column = asNumber(body["column"])
  if (column !== undefined && !isNonNegativeInteger(column)) {
    return jsonResponse({ok: false, error: "column must be a non-negative integer (0-based)"}, 400)
  }
  const condition = asString(body["condition"])
  const spec: import("./target.ts").BreakpointSpec = {line}
  if (url !== undefined) spec.url = url
  if (urlRegex !== undefined) spec.urlRegex = urlRegex
  if (column !== undefined) spec.column = column
  if (condition !== undefined) spec.condition = condition

  try {
    const registration = options.breakpoints.add(spec)
    await options.breakpoints.applyToScripts(options.snapshots.scripts)
    return jsonResponse({ok: true, breakpoint: registration, breakpoints: options.breakpoints.registrations})
  } catch (error) {
    return jsonResponse({ok: false, error: serializeError(error)}, 500)
  }
}

async function removeBreakpoint(req: Request, options: HttpServerOptions): Promise<Response> {
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
    return jsonResponse({ok: false, error: "id or breakpointId required (получи его из POST /breakpoint или GET /breakpoints)"}, 400)
  }
  try {
    const removed = await options.breakpoints.remove(idOrBreakpointId)
    return jsonResponse({ok: true, removed, breakpoints: options.breakpoints.registrations})
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
    if (url === undefined && urlRegex === undefined) {
      return {error: `breakpoints[${index}] must include url or urlRegex`}
    }
    const spec: import("./target.ts").BreakpointSpec = {line}
    if (url !== undefined) spec.url = url
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

async function stopTarget(req: Request, options: HttpServerOptions): Promise<Response> {
  let signal: NodeJS.Signals = "SIGTERM"
  const text = await req.text()
  if (text.length > 0) {
    try {
      const body = asObject(JSON.parse(text))
      const sig = asString(body?.["signal"])
      if (sig !== undefined) {
        if (!VALID_STOP_SIGNALS.has(sig)) {
          return jsonResponse({ok: false, error: `signal must be one of ${[...VALID_STOP_SIGNALS].join(", ")}`}, 400)
        }
        signal = sig as NodeJS.Signals
      }
    } catch (error) {
      return jsonResponse({ok: false, error: `invalid JSON: ${serializeError(error)}`}, 400)
    }
  }
  const snapshot = await options.target.stop(signal)
  return jsonResponse({ok: true, snapshot})
}

async function reconnectInspector(req: Request, options: HttpServerOptions): Promise<Response> {
  let body: JsonObject = {}
  const text = await req.text()
  if (text.length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return jsonResponse({ok: false, error: `invalid JSON: ${serializeError(error)}`}, 400)
    }
    body = asObject(parsed) ?? {}
  }
  const url = asString(body["url"])
  if (url === undefined || url.length === 0) {
    return jsonResponse({ok: false, error: "url required (e.g. ws://127.0.0.1:6499/dark)"}, 400)
  }
  if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    return jsonResponse({ok: false, error: "url must start with ws:// or wss://"}, 400)
  }
  const previous = options.client.url
  options.client.setUrl(url)
  // Скидываем кэш source — у нового target'а будут свои scriptId.
  clearSourceCaches()
  return jsonResponse({ok: true, previous, url})
}

async function getScriptSource(url: URL, options: HttpServerOptions): Promise<Response> {
  const scriptId = url.searchParams.get("scriptId") ?? ""
  if (scriptId.length === 0) return jsonResponse({ok: false, error: "scriptId required"}, 400)

  const sourceUrl = url.searchParams.get("sourceUrl") ?? undefined
  const sourceKind = url.searchParams.get("sourceKind")
  const script = options.snapshots.scriptInfo(scriptId)
  const fileUrl = script?.url
  const mappedSource = sourceKind === "runtime" ? null : sourceMapMapper(script?.sourceMapURL).sourceContent(sourceUrl ?? fileUrl)
  const includeTokens = url.searchParams.get("tokens") !== "0"
  const responseUrl = mappedSource?.source ?? fileUrl ?? ""
  const cacheKey = sourceCacheKey(scriptId, `${mappedSource === null ? "runtime" : "sourcemap"}\0${responseUrl}`)

  const cachedSource = lruGet(sourceCache, cacheKey)
  if (cachedSource !== undefined) {
    return jsonResponse({
      scriptId,
      url: responseUrl,
      scriptSource: cachedSource,
      tokens: includeTokens ? tokensFor(cacheKey, cachedSource) : undefined,
      sourceKind: mappedSource === null ? "runtime" : "sourcemap",
      cached: true,
    })
  }

  if (mappedSource !== null) {
    lruSet(sourceCache, cacheKey, mappedSource.content, SOURCE_CACHE_MAX)
    return jsonResponse({
      scriptId,
      url: mappedSource.source,
      scriptSource: mappedSource.content,
      tokens: includeTokens ? tokensFor(cacheKey, mappedSource.content) : undefined,
      sourceKind: "sourcemap",
      cached: false,
    })
  }

  try {
    const result = asObject(await options.client.request("Debugger.getScriptSource", {scriptId}))
    const scriptSource = asString(result?.["scriptSource"]) ?? ""
    if (scriptSource.length > 0) lruSet(sourceCache, cacheKey, scriptSource, SOURCE_CACHE_MAX)
    return jsonResponse({
      scriptId,
      url: fileUrl ?? "",
      scriptSource,
      tokens: includeTokens && scriptSource.length > 0 ? tokensFor(cacheKey, scriptSource) : undefined,
      sourceKind: "runtime",
      cached: false,
    })
  } catch (error) {
    return jsonResponse({ok: false, scriptId, error: serializeError(error)}, 500)
  }
}

function tokensFor(cacheKey: string, source: string): import("./syntax.ts").SourceTokens {
  const cached = lruGet(tokenCache, cacheKey)
  if (cached !== undefined) return cached
  const {tokenize} = require("./syntax.ts") as typeof import("./syntax.ts")
  const tokens = tokenize(source)
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
