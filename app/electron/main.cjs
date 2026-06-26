const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const {app, BrowserWindow, session, shell, systemPreferences} = require("electron")

const DEFAULT_META_URL = "https://meta.proizvodstvo1.ru/"
const TRUSTED_ORIGINS = new Set([new URL(DEFAULT_META_URL).origin, "https://sso.proizvodstvo1.ru"])

let targetUrl = normalizeBrowserUrl(process.env.METAFOR_URL || DEFAULT_META_URL)
let targetOrigin = new URL(targetUrl).origin

const DEBUG_PORT = parsePort(process.env.METAFOR_ELECTRON_DEBUG_PORT, "METAFOR_ELECTRON_DEBUG_PORT")
const HOST_MODE = envFlag(process.env.METAFOR_ELECTRON_HOST) || hasEnvValue(process.env.METAFOR_ELECTRON_HOST_PORT)
const HOST_BIND = (process.env.METAFOR_ELECTRON_HOST_BIND || "127.0.0.1").trim() || "127.0.0.1"
const HOST_PORT = parsePort(process.env.METAFOR_ELECTRON_HOST_PORT, "METAFOR_ELECTRON_HOST_PORT", {allowZero: true}) ?? 0
const HOST_MAX_IN_FLIGHT = parseInteger(process.env.METAFOR_ELECTRON_HOST_MAX_IN_FLIGHT, "METAFOR_ELECTRON_HOST_MAX_IN_FLIGHT", 8, 1, 128)
const HOST_BODY_LIMIT_BYTES = parseInteger(
  process.env.METAFOR_ELECTRON_HOST_BODY_LIMIT_BYTES,
  "METAFOR_ELECTRON_HOST_BODY_LIMIT_BYTES",
  65536,
  1024,
  1024 * 1024,
)
const SESSION_PARTITION = HOST_MODE ? "persist:metafor-browser-host" : "persist:metafor"

const viewport = {
  width: parseInteger(process.env.METAFOR_ELECTRON_VIEWPORT_WIDTH, "METAFOR_ELECTRON_VIEWPORT_WIDTH", 1440, 1, 8192),
  height: parseInteger(process.env.METAFOR_ELECTRON_VIEWPORT_HEIGHT, "METAFOR_ELECTRON_VIEWPORT_HEIGHT", 960, 1, 8192),
  deviceScaleFactor: parseNumber(process.env.METAFOR_ELECTRON_DEVICE_SCALE_FACTOR, "METAFOR_ELECTRON_DEVICE_SCALE_FACTOR", null, 0.1, 10),
}

let mainWindow = null
let hostServer = null
let hostPort = null
let activeHostRequests = 0
let snapshotCapture = null
let warnedAboutDeviceEmulation = false
let frameSequence = 0

const pageState = {
  status: "idle",
  url: "",
  title: "",
  crashed: false,
  lastError: null,
  lastLoadStartedAt: null,
  lastLoadFinishedAt: null,
}

app.commandLine.appendSwitch("enable-unsafe-webgpu")
app.commandLine.appendSwitch("ignore-gpu-blocklist")
app.commandLine.appendSwitch("enable-features", "WebGPU")

if (DEBUG_PORT !== null) {
  app.commandLine.appendSwitch("remote-debugging-port", String(DEBUG_PORT))
}

if (HOST_MODE) {
  if (!isLoopbackHost(HOST_BIND)) {
    throw new Error("METAFOR_ELECTRON_HOST_BIND must be localhost, 127.0.0.0/8 or ::1")
  }
  const defaultHostUserDataDir = path.join(app.getPath("userData"), "browser-host")
  const hostUserDataDir = process.env.METAFOR_ELECTRON_USER_DATA_DIR || defaultHostUserDataDir
  fs.mkdirSync(hostUserDataDir, {recursive: true})
  app.setPath("userData", hostUserDataDir)
}

function hasEnvValue(value) {
  return value !== undefined && value.trim() !== ""
}

function envFlag(value) {
  if (!hasEnvValue(value)) return false

  const normalized = value.trim().toLowerCase()
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return true
}

