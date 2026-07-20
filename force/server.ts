import {logImpulse} from "shared/transport/force/log"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {createHttpMonadChannel, normalizeMonadIdentity, readHttpProviderRegistration} from "shared/transport/monad"
import {ForceLifecycle} from "./monad.ts"
import {createForceWebSocketChannels, type ForceSocketData} from "./src/websocket.ts"
import {MonadRouter, isMonadRpcCall} from "./rpc.ts"
import {readJson} from "./src/http.ts"

const transport = createForceWebSocketChannels()
export const lifecycle = new ForceLifecycle()
export const router = new MonadRouter()
lifecycle.start(transport.channels)

const readMonadIdentity = (value: string): string | null => {
  try {
    return normalizeMonadIdentity(value)
  } catch {
    return null
  }
}

const rpcStatus = (response: Awaited<ReturnType<MonadRouter["route"]>>): number => {
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
    "/monad/providers/:identity": {
      async POST(request: Bun.BunRequest<"/monad/providers/:identity">) {
        const identity = readMonadIdentity(request.params.identity)
        if (!identity) return Response.json({ok: false, error: "Monad channel identity is required"}, {status: 400})
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const registration = readHttpProviderRegistration(payload.value)
        if (!registration) return Response.json({ok: false, error: "Invalid HTTP Monad RPC provider"}, {status: 400})
        router.register(createHttpMonadChannel(identity, registration.endpoint), registration.methods)
        return Response.json({ok: true, identity, methods: registration.methods})
      },
    },
    "/monad/rpc/:source": {
      async POST(request: Bun.BunRequest<"/monad/rpc/:source">) {
        const source = request.params.source
        const identity = readMonadIdentity(source)
        if (!identity) return Response.json({ok: false, error: "Monad channel identity is required"}, {status: 400})
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        if (!isMonadRpcCall(payload.value)) {
          return Response.json({ok: false, error: "Invalid Monad RPC call"}, {status: 400})
        }
        const response = await router.route(identity, payload.value)
        return Response.json(response, {status: rpcStatus(response)})
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
        lifecycle.channelDestroyed(socket.data.domain, error)
        socket.close()
      }
    },
  },
})

const stop = (): void => {
  lifecycle.stop()
  transport.close()
  server.stop(true)
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

console.log(`[force] listening on ${server.url}`)
