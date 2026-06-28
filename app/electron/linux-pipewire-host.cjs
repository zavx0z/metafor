const {spawn, spawnSync} = require("node:child_process")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")

const HOST = process.env.METAFOR_REMOTE_DESKTOP_HOST_BIND || "127.0.0.1"
const PORT = Number(process.env.METAFOR_REMOTE_DESKTOP_HOST_PORT || process.env.METAFOR_ELECTRON_HOST_PORT || 32123)
const WIDTH = Number(process.env.METAFOR_REMOTE_DESKTOP_WIDTH || 1920)
const HEIGHT = Number(process.env.METAFOR_REMOTE_DESKTOP_HEIGHT || 1080)
const FPS = Number(process.env.METAFOR_REMOTE_DESKTOP_RTC_FPS || process.env.METAFOR_REMOTE_DESKTOP_SNAPSHOT_FPS || 30)
const MJPEG_BOUNDARY = "metafor-desktop-frame"
const VIDEO_BITRATE = Number(process.env.METAFOR_REMOTE_DESKTOP_VIDEO_BITRATE || process.env.METAFOR_REMOTE_DESKTOP_RTC_VIDEO_BITRATE || 8_000_000)
const VIDEO_CODEC = normalizeChromeVideoCodec(process.env.METAFOR_REMOTE_DESKTOP_RTC_VIDEO_CODEC || "")
const VIDEO_CONTENT_HINT = normalizeChromeVideoContentHint(process.env.METAFOR_REMOTE_DESKTOP_RTC_CONTENT_HINT || "detail")
const AUDIO_BITRATE = Number(process.env.METAFOR_REMOTE_DESKTOP_AUDIO_BITRATE || 128000)
const AUDIO_TARGET = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_TARGET || "").trim()
const AUDIO_UNMUTE = process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE === undefined
  ? true
  : !["0", "false", "no", "off"].includes(process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE.trim().toLowerCase())
const AUDIO_VOLUME = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_VOLUME || "0.70").trim()
const TARGET_URL = process.env.METAFOR_URL || "http://10.66.0.10:3004/"
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
const CHROME_RTC_SIGNAL_URL = process.env.METAFOR_REMOTE_DESKTOP_SIGNAL_URL || "ws://10.66.0.10:6500/webrtc/signaling"
const CHROME_RTC_ROOM = process.env.METAFOR_REMOTE_DESKTOP_RTC_ROOM || "remote-desktop"
const CHROME_RTC_PEER_ID = process.env.METAFOR_REMOTE_DESKTOP_RTC_PEER_ID || "electron-desktop"
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
const CHROME_RTC_CAPTURE_SURFACE = normalizeChromeCaptureSurface(process.env.METAFOR_REMOTE_DESKTOP_CHROME_CAPTURE_SURFACE || "monitor")
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
const HELPER = path.join(__dirname, "mutter-pipewire-helper.py")

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
  snapshot: {
    pending: false,
    capturedAt: null,
    bytes: 0,
    error: null,
  },
  mjpeg: {
    clients: 0,
    lastStartedAt: null,
    lastError: null,
  },
  videoWebm: {
    clients: 0,
    bitrate: VIDEO_BITRATE,
    lastStartedAt: null,
    lastError: null,
  },
  audioWebm: {
    clients: 0,
    target: null,
    lastStartedAt: null,
    lastError: null,
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
    status: CHROME_RTC_ENABLED ? "chrome-rtc-starting" : "snapshot-fallback",
    transport: CHROME_RTC_ENABLED ? "chrome-webrtc" : "pipewire-snapshot",
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
      transport: "pipewire-webm",
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
  if (req.method === "POST" && url.pathname === "/desktop/rtc/restart") {
    if (CHROME_RTC_ENABLED && browser !== null && browser.exitCode === null && browser.signalCode === null) {
      await startChromeRtcSender({force: true})
    } else {
      restart()
    }
    sendJson(res, 202, {ok: true, remoteDesktop: publicState().remoteDesktop})
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/snapshot") {
    const png = await captureSnapshot()
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "image/png",
      "content-length": png.length,
      ...corsHeaders(),
      "x-meta-screen-target": "mutter-virtual",
      "x-meta-caption": "Mutter PipeWire desktop",
    })
    res.end(png)
    return
  }
  if (req.method === "GET" && (url.pathname === "/desktop/stream.mjpeg" || url.pathname === "/desktop/stream")) {
    await sendMjpegStream(req, res)
    return
  }
  if (req.method === "GET" && (url.pathname === "/desktop/video.webm" || url.pathname === "/desktop/video")) {
    await sendVideoWebmStream(req, res)
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/audio.pcm") {
    await sendAudioPcmStream(req, res)
    return
  }
  if (req.method === "GET" && (url.pathname === "/desktop/audio.webm" || url.pathname === "/desktop/audio")) {
    await sendAudioWebmStream(req, res)
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
  if (payload.type === "eisReady") {
    state.input.transport = "mutter-eis"
    state.remoteDesktop.input.transport = "mutter-eis"
    state.remoteDesktop.input.lastError = null
    state.remoteDesktop.input.region = payload.region ?? null
    return
  }
  if (payload.type === "eisLog") {
    const line = String(payload.line || "")
    if (line.length > 0) console.error(`[metafor-remote-desktop eis] ${line}`)
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
  const securityFlags = insecureOriginSecurityFlags(url)
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
    fs.mkdirSync(defaultProfileDir, {recursive: true})
    let preferences = {}
    if (fs.existsSync(preferencesPath)) {
      preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"))
    }
    preferences.webrtc = {
      ...(preferences.webrtc && typeof preferences.webrtc === "object" ? preferences.webrtc : {}),
      udp_port_range: CHROME_RTC_UDP_PORT_RANGE,
    }
    fs.writeFileSync(preferencesPath, JSON.stringify(preferences, null, 2))
  } catch (error) {
    state.remoteDesktop.rtc.lastError = error instanceof Error ? error.message : String(error)
  }
}

