import {existsSync} from "node:fs"
import {rm} from "node:fs/promises"
import {join, resolve} from "node:path"
import {serializeError} from "./errors.ts"
import {asBoolean, asNumber, asObject, asString} from "./guards.ts"
import type {EventLogger} from "./logger.ts"
import type {JsonObject} from "./types.ts"

type RemoteDesktopLifecycleAction = "status" | "start" | "restart" | "recover" | "stop"
type RemoteDesktopLifecycleScope = "sender" | "display" | "all"
type RemoteDesktopLifecycleStepStatus = "ok" | "skipped" | "error"

type RemoteDesktopLifecycleConfig = {
  chromeDebugPort: number
  chromeProfile: string
  hostPort: number
  metaforUrl: string
  rdpHost: string
  rdpPort: number
  rdpSession: string
  senderSession: string
  signalUrl: string
  width: number
  height: number
  remoteDesktopDir: string
  xvfbDisplay: string
  xvfbSession: string
}

type RemoteDesktopLifecycleRequest = {
  action: RemoteDesktopLifecycleAction
  scope: RemoteDesktopLifecycleScope
  wait: boolean
  timeoutMs: number
  cleanProfile: boolean
  stopXvfb: boolean
  config: RemoteDesktopLifecycleConfig
}

type LifecycleStep = {
  name: string
  status: RemoteDesktopLifecycleStepStatus
  detail?: string
  data?: JsonObject
}

type CommandResult = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

const REPO_ROOT = resolve(import.meta.dir, "../../..")
const DEFAULT_TIMEOUT_MS = 20_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 90_000
const COMMAND_TIMEOUT_MS = 4_000
const HEALTH_TIMEOUT_MS = 2_500
const DEFAULT_SIGNAL_URL = "ws://10.66.0.10:6500/webrtc/signaling"

const DEFAULT_CONFIG: RemoteDesktopLifecycleConfig = {
  chromeDebugPort: 9349,
  chromeProfile: "/tmp/metafor-chrome-rtc-wayland-monitor-main",
  hostPort: 32133,
  metaforUrl: "https://meta.proizvodstvo1.ru/",
  rdpHost: "127.0.0.1",
  rdpPort: 3390,
  rdpSession: "metafor-rdp-trigger",
  senderSession: "metafor-chrome-wayland-monitor-main",
  signalUrl: DEFAULT_SIGNAL_URL,
  width: 1920,
  height: 1080,
  remoteDesktopDir: join(REPO_ROOT, "pkg/interpreter/remote-desktop"),
  xvfbDisplay: ":101",
  xvfbSession: "metafor-rdp-xvfb",
}

export async function handleRemoteDesktopLifecycleRoute(
  req: Request,
  method: string,
  path: string,
  logger?: EventLogger,
): Promise<Response | null> {
  if (path !== "/remote-desktop/lifecycle") return null
  if (method === "GET") {
    const normalized = normalizeRemoteDesktopLifecycleRequest({})
    if (!normalized.ok) return lifecycleJsonResponse({ok: false, error: normalized.error}, 500)
    return lifecycleJsonResponse({
      ok: true,
      schema: remoteDesktopLifecycleSchema(),
      state: await remoteDesktopLifecycleStatus(normalized.request.config),
    })
  }
  if (method !== "POST") return lifecycleJsonResponse({ok: false, error: `method not allowed: ${method}`}, 405)

  const parsed = await readJsonObject(req)
  if (parsed.error !== undefined) return lifecycleJsonResponse({ok: false, error: parsed.error, schema: remoteDesktopLifecycleSchema()}, 400)
  const normalized = normalizeRemoteDesktopLifecycleRequest(parsed.body)
  if (!normalized.ok) return lifecycleJsonResponse({ok: false, error: normalized.error, schema: remoteDesktopLifecycleSchema()}, 400)

  const startedAt = Date.now()
  const result = await runRemoteDesktopLifecycle(normalized.request, logger)
  const status = result.ok ? 200 : 500
  return lifecycleJsonResponse({
    ...result,
    elapsedMs: Date.now() - startedAt,
    schema: remoteDesktopLifecycleSchema(),
  }, status)
}

