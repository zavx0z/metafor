import {file, type ServerWebSocket} from "bun"
import type {ForceMessage} from "shared/protocol/force/message"
import {unsourceForceMessage} from "shared/protocol/force/message"
import {MonadRpcPeer, MonadTransport} from "shared/transport/monad"
import index from "./index.html"
import {Force} from "shared/transport/force"
import {installForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {BulkObserverHandoffs} from "./handoff.ts"
import {BulkMonad} from "./monad.ts"
import {bulkMonadRoutes} from "./monad-route.ts"

type BrowserClient = {domain: string; id: string; session: string}

const browserClients = new Set<ServerWebSocket<BrowserClient>>()
const handoffs = new BulkObserverHandoffs()
const monad = new BulkMonad()
const transport = new MonadTransport("bulk")
const rpc = new MonadRpcPeer(transport.channel)
const checkpoint = installForceCheckpointSideband("bulk", rpc)
let force: Force | null = null

const sendBrowser = (ws: ServerWebSocket<BrowserClient>, payload: unknown): void => {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(payload))
}

const server = Bun.serve<BrowserClient>({
  port: Number(Bun.env.PORT ?? 4004),
  routes: {
    ...bulkMonadRoutes(transport),
    "/": index,
    "/health": {
      GET() {
        return monad.onHealthRequested()
      },
    },
    "/initial": {
      POST() {
        const session = handoffs.open()
        try {
          return Response.json(monad.openObserver(session))
        } catch (error) {
          handoffs.cancel(session)
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }, {status: 503})
        }
      },
    },
    "/ws": {
      GET(req: Bun.BunRequest<"/ws">, server: Bun.Server<BrowserClient>) {
        const url = new URL(req.url)
        const domain = url.searchParams.get("domain")
        const id = url.searchParams.get("id")
        const session = url.searchParams.get("session")
        if (!domain || !id || !session) return new Response("Bulk observer identity and session are required", {status: 400})
        const upgraded = server.upgrade(req, {data: {domain, id, session}})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/engine-static/JetBrainsMono-Bold.ttf": file(new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url)),
  },
  websocket: {
    open(ws) {
      const pending = handoffs.take(ws.data.session)
      if (pending === null) {
        ws.close(1008, "Bulk observer session is missing or expired")
        return
      }
      for (const message of pending) sendBrowser(ws, message)
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
      force?.impulse(unsourceForceMessage(message))
    },
  },
})

console.log(`[bulk] listening on ${server.url}`)

let closing: Promise<void> | null = null
const close = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    monad.onServerStopping()
    handoffs.clear()
    rpc.close()
    try {
      await transport.close()
    } catch (error) {
      console.error("[bulk] Monad channel close failed", error)
    }
    server.stop()
  })()
  return closing
}

try {
  await transport.open({
    methods: rpc.methods(),
    endpoint: new URL("/monad/channel", server.url),
    waitMs: 30_000,
  })
  await checkpoint.open()
  const summary = await monad.onServerStarted(rpc)
  force = new Force("bulk")
  force.onImpulse = (impulse) => {
    monad.onImpulse(impulse)
    handoffs.buffer(impulse)
    console.log(`[bulk] <- force part=${impulse.parts[0].part}`)
    for (const client of browserClients) sendBrowser(client, impulse)
  }
  let runtimeBorn = false
  force.onConnectionChange = (connected) => {
    if (!connected || runtimeBorn) return
    runtimeBorn = true
    monad.onRuntimeBorn()
    console.log(`[bulk] born atoms=${summary.atoms} root=${summary.rootSrc || "none"}`)
  }
  force.onDestroy = close
} catch (error) {
  monad.onRuntimeBirthFailed(error)
  try {
    await transport.close()
  } catch (closeError) {
    console.error("[bulk] Monad channel close failed", closeError)
  }
  console.error("[bulk] Monad birth failed", error)
}

process.once("SIGINT", close)
process.once("SIGTERM", close)