function insecureOriginSecurityFlags(url) {
  try {
    const origin = new URL(url).origin
    if (!origin.startsWith("http://")) return []
    return [`--unsafely-treat-insecure-origin-as-secure=${origin}`]
  } catch {
    return []
  }
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
        await withCdpPage(async (cdp) => {
          await cdp.send("Page.bringToFront").catch(() => undefined)
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
    return publicState().remoteDesktop
  } finally {
    chromeRtcStarting = false
  }
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
  return await withCdpPage(async (cdp) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression: "window.__metaforChromeRtcState ? JSON.parse(JSON.stringify(window.__metaforChromeRtcState)) : null",
      returnByValue: true,
    })
    const value = result?.result?.value ?? null
    if (value !== null && typeof value === "object") postChromeRtcState(value)
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
    inputUrl: `http://${HOST}:${PORT}/desktop/input`,
    audioUrl: `http://${HOST}:${PORT}/desktop/audio.webm`,
    audioPcmUrl: `http://${HOST}:${PORT}/desktop/audio.pcm`,
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
    lastError: null,
    updatedAt: null,
  };
  let socket = null;
  let stream = null;
  let pipewireAudioContext = null;
  let pipewireAudioElement = null;
  let pipewireAudioSource = null;
  let pipewireAudioDestination = null;
  let pipewireAudioSilence = null;
  let pipewireAudioDriverGain = null;
  let pipewireAudioDriverSource = null;
  let pipewireAudioCaptureStream = null;
  let pipewireAudioTracks = [];
  let pipewireAudioTransport = null;
  let pipewireAudioGenerator = null;
  let pipewireAudioGeneratorWriter = null;
  let pipewireAudioGeneratorTimestampUs = 0;
  let pipewireAudioGeneratorRemainder = new Uint8Array(0);
  let pipewireAudioKeepAliveContext = null;
  let pipewireAudioKeepAliveGain = null;
  let pipewireAudioKeepAliveSource = null;
  let pipewireAudioRefreshTimer = null;
  let senderStatsTimer = null;
  const peers = new Map();

  window.__metaforChromeRtcState = state;

  function post(patch) {
    if (patch && typeof patch === "object") {
      if (patch.capture && typeof patch.capture === "object") Object.assign(state.capture, patch.capture);
      if (patch.audio && typeof patch.audio === "object") Object.assign(state.audio, patch.audio);
      if (patch.video && typeof patch.video === "object") Object.assign(state.video, patch.video);
      const rest = {...patch};
      delete rest.capture;
      delete rest.audio;
      delete rest.video;
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
    });
    connectSignal();
  }

  async function startPipeWireAudioCapture() {
    if (!config.audio || (config.audioSource !== "pipewire" && config.audioSource !== "both")) return [];
    await startChromeAudioOutputKeepAlive();
    try {
      const tracks = await startPipeWirePcmGeneratorAudioCapture();
      pipewireAudioRefreshTimer = setInterval(() => {
        startPipeWirePcmGeneratorFetch();
      }, 5000);
      return tracks;
    } catch (error) {
      post({audio: {lastError: "pipewire pcm generator capture failed: " + String(error?.message || error)}});
    }
    try {
      const capture = await createPipeWireAudioElementCapture();
      await installPipeWireAudioTracks(capture.tracks, "pipewire-webm-media-capture-stream");
      activatePipeWireAudioElement(capture);
      pipewireAudioRefreshTimer = setInterval(() => {
        void refreshPipeWireAudioElementCapture();
      }, 5000);
      return capture.tracks;
    } catch (error) {
      post({audio: {lastError: "pipewire media element capture failed: " + String(error?.message || error)}});
    }
    const tracks = await startPipeWirePcmAudioCapture();
    pipewireAudioRefreshTimer = setInterval(() => {
      startPipeWirePcmFetch();
    }, 5000);
    return tracks;
  }

  async function createPipeWireAudioElementCapture() {
    const element = document.createElement("audio");
    element.autoplay = true;
    element.controls = false;
    element.crossOrigin = "anonymous";
    element.muted = true;
    element.preload = "auto";
    element.src = config.audioUrl + "?t=" + Date.now();
    element.style.display = "none";
    document.body.appendChild(element);
    const captureStream = typeof element.captureStream === "function"
      ? element.captureStream()
      : typeof element.mozCaptureStream === "function"
        ? element.mozCaptureStream()
        : null;
    if (captureStream === null) {
      element.remove();
      throw new Error("HTMLAudioElement.captureStream is not available");
    }
    let tracks = [];
    try {
      const playPromise = element.play();
      void playPromise.catch(() => undefined);
      await Promise.race([
        playPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("media element play timeout")), 1500)),
      ]);
      tracks = await waitForPipeWireAudioElementTracks(captureStream);
    } catch (error) {
      cleanupPipeWireAudioElement(element, captureStream);
      throw error;
    }
    if (tracks.length === 0) {
      cleanupPipeWireAudioElement(element, captureStream);
      throw new Error("media element capture produced no audio tracks");
    }
    window.__metaforPipewireAudioDebug = () => ({
      transport: "pipewire-webm-media-capture-stream",
      elementReadyState: element.readyState,
      elementNetworkState: element.networkState,
      elementPaused: element.paused,
      elementMuted: element.muted,
      elementCurrentTime: element.currentTime,
      trackCount: captureStream.getAudioTracks().length,
      tracks: captureStream.getAudioTracks().map((track) => ({
        id: track.id,
        readyState: track.readyState,
        muted: track.muted,
        enabled: track.enabled,
      })),
    });
    return {element, captureStream, tracks};
  }

  async function waitForPipeWireAudioElementTracks(captureStream) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 2500) {
      const tracks = captureStream.getAudioTracks();
      if (tracks.length > 0) return tracks;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return captureStream.getAudioTracks();
  }

  async function refreshPipeWireAudioElementCapture() {
    try {
      const capture = await createPipeWireAudioElementCapture();
      await installPipeWireAudioTracks(capture.tracks, "pipewire-webm-media-capture-stream");
      activatePipeWireAudioElement(capture);
      post({audio: {effectiveSource: "pipewire-webm-media-capture-stream", trackCount: capture.tracks.length, lastError: null}});
    } catch (error) {
      post({audio: {lastError: "pipewire media element refresh failed: " + String(error?.message || error)}});
    }
  }

  function activatePipeWireAudioElement(capture) {
    const previousElement = pipewireAudioElement;
    const previousStream = pipewireAudioCaptureStream;
    pipewireAudioElement = capture.element;
    pipewireAudioCaptureStream = capture.captureStream;
    cleanupPipeWireAudioElement(previousElement, previousStream);
  }

  function cleanupPipeWireAudioElement(element, captureStream) {
    try { element?.pause?.(); } catch {}
    try { element?.removeAttribute?.("src"); } catch {}
    try { element?.load?.(); } catch {}
    element?.remove?.();
    captureStream?.getTracks?.().forEach((track) => track.stop());
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
    pipewireAudioGeneratorDebug.startedAt = new Date().toISOString();
    pipewireAudioGeneratorDebug.lastError = null;
    await installPipeWireAudioTracks([pipewireAudioGenerator], "pipewire-pcm-track-generator-stream");
    startPipeWirePcmGeneratorFetch();
    window.__metaforPipewireAudioDebug = () => ({
      transport: "pipewire-pcm-track-generator-stream",
      trackReadyState: pipewireAudioGenerator?.readyState ?? null,
      trackMuted: pipewireAudioGenerator?.muted ?? null,
      writableDesiredSize: pipewireAudioGeneratorWriter?.desiredSize ?? null,
      ...pipewireAudioGeneratorDebug,
    });
    return [pipewireAudioGenerator];
  }

  const pipewireAudioGeneratorDebug = {
    startedAt: null,
    fetchStartedAt: null,
    fetchChunkCount: 0,
    fetchByteCount: 0,
    writeCount: 0,
    frameCount: 0,
    peak: 0,
    lastWriteAt: null,
    lastNonZeroAt: null,
    lastError: null,
  };

  function startPipeWirePcmGeneratorFetch() {
    pipewireAudioPcmAbort?.abort?.();
    pipewireAudioPcmAbort = new AbortController();
    void readPipeWirePcmGeneratorStream(pipewireAudioPcmAbort.signal);
  }

  async function readPipeWirePcmGeneratorStream(signal) {
    try {
      pipewireAudioGeneratorDebug.fetchStartedAt = new Date().toISOString();
      const response = await fetch(config.audioPcmUrl + "?t=" + Date.now(), {signal, cache: "no-store"});
      if (!response.ok || response.body === null) throw new Error("pcm fetch failed: " + response.status);
      const reader = response.body.getReader();
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        await writePipeWirePcmGeneratorChunk(chunk.value);
      }
      post({audio: {lastError: null}});
    } catch (error) {
      if (!signal.aborted) {
        const message = "pipewire pcm generator fetch failed: " + String(error?.message || error);
        pipewireAudioGeneratorDebug.lastError = message;
        post({audio: {lastError: message}});
      }
    }
  }

  async function writePipeWirePcmGeneratorChunk(bytes) {
    if (pipewireAudioGeneratorWriter === null) return;
    const merged = mergePipeWireGeneratorBytes(bytes);
    const frameCount = Math.floor(merged.byteLength / 4);
    const payloadBytes = frameCount * 4;
    if (payloadBytes <= 0) return;
    const payload = merged.slice(0, payloadBytes);
    pipewireAudioGeneratorRemainder = merged.slice(payloadBytes);
    let peak = 0;
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    for (let frame = 0; frame < frameCount; frame += 1) {
      peak = Math.max(
        peak,
        Math.abs(view.getInt16(frame * 4, true) / 32768),
        Math.abs(view.getInt16(frame * 4 + 2, true) / 32768),
      );
    }
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
    pipewireAudioGeneratorDebug.fetchChunkCount += 1;
    pipewireAudioGeneratorDebug.fetchByteCount += payloadBytes;
    pipewireAudioGeneratorDebug.writeCount += 1;
    pipewireAudioGeneratorDebug.frameCount += frameCount;
    pipewireAudioGeneratorDebug.peak = peak;
    pipewireAudioGeneratorDebug.lastWriteAt = new Date().toISOString();
    if (peak > 0.00001) pipewireAudioGeneratorDebug.lastNonZeroAt = pipewireAudioGeneratorDebug.lastWriteAt;
  }

  function mergePipeWireGeneratorBytes(bytes) {
    if (pipewireAudioGeneratorRemainder.byteLength === 0) return bytes;
    const merged = new Uint8Array(pipewireAudioGeneratorRemainder.byteLength + bytes.byteLength);
    merged.set(pipewireAudioGeneratorRemainder, 0);
    merged.set(bytes, pipewireAudioGeneratorRemainder.byteLength);
    pipewireAudioGeneratorRemainder = new Uint8Array(0);
    return merged;
  }

  async function startPipeWirePcmAudioCapture() {
    pipewireAudioContext = pipewireAudioKeepAliveContext;
    if (pipewireAudioContext === null) throw new Error("AudioContext is not available");
    await pipewireAudioContext.resume().catch(() => undefined);
    pipewireAudioDestination = pipewireAudioContext.createMediaStreamDestination();
    const pcmProcessor = pipewireAudioContext.createScriptProcessor(4096, 1, 2);
    const driverGain = pipewireAudioContext.createGain();
    const silentOutput = pipewireAudioContext.createGain();
    driverGain.gain.value = 0;
    silentOutput.gain.value = 0;
    const driverSource = typeof pipewireAudioContext.createConstantSource === "function"
      ? pipewireAudioContext.createConstantSource()
      : pipewireAudioContext.createOscillator();
    if ("offset" in driverSource) driverSource.offset.value = 1;
    if ("frequency" in driverSource) driverSource.frequency.value = 20;
    pcmProcessor.onaudioprocess = fillPipeWirePcmOutput;
    driverSource.connect(driverGain);
    driverGain.connect(pcmProcessor);
    pcmProcessor.connect(pipewireAudioDestination);
    pcmProcessor.connect(silentOutput);
    silentOutput.connect(pipewireAudioContext.destination);
    driverSource.start();
    pipewireAudioSource = pcmProcessor;
    pipewireAudioSilence = silentOutput;
    pipewireAudioDriverGain = driverGain;
    pipewireAudioDriverSource = driverSource;

    const tracks = pipewireAudioDestination.stream.getAudioTracks();
    await installPipeWireAudioTracks(tracks, "pipewire-pcm-worklet-stream");
    startPipeWirePcmFetch();
    window.__metaforPipewireAudioDebug = () => ({
      transport: "pipewire-pcm-worklet-stream",
      contextState: pipewireAudioContext?.state || null,
      queuedSamples: pipewireAudioPcmQueuedSamples,
      chunkCount: pipewireAudioPcmChunks.length,
      fetchChunkCount: pipewireAudioDebug.fetchChunkCount,
      fetchByteCount: pipewireAudioDebug.fetchByteCount,
      fetchPeak: pipewireAudioDebug.fetchPeak,
      lastFetchAt: pipewireAudioDebug.lastFetchAt,
      renderCount: pipewireAudioDebug.renderCount,
      renderedFrames: pipewireAudioDebug.renderedFrames,
      renderNonZeroFrames: pipewireAudioDebug.renderNonZeroFrames,
      underrunFrames: pipewireAudioDebug.underrunFrames,
      lastPeak: pipewireAudioDebug.lastPeak,
      lastRms: pipewireAudioDebug.lastRms,
      lastRenderAt: pipewireAudioDebug.lastRenderAt,
      lastOutputNonZeroAt: pipewireAudioDebug.lastOutputNonZeroAt,
      trackCount: pipewireAudioDestination?.stream?.getAudioTracks?.().length ?? 0,
      trackMuted: pipewireAudioDestination?.stream?.getAudioTracks?.()[0]?.muted ?? null,
      trackReadyState: pipewireAudioDestination?.stream?.getAudioTracks?.()[0]?.readyState ?? null,
    });
    return tracks;
  }

  const pipewireAudioPcmChunks = [];
  let pipewireAudioPcmChunkOffset = 0;
  let pipewireAudioPcmQueuedSamples = 0;
  let pipewireAudioPcmAbort = null;
  const pipewireAudioDebug = {
    fetchChunkCount: 0,
    fetchByteCount: 0,
    fetchPeak: 0,
    lastFetchAt: null,
    renderCount: 0,
    renderedFrames: 0,
    renderNonZeroFrames: 0,
    underrunFrames: 0,
    lastPeak: 0,
    lastRms: 0,
    lastRenderAt: null,
    lastOutputNonZeroAt: null,
  };

  function startPipeWirePcmFetch() {
    pipewireAudioPcmAbort?.abort?.();
    pipewireAudioPcmAbort = new AbortController();
    void readPipeWirePcmStream(pipewireAudioPcmAbort.signal);
  }

  async function readPipeWirePcmStream(signal) {
    try {
      const response = await fetch(config.audioPcmUrl + "?t=" + Date.now(), {signal, cache: "no-store"});
      if (!response.ok || response.body === null) throw new Error("pcm fetch failed: " + response.status);
      const reader = response.body.getReader();
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        appendPipeWirePcmChunk(chunk.value);
      }
      post({audio: {lastError: null}});
    } catch (error) {
      if (!signal.aborted) post({audio: {lastError: "pipewire pcm fetch failed: " + String(error?.message || error)}});
    }
  }

  function appendPipeWirePcmChunk(bytes) {
    const frameCount = Math.floor(bytes.byteLength / 4);
    if (frameCount <= 0) return;
    const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * 4);
    const samples = new Float32Array(frameCount * 2);
    let peak = 0;
    for (let frame = 0; frame < frameCount; frame += 1) {
      const left = view.getInt16(frame * 4, true) / 32768;
      const right = view.getInt16(frame * 4 + 2, true) / 32768;
      peak = Math.max(peak, Math.abs(left), Math.abs(right));
      samples[frame * 2] = left;
      samples[frame * 2 + 1] = right;
    }
    pipewireAudioDebug.fetchChunkCount += 1;
    pipewireAudioDebug.fetchByteCount += frameCount * 4;
    pipewireAudioDebug.fetchPeak = peak;
    pipewireAudioDebug.lastFetchAt = new Date().toISOString();
    pipewireAudioPcmChunks.push(samples);
    pipewireAudioPcmQueuedSamples += samples.length;
    trimPipeWirePcmQueue();
  }

  function trimPipeWirePcmQueue() {
    const maxSamples = 48000 * 2;
    while (pipewireAudioPcmQueuedSamples > maxSamples && pipewireAudioPcmChunks.length > 1) {
      const removed = pipewireAudioPcmChunks.shift();
      pipewireAudioPcmQueuedSamples -= Math.max(0, removed.length - pipewireAudioPcmChunkOffset);
      pipewireAudioPcmChunkOffset = 0;
    }
  }

  function fillPipeWirePcmOutput(event) {
    const left = event.outputBuffer.getChannelData(0);
    const right = event.outputBuffer.getChannelData(1);
    let peak = 0;
    let sumSquares = 0;
    let nonZeroFrames = 0;
    const underrunFramesBefore = pipewireAudioDebug.underrunFrames;
    for (let index = 0; index < left.length; index += 1) {
      const frame = nextPipeWirePcmFrame();
      left[index] = frame[0];
      right[index] = frame[1];
      const framePeak = Math.max(Math.abs(frame[0]), Math.abs(frame[1]));
      peak = Math.max(peak, framePeak);
      sumSquares += frame[0] * frame[0] + frame[1] * frame[1];
      if (framePeak > 0.00001) nonZeroFrames += 1;
    }
    pipewireAudioDebug.renderCount += 1;
    pipewireAudioDebug.renderedFrames += left.length;
    pipewireAudioDebug.renderNonZeroFrames += nonZeroFrames;
    pipewireAudioDebug.lastPeak = peak;
    pipewireAudioDebug.lastRms = Math.sqrt(sumSquares / Math.max(1, left.length * 2));
    pipewireAudioDebug.lastRenderAt = new Date().toISOString();
    if (nonZeroFrames > 0) pipewireAudioDebug.lastOutputNonZeroAt = pipewireAudioDebug.lastRenderAt;
    if (pipewireAudioDebug.underrunFrames > underrunFramesBefore) {
      pipewireAudioDebug.lastUnderrunAt = pipewireAudioDebug.lastRenderAt;
    }
  }

  function nextPipeWirePcmFrame() {
    const chunk = pipewireAudioPcmChunks[0];
    if (chunk === undefined) {
      pipewireAudioDebug.underrunFrames += 1;
      return [0, 0];
    }
    const left = chunk[pipewireAudioPcmChunkOffset] || 0;
    const right = chunk[pipewireAudioPcmChunkOffset + 1] || 0;
    pipewireAudioPcmChunkOffset += 2;
    pipewireAudioPcmQueuedSamples = Math.max(0, pipewireAudioPcmQueuedSamples - 2);
    if (pipewireAudioPcmChunkOffset >= chunk.length) {
      pipewireAudioPcmChunks.shift();
      pipewireAudioPcmChunkOffset = 0;
    }
    return [left, right];
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
      window.setTimeout(connectSignal, 1000);
    });
    socket.addEventListener("error", () => post({status: "signaling-error"}));
  }

  async function handleSignal(message) {
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
      channel.send(JSON.stringify({type: "hello", peerId: config.peerId, role: "electron-desktop", transport: "chrome-webrtc"}));
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
      socket?.close();
      closeAllPeers();
      stream?.getTracks?.().forEach((track) => track.stop());
      if (pipewireAudioRefreshTimer !== null) clearInterval(pipewireAudioRefreshTimer);
      if (senderStatsTimer !== null) clearInterval(senderStatsTimer);
      pipewireAudioPcmAbort?.abort?.();
      try { pipewireAudioGeneratorWriter?.close?.(); } catch {}
      try { pipewireAudioGenerator?.stop?.(); } catch {}
      cleanupPipeWireAudioElement(pipewireAudioElement, pipewireAudioCaptureStream);
      pipewireAudioCaptureStream?.getTracks?.().forEach((track) => track.stop());
      pipewireAudioSource?.disconnect?.();
      pipewireAudioDriverGain?.disconnect?.();
      try { pipewireAudioDriverSource?.stop?.(); } catch {}
      pipewireAudioDestination?.disconnect?.();
      try { pipewireAudioSilence?.stop?.(); } catch {}
      if (pipewireAudioContext !== pipewireAudioKeepAliveContext) void pipewireAudioContext?.close?.();
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

function captureSnapshot() {
  if (state.stream.serial === null) {
    const error = new Error(state.stream.error || "PipeWire stream is not ready")
    error.statusCode = 503
    throw error
  }
  if (state.snapshot.pending) {
    const error = new Error("Snapshot capture is already pending")
    error.statusCode = 429
    throw error
  }
  state.snapshot.pending = true
  state.snapshot.error = null
  return new Promise((resolve, reject) => {
    const gst = spawn("gst-launch-1.0", [
      "-q",
      "pipewiresrc",
      `target-object=${state.stream.serial}`,
      "num-buffers=1",
      "!",
      `video/x-raw,max-framerate=${FPS}/1,width=${WIDTH},height=${HEIGHT}`,
      "!",
      "videoconvert",
      "!",
      "pngenc",
      "!",
      "fdsink",
      "fd=1",
    ], {stdio: ["ignore", "pipe", "pipe"]})
    const chunks = []
    let stderr = ""
    const timer = setTimeout(() => {
      stopChild(gst)
      rejectWithState(new Error("Snapshot capture timed out"))
    }, 10_000)
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      state.snapshot.pending = false
      fn(value)
    }
    const rejectWithState = (error) => {
      state.snapshot.error = error.message
      finish(reject, error)
    }
    gst.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    gst.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })
    gst.on("error", rejectWithState)
    gst.on("exit", (code, signal) => {
      if (code !== 0) {
        rejectWithState(new Error(`gst-launch failed code=${code ?? "null"} signal=${signal ?? "null"} ${stderr.trim()}`.trim()))
        return
      }
      const png = Buffer.concat(chunks)
      state.snapshot.capturedAt = new Date().toISOString()
      state.snapshot.bytes = png.length
      finish(resolve, png)
    })
  })
}

