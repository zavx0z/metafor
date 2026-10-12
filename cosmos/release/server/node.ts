import {constants} from "node:fs"
import {lstat, open} from "node:fs/promises"
import {dirname, isAbsolute, join, relative, resolve, sep} from "node:path"
import participant from "./participant"
import {observeReleasePeers} from "./peer-observation"
import {isMetaPackageName} from "@metafor/types/metafor/graph"
import type {PeerSnapshot} from "@metafor/tech-peer"
import {createReleasePeer, type ReleaseDataChannelPort, type ReleasePeer} from "./peer"
import type {ReleaseNode, ReleaseNodeConfiguration, ReleaseNodeDependencies, ReleaseNodeOptions} from "./node-contract"

export type {ReleaseNode, ReleaseNodeConfiguration, ReleaseNodeDependencies, ReleaseNodeOptions} from "./node-contract"

const CHANNEL = "cosmos.release.v1"
const MAX_FRAME = 16_384
const MAX_QUEUE = 256 * 1024
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const invalid = () => new Error("Invalid private release node configuration")

/** Scoped native WS proxy; loopback stays direct and process-wide network settings are unchanged. */
export const createReleaseWebSocketFactory = participant.webSocketFactory
/** Reads one bounded owner-only credential file; no credential enters transport snapshots. */
export const readReleaseNodeToken = participant.readToken

function configuration(value: unknown, baseDirectory?: string): ReleaseNodeConfiguration {
  try {
    if (!record(value)) throw invalid()
    const {sources, ...network} = value
    const config = participant.configuration(network, baseDirectory)
    if (sources !== undefined && (!Array.isArray(sources) || sources.length > 64
      || !sources.every(src => isMetaPackageName(src))
      || new Set(sources).size !== sources.length)) throw invalid()
    return {...config, ...(sources === undefined ? {} : {sources: [...sources] as string[]})}
  } catch {throw invalid()}
}

async function privateBytes(path: string, limit: number): Promise<Uint8Array> {
  let file: Awaited<ReturnType<typeof open>> | undefined
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    const info = await file.stat()
    if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > limit) throw invalid()
    const bytes = Buffer.alloc(limit + 1)
    let size = 0
    while (size < bytes.byteLength) {
      const read = await file.read(bytes, size, bytes.byteLength - size, null)
      if (!read.bytesRead) break
      size += read.bytesRead
    }
    if (size > limit) throw invalid()
    return bytes.subarray(0, size)
  } catch {throw invalid()}
  finally {await file?.close()}
}

async function massFile(path: string, massRoot: string): Promise<void> {
  if (!isAbsolute(path)) throw invalid()
  const root = resolve(massRoot)
  const suffix = relative(root, resolve(path))
  if (!suffix || suffix === ".." || suffix.startsWith(`..${sep}`) || isAbsolute(suffix)) throw invalid()
  let current = root
  const rootStat = await lstat(current)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw invalid()
  const parts = suffix.split(sep)
  for (const [index, part] of parts.entries()) {
    current = join(current, part)
    const stat = await lstat(current)
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw invalid()
  }
}

/** Quantum bootstrap scopes both private files to its selected Mass root; standalone configuration remains explicit. */
export async function readReleaseNodeConfiguration(path: string, options: {massRoot?: string} = {}): Promise<ReleaseNodeConfiguration> {
  try {
    if (options.massRoot) await massFile(path, options.massRoot)
    const config = configuration(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(await privateBytes(path, 64 * 1024))), dirname(resolve(path)))
    if (options.massRoot) await massFile(config.tokenFile, options.massRoot)
    return config
  }
  catch {throw invalid()}
}

type Handlers = Parameters<ReleaseDataChannelPort["subscribe"]>[0]
type Link = {generation: string, peer: ReleasePeer, handlers: Set<Handlers>, closed: boolean, queued: number}

