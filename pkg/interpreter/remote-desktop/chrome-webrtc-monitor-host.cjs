const {spawn, spawnSync} = require("node:child_process")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")

const HOST = process.env.METAFOR_REMOTE_DESKTOP_HOST_BIND || "127.0.0.1"
const PORT = Number(process.env.METAFOR_REMOTE_DESKTOP_HOST_PORT || 32133)
const WIDTH = Number(process.env.METAFOR_REMOTE_DESKTOP_WIDTH || 1920)
const HEIGHT = Number(process.env.METAFOR_REMOTE_DESKTOP_HEIGHT || 1080)
const FPS = Number(process.env.METAFOR_REMOTE_DESKTOP_RTC_FPS || 30)
const VIDEO_BITRATE = Number(process.env.METAFOR_REMOTE_DESKTOP_VIDEO_BITRATE || process.env.METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE || 8_000_000)
const VIDEO_CODEC = normalizeChromeVideoCodec(process.env.METAFOR_REMOTE_DESKTOP_RTC_VIDEO_CODEC || "")
const VIDEO_CONTENT_HINT = normalizeChromeVideoContentHint(process.env.METAFOR_REMOTE_DESKTOP_RTC_CONTENT_HINT || "detail")
const AUDIO_TARGET = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_TARGET || "").trim()
const AUDIO_UNMUTE = process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE === undefined
  ? true
  : !["0", "false", "no", "off"].includes(process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE.trim().toLowerCase())
const AUDIO_VOLUME = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_VOLUME || "0.70").trim()
const TARGET_URL = process.env.METAFOR_URL || "https://meta.proizvodstvo1.ru/"
const TARGET_HTTP_ORIGIN = targetHttpOrigin(TARGET_URL)
const TARGET_WS_ORIGIN = targetWebSocketOrigin(TARGET_URL)
const CHROME_RTC_INTERPRETER_PREFIX = normalizePathPrefix(process.env.METAFOR_REMOTE_DESKTOP_INTERPRETER_PREFIX || "/hud/interpreter")
const CHROME_RTC_SIGNAL_URL = process.env.METAFOR_REMOTE_DESKTOP_SIGNAL_URL || `${TARGET_WS_ORIGIN}${CHROME_RTC_INTERPRETER_PREFIX}/webrtc/signaling`
const CHROME_RTC_INPUT_URL = process.env.METAFOR_REMOTE_DESKTOP_INPUT_URL || `http://${HOST}:${PORT}/desktop/input`
const CHROME_RTC_AUDIO_PCM_URL = process.env.METAFOR_REMOTE_DESKTOP_AUDIO_PCM_URL || `http://${HOST}:${PORT}/desktop/audio.pcm`
const CHROME_RTC_SENDER_URL = process.env.METAFOR_REMOTE_DESKTOP_CHROME_RTC_SENDER_URL || `http://${HOST}:${PORT}/desktop/rtc/sender`
const CHROME = process.env.METAFOR_REMOTE_DESKTOP_BROWSER || "google-chrome"
const CHROME_DEBUG_PORT = Number(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEBUG_PORT || 9341)
const CHROME_OZONE_PLATFORM = (process.env.METAFOR_REMOTE_DESKTOP_CHROME_OZONE_PLATFORM || "wayland").trim()
const CHROME_DEBUG_BASE_URLS = [`http://127.0.0.1:${CHROME_DEBUG_PORT}`, `http://[::1]:${CHROME_DEBUG_PORT}`]
const CDP_TIMEOUT_MS = Number(process.env.METAFOR_REMOTE_DESKTOP_CDP_TIMEOUT_MS || 3000)
const HELPER_INPUT_TIMEOUT_MS = Number(process.env.METAFOR_REMOTE_DESKTOP_INPUT_TIMEOUT_MS || 7000)
const PROFILE_DIR = process.env.METAFOR_REMOTE_DESKTOP_BROWSER_PROFILE || `/tmp/metafor-remote-desktop-chrome-${process.pid}`
const CHROME_RTC_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_CHROME_RTC === undefined
  ? true
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_RTC)
const MANAGED_BROWSER_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_MANAGED_BROWSER === undefined
  ? CHROME_RTC_ENABLED
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_MANAGED_BROWSER)
const CHROME_RTC_ROOM = process.env.METAFOR_REMOTE_DESKTOP_RTC_ROOM || "remote-desktop"
const CHROME_RTC_PEER_ID = process.env.METAFOR_REMOTE_DESKTOP_RTC_PEER_ID || "remote-desktop-host"
const CHROME_RTC_UDP_PORT_RANGE = process.env.METAFOR_REMOTE_DESKTOP_UDP_PORT_RANGE || process.env.METAFOR_RTC_UDP_PORT_RANGE || "40000-40100"
const CHROME_RTC_PUBLIC_ICE_HOST = process.env.METAFOR_REMOTE_DESKTOP_PUBLIC_ICE_HOST || process.env.METAFOR_RTC_PUBLIC_ICE_HOST || "130.49.151.168"
const CHROME_RTC_ICE_INTERFACE = process.env.METAFOR_REMOTE_DESKTOP_ICE_INTERFACE || process.env.METAFOR_RTC_ICE_INTERFACE || "10.66.0.10"
const CHROME_RTC_IP_HANDLING_POLICY = process.env.METAFOR_REMOTE_DESKTOP_IP_HANDLING_POLICY || process.env.METAFOR_RTC_IP_HANDLING_POLICY || "default_public_and_private_interfaces"
const CHROME_GPU_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_CHROME_GPU === undefined
  ? CHROME_OZONE_PLATFORM !== "wayland"
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_GPU)
const CHROME_NO_SANDBOX = process.env.METAFOR_REMOTE_DESKTOP_CHROME_NO_SANDBOX === undefined
  ? true
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_NO_SANDBOX)
const CHROME_WEBGPU_ENABLED = envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_WEBGPU || "0")
const CHROME_RTC_AUDIO_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_AUDIO === undefined
  ? true
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_AUDIO)
const CHROME_RTC_CAPTURE_SURFACE = "monitor"
const CHROME_RTC_AUDIO_SOURCE = normalizeChromeAudioSource(process.env.METAFOR_REMOTE_DESKTOP_CHROME_AUDIO_SOURCE || "pipewire")
const CHROME_RTC_AUTO_SELECT_SOURCE = (process.env.METAFOR_REMOTE_DESKTOP_CHROME_AUTO_SELECT_SOURCE
  || process.env.METAFOR_REMOTE_DESKTOP_AUTO_SELECT_SOURCE
  || "Entire Screen").trim()
const CHROME_RTC_FAKE_UI = process.env.METAFOR_REMOTE_DESKTOP_CHROME_FAKE_UI === undefined
  ? CHROME_RTC_AUTO_SELECT_SOURCE.length > 0
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_FAKE_UI)
const CHROME_WEBRTC_PIPEWIRE_ENABLED = process.env.METAFOR_REMOTE_DESKTOP_CHROME_PIPEWIRE === undefined
  ? CHROME_OZONE_PLATFORM !== "x11"
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_PIPEWIRE)
const CHROME_USE_OZONE_FEATURE = envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_USE_OZONE_FEATURE || "0")
const CHROME_RTC_PICKER_AUTOMATION = process.env.METAFOR_REMOTE_DESKTOP_CHROME_RTC_PICKER === undefined
  ? CHROME_RTC_AUTO_SELECT_SOURCE.length === 0
  : envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_RTC_PICKER)
const CHROME_DEV_LAYOUT_ENABLED = envFlag(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEV_LAYOUT || "0")
const CHROME_DEV_MOBILE_WIDTH = envNumber(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_WIDTH, 400)
const CHROME_DEV_MOBILE_HEIGHT = envNumber(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_HEIGHT, 871)
const CHROME_DEV_MOBILE_DPR = envNumber(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEV_MOBILE_DPR, 3)
const CHROME_DEVTOOLS_SPLIT_WIDTH = envNumber(
  process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEVTOOLS_SPLIT_WIDTH,
  Math.max(900, WIDTH - 571),
)
const HELPER = path.join(__dirname, "mutter-remote-desktop-helper.py")

const state = {
  ok: true,
  backend: "mutter-pipewire",
  pid: process.pid,
  url: TARGET_URL,
  startedAt: new Date().toISOString(),
  stream: {
    status: "starting",
    nodeId: null,
    serial: null,
    streamPath: null,
    target: null,
    remoteSessionPath: null,
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    error: null,
  },
  browser: {
    command: CHROME,
    pid: null,
    debugPort: CHROME_DEBUG_PORT,
    profileDir: PROFILE_DIR,
    startedAt: null,
    exitCode: null,
    signal: null,
  },
  audioPcm: {
    clients: 0,
    target: null,
    sampleRate: 48000,
    channels: 2,
    format: "S16LE",
    lastStartedAt: null,
    lastError: null,
  },
  input: {
    enabled: true,
    transport: "mutter-remote-desktop",
    lastAt: null,
    lastCommand: null,
    lastAck: 0,
    lastError: null,
  },
  remoteDesktop: {
    enabled: true,
    status: CHROME_RTC_ENABLED ? "chrome-rtc-starting" : "disabled",
    transport: CHROME_RTC_ENABLED ? "chrome-webrtc" : "disabled",
    webRtc: CHROME_RTC_ENABLED,
    signalUrl: CHROME_RTC_SIGNAL_URL,
    room: CHROME_RTC_ROOM,
    peerId: CHROME_RTC_PEER_ID,
    capture: {
      frameSource: CHROME_RTC_ENABLED ? "chrome-get-display-media" : null,
      frameWidth: null,
      frameHeight: null,
      frameRate: null,
    },
    input: {
      enabled: true,
      transport: "mutter-remote-desktop",
      lastError: null,
    },
    audio: {
      enabled: true,
      transport: "pipewire-pcm",
      trackCount: 0,
      lastError: null,
    },
    video: {
      targetBitrate: VIDEO_BITRATE,
      maxFps: FPS,
      contentHint: VIDEO_CONTENT_HINT,
      codecPreference: VIDEO_CODEC,
      degradationPreference: "maintain-resolution",
      scaleResolutionDownBy: 1,
      parametersApplied: false,
      senderStats: null,
      lastError: null,
    },
    rtc: {
      enabled: CHROME_RTC_ENABLED,
      status: CHROME_RTC_ENABLED ? "starting" : "disabled",
      peerId: CHROME_RTC_PEER_ID,
      signalUrl: CHROME_RTC_SIGNAL_URL,
      room: CHROME_RTC_ROOM,
      peers: [],
      ice: {
        candidateCount: 0,
        publishedCandidateCount: 0,
        droppedCandidateCount: 0,
        lastCandidate: null,
        lastPublishedCandidate: null,
      },
      signal: {
        messageCount: 0,
        lastMessageType: null,
        lastMessageFrom: null,
        lastMessageTo: null,
        lastMessageAt: null,
      },
      tracks: [],
      lastError: null,
      updatedAt: null,
    },
  },
}

