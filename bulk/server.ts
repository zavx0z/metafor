import {file, type ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import index from "./index.html"
import {Force} from "force"

type BrowserClient = {domain?: string; id?: string}

const browserClients = new Set<ServerWebSocket<BrowserClient>>()
const force = new Force("bulk")

const sendBrowser = (ws: ServerWebSocket<BrowserClient>, payload: unknown): void => {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

const server = Bun.serve<BrowserClient>({
  port: Number(Bun.env.PORT ?? 4004),
  routes: {
    "/": index,
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "bulk"})
      },
    },
    "/ws": {
      GET(req: Bun.BunRequest<"/ws">, server: Bun.Server<BrowserClient>) {
        const upgraded = server.upgrade(req, {data: {}})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/engine-static/JetBrainsMono-Bold.ttf": file(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)),
  },
  websocket: {
    close(ws) {
      browserClients.delete(ws)
      if (ws.data.domain && ws.data.id) console.log(`[bulk] browser disconnected ${ws.data.domain} ${ws.data.id}`)
    },
    message(ws, raw) {
      let payload: unknown
      try {
        payload = JSON.parse(String(raw)) as unknown
      } catch {
        sendBrowser(ws, {type: "error", error: "invalid json"})
        return
      }

      if (typeof payload !== "object" || payload === null) {
        sendBrowser(ws, {type: "error", error: "invalid message"})
        return
      }

      if ((payload as {type?: unknown}).type === "register") {
        const {domain, id} = payload as {domain?: unknown; id?: unknown}
        if (typeof domain !== "string" || typeof id !== "string") {
          sendBrowser(ws, {type: "error", error: "invalid register"})
          return
        }
        ws.data.domain = domain
        ws.data.id = id
        browserClients.add(ws)
        console.log(`[bulk] browser connected ${domain} ${id}`)
        return
      }

      if (Array.isArray((payload as {parts?: unknown}).parts) && (payload as {parts: unknown[]}).parts.length === 1) {
        const message = payload as ForceMessage
        console.log(`[bulk] browser -> force part=${message.parts[0].part}`)
        force.impulse(message)
        return
      }

      sendBrowser(ws, {type: "error", error: "unsupported message"})
    },
  },
})

console.log(`[bulk] listening on ${server.url}`)

force.onImpulse = (impulse) => {
  console.log(`[bulk] <- force part=${impulse.parts[0].part}`)
  for (const client of browserClients) sendBrowser(client, impulse)
}
