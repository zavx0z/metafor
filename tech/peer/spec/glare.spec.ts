import {expect, test} from "bun:test"
import {createRoutedPeerNetwork, createPeerNetwork} from "../index"
import {connectWebSocketSignaling} from "../signaling"
import {createRendezvousServer} from "../rendezvous"
import {createWeriftPeerConnectionFactory} from "../werift"
import type {PeerConnectionFactory} from "../contracts"

const token = "test-only-glare-admission-token"
const failedRTC: PeerConnectionFactory = () => {throw new Error("Forced RTC failure")}
const native = createWeriftPeerConnectionFactory({iceUseIpv4: false, iceUseIpv6: false,
  iceAdditionalHostAddresses: ["127.0.0.1"], iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1"})
async function until(check: () => boolean) {
  const deadline = Date.now() + 3000
  while (!check()) {if (Date.now() > deadline) throw new Error("Glare fixture admission timed out"); await Bun.sleep(5)}
}
function barrier() {
  let release!: () => void
  const promise = new Promise<void>(resolve => {release = resolve})
  return {promise, release}
}

test("routed concurrent acquisition joins the winning generation without retrying application data", async () => {
  const server = createRendezvousServer({token, relay: true})
  const aBootstrap = await connectWebSocketSignaling({url: server.url, id: "a", token, relay: true})
  const bBootstrap = await connectWebSocketSignaling({url: server.url, id: "b", token, relay: true})
  const held = barrier()
  let hellos = 0
  for (const bootstrap of [aBootstrap, bBootstrap]) {
    const send = bootstrap.sendRelay
    bootstrap.sendRelay = async (peer, frame, lane) => {
      if (JSON.parse(frame).kind === "hello") {hellos++; await held.promise}
      await send(peer, frame, lane)
    }
  }
  const a = createRoutedPeerNetwork({id: "a", rtc: failedRTC, bootstrap: aBootstrap, timeoutMs: 3000})
  const b = createRoutedPeerNetwork({id: "b", rtc: failedRTC, bootstrap: bBootstrap, timeoutMs: 3000})
  const snapshots: number[] = []
  const off = b.subscribe(snapshot => snapshots.push(snapshot.links.length))
  try {
    await until(() => a.snapshot().peers.includes("b") && b.snapshot().peers.includes("a"))
    const outcomes = Promise.allSettled([a.connect("b"), a.connect("b"), b.connect("a"), b.connect("a")])
    await until(() => hellos === 2)
    held.release()
    expect((await outcomes).map(result => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"])
    expect(snapshots).not.toContain(0)
    expect(a.snapshot().links).toHaveLength(1)
    expect(b.snapshot().links[0]!.generation).toBe(a.snapshot().links[0]!.generation)
    const messages: string[] = []
    b.onData(event => messages.push(String(event.data)))
    await a.send("b", "single-command")
    expect(messages).toEqual(["single-command"])
  } finally {off(); held.release(); await Promise.allSettled([a.close(), b.close(), server.close()])}
})

test("native concurrent acquisition shares the winning PC with existing waiters", async () => {
  const server = createRendezvousServer({token})
  const aBootstrap = await connectWebSocketSignaling({url: server.url, id: "a", token})
  const bBootstrap = await connectWebSocketSignaling({url: server.url, id: "b", token})
  const held = barrier()
  let offers = 0
  for (const bootstrap of [aBootstrap, bBootstrap]) {
    const send = bootstrap.send
    bootstrap.send = signal => {
      if (signal.description.type === "offer") {offers++; void held.promise.then(() => send(signal))}
      else send(signal)
    }
  }
  const live = new Set<ReturnType<PeerConnectionFactory>>()
  const rtc: PeerConnectionFactory = options => {
    const endpoint = native(options)
    live.add(endpoint)
    return {...endpoint, get localDescription() {return endpoint.localDescription}, async close() {try {await endpoint.close()} finally {live.delete(endpoint)}}}
  }
  const a = createPeerNetwork({id: "a", rtc, bootstrap: aBootstrap, dataChannels: ["oracle", "force"], timeoutMs: 3000})
  const b = createPeerNetwork({id: "b", rtc, bootstrap: bBootstrap, dataChannels: ["oracle", "force"], timeoutMs: 3000})
  try {
    await until(() => a.snapshot().peers.includes("b"))
    const outcomes = Promise.allSettled([a.connect("b"), a.connect("b"), b.connect("a"), b.connect("a")])
    await until(() => offers === 2)
    held.release()
    expect((await outcomes).map(result => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled", "fulfilled"])
    expect(live.size).toBe(2)
    expect(a.snapshot().links).toHaveLength(1)
    expect(b.snapshot().links[0]!.generation).toBe(a.snapshot().links[0]!.generation)
    expect(a.snapshot().links[0]!.channels).toEqual([{name: "oracle", state: "open"}, {name: "force", state: "open"}])
  } finally {held.release(); await Promise.allSettled([a.close(), b.close(), server.close()]); expect(live.size).toBe(0)}
}, 10_000)