let helper = null
let browser = null
let helperStdoutBuffer = ""
let helperInputSeq = 0
const helperInputRequests = new Map()
let chromeRtcStartTimer = null
let chromeRtcStarting = false

startHelper()

const server = http.createServer((req, res) => {
  void route(req, res).catch((error) => sendJson(res, error.statusCode || 500, {ok: false, error: error.message}))
})
server.listen(PORT, HOST, () => {
  console.log(`[metafor-remote-desktop] host listening on http://${HOST}:${PORT}`)
})

async function route(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`)
  if (req.method === "OPTIONS") {
    sendEmpty(res, 204, corsHeaders())
    return
  }
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/state" || url.pathname === "/desktop/health")) {
    if (CHROME_RTC_ENABLED) await refreshChromeRtcState().catch(() => undefined)
    sendJson(res, 200, publicState())
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/rtc/state") {
    if (CHROME_RTC_ENABLED) await refreshChromeRtcState().catch(() => undefined)
    sendJson(res, 200, {ok: true, remoteDesktop: publicState().remoteDesktop})
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/rtc/sender") {
    const html = chromeRtcSenderPageHtml()
    res.writeHead(200, {
      ...corsHeaders(),
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(html),
    })
    res.end(html)
    return
  }
  if (req.method === "POST" && url.pathname === "/desktop/rtc/restart") {
    if (CHROME_RTC_ENABLED && browser !== null && browser.exitCode === null && browser.signalCode === null) {
      await startChromeRtcSender({force: true})
    } else {
      restart()
    }
    sendJson(res, 202, {ok: true, remoteDesktop: publicState().remoteDesktop})
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/audio.pcm") {
    await sendAudioPcmStream(req, res)
    return
  }
  if (req.method === "POST" && url.pathname === "/desktop/input") {
    const body = await readJson(req)
    sendJson(res, 200, await sendDesktopInput(body))
    return
  }
  if (req.method === "POST" && url.pathname === "/desktop/browser/open") {
    const body = await readJson(req)
    if (typeof body.url === "string" && body.url.trim().length > 0) openBrowser(body.url.trim())
    sendJson(res, 202, publicState())
    return
  }
  sendJson(res, 404, {ok: false, error: "Not found"})
}

function chromeRtcSenderPageHtml() {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>MetaFor Chrome RTC Sender</title></head>
<body style="margin:0;background:#05070a;color:#d8e2f0;font:12px/1.4 sans-serif">
<div style="padding:8px">MetaFor Chrome RTC Sender</div>
</body>
</html>`
}

function publicState() {
  return {
    ...state,
    uptimeMs: Math.round(process.uptime() * 1000),
    browser: {
      ...state.browser,
      running: browser !== null && browser.exitCode === null && browser.signalCode === null,
    },
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,accept",
  }
}

function sendEmpty(res, statusCode, headers = {}) {
  res.writeHead(statusCode, headers)
  res.end()
}

function restart() {
  if (chromeRtcStartTimer !== null) {
    clearTimeout(chromeRtcStartTimer)
    chromeRtcStartTimer = null
  }
  stopChild(browser)
  browser = null
  stopChild(helper)
  helper = null
  state.stream.status = "starting"
  state.stream.error = null
  state.stream.nodeId = null
  state.stream.serial = null
  state.stream.streamPath = null
  state.stream.remoteSessionPath = null
  startHelper()
}

function startHelper() {
  helper = spawn("python3", [HELPER], {
    cwd: path.dirname(__dirname),
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
      DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${process.getuid?.() ?? 1000}/bus`,
    },
    stdio: ["pipe", "pipe", "pipe"],
  })
  helper.stdout.setEncoding("utf8")
  helper.stdout.on("data", (chunk) => {
    helperStdoutBuffer += chunk
    const lines = helperStdoutBuffer.split(/\r?\n/)
    helperStdoutBuffer = lines.pop() || ""
    for (const line of lines) {
      if (line.trim().length === 0) continue
      handleHelperLine(line)
    }
  })
  helper.stderr.on("data", (chunk) => process.stderr.write(`[metafor-remote-desktop helper] ${chunk}`))
  helper.on("exit", (code, signal) => {
    state.stream.status = "failed"
    state.stream.error = `helper exited code=${code ?? "null"} signal=${signal ?? "null"}`
    state.stream.nodeId = null
    state.stream.serial = null
    state.stream.streamPath = null
    state.stream.target = null
    state.stream.remoteSessionPath = null
    rejectHelperInputRequests(new Error(state.stream.error))
  })
}

function handleHelperLine(line) {
  let payload = null
  try {
    payload = JSON.parse(line)
  } catch {
    console.error("[metafor-remote-desktop] helper:", line)
    return
  }
  if (payload.type === "remoteDesktop") {
    state.stream.remoteSessionPath = typeof payload.sessionPath === "string" ? payload.sessionPath : state.stream.remoteSessionPath
    state.remoteDesktop.input.lastError = null
    return
  }
  if (payload.type === "inputResult") {
    completeHelperInputRequest(payload)
    return
  }
  if (payload.type === "stream" && typeof payload.serial === "string") {
    state.stream.status = "running"
    state.stream.nodeId = payload.nodeId
    state.stream.serial = payload.serial
    state.stream.streamPath = typeof payload.streamPath === "string" ? payload.streamPath : null
    state.stream.target = payload.streamTarget !== null && typeof payload.streamTarget === "object" ? payload.streamTarget : null
    state.stream.remoteSessionPath = typeof payload.remoteSessionPath === "string" ? payload.remoteSessionPath : state.stream.remoteSessionPath
    state.stream.error = null
    state.remoteDesktop.input.lastError = null
    console.log(`[metafor-remote-desktop] PipeWire stream node=${payload.nodeId} serial=${payload.serial}`)
    if (MANAGED_BROWSER_ENABLED) openBrowser(TARGET_URL)
    scheduleChromeRtcStart()
    return
  }
  if (payload.type === "error") {
    state.stream.status = "failed"
    state.stream.nodeId = null
    state.stream.serial = null
    state.stream.streamPath = null
    state.stream.target = null
    state.stream.remoteSessionPath = null
    state.stream.error = String(payload.error || "unknown helper error")
    state.remoteDesktop.input.lastError = state.stream.error
    console.error("[metafor-remote-desktop]", state.stream.error)
  }
}

function sendHelperInput(body) {
  if (helper === null || helper.stdin === null || helper.stdin.destroyed || !helper.stdin.writable) {
    return Promise.reject(new Error("Mutter helper is not running"))
  }
  if (state.stream.streamPath === null || state.stream.remoteSessionPath === null) {
    return Promise.reject(new Error("Mutter remote desktop session is not ready"))
  }
  const id = ++helperInputSeq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      helperInputRequests.delete(id)
      reject(new Error(`Mutter input timed out after ${HELPER_INPUT_TIMEOUT_MS}ms`))
    }, HELPER_INPUT_TIMEOUT_MS)
    helperInputRequests.set(id, {resolve, reject, timer})
    const line = `${JSON.stringify({type: "input", id, body})}\n`
    helper.stdin.write(line, (error) => {
      if (error === null || error === undefined) return
      const request = helperInputRequests.get(id)
      if (request === undefined) return
      helperInputRequests.delete(id)
      clearTimeout(request.timer)
      request.reject(error)
    })
  })
}

function completeHelperInputRequest(payload) {
  const id = Number(payload.id)
  if (!Number.isInteger(id)) return
  const request = helperInputRequests.get(id)
  if (request === undefined) return
  helperInputRequests.delete(id)
  clearTimeout(request.timer)
  if (payload.ok === true) {
    request.resolve(payload.input ?? {type: "input"})
    return
  }
  request.reject(new Error(String(payload.error || "Mutter input failed")))
}

function rejectHelperInputRequests(error) {
  for (const [id, request] of helperInputRequests) {
    helperInputRequests.delete(id)
    clearTimeout(request.timer)
    request.reject(error)
  }
}

function chromeEnableFeatures() {
  const features = []
  if (CHROME_USE_OZONE_FEATURE) features.push("UseOzonePlatform")
  if (CHROME_WEBRTC_PIPEWIRE_ENABLED) features.push("WebRTCPipeWireCapturer")
  return features
}

function chromeEnableFeatureFlags() {
  const features = chromeEnableFeatures()
  return features.length > 0 ? [`--enable-features=${features.join(",")}`] : []
}

function chromeDisableFeatures() {
  const features = ["Translate", "WebRtcHideLocalIpsWithMdns", "VaapiVideoDecoder", "VaapiVideoEncoder"]
  if (!CHROME_WEBGPU_ENABLED) features.push("Vulkan", "VulkanFromANGLE", "DefaultANGLEVulkan", "WebGPU")
  return features
}

function chromeDisableFeatureFlags() {
  const features = chromeDisableFeatures()
  return features.length > 0 ? [`--disable-features=${features.join(",")}`] : []
}

function openBrowser(url) {
  if (browser !== null && browser.exitCode === null && browser.signalCode === null) return
  const securityFlags = insecureOriginSecurityFlags(url, CHROME_RTC_SIGNAL_URL, CHROME_RTC_INPUT_URL, CHROME_RTC_AUDIO_PCM_URL)
  prepareChromeProfile()
  browser = spawn(CHROME, [
    `--user-data-dir=${PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-extensions",
    "--disable-breakpad",
    "--disable-crash-reporter",
    "--disable-infobars",
    "--disable-translate",
    "--disable-session-crashed-bubble",
    "--test-type",
    ...(CHROME_NO_SANDBOX ? ["--no-sandbox"] : []),
    "--ignore-gpu-blocklist",
    ...(CHROME_GPU_ENABLED ? [] : ["--disable-gpu", "--disable-gpu-compositing"]),
    ...(CHROME_WEBGPU_ENABLED ? ["--enable-unsafe-webgpu"] : []),
    "--enable-usermedia-screen-capturing",
    "--allow-http-screen-capture",
    ...(CHROME_RTC_FAKE_UI ? ["--use-fake-ui-for-media-stream"] : []),
    ...(CHROME_RTC_AUTO_SELECT_SOURCE.length > 0 ? [`--auto-select-desktop-capture-source=${CHROME_RTC_AUTO_SELECT_SOURCE}`] : []),
    ...chromeEnableFeatureFlags(),
    ...chromeDisableFeatureFlags(),
    ...(CHROME_WEBGPU_ENABLED ? [] : ["--disable-vulkan"]),
    "--lang=ru-RU",
    "--accept-lang=ru-RU,ru,en-US,en",
    `--ozone-platform=${CHROME_OZONE_PLATFORM}`,
    "--force-device-scale-factor=1",
    ...(CHROME_DEV_LAYOUT_ENABLED ? ["--start-maximized"] : []),
    "--window-position=0,0",
    `--window-size=${WIDTH},${HEIGHT}`,
    `--webrtc-udp-port-range=${CHROME_RTC_UDP_PORT_RANGE}`,
    `--force-webrtc-ip-handling-policy=${CHROME_RTC_IP_HANDLING_POLICY}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
    "--remote-allow-origins=*",
    ...securityFlags,
    url,
  ], {
    env: chromeProcessEnv(),
    stdio: ["ignore", "ignore", "pipe"],
  })
  state.browser.pid = browser.pid
  state.browser.startedAt = new Date().toISOString()
  state.browser.exitCode = null
  state.browser.signal = null
  browser.stderr.on("data", (chunk) => process.stderr.write(`[metafor-remote-desktop browser] ${chunk}`))
  browser.on("exit", (code, signal) => {
    state.browser.exitCode = code
    state.browser.signal = signal
    if (browser?.exitCode !== null || browser?.signalCode !== null) browser = null
  })
}

function chromeProcessEnv() {
  const env = {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${process.getuid?.() ?? 1000}/bus`,
    WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-0",
    XDG_SESSION_TYPE: CHROME_OZONE_PLATFORM === "x11" ? "x11" : "wayland",
  }
  if (CHROME_OZONE_PLATFORM === "x11") {
    env.DISPLAY = process.env.DISPLAY || ":0"
  } else {
    delete env.DISPLAY
    delete env.XAUTHORITY
  }
  return env
}

function prepareChromeProfile() {
  const defaultProfileDir = path.join(PROFILE_DIR, "Default")
  const preferencesPath = path.join(defaultProfileDir, "Preferences")
  try {
    removeStaleChromeSingletonFiles(PROFILE_DIR)
    fs.mkdirSync(defaultProfileDir, {recursive: true})
    let preferences = {}
    if (fs.existsSync(preferencesPath)) {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"))
    }
    preferences.webrtc = {
      ...(preferences.webrtc && typeof preferences.webrtc === "object" ? preferences.webrtc : {}),
      udp_port_range: CHROME_RTC_UDP_PORT_RANGE,
    }
    preferences.profile = {
      ...(preferences.profile && typeof preferences.profile === "object" ? preferences.profile : {}),
      exited_cleanly: true,
      exit_type: "Normal",
    }
    if (CHROME_DEV_LAYOUT_ENABLED) applyChromeDevLayoutPreferences(preferences)
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2))
  } catch (error) {
    state.remoteDesktop.rtc.lastError = error instanceof Error ? error.message : String(error)
  }
}

