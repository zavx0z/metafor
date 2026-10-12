import {expect, test} from "bun:test"
import {createPeerNetwork, createRoutedPeerNetwork} from "../index"
import type {PeerConnectionFactory, PeerData, PeerDataChannel, PeerNetwork, RoutedPeerNetworkOptions} from "../contracts"
import {connectWebSocketSignaling} from "../signaling"
import {createRendezvousServer} from "../rendezvous"
import {createWeriftPeerConnectionFactory} from "../werift"

const token = "test-only-multiple-physical-channels"
const names = ["oracle", "force"]
const rtc = createWeriftPeerConnectionFactory({iceAdditionalHostAddresses: ["127.0.0.1"], iceUseIpv4: true, iceUseIpv6: false,
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1"})
async function until(check: () => boolean, timeout = 25_000) {
  const deadline = Date.now() + timeout
  while (!check()) {if (Date.now() > deadline) throw new Error("Channel condition timed out")
    await Bun.sleep(5)}
}
function data(network: PeerNetwork, physicalChannel: string) {
  return new Promise<PeerData>((resolve, reject) => {
    const timer = setTimeout(() => {off(); reject(new Error("Channel data timed out"))}, 10_000)
    const off = network.onData(event => {
      if (event.physicalChannel !== physicalChannel) return
      clearTimeout(timer)
      off()
      resolve(event)
    })
  })
}
async function pair(factory: PeerConnectionFactory, routed: boolean, extra: Partial<RoutedPeerNetworkOptions> = {}) {
  const server = createRendezvousServer({token, relay: routed})
  const aBootstrap = await connectWebSocketSignaling({url: server.url, id: "a", token, relay: routed})
  const bBootstrap = await connectWebSocketSignaling({url: server.url, id: "b", token, relay: routed})
  const relayFrames: {from: string, kind: string, physicalChannel?: string}[] = []
  for (const [id, bootstrap] of [["a", aBootstrap], ["b", bBootstrap]] as const) {
    const original = bootstrap.sendRelay
    bootstrap.sendRelay = async (to, frame, channel) => {
      relayFrames.push({from: id, ...JSON.parse(frame)})
      await original(to, frame, channel)
    }
  }
  const options = {rtc: factory, dataChannels: names, timeoutMs: 30_000, ...extra}
  const a = routed ? createRoutedPeerNetwork({...options, id: "a", bootstrap: aBootstrap}) : createPeerNetwork({...options, id: "a", bootstrap: aBootstrap})
  const b = routed ? createRoutedPeerNetwork({...options, id: "b", bootstrap: bBootstrap}) : createPeerNetwork({...options, id: "b", bootstrap: bBootstrap})
  await until(() => a.snapshot().peers.includes("b"))
  return {a, b, aBootstrap, bBootstrap, relayFrames, async close() {await Promise.allSettled([a.close(), b.close(), server.close()])}}
}

test("one native PeerConnection has exactly Oracle and Force DCs; Force backpressure leaves Oracle progress independent", async () => {
  let held = true
  let endpoints = 0
  const created: string[] = []
  const observed: string[] = []
  const factory: PeerConnectionFactory = options => {
    endpoints++
    const pc = rtc(options)
    const wrap = (channel: PeerDataChannel): PeerDataChannel => ({
      label: channel.label!, get readyState() {return channel.readyState},
      get bufferedAmount() {return held && channel.label === "force" ? 1_000_000 : channel.bufferedAmount},
      send: bytes => channel.send(bytes), subscribe: handlers => channel.subscribe(handlers), close: () => channel.close(),
    })
    return {...pc, get localDescription() {return pc.localDescription},
      createDataChannel(name) {created.push(name); return wrap(pc.createDataChannel(name))},
      onDataChannel(listener) {return pc.onDataChannel(channel => {observed.push(channel.label!); listener(wrap(channel))})},
    }
  }
  const p = await pair(factory, false, {maxQueuedBytes: 1024})
  try {
    await p.a.connect("b")
    expect(endpoints).toBe(2)
    expect(created).toEqual(names)
    expect(observed.sort()).toEqual([...names].sort())
    expect(p.a.snapshot().links[0]?.channels).toEqual(names.map(name => ({name, state: "open"})))
    let forceDone = false
    const forceData = data(p.b, "force")
    const force = p.a.send("b", new Uint8Array(700), {physicalChannel: "force", channel: "events"}).then(() => {forceDone = true})
    await expect(p.a.send("b", new Uint8Array(700), {physicalChannel: "force"})).rejects.toThrow("queue")
    const oracleData = data(p.b, "oracle")
    await p.a.send("b", "query", {physicalChannel: "oracle", channel: "events"})
    expect((await oracleData).data).toBe("query")
    expect(forceDone).toBeFalse()
    held = false
    await force
    expect((await forceData).data).toEqual(new Uint8Array(700))
    await expect(p.a.send("b", "bad", {physicalChannel: "other"})).rejects.toThrow("physical channel")
    const defaultData = data(p.a, "oracle")
    await p.b.send("a", "first lane")
    expect((await defaultData).data).toBe("first lane")
  } finally {held = false; await p.close()}
}, 40_000)

test("working native RTC carries the first application payload before any relay data", async () => {
  const p = await pair(rtc, true)
  try {
    await p.a.connect("b")
    expect(p.a.snapshot().links[0]?.transport).toBe("direct")
    const got = data(p.b, "oracle")
    await p.a.send("b", "first request", {physicalChannel: "oracle"})
    expect((await got).data).toBe("first request")
    expect(p.relayFrames.filter(frame => frame.kind === "data")).toEqual([])
  } finally {await p.close()}
}, 40_000)

test("failed RTC falls back immediately with independent lane ACK sequences and no duplicate Force delivery", async () => {
  const p = await pair(() => {throw new Error("Forced RTC failure")}, true)
  let dropped = false
  const original = p.bBootstrap.sendRelay
  p.bBootstrap.sendRelay = async (to, frame, channel) => {
    const packet = JSON.parse(frame)
    if (packet.kind === "ack" && packet.physicalChannel === "force" && !dropped) {dropped = true; return}
    await original(to, frame, channel)
  }
  try {
    const start = Date.now()
    await p.a.connect("b")
    expect(Date.now() - start).toBeLessThan(1000)
    const delivered: PeerData[] = []
    p.b.onData(event => delivered.push(event))
    let forceDone = false
    const force = p.a.send("b", "particle", {physicalChannel: "force", channel: "same-service"}).then(() => {forceDone = true})
    await until(() => dropped, 1000)
    const oracle = data(p.b, "oracle")
    await p.a.send("b", new Uint8Array([1, 2, 3]), {physicalChannel: "oracle", channel: "same-service"})
    expect((await oracle).data).toEqual(new Uint8Array([1, 2, 3]))
    expect(forceDone).toBeFalse()
    await force
    expect(delivered.filter(event => event.physicalChannel === "force")).toHaveLength(1)
    expect(p.relayFrames.filter(frame => frame.kind === "data").map(frame => frame.physicalChannel)).toContain("oracle")
  } finally {await p.close()}
}, 10_000)

test("bounded RTC wait admits relay then late RTC upgrades without changing generation or replaying payload", async () => {
  const release = Promise.withResolvers<void>()
  let offered = 0
  let failing = false
  const endpoints: ReturnType<PeerConnectionFactory>[] = []
  const delayed: PeerConnectionFactory = options => {
    if (failing) throw new Error("Forced recovered RTC loss")
    const pc = rtc(options)
    endpoints.push(pc)
    return {...pc, get localDescription() {return pc.localDescription}, async createOffer() {
      offered++
      await release.promise
      return await pc.createOffer()
    }}
  }
  const p = await pair(delayed, true, {directTimeoutMs: 80})
  try {
    const start = Date.now()
    await p.a.connect("b")
    expect(offered).toBeGreaterThan(0)
    expect(Date.now() - start).toBeGreaterThanOrEqual(70)
    expect(p.a.snapshot().links[0]?.transport).toBe("relay")
    const generation = p.a.snapshot().links[0]!.generation
    const delivered: PeerData[] = []
    p.b.onData(event => delivered.push(event))
    await p.a.send("b", "before", {physicalChannel: "force"})
    release.resolve()
    await until(() => p.a.snapshot().links[0]?.transport === "direct" && p.b.snapshot().links[0]?.transport === "direct")
    await p.a.send("b", "after", {physicalChannel: "force"})
    expect(delivered.map(event => event.data)).toEqual(["before", "after"])
    expect(p.a.snapshot().links[0]?.generation).toBe(generation)
    failing = true
    await Promise.allSettled(endpoints.map(endpoint => endpoint.close()))
    await until(() => p.a.snapshot().links[0]?.transport === "relay" && p.b.snapshot().links[0]?.transport === "relay")
    await p.a.send("b", "fallback", {physicalChannel: "force"})
    failing = false
    await p.a.send("b", "recovery-start", {physicalChannel: "oracle"})
    await until(() => p.a.snapshot().links[0]?.transport === "direct" && p.b.snapshot().links[0]?.transport === "direct")
    await p.a.send("b", "recovered", {physicalChannel: "force"})
    expect(delivered.map(event => event.data)).toEqual(["before", "after", "fallback", "recovery-start", "recovered"])
    expect(p.a.snapshot().links[0]?.generation).toBe(generation)
  } finally {release.resolve(); await p.close()}
}, 60_000)

test("physical channel configuration is bounded and unique", () => {
  const factory: PeerConnectionFactory = () => {throw new Error("RTC must not be created")}
  for (const dataChannels of [[], ["oracle", "oracle"], ["bad name"], Array.from({length: 17}, (_, i) => `lane-${i}`)]) {
    expect(() => createPeerNetwork({id: "test", rtc: factory, dataChannels})).toThrow("physical channels")
  }
})

test("closing a routed network cancels the first RTC wait and its owned endpoint", async () => {
  let closed = 0
  const stalled: PeerConnectionFactory = () => ({localDescription: undefined,
    createOffer: () => new Promise(() => {}), createAnswer: () => new Promise(() => {}),
    async setLocalDescription() {}, async setRemoteDescription() {},
    createDataChannel(label) {return {label, readyState: "connecting", bufferedAmount: 0,
      send() {}, subscribe() {return () => {}}, close() {}}},
    onDataChannel() {return () => {}}, onState() {return () => {}}, async close() {closed++},
  })
  const p = await pair(stalled, true, {directTimeoutMs: 15_000})
  try {
    const connecting = p.a.connect("b").catch(error => error)
    await until(() => p.a.snapshot().links[0]?.state === "open")
    const start = Date.now()
    await p.a.close()
    expect(await connecting).toBeInstanceOf(Error)
    expect(Date.now() - start).toBeLessThan(1500)
    expect(closed).toBeGreaterThanOrEqual(1)
    expect(p.a.snapshot().links).toEqual([])
  } finally {await p.close()}
}, 5000)
