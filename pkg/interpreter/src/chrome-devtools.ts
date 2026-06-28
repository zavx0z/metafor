import {SourceMapConsumer, type RawSourceMap} from "source-map-js"
import {serializeError} from "./errors.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {JsonObject} from "./types.ts"

const DEFAULT_CDP_URL = "http://127.0.0.1:9349"
const DEFAULT_TARGET_URL = "http://10.66.0.10:3004/"
const CDP_TIMEOUT_MS = 5_000
const PROBE_TIMEOUT_MS = 7_000
const PROBE_AUTO_RESUME_MS = 1_000
const MAX_PROBE_TIMEOUT_MS = 30_000

type ChromeTarget = {
  id: string
  type: string
  title?: string
  url: string
  webSocketDebuggerUrl?: string
  devtoolsFrontendUrl?: string
}

type ChromeDevtoolsBreakpoint = {
  breakpointId: string
  requested: JsonObject
  resolved: JsonObject
  locations: unknown[]
  createdAt: string
}

type ChromeDevtoolsPausedEvent = {
  reason?: string
  hitBreakpoints?: string[]
  callFrames?: unknown[]
  topFrame?: JsonObject
  updatedAt: string
}

type ChromeDevtoolsSession = {
  target: ChromeTarget
  socket: WebSocket
  nextId: number
  pending: Map<number, {
    method: string
    resolve: (value: JsonObject) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>
  breakpoints: Map<string, ChromeDevtoolsBreakpoint>
  paused: ChromeDevtoolsPausedEvent | null
  openedAt: string
}

type SourceMapResolution = {
  requested: {
    source: string
    line: number
    column: number
  }
  generated: {
    url: string
    line: number
    column: number
    cdpLineNumber: number
    cdpColumnNumber: number
  }
  sourceMap: {
    url: string
    source: string
  }
}

const sessions = new Map<string, ChromeDevtoolsSession>()

export async function handleChromeDevtoolsRoute(req: Request, method: string, path: string): Promise<Response | null> {
  if (method === "GET" && path === "/devtools/targets") return await devtoolsTargetsResponse()
  if (method === "GET" && path === "/devtools/state") return devtoolsStateResponse()
  if (method === "POST" && path === "/devtools/breakpoints") return await setDevtoolsBreakpointResponse(req)
  if (method === "POST" && path === "/devtools/probe") return await probeDevtoolsBreakpointResponse(req)
  if (method === "POST" && path === "/devtools/reload") return await reloadDevtoolsResponse(req)
  if (method === "POST" && path === "/devtools/resume") return await resumeDevtoolsResponse(req)
  if (method === "POST" && path === "/devtools/disable") return await disableDevtoolsResponse(req)
  if (method === "POST" && path === "/devtools/evaluate") return await evaluateDevtoolsResponse(req)
  return null
}

async function devtoolsTargetsResponse(): Promise<Response> {
  try {
    const targets = await fetchChromeTargets()
    return devtoolsJsonResponse({ok: true, cdp: cdpDiagnostic(), targets})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, cdp: cdpDiagnostic(), error: serializeError(error)}, 502)
  }
}

function devtoolsStateResponse(): Response {
  return devtoolsJsonResponse({
    ok: true,
    cdp: cdpDiagnostic(),
    sessions: [...sessions.values()].map(sessionState),
  })
}

async function setDevtoolsBreakpointResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const body = parsed.body
    const result = await setDevtoolsBreakpoint(body)
    return devtoolsJsonResponse({ok: true, ...result})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function probeDevtoolsBreakpointResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  const body = parsed.body
  try {
    const result = await setDevtoolsBreakpoint(body)
    const session = result.session
    session.paused = null

    const trigger = asObject(body["trigger"])
    let triggerResult: JsonObject | null = null
    if (trigger !== undefined) triggerResult = await runProbeTrigger(trigger)

    const timeoutMs = boundedMs(asNumber(body["timeoutMs"]), PROBE_TIMEOUT_MS, MAX_PROBE_TIMEOUT_MS)
    const paused = await waitForPause(session, timeoutMs)
    const autoResumeMs = boundedMs(asNumber(body["autoResumeMs"]), PROBE_AUTO_RESUME_MS, MAX_PROBE_TIMEOUT_MS)
    if (paused !== null && autoResumeMs > 0) {
      await delay(autoResumeMs)
      await resumeSession(session)
    }

    const clearBreakpoint = asBoolean(body["clear"]) ?? true
    if (clearBreakpoint) await removeBreakpoint(session, result.breakpoint.breakpointId)

    return devtoolsJsonResponse({
      ok: paused !== null,
      target: targetSummary(session.target),
      breakpoint: result.breakpoint,
      mapping: result.mapping,
      trigger: triggerResult,
      paused,
      resumed: paused !== null && autoResumeMs > 0,
      cleared: clearBreakpoint,
      timeoutMs,
    }, paused === null ? 504 : 200)
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function resumeDevtoolsResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const session = await ensureSession(parsed.body)
    const wasPaused = session.paused !== null
    if (wasPaused) await resumeSession(session)
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), wasPaused, paused: session.paused})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function reloadDevtoolsResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const session = await ensureSession(parsed.body)
    await sessionCommand(session, "Page.enable")
    const result = await sessionCommand(session, "Page.reload", {
      ignoreCache: asBoolean(parsed.body["ignoreCache"]) ?? asBoolean(parsed.body["hard"]) ?? true,
    })
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), result})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function disableDevtoolsResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const all = asBoolean(parsed.body["all"]) ?? false
    if (all) {
      const disabled = []
      for (const session of [...sessions.values()]) disabled.push(await disableSession(session))
      return devtoolsJsonResponse({ok: true, disabled})
    }
    const session = await ensureSession(parsed.body)
    return devtoolsJsonResponse({ok: true, disabled: [await disableSession(session)]})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function evaluateDevtoolsResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  const expression = asString(parsed.body["expression"])
  if (expression === undefined || expression.length === 0) {
    return devtoolsJsonResponse({ok: false, error: "expression must be a non-empty string"}, 400)
  }
  try {
    const session = await ensureSession(parsed.body)
    await sessionCommand(session, "Runtime.enable")
    const result = await sessionCommand(session, "Runtime.evaluate", {
      expression,
      awaitPromise: asBoolean(parsed.body["awaitPromise"]) ?? true,
      returnByValue: asBoolean(parsed.body["returnByValue"]) ?? true,
      userGesture: asBoolean(parsed.body["userGesture"]) ?? true,
    })
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), result})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function setDevtoolsBreakpoint(body: JsonObject): Promise<{
  session: ChromeDevtoolsSession
  target: JsonObject
  breakpoint: ChromeDevtoolsBreakpoint
  mapping: SourceMapResolution | null
}> {
  const session = await ensureSession(body)
  await sessionCommand(session, "Debugger.enable")
  await sessionCommand(session, "Runtime.enable")

  const resolved = await resolveBreakpointLocation(session.target, body)
  const response = await sessionCommand(session, "Debugger.setBreakpointByUrl", {
    url: resolved.url,
    lineNumber: resolved.cdpLineNumber,
    columnNumber: resolved.cdpColumnNumber,
    condition: asString(body["condition"]) ?? "",
  })
  const breakpointId = asString(response["breakpointId"])
  if (breakpointId === undefined) throw new Error("Chrome did not return breakpointId")
  const locations = Array.isArray(response["locations"]) ? response["locations"] : []
  const breakpoint: ChromeDevtoolsBreakpoint = {
    breakpointId,
    requested: breakpointRequestSummary(body),
    resolved: {
      url: resolved.url,
      line: resolved.line,
      column: resolved.column,
      cdpLineNumber: resolved.cdpLineNumber,
      cdpColumnNumber: resolved.cdpColumnNumber,
    },
    locations,
    createdAt: new Date().toISOString(),
  }
  session.breakpoints.set(breakpointId, breakpoint)
  return {
    session,
    target: targetSummary(session.target),
    breakpoint,
    mapping: resolved.mapping,
  }
}