function applyChromeDevLayoutPreferences(preferences) {
  preferences.browser = {
    ...(preferences.browser && typeof preferences.browser === "object" ? preferences.browser : {}),
    window_placement: {
      bottom: HEIGHT,
      left: 0,
      maximized: false,
      right: WIDTH,
      top: 0,
      work_area_bottom: HEIGHT,
      work_area_left: 0,
      work_area_right: WIDTH,
      work_area_top: 0,
    },
  }
  preferences.devtools = {
    ...(preferences.devtools && typeof preferences.devtools === "object" ? preferences.devtools : {}),
    preferences: {
      ...((preferences.devtools?.preferences && typeof preferences.devtools.preferences === "object") ? preferences.devtools.preferences : {}),
      "currentDockState": chromeDevToolsPreference("right"),
      "lastDockState": chromeDevToolsPreference("right"),
      "last-dock-state": chromeDevToolsPreference("right"),
      "emulation.show-device-mode": "true",
      "emulation.device-mode-value": chromeDevToolsPreference({device: "", orientation: "", mode: ""}),
      "panel-selected-tab": chromeDevToolsPreference("sources"),
      "inspector-view.split-view-state": chromeDevToolsPreference({
        vertical: {size: CHROME_DEVTOOLS_SPLIT_WIDTH},
        horizontal: {size: 0},
      }),
      "inspector.drawer-split-view-state": chromeDevToolsPreference({
        horizontal: {size: 0, showMode: "Both"},
      }),
      "sources-panel-navigator-split-view-state": chromeDevToolsPreference({
        vertical: {size: 0, showMode: "Both"},
      }),
      "sources-panel-split-view-state": chromeDevToolsPreference({
        vertical: {size: 0, showMode: "Both"},
        horizontal: {size: 0, showMode: "Both"},
      }),
    },
  }
}

function chromeDevToolsPreference(value) {
  return JSON.stringify(value)
}

function removeStaleChromeSingletonFiles(profileDir) {
  const lockPath = path.join(profileDir, "SingletonLock")
  let lockTarget = ""
  try {
    lockTarget = fs.readlinkSync(lockPath).toString()
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "EINVAL") throw error
  }
  const pid = chromeSingletonPid(lockTarget)
  if (pid !== null && processIsAlive(pid)) return
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try {
      fs.unlinkSync(path.join(profileDir, name))
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
  }
}

function chromeSingletonPid(value) {
  const match = /-(\d+)$/.exec(value)
  if (match === null) return null
  const pid = Number(match[1])
  return Number.isInteger(pid) && pid > 0 ? pid : null
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

function insecureOriginSecurityFlags(...urls) {
  const flags = new Set()
  for (const url of urls) {
    for (const origin of insecureOrigins(url)) flags.add(`--unsafely-treat-insecure-origin-as-secure=${origin}`)
  }
  return [...flags]
}

function insecureOrigins(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "http:") return isPotentiallyTrustworthyHost(parsed.hostname) ? [] : [parsed.origin]
    if (parsed.protocol === "ws:") {
      parsed.protocol = "http:"
      return isPotentiallyTrustworthyHost(parsed.hostname) ? [] : [parsed.origin]
    }
    return []
  } catch {
    return []
  }
}

function isPotentiallyTrustworthyHost(hostname) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname.endsWith(".localhost")
}

function targetHttpOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return "https://meta.proizvodstvo1.ru"
  }
}

function targetWebSocketOrigin(url) {
  const origin = targetHttpOrigin(url)
  return origin.startsWith("https://")
    ? `wss://${origin.slice("https://".length)}`
    : origin.startsWith("http://")
      ? `ws://${origin.slice("http://".length)}`
      : "wss://meta.proizvodstvo1.ru"
}

function normalizePathPrefix(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "")
  if (trimmed.length === 0) return ""
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

function scheduleChromeRtcStart(delayMs = 1500) {
  if (!CHROME_RTC_ENABLED) return
  if (chromeRtcStartTimer !== null) clearTimeout(chromeRtcStartTimer)
  chromeRtcStartTimer = setTimeout(() => {
    chromeRtcStartTimer = null
    void startChromeRtcSender().catch((error) => {
      postChromeRtcState({status: "failed", lastError: error instanceof Error ? error.message : String(error)})
    })
  }, delayMs)
}

async function startChromeRtcSender(options = {}) {
  if (!CHROME_RTC_ENABLED) return publicState().remoteDesktop
  if (chromeRtcStarting) return publicState().remoteDesktop
  chromeRtcStarting = true
  postChromeRtcState({status: "injecting", lastError: null})
  try {
    let lastError = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        if (CHROME_DEV_LAYOUT_ENABLED) await configureChromeDevLayout().catch((error) => {
          state.remoteDesktop.rtc.lastError = `Chrome dev layout failed: ${error instanceof Error ? error.message : String(error)}`
        })
        await withCdpChromeRtcSenderPage(async (cdp) => {
          await cdp.send("Runtime.evaluate", {
            expression: chromeRtcSenderScript({force: options.force === true}),
            returnByValue: true,
            userGesture: true,
          })
        })
        lastError = null
        break
      } catch (error) {
        lastError = error
        await sleep(500)
      }
    }
    if (lastError !== null) throw lastError
    await sleep(1200)
    if (CHROME_RTC_PICKER_AUTOMATION) await automateChromeScreenPicker()
    await waitForChromeRtcReady()
    await activateChromeAppWebTarget().catch((error) => {
      state.remoteDesktop.rtc.lastError = `Chrome AppWeb focus failed: ${error instanceof Error ? error.message : String(error)}`
    })
    return publicState().remoteDesktop
  } finally {
    chromeRtcStarting = false
  }
}

async function configureChromeDevLayout() {
  const target = await cdpPageTarget()
  await applyChromeWindowBounds(target)
  await applyChromeMobileEmulation()
  if (!await chromeDevToolsOpen()) {
    await withCdpPage((cdp) => cdp.send("Page.bringToFront").catch(() => undefined))
    await sendHelperInput({type: "key", key: "i", modifiers: ["Control", "Shift"]})
    await sleep(900)
  }
  await applyChromeWindowBounds(await cdpPageTarget())
  await applyChromeMobileEmulation()
}

async function applyChromeWindowBounds(target) {
  await withCdpBrowser(async (browserCdp) => {
    const windowInfo = await browserCdp.send("Browser.getWindowForTarget", {targetId: target.id})
    if (typeof windowInfo?.windowId !== "number") return
    await browserCdp.send("Browser.setWindowBounds", {
      windowId: windowInfo.windowId,
      bounds: {windowState: "normal"},
    }).catch(() => undefined)
    await browserCdp.send("Browser.setWindowBounds", {
      windowId: windowInfo.windowId,
      bounds: {left: 0, top: 0, width: WIDTH, height: HEIGHT},
    })
  })
}

async function applyChromeMobileEmulation() {
  await withCdpPage(async (cdp) => {
    await cdp.send("Page.bringToFront").catch(() => undefined)
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: CHROME_DEV_MOBILE_WIDTH,
      height: CHROME_DEV_MOBILE_HEIGHT,
      deviceScaleFactor: CHROME_DEV_MOBILE_DPR,
      mobile: true,
      screenWidth: CHROME_DEV_MOBILE_WIDTH,
      screenHeight: CHROME_DEV_MOBILE_HEIGHT,
      scale: 1,
    })
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 1,
    }).catch(() => undefined)
    await cdp.send("Emulation.setUserAgentOverride", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
    }).catch(() => undefined)
  })
}

