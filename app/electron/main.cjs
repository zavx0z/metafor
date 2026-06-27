const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const {app, BrowserWindow, desktopCapturer, ipcMain, session, shell, systemPreferences} = require("electron")

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
const REMOTE_DESKTOP_PROFILE = (process.env.METAFOR_REMOTE_DESKTOP_PROFILE || "").trim().toLowerCase()
const REMOTE_DESKTOP_MODE = envFlag(process.env.METAFOR_REMOTE_DESKTOP)
  || REMOTE_DESKTOP_PROFILE === "ai-macos"
  || hasEnvValue(process.env.METAFOR_REMOTE_DESKTOP_SCREEN_API)
  || hasEnvValue(process.env.METAFOR_REMOTE_DESKTOP_WINDOW_API)
  || hasEnvValue(process.env.METAFOR_REMOTE_DESKTOP_INPUT_API)
  || hasEnvValue(process.env.METAFOR_REMOTE_DESKTOP_BROWSER_API)
const REMOTE_DESKTOP_RTC_MODE = envFlag(process.env.METAFOR_REMOTE_DESKTOP_RTC)
  || envFlag(process.env.METAFOR_REMOTE_DESKTOP_WEBRTC)
  || (REMOTE_DESKTOP_MODE && REMOTE_DESKTOP_PROFILE !== "ai-macos")
const REMOTE_DESKTOP_RTC_SIGNAL_URL = (process.env.METAFOR_REMOTE_DESKTOP_SIGNAL_URL || "ws://127.0.0.1:6500/webrtc/signaling").trim()
const REMOTE_DESKTOP_RTC_ROOM = (process.env.METAFOR_REMOTE_DESKTOP_RTC_ROOM || "remote-desktop").trim()
const REMOTE_DESKTOP_RTC_PEER_ID = (process.env.METAFOR_REMOTE_DESKTOP_RTC_PEER_ID || "electron-desktop").trim()
const REMOTE_DESKTOP_RTC_ICE_SERVERS = parseIceServers(
  process.env.METAFOR_REMOTE_DESKTOP_ICE_SERVERS || process.env.METAFOR_RTC_ICE_SERVERS,
  [{urls: "stun:stun.l.google.com:19302"}],
)
const REMOTE_DESKTOP_SENDER_ONLY = envFlag(process.env.METAFOR_REMOTE_DESKTOP_SENDER_ONLY)
const REMOTE_DESKTOP_RTC_SOURCE_KIND = (process.env.METAFOR_REMOTE_DESKTOP_CAPTURE_SOURCE || "screen").trim().toLowerCase()
const REMOTE_DESKTOP_RTC_SOURCE_NAME = (process.env.METAFOR_REMOTE_DESKTOP_CAPTURE_NAME || "").trim()
const REMOTE_DESKTOP_RTC_AUDIO_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_AUDIO === undefined
  ? REMOTE_DESKTOP_RTC_MODE
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_AUDIO)
const REMOTE_DESKTOP_RTC_AUDIO_SOURCE = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_SOURCE || "auto").trim().toLowerCase()
const REMOTE_DESKTOP_RTC_MAX_FPS = parseInteger(process.env.METAFOR_REMOTE_DESKTOP_RTC_MAX_FPS, "METAFOR_REMOTE_DESKTOP_RTC_MAX_FPS", 30, 1, 60)
const REMOTE_DESKTOP_RTC_UDP_PORT_RANGE = parseUdpPortRange(
  process.env.METAFOR_REMOTE_DESKTOP_UDP_PORT_RANGE || process.env.METAFOR_RTC_UDP_PORT_RANGE,
  "METAFOR_REMOTE_DESKTOP_UDP_PORT_RANGE",
)
const REMOTE_DESKTOP_RTC_PUBLIC_ICE_HOST = parseOptionalHostname(
  process.env.METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST || process.env.METAFOR_RTC_PUBLIC_ICE_HOST,
  "METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST",
)
const REMOTE_DESKTOP_RTC_ICE_INTERFACE = parseOptionalHostname(
  process.env.METAFOR_REMOTE_DESKTOP_ICE_INTERFACE || process.env.METAFOR_RTC_ICE_INTERFACE,
  "METAFOR_REMOTE_DESKTOP_ICE_INTERFACE",
)
const REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY = parseOptionalEnum(
  process.env.METAFOR_REMOTE_DESKTOP_IP_HANDLING_POLICY || process.env.METAFOR_RTC_IP_HANDLING_POLICY,
  "METAFOR_REMOTE_DESKTOP_IP_HANDLING_POLICY",
  [
    "default",
    "default_public_and_private_interfaces",
    "default_public_interface_only",
    "disable_non_proxied_udp",
  ],
)
const REMOTE_DESKTOP_SYSTEM_PICKER = envFlag(process.env.METAFOR_REMOTE_DESKTOP_SYSTEM_PICKER)
const REMOTE_DESKTOP_AUTO_SELECT_SOURCE = (process.env.METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE || "Entire Screen").trim()
const REMOTE_DESKTOP_APIS = remoteDesktopApis()
const REMOTE_DESKTOP_DIRECT_INPUT_API = localServiceUrl(
  process.env.METAFOR_REMOTE_DESKTOP_DIRECT_INPUT_API,
  null,
  "METAFOR_REMOTE_DESKTOP_DIRECT_INPUT_API",
)
const SESSION_PARTITION = HOST_MODE ? "persist:metafor-browser-host" : "persist:metafor"
const ELECTRON_WEBGPU_ENABLED = !envFalse(process.env.METAFOR_ELECTRON_WEBGPU)
const LINUX_HOST_NO_SANDBOX = process.platform === "linux"
  && HOST_MODE
  && !envFalse(process.env.METAFOR_ELECTRON_NO_SANDBOX)
const LINUX_HOST_DISABLE_GPU = process.platform === "linux"
  && HOST_MODE
  && !envFalse(process.env.METAFOR_ELECTRON_DISABLE_GPU)