async function sendMjpegStream(req, res) {
  if (state.stream.serial === null) {
    sendJson(res, 503, {ok: false, error: state.stream.error || "PipeWire stream is not ready"})
    return
  }

  state.mjpeg.clients += 1
  state.mjpeg.lastStartedAt = new Date().toISOString()
  state.mjpeg.lastError = null

  const gst = spawn("gst-launch-1.0", [
    "-q",
    "pipewiresrc",
    `target-object=${state.stream.serial}`,
    "!",
    `video/x-raw,max-framerate=${FPS}/1,width=${WIDTH},height=${HEIGHT}`,
    "!",
    "videoconvert",
    "!",
    "jpegenc",
    "quality=82",
    "!",
    "multipartmux",
    `boundary=${MJPEG_BOUNDARY}`,
    "!",
    "fdsink",
    "fd=1",
  ], {stdio: ["ignore", "pipe", "pipe"]})

  let settled = false
  let stderr = ""
  const stop = () => {
    if (settled) return
    settled = true
    state.mjpeg.clients = Math.max(0, state.mjpeg.clients - 1)
    stopChild(gst)
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "connection": "close",
    "content-type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
    ...corsHeaders(),
  })

  gst.stdout.pipe(res)
  gst.stderr.on("data", (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 4096) stderr = stderr.slice(-4096)
  })
  gst.on("error", (error) => {
    state.mjpeg.lastError = error.message
    stop()
  })
  gst.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && !res.destroyed) {
      state.mjpeg.lastError = `gst-launch mjpeg failed code=${code} signal=${signal ?? "null"} ${stderr.trim()}`.trim()
    }
    stop()
  })
  req.on("close", stop)
  res.on("close", stop)
}

