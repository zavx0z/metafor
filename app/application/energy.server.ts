import type {Server, ServerWebSocket} from "bun"
import {force} from "boundary"

type ForceSocketData = {kind: "force"}

await import("energy/server")

const port = Number(process.env.APPLICATION_ENERGY_PORT ?? 7102)
const sockets = new Set<ServerWebSocket<ForceSocketData>>()

force.entropy((event) => {
  const payload = JSON.stringify(event.data)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
})

Bun.serve<ForceSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/ws": (req: Request, server: Server<ForceSocketData>) =>
      server.upgrade(req, {data: {kind: "force"}}) ? undefined : new Response("WebSocket upgrade failed", {status: 426}),
  },
  websocket: {
    open(socket) {
      sockets.add(socket)
    },
    message(_socket, data) {
      force.absorb(JSON.parse(String(data)))
    },
    close(socket) {
      sockets.delete(socket)
    },
  },
})