async function chromeDevToolsOpen() {
  const targets = await fetchChromeJson("/json/list")
  return Array.isArray(targets) && targets.some((target) => (
    target?.type === "page"
    && typeof target.url === "string"
    && target.url.startsWith("devtools://")
    && target.url.includes("can_dock=true")
  ))
}

async function activateChromeAppWebTarget() {
  const target = await cdpPageTarget()
  await withCdpBrowser((browserCdp) => browserCdp.send("Target.activateTarget", {targetId: target.id}))
  await withCdpPage((cdp) => cdp.send("Page.bringToFront").catch(() => undefined))
}

async function automateChromeScreenPicker() {
  const source = {x: Math.round(WIDTH * 0.5), y: Math.round(HEIGHT * 0.555)}
  const grant = {x: Math.round(WIDTH * 0.685), y: Math.round(HEIGHT * 0.305)}
  const steps = [
    {point: source, delayMs: 800},
    {point: source, delayMs: 350},
    {point: grant, delayMs: 700},
    {point: grant, delayMs: 1200},
    {point: source, delayMs: 400},
    {point: grant, delayMs: 1500},
    {point: grant, delayMs: 1500},
    {point: source, delayMs: 400},
    {point: grant, delayMs: 2000},
    {point: grant, delayMs: 2000},
  ]
  for (const step of steps) {
    await clickChromePickerPoint(step.point)
    await sleep(step.delayMs)
  }
  await refreshChromeRtcState().catch(() => undefined)
}

async function clickChromePickerPoint(point) {
  try {
    await sendHelperInput({type: "click", x: point.x, y: point.y, button: "left"})
  } catch (error) {
    state.remoteDesktop.input.lastError = error instanceof Error ? error.message : String(error)
  }
}

async function waitForChromeRtcReady() {
  let lastRtc = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    lastRtc = await refreshChromeRtcState().catch(() => null)
    const status = String(lastRtc?.status || "")
    if (status === "failed" || status === "rejected") throw new Error(lastRtc?.lastError || "Chrome RTC capture failed")
    if (["capture-ready", "signaling-open", "ready", "peer", "connected", "control-open"].includes(status)) return
    await sleep(500)
  }
  throw new Error(`Chrome RTC did not become ready: ${lastRtc?.status || "unknown"}`)
}

async function refreshChromeRtcState() {
  if (!CHROME_RTC_ENABLED || browser === null || browser.exitCode !== null || browser.signalCode !== null) return state.remoteDesktop.rtc
  return await withCdpChromeRtcSenderPage(async (cdp) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "window.__metaforChromeRtcState ? JSON.parse(JSON.stringify(window.__metaforChromeRtcState)) : null",
      returnByValue: true,
    })
    const value = result?.result?.value ?? null
    if (value !== null && typeof value === "object") {
      postChromeRtcState(value)
    } else {
      postChromeRtcState({status: "not-injected", peers: [], lastError: "Chrome RTC sender is not injected in the current page"})
    }
    return state.remoteDesktop.rtc
  })
}

function postChromeRtcState(patch) {
  if (patch === null || typeof patch !== "object") return
  if (typeof patch.status === "string") {
    state.remoteDesktop.rtc.status = patch.status
    state.remoteDesktop.status = patch.status
  }
  if ("lastError" in patch) state.remoteDesktop.rtc.lastError = typeof patch.lastError === "string" ? patch.lastError : null
  if (Array.isArray(patch.peers)) state.remoteDesktop.rtc.peers = patch.peers
  if (patch.ice !== null && typeof patch.ice === "object") state.remoteDesktop.rtc.ice = patch.ice
  if (patch.signal !== null && typeof patch.signal === "object") state.remoteDesktop.rtc.signal = {...state.remoteDesktop.rtc.signal, ...patch.signal}
  if (Array.isArray(patch.tracks)) state.remoteDesktop.rtc.tracks = patch.tracks
  if (typeof patch.updatedAt === "string") state.remoteDesktop.rtc.updatedAt = patch.updatedAt
  else state.remoteDesktop.rtc.updatedAt = new Date().toISOString()
  if (patch.capture !== null && typeof patch.capture === "object") {
    const capture = patch.capture
    if (typeof capture.frameSource === "string") state.remoteDesktop.capture.frameSource = capture.frameSource
    if (typeof capture.frameWidth === "number") state.remoteDesktop.capture.frameWidth = capture.frameWidth
    if (typeof capture.frameHeight === "number") state.remoteDesktop.capture.frameHeight = capture.frameHeight
    if (typeof capture.frameRate === "number") state.remoteDesktop.capture.frameRate = capture.frameRate
  }
  if (patch.audio !== null && typeof patch.audio === "object") {
    const audio = patch.audio
    if (typeof audio.trackCount === "number") state.remoteDesktop.audio.trackCount = audio.trackCount
    if (typeof audio.effectiveSource === "string") state.remoteDesktop.audio.transport = audio.effectiveSource
    if ("lastError" in audio) state.remoteDesktop.audio.lastError = typeof audio.lastError === "string" ? audio.lastError : null
  }
  if (patch.video !== null && typeof patch.video === "object") {
    state.remoteDesktop.video = {...state.remoteDesktop.video, ...patch.video}
  }
}