async function resolveBreakpointLocation(target: ChromeTarget, body: JsonObject): Promise<{
  url: string
  line: number
  column: number
  cdpLineNumber: number
  cdpColumnNumber: number
  mapping: SourceMapResolution | null
}> {
  const source = asString(body["source"]) ?? asString(body["sourcePath"])
  if (source !== undefined && source.length > 0) {
    const line = positiveInteger(body["line"], "line")
    const column = nonNegativeInteger(body["column"], "column", 0)
    const mapping = await resolveSourceMapPosition(target, source, line, column)
    return {
      url: mapping.generated.url,
      line: mapping.generated.line,
      column: mapping.generated.column,
      cdpLineNumber: mapping.generated.cdpLineNumber,
      cdpColumnNumber: mapping.generated.cdpColumnNumber,
      mapping,
    }
  }

  const url = asString(body["url"]) ?? asString(body["generatedUrl"])
  if (url === undefined || url.length === 0) throw new Error("source or url must be provided")
  const line = positiveInteger(body["line"] ?? body["generatedLine"], "line")
  const column = nonNegativeInteger(body["column"] ?? body["generatedColumn"], "column", 0)
  return {
    url,
    line,
    column,
    cdpLineNumber: line - 1,
    cdpColumnNumber: column,
    mapping: null,
  }
}

async function resolveSourceMapPosition(target: ChromeTarget, source: string, line: number, column: number): Promise<SourceMapResolution> {
  const scriptUrls = await targetScriptUrls(target.url)
  const errors: string[] = []
  for (const scriptUrl of scriptUrls) {
    try {
      const scriptText = await fetchText(scriptUrl)
      const mapUrl = sourceMapUrl(scriptText, scriptUrl)
      if (mapUrl === null) {
        errors.push(`${scriptUrl}: sourceMappingURL not found`)
        continue
      }
      const map = await fetchJson(mapUrl)
      const consumer = new SourceMapConsumer(map as RawSourceMap)
      const mappedSource = consumer.sources.find((candidate) => sourceMatches(candidate, source))
      if (mappedSource === undefined) {
        errors.push(`${mapUrl}: source ${source} not found`)
        continue
      }
      const position = consumer.generatedPositionFor({
        source: mappedSource,
        line,
        column,
        bias: SourceMapConsumer.LEAST_UPPER_BOUND,
      })
      if (position.line === null || position.column === null) {
        errors.push(`${mapUrl}: source ${source}:${line}:${column} has no generated position`)
        continue
      }
      return {
        requested: {source, line, column},
        generated: {
          url: scriptUrl,
          line: position.line,
          column: position.column,
          cdpLineNumber: position.line - 1,
          cdpColumnNumber: position.column,
        },
        sourceMap: {
          url: mapUrl,
          source: mappedSource,
        },
      }
    } catch (error) {
      errors.push(`${scriptUrl}: ${serializeError(error)}`)
    }
  }
  throw new Error(`Could not resolve source map position ${source}:${line}:${column}. ${errors.join("; ")}`)
}

async function targetScriptUrls(targetUrl: string): Promise<string[]> {
  const html = await fetchText(targetUrl)
  const scripts: string[] = []
  const scriptPattern = /<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/gi
  for (const match of html.matchAll(scriptPattern)) {
    const src = match[2]
    if (src !== undefined && src.length > 0) scripts.push(new URL(src, targetUrl).toString())
  }
  if (scripts.length === 0) throw new Error(`No script tags found in ${targetUrl}`)
  return scripts
}

function sourceMapUrl(scriptText: string, scriptUrl: string): string | null {
  const match = /\/\/# sourceMappingURL=(\S+)\s*$/m.exec(scriptText)
  const mapRef = match?.[1]
  if (mapRef === undefined || mapRef.startsWith("data:")) return null
  return new URL(mapRef, scriptUrl).toString()
}