async function sendVideoWebmStream(req, res) {
  if (state.stream.serial === null) {
    sendJson(res, 503, {ok: false, error: state.stream.error || "PipeWire stream is not ready"})
    return
  }

  state.videoWebm.clients += 1
  state.videoWebm.lastStartedAt = new Date().toISOString()
  state.videoWebm.lastError = null

  const gst = spawn("gst-launch-1.0", [
    "-q",
    "pipewiresrc",
    `target-object=${state.stream.serial}`,
    "!",
    `video/x-raw,max-framerate=${FPS}/1,width=${WIDTH},height=${HEIGHT}`,
    "!",
    "videorate",
    "!",
    `video/x-raw,framerate=${FPS}/1`,
    "!",
    "videoconvert",
    "!",
    "video/x-raw,format=I420",
    "!",
    "vp8enc",
    "deadline=1",
    "cpu-used=8",
    "threads=4",
    `target-bitrate=${VIDEO_BITRATE}`,
    `keyframe-max-dist=${FPS}`,
    "lag-in-frames=0",
    "!",
    "webmmux",
    "streamable=true",
    "!",
    "fdsink",
    "fd=1",
  ], {stdio: ["ignore", "pipe", "pipe"]})

  let settled = false
  let stderr = ""
  const stop = () => {
    if (settled) return
    settled = true
    state.videoWebm.clients = Math.max(0, state.videoWebm.clients - 1)
    stopChild(gst)
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "connection": "close",
    "content-type": "video/webm; codecs=vp8",
    ...corsHeaders(),
  })

  gst.stdout.pipe(res)
  gst.stderr.on("data", (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 4096) stderr = stderr.slice(-4096)
  })
  gst.on("error", (error) => {
    state.videoWebm.lastError = error.message
    stop()
  })
  gst.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && !res.destroyed) {
      state.videoWebm.lastError = `gst-launch video failed code=${code} signal=${signal ?? "null"} ${stderr.trim()}`.trim()
    }
    stop()
  })
  req.on("close", stop)
  res.on("close", stop)
}

