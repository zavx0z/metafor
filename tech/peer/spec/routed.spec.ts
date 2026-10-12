import {expect, test} from "bun:test"
import {createRoutedPeerNetwork} from "../index"
import type {PeerConnectionFactory, PeerData, PeerNetwork, RoutedPeerNetworkOptions} from "../contracts"
import {connectWebSocketSignaling} from "../signaling"
import {createRendezvousHandler, createRendezvousServer} from "../rendezvous"
import {createWeriftPeerConnectionFactory} from "../werift"

const token = "test-only-routed-peer-room-token"
const failedRTC: PeerConnectionFactory = () => { throw new Error("Forced ICE failure") }
const rtc = createWeriftPeerConnectionFactory({
  iceAdditionalHostAddresses: ["127.0.0.1"], iceUseIpv4: true, iceUseIpv6: false,
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1",
})
async function wait(check: () => boolean, timeout = 25_000) {
  const deadline = Date.now() + timeout
  while (!check()) { if (Date.now() > deadline) throw new Error("Condition timed out")
    await Bun.sleep(10) }
}
function next(network: PeerNetwork, channel: string): Promise<PeerData> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { dispose()
      reject(new Error("Data timed out")) }, 10_000)
    const dispose = network.onData(event => { if (event.channel !== channel) return
      dispose()
      clearTimeout(timer)
      resolve(event) })
  })
}
async function pair(factory: PeerConnectionFactory = failedRTC, extra: Pick<RoutedPeerNetworkOptions, "maxMessageBytes"> = {}) {
  const server = createRendezvousServer({token, relay: true})
  const a = createRoutedPeerNetwork({id: "a", rtc: factory, bootstrap: await connectWebSocketSignaling({url: server.url, id: "a", token, relay: true}), timeoutMs: 30_000, ...extra})
  const b = createRoutedPeerNetwork({id: "b", rtc: factory, bootstrap: await connectWebSocketSignaling({url: server.url, id: "b", token, relay: true}), timeoutMs: 30_000, ...extra})
  await wait(() => a.snapshot().peers.includes("b"))
  return {server, a, b, close: () => Promise.allSettled([a.close(), b.close(), server.close()])}
}

test("Explicit 32 MiB capacity survives forced RTC failure without shrinking the relay envelope", async () => {
  const p = await pair(failedRTC, {maxMessageBytes: 32 * 1024 * 1024})
  try {
    await p.a.connect("b")
    const payload = new Uint8Array(32 * 1024 * 1024)
    payload.fill(73)
    const received = next(p.b, "oracle-envelope")
    await p.a.send("b", payload, {channel: "oracle-envelope"})
    expect((await received).data).toEqual(payload)
    expect(p.a.snapshot().links[0]?.transport).toBe("relay")
  } finally {await p.close()}
}, 20_000)

test("Forced RTC failure uses admitted relay channels for ordered bidirectional text/binary channels", async () => {
  const p = await pair()
  try {
    await Promise.all([p.a.connect("b"), p.b.connect("a")])
    expect(p.a.snapshot().links[0]?.transport).toBe("relay")
    expect(p.a.snapshot().links[0]?.generation).toBe(p.b.snapshot().links[0]?.generation)
    const seen: string[] = []
    p.b.onData(event => { if (event.channel === "acp:one") seen.push(event.data as string) })
    await Promise.all(Array.from({length: 20}, (_, i) => p.a.send("b", `command-${i}`, {channel: "acp:one"})))
    expect(seen).toEqual(Array.from({length: 20}, (_, i) => `command-${i}`))
    const bytes = new Uint8Array(1024 * 1024 + 17)
    bytes.fill(157)
    const received = next(p.a, "artifact")
    await p.b.send("a", bytes, {channel: "artifact"})
    expect((await received).data).toEqual(bytes)
    await expect(p.a.connect("absent")).rejects.toThrow("unavailable")
    await expect(p.a.send("b", new Uint8Array(16 * 1024 * 1024 + 1))).rejects.toThrow("limit")
    await p.server.close()
    await wait(() => p.a.snapshot().links.length === 0 && p.b.snapshot().links.length === 0)
    await expect(p.a.send("b", "must not replay")).rejects.toThrow("not connected")
  } finally { await p.close() }
}, 20_000)

