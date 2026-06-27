const {spawn, spawnSync} = require("node:child_process")
const http = require("node:http")
const path = require("node:path")

const HOST = process.env.METAFOR_REMOTE_DESKTOP_HOST_BIND || "127.0.0.1"
const PORT = Number(process.env.METAFOR_REMOTE_DESKTOP_HOST_PORT || process.env.METAFOR_ELECTRON_HOST_PORT || 32123)
const WIDTH = Number(process.env.METAFOR_REMOTE_DESKTOP_WIDTH || 1920)
const HEIGHT = Number(process.env.METAFOR_REMOTE_DESKTOP_HEIGHT || 1080)
const FPS = Number(process.env.METAFOR_REMOTE_DESKTOP_SNAPSHOT_FPS || 30)
const MJPEG_BOUNDARY = "metafor-desktop-frame"
const AUDIO_BITRATE = Number(process.env.METAFOR_REMOTE_DESKTOP_AUDIO_BITRATE || 128000)
const AUDIO_TARGET = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_TARGET || "").trim()
const AUDIO_UNMUTE = process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE === undefined
  ? true
  : !["0", "false", "no", "off"].includes(process.env.METAFOR_REMOTE_DESKTOP_AUDIO_UNMUTE.trim().toLowerCase())
const AUDIO_VOLUME = (process.env.METAFOR_REMOTE_DESKTOP_AUDIO_VOLUME || "0.70").trim()
const TARGET_URL = process.env.METAFOR_URL || "http://10.66.0.10:3004/"
const CHROME = process.env.METAFOR_REMOTE_DESKTOP_BROWSER || "google-chrome"
const CHROME_DEBUG_PORT = Number(process.env.METAFOR_REMOTE_DESKTOP_CHROME_DEBUG_PORT || 9341)
const CHROME_DEBUG_BASE_URLS = [`http://127.0.0.1:${CHROME_DEBUG_PORT}`, `http://[::1]:${CHROME_DEBUG_PORT}`]
const CDP_TIMEOUT_MS = Number(process.env.METAFOR_REMOTE_DESKTOP_CDP_TIMEOUT_MS || 3000)
const HELPER_INPUT_TIMEOUT_MS = Number(process.env.METAFOR_REMOTE_DESKTOP_INPUT_TIMEOUT_MS || 1500)
const PROFILE_DIR = process.env.METAFOR_REMOTE_DESKTOP_BROWSER_PROFILE || `/tmp/metafor-remote-desktop-chrome-${process.pid}`
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
  audioWebm: {
    clients: 0,
    target: null,
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
    status: "snapshot-fallback",
    transport: "pipewire-snapshot",
    webRtc: false,
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
  },
}

let helper = null
let browser = null
let helperStdoutBuffer = ""
let helperInputSeq = 0
const helperInputRequests = new Map()

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
    sendJson(res, 200, publicState())
    return
  }
  if (req.method === "GET" && url.pathname === "/desktop/rtc/state") {
    sendJson(res, 200, {ok: true, remoteDesktop: publicState().remoteDesktop})
    return
  }
  if (req.method === "POST" && url.pathname === "/desktop/rtc/restart") {
    restart()
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
    state.stream.remoteSessionPath = typeof payload.remoteSessionPath === "string" ? payload.remoteSessionPath : state.stream.remoteSessionPath
    state.stream.error = null
    state.remoteDesktop.input.lastError = null
    console.log(`[metafor-remote-desktop] PipeWire stream node=${payload.nodeId} serial=${payload.serial}`)
    openBrowser(TARGET_URL)
    return
  }
  if (payload.type === "error") {
    state.stream.status = "failed"
    state.stream.nodeId = null
    state.stream.serial = null
    state.stream.streamPath = null
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

function openBrowser(url) {
  if (browser !== null && browser.exitCode === null && browser.signalCode === null) return
  const securityFlags = insecureOriginSecurityFlags(url)
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
    "--ignore-gpu-blocklist",
    "--enable-unsafe-webgpu",
    "--enable-features=UseOzonePlatform,WebRTCPipeWireCapturer",
    "--disable-features=Translate",
    "--lang=ru-RU",
    "--accept-lang=ru-RU,ru,en-US,en",
    "--ozone-platform=wayland",
    "--force-device-scale-factor=1",
    `--window-size=${WIDTH},${HEIGHT}`,
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
    "--remote-allow-origins=*",
    ...securityFlags,
    url,
  ], {
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 1000}`,
      DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${process.getuid?.() ?? 1000}/bus`,
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || "wayland-0",
      XDG_SESSION_TYPE: "wayland",
    },
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

function insecureOriginSecurityFlags(url) {
  try {
    const origin = new URL(url).origin
    if (!origin.startsWith("http://")) return []
    return [`--unsafely-treat-insecure-origin-as-secure=${origin}`]
  } catch {
    return []
  }
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

async function sendAudioWebmStream(req, res) {
  const target = resolveAudioTarget()
  if (target === null) {
    sendJson(res, 503, {ok: false, error: state.audioWebm.lastError || "PipeWire audio sink is not available"})
    return
  }

  state.audioWebm.clients += 1
  state.audioWebm.target = target
  state.audioWebm.lastStartedAt = new Date().toISOString()
  state.audioWebm.lastError = null
  ensureAudioTargetAudible(target)

  const gst = spawn("gst-launch-1.0", [
    "-q",
    "pipewiresrc",
    `target-object=${target}`,
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
  ], {stdio: ["ignore", "pipe", "pipe"]})

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

function resolveAudioTarget() {
  if (AUDIO_TARGET.length > 0) return AUDIO_TARGET

  try {
    const result = spawnSync("pw-dump", {encoding: "utf8", maxBuffer: 8 * 1024 * 1024})
    if (result.status !== 0) throw new Error((result.stderr || "pw-dump failed").trim())
    const nodes = JSON.parse(result.stdout)
    const sinks = nodes
      .filter((node) => node?.type === "PipeWire:Interface:Node" && node?.info?.props?.["media.class"] === "Audio/Sink")
      .map((node) => ({id: node.id, state: node.info?.state || "", name: node.info?.props?.["node.name"] || ""}))
      .filter((node) => Number.isFinite(Number(node.id)))
    const target = sinks.find((node) => node.state === "running") ?? sinks[0] ?? null
    if (target !== null) return String(target.id)
    throw new Error("pw-dump returned no Audio/Sink nodes")
  } catch (error) {
    state.audioWebm.lastError = error instanceof Error ? error.message : String(error)
    state.remoteDesktop.audio.lastError = state.audioWebm.lastError
    return null
  }
}

function ensureAudioTargetAudible(target) {
  if (!AUDIO_UNMUTE) return
  try {
    spawnSync("wpctl", ["set-mute", String(target), "0"], {encoding: "utf8"})
    if (AUDIO_VOLUME.length > 0) spawnSync("wpctl", ["set-volume", String(target), AUDIO_VOLUME], {encoding: "utf8"})
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.audioWebm.lastError = message
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
  const page = Array.isArray(targets)
    ? targets.find((target) => target?.type === "page" && typeof target.webSocketDebuggerUrl === "string")
    : null
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