const ELECTRON_OZONE_PLATFORM = (process.env.METAFOR_ELECTRON_OZONE_PLATFORM || process.env.ELECTRON_OZONE_PLATFORM_HINT || "").trim()

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
let remoteDesktopWindow = null
let remoteDesktopRtcPageConfig = null
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

const remoteDesktopRtcState = {
  enabled: REMOTE_DESKTOP_RTC_MODE,
  status: REMOTE_DESKTOP_RTC_MODE ? "starting" : "disabled",
  transport: "electron-webrtc",
  webRtc: REMOTE_DESKTOP_RTC_MODE,
  signalUrl: REMOTE_DESKTOP_RTC_SIGNAL_URL,
  iceServers: REMOTE_DESKTOP_RTC_ICE_SERVERS,
  udpPortRange: REMOTE_DESKTOP_RTC_UDP_PORT_RANGE,
  publicIceHost: REMOTE_DESKTOP_RTC_PUBLIC_ICE_HOST,
  iceInterface: REMOTE_DESKTOP_RTC_ICE_INTERFACE,
  ipHandlingPolicy: REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY,
  room: REMOTE_DESKTOP_RTC_ROOM,
  peerId: REMOTE_DESKTOP_RTC_PEER_ID,
  senderOnly: REMOTE_DESKTOP_SENDER_ONLY,
  capture: {
    preferredKind: REMOTE_DESKTOP_RTC_SOURCE_KIND === "screen" ? "screen" : "window",
    preferredName: REMOTE_DESKTOP_RTC_SOURCE_NAME || null,
  },
  audio: {
    enabled: REMOTE_DESKTOP_RTC_AUDIO_ENABLED,
    preferredSource: REMOTE_DESKTOP_RTC_AUDIO_SOURCE,
    effectiveSource: null,
    trackCount: 0,
    lastError: null,
  },
  systemPicker: {
    enabled: REMOTE_DESKTOP_SYSTEM_PICKER,
    autoSelectSource: REMOTE_DESKTOP_SYSTEM_PICKER ? REMOTE_DESKTOP_AUTO_SELECT_SOURCE : null,
  },
  source: null,
  peers: [],
  ice: {
    candidateCount: 0,
    candidateCounts: {},
    candidateAddressCounts: {},
    droppedCandidateCount: 0,
    lastCandidate: null,
    lastPublishedCandidate: null,
  },
  lastFrameAt: null,
  lastError: null,
  updatedAt: null,
}

configureChromiumCommandLine()

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

function envFalse(value) {
  if (!hasEnvValue(value)) return false
  return ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
}

function configureChromiumCommandLine() {
  const features = new Set()
  if (ELECTRON_WEBGPU_ENABLED) features.add("WebGPU")
  if (process.platform === "linux" && REMOTE_DESKTOP_RTC_MODE) {
    features.add("WebRTCPipeWireCapturer")
    if (ELECTRON_OZONE_PLATFORM.length > 0) features.add("UseOzonePlatform")
  }

  if (ELECTRON_WEBGPU_ENABLED) app.commandLine.appendSwitch("enable-unsafe-webgpu")
  app.commandLine.appendSwitch("ignore-gpu-blocklist")
  if (features.size > 0) app.commandLine.appendSwitch("enable-features", [...features].join(","))

  if (LINUX_HOST_NO_SANDBOX) app.commandLine.appendSwitch("no-sandbox")
  if (LINUX_HOST_DISABLE_GPU) {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch("disable-gpu")
    app.commandLine.appendSwitch("disable-gpu-compositing")
  }
  if (ELECTRON_OZONE_PLATFORM.length > 0) app.commandLine.appendSwitch("ozone-platform", ELECTRON_OZONE_PLATFORM)
  if (REMOTE_DESKTOP_RTC_MODE) {
    app.commandLine.appendSwitch("enable-usermedia-screen-capturing")
    if (REMOTE_DESKTOP_RTC_UDP_PORT_RANGE !== null) app.commandLine.appendSwitch("webrtc-udp-port-range", REMOTE_DESKTOP_RTC_UDP_PORT_RANGE)
    if (REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY !== null) app.commandLine.appendSwitch("force-webrtc-ip-handling-policy", REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY)
    if (REMOTE_DESKTOP_SYSTEM_PICKER && REMOTE_DESKTOP_AUTO_SELECT_SOURCE.length > 0) {
      app.commandLine.appendSwitch("auto-select-desktop-capture-source", REMOTE_DESKTOP_AUTO_SELECT_SOURCE)
    }
  }
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

function parseUdpPortRange(value, name) {
  if (!hasEnvValue(value)) return null
  const normalized = value.trim().replace(":", "-")
  const match = /^(\d{1,5})-(\d{1,5})$/.exec(normalized)
  if (match === null) throw new Error(`${name} must be a UDP port range like 40000-40100`)
  const first = Number(match[1])
  const last = Number(match[2])
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > 65535 || first > last) {
    throw new Error(`${name} must be a valid UDP port range`)
  }
  return `${first}-${last}`
}

function parseOptionalHostname(value, name) {
  if (!hasEnvValue(value)) return null
  const host = value.trim()
  if (host.length > 253 || !/^[a-zA-Z0-9_.:-]+$/.test(host)) {
    throw new Error(`${name} must be a hostname or IP address`)
  }
  return host
}