async function sendAudioWebmStream(req, res) {
  const targets = resolveAudioTargets()
  if (targets.length === 0) {
    sendJson(res, 503, {ok: false, error: state.audioWebm.lastError || "PipeWire audio sink is not available"})
    return
  }

  state.audioWebm.clients += 1
  state.audioWebm.target = targets.join(",")
  state.audioWebm.lastStartedAt = new Date().toISOString()
  state.audioWebm.lastError = null
  for (const target of targets) ensureAudioTargetAudible(target)

  const gst = spawn("gst-launch-1.0", audioWebmGstArgs(targets), {stdio: ["ignore", "pipe", "pipe"]})

  let settled = false
  let stderr = ""
  const stop = () => {
    if (settled) return
    settled = true
    state.audioWebm.clients = Math.max(0, state.audioWebm.clients - 1)
    stopChild(gst)
  }

  res.writeHead(200, {
    "cache-control": "no-store",
    "connection": "close",
    "content-type": "audio/webm; codecs=opus",
    ...corsHeaders(),
  })

  gst.stdout.pipe(res)
  gst.stderr.on("data", (chunk) => {
    stderr += String(chunk)
    if (stderr.length > 4096) stderr = stderr.slice(-4096)
  })
  gst.on("error", (error) => {
    state.audioWebm.lastError = error.message
    state.remoteDesktop.audio.lastError = error.message
    stop()
  })
  gst.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && !res.destroyed) {
      const message = `gst-launch audio failed code=${code} signal=${signal ?? "null"} ${stderr.trim()}`.trim()
      state.audioWebm.lastError = message
      state.remoteDesktop.audio.lastError = message
    }
    stop()
  })
  req.on("close", stop)
  res.on("close", stop)
}

