import type {ServerWebSocket} from "bun"

const clients = new Map<ServerWebSocket<{domain?: string; id?: string}>, {domain: string; id: string}>()

const server = Bun.serve<{domain?: string; id?: string}>({
  port: 4000,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "force"})
      },
    },
    "/ws": {
      GET(req: Bun.BunRequest<"/ws">, server: Bun.Server<{domain?: string; id?: string}>) {
        const upgraded = server.upgrade(req, {data: {}})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
  },
  websocket: {
    close(ws) {
      clients.delete(ws)
    },
    message(ws, raw) {
      let payload: {type?: unknown; domain?: unknown; id?: unknown}
      try {
        payload = JSON.parse(String(raw)) as {type?: unknown; domain?: unknown; id?: unknown}
      } catch {
        return
      }

      switch (payload.type) {
        case "register": {
          if (typeof payload.domain !== "string" || typeof payload.id !== "string") break
          clients.set(ws, {domain: payload.domain, id: payload.id})
          ws.data.domain = payload.domain
          ws.data.id = payload.id
          console.log(`[force] connected: ${payload.domain} ${payload.id}`)
          break
        }
      }
    },
  },
})

console.log(`[force] listening on ${server.url}`)
