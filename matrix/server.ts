import {Buffer} from "node:buffer"
import {
  absorbForceMessage,
  closeForceChannel,
  force,
  gravity$,
  loadMatrixRuntimeSnapshot,
  matrix$,
  subscribeMatrixGluonBroadcast,
  subscribeMatrixHiggsBroadcast,
  subscribeMatrixProcessTasks,
  subscribeMatrixWeakResultBroadcast,
} from "./index.ts"
import {bridgeUrlWithToken, createMatrixServerStatus, readMatrixBridgeIncomingMessage} from "./server-bridge.ts"
import type {MatrixForceBinding, MatrixParticle} from "./channel.ts"
import type {MatrixRuntimeSnapshot, MatrixBroadcastSubscription} from "./matrix.ts"
import type {MatrixBridgeOutgoingMessage, MatrixServerSocketState} from "./server.t.ts"
import type {BoundaryUpdateMessage} from "boundary"

const HOST = Bun.env.HOST ?? Bun.env.MATRIX_HOST ?? "127.0.0.1"
const PORT = Number(Bun.env.PORT ?? Bun.env.MATRIX_PORT ?? 3005)
const RAW_BRIDGE_URL = Bun.env.MATRIX_BOUNDARY_WS_URL
  ?? Bun.env.APP_WEB_MATRIX_WS_URL
  ?? "ws://127.0.0.1:3004/matrix/ws"
const MATRIX_BRIDGE_TOKEN = Bun.env.MATRIX_BRIDGE_TOKEN?.trim() || null
const BRIDGE_URL = bridgeUrlWithToken(RAW_BRIDGE_URL, MATRIX_BRIDGE_TOKEN)
const STARTED_AT = new Date().toISOString()

let bridgeSocket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let closing = false
let socketState: MatrixServerSocketState = "idle"
let loaded = false
let snapshotVersion: number | null = null
let reconnects = 0
let lastSnapshotAt: string | null = null
let lastForceAt: string | null = null
let lastError: string | null = null

const subscriptions: MatrixBroadcastSubscription[] = [
  subscribeMatrixGluonBroadcast(),
  subscribeMatrixHiggsBroadcast(),
  subscribeMatrixWeakResultBroadcast(),
]
const processTaskSubscription = subscribeMatrixProcessTasks((task) => {
  const sent = sendToBridge({type: "process-task", version: 1, task})
  log("task", sent ? "sent" : "dropped", `actor=${task.actorId} process=${task.processId}`)
})
let entropySubscription: MatrixForceBinding | null = null

function log(tag: string, message: string, detail = ""): void {
  const suffix = detail.length > 0 ? ` ${detail}` : ""
  console.log(`[matrix:${tag}] ${new Date().toISOString()} ${message}${suffix}`)
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

function statusPayload() {
  return createMatrixServerStatus({
    pid: process.pid,
    startedAt: STARTED_AT,
    host: HOST,
    port: PORT,
    bridgeUrl: RAW_BRIDGE_URL,
    socketState,
    loaded,
    snapshotVersion,
    actorCount: gravity$.activeActorIds.length,
    braneCount: matrix$.branes.length,
    fieldCount: matrix$.fields.length,
    structuralDirty: gravity$.structuralDirty,
    reconnects,
    lastSnapshotAt,
    lastForceAt,
    lastError,
  })
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {status})
}

function sendToBridge(message: MatrixBridgeOutgoingMessage): boolean {
  const socket = bridgeSocket
  if (socket === null || socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(message))
  return true
}

async function loadBridgeSnapshot(snapshot: MatrixRuntimeSnapshot): Promise<void> {
  await loadMatrixRuntimeSnapshot(snapshot)
  loaded = true
  snapshotVersion = snapshot.version
  lastSnapshotAt = new Date().toISOString()
  lastError = null
  log("snapshot", "loaded", `actors=${gravity$.activeActorIds.length} branes=${matrix$.branes.length}`)
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
    sendToBridge({type: "hello", runtime: "matrix", pid: process.pid, startedAt: STARTED_AT})
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
    socketState = closing ? "closed" : "closed"
    log("bridge", "closed")
    scheduleReconnect()
  })
}

async function handleBridgeData(raw: unknown): Promise<void> {
  const message = readMatrixBridgeIncomingMessage(typeof raw === "string" || raw instanceof Buffer ? raw : String(raw))
  if (message === null) {
    log("bridge", "ignored invalid message")
    return
  }

  if (message.type === "matrix-snapshot") {
    await loadBridgeSnapshot({...message.snapshot, ok: true})
    return
  }

  if (message.type === "error") {
    lastError = message.error
    log("bridge", "remote error", message.error)
    return
  }

  absorbForceMessage({parts: message.parts as MatrixParticle[]})
  lastForceAt = new Date().toISOString()
}

entropySubscription = force.entropy((event) => {
  sendToBridge({type: "force", parts: event.data.parts as BoundaryUpdateMessage["parts"]})
})

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  routes: {
    "/health": () => jsonResponse(statusPayload()),
    "/matrix/status": () => jsonResponse(statusPayload()),
    "/matrix/reconnect": (req: Request) => {
      if (req.method !== "POST") return new Response("Method Not Allowed", {status: 405})
      bridgeSocket?.close(1000, "manual reconnect")
      bridgeSocket = null
      connectBridge()
      return jsonResponse(statusPayload(), 202)
    },
    "/matrix/snapshot/request": (req: Request) => {
      if (req.method !== "POST") return new Response("Method Not Allowed", {status: 405})
      const sent = sendToBridge({type: "snapshot-request", reason: "http"})
      return jsonResponse({...statusPayload(), sent}, sent ? 202 : 503)
    },
  },
  fetch() {
    return new Response("Not Found", {status: 404})
  },
})

function shutdown(signal: string): void {
  closing = true
  if (reconnectTimer !== null) clearTimeout(reconnectTimer)
  entropySubscription?.close()
  processTaskSubscription.close()
  for (const subscription of subscriptions) void subscription.close()
  bridgeSocket?.close(1000, signal)
  closeForceChannel()
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