async function sendAudioPcmStream(req, res) {
  const targets = resolveAudioTargets()
  if (targets.length === 0) {
    sendJson(res, 503, {ok: false, error: state.audioPcm.lastError || state.audioWebm.lastError || "PipeWire audio sink is not available"})
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

function resolveAudioTarget() {
  return resolveAudioTargets()[0] ?? null
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
    state.audioWebm.lastError = error instanceof Error ? error.message : String(error)
    state.audioPcm.lastError = state.audioWebm.lastError
    state.remoteDesktop.audio.lastError = state.audioWebm.lastError
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

function audioWebmGstArgs(targets) {
  const output = [
    "-q",
    ...(targets.length > 1 ? ["audiomixer", "name=mix"] : ["pipewiresrc", `target-object=${targets[0]}`]),
    "!",
    "audioconvert",
    "!",
    "audioresample",
    "!",
    "audio/x-raw,format=S16LE,rate=48000,channels=2",
    "!",
    "opusenc",
    "audio-type=generic",
    `bitrate=${AUDIO_BITRATE}`,
    "!",
    "webmmux",
    "streamable=true",
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
      "audio/x-raw,format=F32LE,rate=48000,channels=2",
      "!",
      "mix.",
    )
  }
  return [...output, ...inputs]
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
    state.audioWebm.lastError = message
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
    const transport = typeof input.transport === "string" ? input.transport : "mutter-eis"
    state.input.transport = transport
    state.remoteDesktop.input.transport = transport
    state.remoteDesktop.input.lastError = null
    recordDesktopInputAck(type)
    return {ok: true, input, state: publicState()}
  } catch (desktopError) {
    state.remoteDesktop.input.lastError = desktopError instanceof Error ? desktopError.message : String(desktopError)
    try {
      const input = await sendCdpDesktopInput(type, body)
      state.input.transport = "chrome-cdp-fallback"
      recordDesktopInputAck(type)
      return {ok: true, input: {...input, fallbackFrom: "mutter-remote-desktop"}, state: publicState()}
    } catch (error) {
      state.input.lastError = error instanceof Error
        ? `${state.remoteDesktop.input.lastError}; ${error.message}`
        : `${state.remoteDesktop.input.lastError}; ${String(error)}`
      throw error
    }
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

async function sendCdpDesktopInput(type, body) {
  return await withCdpPage(async (cdp) => {
    await cdp.send("Page.bringToFront")
    if (type === "focus") return {type}
    if (type === "text" || type === "type") return await sendCdpText(cdp, type, body)
    if (type === "keyDown" || type === "keyUp" || type === "char" || type === "key") return await sendCdpKey(cdp, type, body)
    if (type === "wheel" || type === "mouseWheel" || type === "scroll") return await sendCdpWheel(cdp, type, body)
    if (type === "click" || type === "doubleclick") return await sendCdpClick(cdp, type, body)
    if (type === "pointerMove" || type === "mouseMove" || type === "move") return await sendCdpMouseMove(cdp, type, body)
    if (type === "pointerDown" || type === "mouseDown" || type === "pointerUp" || type === "mouseUp") {
      return await sendCdpMouseButton(cdp, type, body)
    }
    const error = new Error("unsupported desktop input type")
    error.statusCode = 400
    throw error
  })
}

async function sendCdpText(cdp, type, body) {
  if (typeof body.text !== "string") {
    const error = new Error("text input requires string field 'text'")
    error.statusCode = 400
    throw error
  }
  await cdp.send("Input.insertText", {text: body.text})
  return {type, textLength: body.text.length}
}

async function sendCdpKey(cdp, type, body) {
  const key = String(body.key ?? body.keyCode ?? "")
  if (key.length === 0) {
    const error = new Error("keyboard input requires 'key' or 'keyCode'")
    error.statusCode = 400
    throw error
  }
  const eventType = type === "keyUp" ? "keyUp" : type === "char" ? "char" : "keyDown"
  const params = cdpKeyEventParams(eventType, body, key)
  await cdp.send("Input.dispatchKeyEvent", params)
  return {type: eventType, key, modifiers: params.modifiers}
}

async function sendCdpWheel(cdp, type, body) {
  const point = await cdpInputPoint(cdp, body)
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: point.x,
    y: point.y,
    deltaX: Number(body.deltaX ?? body.dx ?? 0),
    deltaY: Number(body.deltaY ?? body.dy ?? 0),
    modifiers: cdpModifierMask(body.modifiers),
  })
  return {type: "mouseWheel", ...point}
}

async function sendCdpClick(cdp, type, body) {
  const point = await cdpInputPoint(cdp, body)
  const button = cdpMouseButton(body.button)
  const clickCount = type === "doubleclick" ? 2 : Math.max(1, Math.round(Number(body.clickCount ?? body.count ?? 1)))
  const buttons = cdpMouseButtons(button)
  const modifiers = cdpModifierMask(body.modifiers)
  await cdp.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: point.x, y: point.y, button: "none", modifiers})
  await cdp.send("Input.dispatchMouseEvent", {type: "mousePressed", x: point.x, y: point.y, button, buttons, clickCount, modifiers})
  await cdp.send("Input.dispatchMouseEvent", {type: "mouseReleased", x: point.x, y: point.y, button, buttons: 0, clickCount, modifiers})
  return {type, button, clickCount, ...point}
}

