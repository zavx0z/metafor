import {expect, test} from "bun:test"
import {createSocket} from "node:dgram"
import {createPeerNetwork} from "../index"
import {createWeriftPeerConnectionFactory} from "../werift"
import {createRendezvousServer} from "../rendezvous"
import {connectWebSocketSignaling} from "../signaling"

const rtc = createWeriftPeerConnectionFactory({
  // Disable interface enumeration, then explicitly include only loopback.
  iceUseIpv4: false, iceUseIpv6: false, iceAdditionalHostAddresses: ["127.0.0.1"],
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1",
})

test("explicit empty ICE servers gather host-only loopback candidates without the native default STUN timeout", async () => {
  const pc = rtc({iceServers: []})
  try {
    pc.createDataChannel("oracle")
    pc.createDataChannel("force")
    const start = performance.now()
    await pc.setLocalDescription(await pc.createOffer())
    expect(performance.now() - start).toBeLessThan(1000)
    const candidates = pc.localDescription!.sdp.split("\r\n").filter(line => line.startsWith("a=candidate:"))
    expect(candidates).toHaveLength(1)
    expect(candidates.every(line => line.split(" ")[4] === "127.0.0.1" && line.includes(" typ host"))).toBeTrue()
  } finally {await pc.close()}
}, 7000)

test("an explicitly supplied STUN server still receives native binding requests", async () => {
  const server = createSocket("udp4")
  let requests = 0
  server.on("message", (request, remote) => {
    if (request.length < 20 || request.readUInt16BE(0) !== 1 || request.readUInt32BE(4) !== 0x2112a442) return
    requests++
    const response = Buffer.alloc(32)
    request.copy(response, 0, 0, 20)
    response.writeUInt16BE(0x0101, 0)
    response.writeUInt16BE(12, 2)
    response.writeUInt16BE(0x0020, 20)
    response.writeUInt16BE(8, 22)
    response[25] = 1
    response.writeUInt16BE(remote.port ^ 0x2112, 26)
    response.writeUInt32BE((0x7f000001 ^ 0x2112a442) >>> 0, 28)
    server.send(response, remote.port, remote.address)
  })
  await new Promise<void>(resolve => server.bind(0, "127.0.0.1", resolve))
  const address = server.address()
  const pc = rtc({iceServers: [{urls: `stun:127.0.0.1:${address.port}`}]})
  try {
    pc.createDataChannel("oracle")
    await pc.setLocalDescription(await pc.createOffer())
    expect(requests).toBeGreaterThan(0)
    expect(pc.localDescription!.sdp).toContain(" typ srflx")
  } finally {await pc.close(); await new Promise<void>(resolve => server.close(() => resolve()))}
}, 7000)

test("real native two-DC loopback connection opens promptly with explicit host candidates and no STUN", async () => {
  const token = "test-only-host-ice-no-external-stun"
  const broker = createRendezvousServer({token})
  const a = createPeerNetwork({id: "a", rtc, iceServers: [], dataChannels: ["oracle", "force"], bootstrap: await connectWebSocketSignaling({url: broker.url, id: "a", token})})
  const b = createPeerNetwork({id: "b", rtc, iceServers: [], dataChannels: ["oracle", "force"], bootstrap: await connectWebSocketSignaling({url: broker.url, id: "b", token})})
  try {
    const start = performance.now()
    await a.connect("b")
    expect(performance.now() - start).toBeLessThan(2000)
    const got = Promise.withResolvers<string[]>()
    const channels: string[] = []
    b.onData(event => {channels.push(event.physicalChannel!); if (channels.length === 2) got.resolve(channels)})
    await a.send("b", "query", {physicalChannel: "oracle"})
    await a.send("b", "particle", {physicalChannel: "force"})
    expect((await got.promise).sort()).toEqual(["force", "oracle"])
  } finally {await Promise.allSettled([a.close(), b.close(), broker.close()])}
}, 7000)
