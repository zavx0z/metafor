/**
Dark adapter binds already admitted domain peers to OracleRouter/ForceLifecycle.
Native DC readiness never admits a Force domain: explicit hydrated force.open
does. Receipt preparation and canonical applied acknowledgements stay in the
existing Oracle sideband. No network, listener, child or world policy is created.
[Force law](../../../docs/FORCE.md), tests in peer.spec.ts.
@packageDocumentation
*/
import type {PeerNetwork} from "@metafor/tech-peer"
import {createPeerOracleChannelRegistry} from "shared/transport/oracle/peer-channel"
import {PEER_FORCE_CHANNEL, PEER_FORCE_CONTROL, readPeerForce} from "shared/transport/force/peer"
import {PeerLaneQueue, peerGeneration} from "shared/transport/peer-lane"
import type {OracleRouter} from "../oracle/router"
import type {ForceLifecycle} from "./lifecycle"
import type {ForceChannel, RemoteForceDomain} from "./store"

/** Composition supplies fixed peerId/domain bindings within one incarnation, never federation routes. */
export function createDomainPeerChannels(options: {network: PeerNetwork, identities: ReadonlyMap<string, RemoteForceDomain>, router: OracleRouter,
  lifecycle: Pick<ForceLifecycle, "channelReady" | "channelDestroyed" | "acceptParticle">, maxQueuedBytes?: number}) {
  const identities = new Map(options.identities)
  if (new Set(identities.values()).size !== identities.size || [...identities.values()].some(domain => !["boundary", "matrix", "energy", "bulk"].includes(domain))) throw new Error("Invalid domain peer bindings")
  const ready = new Map<string, string>()
  const opening = new Map<string, string>()
  const queues = new Map<string, PeerLaneQueue>()
  const receiving = new Set<Promise<void>>()
  let closed = false
  const fail = (peerId: string, reason: Error) => {
    const domain = identities.get(peerId)
    ready.delete(peerId)
    opening.delete(peerId)
    queues.get(peerId)?.close()
    queues.delete(peerId)
    if (domain && !closed) options.lifecycle.channelDestroyed(domain, reason)
  }
  const oracle = createPeerOracleChannelRegistry({network: options.network, identities,
    opened: channel => options.router.attach(channel), closed(channel) {
      options.router.detach(channel)
      const peerId = [...identities].find(([, domain]) => domain === channel.identity)?.[0]
      if (peerId) fail(peerId, new Error("Domain Oracle peer closed"))
    }, failed: fail})
  const channels = Object.create(null) as Partial<Record<RemoteForceDomain, ForceChannel>>
  for (const [peerId, domain] of identities) channels[domain] = {domain, send(message) {
    const queue = queues.get(peerId)
    if (closed || !queue || ready.get(peerId) !== peerGeneration(options.network, peerId)) throw new Error(`Force domain peer not ready: ${domain}`)
    // Validate one Particle without rewriting its already accepted origin.
    const payload = JSON.stringify(message)
    readPeerForce(payload)
    void queue.enqueue(payload).catch(() => {})
  }}
  const offData = options.network.onData(event => {
    if (closed || !identities.has(event.peerId)) return
    const domain = identities.get(event.peerId)!
    const work = (async () => {
      if (event.physicalChannel === "oracle" && event.channel === PEER_FORCE_CONTROL) {
        const value = typeof event.data === "string" ? JSON.parse(event.data) : null
        const generation = peerGeneration(options.network, event.peerId)
        if (value?.kind === "force.close") {fail(event.peerId, new Error("Domain Force peer closed")); return}
        if (!value || (value.kind !== "force.open" && value.kind !== "force.ready") || !generation || !oracle.has(event.peerId)) throw new Error("Force peer opened before Oracle hydration binding")
        if (value.kind === "force.open") {
          opening.set(event.peerId, generation)
          await options.network.send(event.peerId, JSON.stringify({kind: "force.opened"}), {physicalChannel: "oracle", channel: PEER_FORCE_CONTROL})
          return
        }
        if (opening.get(event.peerId) !== generation) throw new Error("Force peer ready before opening")
        if (!ready.has(event.peerId)) {
          ready.set(event.peerId, generation)
          queues.set(event.peerId, new PeerLaneQueue({network: options.network, peerId: event.peerId, physicalChannel: "force", channel: PEER_FORCE_CHANNEL}, options.maxQueuedBytes ?? 64 * 1024 * 1024,
            error => fail(event.peerId, error)))
          options.lifecycle.channelReady(domain)
        }
        await options.network.send(event.peerId, JSON.stringify({kind: "force.active"}), {physicalChannel: "oracle", channel: PEER_FORCE_CONTROL})
      } else if (event.physicalChannel === "force" && event.channel === PEER_FORCE_CHANNEL) {
        if (!ready.has(event.peerId)) throw new Error("Force peer not opened")
        const decision = await options.lifecycle.acceptParticle(domain, readPeerForce(event.data, domain))
        if (!decision.ok) throw new Error(decision.error)
      }
    })().catch(error => fail(event.peerId, error instanceof Error ? error : new Error("Domain peer receive failed")))
    receiving.add(work)
    void work.finally(() => receiving.delete(work))
  })
  const offState = options.network.subscribe(() => {for (const [peerId, generation] of ready) if (peerGeneration(options.network, peerId) !== generation) fail(peerId, new Error("Domain peer generation closed"))})
  return {channels, async whenIdle() {
    do {await Promise.all([...receiving, ...[...queues.values()].map(queue => queue.whenIdle())])} while (receiving.size > 0)
  }, close() {
    if (closed) return
    for (const peerId of [...ready.keys()]) fail(peerId, new Error("Domain peer adapter closed"))
    closed = true
    offData(); offState(); oracle.close()
  }}
}
