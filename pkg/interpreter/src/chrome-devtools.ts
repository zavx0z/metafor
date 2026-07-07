import {SourceMapConsumer, type RawSourceMap} from "source-map-js"
import {existsSync} from "node:fs"
import {serializeError} from "./errors.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {JsonObject} from "./types.ts"

const DEFAULT_CDP_URL = "http://127.0.0.1:9349"
const DEFAULT_TARGET_URL = "https://meta.proizvodstvo1.ru/"
const CDP_TIMEOUT_MS = 5_000
const PROBE_TIMEOUT_MS = 7_000
const PROBE_AUTO_RESUME_MS = 1_000
const MAX_PROBE_TIMEOUT_MS = 30_000
const MAX_CONSOLE_EVENTS = 500
const DEFAULT_CONSOLE_LIMIT = 100
const DEVTOOLS_RELOAD_READY_TIMEOUT_MS = 8_000
const DEVTOOLS_VIEWPORT_READY_TIMEOUT_MS = 8_000
const DEVTOOLS_VIEWPORT_SETTLE_MS = 100
const DEVTOOLS_VIEWPORT_AUTOSYNC_DELAY_MS = 250
const DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED = true
const DEVTOOLS_VIEWPORT_REPAIR_ENABLED = true
const DEVTOOLS_VIEWPORT_DRIFT_TOLERANCE_PX = 1

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

type ChromeDevtoolsConsoleEvent = {
  id: number
  kind: "console" | "exception" | "log" | "network"
  level?: string
  source?: string
  type?: string
  text: string
  url?: string
  lineNumber?: number
  columnNumber?: number
  requestId?: string
  errorText?: string
  blockedReason?: string
  args?: JsonObject[]
  stackTrace?: unknown
  timestamp?: number
  capturedAt: string
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
  consoleEnabled: boolean
  consoleEvents: ChromeDevtoolsConsoleEvent[]
  openedAt: string
  viewportAutoSync: ChromeDevtoolsViewportAutoSync
}

type ChromeDevtoolsViewportAutoSync = {
  enabled: boolean
  running: boolean
  timer: ReturnType<typeof setTimeout> | null
  scheduledAt?: string
  completedAt?: string
  lastResult?: JsonObject
  lastError?: string
}

type DevtoolsViewportRequest = {
  width: number
  height: number
  visibleWidth: number
  visibleHeight: number
  deviceScaleFactor: number
  mobile: boolean
  scale: number
  source: string
  visibleSource: string
  scaleSource: string
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
let nextConsoleEventId = 1

export async function handleChromeDevtoolsRoute(req: Request, method: string, path: string): Promise<Response | null> {
  if (method === "GET" && path === "/devtools/targets") return await devtoolsTargetsResponse()
  if (method === "GET" && path === "/devtools/state") return devtoolsStateResponse()
  if (method === "GET" && path === "/devtools/console") return await devtoolsConsoleResponse(req)
  if (method === "POST" && path === "/devtools/console/clear") return await clearDevtoolsConsoleResponse(req)
  if (method === "POST" && path === "/devtools/breakpoints") return await setDevtoolsBreakpointResponse(req)
  if (method === "POST" && path === "/devtools/probe") return await probeDevtoolsBreakpointResponse(req)
  if (method === "POST" && path === "/devtools/reload") return await reloadDevtoolsResponse(req)
  if (method === "POST" && path === "/devtools/viewport/sync") return await syncDevtoolsViewportResponse(req)
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

async function devtoolsConsoleResponse(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const body = requestBodyFromSearchParams(url.searchParams)
    const session = await ensureSession(body)
    await ensureConsoleCapture(session)
    const limit = boundedMs(asNumber(body["limit"]), DEFAULT_CONSOLE_LIMIT, 1_000)
    const level = asString(body["level"])
    const kind = asString(body["kind"])
    const sinceId = asNumber(body["sinceId"])
    const events = session.consoleEvents
      .filter((event) => level === undefined || event.level === level)
      .filter((event) => kind === undefined || event.kind === kind)
      .filter((event) => sinceId === undefined || event.id > sinceId)
      .slice(-limit)
    return devtoolsJsonResponse({
      ok: true,
      target: targetSummary(session.target),
      capturing: session.consoleEnabled,
      totalBuffered: session.consoleEvents.length,
      events,
      note: "CDP captures console/log/network events after this session enables capture; use devtools.reload or reproduce the action for stale console history.",
    })
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function clearDevtoolsConsoleResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const session = await ensureSession(parsed.body)
    await ensureConsoleCapture(session)
    const removed = session.consoleEvents.length
    session.consoleEvents = []
    await sessionCommand(session, "Runtime.discardConsoleEntries").catch(() => undefined)
    await sessionCommand(session, "Log.clear").catch(() => undefined)
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), removed})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
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
    const ready = asBoolean(parsed.body["wait"]) === false
      ? null
      : await waitForDocumentReady(session, DEVTOOLS_RELOAD_READY_TIMEOUT_MS)
    const repairViewport = asBoolean(parsed.body["syncViewport"]) !== false
    const viewport = repairViewport
      ? await repairDevtoolsViewportDrift(session, parsed.body, "reload")
      : null
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), result, ready, viewport})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

