import {rmSync} from "node:fs"
import type {ServerWebSocket} from "bun"

type ForceSocketData = {kind: "force"}

const STORE_PATH = process.env.STORE_PATH ?? "./boundary.sqlite"

for (const path of [STORE_PATH, `${STORE_PATH}-wal`, `${STORE_PATH}-shm`]) rmSync(path, {force: true})

await import("@metafor/boundary/server")

const port = Number(process.env.APPLICATION_BOUNDARY_PORT ?? 7102)
const peerUrl = process.env.APPLICATION_DARK_URL
const store = globalThis.store
const sockets = new Set<ServerWebSocket<ForceSocketData>>()
const peer = peerUrl ? new WebSocket(peerUrl) : null

store.entropy((event) => {
  const payload = JSON.stringify(event.data)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
  if (peer?.readyState === WebSocket.OPEN) peer.send(payload)
})

peer?.addEventListener("message", (event) => {
  void store.absorb(JSON.parse(String(event.data)))
})
peer?.addEventListener("error", () => peer.close())

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
      void store.absorb(JSON.parse(String(data)))
    },
    close(socket) {
      sockets.delete(socket)
    },
  },
})