async function ensureSession(body: JsonObject): Promise<ChromeDevtoolsSession> {
  const target = await resolveTarget(body)
  const existing = sessions.get(target.id)
  if (existing !== undefined && existing.socket.readyState === WebSocket.OPEN) return existing

  if (target.webSocketDebuggerUrl === undefined || target.webSocketDebuggerUrl.length === 0) {
    throw new Error(`Target ${target.id} has no webSocketDebuggerUrl`)
  }
  const socket = await openWebSocket(target.webSocketDebuggerUrl)
  const session: ChromeDevtoolsSession = {
    target,
    socket,
    nextId: 1,
    pending: new Map(),
    breakpoints: new Map(),
    paused: null,
    openedAt: new Date().toISOString(),
  }
  socket.addEventListener("message", (event) => handleSessionMessage(session, event))
  socket.addEventListener("close", () => {
    closePending(session, new Error("Chrome DevTools WebSocket closed"))
    sessions.delete(target.id)
  })
  socket.addEventListener("error", () => closePending(session, new Error("Chrome DevTools WebSocket error")))
  sessions.set(target.id, session)
  return session
}

async function resolveTarget(body: JsonObject): Promise<ChromeTarget> {
  const targets = await fetchChromeTargets()
  const targetId = asString(body["targetId"])
  const targetUrl = asString(body["targetUrl"]) ?? defaultTargetUrl()
  const targetTitle = asString(body["targetTitle"])
  const urlContains = asString(body["urlContains"])
  const candidates = targets.filter((target) => target.type === "page" && !target.url.startsWith("devtools://"))

  const target = (targetId === undefined ? undefined : targets.find((item) => item.id === targetId))
    ?? candidates.find((item) => item.url === targetUrl)
    ?? (targetTitle === undefined ? undefined : candidates.find((item) => item.title === targetTitle))
    ?? (urlContains === undefined ? undefined : candidates.find((item) => item.url.includes(urlContains)))
    ?? candidates[0]

  if (target === undefined) throw new Error("Chrome page target not found")
  return target
}

async function fetchChromeTargets(): Promise<ChromeTarget[]> {
  const payload = await fetchJson(new URL("/json/list", cdpBaseUrl()).toString())
  if (!Array.isArray(payload)) throw new Error("Chrome /json/list did not return an array")
  return payload
    .map((item) => asChromeTarget(item))
    .filter((item): item is ChromeTarget => item !== null)
}

function asChromeTarget(value: unknown): ChromeTarget | null {
  const object = asObject(value)
  if (object === undefined) return null
  const id = asString(object["id"])
  const type = asString(object["type"])
  const url = asString(object["url"])
  if (id === undefined || type === undefined || url === undefined) return null
  const target: ChromeTarget = {
    id,
    type,
    url,
  }
  const title = asString(object["title"])
  const webSocketDebuggerUrl = asString(object["webSocketDebuggerUrl"])
  const devtoolsFrontendUrl = asString(object["devtoolsFrontendUrl"])
  if (title !== undefined) target.title = title
  if (webSocketDebuggerUrl !== undefined) target.webSocketDebuggerUrl = webSocketDebuggerUrl
  if (devtoolsFrontendUrl !== undefined) target.devtoolsFrontendUrl = devtoolsFrontendUrl
  return target
}

