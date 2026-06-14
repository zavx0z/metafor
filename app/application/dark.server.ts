import type {Server, ServerWebSocket} from "bun"

type ForceSocketData = {kind: "force"}

await import("dark/server")

const port = Number(process.env.APPLICATION_DARK_PORT ?? 7101)
const boundary = globalThis.boundary
const sockets = new Set<ServerWebSocket<ForceSocketData>>()

boundary.entropy((event) => {
  const payload = JSON.stringify(event.data)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
})

Bun.serve<ForceSocketData>({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/energy/runtime": {
      GET: async () => {
        try {
          return Response.json({ok: true, ...(await boundary.energyRuntime())})
        } catch (error) {
          return Response.json({ok: false, error: error instanceof Error ? error.message : String(error)}, {status: 500})
        }
      },
    },
    "/ws": (req: Request, server: Server<ForceSocketData>) =>
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
