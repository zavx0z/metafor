import {logImpulse} from "shared/transport/force/log"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {MONAD_RPC_VERSION, type MonadRpcResponse} from "shared/protocol/monad/rpc"
import {
  createHttpMonadChannelRegistry,
  isLoopbackAddress,
  readHttpMonadChannelOpening,
} from "shared/transport/monad"
import {ForceLifecycle} from "./monad.ts"
import {createForceWebSocketChannels, type ForceSocketData} from "./src/websocket.ts"
import {MonadRouter} from "./rpc.ts"
import {readJson} from "./src/http.ts"

const transport = createForceWebSocketChannels()
export const lifecycle = new ForceLifecycle()
export const router = new MonadRouter()
const monadChannels = createHttpMonadChannelRegistry({
  opened(channel) {
    router.attach(channel)
  },
  closed(channel) {
    router.detach(channel)
  },
})
lifecycle.start(transport.channels)

const rpcStatus = (response: MonadRpcResponse): number => {
  if (response.ok) return 200
  if (response.error.code === "provider_unavailable") return 503
  if (response.error.code === "method_unavailable") return 404
  if (response.error.code === "invalid_request") return 400
  return 502
}

export const server = Bun.serve<ForceSocketData>({
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    "/health": {
      GET() {
        const status = lifecycle.status()
        return Response.json(status, {status: status.ok ? 200 : 503})
      },
    },
    "/force": {
      async POST(request: Request) {
        const status = lifecycle.status()
        if (!status.ok) {
          return Response.json({ok: false, error: status.error ?? `Force is not running: ${status.state}`}, {status: 503})
        }
        const payload = await readJson<ForceMessageInput>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const decision = lifecycle.acceptAgentParticle(payload.value)
        return Response.json(decision, {status: decision.ok ? 200 : decision.reason === "not_running" ? 503 : 500})
      },
    },
    "/monad/channels": {
      async POST(request: Request) {
        if (!isLoopbackAddress(server.requestIP(request)?.address)) {
          return Response.json({ok: false, error: "Monad REST channels are local-only"}, {status: 403})
        }
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const opening = readHttpMonadChannelOpening(payload.value)
        if (!opening) return Response.json({ok: false, error: "Invalid Monad channel opening"}, {status: 400})
        const session = await monadChannels.open(opening)
        return Response.json({version: MONAD_RPC_VERSION, channel: session.token}, {status: 201})
      },
    },
    "/monad/rpc": {
      async POST(request: Request) {
        const session = monadChannels.read(request)
        if (!session) return Response.json({ok: false, error: "Monad channel is required"}, {status: 401})
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const response = await monadChannels.receive(session, payload.value)
        return Response.json(response, {status: rpcStatus(response)})
      },
    },
    "/monad/channel": {
      async DELETE(request: Request) {
        const session = monadChannels.read(request)
        if (!session) return Response.json({ok: false, error: "Monad channel is required"}, {status: 401})
        await monadChannels.close(session)
        return Response.json({ok: true})
      },
    },
    "/ws": {
      GET(request: Bun.BunRequest<"/ws">, server: Bun.Server<ForceSocketData>) {
        const identity = transport.readUpgradeIdentity(request)
        if (!identity) return new Response("Force channel identity is required", {status: 400})
        const upgraded = server.upgrade(request, {data: identity})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
  },
  websocket: {
    open(socket) {
      if (transport.opened(socket)) lifecycle.channelReady(socket.data.domain)
      console.log(`[force] connected: ${socket.data.domain} ${socket.data.id}`)
    },
    close(socket) {
      if (transport.closed(socket)) {
        lifecycle.channelDestroyed(socket.data.domain, "WebSocket closed")
      }
      console.log(`[force] disconnected: ${socket.data.domain} ${socket.data.id}`)
    },
    message(socket, raw) {
      try {
        const particle = transport.decode(raw)
        logImpulse(`force:${socket.data.domain}`, "<-", particle)
        lifecycle.acceptParticle(socket.data.domain, particle)
      } catch (error) {
        console.error(`[force] could not decode ${socket.data.domain} Particle`, error)
        socket.close()
      }
    },
  },
})

const stop = async (): Promise<void> => {
  lifecycle.stop()
  await monadChannels.closeAll(new Error("Force server stopped"))
  transport.close()
  server.stop(true)
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

console.log(`[force] listening on ${server.url}`)