export function normalizeRemoteDesktopLifecycleRequest(body: JsonObject): {ok: true; request: RemoteDesktopLifecycleRequest} | {ok: false; error: string} {
  const action = normalizeAction(asString(body.action) ?? "status")
  if (action === null) return {ok: false, error: "action must be one of: status, start, restart, recover, stop"}

  const scope = normalizeScope(asString(body.scope), action)
  if (scope === null) return {ok: false, error: "scope must be one of: sender, display, all"}

  const timeoutMs = boundedInteger(asNumber(body.timeoutMs), DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
  const wait = asBoolean(body.wait) ?? true
  const cleanProfile = asBoolean(body.cleanProfile) ?? false
  const stopXvfb = asBoolean(body.stopXvfb) ?? false
  const configOverride = asObject(body.config) ?? {}
  const config = lifecycleConfig(configOverride)
  const configError = validateLifecycleConfig(config)
  if (configError !== null) return {ok: false, error: configError}

  return {
    ok: true,
    request: {
      action,
      scope,
      wait,
      timeoutMs,
      cleanProfile,
      stopXvfb,
      config,
    },
  }
}

export function remoteDesktopLifecycleSchema(): JsonObject {
  return {
    endpoint: "/remote-desktop/lifecycle",
    methods: {
      GET: "безопасный status + schema; не запускает и не убивает процессы",
      POST: "единая команда lifecycle; тело JSON с action/scope/options/config",
    },
    actions: {
      status: "только диагностика текущего контура",
      start: "поднять недостающие слои выбранного scope",
      restart: "перезапустить выбранный scope; default scope=sender",
      recover: "восстановить рабочую сессию после убитого дисплея: display -> sender",
      stop: "остановить выбранный scope; Xvfb не трогается без stopXvfb=true",
    },
    scopes: {
      sender: "Chrome WebRTC sender на 127.0.0.1:32133 и CDP 9349",
      display: "virtual display layer: Xvfb :101 + GNOME RDP/FreeRDP trigger, который создает Meta-0",
      all: "display + sender в правильном порядке",
    },
    defaults: {
      action: "status",
      scope: {
        status: "all",
        start: "all",
        restart: "sender",
        recover: "all",
        stop: "sender",
      },
      wait: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      cleanProfile: false,
      stopXvfb: false,
      config: DEFAULT_CONFIG,
    },
    options: {
      wait: "ждать готовности после действия",
      timeoutMs: `таймаут ожидания, ${MIN_TIMEOUT_MS}..${MAX_TIMEOUT_MS} ms`,
      cleanProfile: "перед стартом sender удалить Chrome profile; разрешены только /tmp/metafor-* пути",
      stopXvfb: "для action=stop scope=display|all дополнительно остановить Xvfb; по умолчанию false",
      config: "точечные override текущего server-dev контура; обычно не нужны.",
    },
    userStories: [
      {
        name: "проверить состояние",
        request: {action: "status"},
      },
      {
        name: "поднять рабочую сессию нового агента",
        request: {action: "start", scope: "all", wait: true},
      },
      {
        name: "восстановиться после убитого display/черного экрана",
        request: {action: "recover", wait: true},
      },
      {
        name: "быстро перезапустить WebRTC/Chrome sender без трогания Meta-0",
        request: {action: "restart", scope: "sender", wait: true},
      },
      {
        name: "перезапустить sender с чистым Chrome profile",
        request: {action: "restart", scope: "sender", cleanProfile: true, wait: true},
      },
      {
        name: "остановить весь remote desktop, оставив Xvfb",
        request: {action: "stop", scope: "all"},
      },
      {
        name: "полностью убить display layer вместе с Xvfb",
        request: {action: "stop", scope: "display", stopXvfb: true},
      },
    ],
  }
}

async function runRemoteDesktopLifecycle(request: RemoteDesktopLifecycleRequest, logger?: EventLogger): Promise<JsonObject> {
  const steps: LifecycleStep[] = []
  logger?.event("remote_desktop.lifecycle.request", {
    action: request.action,
    scope: request.scope,
    wait: request.wait,
    cleanProfile: request.cleanProfile,
    stopXvfb: request.stopXvfb,
  })

  if (request.action === "status") {
    return {
      ok: true,
      action: request.action,
      scope: request.scope,
      steps,
      state: await remoteDesktopLifecycleStatus(request.config),
    }
  }

  try {
    if (request.action === "start") {
      if (request.scope === "display" || request.scope === "all") await ensureDisplay(request, steps)
      if (request.scope === "sender" || request.scope === "all") await ensureSender(request, steps)
    } else if (request.action === "restart") {
      if (request.scope === "sender") await restartSender(request, steps)
      if (request.scope === "display") await restartDisplay(request, steps)
      if (request.scope === "all") {
        await restartDisplay(request, steps)
        await restartSender(request, steps)
      }
    } else if (request.action === "recover") {
      await ensureDisplay(request, steps)
      await restartSender(request, steps)
    } else if (request.action === "stop") {
      if (request.scope === "sender" || request.scope === "all") await stopSender(request.config, steps)
      if (request.scope === "display" || request.scope === "all") await stopDisplay(request.config, request.stopXvfb, steps)
    }
  } catch (error) {
    steps.push({name: "lifecycle.error", status: "error", detail: serializeError(error)})
  }

  const failed = steps.some((step) => step.status === "error")
  const state = await remoteDesktopLifecycleStatus(request.config)
  const ready = request.action === "stop" ? !failed : state.ready
  return {
    ok: !failed && ready,
    action: request.action,
    scope: request.scope,
    cleanProfile: request.cleanProfile,
    wait: request.wait,
    steps,
    state,
  }
}

async function remoteDesktopLifecycleStatus(config: RemoteDesktopLifecycleConfig): Promise<JsonObject> {
  const [xvfb, xfreerdp, senderSession, rdpSession, xvfbSession, display, host, rtcHost, cdp] = await Promise.all([
    processState(`Xvfb ${config.xvfbDisplay}`),
    processState("xfreerdp"),
    tmuxSessionState(config.senderSession),
    tmuxSessionState(config.rdpSession),
    tmuxSessionState(config.xvfbSession),
    displayState(config),
    remoteDesktopHostState(config),
    remoteDesktopRtcState(config),
    chromeDebugState(config),
  ])
  const hostHealth = asObject(host.health)
  const stream = asObject(hostHealth?.stream)
  const target = asObject(stream?.target)
  const remoteDesktop = asObject(rtcHost.remoteDesktop)
  const capture = asObject(remoteDesktop?.capture) ?? asObject(hostHealth?.capture)
  const rtc = asObject(remoteDesktop?.rtc) ?? asObject(hostHealth?.rtc)
  const audio = asObject(remoteDesktop?.audio) ?? asObject(hostHealth?.audio)
  const targetConnector = asString(target?.connector)
  const frameSource = asString(capture?.frameSource)
  const audioTransport = asString(audio?.transport)
  const controlState = asString(remoteDesktop?.status) ?? asString(rtc?.status)
  const audioTrackCount = asNumber(audio?.trackCount) ?? 0
  const peers = Array.isArray(rtc?.peers) ? rtc.peers : []
  const peerConnected = peers.some((peer) => {
    const object = asObject(peer)
    return object !== undefined && asString(object.connectionState) === "connected"
  })
  const channelOpen = peers.some((peer) => {
    const object = asObject(peer)
    return object !== undefined && asString(object.channelState) === "open"
  })
  const hostReady = display.meta0 === true
    && host.ok === true
    && targetConnector === "Meta-0"
  const captureReady = frameSource === "chrome-get-display-media:monitor"
  const audioReady = audioTransport === "pipewire-pcm-track-generator-stream" && audioTrackCount > 0
  const controlReady = controlState === "control-open" || (peerConnected && channelOpen)
  const ready = hostReady && captureReady && audioReady && controlReady

  return {
    ready,
    hostReady,
    captureReady,
    audioReady,
    controlReady,
    expected: {
      connector: "Meta-0",
      frameSource: "chrome-get-display-media:monitor",
      width: config.width,
      height: config.height,
      fps: 60,
      audio: "pipewire-pcm-track-generator-stream",
    },
    display,
    tmux: {
      sender: senderSession,
      rdp: rdpSession,
      xvfb: xvfbSession,
    },
    processes: {
      xvfb,
      xfreerdp,
    },
    host,
    rtcHost,
    cdp,
    summary: {
      targetConnector,
      frameSource,
      audioTransport,
      controlState,
      peerConnected,
      channelOpen,
      audioTrackCount,
    },
  }
}

async function ensureDisplay(request: RemoteDesktopLifecycleRequest, steps: LifecycleStep[]): Promise<void> {
  const config = request.config
  const xvfb = await processState(`Xvfb ${config.xvfbDisplay}`)
  if (xvfb.alive !== true) {
    await startXvfb(config, steps)
  } else {
    steps.push({name: "display.xvfb", status: "skipped", detail: `${config.xvfbDisplay} already alive`})
  }

  const display = await displayState(config)
  const rdp = await tmuxSessionState(config.rdpSession)
  if (display.meta0 === true && rdp.alive === true) {
    steps.push({name: "display.rdp", status: "skipped", detail: "Meta-0 already present"})
  } else {
    await stopDisplay(config, false, steps)
    await startRdpTrigger(config, steps)
  }

  if (request.wait) {
    await waitForStep("display.wait-meta0", steps, request.timeoutMs, async () => {
      const current = await displayState(config)
      return current.meta0 === true ? {ok: true, detail: "Meta-0 detected", data: current} : {ok: false, detail: "waiting for Meta-0"}
    })
  }
}

async function ensureSender(request: RemoteDesktopLifecycleRequest, steps: LifecycleStep[]): Promise<void> {
  const config = request.config
  const state = await remoteDesktopLifecycleStatus(config)
  if (state.ready === true && request.cleanProfile !== true) {
    steps.push({name: "sender.start", status: "skipped", detail: `sender already ready on ${remoteDesktopHostUrl(config)}`})
  } else {
    await startSender(config, request.cleanProfile, steps)
  }

  if (request.wait) await waitForSender(request, steps)
}

async function restartDisplay(request: RemoteDesktopLifecycleRequest, steps: LifecycleStep[]): Promise<void> {
  await stopSender(request.config, steps)
  await stopDisplay(request.config, request.stopXvfb, steps)
  await ensureDisplay(request, steps)
}

async function restartSender(request: RemoteDesktopLifecycleRequest, steps: LifecycleStep[]): Promise<void> {
  await stopSender(request.config, steps)
  await startSender(request.config, request.cleanProfile, steps, false)
  if (request.wait) await waitForSender(request, steps)
}

async function waitForSender(request: RemoteDesktopLifecycleRequest, steps: LifecycleStep[]): Promise<void> {
  await waitForStep("sender.wait-ready", steps, request.timeoutMs, async () => {
    const state = await remoteDesktopLifecycleStatus(request.config)
    return state.ready === true
      ? {ok: true, detail: "Chrome WebRTC monitor sender is ready", data: statusSummary(state)}
      : {ok: false, detail: "waiting for Chrome WebRTC monitor sender", data: statusSummary(state)}
  })
}

async function startXvfb(config: RemoteDesktopLifecycleConfig, steps: LifecycleStep[]): Promise<void> {
  const xvfbBin = firstExisting(["/tmp/metafor-xvfb-root/usr/bin/Xvfb", "/usr/bin/Xvfb", "Xvfb"])
  const command = [
    "exec",
    shellQuote(xvfbBin),
    shellQuote(config.xvfbDisplay),
    "-screen",
    "0",
    shellQuote(`${config.width}x${config.height}x24`),
    "-ac",
    "-noreset",
    "-fakescreenfps",
    "60",
  ].join(" ")
  await tmuxKillSession(config.xvfbSession)
  const result = await runShell(`tmux new-session -d -s ${shellQuote(config.xvfbSession)} -n xvfb ${shellQuote(command)}`)
  pushCommandStep(steps, "display.xvfb.start", result, `tmux ${config.xvfbSession}`)
}

async function startRdpTrigger(config: RemoteDesktopLifecycleConfig, steps: LifecycleStep[]): Promise<void> {
  const freerdpBin = firstExisting(["/tmp/metafor-freerdp-root/usr/bin/xfreerdp", "/usr/bin/xfreerdp", "xfreerdp"])
  const freerdpLibDir = "/tmp/metafor-freerdp-root/usr/lib/x86_64-linux-gnu"
  const libraryExport = existsSync(freerdpLibDir) ? `export LD_LIBRARY_PATH=${shellQuote(freerdpLibDir)}:\${LD_LIBRARY_PATH:-}` : ""
  const script = [
    "set -euo pipefail",
    `export DISPLAY=${shellQuote(config.xvfbDisplay)}`,
    libraryExport,
    "creds=$(grdctl --headless status --show-credentials)",
    "user=$(printf '%s\\n' \"$creds\" | awk -F': ' '/Username:/{print $2; exit}')",
    "pass=$(printf '%s\\n' \"$creds\" | awk -F': ' '/Password:/{print $2; exit}')",
    "test -n \"$user\"",
    "test -n \"$pass\"",
    [
      "exec 3< <(printf '%s\\n'",
      shellQuote(`/v:${config.rdpHost}:${config.rdpPort}`),
      '"/u:$user"',
      '"/p:$pass"',
      "/cert:ignore",
      shellQuote(`/size:${config.width}x${config.height}`),
      "/dynamic-resolution",
      "/log-level:INFO)",
    ].join(" "),
    `exec ${shellQuote(freerdpBin)} /args-from:fd:3`,
  ].filter((line) => line.length > 0).join("; ")
  await tmuxKillSession(config.rdpSession)
  const command = `bash -lc ${shellQuote(script)}`
  const result = await runShell(`tmux new-session -d -s ${shellQuote(config.rdpSession)} -n rdp ${shellQuote(command)}`)
  pushCommandStep(steps, "display.rdp.start", result, `tmux ${config.rdpSession}; credentials are read from grdctl and passed through fd`)
}

async function startSender(config: RemoteDesktopLifecycleConfig, cleanProfile: boolean, steps: LifecycleStep[], releasePorts = true): Promise<void> {
  if (cleanProfile) await cleanChromeProfile(config, steps)
  await tmuxKillSession(config.senderSession)
  if (releasePorts) await killTcpPorts([config.hostPort, config.chromeDebugPort], steps)
  const command = [
    `cd ${shellQuote(config.remoteDesktopDir)}`,
    [
      "exec env",
      `METAFOR_URL=${shellQuote(config.metaforUrl)}`,
      `METAFOR_REMOTE_DESKTOP_HOST_PORT=${shellQuote(String(config.hostPort))}`,
      `METAFOR_REMOTE_DESKTOP_CHROME_DEBUG_PORT=${shellQuote(String(config.chromeDebugPort))}`,
      `METAFOR_REMOTE_DESKTOP_BROWSER_PROFILE=${shellQuote(config.chromeProfile)}`,
      `METAFOR_REMOTE_DESKTOP_SIGNAL_URL=${shellQuote(config.signalUrl)}`,
      `METAFOR_REMOTE_DESKTOP_WIDTH=${shellQuote(String(config.width))}`,
      `METAFOR_REMOTE_DESKTOP_HEIGHT=${shellQuote(String(config.height))}`,
      "bash chrome-webrtc-monitor.sh",
    ].join(" "),
  ].join("; ")
  const result = await runShell(`tmux new-session -d -s ${shellQuote(config.senderSession)} -n sender ${shellQuote(command)}`)
  pushCommandStep(steps, "sender.start", result, `tmux ${config.senderSession} -> ${remoteDesktopHostUrl(config)}`)
}

async function stopSender(config: RemoteDesktopLifecycleConfig, steps: LifecycleStep[]): Promise<void> {
  const tmux = await tmuxKillSession(config.senderSession)
  steps.push({
    name: "sender.stop.tmux",
    status: tmux.ok ? "ok" : "skipped",
    detail: tmux.ok ? `killed ${config.senderSession}` : `${config.senderSession} was not running`,
  })
  await killTcpPorts([config.hostPort, config.chromeDebugPort], steps)
}

async function stopDisplay(config: RemoteDesktopLifecycleConfig, stopXvfb: boolean, steps: LifecycleStep[]): Promise<void> {
  const rdp = await tmuxKillSession(config.rdpSession)
  steps.push({
    name: "display.rdp.stop",
    status: rdp.ok ? "ok" : "skipped",
    detail: rdp.ok ? `killed ${config.rdpSession}` : `${config.rdpSession} was not running`,
  })
  if (!stopXvfb) {
    steps.push({name: "display.xvfb.stop", status: "skipped", detail: "stopXvfb=false"})
    return
  }
  const xvfb = await tmuxKillSession(config.xvfbSession)
  steps.push({
    name: "display.xvfb.stop",
    status: xvfb.ok ? "ok" : "skipped",
    detail: xvfb.ok ? `killed ${config.xvfbSession}` : `${config.xvfbSession} was not running`,
  })
}

async function cleanChromeProfile(config: RemoteDesktopLifecycleConfig, steps: LifecycleStep[]): Promise<void> {
  if (!config.chromeProfile.startsWith("/tmp/metafor-")) {
    steps.push({name: "sender.clean-profile", status: "error", detail: `refusing to remove non-/tmp/metafor-* path: ${config.chromeProfile}`})
    return
  }
  await rm(config.chromeProfile, {recursive: true, force: true})
  steps.push({name: "sender.clean-profile", status: "ok", detail: config.chromeProfile})
}

async function killTcpPorts(ports: number[], steps: LifecycleStep[]): Promise<void> {
  const command = `fuser -k -TERM ${ports.map((port) => `${port}/tcp`).join(" ")} 2>/dev/null || true`
  const result = await runShell(command, {timeoutMs: COMMAND_TIMEOUT_MS})
  steps.push({
    name: "sender.ports.stop",
    status: result.ok ? "ok" : "skipped",
    detail: `released tcp ports ${ports.join(", ")}`,
  })
}

async function waitForStep(
  name: string,
  steps: LifecycleStep[],
  timeoutMs: number,
  probe: () => Promise<{ok: boolean; detail: string; data?: JsonObject}>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let last: {ok: boolean; detail: string; data?: JsonObject} | null = null
  while (Date.now() <= deadline) {
    last = await probe()
    if (last.ok) {
      steps.push(lifecycleStep(name, "ok", last.detail, last.data))
      return
    }
    await sleep(650)
  }
  steps.push(lifecycleStep(name, "error", last?.detail ?? `timed out after ${timeoutMs}ms`, last?.data))
}

async function tmuxSessionState(session: string): Promise<JsonObject> {
  const result = await runShell(`tmux has-session -t ${shellQuote(session)}`, {timeoutMs: COMMAND_TIMEOUT_MS})
  return {
    name: session,
    alive: result.ok,
  }
}

async function tmuxKillSession(session: string): Promise<CommandResult> {
  return await runShell(`tmux kill-session -t ${shellQuote(session)}`, {timeoutMs: COMMAND_TIMEOUT_MS})
}

async function processState(pattern: string): Promise<JsonObject> {
  const result = await runShell(`pgrep -af ${shellQuote(pattern)}`, {timeoutMs: COMMAND_TIMEOUT_MS})
  return {
    pattern,
    alive: result.ok && result.stdout.trim().length > 0,
    matches: result.stdout
      .split("\n")
      .map((line) => sanitizeDiagnostic(line.trim()))
      .filter((line) => line.length > 0)
      .slice(0, 8),
  }
}

async function displayState(config: RemoteDesktopLifecycleConfig): Promise<JsonObject> {
  const result = await runShell("gdbus call --session --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig --method org.gnome.Mutter.DisplayConfig.GetCurrentState", {timeoutMs: COMMAND_TIMEOUT_MS})
  if (!result.ok) {
    return {
      ok: false,
      meta0: false,
      error: compactError(result),
    }
  }
  const output = result.stdout
  const meta0 = output.includes("Meta-0")
  const metaIndex = output.indexOf("Meta-0")
  const metaPreview = metaIndex >= 0 ? output.slice(Math.max(0, metaIndex - 240), metaIndex + 760) : output.slice(0, 1_000)
  return {
    ok: true,
    meta0,
    expected: {width: config.width, height: config.height},
    rawPreview: sanitizeDiagnostic(metaPreview),
  }
}

async function remoteDesktopHostState(config: RemoteDesktopLifecycleConfig): Promise<JsonObject> {
  const url = `${remoteDesktopHostUrl(config)}/desktop/health`
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)})
    const contentType = response.headers.get("content-type") ?? ""
    const health = contentType.includes("json") ? await response.json() : await response.text()
    return {
      ok: response.ok,
      url,
      status: response.status,
      health,
    }
  } catch (error) {
    return {
      ok: false,
      url,
      error: serializeError(error),
    }
  }
}

