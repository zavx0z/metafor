/**
OracleChannel over one injected peer network's oracle DC. Opening advertises
methods only; source identity on the host comes from its peerId binding. The
network and its force DC remain caller-owned. No listener or RPC policy is added.
[Oracle routing](../../../docs/FORCE.md), [adapter checks](../../../quantum/dark/force/peer.spec.ts).
@packageDocumentation
*/
import type {PeerNetwork} from "@metafor/tech-peer"
import {ORACLE_RPC_VERSION, isOracleRpcCall, isOracleRpcResponse, isRoutedOracleRpcCall, type OracleRpcMessage} from "../../protocol/oracle/rpc"
import {OracleChannelEvents, normalizeOracleIdentity, type OracleChannel} from "./channel"
import {PeerLaneQueue, peerGeneration} from "../peer-lane"

export const PEER_ORACLE_CHANNEL = "quantum.oracle.v1"
export const PEER_ORACLE_MAX_BYTES = 32 * 1024 * 1024
const methods = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.length > 512 || !value.every(item => typeof item === "string" && item.trim().length > 0 && item.length <= 256)) throw new Error("Invalid Oracle peer methods")
  return [...new Set(value.map(item => item.trim()))].sort()
}
const rpcMessage = (value: unknown): value is OracleRpcMessage => isOracleRpcCall(value) || isOracleRpcResponse(value) || isRoutedOracleRpcCall(value)
const decode = (payload: string | Uint8Array): Record<string, unknown> => {
  if (typeof payload !== "string" || new TextEncoder().encode(payload).byteLength > PEER_ORACLE_MAX_BYTES) throw new Error("Invalid Oracle peer payload")
  const value: unknown = JSON.parse(payload)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Oracle peer frame")
  return value as Record<string, unknown>
}
function capacity(network: PeerNetwork) {
  if ((network.maxMessageBytes ?? 16 * 1024 * 1024) < PEER_ORACLE_MAX_BYTES) throw new Error("Oracle peer requires explicit 32 MiB message capacity")
}

