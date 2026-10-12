import {createNetworkObservationSurface} from "../network-observation"
import {createHash, timingSafeEqual} from "node:crypto"
import {realpath} from "node:fs/promises"
import {isAbsolute, join, relative, resolve, sep} from "node:path"
import {createInstalledReleaseStore} from "@metafor/tech-release/installed"
import {currentServerProcessIdentity} from "../../../shared/package/process"
import {parseReleaseCurrentMessage, releaseDeltaMessage} from "../../shared/protocol"
import {releaseDelta} from "../release/delta"
import type {RpcSocketData} from "../rpc"
import {acceptReleasePeer, createConnectedReleasePeer, type ConnectedReleasePeer, type ReleasePeerDescription} from "../peer/connect"
import {createInstalledReleaseDelivery} from "./delivery"
import {attachServerProcessControl} from "./control"
import {createServerReleaseReceiver} from "./receive"
import {createRendezvousHandler, type RendezvousHandler} from "@metafor/tech-peer/rendezvous"
import type {ReleaseServerSocketData} from "../rpc"
import {prepareQuantumRuntime, type QuantumRuntime, type QuantumRuntimeOptions} from "../quantum"
import type {QuantumRuntimeSocketData} from "../quantum"
import {startReleaseNode, type ReleaseNode, type ReleaseNodeConfiguration} from "../node"
import {createInstalledMetaMapping, findInstalledRootMeta} from "./metas"
import {createMetaSourceResolver} from "shared/metafor/source"
import {loadMeta} from "../../../../quantum/dark/load"

/** Конфигурация установленного runtime; исходный checkout не является зависимостью. */
export interface InstalledServerOptions {
  storeRoot: string
  digest: string
  port?: number
  staticRoot?: string
  controlToken?: string
  signalingToken?: string
  quantum?: QuantumRuntimeOptions | undefined
  node?: ReleaseNodeConfiguration | undefined
}