async function remoteDesktopRtcState(config: RemoteDesktopLifecycleConfig): Promise<JsonObject> {
  const url = `${remoteDesktopHostUrl(config)}/desktop/rtc/state`
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)})
    const contentType = response.headers.get("content-type") ?? ""
    const payload = contentType.includes("json") ? await response.json() : await response.text()
    const object = asObject(payload)
    return {
      ok: response.ok,
      url,
      status: response.status,
      ...(object ?? {payload}),
    }
  } catch (error) {
    return {
      ok: false,
      url,
      error: serializeError(error),
    }
  }
}

async function chromeDebugState(config: RemoteDesktopLifecycleConfig): Promise<JsonObject> {
  const url = `http://127.0.0.1:${config.chromeDebugPort}/json/list`
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)})
    const targets = await response.json()
    return {
      ok: response.ok,
      url,
      status: response.status,
      targetCount: Array.isArray(targets) ? targets.length : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      url,
      error: serializeError(error),
    }
  }
}

function lifecycleConfig(override: JsonObject): RemoteDesktopLifecycleConfig {
  return {
    ...DEFAULT_CONFIG,
    chromeDebugPort: positiveInteger(asNumber(override.chromeDebugPort) ?? envNumber("INTERPRETER_REMOTE_DESKTOP_CHROME_DEBUG_PORT"), DEFAULT_CONFIG.chromeDebugPort),
    chromeProfile: asString(override.chromeProfile) ?? envString("INTERPRETER_REMOTE_DESKTOP_CHROME_PROFILE") ?? DEFAULT_CONFIG.chromeProfile,
    hostPort: positiveInteger(asNumber(override.hostPort) ?? envNumber("INTERPRETER_REMOTE_DESKTOP_RTC_HOST_PORT"), DEFAULT_CONFIG.hostPort),
    metaforUrl: asString(override.metaforUrl) ?? envString("METAFOR_URL") ?? DEFAULT_CONFIG.metaforUrl,
    rdpHost: asString(override.rdpHost) ?? envString("INTERPRETER_REMOTE_DESKTOP_RDP_HOST") ?? DEFAULT_CONFIG.rdpHost,
    rdpPort: positiveInteger(asNumber(override.rdpPort) ?? envNumber("INTERPRETER_REMOTE_DESKTOP_RDP_PORT"), DEFAULT_CONFIG.rdpPort),
    rdpSession: asString(override.rdpSession) ?? envString("INTERPRETER_REMOTE_DESKTOP_RDP_SESSION") ?? DEFAULT_CONFIG.rdpSession,
    senderSession: asString(override.senderSession) ?? envString("INTERPRETER_REMOTE_DESKTOP_SENDER_SESSION") ?? DEFAULT_CONFIG.senderSession,
    signalUrl: asString(override.signalUrl) ?? envString("METAFOR_REMOTE_DESKTOP_SIGNAL_URL") ?? DEFAULT_CONFIG.signalUrl,
    width: positiveInteger(asNumber(override.width) ?? envNumber("INTERPRETER_REMOTE_DESKTOP_WIDTH"), DEFAULT_CONFIG.width),
    height: positiveInteger(asNumber(override.height) ?? envNumber("INTERPRETER_REMOTE_DESKTOP_HEIGHT"), DEFAULT_CONFIG.height),
    remoteDesktopDir: asString(override.remoteDesktopDir)
      ?? envString("INTERPRETER_REMOTE_DESKTOP_DIR")
      ?? DEFAULT_CONFIG.remoteDesktopDir,
    xvfbDisplay: asString(override.xvfbDisplay) ?? envString("INTERPRETER_REMOTE_DESKTOP_XVFB_DISPLAY") ?? DEFAULT_CONFIG.xvfbDisplay,
    xvfbSession: asString(override.xvfbSession) ?? envString("INTERPRETER_REMOTE_DESKTOP_XVFB_SESSION") ?? DEFAULT_CONFIG.xvfbSession,
  }
}

