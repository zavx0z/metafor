import {expect, test} from "bun:test"
import {createRoutedPeerNetwork} from "../index"
import type {PeerData, PeerNetwork} from "../contracts"
import {connectWebSocketSignaling, type SignalingSocketContext} from "../signaling"
import {createRendezvousHandler, createRendezvousServer, type RendezvousSession} from "../rendezvous"

const token = "test-only-relay-flow-control-room"
async function until(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!check()) {if (Date.now() > deadline) throw new Error("Relay flow condition timed out"); await Bun.sleep(5)}
}
async function fixture(ids: string[], holdForce = false, timeoutMs = 30_000) {
  const handler = createRendezvousHandler({token, relay: true})
  const proxies = new WeakMap<object, unknown>()
  const peaks: {id?: string, to?: string, channel?: string, peak: number}[] = []
  const stats = new WeakMap<object, typeof peaks[number]>()
  const wrap = (socket: any): any => {
    const existing = proxies.get(socket)
    if (existing) return existing
    const record = {peak: 0} as typeof peaks[number]
    peaks.push(record); stats.set(socket, record)
    const proxy = new Proxy(socket, {get(target, key) {
      if (key === "getBufferedAmount") return () => {const amount = target.getBufferedAmount(); record.peak = Math.max(record.peak, amount); return amount}
      const value = Reflect.get(target, key, target)
      return typeof value === "function" ? value.bind(target) : value
    }})
    proxies.set(socket, proxy)
    return proxy
  }
  const host = Bun.serve<RendezvousSession>({hostname: "127.0.0.1", port: 0,
    fetch(request, server) {return handler.upgrade(request, (r, data) => server.upgrade(r, {data}))},
    websocket: {...handler.recommendedWebSocketOptions, open(socket) {handler.websocket.open(wrap(socket))},
      message(socket, raw) {
        const message = JSON.parse(String(raw))
        if (message.type === "join-channel") Object.assign(stats.get(socket)!, {id: message.id, to: message.to, channel: message.channel})
        handler.websocket.message(wrap(socket), raw)
      }, close(socket, code, reason) {handler.websocket.close(wrap(socket), code, reason)}}})
  const url = `ws://127.0.0.1:${host.port}/peer`
  const networks = new Map<string, PeerNetwork>()
  const bootstraps = new Map<string, Awaited<ReturnType<typeof connectWebSocketSignaling>>>()
  const sockets: {id: string, socket: WebSocket, context: SignalingSocketContext}[] = []
  const sent: {id: string, packet: any}[] = []
  const delayed: (() => void)[] = []
  let held = holdForce
  for (const id of ids) {
    const bootstrap = await connectWebSocketSignaling({url, id, token, relay: true, socketFactory(address, context) {
      const socket = new WebSocket(address)
      sockets.push({id, socket, context})
      return socket
    }})
    bootstraps.set(id, bootstrap)
    const originalSend = bootstrap.sendRelay
    bootstrap.sendRelay = async (to, frame, channel) => {sent.push({id, packet: JSON.parse(frame)}); await originalSend(to, frame, channel)}
    if (id === "hub") {
      const originalSubscribe = bootstrap.subscribeRelay
      bootstrap.subscribeRelay = listener => originalSubscribe(event => {
        const packet = JSON.parse(event.frame)
        if (held && packet.kind === "data" && packet.physicalChannel === "force") {delayed.push(() => listener(event)); return}
        listener(event)
      })
    }
    networks.set(id, createRoutedPeerNetwork({id, bootstrap, rtc() {throw new Error("Forced RTC failure")},
      dataChannels: ["oracle", "force"], maxMessageBytes: 32 * 1024 * 1024, timeoutMs}))
  }
  await until(() => [...bootstraps.values()].every(bootstrap => bootstrap.peers().length === ids.length - 1))
  return {host, handler, networks, bootstraps, sockets, peaks, sent, delayed,
    release() {held = false; for (const deliver of delayed.splice(0)) deliver()},
    async close() {held = false; delayed.splice(0); await Promise.allSettled([...networks.values()].map(network => network.close())); handler.close(); await host.stop(true)},
  }
}

