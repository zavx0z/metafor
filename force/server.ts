import type {ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {forceReplayPath} from "@metafor/types/force/replay"

const clients = new Map<ServerWebSocket<{domain?: string; id?: string}>, {domain: string; id: string}>()

const particleParts = new Set(["inflaton", "graviton", "photon", "gluon", "higgs", "w+", "w-", "z"])
const particleOperations = new Set(["add", "remove", "replace", "move", "copy", "test"])
const particleKeys = new Set(["part", "op", "path", "value", "from"])

const isParticle = (value: unknown): value is Particle => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const particle = value as Partial<Particle>
  return Object.keys(value).every((key) => particleKeys.has(key)) &&
    typeof particle.part === "string" && particleParts.has(particle.part) &&
    typeof particle.op === "string" && particleOperations.has(particle.op) &&
    (typeof particle.path === "string" || typeof particle.path === "number") &&
    (particle.from === undefined || typeof particle.from === "string" || typeof particle.from === "number")
}

const isForceMessage = (value: unknown): value is ForceMessage =>
  typeof value === "object" && value !== null &&
  (value as {type?: unknown}).type === undefined &&
  Object.keys(value).length === 1 &&
  Array.isArray((value as {parts?: unknown}).parts) &&
  (value as {parts: unknown[]}).parts.length === 1 &&
  isParticle((value as {parts: unknown[]}).parts[0])

const deliverImpulse = (
  message: ForceMessage,
  origin?: ServerWebSocket<{domain?: string; id?: string}>,
): void => {
  const payload = JSON.stringify(message)
  for (const [socket] of clients) {
    if (socket === origin || socket.readyState !== WebSocket.OPEN) continue
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
        if (!isForceMessage(payload)) {
          return Response.json({ok: false, error: "body must be a plain ForceMessage with exactly one minimal particle"}, {status: 400})
        }
        deliverImpulse(payload)
        return Response.json({ok: true, parts: 1})
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

      const message = payload as {type?: unknown; domain?: unknown; id?: unknown}
      if (message.type === "register") {
        if (typeof message.domain !== "string" || typeof message.id !== "string") return
        clients.set(ws, {domain: message.domain, id: message.id})
        ws.data.domain = message.domain
        ws.data.id = message.id
        console.log(`[force] connected: ${message.domain} ${message.id}`)
        for (const [socket, client] of clients) {
          if (socket === ws || socket.readyState !== WebSocket.OPEN) continue
          ws.send(JSON.stringify({
            parts: [{part: "z", op: "test", path: forceReplayPath(client.domain, client.id)}],
          } satisfies ForceMessage))
        }
        return
      }
      if (isForceMessage(payload)) deliverImpulse(payload, ws)
    },
  },
})

console.log(`[force] listening on ${server.url}`)