async function syncDevtoolsViewportResponse(req: Request): Promise<Response> {
  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return devtoolsJsonResponse({ok: false, error: parsed.error}, 400)
  try {
    const session = await ensureSession(parsed.body)
    const viewport = await repairDevtoolsViewportDrift(session, parsed.body, "manual")
    return devtoolsJsonResponse({ok: true, target: targetSummary(session.target), viewport})
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
  try {
    const result = await evaluateChromeDevtoolsExpression(parsed.body)
    return devtoolsJsonResponse({ok: true, ...result})
  } catch (error) {
    return devtoolsJsonResponse({ok: false, error: serializeError(error)}, 400)
  }
}

export async function evaluateChromeDevtoolsExpression(body: JsonObject): Promise<{target: JsonObject; result: JsonObject}> {
  const expression = asString(body["expression"])
  if (expression === undefined || expression.length === 0) throw new Error("expression must be a non-empty string")
  const session = await ensureSession(body)
  await sessionCommand(session, "Runtime.enable")
  const result = await sessionCommand(session, "Runtime.evaluate", {
    expression,
    awaitPromise: asBoolean(body["awaitPromise"]) ?? true,
    returnByValue: asBoolean(body["returnByValue"]) ?? true,
    userGesture: asBoolean(body["userGesture"]) ?? true,
  })
  return {target: targetSummary(session.target), result}
}

export async function activateChromeDevtoolsTarget(body: JsonObject): Promise<JsonObject> {
  const target = await resolveTarget(body)
  await fetchText(new URL(`/json/activate/${encodeURIComponent(target.id)}`, cdpBaseUrl()).toString())
  return targetSummary(target)
}

export async function setChromeDevtoolsFileInputFiles(body: JsonObject): Promise<{target: JsonObject; result: JsonObject}> {
  const rawFiles = body["files"] ?? body["filePaths"] ?? body["paths"] ?? body["attachmentPaths"]
  const files = Array.isArray(rawFiles) ? rawFiles.filter((item): item is string => typeof item === "string" && item.length > 0) : []
  if (files.length === 0) throw new Error("files must be a non-empty string array")
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`file does not exist: ${file}`)
  }
  const selector = asString(body["selector"]) ?? "input[type=file]"
  const session = await ensureSession(body)
  await sessionCommand(session, "DOM.enable")
  let nodeId = await queryChromeNodeId(session, selector)
  if (nodeId === null) {
    await sessionCommand(session, "Runtime.evaluate", {
      expression: String.raw`(() => {
        const visible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        };
        const clean = (text) => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
        const button = Array.from(document.querySelectorAll("button, [role=button], label")).find((el) => {
          if (!visible(el)) return false;
          const label = clean([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title"), el.className].join(" "));
          return /attach|upload|file|image|picture|скреп|файл|изображ|картин/.test(label);
        });
        if (!button) return {clicked:false};
        button.click();
        return {clicked:true};
      })()`,
      awaitPromise: false,
      returnByValue: true,
      userGesture: true,
    }).catch(() => undefined)
    await delay(300)
    nodeId = await queryChromeNodeId(session, selector)
  }
  if (nodeId === null) throw new Error(`file input not found: ${selector}`)
  const result = await sessionCommand(session, "DOM.setFileInputFiles", {nodeId, files})
  await sessionCommand(session, "Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) return {changed:false};
      input.dispatchEvent(new Event("input", {bubbles:true}));
      input.dispatchEvent(new Event("change", {bubbles:true}));
      return {changed:true, files: input.files ? input.files.length : 0};
    })()`,
    awaitPromise: false,
    returnByValue: true,
    userGesture: true,
  }).catch(() => undefined)
  return {target: targetSummary(session.target), result}
}

export async function setChromeDevtoolsDeviceMetrics(body: JsonObject): Promise<{target: JsonObject; viewport: JsonObject}> {
  const session = await ensureSession(body)
  const width = optionalPositiveInteger(body["width"], "width") ?? 1920
  const height = optionalPositiveInteger(body["height"], "height") ?? 963
  const visibleWidth = optionalPositiveInteger(body["visibleWidth"], "visibleWidth") ?? width
  const visibleHeight = optionalPositiveInteger(body["visibleHeight"], "visibleHeight") ?? height
  const deviceScaleFactor = optionalPositiveNumber(body["deviceScaleFactor"], "deviceScaleFactor") ?? 1
  const mobile = asBoolean(body["mobile"]) ?? false
  const scale = optionalPositiveNumber(body["scale"], "scale") ?? 1
  const request = {width, height, visibleWidth, visibleHeight, deviceScaleFactor, mobile, scale}

  await sessionCommand(session, "Runtime.enable")
  await sessionCommand(session, "Page.enable").catch(() => undefined)
  await sessionCommand(session, "Emulation.clearDeviceMetricsOverride").catch(() => undefined)
  await sessionCommand(session, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor,
    mobile,
    screenWidth: width,
    screenHeight: height,
    positionX: 0,
    positionY: 0,
    scale,
    screenOrientation: {
      type: width >= height ? "landscapePrimary" : "portraitPrimary",
      angle: width >= height ? 90 : 0,
    },
  })
  const visibleSizeRequest = {width: visibleWidth, height: visibleHeight}
  const visibleSize = await sessionCommand(session, "Emulation.setVisibleSize", visibleSizeRequest)
    .then(() => ({ok: true, ...visibleSizeRequest}), (error) => ({ok: false, ...visibleSizeRequest, error: serializeError(error)}))
  await delay(DEVTOOLS_VIEWPORT_SETTLE_MS)
  await dispatchTargetResize(session)
  const after = await readTargetViewportState(session).catch((error) => ({error: serializeError(error)}))
  return {target: targetSummary(session.target), viewport: {request, visibleSize, after}}
}

/**
 * Синхронизирует Chrome DevTools Device Mode после drift на reload/rotate.
 *
 * В server-dev layout у DevTools Device Mode есть три связанные, но независимые
 * состояния:
 *
 * - toolbar Width/Height inputs, которые видит человек;
 * - JS viewport target page (`innerWidth`, `screen.width`, canvas CSS size);
 * - Chrome compositor visible surface, который показывает DevTools preview и
 *   отдает `Page.captureScreenshot`.
 *
 * Ручной Rotate и `Page.reload` могут оставить эти состояния рассинхронизированными.
 * Наблюдали toolbar `816x400`, когда target page уже был `1088x533`, и toolbar
 * `816x400`, когда compositor screenshot surface все еще был portrait `400x871`
 * или scaled `612x300`. В таком состоянии WebApp может уже иметь canvas на всю
 * ширину, но DevTools показывает серую пустую область или root torus fit считается
 * относительно неправильного viewport.
 *
 * Toolbar Device Mode считаем ожидаемым user-visible viewport. Этот helper читает
 * toolbar через DevTools frontend target, затем применяет к WebApp target logical
 * viewport через `Emulation.setDeviceMetricsOverride`, а compositor surface через
 * `Emulation.setVisibleSize` держит равным видимой `device-mode-screen-area` с
 * учетом DevTools zoom.
 * Если DevTools уже рассинхронизировал `devicePixelRatio`, helper сохраняет
 * фактический canvas DPR (`canvas.width / canvas.clientWidth`), когда он
 * выглядит валидным. После этого helper отправляет synthetic `resize` event в target page, потому
 * что после reload WebApp может успеть сконфигурировать canvas backing store под
 * промежуточный viewport, а Chrome не всегда доставляет новый resize event после
 * CDP visible-size resync.
 * Логика намеренно event-scoped: вызывай ее из `devtools.reload` или
 * `devtools.viewport.sync`, а managed CDP session дополнительно повторяет
 * sync после `Page.frameNavigated` / `Page.loadEventFired`, чтобы ручной reload
 * в DevTools не сбрасывал target page из portrait `400x816` обратно в
 * landscape `816x400`. Фоновый polling для этого состояния не добавлять.
 */
async function syncDevtoolsViewport(session: ChromeDevtoolsSession, body: JsonObject): Promise<JsonObject> {
  await sessionCommand(session, "Runtime.enable")
  await sessionCommand(session, "Page.enable").catch(() => undefined)
  const before = await readTargetViewportState(session)
  const toolbar = await readDevtoolsToolbarViewport().catch((error) => ({error: serializeError(error)}))
  const request = resolveViewportSyncRequest(body, before, asObject(toolbar))

  await sessionCommand(session, "Emulation.setDeviceMetricsOverride", {
    width: request.width,
    height: request.height,
    deviceScaleFactor: request.deviceScaleFactor,
    mobile: request.mobile,
    screenWidth: request.width,
    screenHeight: request.height,
    positionX: 0,
    positionY: 0,
    scale: request.scale,
    screenOrientation: {
      type: request.width >= request.height ? "landscapePrimary" : "portraitPrimary",
      angle: request.width >= request.height ? 90 : 0,
    },
  })
  const visibleSizeRequest = {width: request.visibleWidth, height: request.visibleHeight}
  const visibleSize = await sessionCommand(session, "Emulation.setVisibleSize", visibleSizeRequest)
    .then(() => ({ok: true, ...visibleSizeRequest}), (error) => ({ok: false, ...visibleSizeRequest, error: serializeError(error)}))

  await delay(DEVTOOLS_VIEWPORT_SETTLE_MS)
  await dispatchTargetResize(session)
  await sessionCommand(session, "Runtime.evaluate", {
    expression: "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
    awaitPromise: true,
    returnByValue: true,
  }).catch(() => undefined)

  const ready = await waitForViewportReady(session, request, DEVTOOLS_VIEWPORT_READY_TIMEOUT_MS)
  const after = await readTargetViewportState(session)
  return {request, toolbar, before, ready, after, visibleSize}
}

async function repairDevtoolsViewportDrift(session: ChromeDevtoolsSession, body: JsonObject, source: string): Promise<JsonObject> {
  if (!DEVTOOLS_VIEWPORT_REPAIR_ENABLED) return viewportRepairDisabled(source)
  await sessionCommand(session, "Runtime.enable")
  await sessionCommand(session, "Page.enable").catch(() => undefined)
  const before = await readTargetViewportState(session)
  const toolbar = await readDevtoolsToolbarViewport().catch((error) => ({error: serializeError(error)}))
  const request = resolveViewportRepairRequest(body, before, asObject(toolbar))
  if (request === null) {
    return {status: "skipped", source, reason: "DevTools toolbar viewport is unavailable", toolbar, before}
  }
  const drift = viewportDriftForRepair(before, request, source === "reload" || source === "manual")
  if (!drift.repair) {
    return {status: "skipped", source, reason: "target viewport already matches Device Mode orientation", request, toolbar, before, drift}
  }
  const applied = await syncDevtoolsViewport(session, {
    ...body,
    width: request.width,
    height: request.height,
    visibleWidth: request.visibleWidth,
    visibleHeight: request.visibleHeight,
    deviceScaleFactor: request.deviceScaleFactor,
    mobile: request.mobile,
    scale: request.scale,
  })
  return {status: "repaired", source, drift, ...applied}
}

async function waitForDocumentReady(session: ChromeDevtoolsSession, timeoutMs: number): Promise<JsonObject> {
  const startedAt = Date.now()
  let attempts = 0
  let lastState: string | undefined
  let lastError: string | undefined
  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1
    try {
      const state = await sessionCommand(session, "Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      })
      lastState = asString(asObject(state["result"])?.["value"])
      if (lastState === "complete") {
        return {ok: true, state: lastState, attempts, elapsedMs: Date.now() - startedAt}
      }
    } catch (error) {
      lastError = serializeError(error)
    }
    await delay(50)
  }
  const result: JsonObject = {ok: false, timeoutMs, attempts, elapsedMs: Date.now() - startedAt}
  if (lastState !== undefined) result["state"] = lastState
  if (lastError !== undefined) result["error"] = lastError
  return result
}

async function readTargetViewportState(session: ChromeDevtoolsSession): Promise<JsonObject> {
  const response = await sessionCommand(session, "Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const canvas = document.querySelector("canvas")
      const rect = canvas?.getBoundingClientRect()
      return {
        url: location.href,
        readyState: document.readyState,
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        devicePixelRatio,
        screenWidth: screen.width,
        screenHeight: screen.height,
        orientationType: screen.orientation?.type,
        orientationAngle: screen.orientation?.angle,
        canvas: canvas === null ? null : {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          rectWidth: rect?.width,
          rectHeight: rect?.height,
        },
      }
    })()`,
  })
  return resultValueObject(response)
}

