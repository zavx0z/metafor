import type {ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import {forceReplayPath} from "@metafor/types/force/replay"
import {isForceMessage} from "@metafor/types/force/validation"
import {logImpulse} from "./core/log"

const clients = new Map<ServerWebSocket<{domain?: string; id?: string}>, {domain: string; id: string}>()

const isUncommittedWorldMutation = (message: ForceMessage): boolean => {
  const part = message.parts[0]
  return (part.part === "gluon" || part.part === "higgs") &&
    (part.op === "add" || part.op === "replace" || part.op === "remove") &&
    part.from === undefined
}

const deliverImpulse = (
  message: ForceMessage,
  origin?: ServerWebSocket<{domain?: string; id?: string}>,
): number => {
  const source = origin?.data.domain ? `force:${origin.data.domain}` : "force:http"
  logImpulse(source, "<-", message)
  const payload = JSON.stringify(message)
  const boundaryOnly = isUncommittedWorldMutation(message) && origin?.data.domain !== "boundary"
  let delivered = 0

  for (const [socket, client] of clients) {
    if (socket === origin || socket.readyState !== WebSocket.OPEN) continue
    if (boundaryOnly && client.domain !== "boundary") continue
    socket.send(payload)
    delivered++
  }
  return delivered
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
        const delivered = deliverImpulse(payload)
        if (isUncommittedWorldMutation(payload) && delivered === 0) {
          return Response.json({ok: false, error: "Boundary is unavailable for canonical world mutation"}, {status: 503})
        }
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
        const joiningReplayRequest = {
          parts: [{part: "z", op: "test", path: forceReplayPath(message.domain, message.id), ts: Date.now()}],
        } satisfies ForceMessage
        for (const [socket, client] of clients) {
          if (socket === ws || socket.readyState !== WebSocket.OPEN) continue
          const existingReplayRequest = {
            parts: [{part: "z", op: "test", path: forceReplayPath(client.domain, client.id), ts: Date.now()}],
          } satisfies ForceMessage
          logImpulse("force", "->", existingReplayRequest)
          ws.send(JSON.stringify(existingReplayRequest))
          logImpulse("force", "->", joiningReplayRequest)
          socket.send(JSON.stringify(joiningReplayRequest))
        }
        return
      }
      if (isForceMessage(payload)) deliverImpulse(payload, ws)
    },
  },
})

console.log(`[force] listening on ${server.url}`)