function parseOptionalEnum(value, name, allowed) {
  if (!hasEnvValue(value)) return null
  const normalized = value.trim()
  if (!allowed.includes(normalized)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`)
  }
  return normalized
}

function parseIceServers(value, fallback) {
  if (!hasEnvValue(value)) return fallback
  const raw = value.trim()
  try {
    const parsed = JSON.parse(raw)
    const servers = normalizeIceServers(parsed)
    if (servers.length > 0) return servers
  } catch {
    // Fall through to comma-separated URL form.
  }
  const servers = normalizeIceServers(raw.split(",").map((item) => item.trim()).filter(Boolean))
  return servers.length > 0 ? servers : fallback
}

function normalizeIceServers(value) {
  const items = Array.isArray(value) ? value : [value]
  return items.map(normalizeIceServer).filter(Boolean)
}

function normalizeIceServer(value) {
  if (typeof value === "string" && value.trim().length > 0) return {urls: value.trim()}
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const urls = normalizeIceServerUrls(value.urls)
  if (urls.length === 0) return null
  const server = {urls: urls.length === 1 ? urls[0] : urls}
  if (typeof value.username === "string") server.username = value.username
  if (typeof value.credential === "string") server.credential = value.credential
  if (value.credentialType === "password" || value.credentialType === "oauth") server.credentialType = value.credentialType
  return server
}

function normalizeIceServerUrls(value) {
  if (typeof value === "string") return value.trim().length > 0 ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
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

function remoteDesktopApis() {
  const aiMacos = REMOTE_DESKTOP_PROFILE === "ai-macos"
  return {
    screen: localServiceUrl(process.env.METAFOR_REMOTE_DESKTOP_SCREEN_API, aiMacos ? "http://127.0.0.1:7879" : null, "METAFOR_REMOTE_DESKTOP_SCREEN_API"),
    window: localServiceUrl(process.env.METAFOR_REMOTE_DESKTOP_WINDOW_API, aiMacos ? "http://127.0.0.1:7878" : null, "METAFOR_REMOTE_DESKTOP_WINDOW_API"),
    input: localServiceUrl(process.env.METAFOR_REMOTE_DESKTOP_INPUT_API, aiMacos ? "http://127.0.0.1:7882" : null, "METAFOR_REMOTE_DESKTOP_INPUT_API"),
    browser: localServiceUrl(process.env.METAFOR_REMOTE_DESKTOP_BROWSER_API, aiMacos ? "http://127.0.0.1:7880" : null, "METAFOR_REMOTE_DESKTOP_BROWSER_API"),
  }
}

function localServiceUrl(value, fallback, name) {
  const raw = hasEnvValue(value) ? value.trim() : fallback
  if (raw === null) return null
  const url = new URL(raw)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http: or https:`)
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`${name} must point to localhost, 127.0.0.0/8 or ::1`)
  }
  if (url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    throw new Error(`${name} must not include credentials, query or hash`)
  }
  return url
}

function setTargetUrl(url) {
  targetUrl = normalizeBrowserUrl(url)
  targetOrigin = new URL(targetUrl).origin
}

function isTrustedUrl(url) {
  try {
    const origin = new URL(url).origin
    return origin === targetOrigin || TRUSTED_ORIGINS.has(origin) || isHostOrigin(origin)
  } catch {
    return false
  }
}

function isHostOrigin(origin) {
  if (!HOST_MODE || hostPort === null) return false
  try {
    const url = new URL(origin)
    return Number(url.port) === hostPort && isLoopbackHost(url.hostname)
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

function configureWebRtcWebContents(webContents) {
  if (!REMOTE_DESKTOP_RTC_MODE) return
  if (REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY !== null && typeof webContents.setWebRTCIPHandlingPolicy === "function") {
    webContents.setWebRTCIPHandlingPolicy(REMOTE_DESKTOP_RTC_IP_HANDLING_POLICY)
  }
  if (REMOTE_DESKTOP_RTC_UDP_PORT_RANGE !== null && typeof webContents.setWebRTCUDPPortRange === "function") {
    webContents.setWebRTCUDPPortRange(udpPortRangeObject(REMOTE_DESKTOP_RTC_UDP_PORT_RANGE))
  }
}

function udpPortRangeObject(range) {
  const [min, max] = range.split("-", 2).map((value) => Number(value))
  return {min, max}
}

function installRemoteDesktopCaptureHandler(appSession) {
  if (!REMOTE_DESKTOP_RTC_MODE) return
  if (typeof appSession.setDisplayMediaRequestHandler !== "function") {
    remoteDesktopRtcState.status = "failed"
    remoteDesktopRtcState.lastError = "Electron session.setDisplayMediaRequestHandler is unavailable"
    return
  }
  appSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const source = await selectRemoteDesktopSource()
      const audio = remoteDesktopAudioTarget()
      remoteDesktopRtcState.source = sourceSummary(source)
      remoteDesktopRtcState.audio.effectiveSource = audio === null
        ? null
        : typeof audio === "string"
          ? audio
          : "browser-frame"
      remoteDesktopRtcState.audio.lastError = null
      remoteDesktopRtcState.updatedAt = new Date().toISOString()
      callback(audio === null ? {video: source} : {video: source, audio})
    } catch (error) {
      remoteDesktopRtcState.status = "failed"
      remoteDesktopRtcState.lastError = error.message
      remoteDesktopRtcState.updatedAt = new Date().toISOString()
      callback({})
    }
  }, {useSystemPicker: REMOTE_DESKTOP_SYSTEM_PICKER})
}

function remoteDesktopAudioTarget() {
  if (!REMOTE_DESKTOP_RTC_AUDIO_ENABLED) return null
  if (REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "off" || REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "none") return null
  if (REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "system" || REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "loopback") {
    return "loopback"
  }
  if (REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "loopback-with-mute") return "loopbackWithMute"
  if (REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "auto" && process.platform === "win32") return "loopback"

  const frame = mainWindow?.webContents?.mainFrame ?? null
  if (frame !== null && (
    REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "auto"
    || REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "browser"
    || REMOTE_DESKTOP_RTC_AUDIO_SOURCE === "browser-frame"
  )) {
    return frame
  }
  return null
}