function handleSessionMessage(session: ChromeDevtoolsSession, event: MessageEvent): void {
  const message = safeJsonParse(String(event.data))
  if (message === null) return
  const id = asNumber(message["id"])
  if (id !== undefined) {
    const pending = session.pending.get(id)
    if (pending === undefined) return
    session.pending.delete(id)
    clearTimeout(pending.timer)
    const error = asObject(message["error"])
    if (error !== undefined) pending.reject(new Error(`${pending.method}: ${JSON.stringify(error)}`))
    else pending.resolve(asObject(message["result"]) ?? {})
    return
  }

  const method = asString(message["method"])
  if (method === "Debugger.paused") {
    const params = asObject(message["params"]) ?? {}
    const callFrames = Array.isArray(params["callFrames"]) ? params["callFrames"] : []
    const topFrame = asObject(callFrames[0])
    const paused: ChromeDevtoolsPausedEvent = {
      hitBreakpoints: stringArray(params["hitBreakpoints"]),
      callFrames,
      updatedAt: new Date().toISOString(),
    }
    const reason = asString(params["reason"])
    const summarizedTopFrame = summarizeCallFrame(topFrame)
    if (reason !== undefined) paused.reason = reason
    if (summarizedTopFrame !== undefined) paused.topFrame = summarizedTopFrame
    session.paused = paused
  } else if (method === "Debugger.resumed") {
    session.paused = null
  }
}

function sessionCommand(session: ChromeDevtoolsSession, method: string, params: JsonObject = {}): Promise<JsonObject> {
  if (session.socket.readyState !== WebSocket.OPEN) throw new Error("Chrome DevTools WebSocket is not open")
  const id = session.nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending.delete(id)
      reject(new Error(`Chrome DevTools command timed out: ${method}`))
    }, CDP_TIMEOUT_MS)
    session.pending.set(id, {method, resolve, reject, timer})
    session.socket.send(JSON.stringify({id, method, params}))
  })
}

async function openWebSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url)
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome DevTools WebSocket open timed out")), CDP_TIMEOUT_MS)
    socket.addEventListener("open", () => {
      clearTimeout(timer)
      resolve(socket)
    }, {once: true})
    socket.addEventListener("error", () => {
      clearTimeout(timer)
      reject(new Error("Chrome DevTools WebSocket open failed"))
    }, {once: true})
  })
}

async function resumeSession(session: ChromeDevtoolsSession): Promise<void> {
  await sessionCommand(session, "Debugger.resume")
  session.paused = null
}

async function removeBreakpoint(session: ChromeDevtoolsSession, breakpointId: string): Promise<void> {
  if (!session.breakpoints.has(breakpointId)) return
  await sessionCommand(session, "Debugger.removeBreakpoint", {breakpointId}).catch(() => undefined)
  session.breakpoints.delete(breakpointId)
}

async function disableSession(session: ChromeDevtoolsSession): Promise<JsonObject> {
  for (const breakpointId of [...session.breakpoints.keys()]) await removeBreakpoint(session, breakpointId)
  await sessionCommand(session, "Debugger.disable").catch(() => undefined)
  closePending(session, new Error("Chrome DevTools session disabled"))
  session.socket.close()
  sessions.delete(session.target.id)
  return targetSummary(session.target)
}

function closePending(session: ChromeDevtoolsSession, error: Error): void {
  for (const pending of session.pending.values()) {
    clearTimeout(pending.timer)
    pending.reject(error)
  }
  session.pending.clear()
}

async function waitForPause(session: ChromeDevtoolsSession, timeoutMs: number): Promise<ChromeDevtoolsPausedEvent | null> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (session.paused !== null) return session.paused
    await delay(50)
  }
  return null
}

async function runProbeTrigger(trigger: JsonObject): Promise<JsonObject> {
  const url = asString(trigger["url"])
  if (url === undefined || url.length === 0) throw new Error("trigger.url must be a non-empty string")
  const method = asString(trigger["method"]) ?? "POST"
  const headers = asObject(trigger["headers"])
  const init: RequestInit = {method}
  if (headers !== undefined) init.headers = stringRecord(headers)
  const body = trigger["body"]
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body)
    init.headers = {"content-type": "application/json", ...init.headers}
  }
  const response = await fetch(url, init)
  return {
    url,
    method,
    status: response.status,
    ok: response.ok,
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {signal: AbortSignal.timeout(CDP_TIMEOUT_MS)})
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return await response.json()
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {signal: AbortSignal.timeout(CDP_TIMEOUT_MS)})
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return await response.text()
}