async function waitForViewportReady(session: ChromeDevtoolsSession, request: {width: number; height: number}, timeoutMs: number): Promise<JsonObject> {
  const startedAt = Date.now()
  let attempts = 0
  let lastState: JsonObject = {}
  while (Date.now() - startedAt < timeoutMs) {
    attempts += 1
    lastState = await readTargetViewportState(session)
    if (isViewportReady(lastState, request)) {
      return {ok: true, attempts, elapsedMs: Date.now() - startedAt, state: lastState}
    }
    if (shouldDispatchTargetResize(lastState, request)) await dispatchTargetResize(session)
    await delay(50)
  }
  return {ok: false, timeoutMs, attempts, elapsedMs: Date.now() - startedAt, state: lastState}
}

function isViewportReady(state: JsonObject, request: {width: number; height: number}): boolean {
  if (asString(state["readyState"]) !== "complete") return false
  if (asNumber(state["innerWidth"]) !== request.width) return false
  if (asNumber(state["innerHeight"]) !== request.height) return false
  const canvas = asObject(state["canvas"])
  if (canvas === undefined) return false
  if (asNumber(canvas["clientWidth"]) !== request.width) return false
  if (asNumber(canvas["clientHeight"]) !== request.height) return false
  const width = asNumber(canvas["width"])
  const height = asNumber(canvas["height"])
  const devicePixelRatio = asNumber(state["devicePixelRatio"]) ?? 1
  return width !== undefined
    && height !== undefined
    && Math.abs(width - Math.round(request.width * devicePixelRatio)) <= 1
    && Math.abs(height - Math.round(request.height * devicePixelRatio)) <= 1
}