function validateLifecycleConfig(config: RemoteDesktopLifecycleConfig): string | null {
  if (!config.xvfbDisplay.startsWith(":")) return "config.xvfbDisplay must look like :101"
  if (config.width < 320 || config.height < 240) return "config.width/config.height are too small"
  if (config.hostPort < 1 || config.hostPort > 65_535) return "config.hostPort must be 1..65535"
  if (config.chromeDebugPort < 1 || config.chromeDebugPort > 65_535) return "config.chromeDebugPort must be 1..65535"
  if (config.rdpPort < 1 || config.rdpPort > 65_535) return "config.rdpPort must be 1..65535"
  if (!existsSync(config.remoteDesktopDir)) return `config.remoteDesktopDir does not exist: ${config.remoteDesktopDir}`
  return null
}

function statusSummary(state: JsonObject): JsonObject {
  return {
    ready: state.ready,
    summary: state.summary,
    display: asObject(state.display)?.meta0,
    hostOk: asObject(state.host)?.ok,
  }
}

function remoteDesktopHostUrl(config: RemoteDesktopLifecycleConfig): string {
  return `http://127.0.0.1:${config.hostPort}`
}

function pushCommandStep(steps: LifecycleStep[], name: string, result: CommandResult, detail: string): void {
  steps.push({
    name,
    status: result.ok ? "ok" : "error",
    detail: result.ok ? detail : compactError(result),
  })
}

