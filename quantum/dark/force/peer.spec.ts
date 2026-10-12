import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createPeerNetwork, type PeerData, type PeerNetwork, type PeerSnapshot} from "@metafor/tech-peer"
import {createWeriftPeerConnectionFactory} from "@metafor/tech-peer/werift"
import {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {PeerOracleTransport} from "shared/transport/oracle/peer-channel"
import {PeerForce} from "shared/transport/force/peer"
import {installForceCheckpointSideband, uninstallForceCheckpointSideband} from "shared/transport/force/checkpoint"
import {OracleRpcPeer} from "shared/transport/oracle"
import type {SourcedForceMessage} from "shared/protocol/force/message"
import {createDomainPeerChannels} from "./peer"
import {ForceLifecycle, type ForceCheckpointTransfer} from "./lifecycle"
import {DarkCheckpointControl} from "../checkpoint/control"
import {OracleRouter} from "../oracle/router"
import {createLocalOracleChannelPair} from "../oracle/local"

async function until(check: () => boolean) {
  const deadline = Date.now() + 3000
  while (!check()) {if (Date.now() > deadline) throw new Error("Domain peer condition timed out"); await Bun.sleep(5)}
}
function fixture(host: PeerNetwork, domain: PeerNetwork, maxQueuedBytes = 1024 * 1024, checkpoint?: (rpc: OracleRpcPeer) => ForceCheckpointTransfer) {
  const accepted: unknown[] = []
  const delivered: SourcedForceMessage[] = []
  const router = new OracleRouter()
  let rpc!: OracleRpcPeer
  const local = createLocalOracleChannelPair("dark", () => rpc.methods())
  rpc = new OracleRpcPeer(local.peer)
  const applied = Promise.withResolvers<void>()
  let waiting = false
  const lifecycle = new ForceLifecycle({accept(particle) {accepted.push(particle); return {sequence: accepted.length, id: `test:${accepted.length}`} as never}}, checkpoint?.(rpc) ?? {
    pendingDeliveries: () => [], recordAccepted: () => [], async prepare() {}, acceptedFrom() {},
    async waitApplied() {waiting = true; await applied.promise},
  }, ["dark", "boundary", "matrix", "energy"])
  router.attach(local.router)
  const adapter = createDomainPeerChannels({network: host, identities: new Map([[domain.id, "boundary"]]), router, lifecycle, maxQueuedBytes})
  lifecycle.start({...adapter.channels, dark: {domain: "dark", send(message) {delivered.push(message)}},
    matrix: {domain: "matrix", send() {}}, energy: {domain: "energy", send() {}}})
  lifecycle.channelReady("dark")
  lifecycle.channelReady("matrix")
  lifecycle.channelReady("energy")
  const failures: Error[] = []
  const oracle = new PeerOracleTransport({network: domain, peerId: host.id, identity: "boundary", onFailure: error => failures.push(error)})
  const domainRpc = new OracleRpcPeer(oracle.channel)
  domainRpc.expose("fixture.echo", (params, context) => ({params, source: context.source}))
  let force: PeerForce | undefined
  return {rpc, oracle, domainRpc, lifecycle, adapter, accepted, delivered, applied, failures, waiting: () => waiting,
    force() {return force ??= new PeerForce("boundary", {network: domain, peerId: host.id, onFailure: error => failures.push(error)})},
    async close() {applied.resolve(); await force?.close(); domainRpc.close(); await oracle.close(); adapter.close(); rpc.close(); await local.peer.close()}}
}

function fakePair() {
  const listeners = [new Set<(data: PeerData) => void>(), new Set<(data: PeerData) => void>()]
  const states = [new Set<(state: PeerSnapshot) => void>(), new Set<(state: PeerSnapshot) => void>()]
  const open = [true, true]
  let failForce = false
  let held = false
  const release = Promise.withResolvers<void>()
  const make = (index: number): PeerNetwork => {
    const remote = 1 - index
    const id = index === 0 ? "dark-peer" : "boundary-peer"
    const peerId = index === 0 ? "boundary-peer" : "dark-peer"
    const snapshot = (): PeerSnapshot => ({id, peers: [peerId], bootstrap: false, links: open[index] && open[remote] ? [{peerId, generation: "same-incarnation", state: "open", channels: [{name: "oracle", state: "open"}, {name: "force", state: "open"}]}] : []})
    return {id, maxMessageBytes: 32 * 1024 * 1024, snapshot, async connect() {}, async send(_peer, payload, options = {}) {
      if (options.physicalChannel === "force") {
        if (failForce) throw new Error("Injected asynchronous Force send failure")
        if (held) await release.promise
      }
      if (!open[index] || !open[remote]) throw new Error("Fake generation closed")
      for (const listener of listeners[remote]!) listener({peerId: id, data: payload, channel: options.channel ?? "app", physicalChannel: options.physicalChannel ?? "oracle"})
    }, onData(listener) {listeners[index]!.add(listener); return () => {listeners[index]!.delete(listener)}},
    subscribe(listener) {states[index]!.add(listener); return () => {states[index]!.delete(listener)}}, async disconnect() {}, closeBootstrap() {}, async close() {
      open[index] = false
      for (const callbacks of states) for (const callback of callbacks) callback(snapshot())
    }}
  }
  return {host: make(0), domain: make(1), hold() {held = true}, release() {held = false; release.resolve()}, fail() {failForce = true}}
}

test("native two-DC domain link opens Oracle before hydrated Force and preserves messages above 16 MiB", async () => {
  const broker = createRendezvousServer({token: "test-only-native-domain-peer-room"})
  const rtc = createWeriftPeerConnectionFactory({iceAdditionalHostAddresses: ["127.0.0.1"], iceUseIpv4: true, iceUseIpv6: false,
    iceInterfaceAddresses: {udp4: "127.0.0.1"}, iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1"})
  const options = {rtc, dataChannels: ["oracle", "force"], maxMessageBytes: 32 * 1024 * 1024}
  const host = createPeerNetwork({...options, id: "dark-peer", bootstrap: await connectWebSocketSignaling({url: broker.url, id: "dark-peer", token: "test-only-native-domain-peer-room"})})
  const domain = createPeerNetwork({...options, id: "boundary-peer", bootstrap: await connectWebSocketSignaling({url: broker.url, id: "boundary-peer", token: "test-only-native-domain-peer-room"})})
  const f = fixture(host, domain)
  try {
    await f.oracle.open({methods: f.domainRpc.methods()})
    expect(f.lifecycle.status().state).toBe("starting")
    expect(host.snapshot().links[0]?.channels?.map(channel => channel.name)).toEqual(["oracle", "force"])
    expect(host.snapshot().links).toHaveLength(1)
    const content = "x".repeat(16 * 1024 * 1024 + 128)
    const result = await f.rpc.call<{params: string, source: string}>("boundary", "fixture.echo", content, {waitMs: 30_000})
    expect(result.params).toBe(content)
    expect(result.source).toBe("dark")
    f.force()
    await until(() => f.lifecycle.status().state === "running" && f.force().connected)
    expect(f.failures).toEqual([])
  } finally {await f.close(); await Promise.allSettled([host.close(), domain.close(), broker.close()])}
}, 60_000)

test("transport delivery does not resolve canonical applied receipt; origin follows domain binding", async () => {
  const p = fakePair()
  const f = fixture(p.host, p.domain)
  try {
    await f.oracle.open({methods: f.domainRpc.methods()})
    expect(f.lifecycle.status().state).toBe("starting")
    const force = f.force()
    await until(() => force.connected)
    force.impulse({parts: [{part: "graviton", op: "add", path: "atom/1", ts: 1, value: {}, by: "forged"} as never]})
    await until(() => f.waiting())
    expect((f.accepted[0] as {by: string}).by).toBe("boundary")
    expect(f.delivered).toHaveLength(1)
    expect(f.lifecycle.status().state).toBe("running")
    // Existing canonical sideband owns completion, not PeerNetwork.send.
    f.applied.resolve()
    await f.adapter.whenIdle()
    await p.domain.close()
    expect(f.lifecycle.status().state).toBe("error")
  } finally {await f.close()}
})

test("bounded Force enqueue leaves Oracle progress; asynchronous delivery rejection fail-stops the existing lifecycle", async () => {
  const p = fakePair()
  const f = fixture(p.host, p.domain, 200)
  try {
    await f.oracle.open({methods: f.domainRpc.methods()})
    f.force()
    await until(() => f.force().connected)
    p.hold()
    const message: SourcedForceMessage = {parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, by: "dark", value: {src: "test/world", name: "X"}}]}
    f.adapter.channels.boundary!.send(message)
    expect(() => f.adapter.channels.boundary!.send(message)).toThrow("queue")
    expect(await f.rpc.call<{params: string, source: string}>("boundary", "fixture.echo", "Oracle progresses")).toEqual({params: "Oracle progresses", source: "dark"})
    p.release()
    await f.adapter.whenIdle()
    p.fail()
    f.adapter.channels.boundary!.send(message)
    await until(() => f.lifecycle.status().state === "error")
    expect(f.lifecycle.status().error).toContain("asynchronous Force send failure")
  } finally {p.release(); await f.close()}
})

test("Oracle capacity must be explicitly preserved and Force cannot open before its Oracle binding", async () => {
  const p = fakePair()
  expect(() => new PeerOracleTransport({network: {...p.domain, maxMessageBytes: 16 * 1024 * 1024}, peerId: p.host.id, identity: "boundary"})).toThrow("32 MiB")
  const f = fixture(p.host, p.domain)
  try {
    await p.domain.send(p.host.id, JSON.stringify({kind: "force.open"}), {physicalChannel: "oracle", channel: "quantum.force.control.v1"})
    await Bun.sleep(0)
    expect(f.lifecycle.status().connectedDomains).toEqual(["dark", "matrix", "energy"])
    expect(f.accepted).toEqual([])
  } finally {await f.close()}
})

test("closing Force retires its domain readiness while the caller-owned network and Oracle remain available", async () => {
  const p = fakePair()
  const f = fixture(p.host, p.domain)
  try {
    await f.oracle.open({methods: f.domainRpc.methods()})
    const force = f.force()
    await until(() => force.connected)
    await force.close()
    await until(() => f.lifecycle.status().state === "error")
    expect(p.domain.snapshot().links).toHaveLength(1)
    expect(await f.rpc.call<{params: number, source: string}>("boundary", "fixture.echo", 42)).toEqual({params: 42, source: "dark"})
    expect(force.connected).toBeFalse()
  } finally {await f.close()}
})

test("real checkpoint sideband keeps applied-through pending after transport ACK until Force handler completes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "domain-peer-checkpoint-"))
  const p = fakePair()
  let control!: DarkCheckpointControl
  const f = fixture(p.host, p.domain, 1024 * 1024, rpc => control = new DarkCheckpointControl(join(directory, "state.json"), {cutId: "test", sequence: 0}, rpc, ["dark", "boundary", "matrix", "energy"]))
  const sideband = installForceCheckpointSideband("boundary", f.domainRpc)
  const release = Promise.withResolvers<void>()
  let entered = false
  let completed = false
  try {
    await f.oracle.open({methods: f.domainRpc.methods()})
    await sideband.open()
    const force = f.force()
    force.onImpulse = async () => {entered = true; await release.promise}
    await until(() => force.connected)
    const work = f.lifecycle.acceptParticle("dark", {parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, by: "dark", value: {src: "test/world", name: "World"}}]})
      .then(result => {completed = true; return result})
    await until(() => entered)
    expect(control.pendingDeliveries()).toEqual([{cutId: "test", domain: "boundary", sentOrdinal: 1, acceptanceSequence: 1}])
    expect(await f.rpc.call<{params: string, source: string}>("boundary", "fixture.echo", "while applying")).toEqual({params: "while applying", source: "dark"})
    expect(completed).toBeFalse()
    expect(f.accepted[0]).not.toHaveProperty("receipt")
    release.resolve()
    expect((await work).ok).toBeTrue()
    expect(control.pendingDeliveries()).toEqual([])
  } finally {
    release.resolve()
    uninstallForceCheckpointSideband("boundary", sideband)
    await f.close()
    await rm(directory, {recursive: true, force: true})
  }
})
