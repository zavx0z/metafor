import {Buffer} from "node:buffer"
import {
  bridgeUrlWithToken,
  createEnergyClaim,
  createEnergyHello,
  createEnergyServerStatus,
  createEnergySuccessForce,
  readEnergyBridgeIncomingMessage,
} from "./server-bridge.ts"
import type {EnergyEnv, EnergyProcessResult, EnergyProcessTask, EnergyRuntimeKind} from "./energy.t.ts"
import type {EnergyBridgeOutgoingMessage, EnergyServerSocketState} from "./server.t.ts"

const HOST = Bun.env.HOST ?? Bun.env.ENERGY_HOST ?? "127.0.0.1"
const PORT = Number(Bun.env.PORT ?? Bun.env.ENERGY_PORT ?? 3006)
const RAW_BRIDGE_URL = Bun.env.ENERGY_BRIDGE_WS_URL
  ?? Bun.env.APP_WEB_ENERGY_WS_URL
  ?? "ws://127.0.0.1:3004/energy/ws"
const ENERGY_BRIDGE_TOKEN = Bun.env.ENERGY_BRIDGE_TOKEN?.trim() || null
const BRIDGE_URL = bridgeUrlWithToken(RAW_BRIDGE_URL, ENERGY_BRIDGE_TOKEN)
const STARTED_AT = new Date().toISOString()

let bridgeSocket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let closing = false
let socketState: EnergyServerSocketState = "idle"
let reconnects = 0
let completedTasks = 0
let failedTasks = 0
let lastTaskAt: string | null = null
let lastResultAt: string | null = null
let lastError: string | null = null

const activeTasks = new Map<string, EnergyProcessTask>()
const env = energyEnv()

function log(tag: string, message: string, detail = ""): void {
  const suffix = detail.length > 0 ? ` ${detail}` : ""
  console.log(`[energy:${tag}] ${new Date().toISOString()} ${message}${suffix}`)
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

function statusPayload() {
  return createEnergyServerStatus({
    pid: process.pid,
    startedAt: STARTED_AT,
    host: HOST,
    port: PORT,
    bridgeUrl: RAW_BRIDGE_URL,
    socketState,
    env,
    activeTasks: activeTasks.size,
    completedTasks,
    failedTasks,
    lastTaskAt,
    lastResultAt,
    lastError,
  })
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {status})
}

function sendToBridge(message: EnergyBridgeOutgoingMessage): boolean {
  const socket = bridgeSocket
  if (socket === null || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

function scheduleReconnect(): void {
  if (closing || reconnectTimer !== null) return
  const delayMs = Math.min(10_000, 500 + reconnects * 500)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectBridge()
  }, delayMs)
}

function connectBridge(): void {
  if (closing) return
  reconnects += socketState === "idle" ? 0 : 1
  socketState = "connecting"
  const socket = new WebSocket(BRIDGE_URL)
  bridgeSocket = socket

  socket.addEventListener("open", () => {
    socketState = "connected"
    lastError = null
    log("bridge", "connected", RAW_BRIDGE_URL)
    sendToBridge(createEnergyHello(env, process.pid, STARTED_AT))
  })

  socket.addEventListener("message", (event) => {
    void handleBridgeData(event.data).catch((error) => {
      lastError = errorMessage(error)
      log("bridge", "message error", lastError)
    })
  })

  socket.addEventListener("error", () => {
    socketState = "error"
    lastError = "bridge websocket error"
    log("bridge", "error")
  })

  socket.addEventListener("close", () => {
    if (bridgeSocket === socket) bridgeSocket = null
    socketState = "closed"
    log("bridge", "closed")
    scheduleReconnect()
  })
}

async function handleBridgeData(raw: unknown): Promise<void> {
  const message = readEnergyBridgeIncomingMessage(typeof raw === "string" || raw instanceof Buffer ? raw : String(raw))
  if (message === null) {
    log("bridge", "ignored invalid message")
    return
  }

  if (message.type === "error") {
    lastError = message.error
    log("bridge", "remote error", message.error)
    return
  }
  if (message.type === "force") {
    log("force", "received", `parts=${message.parts.length}`)
    return
  }
  if (message.type === "claim-accepted") {
    await handleClaimAccepted(message)
    return
  }
  if (message.type === "claim-rejected") {
    handleClaimRejected(message)
    return
  }

  await handleProcessTask(message.task)
}

