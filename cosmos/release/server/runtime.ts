import {createNetworkObservationSurface} from "./network-observation"
import {release} from "./services"
const {recoverPublication} = release
import {join, resolve} from "node:path"
import {
  currentServerProcessIdentity,
  serverProcessReady,
} from "../../shared/package/process"
import {getPackage, getRelease} from "./http/delivery"
import {publishRelease} from "./release/update"
import {createRendezvousHandler, type RendezvousHandler} from "@metafor/tech-peer/rendezvous"

import {
  closeRpc,
  messageRpc,
  openRpc,
  rpcServiceTopic,
  type RpcSocketData,
  type ReleaseServerSocketData,
} from "./rpc"
import {cosmosRoot} from "./shared/paths"
import {prepareQuantumRuntime, quantumRuntimeOptions, type QuantumRuntime, type QuantumRuntimeOptions} from "./quantum"
import type {QuantumRuntimeSocketData} from "./quantum"
import {readReleaseNodeConfiguration, readReleaseNodeToken, startReleaseNode, type ReleaseNode, type ReleaseNodeConfiguration} from "./node"
import {createPublishedReleaseSource} from "@metafor/tech-release"
import {resolveRootMetaSource} from "shared/metafor/source"
import {loadMeta} from "../../../quantum/dark/load"
import {createAgentUiOracle} from "./agents"
import {AGENT_UI_PATH, AGENT_UI_PROVIDER_PATH, AGENT_UI_CONNECT_PATH, AGENT_UI_PROFILE_PATH, AGENT_UI_CONNECTIONS_PATH} from "../shared/agents"
import {AGENT_BROWSER_PATH} from "../shared/agents-browser"
import type {AgentBrowserSocketData} from "./agents-browser"
import {configuredCodespaceHostOracle} from "./codespace-oracle"
import {createClientOracle, type ClientSocketData} from "./clients"
import {CLIENT_SOCKET_PATH} from "../shared/clients"
import {configuredNativeReplOracle} from "./repl"
import {isProductPath} from "../shared/product-route"

const staticRoot = join(cosmosRoot, "static")
const assetsRoot = join(cosmosRoot, "assets")
const indexHtml = join(staticRoot, "index.html")
const signalingHandlers = new WeakMap<Bun.Server<ReleaseServerSocketData>, RendezvousHandler>()
const quantumRuntimes = new WeakMap<Bun.Server<ReleaseServerSocketData>, QuantumRuntime>()
const releaseNodes = new WeakMap<Bun.Server<ReleaseServerSocketData>, ReleaseNode>()
const agentUis = new WeakMap<Bun.Server<ReleaseServerSocketData>, ReturnType<typeof createAgentUiOracle>>()
const clientOracles = new WeakMap<Bun.Server<ReleaseServerSocketData>, ReturnType<typeof createClientOracle>>()
const nativeRepls = new WeakMap<Bun.Server<ReleaseServerSocketData>, NonNullable<Awaited<ReturnType<typeof configuredNativeReplOracle>>>>()
const codespaceHosts = new WeakMap<Bun.Server<ReleaseServerSocketData>, NonNullable<ReturnType<typeof configuredCodespaceHostOracle>>>()

/** Admission token остаётся в server-only configuration и не входит в browser artifacts. */
export interface ReleaseServerOptions {
  port?: number
  signalingToken?: string
  quantum?: QuantumRuntimeOptions | undefined
  node?: ReleaseNodeConfiguration | undefined
}

