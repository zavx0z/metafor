import {expect, test} from "bun:test"
import {chmod, mkdtemp, rm, symlink, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createServer} from "node:http"
import {createConnection} from "node:net"
import type {Duplex} from "node:stream"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {startReleaseNode, readReleaseNodeConfiguration, readReleaseNodeToken,
  type ReleaseNode, type ReleaseNodeConfiguration, type ReleaseNodeDependencies, type ReleaseNodeOptions} from "@cosmos/release/node"
const source = {async readGraph(): Promise<never> {throw new Error("Unused fixture source")}, async read(): Promise<never> {throw new Error("Unused fixture source")}}
const participant = (input: Pick<ReleaseNodeOptions, "config">, dependencies: ReleaseNodeDependencies = {}) => startReleaseNode({...input, source}, dependencies)

const token = "test-only-internal-peer-room-token"
const noRtc = () => {throw new Error("Direct RTC is unavailable in this fixture")}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "internal-peer-"))
  const tokenFile = join(root, "token")
  await writeFile(tokenFile, token, {mode: 0o600})
  const broker = createRendezvousServer({token, relay: true})
  return {root, tokenFile, broker,
    config(id: string, allowedPeers: string[]): ReleaseNodeConfiguration {return {id, signalingUrl: broker.url, tokenFile, allowedPeers}},
    async close() {await broker.close()
      await rm(root, {recursive: true, force: true})},
  }
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Peer state did not settle")
    await Bun.sleep(5)
  }
}
async function httpProxy(targetPort: number, targetHost = "127.0.0.1") {
  const sockets = new Set<Duplex>()
  const requests: string[] = []
  const server = createServer((_request, response) => {response.writeHead(405).end()})
  server.on("connection", socket => {sockets.add(socket)
    socket.on("close", () => sockets.delete(socket))})
  server.on("connect", (request, client, head) => {
    if (request.url !== `${targetHost}:${targetPort}`) {client.destroy()
      return}
    requests.push(request.url)
    const upstream = createConnection({host: "127.0.0.1", port: targetPort}, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
      if (head.byteLength) upstream.write(head)
      client.pipe(upstream)
      upstream.pipe(client)
    })
    sockets.add(upstream)
    upstream.on("close", () => sockets.delete(upstream))
    upstream.on("error", () => client.destroy())
    client.on("error", () => upstream.destroy())
    client.on("close", () => upstream.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Proxy fixture has no TCP listener")
  return {url: `http://127.0.0.1:${address.port}`, requests,
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

test("public release composition owns one network and its bounded lifecycle", async () => {
  const module = await import("@cosmos/release/node")
  expect(typeof module.startReleaseNode).toBe("function")
  expect(typeof module.readReleaseNodeConfiguration).toBe("function")
  const local = await fixture()
  let a: ReleaseNode | undefined
  try {
    const input: Pick<ReleaseNodeOptions, "config"> = {config: local.config("a", [])}
    a = await participant(input, {rtc: noRtc})
    expect(Object.keys(a).sort()).toEqual(["close", "id", "network", "observe", "peer", "refreshObservation", "snapshot", "whenIdle"])
    expect(a.id).toBe("a")
    const closing = a.close()
    expect(a.close()).toBe(closing)
    await closing
    expect((await fetch(local.broker.url.replace("ws:", "http:"))).status).toBe(426)
  } finally {await a?.close()
    await local.close()}
})

test("failed network birth releases admitted credential identity for a later participant", async () => {
  const local = await fixture()
  let next: ReleaseNode | undefined
  try {
    await expect(participant({config: local.config("a", [])}, {rtc: noRtc, network() {throw new Error("private-platform-detail")}})).rejects.toThrow("Peer participant startup failed")
    await Bun.sleep(10)
    next = await participant({config: local.config("a", [])}, {rtc: noRtc})
    expect(next.id).toBe("a")
  } finally {await next?.close()
    await local.close()}
})

test("room membership does not admit a peer outside the local allowlist", async () => {
  const local = await fixture()
  let owner: ReleaseNode | undefined
  let outsider: ReleaseNode | undefined
  try {
    owner = await participant({config: local.config("owner", [])}, {rtc: noRtc})
    outsider = await participant({config: local.config("outsider", ["owner"])}, {rtc: noRtc})
    await until(() => outsider!.snapshot().peers.includes("owner"))
    await outsider.network.connect("owner").catch(() => {})
    await until(() => owner!.network.snapshot().links.length === 0 && outsider!.network.snapshot().links.length === 0)
    expect(owner.snapshot().peers).toEqual([])
    expect(owner.snapshot().links).toEqual([])
  } finally {await outsider?.close()
    await owner?.close()
    await local.close()}
})

test("all external sockets use scoped native CONNECT and independent application lines", async () => {
  const local = await fixture()
  const endpoint = new URL(local.broker.url)
  endpoint.hostname = "metafor-peer.example.test"
  const proxy = await httpProxy(Number(endpoint.port), endpoint.hostname)
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  try {
    a = await participant({config: {...local.config("node-a", ["node-b"]), signalingUrl: endpoint.href, webSocketProxyUrl: proxy.url}}, {rtc: noRtc})
    b = await participant({config: local.config("node-b", ["node-a"])}, {rtc: noRtc})
    await until(() => a!.snapshot().peers.includes("node-b"))
    await a.network.connect("node-b")
    expect(proxy.requests).toHaveLength(2)
    const received: string[] = []
    b.network.onData(event => received.push(String(event.data)))
    await a.network.send("node-b", "one", {channel: "fixture:one"})
    expect(proxy.requests).toHaveLength(3)
    await a.network.send("node-b", "two", {channel: "fixture:two"})
    expect(received).toEqual(["one", "two"])
    expect(proxy.requests).toHaveLength(4)
    expect(JSON.stringify(a.snapshot())).not.toContain(proxy.url)
    expect(JSON.stringify(a.snapshot())).not.toContain(token)
  } finally {await a?.close()
    await b?.close()
    await proxy.close()
    await local.close()}
})

test("loopback self-broker remains direct despite configured proxy", async () => {
  const local = await fixture()
  const proxy = await httpProxy(Number(new URL(local.broker.url).port))
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  try {
    a = await participant({config: {...local.config("node-a", ["node-b"]), webSocketProxyUrl: proxy.url}}, {rtc: noRtc})
    b = await participant({config: local.config("node-b", ["node-a"])}, {rtc: noRtc})
    await a.network.connect("node-b")
    await a.network.send("node-b", "local")
    expect(proxy.requests).toEqual([])
  } finally {await a?.close()
    await b?.close()
    await proxy.close()
    await local.close()}
})

test("private network configuration validates trust, bounds JSON and excludes foreign policy", async () => {
  const local = await fixture()
  const file = join(local.root, "node.json")
  const config = {...local.config("node-a", ["node-b"]), webSocketProxyUrl: "http://127.0.0.1:11809", rtc: {ipv4: true, ipv6: false},
    iceServers: [{urls: "turn:relay.example.test:3478", username: "operator-user", credential: "private-ice-credential"}]}
  try {
    await writeFile(file, JSON.stringify(config), {mode: 0o600})
    expect(await readReleaseNodeConfiguration(file)).toEqual(config)
    await chmod(file, 0o644)
    await expect(readReleaseNodeConfiguration(file)).rejects.toThrow("private")
    await chmod(file, 0o600)
    await symlink(file, join(local.root, "link"))
    await expect(readReleaseNodeConfiguration(join(local.root, "link"))).rejects.toThrow("private")
    for (const bad of [
      {...config, sources: ["zavx0z/capsule"]},
      {...config, signalingUrl: "wss://example.test/peer?token=private"},
      {...config, signalingUrl: "wss://user:private@example.test/peer"},
      {...config, allowedPeers: ["node-a"]},
      {...config, rtc: {ipv4: false, ipv6: false}},
      {...config, webSocketProxyUrl: "http://example.test:11809"},
      {...config, webSocketProxyUrl: "http://user:private@127.0.0.1:11809"},
      {...config, webSocketProxyUrl: "http://127.0.0.1:11809?token=private"},
      {...config, webSocketProxyUrl: "http://127.0.0.1:11809#private"},
      {...config, webSocketProxyUrl: "socks5://127.0.0.1:11809"},
      {...config, token: "inline-private-token"},
    ]) {
      await writeFile(file, JSON.stringify(bad), {mode: 0o600})
      await expect(readReleaseNodeConfiguration(file)).rejects.toThrow("Invalid private release node configuration")
    }
    await writeFile(file, " ".repeat(64 * 1024 + 1), {mode: 0o600})
    await expect(readReleaseNodeConfiguration(file)).rejects.toThrow("private")
  } finally {await local.close()}
})


test("relative credential stays portable when its private configuration directory moves", async () => {
  const {mkdir, rename} = await import("node:fs/promises")
  const local = await fixture()
  try {
    const before = join(local.root, "before")
    const after = join(local.root, "after")
    await mkdir(before)
    await writeFile(join(before, "token"), token, {mode: 0o600})
    const raw = {...local.config("portable", []), tokenFile: "token"}
    await writeFile(join(before, "peer.json"), JSON.stringify(raw), {mode: 0o600})
    expect((await readReleaseNodeConfiguration(join(before, "peer.json"))).tokenFile).toBe(join(before, "token"))
    await rename(before, after)
    const config = await readReleaseNodeConfiguration(join(after, "peer.json"))
    expect(config.tokenFile).toBe(join(after, "token"))
    expect(await readReleaseNodeToken(config)).toBe(token)
    expect(JSON.parse(await Bun.file(join(after, "peer.json")).text()).tokenFile).toBe("token")
    await expect(participant({config: raw}, {rtc: noRtc})).rejects.toThrow("Invalid private release node configuration")
  } finally {await local.close()}
})


test("public native release graph has no internal peer implementation dependency", async () => {
  const build = await Bun.build({entrypoints: [new URL("../node.ts", import.meta.url).pathname], target: "bun",
    conditions: ["cosmos:server"], metafile: true})
  expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
  expect(Object.keys(build.metafile!.inputs).filter(path => path.includes("cosmos/internal/peer/"))).toEqual([])
  expect(Object.keys(build.metafile!.inputs).some(path => path.includes("tech/peer/"))).toBeTrue()
})

test("release native composition prefers actual RTC for the pinned application graph", async () => {
  const {createWeriftPeerConnectionFactory} = await import("@metafor/tech-peer/werift")
  const local = await fixture()
  const rtc = createWeriftPeerConnectionFactory({iceUseIpv4: false, iceUseIpv6: false,
    iceAdditionalHostAddresses: ["127.0.0.1"], iceInterfaceAddresses: {udp4: "127.0.0.1"},
    iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1"})
  const {releaseGraph, releaseDigest} = await import("./peer-fixture/data")
  const pinned = {async readGraph() {return releaseGraph}, async read(): Promise<never> {throw new Error("Unused artifact")}}
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  try {
    a = await startReleaseNode({config: {...local.config("native-a", ["native-b"]), iceServers: []}, source: pinned}, {rtc})
    b = await startReleaseNode({config: {...local.config("native-b", ["native-a"]), iceServers: []}, source: pinned}, {rtc})
    expect(await (await a.peer("native-b")).getGraph(releaseDigest)).toEqual(releaseGraph)
    expect(a.snapshot().links[0]?.transport).toBe("direct")
    expect(b.snapshot().links[0]?.transport).toBe("direct")
  } finally {await a?.close(); await b?.close(); await local.close()}
}, 10_000)