function chromeRtcSenderScript(options = {}) {
  const config = {
    force: options.force === true,
    signalUrl: CHROME_RTC_SIGNAL_URL,
    room: CHROME_RTC_ROOM,
    peerId: CHROME_RTC_PEER_ID,
    inputUrl: CHROME_RTC_INPUT_URL,
    audioPcmUrl: CHROME_RTC_AUDIO_PCM_URL,
    width: WIDTH,
    height: HEIGHT,
    maxFps: FPS,
    videoBitrate: VIDEO_BITRATE,
    videoCodec: VIDEO_CODEC,
    videoContentHint: VIDEO_CONTENT_HINT,
    audio: CHROME_RTC_AUDIO_ENABLED,
    audioSource: CHROME_RTC_AUDIO_SOURCE,
    captureSurface: CHROME_RTC_CAPTURE_SURFACE,
    udpPortRange: CHROME_RTC_UDP_PORT_RANGE,
    publicIceHost: CHROME_RTC_PUBLIC_ICE_HOST,
    iceInterface: CHROME_RTC_ICE_INTERFACE,
    iceServers: [{urls: "stun:stun.l.google.com:19302"}],
  }
  return `
(() => {
  const config = ${JSON.stringify(config)};
  if (window.__metaforChromeRtc && !config.force) return window.__metaforChromeRtcState || {status: "existing"};
  if (window.__metaforChromeRtc && typeof window.__metaforChromeRtc.stop === "function") window.__metaforChromeRtc.stop();

  const state = {
    status: "booting",
    peerId: config.peerId,
    room: config.room,
    transport: "chrome-webrtc",
    peers: [],
    ice: {
      candidateCount: 0,
      publishedCandidateCount: 0,
      droppedCandidateCount: 0,
      lastCandidate: null,
      lastPublishedCandidate: null,
    },
    capture: {
      frameSource: "chrome-get-display-media:" + config.captureSurface,
      frameWidth: null,
      frameHeight: null,
      frameRate: null,
    },
    audio: {
      enabled: false,
      effectiveSource: null,
      trackCount: 0,
      lastError: null,
    },
    video: {
      targetBitrate: config.videoBitrate,
      maxFps: config.maxFps,
      contentHint: config.videoContentHint,
      codecPreference: config.videoCodec,
      degradationPreference: "maintain-resolution",
      scaleResolutionDownBy: 1,
      parametersApplied: false,
      senderStats: null,
      lastError: null,
    },
    signal: {
      messageCount: 0,
      lastMessageType: null,
      lastMessageFrom: null,
      lastMessageTo: null,
      lastMessageAt: null,
    },
    lastError: null,
    updatedAt: null,
  };
  let socket = null;
  let stream = null;
  let pipewireAudioTracks = [];
  let pipewireAudioTransport = null;
  let pipewireAudioGenerator = null;
  let pipewireAudioGeneratorWriter = null;
  let pipewireAudioGeneratorTimestampUs = 0;
  let pipewireAudioGeneratorRemainder = new Uint8Array(0);
  let pipewireAudioPcmAbort = null;
  let pipewireAudioKeepAliveContext = null;
  let pipewireAudioKeepAliveGain = null;
  let pipewireAudioKeepAliveSource = null;
  let pipewireAudioReconnectTimer = null;
  let senderStatsTimer = null;
  let stopped = false;
  const peers = new Map();

  window.__metaforChromeRtcState = state;

  function post(patch) {
    if (patch && typeof patch === "object") {
      if (patch.capture && typeof patch.capture === "object") Object.assign(state.capture, patch.capture);
      if (patch.audio && typeof patch.audio === "object") Object.assign(state.audio, patch.audio);
      if (patch.video && typeof patch.video === "object") Object.assign(state.video, patch.video);
      if (patch.signal && typeof patch.signal === "object") Object.assign(state.signal, patch.signal);
      const rest = {...patch};
      delete rest.capture;
      delete rest.audio;
      delete rest.video;
      delete rest.signal;
      Object.assign(state, rest);
    }
    state.updatedAt = new Date().toISOString();
    return state;
  }

  function signalUrl() {
    const url = new URL(config.signalUrl);
    url.searchParams.set("room", config.room);
    url.searchParams.set("peer", config.peerId);
    return url.toString();
  }

  async function start() {
    post({status: "capture-requested", lastError: null});
    const useDisplayAudio = config.audio && (config.audioSource === "display" || config.audioSource === "both");
    const displayOptions = {
      video: {
        displaySurface: config.captureSurface,
        frameRate: {ideal: config.maxFps, max: config.maxFps},
        width: {ideal: config.width},
        height: {ideal: config.height},
      },
      audio: useDisplayAudio ? {
        suppressLocalAudioPlayback: false,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      } : false,
      selfBrowserSurface: "include",
      surfaceSwitching: "include",
      systemAudio: useDisplayAudio ? "include" : "exclude",
    };
    if (config.captureSurface === "browser") {
      displayOptions.preferCurrentTab = true;
    } else if (config.captureSurface === "monitor") {
      displayOptions.monitorTypeSurfaces = "include";
    }
    stream = await navigator.mediaDevices.getDisplayMedia(displayOptions);
    const pipewireTracks = await startPipeWireAudioCapture().catch((error) => {
      post({audio: {lastError: "pipewire audio capture failed: " + String(error?.message || error)}});
      return [];
    });
    for (const track of stream.getVideoTracks()) {
      track.contentHint = config.videoContentHint;
      track.applyConstraints?.({
        width: {ideal: config.width},
        height: {ideal: config.height},
        frameRate: {ideal: config.maxFps, max: config.maxFps},
      }).catch(() => undefined);
    }
    const videoSettings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    post({
      status: "capture-ready",
      capture: {
        frameSource: "chrome-get-display-media:" + config.captureSurface,
        frameWidth: Number(videoSettings.width) || null,
        frameHeight: Number(videoSettings.height) || null,
        frameRate: Number(videoSettings.frameRate) || null,
      },
      audio: {
        enabled: Boolean(config.audio),
        effectiveSource: audioEffectiveSource(pipewireTracks.length),
        trackCount: stream.getAudioTracks().length,
        lastError: null,
      },
      tracks: streamTrackSummaries(),
    });
    bindStreamTrackDiagnostics();
    connectSignal();
  }

  function bindStreamTrackDiagnostics() {
    for (const track of stream.getTracks()) {
      const update = () => post({tracks: streamTrackSummaries()});
      track.addEventListener("mute", update);
      track.addEventListener("unmute", update);
      track.addEventListener("ended", update, {once: true});
    }
  }

  function streamTrackSummaries() {
    if (stream === null) return [];
    return stream.getTracks().map((track) => ({
      id: track.id,
      kind: track.kind,
      label: track.label || null,
      readyState: track.readyState,
      muted: track.muted,
      settings: typeof track.getSettings === "function" ? track.getSettings() : null,
    }));
  }

  async function startPipeWireAudioCapture() {
    if (!config.audio || (config.audioSource !== "pipewire" && config.audioSource !== "both")) return [];
    await startChromeAudioOutputKeepAlive();
    const tracks = await startPipeWirePcmGeneratorAudioCapture();
    return tracks;
  }

  async function installPipeWireAudioTracks(tracks, transport) {
    const previousTracks = pipewireAudioTracks;
    pipewireAudioTracks = tracks;
    pipewireAudioTransport = transport;
    for (const track of previousTracks) stream.removeTrack(track);
    for (const track of tracks) {
      track.contentHint = "speech";
      stream.addTrack(track);
    }
    await Promise.all([...peers.values()].map((peer) => replacePeerAudioTrack(peer, tracks[0] || null)));
    for (const track of previousTracks) track.stop();
  }

  async function replacePeerAudioTrack(peer, track) {
    const transceiver = peer.connection.getTransceivers().find((candidate) => (
      candidate.sender?.track?.kind === "audio" || candidate.receiver?.track?.kind === "audio"
    ));
    if (transceiver !== undefined) {
      transceiver.direction = track === null ? "inactive" : "sendonly";
      await transceiver.sender.replaceTrack(track);
      return;
    }
    if (track !== null) peer.connection.addTrack(track, stream);
  }

  async function startPipeWirePcmGeneratorAudioCapture() {
    if (typeof MediaStreamTrackGenerator !== "function" || typeof AudioData !== "function") {
      throw new Error("MediaStreamTrackGenerator or AudioData is not available");
    }
    pipewireAudioGenerator = new MediaStreamTrackGenerator({kind: "audio"});
    pipewireAudioGeneratorWriter = pipewireAudioGenerator.writable.getWriter();
    pipewireAudioGeneratorTimestampUs = 0;
    pipewireAudioGeneratorRemainder = new Uint8Array(0);
    await installPipeWireAudioTracks([pipewireAudioGenerator], "pipewire-pcm-track-generator-stream");
    startPipeWirePcmGeneratorFetch();
    return [pipewireAudioGenerator];
  }

  function startPipeWirePcmGeneratorFetch() {
    if (pipewireAudioReconnectTimer !== null) {
      clearTimeout(pipewireAudioReconnectTimer);
      pipewireAudioReconnectTimer = null;
    }
    pipewireAudioPcmAbort?.abort?.();
    pipewireAudioPcmAbort = new AbortController();
    void readPipeWirePcmGeneratorStream(pipewireAudioPcmAbort.signal);
  }

  async function readPipeWirePcmGeneratorStream(signal) {
    try {
      const response = await fetch(config.audioPcmUrl + "?t=" + Date.now(), {signal, cache: "no-store"});
      if (!response.ok || response.body === null) throw new Error("pcm fetch failed: " + response.status);
      const reader = response.body.getReader();
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        await writePipeWirePcmGeneratorChunk(chunk.value);
      }
      post({audio: {lastError: null}});
      if (!signal.aborted && !stopped) schedulePipeWirePcmReconnect(500);
    } catch (error) {
      if (!signal.aborted) {
        const message = "pipewire pcm generator fetch failed: " + String(error?.message || error);
        post({audio: {lastError: message}});
        if (!stopped) schedulePipeWirePcmReconnect(1000);
      }
    }
  }

  function schedulePipeWirePcmReconnect(delayMs) {
    if (pipewireAudioReconnectTimer !== null) clearTimeout(pipewireAudioReconnectTimer);
    pipewireAudioReconnectTimer = setTimeout(() => {
      pipewireAudioReconnectTimer = null;
      startPipeWirePcmGeneratorFetch();
    }, delayMs);
  }

  async function writePipeWirePcmGeneratorChunk(bytes) {
    if (pipewireAudioGeneratorWriter === null) return;
    const merged = mergePipeWireGeneratorBytes(bytes);
    const frameCount = Math.floor(merged.byteLength / 4);
    const payloadBytes = frameCount * 4;
    if (payloadBytes <= 0) return;
    const payload = merged.slice(0, payloadBytes);
    pipewireAudioGeneratorRemainder = merged.slice(payloadBytes);
    const audioData = new AudioData({
      format: "s16",
      sampleRate: 48000,
      numberOfFrames: frameCount,
      numberOfChannels: 2,
      timestamp: pipewireAudioGeneratorTimestampUs,
      data: payload,
    });
    pipewireAudioGeneratorTimestampUs += Math.round((frameCount / 48000) * 1000000);
    await pipewireAudioGeneratorWriter.ready;
    await pipewireAudioGeneratorWriter.write(audioData);
    audioData.close();
  }

  function mergePipeWireGeneratorBytes(bytes) {
    if (pipewireAudioGeneratorRemainder.byteLength === 0) return bytes;
    const merged = new Uint8Array(pipewireAudioGeneratorRemainder.byteLength + bytes.byteLength);
    merged.set(pipewireAudioGeneratorRemainder, 0);
    merged.set(bytes, pipewireAudioGeneratorRemainder.byteLength);
    pipewireAudioGeneratorRemainder = new Uint8Array(0);
    return merged;
  }

  async function startChromeAudioOutputKeepAlive() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (typeof AudioContextClass !== "function" || pipewireAudioKeepAliveContext !== null) return;
    pipewireAudioKeepAliveContext = new AudioContextClass();
    pipewireAudioKeepAliveGain = pipewireAudioKeepAliveContext.createGain();
    pipewireAudioKeepAliveGain.gain.value = 0.000001;
    if (typeof pipewireAudioKeepAliveContext.createConstantSource === "function") {
      pipewireAudioKeepAliveSource = pipewireAudioKeepAliveContext.createConstantSource();
      pipewireAudioKeepAliveSource.offset.value = 1;
    } else {
      pipewireAudioKeepAliveSource = pipewireAudioKeepAliveContext.createOscillator();
      pipewireAudioKeepAliveSource.frequency.value = 20;
    }
    pipewireAudioKeepAliveSource.connect(pipewireAudioKeepAliveGain);
    pipewireAudioKeepAliveGain.connect(pipewireAudioKeepAliveContext.destination);
    pipewireAudioKeepAliveSource.start();
    await pipewireAudioKeepAliveContext.resume().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  function audioEffectiveSource(pipewireTrackCount) {
    const displayTrackCount = stream.getAudioTracks().length - pipewireTrackCount;
    const pipewireTransport = pipewireAudioTransport || "pipewire";
    if (pipewireTrackCount > 0 && displayTrackCount > 0) return "chrome-get-display-media+" + pipewireTransport;
    if (pipewireTrackCount > 0) return pipewireTransport;
    if (displayTrackCount > 0) return "chrome-get-display-media";
    return null;
  }

  function connectSignal() {
    if (stopped) return;
    socket = new WebSocket(signalUrl());
    socket.addEventListener("open", () => post({status: "signaling-open"}));
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let message = null;
      try { message = JSON.parse(event.data); } catch { return; }
      void handleSignal(message);
    });
    socket.addEventListener("close", () => {
      closeAllPeers();
      post({status: "signaling-closed", peers: []});
      if (!stopped) window.setTimeout(connectSignal, 1000);
    });
    socket.addEventListener("error", () => post({status: "signaling-error"}));
  }

  async function handleSignal(message) {
    post({
      signal: {
        messageCount: state.signal.messageCount + 1,
        lastMessageType: typeof message.type === "string" ? message.type : null,
        lastMessageFrom: typeof message.from === "string" ? message.from : null,
        lastMessageTo: typeof message.to === "string" ? message.to : null,
        lastMessageAt: new Date().toISOString(),
      },
    });
    if (message.type === "hello") {
      post({status: "ready", peerId: message.peerId || config.peerId, room: message.room || config.room});
      return;
    }
    if (message.type === "peer-left") {
      closePeer(message.peerId);
      return;
    }
    if (message.from === config.peerId || typeof message.from !== "string") return;
    if (typeof message.to === "string" && message.to !== config.peerId) return;
    const peer = createPeer(message.from);
    if (message.type === "offer") {
      await peer.connection.setRemoteDescription(message.description);
      await attachStreamTracks(peer);
      const answer = tuneVideoAnswer(await peer.connection.createAnswer());
      await peer.connection.setLocalDescription(answer);
      await configureVideoSenders(peer.connection);
      sendSignal({type: "answer", to: message.from, description: publishSessionDescription(peer.connection.localDescription)});
      return;
    }
    if (message.type === "ice") await peer.connection.addIceCandidate(message.candidate).catch(() => undefined);
  }

  function createPeer(peerId) {
    const existing = peers.get(peerId);
    if (existing !== undefined) return existing;
    const connection = new RTCPeerConnection({iceServers: config.iceServers});
    const peer = {id: peerId, connection, channel: null, tracksAttached: false};
    peers.set(peerId, peer);
    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate === null) return;
      const candidate = event.candidate.toJSON();
      const publishedCandidate = publishIceCandidate(candidate);
      state.ice.candidateCount += 1;
      state.ice.lastCandidate = candidate;
      if (publishedCandidate === null) {
        state.ice.droppedCandidateCount += 1;
      } else {
        state.ice.publishedCandidateCount += 1;
        state.ice.lastPublishedCandidate = publishedCandidate;
      }
      post({ice: state.ice});
      if (publishedCandidate !== null) sendSignal({type: "ice", to: peerId, candidate: publishedCandidate});
    });
    connection.addEventListener("connectionstatechange", () => {
      post({status: connection.connectionState, peers: peerSnapshots()});
      if (connection.connectionState === "failed") post({lastError: "RTCPeerConnection failed"});
      if (connection.connectionState === "failed" || connection.connectionState === "closed") closePeer(peerId);
    });
    connection.addEventListener("iceconnectionstatechange", () => {
      post({status: "ice-" + connection.iceConnectionState, peers: peerSnapshots()});
    });
    connection.addEventListener("datachannel", (event) => attachDataChannel(peer, event.channel));
    post({status: "peer", peers: peerSnapshots()});
    return peer;
  }

  async function attachStreamTracks(peer) {
    if (peer.tracksAttached) return;
    for (const track of stream.getTracks()) {
      if (track.kind === "video") track.contentHint = config.videoContentHint;
      const attachment = await attachTrackToExistingTransceiver(peer.connection, track);
      if (track.kind === "video") await configureVideoSender(attachment.sender, attachment.transceiver);
    }
    peer.tracksAttached = true;
    ensureSenderStatsTimer();
  }

  async function configureVideoSenders(connection) {
    for (const transceiver of connection.getTransceivers()) {
      const sender = transceiver.sender;
      if (sender?.track?.kind !== "video") continue;
      await configureVideoSender(sender, transceiver);
    }
  }

  async function attachTrackToExistingTransceiver(connection, track) {
    const transceiver = connection.getTransceivers().find((candidate) => (
      candidate.receiver?.track?.kind === track.kind && candidate.sender?.track === null
    ));
    if (transceiver !== undefined) {
      transceiver.direction = "sendonly";
      await transceiver.sender.replaceTrack(track);
      return {sender: transceiver.sender, transceiver};
    }
    const sender = connection.addTrack(track, stream);
    const createdTransceiver = connection.getTransceivers().find((candidate) => candidate.sender === sender) || null;
    return {sender, transceiver: createdTransceiver};
  }

  async function configureVideoSender(sender, transceiver) {
    let parametersApplied = false;
    try {
      applyVideoCodecPreference(transceiver);
      if (typeof sender?.getParameters === "function" && typeof sender?.setParameters === "function") {
        const parameters = sender.getParameters();
        if (Array.isArray(parameters.encodings) && parameters.encodings.length > 0) {
          parameters.encodings = parameters.encodings.map((encoding) => ({
            ...encoding,
            maxBitrate: config.videoBitrate || 12_000_000,
            maxFramerate: config.maxFps || 60,
            scaleResolutionDownBy: 1,
          }));
          await sender.setParameters(parameters);
          parametersApplied = true;
        }
      }
      post({video: {parametersApplied, lastError: null}});
      void collectVideoSenderStats();
    } catch (error) {
      post({video: {parametersApplied, lastError: String(error?.message || error)}});
    }
  }

  function applyVideoCodecPreference(transceiver) {
    if (typeof transceiver?.setCodecPreferences !== "function") return;
    const capabilities = RTCRtpSender.getCapabilities?.("video");
    const codecs = Array.isArray(capabilities?.codecs) ? capabilities.codecs : [];
    if (codecs.length === 0) return;
    const preferredMime = "video/" + String(config.videoCodec || "").toUpperCase();
    const preferred = codecs.filter((codec) => String(codec.mimeType || "").toUpperCase() === preferredMime);
    if (preferred.length === 0) return;
    transceiver.setCodecPreferences([...preferred, ...codecs.filter((codec) => !preferred.includes(codec))]);
  }

  function tuneVideoAnswer(description) {
    if (description === null || typeof description?.sdp !== "string") return description;
    return {...description, sdp: tuneVideoSdp(description.sdp)};
  }

  function tuneVideoSdp(sdp) {
    const lines = sdp.split("\\r\\n");
    const preferredPayloads = new Set();
    const preferredCodec = String(config.videoCodec || "").toUpperCase();
    for (const line of lines) {
      const match = /^a=rtpmap:(\\d+)\\s+([^/\\s]+)/i.exec(line);
      if (match !== null && match[2].toUpperCase() === preferredCodec) preferredPayloads.add(match[1]);
    }
    if (preferredPayloads.size === 0) return sdp;
    const bitrateKbps = Math.max(512, Math.round((config.videoBitrate || 12_000_000) / 1000));
    const startBitrateKbps = Math.max(512, Math.min(bitrateKbps, 8000));
    const minBitrateKbps = Math.max(256, Math.min(startBitrateKbps, 3000));
    const bitrateParams = [
      "x-google-min-bitrate=" + minBitrateKbps,
      "x-google-start-bitrate=" + startBitrateKbps,
      "x-google-max-bitrate=" + bitrateKbps,
    ];
    const tuned = [];
    let inVideo = false;
    let videoBandwidthInserted = false;
    for (const line of lines) {
      if (line.startsWith("m=")) {
        inVideo = line.startsWith("m=video ");
        videoBandwidthInserted = false;
      }
      tuned.push(line);
      if (inVideo && !videoBandwidthInserted && line.startsWith("c=")) {
        tuned.push("b=AS:" + bitrateKbps);
        videoBandwidthInserted = true;
      }
      const fmtp = /^a=fmtp:(\\d+)\\s+(.+)$/i.exec(line);
      if (fmtp !== null && preferredPayloads.has(fmtp[1])) {
        const existing = fmtp[2];
        const append = bitrateParams.filter((param) => !existing.includes(param.split("=")[0] + "="));
        if (append.length > 0) tuned[tuned.length - 1] = "a=fmtp:" + fmtp[1] + " " + existing + ";" + append.join(";");
      }
      const rtpmap = /^a=rtpmap:(\\d+)\\s+/i.exec(line);
      if (rtpmap !== null && preferredPayloads.has(rtpmap[1])) {
        const hasFmtp = lines.some((candidate) => candidate.startsWith("a=fmtp:" + rtpmap[1] + " "));
        if (!hasFmtp) tuned.push("a=fmtp:" + rtpmap[1] + " " + bitrateParams.join(";"));
      }
    }
    return tuned.join("\\r\\n");
  }

  function ensureSenderStatsTimer() {
    if (senderStatsTimer !== null) return;
    senderStatsTimer = window.setInterval(() => {
      void collectVideoSenderStats();
    }, 1000);
    void collectVideoSenderStats();
  }

  async function collectVideoSenderStats() {
    const peerStats = [];
    for (const peer of peers.values()) {
      const selectedPair = await selectedCandidatePairStats(peer.connection);
      for (const transceiver of peer.connection.getTransceivers()) {
        const sender = transceiver.sender;
        if (sender?.track?.kind !== "video" || typeof sender.getStats !== "function") continue;
        const reports = await sender.getStats().catch(() => null);
        if (reports === null) continue;
        const codecs = new Map();
        let outbound = null;
        reports.forEach((report) => {
          if (report.type === "codec") codecs.set(report.id, report);
          if (report.type === "outbound-rtp" && report.kind === "video" && !report.isRemote) outbound = report;
        });
        if (outbound === null) continue;
        const codec = codecs.get(outbound.codecId) || null;
        peerStats.push({
          peerId: peer.id,
          trackReadyState: sender.track?.readyState || null,
          codec: codec?.mimeType || null,
          sdpFmtpLine: codec?.sdpFmtpLine || null,
          frameWidth: outbound.frameWidth ?? null,
          frameHeight: outbound.frameHeight ?? null,
          framesPerSecond: outbound.framesPerSecond ?? null,
          framesEncoded: outbound.framesEncoded ?? null,
          framesSent: outbound.framesSent ?? null,
          keyFramesEncoded: outbound.keyFramesEncoded ?? null,
          hugeFramesSent: outbound.hugeFramesSent ?? null,
          bytesSent: outbound.bytesSent ?? null,
          packetsSent: outbound.packetsSent ?? null,
          retransmittedPacketsSent: outbound.retransmittedPacketsSent ?? null,
          qpSum: outbound.qpSum ?? null,
          totalEncodeTime: outbound.totalEncodeTime ?? null,
          qualityLimitationReason: outbound.qualityLimitationReason ?? null,
          qualityLimitationDurations: outbound.qualityLimitationDurations ?? null,
          qualityLimitationResolutionChanges: outbound.qualityLimitationResolutionChanges ?? null,
          encoderImplementation: outbound.encoderImplementation ?? null,
          powerEfficientEncoder: outbound.powerEfficientEncoder ?? null,
          selectedCandidatePair: selectedPair,
        });
      }
    }
    post({video: {senderStats: {updatedAt: new Date().toISOString(), peers: peerStats}}});
  }

  async function selectedCandidatePairStats(connection) {
    const reports = await connection.getStats().catch(() => null);
    if (reports === null) return null;
    let selectedPair = null;
    const candidates = new Map();
    reports.forEach((report) => {
      if (report.type === "local-candidate" || report.type === "remote-candidate") candidates.set(report.id, report);
      if (report.type === "candidate-pair" && report.selected === true) selectedPair = report;
    });
    if (selectedPair === null) {
      reports.forEach((report) => {
        if (selectedPair === null && report.type === "transport" && typeof report.selectedCandidatePairId === "string") {
          selectedPair = reports.get(report.selectedCandidatePairId) || null;
        }
      });
    }
    if (selectedPair === null) return null;
    const local = candidates.get(selectedPair.localCandidateId) || null;
    const remote = candidates.get(selectedPair.remoteCandidateId) || null;
    return {
      state: selectedPair.state || null,
      nominated: selectedPair.nominated ?? null,
      currentRoundTripTime: selectedPair.currentRoundTripTime ?? null,
      availableOutgoingBitrate: selectedPair.availableOutgoingBitrate ?? null,
      bytesSent: selectedPair.bytesSent ?? null,
      bytesReceived: selectedPair.bytesReceived ?? null,
      requestsSent: selectedPair.requestsSent ?? null,
      responsesReceived: selectedPair.responsesReceived ?? null,
      local: local === null ? null : {
        candidateType: local.candidateType || null,
        protocol: local.protocol || null,
        address: local.address || local.ip || null,
        port: local.port || null,
      },
      remote: remote === null ? null : {
        candidateType: remote.candidateType || null,
        protocol: remote.protocol || null,
        address: remote.address || remote.ip || null,
        port: remote.port || null,
      },
    };
  }

  function attachDataChannel(peer, channel) {
    peer.channel = channel;
    channel.addEventListener("open", () => {
      channel.send(JSON.stringify({type: "hello", peerId: config.peerId, role: "remote-desktop-host", transport: "chrome-webrtc"}));
      post({status: "control-open", peers: peerSnapshots()});
    });
    channel.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let command = null;
      try { command = JSON.parse(event.data); } catch { return; }
      void handleControl(channel, command);
    });
    channel.addEventListener("close", () => {
      if (peer.channel === channel) peer.channel = null;
      post({status: "control-closed", peers: peerSnapshots()});
    });
  }

  async function handleControl(channel, command) {
    if (command?.type === "hello") {
      channel.send(JSON.stringify({type: "control-result", command: "hello", ok: true}));
      return;
    }
    try {
      const response = await fetch(config.inputUrl, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(command),
      });
      const result = await response.json().catch(() => ({}));
      channel.send(JSON.stringify({type: "control-result", command: command.type || "input", ok: response.ok, result}));
    } catch (error) {
      channel.send(JSON.stringify({type: "control-result", command: command?.type || "input", ok: false, error: String(error?.message || error)}));
    }
  }

  function sendSignal(message) {
    if (socket !== null && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function peerSnapshots() {
    return [...peers.values()].map((peer) => ({
      id: peer.id,
      connectionState: peer.connection.connectionState,
      channelState: peer.channel?.readyState || "none",
    }));
  }

  function closePeer(peerId) {
    const peer = peers.get(peerId);
    if (peer === undefined) return;
    peers.delete(peerId);
    peer.channel?.close();
    peer.connection.close();
    post({peers: peerSnapshots()});
  }

  function closeAllPeers() {
    for (const peerId of [...peers.keys()]) closePeer(peerId);
  }

  function publishSessionDescription(description) {
    if (description === null || typeof description?.sdp !== "string") return description;
    return {
      type: description.type,
      sdp: description.sdp.split("\\r\\n").map((line) => {
        if (!line.startsWith("a=candidate:")) return line;
        const candidateLine = rewriteIceCandidateLine(line.slice(2));
        return candidateLine === null ? null : "a=" + candidateLine;
      }).filter((line) => line !== null).join("\\r\\n"),
    };
  }

  function publishIceCandidate(candidate) {
    if (candidate === null || typeof candidate !== "object" || typeof candidate.candidate !== "string") return candidate;
    const candidateLine = rewriteIceCandidateLine(candidate.candidate);
    if (candidateLine === null) return null;
    return candidateLine === candidate.candidate ? candidate : {...candidate, candidate: candidateLine};
  }

  function rewriteIceCandidateLine(line) {
    const parts = String(line || "").trim().split(/\\s+/);
    if (!parts[0]?.startsWith("candidate:")) return line;
    const protocol = String(parts[2] || "").toLowerCase();
    const type = candidateField(parts, "typ");
    if (type !== "host" || protocol !== "udp") return line;
    if (!config.publicIceHost) return line;
    const next = [...parts];
    next[4] = config.publicIceHost;
    return next.join(" ");
  }

  function candidateField(parts, key) {
    const index = parts.indexOf(key);
    return index >= 0 ? parts[index + 1] || null : null;
  }

  window.__metaforChromeRtc = {
    state,
    stop() {
      stopped = true;
      socket?.close();
      socket = null;
      closeAllPeers();
      stream?.getTracks?.().forEach((track) => track.stop());
      if (pipewireAudioReconnectTimer !== null) clearTimeout(pipewireAudioReconnectTimer);
      if (senderStatsTimer !== null) clearInterval(senderStatsTimer);
      pipewireAudioPcmAbort?.abort?.();
      try { pipewireAudioGeneratorWriter?.close?.(); } catch {}
      try { pipewireAudioGenerator?.stop?.(); } catch {}
      pipewireAudioTracks.forEach((track) => track.stop());
      try { pipewireAudioKeepAliveSource?.stop?.(); } catch {}
      pipewireAudioKeepAliveGain?.disconnect?.();
      void pipewireAudioKeepAliveContext?.close?.();
      post({status: "stopped"});
    },
  };

  void start().catch((error) => post({status: "failed", lastError: String(error?.name || "Error") + ": " + String(error?.message || error)}));
  return state;
})()
`
}

