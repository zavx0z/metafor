import {createRoutedPeerNetwork, type PeerNetwork, type PeerSnapshot} from "@metafor/tech-peer"
import {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import {createWeriftPeerConnectionFactory} from "@metafor/tech-peer/werift"
import type {ReleaseParticipant as Peer} from "./participant/contract"
import {configuration, readConfiguration, readToken, MAX_PEERS} from "./participant/configuration"
import {webSocketFactory} from "./participant/websocket"

export type {ReleaseParticipant} from "./participant/contract"

/**
Release owns one physical RTC/signaling participant, reconnect and allowed peers.
The caller retains admission and resource lifecycle. Native proxy selection is
scoped to owned external WebSockets; loopback remains direct. Secrets never enter
snapshots. [Owner](../README.md#знакомство-участников), [checks](../spec/participant.spec.ts).
*/
export default Object.assign(async function startPeerParticipant(input: Peer.Input, dependencies: Peer.Slots = {}): Promise<Peer.Output> {
  const config = configuration(input.config)
  const token = await readToken(config)
  const allowed = new Set(config.allowedPeers)
  const signaling = await (dependencies.connect ?? connectWebSocketSignaling)({url: config.signalingUrl, id: config.id,
    token, relay: true, reconnect: true, socketFactory: webSocketFactory(config.webSocketProxyUrl)})
  let network: PeerNetwork | undefined
  let stopping = false
  let closing: Promise<void> | undefined
  const connecting = new Map<string, Promise<void>>()
  const rejecting = new Set<string>()
  let offState = () => {}
  const refresh = (snapshot: PeerSnapshot) => {
    if (stopping) return
    for (const link of snapshot.links) {
      if (allowed.has(link.peerId) || rejecting.has(link.peerId)) continue
      rejecting.add(link.peerId)
      void network!.disconnect(link.peerId).catch(() => {}).finally(() => rejecting.delete(link.peerId))
    }
    for (const peerId of snapshot.peers) {
      if (!allowed.has(peerId) || connecting.has(peerId) || snapshot.links.some(link => link.peerId === peerId)) continue
      const work = network!.connect(peerId)
      connecting.set(peerId, work)
      void work.catch(() => {}).finally(() => connecting.delete(peerId))
    }
  }
  const close = () => closing ??= (async () => {
    stopping = true
    offState()
    try {await network?.close()} finally {
      signaling.close()
      await Promise.allSettled([...connecting.values()])
    }
  })()
  try {
    network = (dependencies.network ?? createRoutedPeerNetwork)({id: config.id, bootstrap: signaling,
      rtc: dependencies.rtc ?? createWeriftPeerConnectionFactory({
        ...(config.rtc?.ipv4 === undefined ? {} : {iceUseIpv4: config.rtc.ipv4}),
        ...(config.rtc?.ipv6 === undefined ? {} : {iceUseIpv6: config.rtc.ipv6}),
      }),
      iceServers: config.iceServers ?? [{urls: "stun:stun.l.google.com:19302"}], maxPeers: MAX_PEERS, maxQueuedBytes: 512 * 1024})
    const ownedNetwork = network
    offState = ownedNetwork.subscribe(refresh)
    refresh(ownedNetwork.snapshot())
    return {id: config.id, network: ownedNetwork, snapshot() {
      const snapshot = ownedNetwork.snapshot()
      return {...snapshot, peers: snapshot.peers.filter(id => allowed.has(id)), links: snapshot.links.filter(link => allowed.has(link.peerId))}
    }, close}
  } catch {
    await close().catch(() => {})
    throw new Error("Peer participant startup failed")
  }
}, {configuration, readConfiguration, readToken, webSocketFactory})
