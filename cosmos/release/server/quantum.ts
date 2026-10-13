import {existsSync} from "node:fs"
import {timingSafeEqual} from "node:crypto"
import {join, resolve} from "node:path"
import {createDarkRuntime, type DarkRuntimeRoot, type InitialRootFieldsInput, type RootMetaLifecycleBindings, type DarkRuntime, type DarkRuntimeServer, type DarkRuntimeSocketData} from "../../../quantum/dark/runtime"
import {isLoopbackAddress} from "shared/transport/oracle"
import {createRoutedPeerNetwork, type PeerNetwork, type PeerSnapshot} from "@metafor/tech-peer"
import {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import {createWeriftPeerConnectionFactory} from "@metafor/tech-peer/werift"
import {createRendezvousHandler, type RendezvousSession} from "@metafor/tech-peer/rendezvous"
import {PeerOracleTransport} from "shared/transport/oracle/peer-channel"
import {PeerForce} from "shared/transport/force/peer"
import type {RemoteForceDomain} from "../../../quantum/dark/force/store"
import type {OracleChannel} from "shared/transport/oracle"
import {DOMAIN_OBSERVATION_SCHEMA, type DomainTransportReport, type ObservedChannelState} from "../shared/peer-observation"
import {reportQuantumDomainFailure} from "./quantum-diagnostics"

/** Four-domain incarnation owned by one release; its persistent state is outside immutable artifacts. */
export interface QuantumRuntimeOptions {
  stateRoot: string
  /** Explicit standalone WS fixtures; installed CLI chooses the private Peer contour. */
  transport?: "peer" | "websocket"
  /** Caller-owned in-process Oracle composition, never an external anonymous endpoint. */
  localOracleChannels?: readonly OracleChannel[]
  executable?: string
  sources?: readonly string[]
  root?: () => Promise<DarkRuntimeRoot>
  /** Trusted nonsecret ordinary Root values, preflighted/applied before started only on fresh initialization. Never read on restoration. */
  initialRootFields?: InitialRootFieldsInput
  lifecycle?: RootMetaLifecycleBindings
  readyTimeoutMs?: number
  env?: Readonly<Record<string, string | undefined>>
  /** Ограниченный opaque native context только Energy. Объявленные keys удаляются из env других детей, включая inherited ambient values; incarnation/storage context переопределять нельзя. */
  energyEnvironment?: Readonly<Record<string, string | undefined>>
}

const domains = ["dark", "boundary", "matrix", "energy"] as const
type ChildDomain = "boundary" | "energy" | "matrix"

/** Every owned process has one network, restricted to the loopback incarnation. */
async function openDomainNetwork(url: string, id: string, token: string): Promise<PeerNetwork> {
  const bootstrap = await connectWebSocketSignaling({url, id, token, relay: true, reconnect: false})
  try {
    return createRoutedPeerNetwork({id, bootstrap, dataChannels: ["oracle", "force"],
      maxMessageBytes: 32 * 1024 * 1024, iceServers: [],
      rtc: createWeriftPeerConnectionFactory({iceAdditionalHostAddresses: ["127.0.0.1"],
        iceUseIpv4: false, iceUseIpv6: false, iceInterfaceAddresses: {udp4: "127.0.0.1"},
        iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1"}),
    })
  } catch (error) {bootstrap.close(); throw error}
}

/** Executes domain code and native transport from the same prepared release artifact. */
export async function runQuantumDomain(domain: string): Promise<void> {
  if (!["boundary", "energy", "matrix"].includes(domain)) throw new Error("Unknown release domain")
  if (Bun.env.COSMOS_QUANTUM_TRANSPORT !== "peer") {
    if (domain === "boundary") await import("../../../quantum/boundary/server-websocket")
    else if (domain === "energy") await import("../../../quantum/energy/server-websocket")
    else await import("../../../quantum/matrix/server-websocket")
    return
  }
  const {COSMOS_QUANTUM_SIGNAL_URL: url, COSMOS_QUANTUM_PEER_ID: id,
    COSMOS_QUANTUM_DARK_ID: peerId, COSMOS_QUANTUM_TOKEN: token} = Bun.env
  if (!url || !id || !peerId || !token) throw new Error("Owned domain peer context is missing")
  const network = await openDomainNetwork(url, id, token)
  let runtime: {close(): Promise<void>} | undefined
  let force: PeerForce | undefined
  let stopping: Promise<void> | undefined
  const failed = Promise.withResolvers<never>()
  void failed.promise.catch(() => {})
  const close = () => stopping ??= (async () => {
    if (force) delete force.onDestroy
    const errors: unknown[] = []
    try {await runtime?.close()} catch (error) {errors.push(error)}
    try {await force?.close()} catch (error) {errors.push(error)}
    try {await transport.close()} catch (error) {errors.push(error)}
    try {await network.close()} catch (error) {errors.push(error)}
    if (errors.length) throw new AggregateError(errors, `Owned ${domain} transport cleanup failed`)
  })()
  const onFailure = (error: Error) => {
    if (stopping) return
    failed.reject(error)
    reportQuantumDomainFailure(domain, "peer", error)
    void close().catch(cleanup => reportQuantumDomainFailure(domain, "cleanup", cleanup)).finally(() => process.exit(1))
  }
  const transport = new PeerOracleTransport({network, peerId, identity: domain, onFailure})
  const context = {transport, createForce: () => force = new PeerForce(domain, {network, peerId, onFailure})}
  const shutdown = () => {void close().catch(error => {reportQuantumDomainFailure(domain, "shutdown", error); process.exitCode = 1})}
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
  try {
    const start = async () => {
      if (domain === "boundary") return await (await import("../../../quantum/boundary/server")).startBoundaryRuntime({
        ...context, filename: Bun.env.BOUNDARY_PATH!,
      })
      if (domain === "energy") return await (await import("../../../quantum/energy/server")).startEnergyRuntime(context)
      return await (await import("../../../quantum/matrix/server")).startMatrixRuntime(context)
    }
    runtime = await Promise.race([start(), failed.promise])
    if (stopping) {await runtime.close(); throw new Error("Domain stopped during birth")}
  } catch (error) {
    try {await close()} catch (cleanup) {throw new AggregateError([error, cleanup], "Domain birth and cleanup failed")}
    throw error
  }
}

/** Product startup opts in; isolated delivery tests can omit the domain incarnation. */
export function quantumRuntimeOptions(stateRoot: string): QuantumRuntimeOptions | undefined {
  if (Bun.env.COSMOS_QUANTUM === "0") return
  const sources = Bun.env.METAFOR_ROOT_SOURCES?.split(",").map(source => source.trim()).filter(Boolean)
  return {stateRoot: resolve(stateRoot), transport: "peer", ...(sources?.length ? {sources} : {}), energyEnvironment: {
    ORACLE_ENVIRONMENT_GRAPH_SCOPES: Bun.env.ORACLE_ENVIRONMENT_GRAPH_SCOPES,
    ORACLE_ENVIRONMENT_CODESPACE_SCOPES: Bun.env.ORACLE_ENVIRONMENT_CODESPACE_SCOPES,
    ORACLE_ENVIRONMENT_PEER_SCOPES: Bun.env.ORACLE_ENVIRONMENT_PEER_SCOPES,
    ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES: Bun.env.ORACLE_ENVIRONMENT_PROVIDER_DISCOVERY_SCOPES,
    ORACLE_ENVIRONMENT_REPL_SCOPES: Bun.env.ORACLE_ENVIRONMENT_REPL_SCOPES,
    ORACLE_REPL_CONFIG: Bun.env.ORACLE_REPL_CONFIG,
    ORACLE_AGENT_CODEX_COMMAND: Bun.env.ORACLE_AGENT_CODEX_COMMAND,
    ORACLE_AGENT_CODEX_CWD: Bun.env.ORACLE_AGENT_CODEX_CWD,
    ORACLE_AGENT_PROVIDER_CONFIG: Bun.env.ORACLE_AGENT_PROVIDER_CONFIG,
  }}
}

/**
Prepares Dark handlers for the release listener, then births Boundary, Energy
and Matrix using its actual loopback address. Readiness requires the causal
gate and every participating domain; Bulk is never spawned. Failure tears down
the whole owned incarnation. No child runs a repository source entrypoint.
The explicit stateRoot owns Boundary, Mass, history and checkpoint control;
inherited storage paths cannot redirect any participating domain. Children
also use this root as cwd. [Integration](../spec/quantum.spec.ts) runs two
compiled incarnations concurrently and reopens their independent Mass bytes.
*/
export async function prepareQuantumRuntime(options: QuantumRuntimeOptions) {
  const energyEnvironment = {...options.energyEnvironment}
  if (Object.keys(energyEnvironment).length > 32) throw new Error("Energy environment exceeds its key limit")
  for (const [key, value] of Object.entries(energyEnvironment)) {
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(key) || /^(?:COSMOS_(?:QUANTUM|RELEASE)(?:_|$)|FORCE_|BOUNDARY_|METAFOR_|DARK_)/.test(key) ||
        ["BUN_OPTIONS", "NODE_OPTIONS", "COSMOS_NODE_CONFIG", "COSMOS_CONTROL_TOKEN"].includes(key) ||
        value !== undefined && (typeof value !== "string" || value.length > 4096 || value.includes("\0"))) throw new Error("Energy environment cannot change the owned runtime context")
  }
  const stateRoot = resolve(options.stateRoot)
  const historyRoot = join(stateRoot, "dark-force-history", "v1")
  const peerMode = options.transport === "peer"
  const incarnation = crypto.randomUUID()
  const token = crypto.randomUUID()
  const path = `/_quantum/${incarnation}`
  const darkId = `${incarnation}-dark`
  const identities = new Map<string, RemoteForceDomain>(["boundary", "energy", "matrix"].map(domain =>
    [`${incarnation}-${domain}`, domain as RemoteForceDomain]))
  const rendezvous = peerMode ? createRendezvousHandler({token, path, relay: true, maxPeers: 4}) : undefined
  let network: PeerNetwork | undefined
  let currentDark: DarkRuntime | undefined
  const getDark = (): DarkRuntime => {
    if (!currentDark) throw new Error("Dark is not born before the release listener binds")
    return currentDark
  }
  const createDark = async () => await createDarkRuntime({stateRoot, domains, checkpoint: true,
    ...(options.localOracleChannels ? {localOracleChannels: options.localOracleChannels} : {}),
    ...(options.lifecycle ? {lifecycle: options.lifecycle} : {}),
    ...(network ? {peer: {network, identities}} : {}),
    ...(!existsSync(join(historyRoot, "manifest.json")) ? {cutId: crypto.randomUUID()} : {})})
  if (!peerMode) currentDark = await createDark()
  const children: {domain: ChildDomain, process: ReturnType<typeof Bun.spawn>}[] = []
  let stopping: Promise<void> | undefined
  let born = false
  let worldReady = false
  let ready = false
  let stopped = false
  let watchdog: ReturnType<typeof setInterval> | undefined
  let failed!: (reason: Error) => void
  let observationSequence = 0
  const observeDomains = (health: Record<string, unknown> = {}): DomainTransportReport => {
    const force = currentDark?.status()
    const domains: DomainTransportReport["domains"] = currentDark ? [{name:"dark",state:force?.state === "running" ? "running" : "starting"}] : []
    const reported = (health.domains ?? {}) as Record<string,{rpc?:string;ok?:boolean;initialized?:boolean}>
    for (const child of children) domains.push({name:child.domain,state:child.process.exitCode !== null ? "closed" : reported[child.domain]?.ok || ready && force?.connectedDomains.includes(child.domain) ? "running" : "starting"})
    const channel = (link: PeerSnapshot["links"][number], name:string): ObservedChannelState =>
      link.channels?.find(channel=>channel.name===name)?.state ?? "unknown"
    return {schema:DOMAIN_OBSERVATION_SCHEMA,producerId:incarnation,seq:++observationSequence,observedAt:Date.now(),domains,
      links:(network?.snapshot().links ?? []).flatMap(link=>{
        const domain = identities.get(link.peerId)
        if (!domain || domain === "bulk" || !domains.some(item=>item.name===domain)) return []
        return [{to:domain,generation:link.generation,state:link.state,transport:link.transport ?? "direct",
          oracle:channel(link,"oracle"),force:channel(link,"force"),oracleReady:reported[domain] ? reported[domain].rpc === "ready" : null,
          forceReady:force ? force.connectedDomains.includes(domain) : null}]
      })}
  }
  const failure = new Promise<never>((_, reject) => {failed = reject})
  void failure.catch(() => {})
  const close = () => stopping ??= (async () => {
    stopped = true
    ready = false
    clearInterval(watchdog)
    const failures: unknown[] = []
    if (worldReady && currentDark && getDark().status().ok && children.every(child => child.process.exitCode === null)) {
      try {
        await Promise.race([
          (async () => {await getDark().resume(); await getDark().applyRootLifecycle("stopping")})(),
          ...children.map(child => child.process.exited.then(code => {
            throw new Error(`Release domain ${child.domain} exited with code ${code} during stopping input`)
          })),
        ])
      } catch (error) {failures.push(error)}
    }
    const outcomes = await Promise.allSettled(children.map(async child => {
      if (child.process.exitCode !== null) return
      child.process.kill("SIGTERM")
      await Promise.race([child.process.exited, Bun.sleep(1500)])
      if (child.process.exitCode !== null) return
      child.process.kill("SIGKILL")
      await Promise.race([child.process.exited, Bun.sleep(500).then(() => {
        if (child.process.exitCode === null) throw new Error(`Release domain ${child.domain} exit was not confirmed within the termination budget`)
      })])
    }))
    for (const outcome of outcomes) if (outcome.status === "rejected") failures.push(outcome.reason)
    try {await currentDark?.close()} catch (error) {failures.push(error)}
    try {await network?.close()} catch (error) {failures.push(error)}
    rendezvous?.close()
    if (failures.length) throw new AggregateError(failures, "Quantum stopping input or owned domain cleanup failed")
  })()
  const wait = async (check: (health: Awaited<ReturnType<DarkRuntime["health"]>>) => boolean) => {
    const deadline = Date.now() + (options.readyTimeoutMs ?? 60_000)
    while (!stopped && Date.now() < deadline) {
      const health = await Promise.race([getDark().health(), failure])
      if (check(health)) return
      await Promise.race([Bun.sleep(50), failure])
    }
    throw new Error(stopped ? "Domain incarnation stopped during birth" : "Domain incarnation readiness timed out")
  }
  return {
    get dark() {return getDark()}, failure, close,
    observeDomains,
    authorizeObservation(request: Request, server: Pick<DarkRuntimeServer,"requestIP">) {
      if (!isLoopbackAddress(server.requestIP(request)?.address) || !["127.0.0.1","localhost","[::1]"].includes(new URL(request.url).hostname) || request.headers.has("forwarded") || request.headers.has("x-forwarded-host")) return false
      const actual=Buffer.from(request.headers.get("authorization") ?? "")
      const expected=Buffer.from(`Bearer ${token}`)
      return actual.length === expected.length && timingSafeEqual(actual,expected)
    },
    handles(pathname: string) {return pathname === path || ["/health", "/force", "/ws", "/oracle/channels", "/oracle/rpc", "/oracle/channel", "/oracle/ws"].includes(pathname)},
    owns(data: unknown): data is DarkRuntimeSocketData | RendezvousSession {
      return rendezvous?.owns(data) === true || currentDark?.owns(data) === true
    },
    websocket: {
      open(socket: Bun.ServerWebSocket<DarkRuntimeSocketData | RendezvousSession>) {
        if (rendezvous?.owns(socket.data)) rendezvous.websocket.open(socket as Bun.ServerWebSocket<RendezvousSession>)
        else currentDark?.websocket.open(socket as Bun.ServerWebSocket<DarkRuntimeSocketData>)
      },
      message(socket: Bun.ServerWebSocket<DarkRuntimeSocketData | RendezvousSession>, message: string | Buffer) {
        if (rendezvous?.owns(socket.data)) rendezvous.websocket.message(socket as Bun.ServerWebSocket<RendezvousSession>, message)
        else return currentDark?.websocket.message(socket as Bun.ServerWebSocket<DarkRuntimeSocketData>, message)
      },
      close(socket: Bun.ServerWebSocket<DarkRuntimeSocketData | RendezvousSession>, code?: number, reason?: string) {
        if (rendezvous?.owns(socket.data)) rendezvous.websocket.close(socket as Bun.ServerWebSocket<RendezvousSession>, code, reason)
        else return currentDark?.websocket.close(socket as Bun.ServerWebSocket<DarkRuntimeSocketData>)
      },
    },
    /** Domain capabilities stay loopback-only even behind an internet-facing HTTP proxy. */
    async fetch(request: Request, server: DarkRuntimeServer & {upgrade(request: Request, options: {data: DarkRuntimeSocketData | RendezvousSession}): boolean}) {
      const host = new URL(request.url).hostname
      if (!isLoopbackAddress(server.requestIP(request)?.address) ||
          !["127.0.0.1", "localhost", "[::1]"].includes(host) ||
          request.headers.has("x-forwarded-host") || request.headers.has("forwarded"))
        return new Response(null, {status: 403})
      if (rendezvous && new URL(request.url).pathname === path)
        return rendezvous.upgrade(request, (request, data) => server.upgrade(request, {data}))
      if (!currentDark) return new Response("Domain incarnation is starting", {status: 503})
      if (new URL(request.url).pathname === "/health" && request.method === "GET") {
        const health = await currentDark.health()
        const ok = ready && health.ok === true
        return Response.json({...health, ok, networkObservation:observeDomains(health)}, {status: ok ? 200 : 503})
      }
      return currentDark.fetch(request, server)
    },
    async start(port: number) {
      if (born || stopped) throw new Error("Domain incarnation cannot start twice")
      born = true
      const executable = resolve(options.executable ?? process.argv[1] ?? "")
      const origin = `http://127.0.0.1:${port}`
      const inherited = {...process.env, ...options.env}
      for (const key of Object.keys(energyEnvironment)) delete inherited[key]
      for (const key of ["ORACLE_CODESPACE_HELPER_COMMAND", "ORACLE_CODESPACE_ACCOUNT", "ORACLE_CODESPACE_TARGET"]) delete inherited[key]
      const context = {
        FORCE_ADDRESS: `${origin.replace("http:", "ws:")}/ws`, FORCE_RPC_ADDRESS: origin,
        COSMOS_QUANTUM_TRANSPORT: peerMode ? "peer" : "websocket",
        COSMOS_QUANTUM_SIGNAL_URL: `${origin.replace("http:", "ws:")}${path}`,
        COSMOS_QUANTUM_DARK_ID: darkId, COSMOS_QUANTUM_TOKEN: token,
        FORCE_RECONNECT: "0", METAFOR_DOMAINS: domains.join(","),
        BOUNDARY_PATH: join(stateRoot, "dev.sqlite"), METAFOR_STATE_ROOT: stateRoot,
        METAFOR_MASS_PATH: join(stateRoot, "mass"),
        DARK_FORCE_HISTORY_PATH: historyRoot,
        DARK_CHECKPOINT_CONTROL_PATH: join(stateRoot, "checkpoint-control", "v1", "state.json"),
      }
      try {
        if (peerMode) {
          network = await openDomainNetwork(`${origin.replace("http:", "ws:")}${path}`, darkId, token)
          currentDark = await createDark()
        }
        for (const domain of ["boundary", "energy", "matrix"] as const) {
          const child = Bun.spawn({cmd: [process.execPath, executable], cwd: stateRoot,
            env: {...inherited, ...(domain === "energy" ? energyEnvironment : {}), ...context, COSMOS_QUANTUM_DOMAIN: domain, COSMOS_QUANTUM_PEER_ID: `${incarnation}-${domain}`},
            stdin: "ignore", stdout: "inherit", stderr: "inherit"})
          children.push({domain, process: child})
          void child.exited.then(code => {
            if (!stopped) {
              failed(new Error(`Release domain ${domain} exited with code ${code}`))
              void close()
            }
          })
          await wait(health => {
            const status = (health.domains as Record<string, {rpc?: string, initialized?: boolean}>)[domain]
            return domain === "boundary" ? status?.rpc === "ready" : status?.initialized === true
          })
        }
        await wait(health => health.ok === true)
        watchdog = setInterval(() => {
          if (getDark().status().state !== "error" || stopped) return
          failed(new Error("Dark causal contour failed"))
          void close()
        }, 250)
        let initialization: {mode: "initialized" | "restored"} | undefined
        if (options.root) initialization = await getDark().initializeRoot(options.root)
        else if (options.sources?.length) {
          if (options.sources.length !== 1) throw new Error("Quantum initialization requires one root Meta")
          initialization = await getDark().initializeRoot(async () => ({source: options.sources![0]!}))
        }
        if (initialization?.mode === "initialized" && options.initialRootFields !== undefined)
          await getDark().applyInitialRootFields(options.initialRootFields)
        else if (!initialization && options.initialRootFields !== undefined)
          throw new Error("Initial Root Fields require root initialization")
        worldReady = true
        await getDark().applyRootLifecycle("started")
        ready = true
        return initialization
      } catch (error) {
        try {await close()} catch (cleanup) {throw new AggregateError([error, cleanup], "Quantum birth and cleanup failed")}
        throw error
      }
    },
  }
}

export type QuantumRuntime = Awaited<ReturnType<typeof prepareQuantumRuntime>>

/** Listener data belongs either to Dark legacy adapters or this incarnation rendezvous. */
export type QuantumRuntimeSocketData = DarkRuntimeSocketData | RendezvousSession