test("three senders keep Force windows bounded on isolated recipient sockets while Oracle progresses", async () => {
  const p = await fixture(["hub", "a", "b", "c"], true)
  const hub = p.networks.get("hub")!
  const observed: PeerData[] = []
  hub.onData(event => observed.push(event))
  try {
    await Promise.all(["a", "b", "c"].map(id => p.networks.get(id)!.connect("hub")))
    const generations = ["a", "b", "c"].map(id => p.networks.get(id)!.snapshot().links[0]!.generation)
    const payload = new Uint8Array(2 * 1024 * 1024)
    payload.fill(37)
    const sends = ["a", "b", "c"].map(id => p.networks.get(id)!.send("hub", payload, {physicalChannel: "force", channel: "particles"}))
    await until(() => p.delayed.length === 96)
    for (const id of ["a", "b", "c"]) expect(p.sent.filter(entry => entry.id === id && entry.packet.kind === "data")).toHaveLength(32)
    const generation = generations[0]!
    const bootstrap = p.bootstraps.get("hub")!
    for (const packet of [
      {generation: "stale", sequence: 0, offset: 0},
      {generation, sequence: 1, offset: 0},
      {generation, sequence: 0, offset: 8192 * 64},
      ...Array.from({length: 10}, () => ({generation, sequence: 0, offset: 8192 * 10})),
    ]) await bootstrap.sendRelay("a", JSON.stringify({kind: "fragment", physicalChannel: "force", channel: "particles", size: payload.length, ...packet}), "force")
    await Bun.sleep(30)
    expect(p.sent.filter(entry => entry.id === "a" && entry.packet.kind === "data")).toHaveLength(32)
    await Promise.all(["a", "b", "c"].map(id => p.networks.get(id)!.send("hub", `query-${id}`, {physicalChannel: "oracle", channel: "query"})))
    expect(observed.map(event => event.data).sort()).toEqual(["query-a", "query-b", "query-c"])
    p.release()
    await Promise.all(sends)
    expect(observed.filter(event => event.physicalChannel === "force")).toHaveLength(3)
    for (const event of observed.filter(event => event.physicalChannel === "force")) expect(event.data).toEqual(payload)
    const recipientData = p.peaks.filter(item => item.id === "hub")
    expect(recipientData).toHaveLength(6)
    expect(new Set(recipientData.map(item => `${item.to}/${item.channel}`)).size).toBe(6)
    expect(p.peaks.every(item => item.peak <= 1024 * 1024)).toBeTrue()
    expect(["a", "b", "c"].map(id => p.networks.get(id)!.snapshot().links[0]!.generation)).toEqual(generations)
  } finally {p.release(); await p.close()}
}, 15_000)

test("data socket failure mid-message reopens that WSS lane without replaying application delivery", async () => {
  const p = await fixture(["hub", "a"])
  const a = p.networks.get("a")!
  const hub = p.networks.get("hub")!
  const delivered: PeerData[] = []
  hub.onData(event => delivered.push(event))
  const bootstrap = p.bootstraps.get("a")!
  const send = bootstrap.sendRelay
  let failed = false
  bootstrap.sendRelay = async (to, frame, channel) => {
    const packet = JSON.parse(frame)
    if (!failed && packet.kind === "data" && packet.offset >= 8192) {
      failed = true
      const entry = p.sockets.findLast(item => item.id === "a" && item.context.kind === "relay" && item.context.channel === "force")!
      const closed = new Promise<void>(resolve => entry.socket.addEventListener("close", () => resolve(), {once: true}))
      entry.socket.close()
      await closed
    }
    await send(to, frame, channel)
  }
  try {
    await a.connect("hub")
    const generation = a.snapshot().links[0]!.generation
    const payload = new Uint8Array(1024 * 1024)
    payload.fill(91)
    await a.send("hub", payload, {physicalChannel: "force"})
    expect(failed).toBeTrue()
    expect(delivered).toHaveLength(1)
    expect(delivered[0]!.data).toEqual(payload)
    expect(a.snapshot().links[0]!.generation).toBe(generation)
    expect(p.sockets.filter(item => item.id === "a" && item.context.kind === "relay" && item.context.channel === "force").length).toBeGreaterThan(1)
  } finally {await p.close()}
}, 15_000)