async function handleProcessTask(task: EnergyProcessTask): Promise<void> {
  const key = taskKey(task)
  activeTasks.set(key, task)
  lastTaskAt = new Date().toISOString()
  log("task", "received", `actor=${task.actorId} process=${task.processId}`)

  const sent = sendToBridge(createEnergyClaim(task, env, task.token))
  log("claim", sent ? "sent" : "not connected", `actor=${task.actorId} process=${task.processId}`)
}

async function handleClaimAccepted(message: {actorId: number; processId: number; token?: string}): Promise<void> {
  log("claim", "accepted", `actor=${message.actorId} process=${message.processId}`)
  if (Bun.env.ENERGY_ECHO_TASKS !== "1") return

  const entry = findActiveTask(message.actorId, message.processId, message.token)
  if (entry === null) {
    log("task", "accepted without active task", `actor=${message.actorId} process=${message.processId}`)
    return
  }
  const [key, task] = entry

  const result: EnergyProcessResult = {
    ok: true,
    actorId: task.actorId,
    processId: task.processId,
    ...(task.token !== undefined ? {token: task.token} : {}),
    fields: task.fields ?? {},
  }
  activeTasks.delete(key)
  completedTasks += 1
  lastResultAt = new Date().toISOString()
  sendToBridge({type: "process-result", result})
  sendToBridge({type: "force", parts: createEnergySuccessForce(result).parts})
}

function handleClaimRejected(message: {actorId: number; processId: number; token?: string; reason: string}): void {
  const entry = findActiveTask(message.actorId, message.processId, message.token)
  if (entry !== null) activeTasks.delete(entry[0])
  failedTasks += 1
  lastError = message.reason
  log("claim", "rejected", `actor=${message.actorId} process=${message.processId} reason=${message.reason}`)
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  routes: {
    "/health": () => jsonResponse(statusPayload()),
    "/energy/status": () => jsonResponse(statusPayload()),
    "/energy/reconnect": (req: Request) => {
      if (req.method !== "POST") return new Response("Method Not Allowed", {status: 405})
      bridgeSocket?.close(1000, "manual reconnect")
      bridgeSocket = null
      connectBridge()
      return jsonResponse(statusPayload(), 202)
    },
  },
  fetch() {
    return new Response("Not Found", {status: 404})
  },
})

function taskKey(task: EnergyProcessTask): string {
  return `${task.actorId}\0${task.processId}\0${task.token}`
}

function findActiveTask(actorId: number, processId: number, token?: string): [string, EnergyProcessTask] | null {
  if (token !== undefined) {
    const key = `${actorId}\0${processId}\0${token}`
    const task = activeTasks.get(key)
    return task === undefined ? null : [key, task]
  }

  for (const [key, task] of activeTasks) {
    if (task.actorId === actorId && task.processId === processId) return [key, task]
  }
  return null
}

function energyEnv(): EnergyEnv {
  const kind = energyRuntimeKind(Bun.env.ENERGY_KIND)
  return {
    kind,
    id: Bun.env.ENERGY_ID?.trim() || `energy-${process.pid}`,
    ...stringListProp("labels", Bun.env.ENERGY_LABELS),
    ...stringListProp("capabilities", Bun.env.ENERGY_CAPABILITIES),
  }
}

function energyRuntimeKind(value: string | undefined): EnergyRuntimeKind {
  if (value === "server" || value === "browser-main" || value === "worker" || value === "service-worker" || value === "desktop-main" || value === "unknown") return value
  return "server"
}

function stringListProp(key: "labels" | "capabilities", value: string | undefined): Pick<EnergyEnv, typeof key> | Record<string, never> {
  const items = value?.split(",").map((item) => item.trim()).filter(Boolean) ?? []
  return items.length > 0 ? {[key]: items} as Pick<EnergyEnv, typeof key> : {}
}

function shutdown(signal: string): void {
  closing = true
  if (reconnectTimer !== null) clearTimeout(reconnectTimer)
  bridgeSocket?.close(1000, signal)
  server.stop()
  log("server", "stopped", signal)
}

process.on("SIGINT", () => {
  shutdown("SIGINT")
  process.exit(130)
})
process.on("SIGTERM", () => {
  shutdown("SIGTERM")
  process.exit(143)
})

connectBridge()
log("server", "online", `host=${HOST} port=${PORT} bridge=${RAW_BRIDGE_URL}`)