function shouldDispatchTargetResize(state: JsonObject, request: {width: number; height: number}): boolean {
  if (asNumber(state["innerWidth"]) !== request.width) return false
  if (asNumber(state["innerHeight"]) !== request.height) return false
  const canvas = asObject(state["canvas"])
  if (canvas === undefined) return true
  return asNumber(canvas["clientWidth"]) === request.width && asNumber(canvas["clientHeight"]) === request.height
}

async function dispatchTargetResize(session: ChromeDevtoolsSession): Promise<void> {
  await sessionCommand(session, "Runtime.evaluate", {
    expression: "window.dispatchEvent(new Event('resize'))",
    awaitPromise: false,
    returnByValue: true,
  }).catch(() => undefined)
}

async function readDevtoolsToolbarViewport(): Promise<JsonObject | null> {
  const target = await resolveDevtoolsFrontendTarget()
  if (target === undefined || target.webSocketDebuggerUrl === undefined) return null
  const session = await openTransientSession(target)
  try {
    await sessionCommand(session, "Runtime.enable")
    const response = await sessionCommand(session, "Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const result = {}
        function visit(root) {
          for (const element of Array.from(root.querySelectorAll?.("*") ?? [])) {
            const title = element.getAttribute?.("title") || ""
            const className = typeof element.className === "string" ? element.className : ""
            if (title === "Width") result.width = Number(element.value)
            if (title.startsWith("Height")) result.height = Number(element.value)
            if (title === "Zoom") result.zoom = Number(element.value)
            if (className.includes("device-mode-screen-area")) {
              const rect = element.getBoundingClientRect()
              result.screenArea = {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
            }
            if (element.shadowRoot) visit(element.shadowRoot)
          }
        }
        visit(document)
        if (Number.isFinite(result.width) && Number.isFinite(result.height) && result.screenArea) {
          result.visibleScaleX = result.screenArea.width / result.width
          result.visibleScaleY = result.screenArea.height / result.height
        }
        return result
      })()`,
    })
    const value = resultValueObject(response)
    const width = asNumber(value["width"])
    const height = asNumber(value["height"])
    if (width === undefined || height === undefined) return null
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null
    return {source: "devtools-toolbar", width, height, ...value}
  } finally {
    closePending(session, new Error("Transient Chrome DevTools session closed"))
    session.socket.close()
  }
}

async function resolveDevtoolsFrontendTarget(): Promise<ChromeTarget | undefined> {
  const targets = await fetchChromeTargets()
  return targets.find((item) => item.type === "page" && item.url.startsWith("devtools://devtools/") && item.title?.includes("meta.proizvodstvo1.ru"))
    ?? targets.find((item) => item.type === "page" && item.url.startsWith("devtools://devtools/"))
}

function resolveViewportSyncRequest(body: JsonObject, before: JsonObject, toolbar: JsonObject | undefined): DevtoolsViewportRequest {
  const bodyWidth = optionalPositiveInteger(body["width"], "width")
  const bodyHeight = optionalPositiveInteger(body["height"], "height")
  const toolbarWidth = optionalPositiveInteger(toolbar?.["width"], "toolbar.width")
  const toolbarHeight = optionalPositiveInteger(toolbar?.["height"], "toolbar.height")
  const beforeWidth = optionalPositiveInteger(before["innerWidth"], "innerWidth")
  const beforeHeight = optionalPositiveInteger(before["innerHeight"], "innerHeight")
  const width = bodyWidth ?? toolbarWidth ?? beforeWidth
  const height = bodyHeight ?? toolbarHeight ?? beforeHeight
  if (width === undefined || height === undefined) throw new Error("Could not resolve viewport width/height")

  const mobile = asBoolean(body["mobile"]) ?? true
  const bodyDpr = asNumber(body["deviceScaleFactor"])
  const beforeDpr = validInferredDeviceScaleFactor(asNumber(before["devicePixelRatio"]))
  const canvasDpr = inferredCanvasDeviceScaleFactor(before)
  const inferredDpr = Math.max(canvasDpr ?? 0, beforeDpr ?? 0, mobile ? 2 : 1)
  const deviceScaleFactor = bodyDpr !== undefined && Number.isFinite(bodyDpr) && bodyDpr > 0
    ? bodyDpr
    : inferredDpr
  const source = bodyWidth !== undefined || bodyHeight !== undefined
    ? "request-body"
    : toolbarWidth !== undefined || toolbarHeight !== undefined
      ? "devtools-toolbar"
      : "target-runtime"
  const visible = resolveViewportVisibleSize(body, toolbar, width, height)
  const scale = resolveViewportScale(body, toolbar, visible.width, visible.height, width, height)
  return {width, height, visibleWidth: visible.width, visibleHeight: visible.height, deviceScaleFactor, mobile, scale: scale.value, source, visibleSource: visible.source, scaleSource: scale.source}
}

function resolveViewportRepairRequest(body: JsonObject, before: JsonObject, toolbar: JsonObject | undefined): DevtoolsViewportRequest | null {
  const bodyWidth = optionalPositiveInteger(body["width"], "width")
  const bodyHeight = optionalPositiveInteger(body["height"], "height")
  const toolbarWidth = optionalPositiveInteger(toolbar?.["width"], "toolbar.width")
  const toolbarHeight = optionalPositiveInteger(toolbar?.["height"], "toolbar.height")
  const width = bodyWidth ?? toolbarWidth
  const height = bodyHeight ?? toolbarHeight
  if (width === undefined || height === undefined) return null

  const mobile = asBoolean(body["mobile"]) ?? true
  const bodyDpr = asNumber(body["deviceScaleFactor"])
  const beforeDpr = validInferredDeviceScaleFactor(asNumber(before["devicePixelRatio"]))
  const canvasDpr = inferredCanvasDeviceScaleFactor(before)
  const inferredDpr = Math.max(canvasDpr ?? 0, beforeDpr ?? 0, mobile ? 2 : 1)
  const deviceScaleFactor = bodyDpr !== undefined && Number.isFinite(bodyDpr) && bodyDpr > 0
    ? bodyDpr
    : inferredDpr
  const source = bodyWidth !== undefined || bodyHeight !== undefined ? "request-body" : "devtools-toolbar"
  const visible = resolveViewportVisibleSize(body, toolbar, width, height)
  const scale = resolveViewportScale(body, toolbar, visible.width, visible.height, width, height)
  return {width, height, visibleWidth: visible.width, visibleHeight: visible.height, deviceScaleFactor, mobile, scale: scale.value, source, visibleSource: visible.source, scaleSource: scale.source}
}

function resolveViewportVisibleSize(
  body: JsonObject,
  toolbar: JsonObject | undefined,
  width: number,
  height: number,
): {width: number; height: number; source: string} {
  const bodyWidth = optionalPositiveInteger(body["visibleWidth"], "visibleWidth")
  const bodyHeight = optionalPositiveInteger(body["visibleHeight"], "visibleHeight")
  const screenArea = asObject(toolbar?.["screenArea"])
  const toolbarWidth = optionalPositiveRoundedInteger(screenArea?.["width"], "toolbar.screenArea.width")
  const toolbarHeight = optionalPositiveRoundedInteger(screenArea?.["height"], "toolbar.screenArea.height")
  const visibleWidth = bodyWidth ?? toolbarWidth
  const visibleHeight = bodyHeight ?? toolbarHeight
  if (visibleWidth !== undefined && visibleHeight !== undefined) {
    return {width: visibleWidth, height: visibleHeight, source: bodyWidth !== undefined || bodyHeight !== undefined ? "request-body" : "devtools-screen-area"}
  }
  return {width, height, source: "layout-viewport"}
}

function resolveViewportScale(
  body: JsonObject,
  toolbar: JsonObject | undefined,
  visibleWidth: number,
  visibleHeight: number,
  width: number,
  height: number,
): {value: number; source: string} {
  const bodyScale = optionalPositiveNumber(body["scale"], "scale")
  if (bodyScale !== undefined) return {value: bodyScale, source: "request-body"}
  const toolbarScaleX = optionalPositiveNumber(toolbar?.["visibleScaleX"], "toolbar.visibleScaleX")
  const toolbarScaleY = optionalPositiveNumber(toolbar?.["visibleScaleY"], "toolbar.visibleScaleY")
  if (toolbarScaleX !== undefined && toolbarScaleY !== undefined) return {value: Math.min(toolbarScaleX, toolbarScaleY), source: "devtools-screen-area"}
  if (visibleWidth !== width || visibleHeight !== height) return {value: Math.min(visibleWidth / width, visibleHeight / height), source: "visible-size-ratio"}
  return {value: 1, source: "layout-viewport"}
}

function viewportDriftForRepair(state: JsonObject, request: {width: number; height: number; source?: string; visibleSource?: string}, forceVisibleSurfaceRepair: boolean): JsonObject & {repair: boolean} {
  const currentWidth = asNumber(state["innerWidth"])
  const currentHeight = asNumber(state["innerHeight"])
  const screenWidth = asNumber(state["screenWidth"])
  const screenHeight = asNumber(state["screenHeight"])
  const orientationType = asString(state["orientationType"])
  if (currentWidth === undefined || currentHeight === undefined) {
    return {repair: false, reason: "target viewport size is unavailable"}
  }

  const expectedPortrait = request.width < request.height
  const currentPortrait = currentWidth < currentHeight
  const sizeMismatch = Math.abs(currentWidth - request.width) > DEVTOOLS_VIEWPORT_DRIFT_TOLERANCE_PX
    || Math.abs(currentHeight - request.height) > DEVTOOLS_VIEWPORT_DRIFT_TOLERANCE_PX
  const orientationMismatch = expectedPortrait !== currentPortrait
  const screenMatchesRequest = screenWidth !== undefined
    && screenHeight !== undefined
    && Math.abs(screenWidth - request.width) <= DEVTOOLS_VIEWPORT_DRIFT_TOLERANCE_PX
    && Math.abs(screenHeight - request.height) <= DEVTOOLS_VIEWPORT_DRIFT_TOLERANCE_PX
  const orientationMatchesRequest = orientationType?.startsWith(expectedPortrait ? "portrait" : "landscape") === true
  const confirmedByDeviceMode = screenMatchesRequest || orientationMatchesRequest
  const trustedRequest = request.source === "devtools-toolbar" || request.source === "request-body"
  const visibleSurfaceRequested = forceVisibleSurfaceRepair && (request.visibleSource === "devtools-screen-area" || request.visibleSource === "request-body")
  const shouldRepair = trustedRequest
    ? sizeMismatch || visibleSurfaceRequested
    : sizeMismatch && orientationMismatch && confirmedByDeviceMode
  return {
    repair: shouldRepair,
    sizeMismatch,
    orientationMismatch,
    visibleSurfaceRequested,
    trustedRequest,
    requestSource: request.source,
    visibleSource: request.visibleSource,
    confirmedByDeviceMode,
    screenMatchesRequest,
    orientationMatchesRequest,
    expected: {width: request.width, height: request.height, orientation: expectedPortrait ? "portrait" : "landscape"},
    actual: {width: currentWidth, height: currentHeight, orientation: currentPortrait ? "portrait" : "landscape"},
    screen: {width: screenWidth, height: screenHeight, orientationType},
  }
}

function inferredCanvasDeviceScaleFactor(state: JsonObject): number | undefined {
  const canvas = asObject(state["canvas"])
  const width = asNumber(canvas?.["width"])
  const clientWidth = asNumber(canvas?.["clientWidth"])
  if (width === undefined || clientWidth === undefined || clientWidth <= 0) return undefined
  const ratio = width / clientWidth
  return validInferredDeviceScaleFactor(ratio)
}

function validInferredDeviceScaleFactor(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 1 || value > 8) return undefined
  return Math.round(value * 1000) / 1000
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined
  const number = asNumber(value)
  if (number === undefined || !Number.isInteger(number) || number < 1) throw new Error(`${name} must be a positive integer`)
  return number
}

function optionalPositiveRoundedInteger(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined
  const number = asNumber(value)
  if (number === undefined || !Number.isFinite(number) || number < 1) throw new Error(`${name} must be a positive number`)
  return Math.max(1, Math.round(number))
}

function optionalPositiveNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined
  const number = asNumber(value)
  if (number === undefined || !Number.isFinite(number) || number <= 0) throw new Error(`${name} must be a positive number`)
  return number
}

async function openTransientSession(target: ChromeTarget): Promise<ChromeDevtoolsSession> {
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
    consoleEnabled: false,
    consoleEvents: [],
    openedAt: new Date().toISOString(),
    viewportAutoSync: createViewportAutoSyncState(),
  }
  socket.addEventListener("message", (event) => handleSessionMessage(session, event))
  return session
}

function resultValueObject(response: JsonObject): JsonObject {
  return asObject(asObject(response["result"])?.["value"]) ?? {}
}

function createViewportAutoSyncState(): ChromeDevtoolsViewportAutoSync {
  return {
    enabled: false,
    running: false,
    timer: null,
  }
}

function viewportRepairDisabled(source: string): JsonObject {
  return {disabled: true, source, reason: "DevTools viewport repair is disabled"}
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
  if (existing !== undefined && existing.socket.readyState === WebSocket.OPEN) {
    existing.target = target
    return existing
  }

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
    consoleEnabled: false,
    consoleEvents: [],
    openedAt: new Date().toISOString(),
    viewportAutoSync: createViewportAutoSyncState(),
  }
  socket.addEventListener("message", (event) => handleSessionMessage(session, event))
  socket.addEventListener("close", () => {
    if (session.viewportAutoSync.timer !== null) clearTimeout(session.viewportAutoSync.timer)
    closePending(session, new Error("Chrome DevTools WebSocket closed"))
    sessions.delete(target.id)
  })
  socket.addEventListener("error", () => closePending(session, new Error("Chrome DevTools WebSocket error")))
  sessions.set(target.id, session)
  if (DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED && shouldEnableViewportAutoSync(target)) await enableViewportAutoSync(session)
  return session
}

async function resolveTarget(body: JsonObject): Promise<ChromeTarget> {
  const targets = await fetchChromeTargets()
  const targetId = asString(body["targetId"])
  const targetUrl = asString(body["targetUrl"]) ?? defaultTargetUrl()
  const explicitTargetUrl = asString(body["targetUrl"])
  const targetTitle = asString(body["targetTitle"])
  const urlContains = asString(body["urlContains"])
  const candidates = targets.filter(isPageDebugTarget)

  if (targetId !== undefined) {
    const target = targets.find((item) => item.id === targetId)
    if (target === undefined) throw new Error(`Chrome page target not found for targetId ${targetId}`)
    return target
  }

  const target = candidates.find((item) => item.url === targetUrl)
    ?? (targetTitle === undefined ? undefined : candidates.find((item) => item.title === targetTitle))
    ?? (urlContains === undefined ? undefined : candidates.find((item) => item.url.includes(urlContains)))
    ?? (explicitTargetUrl === undefined && targetTitle === undefined && urlContains === undefined ? candidates[0] : undefined)

  if (target === undefined) throw new Error(`Chrome page target not found for ${targetSelectorSummary({targetUrl: explicitTargetUrl, targetTitle, urlContains})}`)
  return target
}

function isPageDebugTarget(target: ChromeTarget): boolean {
  return target.type === "page"
    && !target.url.startsWith("devtools://")
    && !target.url.includes("/desktop/rtc/sender")
}

function shouldEnableViewportAutoSync(target: ChromeTarget): boolean {
  return target.type === "page" && (target.url.startsWith(defaultTargetUrl()) || target.url.startsWith("http://127.0.0.1:4004/"))
}

function targetSelectorSummary(selector: {targetUrl: string | undefined; targetTitle: string | undefined; urlContains: string | undefined}): string {
  if (selector.targetUrl !== undefined) return `targetUrl ${selector.targetUrl}`
  if (selector.targetTitle !== undefined) return `targetTitle ${selector.targetTitle}`
  if (selector.urlContains !== undefined) return `urlContains ${selector.urlContains}`
  return "default target"
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
  if (method === "Page.frameNavigated") {
    const frame = asObject(asObject(message["params"])?.["frame"])
    const url = asString(frame?.["url"])
    if (url !== undefined && url.length > 0) session.target.url = url
  }

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
  } else if (method === "Runtime.consoleAPICalled") {
    appendConsoleEvent(session, consoleApiEvent(asObject(message["params"]) ?? {}))
  } else if (method === "Runtime.exceptionThrown") {
    appendConsoleEvent(session, exceptionEvent(asObject(message["params"]) ?? {}))
  } else if (method === "Log.entryAdded") {
    appendConsoleEvent(session, logEntryEvent(asObject(message["params"]) ?? {}))
  } else if (method === "Network.loadingFailed") {
    appendConsoleEvent(session, networkFailureEvent(asObject(message["params"]) ?? {}))
  } else if (DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED && session.viewportAutoSync.enabled && (method === "Page.frameNavigated" || method === "Page.loadEventFired" || method === "Page.frameResized")) {
    scheduleViewportAutoSync(session, method)
  }
}

async function enableViewportAutoSync(session: ChromeDevtoolsSession): Promise<void> {
  if (session.viewportAutoSync.enabled) return
  await sessionCommand(session, "Page.enable").catch(() => undefined)
  await sessionCommand(session, "Runtime.enable").catch(() => undefined)
  session.viewportAutoSync.enabled = true
}

function scheduleViewportAutoSync(session: ChromeDevtoolsSession, reason: string): void {
  if (!DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED) return
  scheduleViewportRepair(session, reason)
}

function scheduleViewportRepair(session: ChromeDevtoolsSession, reason: string): void {
  if (!DEVTOOLS_VIEWPORT_REPAIR_ENABLED) return
  if (session.socket.readyState !== WebSocket.OPEN) return
  if (session.viewportAutoSync.timer !== null) clearTimeout(session.viewportAutoSync.timer)
  session.viewportAutoSync.scheduledAt = new Date().toISOString()
  session.viewportAutoSync.timer = setTimeout(() => {
    session.viewportAutoSync.timer = null
    void runViewportAutoSync(session, reason)
  }, DEVTOOLS_VIEWPORT_AUTOSYNC_DELAY_MS)
}

async function runViewportAutoSync(session: ChromeDevtoolsSession, reason: string): Promise<void> {
  if (session.viewportAutoSync.running || session.socket.readyState !== WebSocket.OPEN) return
  session.viewportAutoSync.running = true
  try {
    const result = await repairDevtoolsViewportDrift(session, {}, reason)
    session.viewportAutoSync.lastResult = {reason, ...result}
    delete session.viewportAutoSync.lastError
  } catch (error) {
    session.viewportAutoSync.lastError = serializeError(error)
  } finally {
    session.viewportAutoSync.running = false
    session.viewportAutoSync.completedAt = new Date().toISOString()
  }
}

async function ensureConsoleCapture(session: ChromeDevtoolsSession): Promise<void> {
  if (session.consoleEnabled) return
  await sessionCommand(session, "Runtime.enable")
  await sessionCommand(session, "Log.enable").catch(() => undefined)
  await sessionCommand(session, "Network.enable").catch(() => undefined)
  session.consoleEnabled = true
}

function appendConsoleEvent(session: ChromeDevtoolsSession, event: ChromeDevtoolsConsoleEvent | null): void {
  if (event === null) return
  session.consoleEvents.push(event)
  if (session.consoleEvents.length > MAX_CONSOLE_EVENTS) {
    session.consoleEvents.splice(0, session.consoleEvents.length - MAX_CONSOLE_EVENTS)
  }
}

function consoleApiEvent(params: JsonObject): ChromeDevtoolsConsoleEvent {
  const type = asString(params["type"]) ?? "log"
  const args = Array.isArray(params["args"])
    ? params["args"].map((arg) => remoteObjectSummary(asObject(arg) ?? {}))
    : []
  const event: ChromeDevtoolsConsoleEvent = {
    id: nextConsoleEventId++,
    kind: "console",
    level: consoleLevelFromType(type),
    type,
    text: args.map((arg) => asString(arg["text"]) ?? "").filter((item) => item.length > 0).join(" "),
    args,
    capturedAt: new Date().toISOString(),
  }
  const timestamp = asNumber(params["timestamp"])
  if (params["stackTrace"] !== undefined) event.stackTrace = params["stackTrace"]
  if (timestamp !== undefined) event.timestamp = timestamp
  return event
}

function exceptionEvent(params: JsonObject): ChromeDevtoolsConsoleEvent {
  const details = asObject(params["exceptionDetails"]) ?? {}
  const exception = asObject(details["exception"])
  const description = exception === undefined ? undefined : asString(exception["description"])
  const event: ChromeDevtoolsConsoleEvent = {
    id: nextConsoleEventId++,
    kind: "exception",
    level: "error",
    text: description ?? asString(details["text"]) ?? "Uncaught exception",
    capturedAt: new Date().toISOString(),
  }
  const url = asString(details["url"])
  const lineNumber = asNumber(details["lineNumber"])
  const columnNumber = asNumber(details["columnNumber"])
  if (url !== undefined) event.url = url
  if (lineNumber !== undefined) event.lineNumber = lineNumber
  if (columnNumber !== undefined) event.columnNumber = columnNumber
  if (details["stackTrace"] !== undefined) event.stackTrace = details["stackTrace"]
  return event
}

function logEntryEvent(params: JsonObject): ChromeDevtoolsConsoleEvent | null {
  const entry = asObject(params["entry"])
  if (entry === undefined) return null
  const event: ChromeDevtoolsConsoleEvent = {
    id: nextConsoleEventId++,
    kind: "log",
    text: asString(entry["text"]) ?? "",
    capturedAt: new Date().toISOString(),
  }
  const source = asString(entry["source"])
  const level = asString(entry["level"])
  const url = asString(entry["url"])
  const lineNumber = asNumber(entry["lineNumber"])
  const requestId = asString(entry["networkRequestId"])
  const timestamp = asNumber(entry["timestamp"])
  if (source !== undefined) event.source = source
  if (level !== undefined) event.level = level
  if (url !== undefined) event.url = url
  if (lineNumber !== undefined) event.lineNumber = lineNumber
  if (requestId !== undefined) event.requestId = requestId
  if (entry["stackTrace"] !== undefined) event.stackTrace = entry["stackTrace"]
  if (timestamp !== undefined) event.timestamp = timestamp
  return event
}

function networkFailureEvent(params: JsonObject): ChromeDevtoolsConsoleEvent {
  const errorText = asString(params["errorText"]) ?? "Network request failed"
  const blockedReason = asString(params["blockedReason"])
  const corsErrorStatus = asObject(params["corsErrorStatus"])
  const corsError = asString(corsErrorStatus?.["corsError"])
  const text = corsError === undefined ? errorText : `${errorText}: ${corsError}`
  const event: ChromeDevtoolsConsoleEvent = {
    id: nextConsoleEventId++,
    kind: "network",
    level: "error",
    source: "network",
    text,
    errorText,
    capturedAt: new Date().toISOString(),
  }
  const type = asString(params["type"])
  const requestId = asString(params["requestId"])
  const timestamp = asNumber(params["timestamp"])
  if (type !== undefined) event.type = type
  if (requestId !== undefined) event.requestId = requestId
  if (timestamp !== undefined) event.timestamp = timestamp
  if (blockedReason !== undefined) event.blockedReason = blockedReason
  return event
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

async function queryChromeNodeId(session: ChromeDevtoolsSession, selector: string): Promise<number | null> {
  const documentResult = await sessionCommand(session, "DOM.getDocument", {depth: -1, pierce: true})
  const root = asObject(documentResult["root"])
  const rootNodeId = asNumber(root?.["nodeId"])
  if (rootNodeId === undefined) return null
  const query = await sessionCommand(session, "DOM.querySelector", {nodeId: rootNodeId, selector})
  const nodeId = asNumber(query["nodeId"])
  return nodeId === undefined || nodeId <= 0 ? null : nodeId
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
    ?? process.env.BULK_WEB_URL
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
        : process.env.BULK_WEB_URL !== undefined
          ? "BULK_WEB_URL"
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
    console: {
      enabled: session.consoleEnabled,
      buffered: session.consoleEvents.length,
      lastEvent: session.consoleEvents.at(-1),
    },
    viewportAutoSync: {
      enabled: DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED && session.viewportAutoSync.enabled,
      disabled: !DEVTOOLS_VIEWPORT_AUTOSYNC_ENABLED,
      repairEnabled: DEVTOOLS_VIEWPORT_REPAIR_ENABLED,
      running: session.viewportAutoSync.running,
      scheduledAt: session.viewportAutoSync.scheduledAt,
      completedAt: session.viewportAutoSync.completedAt,
      lastError: session.viewportAutoSync.lastError,
      lastResult: session.viewportAutoSync.lastResult,
    },
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

function remoteObjectSummary(object: JsonObject): JsonObject {
  const value = object["value"]
  const unserializableValue = asString(object["unserializableValue"])
  const description = asString(object["description"])
  const type = asString(object["type"])
  const subtype = asString(object["subtype"])
  const text = value === undefined
    ? unserializableValue ?? description ?? type ?? ""
    : typeof value === "string"
      ? value
      : JSON.stringify(value)
  const result: JsonObject = {text}
  if (type !== undefined) result["type"] = type
  if (subtype !== undefined) result["subtype"] = subtype
  if (description !== undefined) result["description"] = description
  if (value !== undefined) result["value"] = value
  if (unserializableValue !== undefined) result["unserializableValue"] = unserializableValue
  return result
}

function consoleLevelFromType(type: string): string {
  if (type === "error" || type === "assert") return "error"
  if (type === "warning" || type === "warn") return "warning"
  if (type === "debug" || type === "trace") return "debug"
  return "info"
}

function sourceMatches(candidate: string, requested: string): boolean {
  const normalizedCandidate = candidate.replaceAll("\\", "/")
  const normalizedRequested = requested.replaceAll("\\", "/")
  return normalizedCandidate === normalizedRequested
    || normalizedCandidate.endsWith(`/${normalizedRequested}`)
    || normalizedRequested.endsWith(`/${normalizedCandidate}`)
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

function requestBodyFromSearchParams(params: URLSearchParams): JsonObject {
  const body: JsonObject = {}
  for (const key of ["targetId", "targetUrl", "targetTitle", "urlContains", "level", "kind"]) {
    const value = params.get(key)
    if (value !== null && value.length > 0) body[key] = value
  }
  for (const key of ["limit", "sinceId"]) {
    const value = params.get(key)
    if (value !== null && value.length > 0) {
      const number = Number(value)
      if (Number.isFinite(number)) body[key] = number
    }
  }
  return body
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