async function sendCdpMouseMove(cdp, type, body) {
  const point = await cdpInputPoint(cdp, body)
  const button = body.buttons === undefined ? "none" : cdpMouseButton(body.button)
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button,
    buttons: cdpMouseButtonsMask(body.buttons),
    modifiers: cdpModifierMask(body.modifiers),
  })
  return {type: "mouseMove", button, buttons: cdpMouseButtonsMask(body.buttons), ...point}
}

async function sendCdpMouseButton(cdp, type, body) {
  const point = await cdpInputPoint(cdp, body)
  const button = cdpMouseButton(body.button)
  const pressed = type === "pointerDown" || type === "mouseDown"
  const clickCount = Math.max(1, Math.round(Number(body.clickCount ?? body.count ?? 1)))
  await cdp.send("Input.dispatchMouseEvent", {
    type: pressed ? "mousePressed" : "mouseReleased",
    x: point.x,
    y: point.y,
    button,
    buttons: pressed ? cdpMouseButtons(button) : 0,
    clickCount,
    modifiers: cdpModifierMask(body.modifiers),
  })
  return {type: pressed ? "mouseDown" : "mouseUp", button, clickCount, ...point}
}

async function cdpInputPoint(cdp, body) {
  const viewport = await cdpViewport(cdp)
  const frameX = normalizeFrameCoordinate(body.x, "x", WIDTH, body.frameW)
  const frameY = normalizeFrameCoordinate(body.y, "y", HEIGHT, body.frameH)
  const topInset = Math.max(0, HEIGHT - viewport.height)
  const leftInset = Math.max(0, (WIDTH - viewport.width) / 2)
  return {
    x: Math.round(clampNumber(frameX - leftInset, 0, Math.max(0, viewport.width - 1))),
    y: Math.round(clampNumber(frameY - topInset, 0, Math.max(0, viewport.height - 1))),
    frameX: Math.round(frameX),
    frameY: Math.round(frameY),
    viewportW: viewport.width,
    viewportH: viewport.height,
    topInset,
    leftInset,
  }
}

