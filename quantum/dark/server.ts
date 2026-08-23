import {file, type ServerWebSocket} from "bun"
import {dirname, join, resolve} from "node:path"
import {
  BULK_BROWSER_INITIAL_METHOD,
  BULK_BROWSER_MESSAGE_METHOD,
  DARK_BULK_BROWSER_BROADCAST_METHOD,
  DARK_BULK_VIEWPORT_CAPTURE_METHOD,
  readDarkBulkViewportCaptureRequest,
  type BulkBrowserInitialRequest,
  type BulkBrowserMessageRequest,
} from "@metafor/types/bulk/browser"
import type {BulkStoreInitial} from "@metafor/types/bulk/store"
import {isBulkStoreApplyControl} from "bulk/store-initial.ts"
import index from "bulk/index.html"
import {
  BULK_VIEWPORT_CAPTURE_MAX_CONTROL_BYTES,
} from "bulk/capture.ts"
import {
  BulkBrowserGateway,
  type BulkBrowserGatewayClient,
} from "bulk/browser-gateway.ts"
import {
  BULK_PAGE_SHELL_ROUTE,
  serveBulkInitialStore,
  serveBulkPageShell,
} from "bulk/page-bootstrap.ts"
import {isBulkStoreInitial} from "bulk/store"
import {
  BULK_TIME_PAUSE_METHOD,
  BULK_TIME_RESUME_METHOD,
  BULK_TIME_STACK_METHOD,
  bulkTimeControlResponse,
} from "bulk/time-control.ts"
import {sourceForceMessage, type ForceMessageInput} from "shared/protocol/force/message"
import {
  DARK_FORCE_STATUS_READ_METHOD,
  DOMAIN_HEALTH_READ_METHOD,
  type DarkForceStatus,
  type DomainHealth,
} from "shared/protocol/oracle/health"
import {ORACLE_RPC_VERSION, type OracleRpcResponse} from "shared/protocol/oracle/rpc"
import {logImpulse} from "shared/transport/force/log"
import {
  installForceCheckpointSideband,
  uninstallForceCheckpointSideband,
} from "shared/transport/force/checkpoint"
import {
  createHttpOracleChannelRegistry,
  createOracleWebSocketChannelRegistry,
  isLoopbackAddress,
  ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES,
  OracleRpcPeer,
  type OracleWebSocketData,
  readOracleWebSocketData,
  readHttpOracleChannelOpening,
} from "shared/transport/oracle"
import {
  applyAuthoredDeclarationProjection,
  applyAuthoredMatterProjection,
  reconcileAuthoredMatterProjection,
  startDarkRuntime,
  stopDarkRuntime,
} from "./dark.ts"
import {DarkForceHistory} from "./force/history.ts"
import {readJson} from "./force/http.ts"
import {ForceLifecycle} from "./force/lifecycle.ts"
import {LocalDarkForce} from "./force/local.ts"
import type {ForceStore} from "./force/store.ts"
import {
  createForceWebSocketChannels,
  type ForceSocket,
  type ForceSocketData,
} from "./force/websocket.ts"
import {DarkOracle} from "./oracle.ts"
import {MetaCreateService} from "./oracle/create.ts"
import {createLocalOracleChannelPair} from "./oracle/local.ts"
import {MatterAuthoringService} from "./oracle/matter.ts"
import {DeclarationAuthoringService} from "./oracle/declaration.ts"
import {DarkForceHistoryReadService} from "./oracle/history.ts"
import {MetaRuntimeRpcService} from "./oracle/runtime.ts"
import {
  MetaAuthoringRegistry,
  metaAuthoringCapabilitiesForScopes,
  readMetaAuthoringLocalConfiguration,
} from "./oracle/registry.ts"
import {OracleRouter} from "./oracle/router.ts"
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
const authoringConfiguration = readMetaAuthoringLocalConfiguration(Bun.env)
if (authoringConfiguration && !checkpointEnabled) {
  throw new Error("Configured Meta authoring requires the checkpoint applied-through plane")
}
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
export const router = new OracleRouter()
const websocket = createForceWebSocketChannels()

const oracle = new DarkOracle()
let rpc!: OracleRpcPeer
const localOracle = createLocalOracleChannelPair("dark", () => rpc.methods())
rpc = new OracleRpcPeer(localOracle.peer)
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

export const lifecycle = new ForceLifecycle(forceHistory, checkpoint ?? undefined)
const authoringRegistry = new MetaAuthoringRegistry(authoringConfiguration
  ? [[
      authoringConfiguration.source,
      metaAuthoringCapabilitiesForScopes(
        authoringConfiguration.scopes,
        authoringConfiguration.createScopes,
      ),
    ]]
  : [])