async function sendAudioPcmStream(req, res) {
  const targets = resolveAudioTargets()
  if (targets.length === 0) {
    sendJson(res, 503, {ok: false, error: state.audioPcm.lastError || "PipeWire audio sink is not available"})
    return
  }

  state.audioPcm.clients += 1
  state.audioPcm.target = targets.join(",")
  state.audioPcm.lastStartedAt = new Date().toISOString()
  state.audioPcm.lastError = null
  for (const target of targets) ensureAudioTargetAudible(target)

  const gst = spawn("gst-launch-1.0", audioPcmGstArgs(targets), {stdio: ["ignore", "pipe", "pipe"]})

  let settled = false
  let stderr = ""
  const stop = () => {
    if (settled) return
    settled = true
    state.audioPcm.clients = Math.max(0, state.audioPcm.clients - 1)
    stopChild(gst)
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "connection": "close",
    "content-type": "application/octet-stream",
    "x-meta-audio-format": state.audioPcm.format,
    "x-meta-audio-rate": String(state.audioPcm.sampleRate),
    "x-meta-audio-channels": String(state.audioPcm.channels),
    ...corsHeaders(),
  })

  gst.stdout.pipe(res)
  gst.stderr.on("data", (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 4096) stderr = stderr.slice(-4096)
  })
  gst.on("error", (error) => {
    state.audioPcm.lastError = error.message
    state.remoteDesktop.audio.lastError = error.message
    stop()
  })
  gst.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && !res.destroyed) {
      const message = `gst-launch pcm audio failed code=${code} signal=${signal ?? "null"} ${stderr.trim()}`.trim()
      state.audioPcm.lastError = message
      state.remoteDesktop.audio.lastError = message
    }
    stop()
  })
  req.on("close", stop)
  res.on("close", stop)
}