function lifecycleStep(name: string, status: RemoteDesktopLifecycleStepStatus, detail?: string, data?: JsonObject): LifecycleStep {
  const step: LifecycleStep = {name, status}
  if (detail !== undefined) step.detail = detail
  if (data !== undefined) step.data = data
  return step
}

function compactError(result: CommandResult): string {
  const text = `${result.stderr}\n${result.stdout}`.trim()
  if (result.timedOut) return `command timed out${text.length > 0 ? `: ${sanitizeDiagnostic(text).slice(0, 500)}` : ""}`
  if (text.length === 0) return `command exited with code ${result.code}`
  return sanitizeDiagnostic(text).slice(0, 800)
}

async function runShell(command: string, options: {cwd?: string; timeoutMs?: number} = {}): Promise<CommandResult> {
  const spawnOptions = {
    stdin: "ignore" as const,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  }
  const proc = options.cwd === undefined
    ? Bun.spawn(["bash", "-lc", command], spawnOptions)
    : Bun.spawn(["bash", "-lc", command], {...spawnOptions, cwd: options.cwd})
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill("SIGTERM")
  }, options.timeoutMs ?? COMMAND_TIMEOUT_MS)
  const stdoutPromise = new Response(proc.stdout).text()
  const stderrPromise = new Response(proc.stderr).text()
  const code = await proc.exited.catch(() => null)
  clearTimeout(timer)
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])
  return {
    ok: !timedOut && code === 0,
    code,
    stdout,
    stderr,
    timedOut,
  }
}

