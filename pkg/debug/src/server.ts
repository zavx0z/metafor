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
import indexHtml from "../web/index.html"
import {executeCommand, type CommandContext} from "./commands.ts"
import type {ConsoleLogStore} from "./console.ts"
import {serializeError} from "./errors.ts"
import {asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {SnapshotStore} from "./snapshot.ts"
import type {InspectorClient} from "./inspector-client.ts"
import type {JsonObject} from "./types.ts"

export type HttpServerOptions = {
  host: string
  port: number
  client: InspectorClient
  snapshots: SnapshotStore
  consoleLogs: ConsoleLogStore
  logger: EventLogger
  eventLogPath: string
  consoleLogPath: string
  inspectorUrl: string
}

export type HttpServer = ReturnType<typeof Bun.serve>

type WsClientData = {
  id: number
  pendingResponses: Set<number>
}

type ClientCommand = {
  type: "command"
  cmd: string
  params?: JsonObject
  requestId?: number
}

const NDJSON_TAIL_DEFAULT_LIMIT = 200
const NDJSON_TAIL_MAX_LIMIT = 5_000

export function startHttpServer(options: HttpServerOptions): HttpServer {
  const ctx: CommandContext = {
    client: options.client,
    snapshots: options.snapshots,
    logger: options.logger,
  }

  const wsClients = new Set<ServerWebSocket<WsClientData>>()
  let nextWsClientId = 1

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
        scripts: options.snapshots.scripts,
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
    // dev-режим: Bun сам выдаёт `Cache-Control: no-store` для bundle'а и поддерживает
    // hot-reload — без него браузер залипает на старом chunk'е и фикcы из git
    // не доезжают до UI.
    development: true,
    routes: {
      "/": indexHtml,
    },
    async fetch(req, server): Promise<Response | undefined> {
      const url = new URL(req.url)
      const path = url.pathname.replace(/\/+$/, "") || "/"
      const method = req.method.toUpperCase()

      if (path === "/ws") {
        const id = nextWsClientId++
        const data: WsClientData = {id, pendingResponses: new Set()}
        const upgraded = server.upgrade(req, {data})
        if (upgraded) return undefined
        return jsonResponse({ok: false, error: "expected websocket upgrade"}, 426)
      }

      const start = Date.now()
      try {
        const response = await handleRoute(method, path, url, req, options, ctx)
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
): Promise<Response> {
  if (method === "GET" && path === "/") return jsonResponse({service: "@metafor/bun-debug", routes: routeIndex()})
  if (method === "GET" && path === "/health") return jsonResponse(healthPayload(options))
  if (method === "GET" && path === "/state") return jsonResponse(options.snapshots.dump ?? null)
  if (method === "GET" && path === "/scripts") return jsonResponse(options.snapshots.scripts)
  if (method === "GET" && path === "/frames") {
    return jsonResponse({
      paused: options.snapshots.paused,
      frames: options.snapshots.callFrames,
      dump: options.snapshots.dump ?? null,
    })
  }
  if (method === "GET" && path === "/events") return jsonResponse(readNdjsonTail(options.eventLogPath, url))
  if (method === "GET" && path === "/console") return jsonResponse(readNdjsonTail(options.consoleLogPath, url))
  if (method === "GET" && path === "/source") return await getScriptSource(url, options)

  if (method === "POST" && path === "/eval") return await dispatchPost(req, "eval", ctx)
  if (method === "POST" && path === "/props") return await dispatchPost(req, "props", ctx)
  if (method === "POST" && path === "/step") return await dispatchPost(req, "step", ctx)
  if (method === "POST" && path === "/pause") return await dispatchPost(req, "pause", ctx)
  if (method === "POST" && path === "/resume") return await dispatchPost(req, "resume", ctx)
  if (method === "POST" && path === "/frames") return await dispatchPost(req, "frames", ctx)
  if (method === "POST" && path === "/inspector") return await reconnectInspector(req, options)

  return jsonResponse({ok: false, error: `not found: ${method} ${path}`}, 404)
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
    hasDump: options.snapshots.dump !== undefined,
  }
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

const sourceCache = new Map<string, string>()

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
  sourceCache.clear()
  return jsonResponse({ok: true, previous, url})
}

async function getScriptSource(url: URL, options: HttpServerOptions): Promise<Response> {
  const scriptId = url.searchParams.get("scriptId") ?? ""
  if (scriptId.length === 0) return jsonResponse({ok: false, error: "scriptId required"}, 400)

  const fileUrl = options.snapshots.scriptUrl(scriptId)

  const cached = sourceCache.get(scriptId)
  if (cached !== undefined) {
    return jsonResponse({scriptId, url: fileUrl ?? "", scriptSource: cached, cached: true})
  }

  try {
    const result = asObject(await options.client.request("Debugger.getScriptSource", {scriptId}))
    const scriptSource = asString(result?.["scriptSource"]) ?? ""
    if (scriptSource.length > 0) sourceCache.set(scriptId, scriptSource)
    return jsonResponse({scriptId, url: fileUrl ?? "", scriptSource, cached: false})
  } catch (error) {
    return jsonResponse({ok: false, scriptId, error: serializeError(error)}, 500)
  }
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