oracle.setTimeControl(new DarkForceTimeController(lifecycle, checkpoint))
oracle.setHistory(new DarkForceHistoryReadService(forceHistory))
oracle.setRuntime(new MetaRuntimeRpcService(forceHistory, lifecycle, rpc))
oracle.setAuthoring({
  registry: authoringRegistry,
  create: new MetaCreateService((source) => authoringRegistry.grants(source)),
  matter: new MatterAuthoringService(
    forceHistory,
    lifecycle,
    (source) => authoringRegistry.grants(source),
    undefined,
    undefined,
    {
      apply: applyAuthoredMatterProjection,
      async reconcile(root) {
        await reconcileAuthoredMatterProjection(root, async (input) => {
          const decision = await lifecycle.acceptParticle("dark", sourceForceMessage(input, "dark"))
          if (!decision.ok) throw new Error(decision.error)
        })
      },
    },
  ),
  declaration: new DeclarationAuthoringService(
    forceHistory,
    lifecycle,
    (source) => authoringRegistry.grants(source),
    undefined,
    undefined,
    {apply: applyAuthoredDeclarationProjection},
  ),
})
const bulkBrowser = new BulkBrowserGateway()
oracle.onServerStarted(rpc)
rpc.expose(DARK_FORCE_STATUS_READ_METHOD, (): DarkForceStatus => {
  const status = lifecycle.status()
  return {
    state: status.state,
    connectedDomains: status.connectedDomains,
    error: status.error,
  }
})
rpc.expose(DARK_BULK_BROWSER_BROADCAST_METHOD, (params, context) => {
  if (context.source !== "bulk") {
    throw new Error("Bulk browser broadcast is accepted only from Bulk")
  }
  if (!isBulkStoreApplyControl(params)) {
    throw new Error("Bulk browser update is invalid")
  }
  bulkBrowser.broadcast(params)
  return {ok: true}
})
rpc.expose(DARK_BULK_VIEWPORT_CAPTURE_METHOD, async (params, context) => {
  if (context.source !== "bulk") {
    throw new Error("Bulk viewport capture relay is accepted only from Bulk")
  }
  const request = readDarkBulkViewportCaptureRequest(params)
  if (request === null) throw new Error("Bulk viewport capture relay is invalid")
  return await bulkBrowser.capture(request.params, request.source)
})
router.attach(localOracle.router)
oracle.onChannelOpened()
await darkCheckpoint?.open()

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

const oracleChannels = createHttpOracleChannelRegistry({
  opened(channel) {
    router.attach(channel)
  },
  closed(channel) {
    router.detach(channel)
  },
})
const domainOracleChannels = createOracleWebSocketChannelRegistry({
  opened(channel) {
    router.attach(channel)
  },
  closed(channel) {
    router.detach(channel)
  },
})

const rpcStatus = (response: OracleRpcResponse): number => {
  if (response.ok) return 200
  if (response.error.code === "provider_unavailable") return 503
  if (response.error.code === "method_unavailable") return 404
  if (response.error.code === "invalid_request") return 400
  return 502
}

const remoteDomains = ["boundary", "matrix", "energy", "bulk"] as const

const readDomainHealth = async (
  domain: typeof remoteDomains[number],
): Promise<DomainHealth | null> => {
  try {
    return await rpc.call<DomainHealth>(domain, DOMAIN_HEALTH_READ_METHOD, {})
  } catch {
    return null
  }
}

const health = async (): Promise<Record<string, unknown>> => {
  const force = lifecycle.status()
  const entries = await Promise.all(remoteDomains.map(async (domain) =>
    [domain, await readDomainHealth(domain)] as const))
  const domains = Object.fromEntries(entries)
  const domainHealthy = force.state !== "running" ||
    entries.every(([, status]) => status?.ok === true)
  return {
    ...force,
    ok: force.ok && domainHealthy,
    owner: "dark",
    dark: oracle.health(),
    domains,
    forceHistory: forceHistory.status(),
  }
}

type DarkForceSocketData = ForceSocketData & {kind: "force"}
type BulkBrowserSocketData = {
  kind: "bulk-browser"
  domain: "bulk"
  id: string
  session: string
}
type DarkSocketData =
  | DarkForceSocketData
  | OracleWebSocketData
  | BulkBrowserSocketData
type DarkSocket = ServerWebSocket<DarkSocketData>

const browserClients = new WeakMap<DarkSocket, BulkBrowserGatewayClient>()
let browserPageShell: Promise<string> | null = null

const sendBrowser = (socket: DarkSocket, payload: unknown): boolean => {
  if (socket.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(payload))
  return true
}