test("Actual RTC upgrades relay, retains logical generation, survives bootstrap close and falls back on RTC loss", async () => {
  const endpoints: ReturnType<PeerConnectionFactory>[] = []
  const controlled: PeerConnectionFactory = options => { const endpoint = rtc(options)
    endpoints.push(endpoint)
    return endpoint }
  const p = await pair(controlled)
  try {
    await p.a.connect("b")
    const generation = p.a.snapshot().links[0]!.generation
    await wait(() => p.a.snapshot().links[0]?.transport === "direct" && p.b.snapshot().links[0]?.transport === "direct")
    const directData = next(p.b, "acp")
    await p.a.send("b", "direct", {channel: "acp"})
    expect((await directData).data).toBe("direct")
    await Promise.allSettled(endpoints.map(endpoint => endpoint.close()))
    await wait(() => p.a.snapshot().links[0]?.transport === "relay" && p.b.snapshot().links[0]?.transport === "relay")
    expect(p.a.snapshot().links[0]?.generation).toBe(generation)
    const fallback = next(p.a, "acp")
    await p.b.send("a", "fallback", {channel: "acp"})
    expect((await fallback).data).toBe("fallback")
    await wait(() => p.a.snapshot().links[0]?.transport === "direct" && p.b.snapshot().links[0]?.transport === "direct")
    p.a.closeBootstrap()
    p.b.closeBootstrap()
    const after = next(p.b, "acp")
    await p.a.send("b", "bootstrap absent", {channel: "acp"})
    expect((await after).data).toBe("bootstrap absent")
    expect(p.a.snapshot().links[0]?.generation).toBe(generation)
  } finally { await p.close() }
}, 80_000)

test("Relay requires host and client opt-in and rejects unauthenticated routing", async () => {
  const server = createRendezvousServer({token})
  try {
    await expect(connectWebSocketSignaling({url: server.url, id: "a", token, relay: true})).rejects.toThrow()
    await expect(connectWebSocketSignaling({url: server.url, id: "a", token: "incorrect-room-token", relay: true})).rejects.toThrow()
  } finally { await server.close() }
  const handler = createRendezvousHandler({token, relay: true})
  const host = Bun.serve({port: 0, hostname: "127.0.0.1", fetch(request, server) { return handler.upgrade(request, (r, data) => server.upgrade(r, {data})) },
    websocket: {...handler.recommendedWebSocketOptions, ...handler.websocket}})
  try {
    const socket = new WebSocket(`ws://127.0.0.1:${host.port}/peer`)
    const closed = new Promise<number>(resolve => socket.addEventListener("close", e => resolve(e.code)))
    socket.addEventListener("open", () => socket.send(JSON.stringify({type: "relay", to: "a", frame: "bad"})))
    expect(await closed).toBe(1008)
  } finally { handler.close()
    await host.stop(true) }
}, 10_000)

test("Lost transport ACK retries frames without delivering the application command twice", async () => {
  const server = createRendezvousServer({token, relay: true})
  const bootstrapA = await connectWebSocketSignaling({url: server.url, id: "a", token, relay: true})
  const bootstrapB = await connectWebSocketSignaling({url: server.url, id: "b", token, relay: true})
  let dropped = false
  const original = bootstrapB.sendRelay
  bootstrapB.sendRelay = async (to, frame, channel) => {
    if (!dropped && JSON.parse(frame).kind === "ack") { dropped = true
      return }
    return original(to, frame, channel)
  }
  const a = createRoutedPeerNetwork({id: "a", rtc: failedRTC, bootstrap: bootstrapA})
  const b = createRoutedPeerNetwork({id: "b", rtc: failedRTC, bootstrap: bootstrapB})
  try {
    await wait(() => a.snapshot().peers.includes("b"))
    await a.connect("b")
    const delivered: unknown[] = []
    b.onData(event => delivered.push(event.data))
    await a.send("b", "execute once", {channel: "acp"})
    expect(dropped).toBeTrue()
    expect(delivered).toEqual(["execute once"])
  } finally { await Promise.allSettled([a.close(), b.close(), server.close()]) }
}, 10_000)

test("Signaling reconnects after server restart with fresh authorized data channels and no replay", async () => {
  let server = createRendezvousServer({token, relay: true})
  const port = Number(new URL(server.url).port)
  const a = await connectWebSocketSignaling({url: server.url, id: "a", token, relay: true})
  const b = await connectWebSocketSignaling({url: server.url, id: "b", token, relay: true})
  try {
    await wait(() => a.peers().includes("b"))
    const seen: string[] = []
    b.subscribeRelay(event => seen.push(event.frame))
    await a.sendRelay("b", "before", "acp")
    await wait(() => seen.length === 1)
    await server.close()
    await wait(() => !a.open && !b.open)
    server = createRendezvousServer({token, relay: true, port})
    await wait(() => a.open && b.open && a.peers().includes("b"))
    expect(seen).toEqual(["before"])
    await a.sendRelay("b", "after", "acp")
    await wait(() => seen.length === 2)
    expect(seen).toEqual(["before", "after"])
    const forged = new WebSocket(server.url)
    const rejected = new Promise<number>(resolve => forged.addEventListener("close", event => resolve(event.code)))
    forged.addEventListener("open", () => forged.send(JSON.stringify({type: "join-channel", id: "a", to: "b", channel: "forged", sessionKey: "incorrect-session-key"})))
    expect(await rejected).toBe(1008)
  } finally { a.close()
    b.close()
    await server.close() }
}, 10_000)