async function selectRemoteDesktopSource() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: {width: 0, height: 0},
    fetchWindowIcons: false,
  })
  if (sources.length === 0) throw new Error("desktopCapturer returned no sources")

  const preferredKind = REMOTE_DESKTOP_RTC_SOURCE_KIND === "screen" ? "screen" : "window"
  const preferredName = REMOTE_DESKTOP_RTC_SOURCE_NAME.toLowerCase()
  const eligibleSources = sources.filter((source) => !source.name.toLowerCase().includes("remote desktop rtc"))
  const candidates = eligibleSources.length > 0 ? eligibleSources : sources
  const kindMatches = candidates.filter((source) => source.id.startsWith(`${preferredKind}:`))
  if (kindMatches.length === 0) {
    throw new Error(`desktopCapturer returned no ${preferredKind} sources: ${sourceListSummary(sources)}`)
  }
  if (preferredName.length === 0) return kindMatches[0]

  const named = kindMatches.find((source) => source.name.toLowerCase().includes(preferredName))
  if (named !== undefined) return named
  throw new Error(`desktopCapturer returned no ${preferredKind} source matching "${REMOTE_DESKTOP_RTC_SOURCE_NAME}": ${sourceListSummary(kindMatches)}`)
}

function sourceListSummary(sources) {
  return sources.map((source) => `${source.id}${source.name ? ` ${JSON.stringify(source.name)}` : ""}`).join(", ") || "none"
}

function sourceSummary(source) {
  return {
    id: source.id,
    kind: source.id.split(":")[0] || "unknown",
    name: source.name,
  }
}

function hostUrl(pathname) {
  const port = hostPort ?? HOST_PORT
  const host = HOST_BIND === "::1" ? "[::1]" : HOST_BIND === "localhost" ? "127.0.0.1" : HOST_BIND
  return `http://${host}:${port}${pathname}`
}

async function startRemoteDesktopRtc() {
  if (!REMOTE_DESKTOP_RTC_MODE) return
  if (remoteDesktopWindow !== null && !remoteDesktopWindow.isDestroyed()) return

  try {
    const source = await selectRemoteDesktopSource()
    remoteDesktopRtcState.status = "starting"
    remoteDesktopRtcState.source = sourceSummary(source)
    remoteDesktopRtcState.lastError = null
    remoteDesktopRtcState.updatedAt = new Date().toISOString()

    const win = new BrowserWindow({
      width: 640,
      height: 360,
      show: false,
      title: "MetaFor Remote Desktop RTC",
      webPreferences: {
        contextIsolation: true,
        devTools: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
        session: getAppSession(),
        preload: path.join(__dirname, "remote-desktop-preload.cjs"),
      },
    })
    remoteDesktopWindow = win
    configureWebRtcWebContents(win.webContents)
    win.on("closed", () => {
      if (remoteDesktopWindow === win) remoteDesktopWindow = null
      remoteDesktopRtcState.status = "closed"
      remoteDesktopRtcState.updatedAt = new Date().toISOString()
    })
    const config = {
      signalUrl: REMOTE_DESKTOP_RTC_SIGNAL_URL,
      room: REMOTE_DESKTOP_RTC_ROOM,
      peerId: REMOTE_DESKTOP_RTC_PEER_ID,
      iceServers: REMOTE_DESKTOP_RTC_ICE_SERVERS,
      sourceId: source.id,
      maxFps: REMOTE_DESKTOP_RTC_MAX_FPS,
      udpPortRange: REMOTE_DESKTOP_RTC_UDP_PORT_RANGE,
      publicIceHost: REMOTE_DESKTOP_RTC_PUBLIC_ICE_HOST,
      iceInterface: REMOTE_DESKTOP_RTC_ICE_INTERFACE,
      audio: REMOTE_DESKTOP_RTC_AUDIO_ENABLED,
    }
    remoteDesktopRtcPageConfig = config
    await win.loadURL(remoteDesktopRtcPageUrl(config))
  } catch (error) {
    remoteDesktopRtcState.status = "failed"
    remoteDesktopRtcState.lastError = error.message
    remoteDesktopRtcState.updatedAt = new Date().toISOString()
    console.error("[metafor-electron] remote desktop RTC failed:", error)
  }
}

function restartRemoteDesktopRtc() {
  const oldWindow = remoteDesktopWindow
  remoteDesktopWindow = null
  remoteDesktopRtcPageConfig = null
  if (oldWindow !== null && !oldWindow.isDestroyed()) oldWindow.destroy()
  return startRemoteDesktopRtc()
}

function remoteDesktopRtcPageUrl(config) {
  if (HOST_MODE && hostPort !== null) return hostUrl("/desktop/rtc/sender")
  return `data:text/html;charset=utf-8,${encodeURIComponent(remoteDesktopRtcPageHtml(config))}`
}

function remoteDesktopRtcPageHtml(config) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>MetaFor Remote Desktop RTC</title></head>
<body>
<video id="capture" autoplay muted playsinline style="width:1px;height:1px;opacity:0"></video>
<script>
const config = ${JSON.stringify(config)};
const state = {peers: [], status: "booting"};
const video = document.getElementById("capture");
let socket = null;
let stream = null;
const peers = new Map();

function postState(patch) {
  Object.assign(state, patch, {updatedAt: new Date().toISOString()});
  window.metaforRemoteDesktop?.state?.(state);
}

function signalUrl() {
  const url = new URL(config.signalUrl);
  url.searchParams.set("room", config.room);
  url.searchParams.set("peer", config.peerId);
  return url.toString();
}

async function start() {
  postState({status: "capturing"});
  stream = await captureStream();
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  postState({status: "signaling", tracks: trackSummary(), audio: audioSummary()});
  connectSignal();
}

async function captureStream() {
  if (navigator.mediaDevices?.getDisplayMedia !== undefined) {
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {frameRate: {max: config.maxFps}},
        audio: config.audio,
      });
    } catch (error) {
      postState({status: "capture-fallback", lastError: String(error?.message || error)});
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: config.audio ? {mandatory: {chromeMediaSource: "desktop"}} : false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: config.sourceId,
          maxFrameRate: config.maxFps,
        },
      },
    });
  } catch (error) {
    if (!config.audio) throw error;
    postState({status: "audio-fallback", lastError: String(error?.message || error)});
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: config.sourceId,
        maxFrameRate: config.maxFps,
      },
    },
  });
}

function trackSummary() {
  return {
    audio: stream?.getAudioTracks?.().length || 0,
    video: stream?.getVideoTracks?.().length || 0,
  };
}