function resolveAudioTargets() {
  if (AUDIO_TARGET.length > 0) return [AUDIO_TARGET]

  try {
    const result = spawnSync("pw-dump", {encoding: "utf8", maxBuffer: 8 * 1024 * 1024})
    if (result.status !== 0) throw new Error((result.stderr || "pw-dump failed").trim())
    const nodes = JSON.parse(result.stdout)
    const chromeStreamTargets = resolveChromeAudioStreamTargets(nodes)
    if (chromeStreamTargets.length > 0) return chromeStreamTargets
    const sinks = nodes
      .filter((node) => node?.type === "PipeWire:Interface:Node" && node?.info?.props?.["media.class"] === "Audio/Sink")
      .map((node) => ({id: node.id, state: node.info?.state || "", name: node.info?.props?.["node.name"] || ""}))
      .filter((node) => Number.isFinite(Number(node.id)))
    const target = sinks.find((node) => node.state === "running") ?? sinks[0] ?? null
    if (target !== null) return [String(target.id)]
    throw new Error("pw-dump returned no Audio/Sink nodes")
  } catch (error) {
    state.audioPcm.lastError = error instanceof Error ? error.message : String(error)
    state.remoteDesktop.audio.lastError = state.audioPcm.lastError
    return []
  }
}

function resolveChromeAudioStreamTargets(nodes) {
  if (!Array.isArray(nodes)) return []
  const streams = nodes
    .filter((node) => node?.type === "PipeWire:Interface:Node" && node?.info?.props?.["media.class"] === "Stream/Output/Audio")
    .map((node) => ({
      id: node.id,
      state: node.info?.state || "",
      app: String(node.info?.props?.["application.name"] || ""),
      binary: String(node.info?.props?.["application.process.binary"] || ""),
      name: String(node.info?.props?.["node.name"] || ""),
      mediaName: String(node.info?.props?.["media.name"] || ""),
    }))
    .filter((node) => Number.isFinite(Number(node.id)))
  const chromeStreams = streams.filter((node) => (
    node.app === "Google Chrome"
    || node.binary === "chrome"
    || node.name === "Google Chrome"
  ))
  return uniqueStrings([
    ...chromeStreams.filter((node) => node.state === "running").map((node) => String(node.id)),
    ...chromeStreams.filter((node) => node.mediaName === "Playback").map((node) => String(node.id)),
    ...chromeStreams.map((node) => String(node.id)),
  ]).slice(0, 12)
}

function audioPcmGstArgs(targets) {
  const output = [
    "-q",
    ...(targets.length > 1 ? ["audiomixer", "name=mix"] : ["pipewiresrc", `target-object=${targets[0]}`]),
    "!",
    "audioconvert",
    "!",
    "audioresample",
    "!",
    `audio/x-raw,format=${state.audioPcm.format},rate=${state.audioPcm.sampleRate},channels=${state.audioPcm.channels}`,
    "!",
    "fdsink",
    "fd=1",
  ]
  if (targets.length <= 1) return output
  const inputs = []
  for (const target of targets) {
    inputs.push(
      "pipewiresrc",
      `target-object=${target}`,
      "!",
      "queue",
      "!",
      "audioconvert",
      "!",
      "audioresample",
      "!",
      `audio/x-raw,format=${state.audioPcm.format},rate=${state.audioPcm.sampleRate},channels=${state.audioPcm.channels}`,
      "!",
      "mix.",
    )
  }
  return [...output, ...inputs]
}

function uniqueStrings(values) {
  return [...new Set(values)]
}

function ensureAudioTargetAudible(target) {
  if (!AUDIO_UNMUTE) return
  try {
    spawnSync("wpctl", ["set-mute", String(target), "0"], {encoding: "utf8"})
    if (AUDIO_VOLUME.length > 0) spawnSync("wpctl", ["set-volume", String(target), AUDIO_VOLUME], {encoding: "utf8"})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.audioPcm.lastError = message
    state.remoteDesktop.audio.lastError = message
  }
}

