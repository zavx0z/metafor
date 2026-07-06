import type {ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"

const clients = new Map<ServerWebSocket<{domain?: string; id?: string}>, {domain: string; id: string}>()
const snapshots = new Map<string, unknown>()

const deliverImpulse = (message: ForceMessage): void => {
  const payload = JSON.stringify(message)
  for (const [socket] of clients) {
    if (socket.readyState !== WebSocket.OPEN) continue
    socket.send(payload)
  }
}

const deliverCreate = (domain: string, snapshot: unknown): void => {
  const payload = JSON.stringify({type: "create", snapshot})
  for (const [socket, client] of clients) {
    if (client.domain !== domain || socket.readyState !== WebSocket.OPEN) continue
    socket.send(payload)
  }
}

const server = Bun.serve<{domain?: string; id?: string}>({
  port: 4000,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "force"})
      },
    },
    "/force": {
      async POST(req: Bun.BunRequest<"/force">) {
        let payload: {parts?: unknown}
        try {
          payload = await req.json() as {parts?: unknown}
        } catch (error) {
          return Response.json({ok: false, error: error instanceof Error ? error.message : String(error)}, {status: 400})
        }
        if (!Array.isArray(payload.parts)) return Response.json({ok: false, error: "parts must be an array"}, {status: 400})
        const message: ForceMessage = {parts: payload.parts as ForceMessage["parts"]}
        deliverImpulse(message)
        return Response.json({ok: true, parts: message.parts.length})
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
      let payload: {type?: unknown; domain?: unknown; id?: unknown; snapshot?: unknown}
      try {
        payload = JSON.parse(String(raw)) as {type?: unknown; domain?: unknown; id?: unknown; snapshot?: unknown}
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
          if (snapshots.has(payload.domain)) deliverCreate(payload.domain, snapshots.get(payload.domain))
          break
        }
        case "create": {
          if (typeof payload.domain !== "string") break
          snapshots.set(payload.domain, payload.snapshot)
          deliverCreate(payload.domain, payload.snapshot)
          break
        }
      }
    },
  },
})

console.log(`[force] listening on ${server.url}`)