function audioSummary() {
  const tracks = stream?.getAudioTracks?.() || [];
  return {
    enabled: Boolean(config.audio),
    trackCount: tracks.length,
    muted: tracks.some((track) => track.muted),
    readyState: tracks.map((track) => track.readyState),
  };
}

function connectSignal() {
  socket = new WebSocket(signalUrl());
  socket.addEventListener("open", () => postState({status: "signaling-open"}));
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    let message = null;
    try { message = JSON.parse(event.data); } catch { return; }
    void handleSignal(message);
  });
  socket.addEventListener("close", () => {
    closeAllPeers();
    postState({status: "signaling-closed", peers: []});
    setTimeout(connectSignal, 1000);
  });
  socket.addEventListener("error", () => postState({status: "signaling-error"}));
}

async function handleSignal(message) {
  if (message.type === "hello") {
    postState({status: "ready", peerId: message.peerId, room: message.room});
    return;
  }
  if (message.type === "peer-left") {
    closePeer(message.peerId);
    return;
  }
  if (message.from === config.peerId || typeof message.from !== "string") return;
  const peer = createPeer(message.from);
  if (message.type === "offer") {
    await peer.connection.setRemoteDescription(message.description);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    sendSignal({type: "answer", to: message.from, description: publishSessionDescription(peer.connection.localDescription)});
    return;
  }
  if (message.type === "ice") {
    await peer.connection.addIceCandidate(message.candidate).catch(() => undefined);
  }
}

function createPeer(peerId) {
  const existing = peers.get(peerId);
  if (existing !== undefined) return existing;
  const connection = new RTCPeerConnection({iceServers: config.iceServers});
  for (const track of stream.getTracks()) connection.addTrack(track, stream);
  const peer = {id: peerId, connection, channel: null};
  peers.set(peerId, peer);
  connection.addEventListener("icecandidate", (event) => {
    if (event.candidate === null) return;
    const candidate = event.candidate.toJSON();
    const publishedCandidate = publishIceCandidate(candidate);
    postState({
      iceCandidate: iceCandidateSummary(candidate),
      ...(publishedCandidate === null ? {droppedIceCandidate: true} : {publishedIceCandidate: iceCandidateSummary(publishedCandidate)}),
    });
    if (publishedCandidate !== null) sendSignal({type: "ice", to: peerId, candidate: publishedCandidate});
  });
  connection.addEventListener("connectionstatechange", () => {
    postState({status: connection.connectionState, peers: peerSnapshots()});
    if (connection.connectionState === "failed" || connection.connectionState === "closed") closePeer(peerId);
  });
  connection.addEventListener("iceconnectionstatechange", () => {
    postState({status: "ice-" + connection.iceConnectionState, peers: peerSnapshots()});
  });
  connection.addEventListener("icegatheringstatechange", () => {
    postState({status: "ice-gathering-" + connection.iceGatheringState, peers: peerSnapshots()});
  });
  connection.addEventListener("datachannel", (event) => attachDataChannel(peer, event.channel));
  postState({status: "peer", peers: peerSnapshots()});
  return peer;
}

function attachDataChannel(peer, channel) {
  peer.channel = channel;
  channel.addEventListener("open", () => {
    channel.send(JSON.stringify({type: "hello", peerId: config.peerId, role: "electron-desktop"}));
    postState({status: "control-open", peers: peerSnapshots()});
  });
  channel.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    let command = null;
    try { command = JSON.parse(event.data); } catch { return; }
    void handleControl(peer, channel, command);
  });
  channel.addEventListener("close", () => {
    if (peer.channel === channel) peer.channel = null;
    postState({status: "control-closed", peers: peerSnapshots()});
  });
}

async function handleControl(peer, channel, command) {
  if (command?.type === "hello") {
    channel.send(JSON.stringify({type: "control-result", command: "hello", ok: true}))
    return
  }
  try {
    const result = await window.metaforRemoteDesktop.input(command);
    channel.send(JSON.stringify({type: "control-result", command: command.type || "input", ok: true, result}));
  } catch (error) {
    channel.send(JSON.stringify({type: "control-result", command: command.type || "input", ok: false, error: String(error?.message || error)}));
  }
}

function closePeer(peerId) {
  const peer = peers.get(peerId);
  if (peer === undefined) return;
  peers.delete(peerId);
  peer.channel?.close();
  peer.connection.close();
  postState({status: "peer-left", peers: peerSnapshots()});
}

function closeAllPeers() {
  for (const peerId of [...peers.keys()]) closePeer(peerId);
}

function peerSnapshots() {
  return [...peers.values()].map((peer) => ({
    id: peer.id,
    connectionState: peer.connection.connectionState,
    channelState: peer.channel?.readyState || "none",
  }));
}

function sendSignal(payload) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function publishSessionDescription(description) {
  if (description === null || typeof description !== "object" || typeof description.sdp !== "string") return description;
  const sdp = rewriteIceCandidateText(description.sdp);
  return sdp === description.sdp ? description : {...description, sdp};
}

function publishIceCandidate(candidate) {
  if (candidate === null || typeof candidate !== "object" || typeof candidate.candidate !== "string") return candidate;
  const candidateLine = rewriteIceCandidateLine(candidate.candidate);
  if (candidateLine === null) return null;
  return candidateLine === candidate.candidate ? candidate : {...candidate, candidate: candidateLine};
}

function rewriteIceCandidateText(text) {
  if (!config.publicIceHost && !config.iceInterface) return text;
  return text
    .split("\\r\\n")
    .map((line) => {
      if (!line.startsWith("a=candidate:")) return line;
      const candidateLine = rewriteIceCandidateLine(line.slice(2));
      return candidateLine === null ? null : "a=" + candidateLine;
    })
    .filter((line) => line !== null)
    .join("\\r\\n");
}