/**
Создаёт [release peer](../README.md) на одной reconnect signaling/routed сети.
Публикует только source caller и только allowed peers; физическая сеть принадлежит release.
Protocol graph/artifact полностью принадлежит
createReleasePeer. Port адаптирует bounded синхронную очередь к async network.send,
не создавая второй RTC или transport. [Проверки](../spec/node.spec.ts).
*/
export async function startReleaseNode(options: ReleaseNodeOptions, dependencies: ReleaseNodeDependencies = {}): Promise<ReleaseNode> {
  const config = configuration(options.config)
  const networkConfig = {...config}
  delete networkConfig.sources
  const owned = await participant({config: networkConfig}, dependencies)
  const network = owned.network
  const allowed = new Set(config.allowedPeers)
  const observation = observeReleasePeers(network, allowed, options.observation)
  let stopping = false
  let closing: Promise<void> | undefined
  const links = new Map<string, Link>()
  const sending = new Set<Promise<void>>()
  const retired = new Set<Promise<void>>()
  let offData = () => {}
  let offState = () => {}
  const retire = (peerId: string, reason = new Error("Release peer generation disconnected")) => {
    const link = links.get(peerId)
    if (!link) return
    links.delete(peerId)
    link.peer.close(reason)
    link.closed = true
    for (const handler of [...link.handlers]) handler.close()
    link.handlers.clear()
    const work = link.peer.whenIdle()
    retired.add(work)
    void work.finally(() => retired.delete(work)).catch(() => {})
  }
  const attach = (peerId: string, generation: string): ReleasePeer => {
    const existing = links.get(peerId)
    if (existing?.generation === generation) return existing.peer
    retire(peerId)
    let link: Link
    const handlers = new Set<Handlers>()
    const port: ReleaseDataChannelPort = {
      get readyState() {return link?.closed ? "closed" : "open"},
      get bufferedAmount() {return link?.queued ?? 0},
      maxMessageSize: MAX_FRAME,
      send(frame) {
        if (link.closed || stopping) throw new Error("Release peer generation disconnected")
        if (!network.snapshot().links.some(item => item.peerId === peerId && item.generation === generation && item.state === "open")) throw new Error("Release peer generation disconnected")
        if (frame.byteLength > MAX_FRAME || link.queued + frame.byteLength > MAX_QUEUE) throw new Error("Release peer queue limit")
        const owned = Uint8Array.from(frame)
        link.queued += owned.byteLength
        const work = network.send(peerId, owned, {channel: CHANNEL})
        sending.add(work)
        void work.then(() => {
          link.queued -= owned.byteLength
          for (const handler of handlers) handler.bufferedAmountLow()
        }, () => {
          link.queued -= owned.byteLength
          if (links.get(peerId) === link) retire(peerId)
        }).finally(() => sending.delete(work)).catch(() => {})
      },
      subscribe(handler) {handlers.add(handler)
        return () => {handlers.delete(handler)}},
    }
    const peer = createReleasePeer(port)
    link = {generation, peer, handlers, closed: false, queued: 0}
    links.set(peerId, link)
    peer.serve(options.source)
    return peer
  }
  const refresh = (snapshot: PeerSnapshot) => {
    if (stopping) return
    for (const [peerId, link] of links) {
      if (!snapshot.links.some(item => item.peerId === peerId && item.generation === link.generation && item.state === "open")) retire(peerId)
    }
    for (const link of snapshot.links) {
      if (!allowed.has(link.peerId)) continue
      if (link.state === "open") attach(link.peerId, link.generation)
    }
  }
  const close = () => closing ??= (async () => {
    stopping = true
    offData()
    offState()
    observation.close()
    for (const peerId of [...links.keys()]) retire(peerId)
    try {await owned.close()} finally {await Promise.allSettled([...sending, ...retired])}
  })()
  try {
    const runningNetwork = network
    offData = runningNetwork.onData(event => {
      if (stopping || event.channel !== CHANNEL) return
      if (!allowed.has(event.peerId)) return
      const link = links.get(event.peerId)
      if (!link || link.closed) return
      if (!(event.data instanceof Uint8Array) || event.data.byteLength > MAX_FRAME) {retire(event.peerId)
        return}
      for (const handler of [...link.handlers]) handler.message(event.data)
    })
    offState = runningNetwork.subscribe(refresh)
    refresh(runningNetwork.snapshot())
    return {
      id: config.id, network: runningNetwork,
      async peer(peerId) {
        if (stopping || !allowed.has(peerId)) throw new Error("Release peer is not authorized")
        await runningNetwork.connect(peerId)
        if (stopping) throw new Error("Release node closed")
        const link = runningNetwork.snapshot().links.find(link => link.peerId === peerId && link.state === "open")
        if (!link) throw new Error("Release peer is unavailable")
        return attach(peerId, link.generation)
      },
      snapshot: owned.snapshot,
      observe: observation.snapshot,
      refreshObservation: observation.refresh,
      async whenIdle() {
        await Promise.all([...links.values()].map(link => link.peer.whenIdle()).concat([...retired]))
      },
      close,
    }
  } catch {
    await close().catch(() => {})
    throw new Error("Release node startup failed")
  }
}