/** Client opens before hydration; close affects this channel, never the injected network. */
export class PeerOracleTransport {
  readonly channel: OracleChannel
  readonly identity: string
  readonly #events = new OracleChannelEvents()
  readonly #queue: PeerLaneQueue
  readonly #off: (() => void)[] = []
  #methods: string[] = []
  #generation: string | undefined
  #closed = false
  #opening: Promise<OracleChannel> | undefined
  #opened: {resolve(): void, reject(error: unknown): void} | undefined
  constructor(private readonly options: {network: PeerNetwork, peerId: string, identity: string, onFailure?(error: Error): void, maxQueuedBytes?: number}) {
    capacity(options.network)
    this.identity = normalizeOracleIdentity(options.identity)
    this.#queue = new PeerLaneQueue({...options, physicalChannel: "oracle", channel: PEER_ORACLE_CHANNEL}, options.maxQueuedBytes ?? PEER_ORACLE_MAX_BYTES * 2, error => this.#fail(error))
    const self = this
    this.channel = {identity: this.identity, get methods() {return self.#methods},
      send(message) {if (!rpcMessage(message)) return Promise.reject(new Error("Invalid Oracle peer message")); return self.#queue.enqueue(JSON.stringify(message))},
      subscribe: listener => self.#events.subscribe(listener), close: () => self.close()}
    this.#off.push(options.network.onData(event => {
      if (event.peerId !== options.peerId || event.physicalChannel !== "oracle" || event.channel !== PEER_ORACLE_CHANNEL || this.#closed) return
      try {
        const value = decode(event.data)
        if (value.kind === "oracle.opened" && value.version === ORACLE_RPC_VERSION && value.identity === this.identity) {this.#opened?.resolve(); return}
        if (value.kind === "oracle.closed") {this.#fail(new Error("Oracle peer closed")); return}
        if (!rpcMessage(value)) throw new Error("Invalid Oracle peer message")
        void this.#events.emit(value).catch(error => this.#fail(error instanceof Error ? error : new Error("Oracle peer receive failed")))
      } catch (error) {this.#fail(error instanceof Error ? error : new Error("Oracle peer receive failed"))}
    }))
    this.#off.push(options.network.subscribe(() => {
      if (this.#generation && peerGeneration(options.network, options.peerId) !== this.#generation) this.#fail(new Error("Oracle peer generation closed"))
    }))
  }
  /** waitMs bounds the opening acknowledgement after bounded PeerNetwork.connect; no automatic command retries. */
  open(options: {methods?: readonly string[], waitMs?: number} = {}): Promise<OracleChannel> {
    if (this.#closed) return Promise.reject(new Error("Oracle peer is closed"))
    if (!Number.isSafeInteger(options.waitMs ?? 30_000) || (options.waitMs ?? 30_000) < 1) return Promise.reject(new Error("Oracle peer opening timeout is invalid"))
    this.#opening ??= (async () => {
      this.#methods = methods(options.methods ?? [])
      await this.options.network.connect(this.options.peerId)
      if (this.#closed) throw new Error("Oracle peer is closed")
      this.#generation = peerGeneration(this.options.network, this.options.peerId)
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const ready = new Promise<void>((resolve, reject) => {this.#opened = {resolve, reject}; timer = setTimeout(() => reject(new Error("Oracle peer opening timed out")), options.waitMs ?? 30_000)})
        void ready.catch(() => {})
        await this.#queue.enqueue(JSON.stringify({kind: "oracle.open", version: ORACLE_RPC_VERSION, identity: this.identity, methods: this.#methods}))
        await ready
        return this.channel
      } finally {clearTimeout(timer); this.#opened = undefined}
    })()
    return this.#opening
  }
  async close(): Promise<void> {
    if (!this.#closed && this.#generation) {try {void this.#queue.enqueue(JSON.stringify({kind: "oracle.close"})).catch(() => {})} catch {}}
    this.#dispose(new Error("Oracle peer is closed"))
  }
  #fail(error: Error) {if (this.#closed) return; this.#dispose(error); this.options.onFailure?.(error)}
  #dispose(error: Error) {
    this.#closed = true
    this.#opened?.reject(error)
    this.#queue.close()
    for (const off of this.#off.splice(0)) off()
    this.#events.clear()
  }
}

/** Host binds admitted peer IDs to identities before receiving any payload. */
export function createPeerOracleChannelRegistry(options: {network: PeerNetwork, identities: ReadonlyMap<string, string>, opened(channel: OracleChannel): void, closed(channel: OracleChannel): void, failed(peerId: string, error: Error): void}) {
  capacity(options.network)
  const sessions = new Map<string, {generation: string, channel: OracleChannel, events: OracleChannelEvents, queue: PeerLaneQueue}>()
  let closed = false
  const remove = (peerId: string) => {
    const session = sessions.get(peerId)
    if (!session) return
    sessions.delete(peerId)
    session.queue.close()
    session.events.clear()
    options.closed(session.channel)
  }
  const offData = options.network.onData(event => {
    if (closed || event.physicalChannel !== "oracle" || event.channel !== PEER_ORACLE_CHANNEL) return
    void (async () => {
      const identity = options.identities.get(event.peerId)
      const generation = peerGeneration(options.network, event.peerId)
      if (!identity || !generation) throw new Error("Oracle peer is not bound")
      const value = decode(event.data)
      let session = sessions.get(event.peerId)
      if (value.kind === "oracle.close") {remove(event.peerId); return}
      if (value.kind === "oracle.open") {
        if (value.version !== ORACLE_RPC_VERSION || value.identity !== identity) throw new Error("Oracle peer identity differs")
        const exposed = methods(value.methods)
        if (session) throw new Error("Oracle peer already opened")
        const events = new OracleChannelEvents()
        const queue = new PeerLaneQueue({network: options.network, peerId: event.peerId, physicalChannel: "oracle", channel: PEER_ORACLE_CHANNEL}, PEER_ORACLE_MAX_BYTES * 2,
          error => {remove(event.peerId); options.failed(event.peerId, error)})
        const channel: OracleChannel = {identity, methods: exposed, send(message) {
          if (!rpcMessage(message)) return Promise.reject(new Error("Invalid Oracle peer message"))
          return queue.enqueue(JSON.stringify(message))
        }, subscribe: listener => events.subscribe(listener), async close() {remove(event.peerId)}}
        session = {generation, events, queue, channel}
        sessions.set(event.peerId, session)
        options.opened(channel)
        await queue.enqueue(JSON.stringify({kind: "oracle.opened", version: ORACLE_RPC_VERSION, identity}))
        return
      }
      if (!session || session.generation !== generation || !rpcMessage(value)) throw new Error("Oracle peer is not opened")
      await session.events.emit(value)
    })().catch(error => {remove(event.peerId); options.failed(event.peerId, error instanceof Error ? error : new Error("Oracle peer receive failed"))})
  })
  const offState = options.network.subscribe(() => {for (const [peerId, session] of sessions) if (peerGeneration(options.network, peerId) !== session.generation) remove(peerId)})
  return {has(peerId: string) {return sessions.has(peerId)}, close() {closed = true; offData(); offState(); for (const peerId of [...sessions.keys()]) remove(peerId)}}
}