function rewriteIceCandidateLine(line) {
  if (!config.publicIceHost && !config.iceInterface) return line;
  const parts = String(line || "").trim().split(/\\s+/);
  if (!parts[0]?.startsWith("candidate:")) return line;
  const protocol = String(parts[2] || "").toLowerCase();
  const type = candidateField(parts, "typ");
  const address = String(parts[4] || "");
  const port = Number(parts[5]) || 0;
  if (type !== "host") return line;
  if (protocol !== "udp" || port <= 0) return null;
  if (!candidatePortInRange(port, config.udpPortRange)) return null;
  if (config.iceInterface && address !== config.iceInterface && !config.publicIceHost) return null;
  if (config.publicIceHost) parts[4] = config.publicIceHost;
  return parts.join(" ");
}

function candidatePortInRange(port, range) {
  if (!range) return true;
  const [min, max] = String(range).split("-", 2).map((value) => Number(value));
  return Number.isInteger(min) && Number.isInteger(max) && port >= min && port <= max;
}

function iceCandidateSummary(candidate) {
  const text = String(candidate?.candidate || "");
  const parts = text.split(/\\s+/);
  return {
    type: candidateField(parts, "typ"),
    protocol: parts[2] || null,
    address: parts[4] || null,
    port: Number(parts[5]) || null,
    relatedAddress: candidateField(parts, "raddr"),
    relatedPort: Number(candidateField(parts, "rport")) || null,
  };
}

function candidateField(parts, key) {
  const index = parts.indexOf(key);
  return index >= 0 && index + 1 < parts.length ? parts[index + 1] : null;
}