async function cdpViewport(cdp) {
  try {
    const metrics = await cdp.send("Page.getLayoutMetrics")
    const viewport = metrics.cssVisualViewport ?? metrics.visualViewport ?? null
    const width = Number(viewport?.clientWidth ?? WIDTH)
    const height = Number(viewport?.clientHeight ?? HEIGHT)
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return {width, height}
  } catch {
    // Input still works with the configured frame size when layout metrics are unavailable.
  }
  return {width: WIDTH, height: HEIGHT}
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

function cdpMouseButton(value) {
  if (value === "right" || value === "middle" || value === "back" || value === "forward") return value
  return "left"
}

function cdpMouseButtons(button) {
  if (button === "right") return 2
  if (button === "middle") return 4
  if (button === "back") return 8
  if (button === "forward") return 16
  return 1
}

function cdpMouseButtonsMask(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : 0
}

function cdpModifierMask(value) {
  if (!Array.isArray(value)) return 0
  let mask = 0
  if (value.includes("alt")) mask |= 1
  if (value.includes("control") || value.includes("ctrl")) mask |= 2
  if (value.includes("meta") || value.includes("command")) mask |= 4
  if (value.includes("shift")) mask |= 8
  return mask
}

function cdpKeyEventParams(type, body, key) {
  const code = String(body.keyCode ?? body.code ?? key)
  const modifiers = cdpModifierMask(body.modifiers)
  const virtualKeyCode = cdpVirtualKeyCode(key, code)
  const params = {
    type,
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
    modifiers,
  }
  if (type === "char") {
    params.text = key
    params.unmodifiedText = key
  } else if (type === "keyDown" && key.length === 1 && modifiers === 0) {
    params.text = key
    params.unmodifiedText = key
  }
  return params
}

function cdpVirtualKeyCode(key, code) {
  const mapped = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    Escape: 27,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Insert: 45,
    Delete: 46,
    Space: 32,
    " ": 32,
  }[key] ?? {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    Escape: 27,
    Delete: 46,
    Space: 32,
  }[code]
  if (mapped !== undefined) return mapped
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3)
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5)
  if (key.length === 1) return key.toUpperCase().charCodeAt(0)
  return 0
}

async function withCdpPage(fn) {
  const wsUrl = await cdpPageWebSocketUrl()
  const cdp = await openCdpSession(wsUrl)
  try {
    return await fn(cdp)
  } finally {
    cdp.close()
  }
}

async function cdpPageWebSocketUrl() {
  const targets = await fetchChromeJson("/json/list")
  const pages = Array.isArray(targets)
    ? targets.filter((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    : []
  const page = pages.find((target) => target.url === TARGET_URL)
    ?? pages.find((target) => typeof target.url === "string" && target.url.startsWith(TARGET_URL))
    ?? pages.find((target) => typeof target.url === "string" && !target.url.startsWith("chrome://"))
    ?? pages[0]
    ?? null
  if (page === null) {
    const error = new Error("Chrome CDP page target is not available")
    error.statusCode = 503
    throw error
  }
  return page.webSocketDebuggerUrl
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

function normalizeChromeCaptureSurface(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "browser" || normalized === "window" || normalized === "monitor") return normalized
  return "monitor"
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
