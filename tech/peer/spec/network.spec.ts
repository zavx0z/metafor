import {expect, test} from "bun:test"
import {createPeerNetwork} from "../index"
import type {PeerData, PeerNetwork} from "../contracts"
import {createRendezvousServer} from "../rendezvous"
import {connectWebSocketSignaling} from "../signaling"
import {createWeriftPeerConnectionFactory} from "../werift"

const token = "test-only-rendezvous-room-token"
const rtc = createWeriftPeerConnectionFactory({
  iceAdditionalHostAddresses: ["127.0.0.1"], iceUseIpv4: true, iceUseIpv6: false,
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1",
})
async function waitUntil(check: () => boolean, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Condition timed out")
    await Bun.sleep(10)
  }
}
function nextData(network: PeerNetwork, channel: string): Promise<PeerData> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { dispose()
      reject(new Error("RTC data timed out")) }, 10_000)
    const dispose = network.onData(event => {
      if (event.channel !== channel) return
      dispose()
      clearTimeout(timer)
      resolve(event)
    })
  })
}

test("Три настоящих RTC peer знакомятся через соседа после остановки bootstrap и сохраняют прямую связь", async () => {
  const broker = createRendezvousServer({token})
  const networks: PeerNetwork[] = []
  try {
    for (const id of ["a", "b", "c"]) {
      const bootstrap = await connectWebSocketSignaling({url: broker.url, id, token})
      networks.push(createPeerNetwork({id, rtc, bootstrap, timeoutMs: 20_000}))
    }
    const [a, b, c] = networks as [PeerNetwork, PeerNetwork, PeerNetwork]
    await a.connect("b")
    await b.connect("c")
    await waitUntil(() => c.snapshot().links.some(link => link.state === "open"))
    await broker.close()
    await waitUntil(() => networks.every(network => !network.snapshot().bootstrap))
    expect(a.snapshot().links[0]?.state).toBe("open")
    await a.connect("c", {via: "b"})
    await waitUntil(() => c.snapshot().links.some(link => link.peerId === "a" && link.state === "open"))
    await b.close()
    await waitUntil(() => a.snapshot().links.length === 1 && c.snapshot().links.length === 1)
    expect(a.snapshot().links[0]?.peerId).toBe("c")
    expect(c.snapshot().links[0]?.peerId).toBe("a")
    const command = nextData(c, "acp:session-1")
    await a.send("c", "command-after-introducer-left", {channel: "acp:session-1"})
    expect((await command).data).toBe("command-after-introducer-left")
    const bytes = new Uint8Array(1024 * 1024 + 37)
    crypto.getRandomValues(bytes.subarray(0, 65536))
    bytes[bytes.length - 1] = 211
    const artifact = nextData(a, "release")
    await c.send("a", bytes, {channel: "release"})
    const received = (await artifact).data as Uint8Array
    expect(received).toEqual(bytes)
    await expect(a.send("c", new Uint8Array(16 * 1024 * 1024 + 1))).rejects.toThrow("limit")
  } finally {
    await broker.close()
    await Promise.allSettled(networks.map(network => network.close()))
  }
}, 45_000)

test("Одновременный повтор connect использует одно поколение связи", async () => {
  const broker = createRendezvousServer({token})
  const a = createPeerNetwork({id: "a", rtc, bootstrap: await connectWebSocketSignaling({url: broker.url, id: "a", token})})
  const b = createPeerNetwork({id: "b", rtc, bootstrap: await connectWebSocketSignaling({url: broker.url, id: "b", token})})
  try {
    await Promise.all([a.connect("b"), a.connect("b"), b.connect("a")])
    expect(a.snapshot().links).toHaveLength(1)
    const generation = a.snapshot().links[0]!.generation
    await a.connect("b")
    expect(a.snapshot().links[0]!.generation).toBe(generation)
    a.closeBootstrap()
    const result = nextData(b, "app")
    await a.send("b", new Uint8Array())
    expect((await result).data).toEqual(new Uint8Array())
  } finally { await Promise.allSettled([a.close(), b.close(), broker.close()]) }
}, 20_000)