start().catch((error) => postState({status: "failed", lastError: String(error?.message || error)}));
</script>
</body>
</html>`
}

function updateRemoteDesktopRtcState(patch) {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return
  if (typeof patch.status === "string") remoteDesktopRtcState.status = patch.status
  if (typeof patch.lastError === "string") remoteDesktopRtcState.lastError = patch.lastError
  if (typeof patch.peerId === "string") remoteDesktopRtcState.peerId = patch.peerId
  if (typeof patch.room === "string") remoteDesktopRtcState.room = patch.room
  if (Array.isArray(patch.peers)) remoteDesktopRtcState.peers = patch.peers
  if (typeof patch.iceCandidate === "object" && patch.iceCandidate !== null && !Array.isArray(patch.iceCandidate)) {
    remoteDesktopRtcState.ice.candidateCount += 1
    const candidateKey = iceDiagnosticKey(patch.iceCandidate)
    remoteDesktopRtcState.ice.candidateCounts[candidateKey] = (remoteDesktopRtcState.ice.candidateCounts[candidateKey] ?? 0) + 1
    const candidateAddressKey = iceDiagnosticAddressKey(patch.iceCandidate)
    remoteDesktopRtcState.ice.candidateAddressCounts[candidateAddressKey] = (remoteDesktopRtcState.ice.candidateAddressCounts[candidateAddressKey] ?? 0) + 1
    remoteDesktopRtcState.ice.lastCandidate = patch.iceCandidate
  }
  if (typeof patch.publishedIceCandidate === "object" && patch.publishedIceCandidate !== null && !Array.isArray(patch.publishedIceCandidate)) {
    remoteDesktopRtcState.ice.lastPublishedCandidate = patch.publishedIceCandidate
  }
  if (patch.droppedIceCandidate === true) {
    remoteDesktopRtcState.ice.droppedCandidateCount += 1
  }
  if (typeof patch.audio === "object" && patch.audio !== null && !Array.isArray(patch.audio)) {
    if (typeof patch.audio.trackCount === "number") remoteDesktopRtcState.audio.trackCount = patch.audio.trackCount
    if (typeof patch.audio.lastError === "string") remoteDesktopRtcState.audio.lastError = patch.audio.lastError
  }
  if (typeof patch.tracks === "object" && patch.tracks !== null && !Array.isArray(patch.tracks)) {
    if (typeof patch.tracks.audio === "number") remoteDesktopRtcState.audio.trackCount = patch.tracks.audio
  }
  remoteDesktopRtcState.updatedAt = new Date().toISOString()
  if (patch.status === "connected" || patch.status === "control-open") {
    remoteDesktopRtcState.lastFrameAt = new Date().toISOString()
  }
}

function iceDiagnosticKey(candidate) {
  const protocol = typeof candidate.protocol === "string" ? candidate.protocol.toLowerCase() : "unknown"
  const type = typeof candidate.type === "string" ? candidate.type.toLowerCase() : "unknown"
  return `${protocol}:${type}`
}

function iceDiagnosticAddressKey(candidate) {
  const address = typeof candidate.address === "string" && candidate.address.length > 0 ? candidate.address : "unknown"
  const protocol = typeof candidate.protocol === "string" ? candidate.protocol.toLowerCase() : "unknown"
  const type = typeof candidate.type === "string" ? candidate.type.toLowerCase() : "unknown"
  return `${protocol}:${type}:${address}`
}

function installRemoteDesktopIpc() {
  ipcMain.handle("remote-desktop:input", async (_event, body) => {
    return await sendRemoteDesktopInput(body)
  })
  ipcMain.on("remote-desktop:state", (_event, patch) => {
    updateRemoteDesktopRtcState(patch)
  })
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

function normalizeInputCoordinate(value, name, max, frameMax) {
  const raw = Number(value)
  const sourceMax = Number(frameMax)
  const numeric = Number.isFinite(sourceMax) && sourceMax > 0 && sourceMax !== max
    ? (raw / sourceMax) * max
    : raw
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > max) {
    const error = new Error(`${name} must be a number between 0 and ${max}`)
    error.statusCode = 400
    throw error
  }
  return Math.round(numeric)
}

function inputCoordinates(body) {
  return {
    x: normalizeInputCoordinate(body.x, "x", viewport.width, body.frameW),
    y: normalizeInputCoordinate(body.y, "y", viewport.height, body.frameH),
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
    chromium: {
      noSandbox: LINUX_HOST_NO_SANDBOX,
      disableGpu: LINUX_HOST_DISABLE_GPU,
      ozonePlatform: ELECTRON_OZONE_PLATFORM || null,
      remoteDesktopSystemPicker: REMOTE_DESKTOP_SYSTEM_PICKER,
      remoteDesktopAutoSelectSource: REMOTE_DESKTOP_SYSTEM_PICKER ? REMOTE_DESKTOP_AUTO_SELECT_SOURCE : null,
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
    remoteDesktop: {
      ...remoteDesktopRtcState,
      window: remoteDesktopWindow !== null && !remoteDesktopWindow.isDestroyed()
        ? {
            exists: true,
            id: remoteDesktopWindow.id,
            crashed: remoteDesktopWindow.webContents.isCrashed?.() ?? false,
            destroyed: remoteDesktopWindow.webContents.isDestroyed(),
          }
        : {exists: false},
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

function remoteDesktopApiSummary() {
  return {
    ...Object.fromEntries(Object.entries(REMOTE_DESKTOP_APIS).map(([key, url]) => [key, url === null ? null : url.toString()])),
    directInput: REMOTE_DESKTOP_DIRECT_INPUT_API === null ? null : REMOTE_DESKTOP_DIRECT_INPUT_API.toString(),
  }
}

function desktopTargetUrl(baseUrl, upstreamPath, search = "") {
  const target = new URL(baseUrl.toString())
  const basePath = target.pathname.replace(/\/+$/, "")
  const cleanPath = upstreamPath.startsWith("/") ? upstreamPath : `/${upstreamPath}`
  target.pathname = `${basePath}${cleanPath}`.replace(/\/{2,}/g, "/")
  target.search = search
  target.hash = ""
  return target
}

function desktopApiRequired(name) {
  const api = REMOTE_DESKTOP_APIS[name]
  if (api !== null) return api
  const error = new Error(`remote desktop ${name} adapter is not configured`)
  error.statusCode = 503
  throw error
}

async function fetchDesktopJson(name, upstreamPath, init = {}) {
  const api = desktopApiRequired(name)
  const target = desktopTargetUrl(api, upstreamPath)
  const response = await fetch(target, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body === undefined ? {} : {"content-type": "application/json"}),
      ...(init.headers || {}),
    },
  })
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "")
  if (!response.ok) {
    const error = new Error(typeof payload === "string" ? payload : JSON.stringify(payload))
    error.statusCode = response.status
    throw error
  }
  return payload
}

async function remoteDesktopHealth() {
  const services = {}
  await Promise.all(Object.entries(REMOTE_DESKTOP_APIS).map(async ([name, api]) => {
    if (api === null) {
      services[name] = {configured: false, ok: false}
      return
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      const response = await fetch(desktopTargetUrl(api, "/health"), {signal: controller.signal})
      clearTimeout(timer)
      const payload = await response.json().catch(() => null)
      services[name] = {configured: true, ok: response.ok, url: api.toString(), status: response.status, payload}
    } catch (error) {
      services[name] = {configured: true, ok: false, url: api.toString(), error: error.message}
    }
  }))
  return {
    ok: true,
    enabled: REMOTE_DESKTOP_MODE,
    profile: REMOTE_DESKTOP_PROFILE || null,
    apis: remoteDesktopApiSummary(),
    services,
    fallback: REMOTE_DESKTOP_APIS.screen === null || REMOTE_DESKTOP_APIS.input === null,
    host: hostState(),
  }
}

async function sendRemoteDesktopSnapshot(req, res, requestUrl) {
  const screenApi = REMOTE_DESKTOP_APIS.screen
  if (screenApi === null) {
    await sendSnapshot(req, res, requestUrl)
    return
  }

  const target = requestUrl.searchParams.get("target") || "desktop"
  const appName = requestUrl.searchParams.get("app") || "Google Chrome"
  const upstreamPath = target === "browser"
    ? `/window?app=${encodeURIComponent(appName)}${requestUrl.searchParams.get("detail") === null ? "" : `&detail=${encodeURIComponent(requestUrl.searchParams.get("detail"))}`}`
    : target === "window"
      ? `/window${requestUrl.search}`
      : target === "rect"
        ? "/rect"
        : `/desktop${target === "desktop" ? requestUrl.search : ""}`

  if (req.method === "GET" && target === "rect") {
    sendJson(res, 400, {ok: false, error: "GET /desktop/snapshot target=rect requires POST body"})
    return
  }

  const init = {method: req.method}
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.headers = {"content-type": req.headers["content-type"] || "application/json"}
    init.body = await readRawBody(req)
  }
  const upstream = await fetch(desktopTargetUrl(screenApi, upstreamPath), init)
  await sendUpstreamResponse(res, upstream)
}

async function readRawBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > HOST_BODY_LIMIT_BYTES) {
      const error = new Error("Request body is too large")
      error.statusCode = 413
      throw error
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function sendUpstreamResponse(res, upstream) {
  const body = Buffer.from(await upstream.arrayBuffer())
  const headers = {
    "cache-control": upstream.headers.get("cache-control") || "no-store",
    "content-type": upstream.headers.get("content-type") || "application/octet-stream",
    "content-length": body.length,
  }
  for (const name of ["x-meta-screen-target", "x-meta-window-app", "x-meta-window-index", "x-meta-window-title", "x-meta-caption"]) {
    const value = upstream.headers.get(name)
    if (value !== null) headers[name] = value
  }
  res.writeHead(upstream.status, headers)
  res.end(body)
}

async function sendRemoteDesktopInput(body) {
  if (REMOTE_DESKTOP_DIRECT_INPUT_API !== null) {
    return await fetchDirectDesktopInput(body)
  }

  if (REMOTE_DESKTOP_APIS.input === null && REMOTE_DESKTOP_APIS.window === null) {
    return sendInput(body)
  }

  const type = typeof body.type === "string" ? body.type : ""
  if (type === "focus") {
    const appName = typeof body.app === "string" ? body.app : "Google Chrome"
    return await fetchDesktopJson("window", "/focus", {
      method: "POST",
      body: JSON.stringify({app: appName}),
    })
  }
  if (type === "move" || type === "pointerMove" || type === "mouseMove") {
    return await fetchDesktopJson("input", "/mouse/move", {
      method: "POST",
      body: JSON.stringify({x: body.x, y: body.y}),
    })
  }
  if (type === "click" || type === "doubleclick") {
    return await fetchDesktopJson("input", "/mouse/click", {
      method: "POST",
      body: JSON.stringify({x: body.x, y: body.y, button: body.button, count: type === "doubleclick" ? 2 : body.count ?? body.clickCount}),
    })
  }
  if (type === "drag") {
    return await fetchDesktopJson("input", "/mouse/drag", {method: "POST", body: JSON.stringify(body)})
  }
  if (type === "wheel" || type === "mouseWheel" || type === "scroll") {
    return await fetchDesktopJson("input", "/mouse/scroll", {
      method: "POST",
      body: JSON.stringify({dx: body.dx ?? body.deltaX, dy: body.dy ?? body.deltaY}),
    })
  }
  if (type === "text" || type === "type") {
    return await fetchDesktopJson("input", "/keyboard/type", {
      method: "POST",
      body: JSON.stringify({text: body.text, delayMs: body.delayMs}),
    })
  }
  if (type === "shortcut") {
    return await fetchDesktopJson("input", "/keyboard/shortcut", {
      method: "POST",
      body: JSON.stringify({shortcut: body.shortcut, sequence: body.sequence, delayMs: body.delayMs}),
    })
  }
  if (type === "key" || type === "keyDown" || type === "keyUp" || type === "char") {
    return await fetchDesktopJson("input", "/keyboard/key", {
      method: "POST",
      body: JSON.stringify({key: body.key ?? body.keyCode, modifiers: body.modifiers}),
    })
  }

  const error = new Error("unsupported remote desktop input type")
  error.statusCode = 400
  throw error
}

async function fetchDirectDesktopInput(body) {
  const response = await fetch(REMOTE_DESKTOP_DIRECT_INPUT_API, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const contentType = response.headers.get("content-type") || ""
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "")
  if (!response.ok) {
    const error = new Error(typeof payload === "string" ? payload : JSON.stringify(payload))
    error.statusCode = response.status
    throw error
  }
  return payload
}

async function proxyRemoteDesktopBrowser(req, res, requestUrl) {
  const browserApi = REMOTE_DESKTOP_APIS.browser
  const action = requestUrl.pathname.slice("/desktop/browser".length) || "/windows"
  if (browserApi === null) {
    if (req.method === "POST" && (action === "/open" || action === "/navigate")) {
      const body = await readJsonBody(req)
      if (typeof body.url !== "string" || body.url.trim() === "") {
        sendJson(res, 400, {ok: false, error: "Expected JSON body with a non-empty url string"})
        return
      }
      setTargetUrlFromRequest(body.url)
      void loadTargetUrl(ensureWindow()).catch(logNavigationError)
      sendJson(res, 202, hostState())
      return
    }
    sendJson(res, 503, {ok: false, error: "remote desktop browser adapter is not configured"})
    return
  }

  const upstreamPath = action === "/open" ? "/windows" : action
  const init = {method: req.method}
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.headers = {"content-type": req.headers["content-type"] || "application/json"}
    init.body = await readRawBody(req)
  }
  const upstream = await fetch(desktopTargetUrl(browserApi, upstreamPath, requestUrl.search), init)
  await sendUpstreamResponse(res, upstream)
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

  if (req.method === "GET" && endpoint === "/desktop/health") {
    sendJson(res, 200, await remoteDesktopHealth())
    return
  }

  if (req.method === "GET" && endpoint === "/desktop/rtc/state") {
    sendJson(res, 200, {ok: true, remoteDesktop: hostState().remoteDesktop})
    return
  }

  if (req.method === "GET" && endpoint === "/desktop/rtc/sender") {
    const config = remoteDesktopRtcPageConfig
    if (config === null) {
      sendJson(res, 503, {ok: false, error: "remote desktop RTC page is not configured"})
      return
    }
    const html = remoteDesktopRtcPageHtml(config)
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(html),
    })
    res.end(html)
    return
  }

  if (req.method === "POST" && endpoint === "/desktop/rtc/restart") {
    await restartRemoteDesktopRtc()
    sendJson(res, 202, {ok: true, remoteDesktop: hostState().remoteDesktop})
    return
  }

  if ((req.method === "GET" || req.method === "POST") && endpoint === "/desktop/snapshot") {
    await sendRemoteDesktopSnapshot(req, res, requestUrl)
    return
  }

  if (req.method === "POST" && endpoint === "/desktop/input") {
    const body = await readJsonBody(req)
    sendJson(res, 200, await sendRemoteDesktopInput(body))
    return
  }

  if (endpoint === "/desktop/browser" || endpoint.startsWith("/desktop/browser/")) {
    await proxyRemoteDesktopBrowser(req, res, requestUrl)
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
    console.log("[metafor-electron] ready", JSON.stringify({
      platform: process.platform,
      hostMode: HOST_MODE,
      remoteDesktopRtc: REMOTE_DESKTOP_RTC_MODE,
      remoteDesktopSenderOnly: REMOTE_DESKTOP_SENDER_ONLY,
      noSandbox: LINUX_HOST_NO_SANDBOX,
      disableGpu: LINUX_HOST_DISABLE_GPU,
      ozonePlatform: ELECTRON_OZONE_PLATFORM || null,
      systemPicker: REMOTE_DESKTOP_SYSTEM_PICKER,
    }))
    await ensureMacMediaAccess()
    const appSession = getAppSession()
    installPermissions(appSession)
    installRemoteDesktopCaptureHandler(appSession)
    installRemoteDesktopIpc()
    if (HOST_MODE) await startHostServer()
    if (!REMOTE_DESKTOP_SENDER_ONLY) createWindow()
    if (REMOTE_DESKTOP_RTC_MODE) {
      setTimeout(() => {
        void startRemoteDesktopRtc()
      }, 500)
    }

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
  if (remoteDesktopWindow !== null && !remoteDesktopWindow.isDestroyed()) remoteDesktopWindow.destroy()
})
