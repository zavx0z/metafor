import {rmSync} from "node:fs"
import type {ServerWebSocket} from "bun"

type ForceSocketData = {kind: "force"}

const BOUNDARY_PATH = process.env.BOUNDARY_PATH ?? "./boundary.sqlite"

for (const path of [BOUNDARY_PATH, `${BOUNDARY_PATH}-wal`, `${BOUNDARY_PATH}-shm`]) rmSync(path, {force: true})

await import("@metafor/dark/server")

const port = Number(process.env.APPLICATION_DARK_PORT ?? 7101)
const peerUrl = process.env.APPLICATION_ENERGY_URL ?? "ws://127.0.0.1:7102/ws"
const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<ForceSocketData>>()
const peer = new WebSocket(peerUrl)

boundary.entropy((event) => {
  const payload = JSON.stringify(event.data)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
  if (peer.readyState === WebSocket.OPEN) peer.send(payload)
})

peer.addEventListener("message", (event) => {
  void boundary.absorb(JSON.parse(String(event.data)))
})
peer.addEventListener("error", () => peer.close())

boundary.emit({parts: [{part: "graviton", op: "test", path: "wimp", value: "zavx0z/git"}]})

Bun.serve<ForceSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/ws": (req, server) =>
      server.upgrade(req, {data: {kind: "force"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426}),
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    message(_socket, data) {
      void boundary.absorb(JSON.parse(String(data)))
    },
    close(socket) {
      sockets.delete(socket)
    },
  },
})
