/** Эти tests используют injected RTC fake и доказывают framing/лимиты, а не сетевую связность. */
import {expect, test} from "bun:test"
import {createPeerNetwork} from "../index"
import type {PeerConnectionFactory, PeerDataChannel, PeerDescription, SignalTransport} from "../contracts"

function fake(options: {buffered?: number, stalled?: boolean} = {}) {
  let state = options.stalled ? "connecting" : "open"
  let handlers: Parameters<PeerDataChannel["subscribe"]>[0] | undefined
  let local: PeerDescription | undefined
  let closes = 0
  const frames: Uint8Array[] = []
  const channel: PeerDataChannel = {
    get readyState() { return state },
    bufferedAmount: options.buffered ?? 0,
    send(frame) { frames.push(Uint8Array.from(frame)) },
    subscribe(value) { handlers = value
      return () => { handlers = undefined } },
    close() { state = "closed"
      handlers?.close() },
  }
  const rtc: PeerConnectionFactory = () => ({
    get localDescription() { return local },
    createOffer: () => options.stalled ? new Promise(() => {}) : Promise.resolve({type: "offer", sdp: "fake"}),
    createAnswer: async () => ({type: "answer", sdp: "fake"}),
    async setLocalDescription(value) { local = value },
    async setRemoteDescription() {},
    createDataChannel() { return channel },
    onDataChannel() { return () => {} },
    onState() { return () => {} },
    async close() { closes++ },
  })
  const bootstrap: SignalTransport = {
    open: true, send() {}, peers: () => ["remote"],
    subscribe: () => () => {}, subscribePeers: () => () => {}, close() {},
  }
  return {rtc, bootstrap, frames, deliver: (frame: Uint8Array) => handlers?.message(frame), closes: () => closes}
}

test("Framing ограничивает каждый frame и дедуплицирует завершённое сообщение", async () => {
  const fixture = fake()
  const network = createPeerNetwork({id: "local", ...fixture})
  try {
    await network.connect("remote")
    const received: unknown[] = []
    network.onData(event => received.push(event))
    const data = new Uint8Array(16 * 1024 * 1024)
    data[data.length - 1] = 92
    await network.send("remote", data, {channel: "release"})
    expect(fixture.frames.every(frame => frame.length <= 16_384)).toBeTrue()
    expect(fixture.frames.length).toBeGreaterThan(1000)
    for (const frame of fixture.frames) fixture.deliver(frame)
    for (const frame of fixture.frames) fixture.deliver(frame)
    expect(received).toHaveLength(1)
    expect((received[0] as {channel: string}).channel).toBe("release")
    expect((received[0] as {data: Uint8Array}).data[data.length - 1]).toBe(92)
    await expect(network.send("remote", "payload", {channel: "@signal"})).rejects.toThrow("channel")
  } finally { await network.close() }
  expect(fixture.closes()).toBe(1)
})

test("Переполнение очереди отвергается до отправки; закрытие отменяет backpressure", async () => {
  const fixture = fake({buffered: 1024 * 1024})
  const network = createPeerNetwork({id: "local", ...fixture, maxQueuedBytes: 1024})
  await network.connect("remote")
  const pending = network.send("remote", new Uint8Array(700))
  void pending.catch(() => {})
  await expect(network.send("remote", new Uint8Array(700))).rejects.toThrow("queue")
  await network.close()
  await expect(pending).rejects.toThrow("closed")
  expect(fixture.frames).toHaveLength(0)
})

test("Deadline освобождает зависшую RTC preparation", async () => {
  const fixture = fake({stalled: true})
  const network = createPeerNetwork({id: "local", ...fixture, timeoutMs: 20})
  await expect(network.connect("remote")).rejects.toThrow("timed out")
  expect(fixture.closes()).toBe(1)
  expect(network.snapshot().links).toHaveLength(0)
  await network.close()
})

test("Explicit message capacity preserves a bounded 32 MiB Oracle envelope", async () => {
  const fixture = fake()
  for (const maxMessageBytes of [0, Infinity, 32 * 1024 * 1024 + 1]) {
    expect(() => createPeerNetwork({id: "local", ...fixture, maxMessageBytes})).toThrow("message limit")
  }
  const network = createPeerNetwork({id: "local", ...fixture, maxMessageBytes: 32 * 1024 * 1024})
  try {
    expect(network.maxMessageBytes).toBe(32 * 1024 * 1024)
    await network.connect("remote")
    await expect(network.send("remote", new Uint8Array(32 * 1024 * 1024 + 1))).rejects.toThrow("limit")
  } finally {await network.close()}
})

test("Несогласованный размер и незавершённое сообщение закрывают только свою связь", async () => {
  const fixture = fake()
  const network = createPeerNetwork({id: "local", ...fixture, timeoutMs: 20})
  await network.connect("remote")
  await network.send("remote", new Uint8Array(20_000))
  fixture.deliver(fixture.frames[0]!)
  await Bun.sleep(30)
  expect(network.snapshot().links).toHaveLength(0)
  await network.close()
})