/**
Подготавливает полный установленный release, затем выполняет команды startup.
HTTP browser contract сохраняется; peer endpoint передаёт только signaling,
готовый граф и artifacts поступают по RTC. Изменение версии требует отдельного
operator capability и заранее известного digest. Сценарии — installed-runtime.spec.ts.
*/
export async function runInstalledRelease(options: InstalledServerOptions): Promise<Bun.Server<ReleaseServerSocketData>> {
  const store = createInstalledReleaseStore({root: options.storeRoot})
  const delivery = await createInstalledReleaseDelivery({store, digest: options.digest})
  const identity = currentServerProcessIdentity()
  const member = delivery.graph.packages.find(member => member.name === identity.name)
  const root = member?.environments.find(part => part.env === "server")?.outputs.find(output => output.artifact === "." && output.kind === "entry-point")
  if (!root || identity.env !== "server" || member?.version !== identity.version || root.sha256 !== identity.sha256 || root.size !== identity.size)
    throw new Error("Running server entry differs from installed release")

  const port = options.port ?? Number(Bun.env.PORT ?? 4444)
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error("Invalid installed server port")
  let server: Bun.Server<ReleaseServerSocketData> | null = null
  let signaling: RendezvousHandler | null = null
  let quantum: QuantumRuntime | undefined
  let quantumOptions = options.quantum
  let node: ReleaseNode | undefined
  const storeRoot = await realpath(options.storeRoot)
  const requestedRoot = Bun.env.METAFOR_ROOT_META?.trim()
  const beneath = (root: string, path: string) => {
    const suffix = relative(root, resolve(path))
    return suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix) ? undefined : suffix
  }
  const requestedSuffix = !requestedRoot ? undefined :
    beneath(resolve(options.storeRoot), requestedRoot) ?? beneath(storeRoot, requestedRoot)
  const installedRoot = requestedSuffix === undefined ? undefined : resolve(storeRoot, requestedSuffix)
  if (installedRoot !== undefined || (!Bun.env.METAFOR_META_SOURCE_ROOT && !requestedRoot)) {
    const selected = installedRoot === undefined ? undefined : await findInstalledRootMeta({store, digest: options.digest, graph: delivery.graph, path: installedRoot})
    const knownRoots = quantumOptions ? quantumOptions.sources ?? [] : options.node?.sources ?? []
    const mapping = await createInstalledMetaMapping({store, digest: options.digest, graph: delivery.graph,
      knownRoots: selected ? [...knownRoots, selected] : knownRoots})
    if (requestedRoot && installedRoot !== undefined && quantumOptions) {
      const resolver = createMetaSourceResolver({root: storeRoot, artifacts: mapping})
      quantumOptions = {...quantumOptions, root: async () => {
        if (!selected) throw new Error("Selected installed root is not a verified Meta entry or package version directory")
        return {source: selected, readMeta: source => loadMeta(source, resolver)}
      }}
    }
    if (!options.quantum && options.node?.sources?.some(source => !mapping[source])) throw new Error("Configured Meta root is missing from the installed composition")
    delete Bun.env.METAFOR_META_SOURCE_ROOT
    delete Bun.env.METAFOR_META_ARTIFACT_MAP_FILE
    Bun.env.METAFOR_META_ARTIFACT_ROOT = storeRoot
    Bun.env.METAFOR_META_ARTIFACT_MAP = JSON.stringify(mapping)
    delete Bun.env.METAFOR_ROOT_META
  }
  let admitting = false
  let destroyed = false
  let control: Awaited<ReturnType<typeof attachServerProcessControl>>
  const observations=createNetworkObservationSurface({local:()=>quantum?.observeDomains()??null,authorizePublisher:(request,server)=>quantum?.authorizeObservation(request,server)??false})
  const inFlight = new Set<Promise<unknown>>()
  const background = new Set<Promise<unknown>>()
  const sockets = new Set<Bun.ServerWebSocket<RpcSocketData>>()
  const sessions = new Set<{close(): Promise<void>; connected?: Promise<ConnectedReleasePeer>}>()
  const connected = new Set<ConnectedReleasePeer>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const abort = new AbortController()
  const cleanupFailures: unknown[] = []
  let preparingPeers = 0
  let update: {target: string; state: "receiving" | "handover" | "failed"; error?: string} | null = null

  function track<T>(work: Promise<T>, operations = inFlight): Promise<T> {
    operations.add(work)
    void work.then(() => operations.delete(work), () => operations.delete(work))
    return work
  }

  const authorized = (request: Request) => {
    if (!options.controlToken || options.controlToken.length < 24) return false
    const actual = createHash("sha256").update(request.headers.get("Authorization") ?? "").digest()
    const expected = createHash("sha256").update(`Bearer ${options.controlToken}`).digest()
    return timingSafeEqual(actual, expected)
  }

  async function handle(request: Request, current: Bun.Server<ReleaseServerSocketData>, rendezvous: RendezvousHandler | null): Promise<Response | undefined> {
    const url = new URL(request.url)
    if (url.pathname === "/peer") {
      return rendezvous ? rendezvous.upgrade(request, (request, data) => current.upgrade(request, {data}))
        : new Response(null, {status: 404})
    }
    if (url.pathname === "/sw") {
      const data=observations.data(request,current)
      if(data instanceof Response)return data
      if (current.upgrade(request, {data})) return
      return new Response("WebSocket upgrade required", {status: 426})
    }
    if (url.pathname === "/release/state") {
      if (!authorized(request)) return new Response(null, {status: 403})
      if (request.method !== "GET" || url.search) return new Response(null, {status: 405})
      return Response.json({digest: options.digest, version: identity.version, update, node: node?.snapshot()})
    }
    if (url.pathname === "/release/peer") {
      if (!authorized(request)) return new Response(null, {status: 403})
      if (request.method !== "POST" || url.search) return new Response(null, {status: 405})
      if (sessions.size + preparingPeers >= 8) return new Response(null, {status: 429})
      const offer = await jsonBody(request)
      if (!description(offer, "offer")) return new Response(null, {status: 400})
      if (sessions.size + preparingPeers >= 8) return new Response(null, {status: 429})
      let servingDigest: string | undefined
      let selection: ReturnType<typeof store.verifyCandidate> | undefined
      preparingPeers += 1
      const session = await acceptReleasePeer(offer, {
        async readGraph(digest) {
          if (!admitting) throw new Error("Release peer admission is closed")
          if (servingDigest && servingDigest !== digest) throw new Error("Release peer target is already selected")
          if (!servingDigest) {
            servingDigest = digest
            selection = store.verifyCandidate(digest)
          }
          return (await selection!).graph
        },
        async read(artifact) {
          if (!admitting || !servingDigest) throw new Error("Release peer has no admitted target")
          await selection
          // Соединение раздаёт только artifacts выбранного состава, не произвольные файлы.
          return Bun.file(await store.artifactPath(servingDigest, artifact)).stream()
        },
      }, {signal: abort.signal}).finally(() => { preparingPeers -= 1 })
      if (destroyed) { await session.close(); throw new Error("Release was destroyed during peer setup") }
      sessions.add(session)
      void session.connected.then(peer => {
        if (destroyed || !admitting) {
          return peer.close().finally(() => { sessions.delete(session) })
        }
        connected.add(peer)
        void peer.closed.then(async () => {
          await peer.close()
        }).catch(error => { cleanupFailures.push(error) }).finally(() => {
          connected.delete(peer)
          sessions.delete(session)
        })
      }, () => { sessions.delete(session) }).catch(error => { cleanupFailures.push(error) })
      return Response.json(session.answer)
    }
    if (url.pathname === "/release/update") {
      if (!authorized(request)) return new Response(null, {status: 403})
      if (request.method !== "POST" || url.search) return new Response(null, {status: 405})
      if (update && update.state !== "failed") return new Response(null, {status: 409})
      const input = await jsonBody(request)
      if (!updateRequest(input)) return new Response(null, {status: 400})
      if (update && update.state !== "failed") return new Response(null, {status: 409})
      update = {target: input.target, state: "receiving"}
      // HTTP acceptance завершается до quiesce: запрос не ждёт собственного handover.
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (!destroyed) void track(receive(input), background)
      }, 0)
      timers.add(timer)
      return Response.json({target: input.target, state: "accepted"}, {status: 202})
    }
    if (request.method === "GET" && options.staticRoot) {
      const path = url.pathname === "/" ? "index.html"
        : url.pathname === "/manifest.webmanifest" ? "manifest.json"
          : url.pathname.startsWith("/assets/") ? url.pathname.slice(1) : null
      if (path && !path.includes("%") && path.split("/").every(part => part && part !== "." && part !== ".." && !part.includes("\\"))) {
        const file = Bun.file(join(resolve(options.staticRoot), path))
        if (await file.exists()) return new Response(file)
      }
    }
    return await delivery.fetch(request)
  }

  async function receive(input: {target: string; source: string; token: string}) {
    let peer: ConnectedReleasePeer | undefined
    try {
      abort.signal.throwIfAborted()
      peer = await createConnectedReleasePeer(async (offer, {signal}) => {
        const response = await fetch(input.source, {
          method: "POST",
          headers: {"Content-Type": "application/json", Authorization: `Bearer ${input.token}`},
          body: JSON.stringify(offer),
          signal,
          redirect: "error",
        })
        if (!response.ok) throw new Error(`Release signaling returned ${response.status}`)
        const answer: unknown = await response.json()
        if (!description(answer, "answer")) throw new Error("Release signaling returned an invalid answer")
        return answer
      }, {signal: abort.signal})
      if (destroyed) throw new Error("Release was destroyed during connection")
      connected.add(peer)
      const receiver = createServerReleaseReceiver({
        store,
        async activate(digest) {
          update = {target: digest, state: "handover"}
          await peer!.peer.whenIdle()
          await control.requestHandover(digest)
        },
      })
      await receiver.update(input.target, peer.peer)
      if (!destroyed) update = null
    } catch (error) {
      if (!destroyed) update = {target: input.target, state: "failed", error: error instanceof Error ? error.message : String(error)}
    } finally {
      if (peer) {
        try { await peer.close() }
        catch (error) {
          cleanupFailures.push(error)
          if (!destroyed) update = {target: input.target, state: "failed", error: error instanceof Error ? error.message : String(error)}
        } finally { connected.delete(peer) }
      }
    }
  }

  control = await attachServerProcessControl({
    async bind() {
      if (destroyed || server) throw new Error("Installed server cannot bind")
      if (quantumOptions) quantum = await prepareQuantumRuntime(quantumOptions)
      const rendezvous = options.signalingToken ? createRendezvousHandler({token: options.signalingToken, relay: true}) : null
      const current = Bun.serve<ReleaseServerSocketData>({
        port,
        fetch(request, current) {
          const pathname = new URL(request.url).pathname
          if (quantum?.handles(pathname)) return quantum.fetch(request, current)
          if (options.quantum && rendezvous && pathname === "/peer")
            return rendezvous.upgrade(request, (request, data) => current.upgrade(request, {data}))
          if(pathname==="/sw"&&request.headers.get("X-Cosmos-Observation")==="publisher")return handle(request,current,rendezvous)
          if (!admitting) return new Response("release admission closed", {status: 503})
          return track(handle(request, current, rendezvous)).then(response => {
            if (!response) return
            response.headers.set("X-Cosmos-Release", options.digest)
            response.headers.set("X-Cosmos-Server-Version", identity.version)
            return response
          }).catch(error => new Response(null, {status: error instanceof ControlRequestError ? error.status : 500}))
        },
        websocket: {
          open(socket) {
            if (quantum?.owns(socket.data)) { quantum.websocket.open(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>); return }
            if (options.quantum && rendezvous?.owns(socket.data)) { rendezvous.websocket.open(socket); return }
            if ((!admitting && (socket.data as RpcSocketData).observation !== "publisher") || destroyed) { socket.close(1012, "release handover"); return }
            if (rendezvous?.owns(socket.data)) rendezvous.websocket.open(socket)
            else sockets.add(socket as Bun.ServerWebSocket<RpcSocketData>)
          },
          message(socket, message) {
            if (quantum?.owns(socket.data)) return quantum.websocket.message(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>, message)
            if (options.quantum && rendezvous?.owns(socket.data)) { rendezvous.websocket.message(socket, message); return }
            if ((socket.data as RpcSocketData).source === "release/service") {
              let value:unknown
              try{if((socket.data as RpcSocketData).observation === "publisher" && message.length>128*1024){socket.close(1008,"Observation limit");return};value=JSON.parse(String(message))}catch{}
              if(observations.message(socket as Bun.ServerWebSocket<RpcSocketData>,value))return
            }
            if (!admitting) { socket.close(1012, "release handover"); return }
            if (rendezvous?.owns(socket.data)) { rendezvous.websocket.message(socket, message); return }
            const work = Promise.resolve().then(() => {
              let value: unknown
              try { value = JSON.parse(typeof message === "string" ? message : message.toString()) }
              catch { socket.close(1008, "invalid release current"); return }
              const current = parseReleaseCurrentMessage(value)
              if (!current) { socket.close(1008, "invalid release current"); return }
              socket.send(JSON.stringify(releaseDeltaMessage(releaseDelta(delivery.desiredBrowserArtifacts(), current.current))))
            })
            void track(work)
          },
          close(socket, code, reason) {
            if (quantum?.owns(socket.data)) quantum.websocket.close(socket as Bun.ServerWebSocket<QuantumRuntimeSocketData>)
            else if (rendezvous?.owns(socket.data)) rendezvous.websocket.close(socket, code, reason)
            else {observations.close(socket as Bun.ServerWebSocket<RpcSocketData>);sockets.delete(socket as Bun.ServerWebSocket<RpcSocketData>)}
          },
        },
      })
      signaling = rendezvous
      server = current
      if (quantum) {
        try {await quantum.start(current.port!)} catch (error) {
          rendezvous?.close()
          await current.stop(true)
          server = null
          throw error
        }
        void quantum.failure.catch(async () => {
          admitting = false
          // Domain failure must become an observed process failure, including
          // when IPC would otherwise keep the stopped listener incarnation alive.
          try { await control.destroy() }
          finally { process.exit(1) }
        })
      }
      if (options.node && !options.quantum) {
        try {
          node = await startReleaseNode({config: options.node, observation:{async read(){return null},publish:snapshot=>observations.publish(snapshot)}, source: {
            async readGraph(digest) {
              if (!admitting || digest !== options.digest) throw new Error("Release composition is not admitted")
              return delivery.graph
            },
            async read(artifact) {
              if (!admitting) throw new Error("Release admission is closed")
              return Bun.file(await store.artifactPath(options.digest, artifact)).stream()
            },
          }})
        } catch (error) {
          await quantum?.close()
          rendezvous?.close()
          await current.stop(true)
          server = null
          throw error
        }
      }
    },
    async admit() {
      if (destroyed || !server) throw new Error("Installed server is not bound")
      admitting = true
    },
    async quiesce() {
      admitting = false
      await node?.whenIdle()
      await quantum?.dark.quiesce()
      while (inFlight.size > 0) await Promise.allSettled([...inFlight])
      await Promise.all([...connected].map(session => session.peer.whenIdle()))
    },
    async resume() {
      if (destroyed || !server) throw new Error("Installed server cannot resume")
      await quantum?.dark.resume()
      admitting = true
    },
    async unbind() {
      if (admitting || !server) throw new Error("Installed server must quiesce before unbind")
      await node?.close()
      node = undefined
      await quantum?.close()
      quantum = undefined
      signaling?.close()
      signaling = null
      for (const socket of sockets) socket.close(1012, "release handover")
      await server.stop()
      server = null
    },
    async destroy() {
      destroyed = true
      admitting = false
      abort.abort(new Error("Installed release destroyed"))
      observations.destroy()
      const ownedNode = node
      node = undefined
      const ownedQuantum = quantum
      const ownedSignaling = signaling
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      const closes = [...sessions, ...connected].map(session => session.close())
      if (ownedNode) closes.push(ownedNode.close())
      const externalClosing = Promise.allSettled(closes)
      try {
        // Native stopping is a Meta input: its Oracle/Force handlers and listener
        // must remain reachable until that causal work and domain cleanup finish.
        await ownedQuantum?.close()
      } catch (error) {cleanupFailures.push(error)}
      finally {
        ownedSignaling?.close()
        if (signaling === ownedSignaling) signaling = null
        if (quantum === ownedQuantum) quantum = undefined
        const ownedServer = server
        server = null
        if (ownedServer) {
          try {await ownedServer.stop(true)} catch (error) {cleanupFailures.push(error)}
        }
      }
      // Pending setup принадлежит принятым handlers/receive, даже если peer ещё не появился.
      const [closed] = await Promise.all([
        externalClosing,
        Promise.allSettled([...inFlight, ...background]),
      ])
      for (const result of closed) if (result.status === "rejected") cleanupFailures.push(result.reason)
      sessions.clear()
      connected.clear()
      if (cleanupFailures.length > 0) throw new AggregateError(cleanupFailures, "Installed release resources did not close cleanly")
    },
  })
  try {
    await control.bound
    if (!server) throw new Error("Installed server was destroyed during binding")
    return server
  } catch (error) {
    // The control operation has reported its failure before this gate rejects.
    // Cleanup runs outside that operation's queue, so it may await the queue
    // without waiting on itself; the entrypoint retains the original failure.
    try {await control.destroy()}
    catch (cleanup) {throw new AggregateError([error, cleanup], "Installed server binding and cleanup failed")}
    throw error
  }
}

async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim() !== "application/json") throw new ControlRequestError(415)
  const reader = request.body?.getReader()
  if (!reader) throw new ControlRequestError(400)
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.byteLength
      if (size > 65_536) throw new ControlRequestError(413)
      chunks.push(item.value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString()) }
    catch { throw new ControlRequestError(400) }
  } catch (error) { await reader.cancel(error).catch(() => {}); throw error }
  finally { reader.releaseLock() }
}

class ControlRequestError extends Error {
  constructor(readonly status: 400 | 413 | 415) { super("Invalid release control request") }
}

function description(value: unknown, type: "offer" | "answer"): value is ReleasePeerDescription {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  return Object.keys(input).length === 2 && input.type === type && typeof input.sdp === "string" && input.sdp.length <= 60_000
}

function updateRequest(value: unknown): value is {target: string; source: string; token: string} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const input = value as Record<string, unknown>
  if (Object.keys(input).length !== 3 || typeof input.target !== "string" || !/^[a-f0-9]{64}$/.test(input.target) ||
    typeof input.source !== "string" || typeof input.token !== "string" || input.token.length < 24 || input.token.length > 4096) return false
  try {
    const url = new URL(input.source)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash
  } catch { return false }
}