/** Создаёт единственный release-owned HTTP/WebSocket server Cosmos. */
export async function startReleaseServer(
  options: ReleaseServerOptions = {},
): Promise<Bun.Server<ReleaseServerSocketData>> {
  await recoverPublication()
  const signaling = options.signalingToken ? createRendezvousHandler({token: options.signalingToken, relay: true}) : null
  let agentReady = false
  const nativeRepl = options.quantum ? await configuredNativeReplOracle(Bun.env, () => agentReady) : null
  const agentUi = options.quantum ? createAgentUiOracle({admitted: () => agentReady, verseId: Bun.env.COSMOS_VERSE_ID}) : undefined
  const clients = options.quantum ? createClientOracle({admitted: () => agentReady}) : undefined
  const codespaceHost = options.quantum ? configuredCodespaceHostOracle(Bun.env, () => agentReady) : null
  const quantum = options.quantum ? await prepareQuantumRuntime({...options.quantum,
    localOracleChannels: [...(options.quantum.localOracleChannels ?? []), agentUi!.channel, clients!.channel, ...(nativeRepl ? [nativeRepl.channel] : []), ...(codespaceHost ? [codespaceHost.channel] : [])],
  }).catch(async error => {await agentUi?.close(); await clients?.close(); await nativeRepl?.close(); await codespaceHost?.close(); throw error}) : undefined
  const observations = createNetworkObservationSurface({...(quantum ? {local:()=>quantum.observeDomains(),authorizePublisher:(request,server)=>quantum.authorizeObservation(request,server)} : {})})
  const domainRoute = (request: Request, server: Bun.Server<ReleaseServerSocketData>) =>
    quantum ? quantum.fetch(request, server) : new Response(null, {status: 404})

  let server: Bun.Server<ReleaseServerSocketData>
  try {server = Bun.serve<ReleaseServerSocketData>({
    ...(options.port === undefined ? {} : {port: options.port}),
    routes: {
      "/": Bun.file(indexHtml),
      "/manifest.webmanifest": Bun.file(join(staticRoot, "manifest.json"), {
        type: "application/manifest+json",
      }),
      "/assets/fonts/jetbrains-mono-bold.ttf": Bun.file(
        new URL(import.meta.resolve("@zavx0z/immersive/engine/fonts/jetbrains-mono-bold.ttf")),
      ),
      "/assets/*": async (request: Request) => {
        const asset = new URL(request.url).pathname.slice("/assets/".length)
        if (!asset || asset.includes("%") || asset.split("/").some((part) =>
          !part || part === "." || part === "..")) return new Response(null, {status: 404})
        const file = Bun.file(join(assetsRoot, asset))
        if (!await file.exists()) return new Response(null, {status: 404})
        return new Response(file)
      },
      "/@cosmos/:module": {GET: getPackage},
      "/@cosmos/:module/*": {GET: getPackage},
      "/@internal/:module": {GET: getPackage},
      "/@internal/:module/*": {GET: getPackage},
      "/@metafor/:module": {GET: getPackage},
      "/@metafor/:module/*": {GET: getPackage},
      "/code": {
        GET: getRelease,
        POST: (request: Request, current: Bun.Server<ReleaseServerSocketData>) => publishRelease(request, {
          topic: rpcServiceTopic,
          subscriberCount: () => current.subscriberCount(rpcServiceTopic),
          publish: (message) => current.publish(rpcServiceTopic, message),
        }),
      },
      "/sw": (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        (() => {const data=observations.data(request,current);if(data instanceof Response)return data;if(current.upgrade(request,{data}))return;return new Response(null,{status:426})})(),
      "/peer": (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        signaling ? signaling.upgrade(request, (request, data) => current.upgrade(request, {data}))
          : new Response(null, {status: 404}),
      "/_quantum/*": domainRoute,
      "/health": domainRoute,
      "/force": domainRoute,
      "/ws": domainRoute,
      "/oracle/*": domainRoute,
      [CLIENT_SOCKET_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) => clients ? clients.fetch(request, current) : new Response(null, {status: 404}),
      [AGENT_UI_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      [AGENT_UI_PROVIDER_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      [AGENT_UI_CONNECT_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      [AGENT_UI_PROFILE_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      [AGENT_UI_CONNECTIONS_PATH]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      "/agents/settings": (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      [`${AGENT_BROWSER_PATH}/*`]: (request: Request, current: Bun.Server<ReleaseServerSocketData>) =>
        agentUi ? agentUi.fetch(request, current) : new Response(null, {status: 404}),
      "/*": (request: Request) => {
        if (request.method === "GET" && isProductPath(new URL(request.url).pathname))
          return new Response(Bun.file(indexHtml))
        return new Response(null, {status: 404})
      },
    },
    fetch: () => new Response(null, {status: 404}),
    websocket: {
      open(socket) {
        if (clients?.owns(socket.data)) {clients.websocket.open(socket as Bun.ServerWebSocket<ClientSocketData>); return}
        if (agentUi?.owns(socket.data)) agentUi.websocket.open(socket as Bun.ServerWebSocket<AgentBrowserSocketData>)
        else if (quantum?.owns(socket.data)) quantum.websocket.open(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>)
        else if (signaling?.owns(socket.data)) signaling.websocket.open(socket)
        else if ((socket.data as RpcSocketData).observation !== "publisher") openRpc(socket as Bun.ServerWebSocket<RpcSocketData>)
      },
      message(socket, message) {
        if (clients?.owns(socket.data)) return clients.websocket.message(socket as Bun.ServerWebSocket<ClientSocketData>, message)
        if (agentUi?.owns(socket.data)) return agentUi.websocket.message(socket as Bun.ServerWebSocket<AgentBrowserSocketData>, message)
        else if (quantum?.owns(socket.data)) return quantum.websocket.message(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>, message)
        else if (signaling?.owns(socket.data)) signaling.websocket.message(socket, message)
        else {if((socket.data as RpcSocketData).observation === "publisher" && message.length>128*1024){socket.close(1008,"Observation limit");return};let value:unknown;try{value=JSON.parse(String(message))}catch{};if(observations.message(socket as Bun.ServerWebSocket<RpcSocketData>,value))return;return messageRpc(socket as Bun.ServerWebSocket<RpcSocketData>, message)}
      },
      close(socket, code, reason) {
        if (clients?.owns(socket.data)) {clients.websocket.close(socket as Bun.ServerWebSocket<ClientSocketData>); return}
        if (agentUi?.owns(socket.data)) agentUi.websocket.close(socket as Bun.ServerWebSocket<AgentBrowserSocketData>)
        else if (quantum?.owns(socket.data)) quantum.websocket.close(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>)
        else if (signaling?.owns(socket.data)) signaling.websocket.close(socket, code, reason)
        else {observations.close(socket as Bun.ServerWebSocket<RpcSocketData>);closeRpc(socket as Bun.ServerWebSocket<RpcSocketData>, code, reason)}
      },
    },
  })} catch (error) {
    await clients?.close(); await nativeRepl?.close(); await agentUi?.close(); await codespaceHost?.close(); await quantum?.close(); signaling?.close()
    throw error
  }
  if (signaling) signalingHandlers.set(server, signaling)
  if (agentUi) agentUis.set(server, agentUi)
  if (clients) clientOracles.set(server, clients)
  if (nativeRepl) nativeRepls.set(server, nativeRepl)
  if (codespaceHost) codespaceHosts.set(server, codespaceHost)
  if (quantum) {
    quantumRuntimes.set(server, quantum)
    try {await quantum.start(server.port!); agentReady = true} catch (error) {
      await clients?.close()
      await nativeRepl?.close()
      await agentUi?.close()
      await codespaceHost?.close()
      await quantum.close()
      signaling?.close()
      await server.stop(true)
      throw error
    }
    void quantum.failure.catch(async () => {
      agentReady = false
      await clients?.close()
      await nativeRepl?.close()
      await agentUi?.close()
      await codespaceHost?.close()
      await releaseNodes.get(server)?.close()
      signaling?.close()
      await server.stop(true)
      process.exitCode = 1
    })
  }
  if (options.node && !quantum) {
    try {
      const source = await createPublishedReleaseSource(release)
      const node = await startReleaseNode({config: options.node, observation:{async read(){return null},publish:snapshot=>observations.publish(snapshot)}, source: {
        async readGraph(digest) {
          if (digest !== source.digest) throw new Error("Requested release is not the pinned composition")
          return source.graph
        },
        read: identity => source.artifacts.read(identity),
      }})
      releaseNodes.set(server, node)
    } catch (error) {
      signaling?.close()
      await server.stop(true)
      throw error
    }
  }

  if (process.send) process.send(serverProcessReady(currentServerProcessIdentity()))
  return server
}

/** Запускает release server как самостоятельный exact package artifact. */
export async function runReleaseServer(): Promise<Bun.Server<ReleaseServerSocketData>> {
  if (!Bun.env.METAFOR_META_SOURCE_ROOT && !Bun.env.METAFOR_META_ARTIFACT_ROOT && !Bun.env.METAFOR_ROOT_META) {
    if (Bun.env.COSMOS_RELEASE_STORE) Bun.env.METAFOR_META_ARTIFACT_ROOT = Bun.env.COSMOS_RELEASE_STORE
    else Bun.env.METAFOR_META_SOURCE_ROOT = resolve(cosmosRoot, "../..")
  }
  const stateRoot = Bun.env.METAFOR_STATE_ROOT ?? (Bun.env.COSMOS_RELEASE_STORE ? join(Bun.env.COSMOS_RELEASE_STORE, "state") : join(cosmosRoot, ".metafor"))
  const quantum = quantumRuntimeOptions(stateRoot)
  const nodePath = Bun.env.COSMOS_NODE_CONFIG
  const configuration = nodePath ? await readReleaseNodeConfiguration(nodePath, quantum ? {massRoot: join(stateRoot, "mass")} : {}) : undefined
  const signalingToken = configuration ? await readReleaseNodeToken(configuration) : quantum ? undefined : Bun.env.COSMOS_PEER_TOKEN
  const node = quantum ? undefined : configuration
  const rootMeta = Bun.env.METAFOR_ROOT_META
  if (quantum && rootMeta !== undefined) quantum.root = async () => {
    if (!rootMeta) throw new Error("First Quantum launch requires --meta-root")
    const {source, resolver} = resolveRootMetaSource(rootMeta)
    return {source, readMeta: address => loadMeta(address, resolver)}
  }
  if (Bun.env.COSMOS_RELEASE_STORE && Bun.env.COSMOS_RELEASE_DIGEST) {
    const {runInstalledRelease} = await import("./installed/runtime")
    return await runInstalledRelease({
      storeRoot: Bun.env.COSMOS_RELEASE_STORE,
      digest: Bun.env.COSMOS_RELEASE_DIGEST,
      ...(Bun.env.COSMOS_STATIC_ROOT ? {staticRoot: Bun.env.COSMOS_STATIC_ROOT} : {}),
      ...(Bun.env.COSMOS_CONTROL_TOKEN ? {controlToken: Bun.env.COSMOS_CONTROL_TOKEN} : {}),
      ...(signalingToken ? {signalingToken} : {}),
      quantum, node,
    })
  }
  const server = await startReleaseServer({
    ...(signalingToken ? {signalingToken} : {}),
    quantum, node,
  })
  const stop = async () => {
    await clientOracles.get(server)?.close()
    clientOracles.delete(server)
    await nativeRepls.get(server)?.close()
    nativeRepls.delete(server)
    await codespaceHosts.get(server)?.close()
    codespaceHosts.delete(server)
    await agentUis.get(server)?.close()
    agentUis.delete(server)
    await releaseNodes.get(server)?.close()
    releaseNodes.delete(server)
    await quantumRuntimes.get(server)?.close()
    quantumRuntimes.delete(server)
    signalingHandlers.get(server)?.close()
    signalingHandlers.delete(server)
    return server.stop(true)
  }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  return server
}
