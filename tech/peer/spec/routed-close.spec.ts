import {expect, test} from "bun:test"
import {createRoutedPeerNetwork} from "../index"
import type {PeerConnectionFactory, RelaySignalTransport} from "../contracts"

const failedRTC: PeerConnectionFactory = () => {throw new Error("Forced RTC failure")}

test("routed close finishes delayed bye before bootstrap closes and permits a fresh generation", async () => {
  type Listener = Parameters<RelaySignalTransport["subscribeRelay"]>[0]
  const endpoints = new Map<string, {transport: RelaySignalTransport; listeners: Set<Listener>}>()
  const bootstrap = (id: string): RelaySignalTransport => {
    let open = true
    const listeners = new Set<Listener>()
    const transport: RelaySignalTransport = {
      relayEnabled: true,
      get open() {return open},
      peers: () => [...endpoints.keys()].filter(peer => peer !== id),
      send() {},
      subscribe: () => () => {},
      subscribePeers: () => () => {},
      subscribeRelayClose: () => () => {},
      subscribeRelay(listener) {listeners.add(listener); return () => {listeners.delete(listener)}},
      async sendRelay(to, frame, channel) {
        await Promise.resolve()
        const target = endpoints.get(to)
        if (!open || !target?.transport.open) throw new Error("Relay is unavailable")
        for (const listener of target.listeners) listener({from: id, frame, ...(channel === undefined ? {} : {channel})})
      },
      // Roster removal may arrive after close; bye must retire the remote logical link first.
      close() {open = false},
    }
    endpoints.set(id, {transport, listeners})
    return transport
  }
  const aBootstrap = bootstrap("a")
  const a = createRoutedPeerNetwork({id: "a", rtc: failedRTC, bootstrap: aBootstrap, timeoutMs: 1000})
  const b = createRoutedPeerNetwork({id: "b", rtc: failedRTC, bootstrap: bootstrap("b"), timeoutMs: 1000})
  const byeStarted = Promise.withResolvers<void>()
  const releaseBye = Promise.withResolvers<void>()
  const send = aBootstrap.sendRelay
  let closed = false
  let replacement: ReturnType<typeof createRoutedPeerNetwork> | undefined
  try {
    await a.connect("b")
    const generation = a.snapshot().links[0]!.generation
    aBootstrap.sendRelay = async (to, frame, channel) => {
      if (JSON.parse(frame).kind === "bye") {byeStarted.resolve(); await releaseBye.promise}
      await send(to, frame, channel)
    }
    const closing = a.close().then(() => {closed = true})
    await byeStarted.promise
    await Promise.resolve()
    expect(aBootstrap.open).toBeTrue()
    expect(closed).toBeFalse()
    releaseBye.resolve()
    await closing
    expect(aBootstrap.open).toBeFalse()
    expect(b.snapshot().links).toHaveLength(0)
    replacement = createRoutedPeerNetwork({id: "a", rtc: failedRTC, bootstrap: bootstrap("a"), timeoutMs: 1000})
    await replacement.connect("b")
    expect(replacement.snapshot().links[0]!.generation).not.toBe(generation)
    expect(b.snapshot().links[0]!.generation).toBe(replacement.snapshot().links[0]!.generation)
    const received: unknown[] = []
    b.onData(event => received.push(event.data))
    await replacement.send("b", "one new command")
    expect(received).toEqual(["one new command"])
  } finally {
    releaseBye.resolve()
    await Promise.allSettled([a.close(), b.close(), replacement?.close()])
  }
})
