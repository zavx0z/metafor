import type {ServerWebSocket} from "bun"
import {sourceForceMessage, type ForceMessage} from "@metafor/types/force/message"
import {forceReplayPath} from "@metafor/types/force/replay"
import {isAgentIngressMessage, isForceMessage} from "@metafor/types/force/validation"
import {logImpulse} from "./core/log"

type ForceSocket = ServerWebSocket<{domain?: string; id?: string}>
type ForceClient = {domain: string; id: string}
type ForceRuntime = typeof globalThis & {__metaforForceClients?: Map<ForceSocket, ForceClient>}

// Bun hot reload keeps the WebSocket sessions alive. Keep their registry alive with
// them, otherwise Force can have open domain sockets that a reloaded module cannot see.
const runtime = globalThis as ForceRuntime
const clients = runtime.__metaforForceClients ??= new Map<ForceSocket, ForceClient>()

const isUncommittedWorldMutation = (message: ForceMessage): boolean => {
  const part = message.parts[0]
  return (part.part === "gluon" || part.part === "higgs") &&
    (part.op === "add" || part.op === "replace" || part.op === "remove") &&
    part.from === undefined
}

const relevantDomains = (message: ForceMessage, originDomain?: string): Set<string> | null => {
  const part = message.parts[0]
  if (part.by === "agent" && part.part === "inflaton") return new Set(["dark", "bulk"])
  if (part.by === "dark" && part.part === "inflaton") return new Set(["boundary", "bulk"])
  if (isUncommittedWorldMutation(message) && originDomain !== "boundary") return new Set(["boundary"])
  return null
}

const connectedDomains = (): Set<string> => {
  const domains = new Set<string>()
  for (const [socket, client] of clients) {
    if (socket.readyState !== WebSocket.OPEN) {
      clients.delete(socket)
      continue
    }
    domains.add(client.domain)
  }
  return domains
}

const deliverImpulse = (
  message: ForceMessage,
  origin?: ForceSocket,
): string[] => {
  const source = origin?.data.domain ? `force:${origin.data.domain}` : "force:http"
  logImpulse(source, "<-", message)
  const payload = JSON.stringify(message)
  const domains = relevantDomains(message, origin?.data.domain)
  const delivered = new Set<string>()

  for (const [socket, client] of clients) {
    if (socket === origin || socket.readyState !== WebSocket.OPEN) continue
    if (domains && !domains.has(client.domain)) continue
    socket.send(payload)
    delivered.add(client.domain)
  }
  return [...delivered].sort()
}

export const server = Bun.serve<{domain?: string; id?: string}>({
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    "/health": {
      GET() {
        return Response.json({
          ok: true,
          domain: "force",
          connectedDomains: [...connectedDomains()].sort(),
        })
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
        if (!isAgentIngressMessage(payload)) {
          return Response.json({
            ok: false,
            error: "body must be one unsourced inflaton/add for a Meta declaration with a valid ts and name",
          }, {status: 400})
        }
        const required = ["bulk", "dark"]
        const available = connectedDomains()
        const missing = required.filter((domain) => !available.has(domain))
        if (missing.length > 0) {
          return Response.json({ok: false, error: `required Force domains are unavailable: ${missing.join(", ")}`}, {status: 503})
        }
        const message = sourceForceMessage(payload, "agent")
        const delivered = deliverImpulse(message)
        return Response.json({ok: true, parts: 1, delivered, particle: message.parts[0]})
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
          parts: [{part: "z", op: "test", path: forceReplayPath(message.domain, message.id), by: "force", ts: Date.now()}],
        } satisfies ForceMessage
        for (const [socket, client] of clients) {
          if (socket === ws || socket.readyState !== WebSocket.OPEN) continue
          const existingReplayRequest = {
            parts: [{part: "z", op: "test", path: forceReplayPath(client.domain, client.id), by: "force", ts: Date.now()}],
          } satisfies ForceMessage
          logImpulse("force", "->", existingReplayRequest)
          ws.send(JSON.stringify(existingReplayRequest))
          logImpulse("force", "->", joiningReplayRequest)
          socket.send(JSON.stringify(joiningReplayRequest))
        }
        return
      }
      const client = clients.get(ws)
      if (client && isForceMessage(payload) && payload.parts[0].by === client.domain) deliverImpulse(payload, ws)
    },
  },
})

console.log(`[force] listening on ${server.url}`)
