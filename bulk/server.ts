import {file, type ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"
import {unsourceForceMessage} from "@metafor/types/force/message"
import index from "./index.html"
import {Force} from "force"

type BrowserClient = {domain: string; id: string}

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
        const url = new URL(req.url)
        const domain = url.searchParams.get("domain")
        const id = url.searchParams.get("id")
        if (!domain || !id) return new Response("Bulk channel identity is required", {status: 400})
        const upgraded = server.upgrade(req, {data: {domain, id}})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/engine-static/JetBrainsMono-Bold.ttf": file(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)),
  },
  websocket: {
    open(ws) {
      browserClients.add(ws)
      console.log(`[bulk] browser connected ${ws.data.domain} ${ws.data.id}`)
    },
    close(ws) {
      browserClients.delete(ws)
      console.log(`[bulk] browser disconnected ${ws.data.domain} ${ws.data.id}`)
    },
    message(ws, raw) {
      let message: ForceMessage
      try {
        message = JSON.parse(String(raw)) as ForceMessage
      } catch {
        ws.close()
        return
      }
      console.log(`[bulk] browser -> force part=${message.parts[0].part}`)
      force.impulse(unsourceForceMessage(message))
    },
  },
})

console.log(`[bulk] listening on ${server.url}`)

force.onImpulse = (impulse) => {
  console.log(`[bulk] <- force part=${impulse.parts[0].part}`)
  for (const client of browserClients) sendBrowser(client, impulse)
}