async function readJsonObject(req: Request): Promise<{body: JsonObject; error?: string}> {
  try {
    const body = await req.json()
    const object = asObject(body)
    if (object === undefined) return {body: {}, error: "body must be a JSON object"}
    return {body: object}
  } catch (error) {
    return {body: {}, error: error instanceof Error ? error.message : String(error)}
  }
}

function cdpBaseUrl(): URL {
  const value = process.env.INTERPRETER_DEVTOOLS_CDP_URL
    ?? process.env.METAFOR_REMOTE_DESKTOP_CHROME_CDP_URL
    ?? DEFAULT_CDP_URL
  return new URL(value)
}

function defaultTargetUrl(): string {
  return process.env.INTERPRETER_DEVTOOLS_TARGET_URL
    ?? process.env.APP_WEB_URL
    ?? DEFAULT_TARGET_URL
}

function cdpDiagnostic(): JsonObject {
  return {
    url: cdpBaseUrl().toString(),
    defaultTargetUrl: defaultTargetUrl(),
    configuredFrom: {
      cdp: process.env.INTERPRETER_DEVTOOLS_CDP_URL !== undefined
        ? "INTERPRETER_DEVTOOLS_CDP_URL"
        : process.env.METAFOR_REMOTE_DESKTOP_CHROME_CDP_URL !== undefined
          ? "METAFOR_REMOTE_DESKTOP_CHROME_CDP_URL"
          : "default",
      target: process.env.INTERPRETER_DEVTOOLS_TARGET_URL !== undefined
        ? "INTERPRETER_DEVTOOLS_TARGET_URL"
        : process.env.APP_WEB_URL !== undefined
          ? "APP_WEB_URL"
          : "default",
    },
  }
}

function sessionState(session: ChromeDevtoolsSession): JsonObject {
  return {
    target: targetSummary(session.target),
    socketState: session.socket.readyState,
    openedAt: session.openedAt,
    breakpointCount: session.breakpoints.size,
    breakpoints: [...session.breakpoints.values()],
    paused: session.paused,
  }
}

function targetSummary(target: ChromeTarget): JsonObject {
  return {
    id: target.id,
    type: target.type,
    title: target.title,
    url: target.url,
  }
}

function breakpointRequestSummary(body: JsonObject): JsonObject {
  return {
    targetId: asString(body["targetId"]),
    targetUrl: asString(body["targetUrl"]),
    source: asString(body["source"]) ?? asString(body["sourcePath"]),
    url: asString(body["url"]) ?? asString(body["generatedUrl"]),
    line: asNumber(body["line"]) ?? asNumber(body["generatedLine"]),
    column: asNumber(body["column"]) ?? asNumber(body["generatedColumn"]),
  }
}

function summarizeCallFrame(frame: JsonObject | undefined): JsonObject | undefined {
  if (frame === undefined) return undefined
  const location = asObject(frame["location"])
  return {
    functionName: asString(frame["functionName"]),
    url: asString(frame["url"]),
    location,
  }
}

function sourceMatches(candidate: string, requested: string): boolean {
  const normalizedCandidate = candidate.replaceAll("\\", "/")
  const normalizedRequested = requested.replaceAll("\\", "/")
  return normalizedCandidate === normalizedRequested || normalizedCandidate.endsWith(`/${normalizedRequested}`)
}

function positiveInteger(value: unknown, name: string): number {
  const number = asNumber(value)
  if (number === undefined || !Number.isInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`)
  return number
}

function nonNegativeInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  const number = asNumber(value)
  if (number === undefined || !Number.isInteger(number) || number < 0) throw new Error(`${name} must be a non-negative integer`)
  return number
}

function boundedMs(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(max, Math.round(value)))
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

function stringRecord(value: JsonObject): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") result[key] = item
  }
  return result
}

function safeJsonParse(value: string): JsonObject | null {
  try {
    return asObject(JSON.parse(value)) ?? null
  } catch {
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function devtoolsJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {"content-type": "application/json; charset=utf-8"},
  })
}
