import {logImpulse} from "./src/log.ts"
import {ForceMonad} from "./monad.ts"
import {createForceWebSocketChannels, type ForceSocketData} from "./src/websocket.ts"

const transport = createForceWebSocketChannels()
export const monad = new ForceMonad()
monad.onServerStarted(transport.channels)

export const server = Bun.serve<ForceSocketData>({
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    "/health": {
      GET() {
        return monad.onHealthRequested()
      },
    },
    "/force": {
      POST(request: Request) {
        return monad.onAgentParticleReceived(request)
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
      if (transport.opened(socket)) monad.onDomainChannelReady(socket.data.domain)
      console.log(`[force] connected: ${socket.data.domain} ${socket.data.id}`)
    },
    close(socket) {
      if (transport.closed(socket)) {
        monad.onDomainChannelDestroyed(socket.data.domain, "WebSocket closed")
      }
      console.log(`[force] disconnected: ${socket.data.domain} ${socket.data.id}`)
    },
    message(socket, raw) {
      try {
        const particle = transport.decode(raw)
        logImpulse(`force:${socket.data.domain}`, "<-", particle)
        monad.onDomainParticleReceived(socket.data.domain, particle)
      } catch (error) {
        monad.onDomainChannelDestroyed(socket.data.domain, error)
        socket.close()
      }
    },
  },
})

const stop = (): void => {
  monad.onServerStopping()
  transport.close()
  server.stop(true)
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

console.log(`[force] listening on ${server.url}`)