async function readJsonObject(req: Request): Promise<{body: JsonObject; error?: string}> {
  if (req.headers.get("content-length") === "0") return {body: {}}
  try {
    const text = await req.text()
    if (text.trim().length === 0) return {body: {}}
    const body = JSON.parse(text)
    const object = asObject(body)
    if (object === undefined) return {body: {}, error: "body must be a JSON object"}
    return {body: object}
  } catch (error) {
    return {body: {}, error: error instanceof Error ? error.message : String(error)}
  }
}

function lifecycleJsonResponse(payload: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function normalizeAction(value: string): RemoteDesktopLifecycleAction | null {
  if (value === "status" || value === "start" || value === "restart" || value === "recover" || value === "stop") return value
  return null
}

function normalizeScope(value: string | undefined, action: RemoteDesktopLifecycleAction): RemoteDesktopLifecycleScope | null {
  if (value === undefined || value.length === 0) {
    if (action === "restart" || action === "stop") return "sender"
    return "all"
  }
  if (value === "sender" || value === "display" || value === "all") return value
  return null
}

function boundedInteger(value: number | undefined, defaultValue: number, min: number, max: number): number {
  if (value === undefined) return defaultValue
  const integer = Math.trunc(value)
  return Math.max(min, Math.min(max, integer))
}

function positiveInteger(value: number | undefined, defaultValue: number): number {
  if (value === undefined || value <= 0) return defaultValue
  return Math.trunc(value)
}

function envString(name: string): string | undefined {
  const value = Bun.env[name]?.trim()
  return value === undefined || value.length === 0 ? undefined : value
}

function envNumber(name: string): number | undefined {
  const value = envString(name)
  if (value === undefined) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstExisting(paths: string[]): string {
  return paths.find((path) => path.includes("/") && existsSync(path)) ?? paths[paths.length - 1]!
}

function sanitizeDiagnostic(value: string): string {
  return value
    .replace(/\/p:[^\s)]+/g, "/p:********")
    .replace(/Password:\s*[^\n\r]+/gi, "Password: ********")
    .replace(/("password"\s*:\s*")[^"]+"/gi, "$1********\"")
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