async function sendDesktopInput(body) {
  const type = typeof body.type === "string" ? body.type : ""
  if (type.length === 0) {
    const error = new Error("desktop input requires string field 'type'")
    error.statusCode = 400
    throw error
  }
  try {
    const input = await sendHelperInput(desktopInputBody(body))
    const transport = typeof input.transport === "string" ? input.transport : "mutter-dbus"
    state.input.transport = transport
    state.remoteDesktop.input.transport = transport
    state.remoteDesktop.input.lastError = null
    recordDesktopInputAck(type)
    return {ok: true, input, state: publicState()}
  } catch (desktopError) {
    state.remoteDesktop.input.lastError = desktopError instanceof Error ? desktopError.message : String(desktopError)
    state.input.lastError = state.remoteDesktop.input.lastError
    throw desktopError
  }
}

function recordDesktopInputAck(type) {
  state.input.lastAt = new Date().toISOString()
  state.input.lastCommand = type
  state.input.lastAck += 1
  state.input.lastError = null
}

function desktopInputBody(body) {
  const next = {...body}
  if (body !== null && typeof body === "object" && ("x" in body || "y" in body)) {
    const point = desktopInputPoint(body)
    next.x = point.x
    next.y = point.y
  }
  return next
}

function desktopInputPoint(body) {
  return {
    x: Math.round(normalizeFrameCoordinate(body.x, "x", WIDTH, body.frameW)),
    y: Math.round(normalizeFrameCoordinate(body.y, "y", HEIGHT, body.frameH)),
  }
}

function normalizeFrameCoordinate(value, name, fallbackMax, frameMax) {
  const raw = Number(value)
  const sourceMax = Number(frameMax)
  const numeric = Number.isFinite(sourceMax) && sourceMax > 0 && sourceMax !== fallbackMax
    ? (raw / sourceMax) * fallbackMax
    : raw
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > fallbackMax) {
    const error = new Error(`${name} must be a number between 0 and ${fallbackMax}`)
    error.statusCode = 400
    throw error
  }
  return numeric
}

async function withCdpPage(fn) {
  const wsUrl = (await cdpPageTarget()).webSocketDebuggerUrl
  const cdp = await openCdpSession(wsUrl)
  try {
    return await fn(cdp)
  } finally {
    cdp.close()
  }
}

async function withCdpChromeRtcSenderPage(fn) {
  const wsUrl = (await cdpChromeRtcSenderTarget()).webSocketDebuggerUrl
  const cdp = await openCdpSession(wsUrl)
  try {
    return await fn(cdp)
  } finally {
    cdp.close()
  }
}

async function withCdpBrowser(fn) {
  const version = await fetchChromeJson("/json/version")
  if (typeof version?.webSocketDebuggerUrl !== "string") {
    const error = new Error("Chrome CDP browser target is not available")
    error.statusCode = 503
    throw error
  }
  const cdp = await openCdpSession(version.webSocketDebuggerUrl)
  try {
    return await fn(cdp)
  } finally {
    cdp.close()
  }
}

async function cdpChromeRtcSenderTarget() {
  const existing = await findChromeRtcSenderTarget()
  if (existing !== null) return existing
  await withCdpBrowser(async (browserCdp) => {
    await browserCdp.send("Target.createTarget", {
      url: CHROME_RTC_SENDER_URL,
      background: true,
    })
  })
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const target = await findChromeRtcSenderTarget()
    if (target !== null) return target
    await sleep(100)
  }
  const error = new Error("Chrome RTC sender target is not available")
  error.statusCode = 503
  throw error
}

async function findChromeRtcSenderTarget() {
  const targets = await fetchChromeJson("/json/list")
  if (!Array.isArray(targets)) return null
  const senderTargets = targets.filter((target) => (
    target?.type === "page"
    && typeof target.webSocketDebuggerUrl === "string"
    && isChromeRtcSenderTarget(target)
  ))
  if (senderTargets.length === 0) return null
  if (senderTargets.length === 1) return senderTargets[0]

  const scored = []
  for (const target of senderTargets) {
    const runtimeState = await chromeRtcSenderTargetRuntimeState(target).catch(() => null)
    scored.push({target, score: chromeRtcSenderTargetScore(runtimeState)})
  }
  scored.sort((left, right) => right.score - left.score)
  const primary = scored[0]?.target ?? senderTargets[0]
  const duplicates = senderTargets.filter((target) => target.id !== primary.id)
  await closeChromeRtcSenderDuplicateTargets(duplicates).catch((error) => {
    state.remoteDesktop.rtc.lastError = `Chrome RTC sender duplicate cleanup failed: ${error instanceof Error ? error.message : String(error)}`
  })
  return primary
}

async function chromeRtcSenderTargetRuntimeState(target) {
  const cdp = await openCdpSession(target.webSocketDebuggerUrl)
  try {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "window.__metaforChromeRtcState ? JSON.parse(JSON.stringify(window.__metaforChromeRtcState)) : null",
      returnByValue: true,
    })
    return result?.result?.value ?? null
  } finally {
    cdp.close()
  }
}

function chromeRtcSenderTargetScore(runtimeState) {
  if (runtimeState === null || typeof runtimeState !== "object") return 0
  const peers = Array.isArray(runtimeState.peers) ? runtimeState.peers : []
  const openPeerCount = peers.filter((peer) => peer?.channelState === "open" || peer?.connectionState === "connected").length
  if (runtimeState.status === "control-open") return 100 + openPeerCount
  if (runtimeState.status === "connected") return 80 + openPeerCount
  if (runtimeState.status === "running") return 60 + openPeerCount
  if (runtimeState.status === "existing") return 40 + openPeerCount
  return 10 + openPeerCount
}

async function closeChromeRtcSenderDuplicateTargets(targets) {
  if (targets.length === 0) return
  await withCdpBrowser(async (browserCdp) => {
    for (const target of targets) {
      if (typeof target.id !== "string") continue
      await browserCdp.send("Target.closeTarget", {targetId: target.id}).catch((error) => {
        console.warn(`[metafor-remote-desktop] failed to close duplicate Chrome RTC sender target ${target.id}:`, error.message)
      })
    }
  })
}

async function cdpPageTarget() {
  const targets = await fetchChromeJson("/json/list")
  const pages = Array.isArray(targets)
    ? targets.filter((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    : []
  const visiblePages = pages.filter((target) => !isChromeRtcSenderTarget(target) && !isChromeInternalTarget(target))
  const page = visiblePages.find((target) => target.url === TARGET_URL)
    ?? visiblePages.find((target) => typeof target.url === "string" && target.url.startsWith(TARGET_URL))
    ?? visiblePages.find((target) => isSsoRedirectForTarget(target.url))
    ?? visiblePages[0]
    ?? pages.find((target) => !isChromeInternalTarget(target))
    ?? pages[0]
    ?? null
  if (page === null) {
    const error = new Error("Chrome CDP page target is not available")
    error.statusCode = 503
    throw error
  }
  return page
}

function isChromeRtcSenderTarget(target) {
  return typeof target?.url === "string" && target.url.startsWith(CHROME_RTC_SENDER_URL)
}

function isChromeInternalTarget(target) {
  return typeof target?.url === "string" && (target.url.startsWith("chrome://") || target.url.startsWith("devtools://"))
}

function isSsoRedirectForTarget(url) {
  if (typeof url !== "string") return false
  try {
    const parsed = new URL(url)
    const next = parsed.searchParams.get("next")
    return next === TARGET_URL || (next !== null && next.startsWith(TARGET_URL))
  } catch {
    return false
  }
}

async function fetchChromeJson(pathname) {
  let lastError = "Chrome CDP unavailable"
  for (const baseUrl of CHROME_DEBUG_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${pathname}`, {signal: AbortSignal.timeout(CDP_TIMEOUT_MS)})
      if (response.ok) return await response.json()
      lastError = `${baseUrl}${pathname} ${response.status} ${response.statusText}`
    } catch (error) {
      lastError = error instanceof Error ? `${baseUrl}${pathname} ${error.message}` : `${baseUrl}${pathname} failed`
    }
  }
  const error = new Error(lastError)
  error.statusCode = 503
  throw error
}

async function openCdpSession(wsUrl) {
  const socket = await openWebSocket(wsUrl)
  let nextId = 1
  const pending = new Map()
  socket.addEventListener("message", (event) => {
    let message = null
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    if (typeof message.id !== "number") return
    const request = pending.get(message.id)
    if (request === undefined) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error !== undefined) {
      request.reject(new Error(message.error.message || JSON.stringify(message.error)))
    } else {
      request.resolve(message.result ?? {})
    }
  })
  const closePending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }
  socket.addEventListener("close", () => closePending(new Error("Chrome CDP WebSocket closed")))
  socket.addEventListener("error", () => closePending(new Error("Chrome CDP WebSocket error")))
  return {
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`Chrome CDP command timed out: ${method}`))
        }, CDP_TIMEOUT_MS)
        pending.set(id, {resolve, reject, timer})
        socket.send(JSON.stringify({id, method, params}))
      })
    },
    close() {
      closePending(new Error("Chrome CDP session closed"))
      socket.close()
    },
  }
}

function openWebSocket(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error("Chrome CDP WebSocket open timed out"))
    }, CDP_TIMEOUT_MS)
    socket.addEventListener("open", () => {
      clearTimeout(timer)
      resolve(socket)
    }, {once: true})
    socket.addEventListener("error", () => {
      clearTimeout(timer)
      reject(new Error("Chrome CDP WebSocket open failed"))
    }, {once: true})
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function envFlag(value) {
  if (typeof value !== "string" || value.trim().length === 0) return false
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase())
}

function envNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeChromeAudioSource(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "display" || normalized === "pipewire" || normalized === "both") return normalized
  return "display"
}

function normalizeChromeVideoCodec(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (normalized === "VP8" || normalized === "VP9" || normalized === "H264" || normalized === "AV1") return normalized
  return null
}

function normalizeChromeVideoContentHint(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "motion" || normalized === "detail" || normalized === "text") return normalized
  return "detail"
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

async function readJson(req) {
  let raw = ""
  for await (const chunk of req) raw += chunk
  if (raw.trim().length === 0) return {}
  return JSON.parse(raw)
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  })
  res.end(body)
}

function stopChild(child) {
  if (child === null || child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
}

process.on("SIGINT", () => shutdown())
process.on("SIGTERM", () => shutdown())

function shutdown() {
  stopChild(browser)
  stopChild(helper)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 1000).unref()
}