test("legacy routed handshake is rejected explicitly instead of waiting forever for fragment credits", async () => {
  const p = await fixture(["hub", "a"])
  const bootstrap = p.bootstraps.get("hub")!
  const send = bootstrap.sendRelay
  bootstrap.sendRelay = async (to, frame, channel) => {
    const packet = JSON.parse(frame)
    if (packet.kind === "ready") delete packet.version
    await send(to, JSON.stringify(packet), channel)
  }
  try {await expect(p.networks.get("a")!.connect("hub")).rejects.toThrow("Unsupported routed peer protocol")}
  finally {await p.close()}
}, 5000)

test("closing during a withheld fragment window rejects pending send and clears the logical generation", async () => {
  const p = await fixture(["hub", "a"], true)
  const a = p.networks.get("a")!
  try {
    await a.connect("hub")
    const sending = a.send("hub", new Uint8Array(1024 * 1024), {physicalChannel: "force"}).catch(error => error)
    await until(() => p.delayed.length === 32)
    await a.close()
    expect(await sending).toBeInstanceOf(Error)
    expect(a.snapshot().links).toEqual([])
  } finally {await p.close()}
}, 5000)

test("fragment credit timeout clears a stalled transfer without delivering application data", async () => {
  const p = await fixture(["hub", "a"], true, 80)
  const a = p.networks.get("a")!
  const delivered: PeerData[] = []
  p.networks.get("hub")!.onData(event => delivered.push(event))
  try {
    await a.connect("hub")
    await expect(a.send("hub", new Uint8Array(1024 * 1024), {physicalChannel: "force"})).rejects.toThrow("timed out")
    expect(delivered).toEqual([])
    expect(a.snapshot().links).toEqual([])
    await until(() => p.networks.get("hub")!.snapshot().links.length === 0)
  } finally {await p.close()}
}, 5000)

test("signaling restart retires partial transfer and reconnect creates a fresh generation without command replay", async () => {
  const p = await fixture(["hub", "a"], true)
  const a = p.networks.get("a")!
  const delivered: PeerData[] = []
  p.networks.get("hub")!.onData(event => delivered.push(event))
  let recovered: ReturnType<typeof createRendezvousServer> | undefined
  try {
    await a.connect("hub")
    const previous = a.snapshot().links[0]!.generation
    const sending = a.send("hub", new Uint8Array(1024 * 1024), {physicalChannel: "force"}).catch(error => error)
    await until(() => p.delayed.length === 32)
    const port = p.host.port!
    p.handler.close()
    await p.host.stop(true)
    await until(() => [...p.bootstraps.values()].every(bootstrap => !bootstrap.open))
    expect(await sending).toBeInstanceOf(Error)
    p.delayed.splice(0)
    p.release()
    recovered = createRendezvousServer({token, relay: true, port})
    await until(() => [...p.bootstraps.values()].every(bootstrap => bootstrap.open && bootstrap.peers().length === 1))
    await a.connect("hub")
    expect(a.snapshot().links[0]!.generation).not.toBe(previous)
    await a.send("hub", "new command", {physicalChannel: "force"})
    expect(delivered.map(event => event.data)).toEqual(["new command"])
  } finally {await recovered?.close(); await p.close()}
}, 10_000)