function parsePort(value, name, {allowZero = false} = {}) {
  if (!hasEnvValue(value)) return null

  const port = Number(value)
  const minPort = allowZero ? 0 : 1
  if (!Number.isInteger(port) || port < minPort || port > 65535) {
    throw new Error(`${name} must be an integer between ${minPort} and 65535`)
  }
  return port
}

function parseInteger(value, name, fallback, min, max) {
  if (!hasEnvValue(value)) return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function parseNumber(value, name, fallback, min, max) {
  if (!hasEnvValue(value)) return fallback

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}`)
  }
  return parsed
}

function isLoopbackHost(host) {
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

function normalizeBrowserUrl(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Browser URL must use http: or https:")
  }
  return parsed.toString()
}

function setTargetUrl(url) {
  targetUrl = normalizeBrowserUrl(url)
  targetOrigin = new URL(targetUrl).origin
}

function isTrustedUrl(url) {
  try {
    const origin = new URL(url).origin
    return origin === targetOrigin || TRUSTED_ORIGINS.has(origin)
  } catch {
    return false
  }
}

function setTargetUrlFromRequest(url) {
  try {
    setTargetUrl(url)
  } catch (error) {
    error.statusCode = 400
    throw error
  }
}

function installPermissions(appSession) {
  const allowed = new Set([
    "display-capture",
    "fullscreen",
    "media",
    "mediaKeySystem",
    "microphone",
    "notifications",
    "pointerLock",
  ])

  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL()
    callback(isTrustedUrl(url) && allowed.has(permission))
  })

  appSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const url = requestingOrigin || webContents?.getURL() || ""
    return isTrustedUrl(url) && allowed.has(permission)
  })
}

async function ensureMacMediaAccess() {
  if (process.platform !== "darwin") return

  const microphoneStatus = systemPreferences.getMediaAccessStatus("microphone")
  if (microphoneStatus === "not-determined") {
    await systemPreferences.askForMediaAccess("microphone")
  }
}

function getAppSession() {
  return session.fromPartition(SESSION_PARTITION)
}

function createWindow() {
  const appSession = getAppSession()

  const win = new BrowserWindow({
    width: viewport.width,
    height: viewport.height,
    minWidth: HOST_MODE ? 1 : 1024,
    minHeight: HOST_MODE ? 1 : 720,
    show: false,
    fullscreen: false,
    title: "MetaFor",
    backgroundColor: "#0b0f14",
    webPreferences: {
      contextIsolation: true,
      devTools: true,
      nodeIntegration: false,
      session: appSession,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow = win
  bindWindowState(win)
  applyViewport(win)

  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) win.show()
  })

  win.webContents.setWindowOpenHandler(({url}) => {
    if (isTrustedUrl(url)) {
      void win.loadURL(url).catch(logNavigationError)
    } else {
      void shell.openExternal(url)
    }
    return {action: "deny"}
  })

  win.webContents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  void loadTargetUrl(win).catch(logNavigationError)
  return win
}

function bindWindowState(win) {
  pageState.status = "created"
  pageState.crashed = false
  pageState.lastError = null

  win.on("closed", () => {
    if (mainWindow !== win) return
    mainWindow = null
    pageState.status = "closed"
  })

  win.webContents.on("did-start-loading", () => {
    pageState.status = "loading"
    pageState.crashed = false
    pageState.lastError = null
    pageState.lastLoadStartedAt = new Date().toISOString()
  })

  win.webContents.on("did-finish-load", () => {
    pageState.status = "ready"
    pageState.lastLoadFinishedAt = new Date().toISOString()
    refreshPageState(win)
  })

  win.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    pageState.status = "failed"
    pageState.lastLoadFinishedAt = new Date().toISOString()
    pageState.lastError = {
      code: errorCode,
      description: errorDescription,
      url: validatedURL,
    }
    refreshPageState(win)
  })

  win.webContents.on("did-stop-loading", () => refreshPageState(win))
  win.webContents.on("page-title-updated", (event, title) => {
    pageState.title = title
  })
  win.webContents.on("did-navigate", (event, url) => {
    pageState.url = url
  })
  win.webContents.on("did-navigate-in-page", (event, url) => {
    pageState.url = url
  })
  win.webContents.on("render-process-gone", (event, details) => {
    pageState.status = "crashed"
    pageState.crashed = true
    pageState.lastError = {
      reason: details.reason,
      exitCode: details.exitCode,
    }
  })
}

function refreshPageState(win = mainWindow) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
  pageState.url = win.webContents.getURL()
  pageState.title = win.webContents.getTitle()
  frameSequence += 1
}

function loadTargetUrl(win = mainWindow) {
  if (!win || win.isDestroyed()) {
    return Promise.reject(new Error("Browser window is not available"))
  }

  pageState.status = "loading"
  pageState.crashed = false
  pageState.lastError = null
  pageState.lastLoadStartedAt = new Date().toISOString()

  return win.loadURL(targetUrl).catch((error) => {
    pageState.status = "failed"
    pageState.lastLoadFinishedAt = new Date().toISOString()
    pageState.lastError = {
      message: error.message,
      url: targetUrl,
    }
    throw error
  })
}

function logNavigationError(error) {
  console.error("[metafor-electron] failed to navigate:", error)
}

function ensureWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return createWindow()
}

function restartWindow() {
  pageState.status = "restarting"

  const oldWindow = mainWindow
  mainWindow = null
  if (oldWindow && !oldWindow.isDestroyed()) oldWindow.destroy()

  return createWindow()
}

function applyViewport(win = mainWindow) {
  if (!win || win.isDestroyed()) return

  win.setSize(viewport.width, viewport.height)

  if (viewport.deviceScaleFactor === null) {
    if (typeof win.webContents.disableDeviceEmulation === "function") {
      win.webContents.disableDeviceEmulation()
    }
    return
  }

  if (typeof win.webContents.enableDeviceEmulation !== "function") {
    if (!warnedAboutDeviceEmulation) {
      warnedAboutDeviceEmulation = true
      console.warn("[metafor-electron] device emulation is unavailable in this Electron runtime")
    }
    return
  }

  win.webContents.enableDeviceEmulation({
    screenPosition: "desktop",
    screenSize: {width: viewport.width, height: viewport.height},
    viewPosition: {x: 0, y: 0},
    viewSize: {width: viewport.width, height: viewport.height},
    deviceScaleFactor: viewport.deviceScaleFactor,
    scale: 1,
  })
}

function updateViewport(nextViewport) {
  try {
    if (nextViewport.width !== undefined) {
      viewport.width = parseInteger(String(nextViewport.width), "width", viewport.width, 1, 8192)
    }
    if (nextViewport.height !== undefined) {
      viewport.height = parseInteger(String(nextViewport.height), "height", viewport.height, 1, 8192)
    }
    if (nextViewport.deviceScaleFactor !== undefined) {
      viewport.deviceScaleFactor =
        nextViewport.deviceScaleFactor === null
          ? null
          : parseNumber(String(nextViewport.deviceScaleFactor), "deviceScaleFactor", viewport.deviceScaleFactor, 0.1, 10)
    }
  } catch (error) {
    error.statusCode = 400
    throw error
  }

  applyViewport()
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value
  return fallback
}

function setFullscreen(body) {
  const win = ensureWindow()
  const enabled = normalizeBoolean(body.enabled, !win.isFullScreen())
  win.setFullScreen(enabled)
  return hostState()
}

function setDevTools(body) {
  const win = ensureWindow()
  const webContents = win.webContents
  const open = normalizeBoolean(body.open, undefined)
  const toggle = normalizeBoolean(body.toggle, false)

  if (toggle) {
    webContents.toggleDevTools()
  } else if (open === false) {
    webContents.closeDevTools()
  } else {
    webContents.openDevTools({mode: "detach", activate: true})
  }

  return hostState()
}

function reloadPage(body) {
  const win = ensureWindow()
  if (normalizeBoolean(body.ignoreCache, false) || normalizeBoolean(body.hard, false)) {
    win.webContents.reloadIgnoringCache()
  } else {
    win.webContents.reload()
  }
  return hostState()
}

function goBack() {
  const win = ensureWindow()
  if (win.webContents.navigationHistory?.canGoBack?.()) {
    win.webContents.navigationHistory.goBack()
  } else if (typeof win.webContents.canGoBack === "function" && win.webContents.canGoBack()) {
    win.webContents.goBack()
  }
  return hostState()
}

function goForward() {
  const win = ensureWindow()
  if (win.webContents.navigationHistory?.canGoForward?.()) {
    win.webContents.navigationHistory.goForward()
  } else if (typeof win.webContents.canGoForward === "function" && win.webContents.canGoForward()) {
    win.webContents.goForward()
  }
  return hostState()
}

function normalizeInputCoordinate(value, name, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > max) {
    const error = new Error(`${name} must be a number between 0 and ${max}`)
    error.statusCode = 400
    throw error
  }
  return Math.round(numeric)
}

function inputCoordinates(body) {
  return {
    x: normalizeInputCoordinate(body.x, "x", viewport.width),
    y: normalizeInputCoordinate(body.y, "y", viewport.height),
  }
}

function inputModifiers(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    const error = new Error("modifiers must be an array of strings")
    error.statusCode = 400
    throw error
  }
  return value
}

function sendInput(body) {
  const win = ensureWindow()
  const webContents = win.webContents
  const type = typeof body.type === "string" ? body.type : ""
  const modifiers = inputModifiers(body.modifiers)

  win.focus()
  webContents.focus()

  if (type === "focus") return {ok: true, input: {type}, state: hostState()}

  if (type === "text" || type === "type") {
    if (typeof body.text !== "string") {
      const error = new Error("text input requires string field 'text'")
      error.statusCode = 400
      throw error
    }
    webContents.insertText(body.text)
    return {ok: true, input: {type, textLength: body.text.length}, state: hostState()}
  }

  if (type === "keyDown" || type === "keyUp" || type === "char") {
    const keyCode = typeof body.keyCode === "string"
      ? body.keyCode
      : typeof body.key === "string"
        ? body.key
        : ""
    if (keyCode.length === 0) {
      const error = new Error("keyboard input requires 'keyCode' or 'key'")
      error.statusCode = 400
      throw error
    }
    webContents.sendInputEvent({type, keyCode, modifiers})
    return {ok: true, input: {type, keyCode, modifiers}, state: hostState()}
  }

  if (type === "wheel" || type === "mouseWheel") {
    const {x, y} = inputCoordinates(body)
    webContents.sendInputEvent({
      type: "mouseWheel",
      x,
      y,
      deltaX: Number(body.deltaX ?? body.dx ?? 0),
      deltaY: Number(body.deltaY ?? body.dy ?? 0),
      modifiers,
    })
    return {ok: true, input: {type: "mouseWheel", x, y, modifiers}, state: hostState()}
  }

  if (type === "click" || type === "doubleclick") {
    const {x, y} = inputCoordinates(body)
    const button = typeof body.button === "string" ? body.button : "left"
    const clickCount = type === "doubleclick" ? 2 : Math.max(1, Number(body.clickCount ?? 1))
    webContents.sendInputEvent({type: "mouseMove", x, y, modifiers})
    webContents.sendInputEvent({type: "mouseDown", x, y, button, clickCount, modifiers})
    webContents.sendInputEvent({type: "mouseUp", x, y, button, clickCount, modifiers})
    return {ok: true, input: {type, x, y, button, clickCount, modifiers}, state: hostState()}
  }

  if (type === "pointerMove" || type === "mouseMove" || type === "move") {
    const {x, y} = inputCoordinates(body)
    webContents.sendInputEvent({type: "mouseMove", x, y, modifiers})
    return {ok: true, input: {type: "mouseMove", x, y, modifiers}, state: hostState()}
  }

  if (type === "pointerDown" || type === "mouseDown" || type === "pointerUp" || type === "mouseUp") {
    const {x, y} = inputCoordinates(body)
    const eventType = type === "pointerDown" ? "mouseDown" : type === "pointerUp" ? "mouseUp" : type
    const button = typeof body.button === "string" ? body.button : "left"
    const clickCount = Math.max(1, Number(body.clickCount ?? 1))
    webContents.sendInputEvent({type: eventType, x, y, button, clickCount, modifiers})
    return {ok: true, input: {type: eventType, x, y, button, clickCount, modifiers}, state: hostState()}
  }

  const error = new Error("unsupported input type")
  error.statusCode = 400
  throw error
}

function hostState() {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const webContents = win && !win.webContents.isDestroyed() ? win.webContents : null
  const serverAddress = hostServer?.address()
  const resolvedHostPort =
    serverAddress && typeof serverAddress === "object" ? serverAddress.port : hostPort

  return {
    ok: true,
    mode: HOST_MODE ? "host" : "shell",
    pid: process.pid,
    uptimeMs: Math.round(process.uptime() * 1000),
    targetUrl,
    userDataDir: app.getPath("userData"),
    debugPort: DEBUG_PORT,
    host: {
      enabled: HOST_MODE,
      bind: HOST_BIND,
      port: resolvedHostPort,
      inFlight: activeHostRequests,
      maxInFlight: HOST_MAX_IN_FLIGHT,
      bodyLimitBytes: HOST_BODY_LIMIT_BYTES,
    },
    viewport: {...viewport},
    window: win
      ? {
          exists: true,
          id: win.id,
          bounds: win.getBounds(),
          visible: win.isVisible(),
          focused: win.isFocused(),
          minimized: win.isMinimized(),
          maximized: win.isMaximized(),
          fullScreen: win.isFullScreen(),
          devToolsOpened: webContents ? webContents.isDevToolsOpened() : false,
        }
      : {exists: false},
    page: {
      status: pageState.status,
      url: webContents ? webContents.getURL() : pageState.url,
      title: webContents ? webContents.getTitle() : pageState.title,
      loading: webContents ? webContents.isLoading() : false,
      frameId: frameSequence,
      crashed: pageState.crashed,
      lastError: pageState.lastError,
      lastLoadStartedAt: pageState.lastLoadStartedAt,
      lastLoadFinishedAt: pageState.lastLoadFinishedAt,
    },
    snapshot: {
      pending: snapshotCapture !== null,
    },
  }
}

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return

  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

function sendEmpty(res, statusCode, headers = {}) {
  if (res.writableEnded) return

  res.writeHead(statusCode, {
    "cache-control": "no-store",
    ...headers,
  })
  res.end()
}

async function readJsonBody(req) {
  let rawBody = ""

  for await (const chunk of req) {
    rawBody += chunk
    if (Buffer.byteLength(rawBody) > HOST_BODY_LIMIT_BYTES) {
      const error = new Error("Request body is too large")
      error.statusCode = 413
      throw error
    }
  }

  if (rawBody.trim() === "") return {}

  try {
    return JSON.parse(rawBody)
  } catch {
    const error = new Error("Request body must be valid JSON")
    error.statusCode = 400
    throw error
  }
}

function routeNotFound(res) {
  sendJson(res, 404, {
    ok: false,
    error: "Not found",
  })
}

async function sendSnapshot(req, res, requestUrl) {
  if (snapshotCapture !== null) {
    sendJson(res, 429, {
      ok: false,
      error: "Snapshot capture is already pending",
    })
    return
  }

  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  if (!win || win.webContents.isDestroyed()) {
    sendJson(res, 503, {
      ok: false,
      error: "Browser window is not available",
    })
    return
  }

  try {
    snapshotCapture = win.webContents.capturePage().then((image) => image.toPNG())
    const png = await snapshotCapture

    if (requestUrl.searchParams.get("format") === "json") {
      sendJson(res, 200, {
        ok: true,
        mimeType: "image/png",
        bytes: png.length,
        capturedAt: new Date().toISOString(),
        data: png.toString("base64"),
      })
      return
    }

    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "image/png",
      "content-length": png.length,
    })
    res.end(png)
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message,
    })
  } finally {
    snapshotCapture = null
  }
}

async function routeHostRequest(req, res) {
  const requestUrl = new URL(req.url || "/", "http://127.0.0.1")
  const endpoint = requestUrl.pathname

  if (req.method === "OPTIONS") {
    sendEmpty(res, 204, {
      allow: "GET,POST,OPTIONS",
    })
    return
  }

  if (req.method === "GET" && (endpoint === "/health" || endpoint === "/state")) {
    sendJson(res, 200, hostState())
    return
  }

  if (req.method === "POST" && (endpoint === "/navigate" || endpoint === "/url")) {
    const body = await readJsonBody(req)
    if (typeof body.url !== "string" || body.url.trim() === "") {
      sendJson(res, 400, {
        ok: false,
        error: "Expected JSON body with a non-empty url string",
      })
      return
    }

    setTargetUrlFromRequest(body.url)
    const win = ensureWindow()
    void loadTargetUrl(win).catch(logNavigationError)
    sendJson(res, 202, hostState())
    return
  }

  if (req.method === "POST" && endpoint === "/reload") {
    const body = await readJsonBody(req)
    sendJson(res, 202, reloadPage(body))
    return
  }

  if (req.method === "POST" && endpoint === "/back") {
    sendJson(res, 202, goBack())
    return
  }

  if (req.method === "POST" && endpoint === "/forward") {
    sendJson(res, 202, goForward())
    return
  }

  if (req.method === "POST" && endpoint === "/devtools") {
    const body = await readJsonBody(req)
    sendJson(res, 200, setDevTools(body))
    return
  }

  if (req.method === "POST" && endpoint === "/fullscreen") {
    const body = await readJsonBody(req)
    sendJson(res, 200, setFullscreen(body))
    return
  }

  if (req.method === "POST" && endpoint === "/viewport") {
    const body = await readJsonBody(req)
    updateViewport(body)
    sendJson(res, 200, hostState())
    return
  }

  if (req.method === "POST" && endpoint === "/input") {
    const body = await readJsonBody(req)
    sendJson(res, 200, sendInput(body))
    return
  }

  if (req.method === "POST" && endpoint === "/restart") {
    const body = await readJsonBody(req)
    if (typeof body.url === "string" && body.url.trim() !== "") {
      setTargetUrlFromRequest(body.url)
    }
    if (body.viewport && typeof body.viewport === "object") {
      updateViewport(body.viewport)
    }
    restartWindow()
    sendJson(res, 202, hostState())
    return
  }

  if ((req.method === "GET" || req.method === "POST") && endpoint === "/snapshot") {
    await sendSnapshot(req, res, requestUrl)
    return
  }

  routeNotFound(res)
}

function handleHostRequest(req, res) {
  if (activeHostRequests >= HOST_MAX_IN_FLIGHT) {
    sendJson(res, 429, {
      ok: false,
      error: "Too many in-flight requests",
    })
    return
  }

  activeHostRequests += 1
  res.on("close", () => {
    activeHostRequests -= 1
  })

  routeHostRequest(req, res).catch((error) => {
    const statusCode = error.statusCode || 500
    sendJson(res, statusCode, {
      ok: false,
      error: error.message,
    })
  })
}

function startHostServer() {
  hostServer = http.createServer(handleHostRequest)
  hostServer.maxConnections = 64
  hostServer.headersTimeout = 5000
  hostServer.requestTimeout = 30000
  hostServer.keepAliveTimeout = 5000

  return new Promise((resolve, reject) => {
    const onListenError = (error) => {
      reject(error)
    }

    hostServer.once("error", onListenError)
    hostServer.listen(HOST_PORT, HOST_BIND, () => {
      hostServer.off("error", onListenError)
      hostServer.on("error", (error) => {
        console.error("[metafor-electron] host API error:", error)
      })

      const address = hostServer.address()
      hostPort = address && typeof address === "object" ? address.port : HOST_PORT
      console.log(`[metafor-electron] host API listening on http://${HOST_BIND}:${hostPort}`)
      resolve()
    })
  })
}

app
  .whenReady()
  .then(async () => {
    await ensureMacMediaAccess()
    installPermissions(getAppSession())
    createWindow()
    if (HOST_MODE) await startHostServer()

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error) => {
    console.error("[metafor-electron] failed to start:", error)
    app.quit()
  })

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !HOST_MODE) app.quit()
})

app.on("before-quit", () => {
  if (hostServer) hostServer.close()
})