const readBulkBrowserData = (request: Request): BulkBrowserSocketData | null => {
  const url = new URL(request.url)
  const domain = url.searchParams.get("domain")
  const id = url.searchParams.get("id")
  const session = url.searchParams.get("session")
  if (
    domain !== "bulk" ||
    !id ||
    id.length > 256 ||
    !session ||
    session.length > 256
  ) return null
  return {kind: "bulk-browser", domain, id, session}
}

const readBrowserPageShell = (
  current: Bun.Server<DarkSocketData>,
): Promise<string> => {
  if (browserPageShell !== null) return browserPageShell
  browserPageShell = fetch(new URL(BULK_PAGE_SHELL_ROUTE, current.url))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Bulk page shell failed: ${response.status}`)
      return await response.text()
    })
    .catch((error) => {
      browserPageShell = null
      throw error
    })
  return browserPageShell
}

const forceSocket = (socket: DarkSocket): ForceSocket =>
  socket as unknown as ForceSocket

const oracleSocket = (
  socket: DarkSocket,
): ServerWebSocket<OracleWebSocketData> =>
  socket as unknown as ServerWebSocket<OracleWebSocketData>

export const server = Bun.serve<DarkSocketData>({
  development: false,
  hostname: Bun.env.DARK_HOSTNAME?.trim() || "127.0.0.1",
  port: Number(Bun.env.PORT ?? 4000),
  routes: {
    [BULK_PAGE_SHELL_ROUTE]: index,
    "/": {
      GET(
        _request: Bun.BunRequest<"/">,
        current: Bun.Server<DarkSocketData>,
      ) {
        return serveBulkPageShell({
          readShell: async () => await readBrowserPageShell(current),
        })
      },
    },
    "/initial": {
      GET() {
        return serveBulkInitialStore({
          openSession: () => bulkBrowser.openSession(),
          cancelSession: (session) => bulkBrowser.cancelSession(session),
          prepareInitial: async (session) => {
            const initial = await rpc.call<BulkStoreInitial>(
              "bulk",
              BULK_BROWSER_INITIAL_METHOD,
              {session} satisfies BulkBrowserInitialRequest,
              {waitMs: 30_000},
            )
            if (!isBulkStoreInitial(initial)) {
              throw new Error("Bulk returned an invalid initial Store")
            }
            return initial
          },
        })
      },
    },
    "/health": {
      async GET() {
        const status = await health()
        return Response.json(status, {status: status.ok === true ? 200 : 503})
      },
    },
    "/time/stack": {
      GET() {
        return bulkTimeControlResponse(rpc, BULK_TIME_STACK_METHOD)
      },
    },
    "/time/pause": {
      POST() {
        return bulkTimeControlResponse(rpc, BULK_TIME_PAUSE_METHOD)
      },
    },
    "/time/resume": {
      POST() {
        return bulkTimeControlResponse(rpc, BULK_TIME_RESUME_METHOD)
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
    "/oracle/channels": {
      async POST(request: Request) {
        if (!isLoopbackAddress(server.requestIP(request)?.address)) {
          return Response.json({ok: false, error: "Oracle REST channels are local-only"}, {status: 403})
        }
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const opening = readHttpOracleChannelOpening(payload.value)
        if (!opening) return Response.json({ok: false, error: "Invalid Oracle channel opening"}, {status: 400})
        const session = await oracleChannels.open(opening)
        return Response.json({version: ORACLE_RPC_VERSION, channel: session.token}, {status: 201})
      },
    },
    "/oracle/rpc": {
      async POST(request: Request) {
        const session = oracleChannels.read(request)
        if (!session) return Response.json({ok: false, error: "Oracle channel is required"}, {status: 401})
        const payload = await readJson<unknown>(request)
        if (!payload.ok) return Response.json({ok: false, error: payload.error}, {status: 400})
        const response = await oracleChannels.receive(session, payload.value)
        return Response.json(response, {status: rpcStatus(response)})
      },
    },
    "/oracle/channel": {
      async DELETE(request: Request) {
        const session = oracleChannels.read(request)
        if (!session) return Response.json({ok: false, error: "Oracle channel is required"}, {status: 401})
        await oracleChannels.close(session)
        return Response.json({ok: true})
      },
    },
    "/oracle/ws": {
      GET(
        request: Bun.BunRequest<"/oracle/ws">,
        current: Bun.Server<DarkSocketData>,
      ) {
        if (!isLoopbackAddress(current.requestIP(request)?.address)) {
          return new Response("Domain Oracle WebSocket is local-only", {status: 403})
        }
        const data = readOracleWebSocketData(request)
        if (!data) return new Response("Oracle channel identity is required", {status: 400})
        const upgraded = current.upgrade(request, {data})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/ws": {
      GET(request: Bun.BunRequest<"/ws">, current: Bun.Server<DarkSocketData>) {
        const browser = readBulkBrowserData(request)
        if (browser) {
          const upgraded = current.upgrade(request, {data: browser})
          return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
        }
        if (!isLoopbackAddress(current.requestIP(request)?.address)) {
          return new Response("Domain Force WebSocket is local-only", {status: 403})
        }
        const identity = websocket.readUpgradeIdentity(request)
        if (!identity) return new Response("Force channel identity is required", {status: 400})
        const upgraded = current.upgrade(request, {
          data: {kind: "force", ...identity} satisfies DarkForceSocketData,
        })
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/engine-static/JetBrainsMono-Bold.ttf": file(
      new URL("../pkg/engine/static/JetBrainsMono-Bold.ttf", import.meta.url),
    ),
  },
  websocket: {
    maxPayloadLength: Math.max(
      BULK_VIEWPORT_CAPTURE_MAX_CONTROL_BYTES,
      ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES,
    ),
    backpressureLimit: ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES * 2,
    closeOnBackpressureLimit: true,
    open(socket) {
      if (socket.data.kind === "force") {
        if (websocket.opened(forceSocket(socket))) {
          lifecycle.channelReady(socket.data.domain)
        }
        console.log(`[dark:force] connected: ${socket.data.domain} ${socket.data.id}`)
        return
      }
      if (socket.data.kind === "oracle") {
        console.log(`[dark:oracle] transport connected: ${socket.data.identity} ${socket.data.id}`)
        return
      }
      const client: BulkBrowserGatewayClient = {
        domain: socket.data.domain,
        id: socket.data.id,
        send: (message) => sendBrowser(socket, message),
      }
      browserClients.set(socket, client)
      if (!bulkBrowser.connect(client, socket.data.session)) {
        socket.close(1008, "Bulk observer session is missing or expired")
        return
      }
      console.log(`[dark:bulk] browser connected ${socket.data.id}`)
    },
    async close(socket) {
      if (socket.data.kind === "force") {
        if (websocket.closed(forceSocket(socket))) {
          lifecycle.channelDestroyed(socket.data.domain, "WebSocket closed")
        }
        console.log(`[dark:force] disconnected: ${socket.data.domain} ${socket.data.id}`)
        return
      }
      if (socket.data.kind === "oracle") {
        await domainOracleChannels.closed(
          oracleSocket(socket),
          new Error("Oracle WebSocket closed"),
        )
        console.log(`[dark:oracle] disconnected: ${socket.data.identity} ${socket.data.id}`)
        return
      }
      const client = browserClients.get(socket)
      if (client) bulkBrowser.disconnect(client)
      browserClients.delete(socket)
      console.log(`[dark:bulk] browser disconnected ${socket.data.id}`)
    },
    async message(socket, raw) {
      if (socket.data.kind === "oracle") {
        try {
          await domainOracleChannels.receive(oracleSocket(socket), raw)
        } catch (error) {
          console.error(`[dark:oracle] invalid message from ${socket.data.identity}`, error)
          socket.close(1003, "Invalid Oracle message")
        }
        return
      }
      if (socket.data.kind === "bulk-browser") {
        let value: unknown
        try {
          value = JSON.parse(String(raw)) as unknown
        } catch {
          socket.close(1003, "Bulk browser payload is invalid")
          return
        }
        const client = browserClients.get(socket)
        if (!client) {
          socket.close(1008, "Bulk browser is not connected")
          return
        }
        if (bulkBrowser.receiveControl(client, value)) return
        try {
          const routed = await rpc.call<string>(
            "bulk",
            BULK_BROWSER_MESSAGE_METHOD,
            {message: value} satisfies BulkBrowserMessageRequest,
          )
          if (routed !== "force") {
            socket.close(1003, "Bulk browser payload is invalid")
          }
        } catch (error) {
          console.error("[dark:bulk] browser relay failed", error)
          socket.close(1011, "Bulk browser relay failed")
        }
        return
      }
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

let closing: Promise<void> | null = null
export const stop = (): Promise<void> => {
  if (closing) return closing
  closing = (async () => {
    lifecycle.stop()
    if (darkCheckpoint) uninstallForceCheckpointSideband("dark", darkCheckpoint)
    oracle.onServerStopping()
    rpc.close()
    router.detach(localOracle.router)
    await localOracle.peer.close(new Error("Dark server stopped"))
    stopDarkRuntime(localForce)
    localForce.close()
    await oracleChannels.closeAll(new Error("Dark server stopped"))
    await domainOracleChannels.closeAll(new Error("Dark server stopped"))
    bulkBrowser.close()
    websocket.close()
    server.stop(true)
  })()
  return closing
}

process.once("SIGINT", stop)
process.once("SIGTERM", stop)

console.log(
  `[dark] listening on ${server.url} forceHistory=${forceHistoryPath}`,
)
