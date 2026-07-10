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

export const server = Bun.serve<{domain?: string; id?: string}>({
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "force"})
      },
    },
    "/force": {
      async POST(req: Bun.BunRequest<"/force">) {
        let payload: unknown
        try {
          payload = await req.json()
        } catch (error) {
          return Response.json({ok: false, error: error instanceof Error ? error.message : String(error)}, {status: 400})
        }
        if (
          typeof payload !== "object" ||
          payload === null ||
          (payload as {type?: unknown}).type !== undefined ||
          !Array.isArray((payload as {parts?: unknown}).parts)
        ) {
          return Response.json({ok: false, error: "body must be a plain ForceMessage with parts array"}, {status: 400})
        }
        const message: ForceMessage = {parts: (payload as ForceMessage).parts}
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
      let payload: unknown
      try {
        payload = JSON.parse(String(raw)) as unknown
      } catch {
        return
      }
      if (typeof payload !== "object" || payload === null) return

      const message = payload as {type?: unknown; domain?: unknown; id?: unknown; snapshot?: unknown; parts?: unknown}
      switch (message.type) {
        case "register": {
          if (typeof message.domain !== "string" || typeof message.id !== "string") return
          clients.set(ws, {domain: message.domain, id: message.id})
          ws.data.domain = message.domain
          ws.data.id = message.id
          console.log(`[force] connected: ${message.domain} ${message.id}`)
          if (snapshots.has(message.domain)) ws.send(JSON.stringify({type: "create", snapshot: snapshots.get(message.domain)}))
          break
        }
        case "create": {
          if (typeof message.domain !== "string") return
          snapshots.set(message.domain, message.snapshot)
          deliverCreate(message.domain, message.snapshot)
          break
        }
        case undefined: {
          if (!Array.isArray(message.parts)) return
          deliverImpulse({parts: message.parts as ForceMessage["parts"]})
          break
        }
      }
    },
  },
})

console.log(`[force] listening on ${server.url}`)
