import {dirname, join, resolve} from "node:path"
import type {ForceMessageInput} from "shared/protocol/force/message"
import {MONAD_RPC_VERSION, type MonadRpcResponse} from "shared/protocol/monad/rpc"
import {logImpulse} from "shared/transport/force/log"
import {
  installForceCheckpointSideband,
  uninstallForceCheckpointSideband,
} from "shared/transport/force/checkpoint"
import {
  createHttpMonadChannelRegistry,
  isLoopbackAddress,
  MonadRpcPeer,
  readHttpMonadChannelOpening,
} from "shared/transport/monad"
import {startDarkRuntime, stopDarkRuntime} from "./dark.ts"
import {DarkForceHistory} from "./force/history.ts"
import {readJson} from "./force/http.ts"
import {ForceLifecycle} from "./force/lifecycle.ts"
import {LocalDarkForce} from "./force/local.ts"
import type {ForceStore} from "./force/store.ts"
import {createForceWebSocketChannels, type ForceSocketData} from "./force/websocket.ts"
import {DarkMonad} from "./monad.ts"
import {createLocalMonadChannelPair} from "./monad/local.ts"
import {MonadRouter} from "./monad/router.ts"
import {DarkForceTimeController} from "./time-control.ts"
import {
  checkpointControlStatePath,
  DarkCheckpointControl,
} from "./checkpoint/control.ts"

const repositoryState = resolve(import.meta.dir, "..", ".metafor")
const forceHistoryPath = resolve(
  Bun.env.DARK_FORCE_HISTORY_PATH?.trim() || join(repositoryState, "dark-force-history", "v1"),
)
const forceHistoryCutId = Bun.env.DARK_FORCE_HISTORY_CUT_ID?.trim() || undefined
const forceHistoryStartedAt = Bun.env.DARK_FORCE_HISTORY_STARTED_AT?.trim() || undefined
const checkpointEnabled = Bun.env.DARK_CHECKPOINT_SIDEBAND !== "0"
const checkpointStatePath = resolve(
  Bun.env.DARK_CHECKPOINT_CONTROL_PATH?.trim() ||
    (Bun.env.DARK_FORCE_HISTORY_PATH?.trim()
      ? join(dirname(forceHistoryPath), "checkpoint-control", "v1", "state.json")
      : checkpointControlStatePath(repositoryState)),
)

export const forceHistory = new DarkForceHistory(
  forceHistoryPath,
  forceHistoryCutId === undefined
    ? undefined
    : {
        cutId: forceHistoryCutId,
        ...(forceHistoryStartedAt === undefined ? {} : {startedAt: forceHistoryStartedAt}),
      },
)
export const router = new MonadRouter()
const websocket = createForceWebSocketChannels()

const monad = new DarkMonad()
let rpc!: MonadRpcPeer
const localMonad = createLocalMonadChannelPair("dark", () => rpc.methods())
rpc = new MonadRpcPeer(localMonad.peer)
monad.onServerStarted(rpc)
const checkpoint = checkpointEnabled
  ? new DarkCheckpointControl(
      checkpointStatePath,
      forceHistory.status(),
      rpc,
    )
  : null
const darkCheckpoint = checkpointEnabled
  ? installForceCheckpointSideband("dark", rpc)
  : null
router.attach(localMonad.router)
monad.onChannelOpened()
await darkCheckpoint?.open()

export const lifecycle = new ForceLifecycle(forceHistory, checkpoint ?? undefined)
monad.setTimeControl(new DarkForceTimeController(lifecycle, checkpoint))
const localForce = new LocalDarkForce(async (message) => {
  const decision = await lifecycle.acceptParticle("dark", message)
  if (!decision.ok) throw new Error(decision.error)
})
const channels = Object.assign(
  Object.create(null) as ForceStore,
  websocket.channels,
  {dark: localForce.channel},
)
lifecycle.start(channels)

startDarkRuntime(localForce)
localForce.activate()
lifecycle.channelReady("dark")

const monadChannels = createHttpMonadChannelRegistry({
  opened(channel) {
    router.attach(channel)
  },
  closed(channel) {
    router.detach(channel)
  },
})

const rpcStatus = (response: MonadRpcResponse): number => {
  if (response.ok) return 200
  if (response.error.code === "provider_unavailable") return 503
  if (response.error.code === "method_unavailable") return 404
  if (response.error.code === "invalid_request") return 400
  return 502
}

const health = (): Record<string, unknown> => ({
  ...lifecycle.status(),
  owner: "dark",
  dark: monad.health(),
  forceHistory: forceHistory.status(),
})

export const server = Bun.serve<ForceSocketData>({
  development: false,
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    "/health": {
      GET() {
        const status = health()
        return Response.json(status, {status: status.ok === true ? 200 : 503})
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
        const decision = await lifecycle.acceptAgentParticle(payload.value)
        return Response.json(decision, {
          status: decision.ok
            ? 200
            : decision.reason === "not_running"
              ? 503
              : decision.reason === "admission_closed"
                ? 423
                : 500,
        })
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
      GET(request: Bun.BunRequest<"/ws">, current: Bun.Server<ForceSocketData>) {
        const identity = websocket.readUpgradeIdentity(request)
        if (!identity) return new Response("Force channel identity is required", {status: 400})
        const upgraded = current.upgrade(request, {data: identity})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
  },
  websocket: {
    open(socket) {
      if (websocket.opened(socket)) lifecycle.channelReady(socket.data.domain)
      console.log(`[dark:force] connected: ${socket.data.domain} ${socket.data.id}`)
    },
    close(socket) {
      if (websocket.closed(socket)) {
        lifecycle.channelDestroyed(socket.data.domain, "WebSocket closed")
      }
      console.log(`[dark:force] disconnected: ${socket.data.domain} ${socket.data.id}`)
    },
    async message(socket, raw) {
      try {
        const particle = websocket.decode(raw)
        logImpulse(`dark:force:${socket.data.domain}`, "<-", particle)
        await lifecycle.acceptParticle(socket.data.domain, particle)
      } catch (error) {
        console.error(`[dark:force] could not decode ${socket.data.domain} Particle`, error)
        socket.close()
      }
    },
  },
})

const compatibilityPort = Number(Bun.env.DARK_COMPAT_PORT ?? 0)
export const compatibilityServer = Number.isInteger(compatibilityPort) && compatibilityPort > 0 &&
    compatibilityPort !== server.port
  ? Bun.serve({
      development: false,
      port: compatibilityPort,
      routes: {
        "/health": {
          GET() {
            return Response.json({
              ...monad.health(),
              force: lifecycle.status(),
              forceHistory: forceHistory.status(),
            })
          },
        },
      },
    })
  : null

let closing: Promise<void> | null = null
export const stop = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    lifecycle.stop()
    if (darkCheckpoint) uninstallForceCheckpointSideband("dark", darkCheckpoint)
    monad.onServerStopping()
    rpc.close()
    router.detach(localMonad.router)
    await localMonad.peer.close(new Error("Dark server stopped"))
    stopDarkRuntime(localForce)
    localForce.close()
    await monadChannels.closeAll(new Error("Dark server stopped"))
    websocket.close()
    compatibilityServer?.stop(true)
    server.stop(true)
  })()
  return closing
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

console.log(
  `[dark] listening on ${server.url} compatibility=${compatibilityServer?.url ?? "disabled"} ` +
  `forceHistory=${forceHistoryPath}`,
)
