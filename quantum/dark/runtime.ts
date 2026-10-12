import {join, resolve} from "node:path"
import {BOUNDARY_INITIAL_PROJECTION_METHOD, BOUNDARY_INITIAL_STATE_METHOD, type BoundaryInitialProjection, type BoundaryInitialState} from "shared/protocol/boundary/initial"
import {BOUNDARY_FIELD_VALUE_PLAN_METHOD, BOUNDARY_GRAPH_PROJECTION_METHOD, type BoundaryGraphProjection} from "shared/protocol/boundary/runtime"
import {META_FIELD_VALUE_APPLY_METHOD, META_OBSERVATION_CONTRACT_VERSION, validateMetaFieldValueApplyRequest, type MetaFieldValueApplyReceipt, type MetaFieldValueApplyRequest, type MetaRuntimeFieldValue} from "shared/protocol/metafor/observation"
import type {Particle} from "shared/protocol/force/particle"
import type {ServerWebSocket} from "bun"
import {sourceForceMessage, type ForceMessageInput} from "shared/protocol/force/message"
import {DARK_FORCE_STATUS_READ_METHOD, DOMAIN_HEALTH_READ_METHOD, type DarkForceStatus, type DomainHealth} from "shared/protocol/oracle/health"
import {ORACLE_RPC_VERSION, type OracleRpcResponse} from "shared/protocol/oracle/rpc"
import {installForceCheckpointSideband, uninstallForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {createHttpOracleChannelRegistry, createOracleWebSocketChannelRegistry, isLoopbackAddress, ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES, OracleRpcPeer, readOracleWebSocketData, readHttpOracleChannelOpening, type OracleWebSocketData} from "shared/transport/oracle"
import {applyAuthoredDeclarationProjection, applyAuthoredMatterProjection, reconcileAuthoredMatterProjection, matterParticles, startDarkRuntime, stopDarkRuntime} from "./dark.ts"
import {DarkForceHistory} from "./force/history.ts"
import {readJson} from "./force/http.ts"
import {ForceLifecycle} from "./force/lifecycle.ts"
import {LocalDarkForce} from "./force/local.ts"
import {forceParticipants, type ForceDomain, type ForceStore} from "./force/store.ts"
import {createForceWebSocketChannels, type ForceSocket, type ForceSocketData} from "./force/websocket.ts"
import {DarkOracle} from "./oracle.ts"
import {MetaCreateService} from "./oracle/create.ts"
import {createLocalOracleChannelPair} from "./oracle/local.ts"
import {MatterAuthoringService} from "./oracle/matter.ts"
import {DeclarationAuthoringService} from "./oracle/declaration.ts"
import {DarkForceHistoryReadService} from "./oracle/history.ts"
import {MetaRuntimeRpcService} from "./oracle/runtime.ts"
import {MetaAuthoringRegistry, metaAuthoringCapabilitiesForScopes, readMetaAuthoringLocalConfiguration} from "./oracle/registry.ts"
import {OracleRouter} from "./oracle/router.ts"
import {DarkForceTimeController} from "./time-control.ts"
import {DarkCheckpointControl} from "./checkpoint/control.ts"
import type {MetaLoader} from "./graph/declaration.ts"
import {normalizeMetaLifecycle, type MetaLifecycle} from "@metafor/types/metafor/lifecycle"
import type {PeerNetwork} from "@metafor/tech-peer"
import type {OracleChannel} from "shared/transport/oracle"
import {createDomainPeerChannels} from "./force/peer"
import type {RemoteForceDomain} from "./force/store"

/** Dark владеет причинными handlers; release предоставляет единственный listener. */
import type {DarkRuntimeSocketData} from "./types/runtime"
export type {DarkRuntimeSocketData} from "./types/runtime"

/** Release задаёт состав и хранилище независимо от физического расположения artifact. */
export interface DarkRuntimeOptions {
  /** History and checkpoint control stay under this instance root, ignoring inherited path overrides. */
  stateRoot: string
  domains?: readonly ForceDomain[]
  cutId?: string
  checkpoint?: boolean
  /** Explicit fixture adapter only when the saved Meta declares no lifecycle input. */
  lifecycle?: RootMetaLifecycleBindings
  /** Caller-owned domain network; legacy domain payload admission is disabled when supplied. */
  peer?: {network: PeerNetwork, identities: ReadonlyMap<string, RemoteForceDomain>}
  /** Explicit in-process composition; admission of external clients belongs to their owning capability. */
  localOracleChannels?: readonly OracleChannel[]
}

/** Native lifecycle events supply an ordinary root Field value; Meta owns the resulting Process policy. */
export type RootMetaLifecycleBindings = MetaLifecycle

/** Trusted nonsecret scalar input for declared ordinary Fields; lifecycle Fields are excluded at runtime. */
export type InitialRootFields = Readonly<Record<string, MetaRuntimeFieldValue>>
/** Loaded only after this incarnation initializes an empty world; restored worlds never invoke the loader. */
export type InitialRootFieldsInput = InitialRootFields | (() => InitialRootFields | Promise<InitialRootFields>)

export interface DarkRuntimeServer {
  requestIP(request: Request): {address: string} | null
  upgrade(request: Request, options: {data: DarkRuntimeSocketData}): boolean
}

/** Lazily selected root; restored Boundary state never invokes its source loader. */
export interface DarkRuntimeRoot {
  source: string
  readMeta?: MetaLoader
}

let active = false

/**
Создаёт одно воплощение Dark без собственного listener по [законам Force](../../docs/FORCE.md).
Oracle, history и checkpoint сохраняют доменное владение. Release подключает
handlers, рождает выбранные домены и передаёт явные Meta roots. Закрытие
освобождает только принадлежащие этому воплощению handlers и channels.
Default состав исключает архивную Bulk projection. Проверка размещения на
listener caller и допуска доменов — [runtime.spec.ts](runtime.spec.ts).
*/
export async function createDarkRuntime(options: DarkRuntimeOptions) {
  if (active) throw new Error("A Dark runtime is already active in this process")
  const participants = forceParticipants(options.domains ?? ["dark", "boundary", "matrix", "energy"])
  const repositoryState = resolve(options.stateRoot)
  const forceHistoryPath = join(repositoryState, "dark-force-history", "v1")
  const forceHistoryCutId = options.cutId
  const checkpointEnabled = options.checkpoint ?? Bun.env.DARK_CHECKPOINT_SIDEBAND !== "0"
  const authoringConfiguration = readMetaAuthoringLocalConfiguration(Bun.env)
  if (authoringConfiguration && !checkpointEnabled) throw new Error("Configured Meta authoring requires the checkpoint applied-through plane")
  const checkpointStatePath = join(repositoryState, "checkpoint-control", "v1", "state.json")
  const forceHistory = new DarkForceHistory(
    forceHistoryPath,
    forceHistoryCutId === undefined
      ? undefined
      : {
          cutId: forceHistoryCutId,
        },
  )
  const router = new OracleRouter()
  const websocket = options.peer ? undefined : createForceWebSocketChannels(participants)

  const oracle = new DarkOracle()
  let rpc!: OracleRpcPeer
  const localOracle = createLocalOracleChannelPair("dark", () => rpc.methods())
  rpc = new OracleRpcPeer(localOracle.peer)
  const checkpoint = checkpointEnabled
    ? new DarkCheckpointControl(
        checkpointStatePath,
        forceHistory.status(),
        rpc,
        participants,
      )
    : null
  const darkCheckpoint = checkpointEnabled
    ? installForceCheckpointSideband("dark", rpc)
    : null

  const lifecycle = new ForceLifecycle(forceHistory, checkpoint ?? undefined, participants)
  const peerChannels = options.peer ? createDomainPeerChannels({...options.peer, router, lifecycle}) : undefined
  const authoringRegistry = new MetaAuthoringRegistry(authoringConfiguration
    ? [[
        authoringConfiguration.source,
        metaAuthoringCapabilitiesForScopes(
          authoringConfiguration.scopes,
          authoringConfiguration.createScopes,
        ),
      ]]
    : [])
  const timeControl = new DarkForceTimeController(lifecycle, checkpoint)
  oracle.setTimeControl(timeControl)
  oracle.setHistory(new DarkForceHistoryReadService(forceHistory))
  const runtimeInputs = new MetaRuntimeRpcService(forceHistory, lifecycle, rpc)
  oracle.setRuntime(runtimeInputs)
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
  oracle.onServerStarted(rpc)
  rpc.expose(DARK_FORCE_STATUS_READ_METHOD, (): DarkForceStatus => {
    const status = lifecycle.status()
    return {state: status.state, connectedDomains: status.connectedDomains, error: status.error}
  })
  router.attach(localOracle.router)
  for (const channel of options.localOracleChannels ?? []) router.attach(channel)
  oracle.onChannelOpened()
  active = true
  try {await darkCheckpoint?.open()}
  catch (error) {
    active = false
    if (darkCheckpoint) uninstallForceCheckpointSideband("dark", darkCheckpoint)
    rpc.close()
    router.detach(localOracle.router)
    await localOracle.peer.close(new Error("Dark runtime preparation failed"))
    throw error
  }

  const localForce = new LocalDarkForce(async (message) => {
    const decision = await lifecycle.acceptParticle("dark", message)
    if (!decision.ok) throw new Error(decision.error)
  })
  const channels = Object.assign(
    Object.create(null) as Partial<ForceStore>,
    peerChannels?.channels ?? websocket!.channels,
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

  const remoteDomains = participants.filter(domain => domain !== "dark")
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
      ...(options.peer ? {transport: options.peer.network.snapshot()} : {}),
    }
  }


  const routes: Record<string, Record<string, (request: Request, current: DarkRuntimeServer) => Response | undefined | Promise<Response | undefined>>> = {
    "/health": {GET: async () => {const state = await health(); return Response.json(state, {status: state.ok === true ? 200 : 503})}},
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
      async POST(request: Request, current: DarkRuntimeServer) {
        if (!isLoopbackAddress(current.requestIP(request)?.address)) {
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
        request: Request,
        current: DarkRuntimeServer,
      ) {
        if (!isLoopbackAddress(current.requestIP(request)?.address)) {
          return new Response("Domain Oracle WebSocket is local-only", {status: 403})
        }
        const data = readOracleWebSocketData(request)
        if (!data) return new Response("Oracle channel identity is required", {status: 400})
        if (!participants.includes(data.identity as ForceDomain) || data.identity === "dark") return new Response("Oracle domain does not participate", {status: 403})
        const upgraded = current.upgrade(request, {data})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
    "/ws": {
      GET(request: Request, current: DarkRuntimeServer) {
        if (!isLoopbackAddress(current.requestIP(request)?.address)) {
          return new Response("Domain Force WebSocket is local-only", {status: 403})
        }
        const identity = websocket!.readUpgradeIdentity(request)
        if (!identity) return new Response("Force channel identity is required", {status: 400})
        const upgraded = current.upgrade(request, {
          data: {kind: "force", ...identity} satisfies ForceSocketData & {kind: "force"},
        })
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
    },
  }
  const owns = (data: unknown): data is DarkRuntimeSocketData => typeof data === "object" && data !== null && "kind" in data && (data.kind === "force" || data.kind === "oracle")
  const forceSocket = (socket: ServerWebSocket<DarkRuntimeSocketData>) => socket as unknown as ForceSocket
  const oracleSocket = (socket: ServerWebSocket<DarkRuntimeSocketData>) => socket as ServerWebSocket<OracleWebSocketData>
  const websocketHandlers = {
    maxPayloadLength: ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES,
    backpressureLimit: ORACLE_WEBSOCKET_MAX_MESSAGE_BYTES * 2,
    closeOnBackpressureLimit: true,
    open(socket: ServerWebSocket<DarkRuntimeSocketData>) {
      if (socket.data.kind === "force" && websocket?.opened(forceSocket(socket))) lifecycle.channelReady(socket.data.domain)
    },
    async close(socket: ServerWebSocket<DarkRuntimeSocketData>) {
      if (socket.data.kind === "force") {
        if (websocket?.closed(forceSocket(socket))) lifecycle.channelDestroyed(socket.data.domain, "WebSocket closed")
      } else await domainOracleChannels.closed(oracleSocket(socket), new Error("Oracle WebSocket closed"))
    },
    async message(socket: ServerWebSocket<DarkRuntimeSocketData>, raw: string | Buffer) {
      try {
        if (socket.data.kind === "oracle") await domainOracleChannels.receive(oracleSocket(socket), raw)
        else if (websocket) await lifecycle.acceptParticle(socket.data.domain, websocket.decode(raw))
      } catch {
        socket.close(1003, "Invalid domain message")
      }
    },
  }
  let closing: Promise<void> | undefined
  let freshRoot: {source: string; sequence: number; applying: boolean} | undefined
  let lease: {entered: ReturnType<typeof Promise.withResolvers<void>>, release: ReturnType<typeof Promise.withResolvers<void>>, finished: Promise<void>} | undefined
  /** Заимствует имеющуюся user pause либо удерживает собственную точную причинную границу. */
  const quiesce = (): Promise<void> => {
    if (closing) return Promise.reject(new Error("Dark runtime is closing"))
    if (lease) return lease.entered.promise
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const finished = oracle.withClosedMutationAdmission(async () => await timeControl.readAtExactFrontier(async () => {
      entered.resolve()
      await release.promise
    }))
    const current = {entered, release, finished}
    lease = current
    void finished.then(() => {
      if (lease === current) lease = undefined
    }, error => {
      entered.reject(error)
      if (lease === current) lease = undefined
    })
    return entered.promise
  }
  const resume = async (): Promise<void> => {
    const current = lease
    if (!current) return
    current.release.resolve()
    await current.finished
  }
  const readWorld = async () => {
    const [state, projection] = await Promise.all([
      rpc.call<BoundaryInitialState>("boundary", BOUNDARY_INITIAL_STATE_METHOD, {}),
      rpc.call<BoundaryInitialProjection>("boundary", BOUNDARY_INITIAL_PROJECTION_METHOD, {}),
    ])
    if (state.version !== 3 || projection.version !== 1 || !Array.isArray(projection.entries) ||
        ![state.atoms, state.declarations, state.pendingProcessExecutions, state.reactionRelations, state.unfinishedReactionExecutions].every(Array.isArray)) {
      throw new Error("Boundary returned an invalid initialization projection")
    }
    return {state, projection}
  }
  const preflight = async (sources: readonly string[], readMeta?: MetaLoader) => {
    const particles: Particle[] = []
    for (const source of sources) for await (const particle of matterParticles(source, readMeta)) particles.push(particle)
    return particles
  }
  const accept = async (particles: readonly Particle[]) => {
    for (const particle of particles) {
      const {by: _by, ...input} = particle
      const decision = await lifecycle.acceptParticle("dark", sourceForceMessage({parts: [input]}, "dark"))
      if (!decision.ok) throw new Error(decision.error)
    }
  }
  return {
    owns,
    websocket: websocketHandlers,
    health,
    status: () => lifecycle.status(),
    quiesce,
    resume,
    /**
    Consumes trusted initial data once after this incarnation's successful fresh
    root import and before any native lifecycle input. Every entry is validated
    by Boundary's existing ordinary Field plan before the first canonical apply.
    Lifecycle-bound Fields are forbidden. The existing Field apply service runs
    under our owned Oracle admission gate; no nested RPC gate or raw DB write.
    Each accepted value drains at its exact causal frontier. This is not an
    atomic batch: failures after acceptance may leave a valid prefix and are
    never retried. The caller must prove complete preparation before shipping.
    [Root input law](../../docs/DARK.md), [compiled proof](../../cosmos/release/spec/quantum.spec.ts).
    */
    async applyInitialRootFields(input: InitialRootFieldsInput): Promise<readonly MetaFieldValueApplyReceipt[]> {
      const initialized = freshRoot
      if (!initialized || initialized.applying || !lifecycle.status().ok)
        throw new Error("Initial Root Fields require this incarnation's unused fresh root before lifecycle")
      initialized.applying = true
      try {
        const supplied = typeof input === "function" ? await input() : input
        if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)
          || ![Object.prototype, null].includes(Object.getPrototypeOf(supplied)))
          throw new Error("Initial Root Fields require a plain object")
        const keys = Reflect.ownKeys(supplied)
        if (keys.some(key => typeof key !== "string" || !Object.getOwnPropertyDescriptor(supplied, key)?.enumerable
          || !Object.hasOwn(Object.getOwnPropertyDescriptor(supplied, key)!, "value")))
          throw new Error("Initial Root Fields require enumerable data properties")
        const values = structuredClone(supplied)
        return await oracle.withClosedMutationAdmission(async () => {
          const requests = await timeControl.readAtExactFrontier(async frontier => {
            if (frontier.acceptanceSequence !== initialized.sequence)
              throw new Error("Fresh root frontier changed before initial Fields")
            const {state, projection} = await readWorld()
            const graph = await rpc.call<BoundaryGraphProjection>("boundary", BOUNDARY_GRAPH_PROJECTION_METHOD, {})
            if (graph.root !== initialized.source) throw new Error("Fresh root identity changed before initial Fields")
            const roots = graph.runtime.roots.filter(node => node.kind === "atom" && node.meta === graph.root)
            if (roots.length !== 1 || roots[0]?.kind !== "atom") throw new Error("Initial Fields require one exact root Atom")
            const declaration = projection.entries.filter(entry => entry.path === "wimp" && typeof entry.value === "object" && entry.value !== null && "src" in entry.value && entry.value.src === graph.root)
            if (declaration.length !== 1) throw new Error("Initial root declaration is not unique")
            const metadata = declaration[0]!.value as Record<string, unknown>
            const fields = state.declarations.filter(item => item.src === graph.root && item.section === "fields").map(item => ({key: String(item.value.key), type: String(item.value.type), required: item.value.required === true}))
            const bindings = normalizeMetaLifecycle(Object.hasOwn(metadata, "lifecycle") ? metadata.lifecycle : options.lifecycle, fields)
            const inputs = new Set(Object.values(bindings ?? {}).map(binding => binding.field))
            const atom = {root: graph.root, ref: roots[0].ref, meta: roots[0].meta}
            const pending: MetaFieldValueApplyRequest[] = []
            for (const field of keys as string[]) {
              if (inputs.has(field)) throw new Error(`Initial Fields cannot supply a native lifecycle Field: ${field}`)
              const validation = validateMetaFieldValueApplyRequest({contractVersion: META_OBSERVATION_CONTRACT_VERSION,
                atom, field, value: values[field], expectedFrontier: {cutId: frontier.cutId, throughSequence: frontier.acceptanceSequence, retroactiveComplete: false}})
              if (!validation.ok) throw new Error(`Invalid initial Root Field: ${field}`)
              await rpc.call("boundary", BOUNDARY_FIELD_VALUE_PLAN_METHOD, validation.value)
              pending.push(validation.value)
            }
            return pending
          })
          const receipts: MetaFieldValueApplyReceipt[] = []
          let expectedFrontier = requests[0]?.expectedFrontier
          for (const request of requests) {
            receipts.push(await runtimeInputs.applyFieldValue({...request, expectedFrontier: expectedFrontier!}))
            expectedFrontier = await timeControl.readAtExactFrontier(async frontier => ({cutId: frontier.cutId,
              throughSequence: frontier.acceptanceSequence, retroactiveComplete: false as const}))
          }
          return receipts
        })
      } finally {freshRoot = undefined}
    },
    /**
    Applies one saved Meta lifecycle input through meta.field.value.apply.
    The exact root Atom and ordinary Field are resolved from Boundary RPC at a
    held causal cut, then mutation occurs after releasing that cut. Acceptance
    is never retried; a concurrent frontier change is an explicit failure.
    Returns after finite causally started Process work drains. Live objects
    remaining in Energy are not stopped by this adapter.
    */
    async applyRootLifecycle(event: keyof RootMetaLifecycleBindings): Promise<MetaFieldValueApplyReceipt | undefined> {
      if (freshRoot?.applying) throw new Error("Initial Root Fields are still applying")
      freshRoot = undefined
      if (!lifecycle.status().ok) throw new Error("Root lifecycle input requires a running Force contour")
      const request = await oracle.withClosedMutationAdmission(async () => await timeControl.readAtExactFrontier(async frontier => {
        const {state, projection} = await readWorld()
        const hasLifecycle = projection.entries.some(entry => entry.path === "wimp" && typeof entry.value === "object" && entry.value !== null && Object.hasOwn(entry.value, "lifecycle"))
        if (!hasLifecycle && !options.lifecycle?.[event]) return
        const graph = await rpc.call<BoundaryGraphProjection>("boundary", BOUNDARY_GRAPH_PROJECTION_METHOD, {})
        const declaration = projection.entries.filter(entry => entry.path === "wimp" && typeof entry.value === "object" && entry.value !== null && "src" in entry.value && entry.value.src === graph.root)
        if (declaration.length !== 1) throw new Error("Root lifecycle declaration is not unique")
        const metadata = declaration[0]!.value as Record<string, unknown>
        const fields = state.declarations.filter(item => item.src === graph.root && item.section === "fields").map(item => ({key: String(item.value.key), type: String(item.value.type), required: item.value.required === true}))
        const saved = Object.hasOwn(metadata, "lifecycle")
        const bindings = normalizeMetaLifecycle(saved ? metadata.lifecycle : options.lifecycle, fields)
        const binding = bindings?.[event]
        if (!binding) return
        const roots = graph.runtime.roots.filter(node => node.kind === "atom" && node.meta === graph.root)
        if (roots.length !== 1 || roots[0]?.kind !== "atom") throw new Error("Root lifecycle input requires one exact root Atom")
        const root = roots[0]
        return {contractVersion: META_OBSERVATION_CONTRACT_VERSION,
          atom: {root: graph.root, ref: root.ref, meta: root.meta}, field: binding.field, value: binding.value,
          expectedFrontier: {cutId: frontier.cutId, throughSequence: frontier.acceptanceSequence, retroactiveComplete: false},
        } satisfies MetaFieldValueApplyRequest
      }))
      if (!request) return
      const receipt = await rpc.call<MetaFieldValueApplyReceipt>("dark", META_FIELD_VALUE_APPLY_METHOD, request)
      await oracle.withClosedMutationAdmission(async () => await timeControl.readAtExactFrontier(async () => {}))
      return receipt
    },
    handles: (pathname: string) => Object.hasOwn(routes, pathname),
    async fetch(request: Request, current: DarkRuntimeServer): Promise<Response | undefined> {
      const pathname = new URL(request.url).pathname
      if (options.peer && ["/force", "/ws", "/oracle/ws", "/oracle/channels", "/oracle/rpc", "/oracle/channel"].includes(pathname))
        return new Response("Legacy payload admission is disabled", {status: 403})
      const route = routes[pathname]
      if (!route) return new Response(null, {status: 404})
      const handler = route[request.method]
      if (!handler) return new Response(null, {status: 405})
      return await handler(request, current)
    },
    async seed(sources: readonly string[], readMeta?: MetaLoader) {
      if (!lifecycle.status().ok) throw new Error("Meta roots require a running Force contour")
      await accept(await preflight(sources, readMeta))
      await oracle.withClosedMutationAdmission(async () => await timeControl.readAtExactFrontier(async () => {}))
    },
    /**
    Imports a root only into a verified empty Boundary and sequence-zero history.
    Every reachable declaration is read before acceptance; the method returns
    after Boundary and the participating domains reach the applied-through cut.
    A populated world restores without opening the root source. This is not an
    atomic graph import: a process crash during acceptance can leave a valid
    prefix, whose completeness is not proven by the current owning protocols.
    */
    async initializeRoot(load: () => Promise<DarkRuntimeRoot>): Promise<{mode: "initialized" | "restored"}> {
      if (freshRoot?.applying) throw new Error("Initial Root Fields are still applying")
      freshRoot = undefined
      if (!lifecycle.status().ok) throw new Error("Root initialization requires a running Force contour")
      return await oracle.withClosedMutationAdmission(async () => {
        const {state, projection} = await timeControl.readAtExactFrontier(readWorld)
        const empty = projection.entries.length === 0 &&
          [state.atoms, state.declarations, state.pendingProcessExecutions, state.reactionRelations, state.unfinishedReactionExecutions].every(items => items.length === 0)
        if (!empty) {
          if (projection.entries.length === 0) throw new Error("Boundary initialization projections disagree")
          return {mode: "restored"}
        }
        if (forceHistory.status().sequence !== 0) throw new Error("Empty Boundary has a non-empty Force history; root initialization is unresolved")
        if (timeControl.pauseStack().length) throw new Error("Root initialization cannot mutate a paused world")
        lifecycle.closeExternalAdmission()
        try {
          const root = await load()
          const particles = await preflight([root.source], root.readMeta)
          if (!particles.length) throw new Error("Root initialization produced no declaration particles")
          await accept(particles)
          await timeControl.readAtExactFrontier(async frontier => {
            const applied = await readWorld()
            if (!applied.projection.entries.some(entry => entry.path === "wimp" &&
              typeof entry.value === "object" && entry.value !== null && "src" in entry.value && entry.value.src === root.source)) {
              throw new Error("Root declaration is missing after the applied-through cut")
            }
            freshRoot = {source: root.source, sequence: frontier.acceptanceSequence, applying: false}
          })
          return {mode: "initialized"}
        } finally {
          lifecycle.openExternalAdmission()
        }
      })
    },
    close(): Promise<void> {
      return closing ??= (async () => {
        const current = lease
        current?.release.resolve()
        lifecycle.stop()
        if (darkCheckpoint) uninstallForceCheckpointSideband("dark", darkCheckpoint)
        oracle.onServerStopping()
        rpc.close()
        router.detach(localOracle.router)
        for (const channel of options.localOracleChannels ?? []) router.detach(channel)
        stopDarkRuntime(localForce)
        localForce.close()
        const closed = await Promise.allSettled([
          localOracle.peer.close(new Error("Dark runtime stopped")),
          oracleChannels.closeAll(new Error("Dark runtime stopped")),
          domainOracleChannels.closeAll(new Error("Dark runtime stopped")),
        ])
        try {peerChannels?.close(); websocket?.close()} finally {active = false}
        await current?.finished.catch(() => {})
        const failures = closed.flatMap(result => result.status === "rejected" ? [result.reason] : [])
        if (failures.length) throw new AggregateError(failures, "Dark runtime resources did not close")
      })()
    },
  }
}

export type DarkRuntime = Awaited<ReturnType<typeof createDarkRuntime>>
