import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {createRoutedPeerNetwork} from "@metafor/tech-peer"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {readReleaseNodeConfiguration} from "../server/node"
import {startReleaseNode, type ReleaseNode, type ReleaseNodeConfiguration} from "@cosmos/release/node"
import {artifactBytes, artifactIdentity, releaseDigest, releaseGraph} from "./peer-fixture/data"

const token = "test-only-release-node-room-token"
const noRtc = () => {throw new Error("Direct RTC is unavailable in this fixture")}
const source = {async readGraph() {return releaseGraph}, async read() {return artifactBytes}}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-node-"))
  const tokenFile = join(root, "token")
  await writeFile(tokenFile, token, {mode: 0o600})
  const broker = createRendezvousServer({token, relay: true})
  return {root, tokenFile, broker,
    config(id: string, allowedPeers: string[]): ReleaseNodeConfiguration {return {id, signalingUrl: broker.url, tokenFile, allowedPeers, sources: ["@zavx0z/codespace-vpn"]}},
    async close() {await broker.close()
      await rm(root, {recursive: true, force: true})},
  }
}

async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Release node state did not settle")
    await Bun.sleep(5)
  }
}

test("release adapters exchange pinned graph/bytes using exactly one owned network", async () => {
  const local = await fixture()
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  let factories = 0
  let closes = 0
  try {
    a = await startReleaseNode({config: local.config("node-a", ["node-b"]), source}, {rtc: noRtc,
      network(options) {
        factories++
        const network = createRoutedPeerNetwork(options)
        return {...network, async close() {closes++
          await network.close()}}
      },
    })
    b = await startReleaseNode({config: local.config("node-b", ["node-a"]), source}, {rtc: noRtc})
    const peer = await a.peer("node-b")
    expect(await peer.getGraph(releaseDigest)).toEqual(releaseGraph)
    const chunks: Uint8Array[] = []
    for await (const chunk of peer.readArtifact(artifactIdentity)) chunks.push(chunk)
    expect(Buffer.concat(chunks)).toEqual(artifactBytes)
    expect(factories).toBe(1)
    const closing = a.close()
    expect(a.close()).toBe(closing)
    await closing
    expect(closes).toBe(1)
  } finally {await a?.close()
    await b?.close()
    await local.close()}
})

test("untrusted room member cannot obtain release source admission", async () => {
  const local = await fixture()
  let reads = 0
  let trusted: ReleaseNode | undefined
  let outsider: ReleaseNode | undefined
  try {
    trusted = await startReleaseNode({config: local.config("trusted", ["partner"]),
      source: {async readGraph() {reads++
        return releaseGraph}, async read() {reads++
        return artifactBytes}}}, {rtc: noRtc})
    outsider = await startReleaseNode({config: local.config("outsider", ["trusted"]), source}, {rtc: noRtc})
    await expect(outsider.peer("trusted").then(peer => peer.getGraph(releaseDigest))).rejects.toThrow()
    await expect(trusted.peer("outsider")).rejects.toThrow("authorized")
    expect(reads).toBe(0)
    expect(trusted.snapshot().peers).not.toContain("outsider")
    expect(trusted.snapshot().links).not.toContainEqual(expect.objectContaining({peerId: "outsider"}))
  } finally {await outsider?.close()
    await trusted?.close()
    await local.close()}
})

test("logical generation loss closes pending release requests and admits a fresh adapter", async () => {
  const local = await fixture()
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  let reads = 0
  let release!: () => void
  const waiting = new Promise<void>(resolve => {release = resolve})
  try {
    a = await startReleaseNode({config: local.config("node-a", ["node-b"]), source}, {rtc: noRtc})
    b = await startReleaseNode({config: local.config("node-b", ["node-a"]),
      source: {async readGraph() {reads++
        await waiting
        return releaseGraph}, async read() {return artifactBytes}}}, {rtc: noRtc})
    const previous = await a.peer("node-b")
    const oldGeneration = a.snapshot().links[0]!.generation
    const pending = previous.getGraph(releaseDigest)
    void pending.catch(() => {})
    await until(() => reads > 0)
    await a.network.disconnect("node-b")
    await expect(pending).rejects.toThrow()
    release()
    await until(() => a!.snapshot().links.some(link => link.peerId === "node-b" && link.state === "open" && link.generation !== oldGeneration))
    const next = await a.peer("node-b")
    expect(next).not.toBe(previous)
    await expect(previous.getGraph(releaseDigest)).rejects.toThrow("disconnected")
    expect(await next.getGraph(releaseDigest)).toEqual(releaseGraph)
  } finally {release()
    await a?.close()
    await b?.close()
    await local.close()}
})

test("whenIdle waits accepted release work and keeps the node connection available", async () => {
  const local = await fixture()
  let a: ReleaseNode | undefined
  let b: ReleaseNode | undefined
  let reads = 0
  let release!: () => void
  const waiting = new Promise<void>(resolve => {release = resolve})
  try {
    a = await startReleaseNode({config: local.config("node-a", ["node-b"]), source}, {rtc: noRtc})
    b = await startReleaseNode({config: local.config("node-b", ["node-a"]),
      source: {async readGraph() {reads++
        await waiting
        return releaseGraph}, async read() {return artifactBytes}}}, {rtc: noRtc})
    const request = (await a.peer("node-b")).getGraph(releaseDigest)
    await until(() => reads === 1)
    let idle = false
    const draining = b.whenIdle().then(() => {idle = true})
    await Bun.sleep(5)
    expect(idle).toBeFalse()
    release()
    expect(await request).toEqual(releaseGraph)
    await draining
    expect(idle).toBeTrue()
    expect(b.snapshot().links).toContainEqual(expect.objectContaining({peerId: "node-a", state: "open"}))
  } finally {release()
    await a?.close()
    await b?.close()
    await local.close()}
})

test("root canonical sources remain release/Quantum configuration and Provider composition is absent", async () => {
  const local = await fixture()
  const file = join(local.root, "node.json")
  try {
    const config = local.config("node-a", ["node-b"])
    await writeFile(file, JSON.stringify(config), {mode: 0o600})
    expect(await readReleaseNodeConfiguration(file)).toEqual(config)
    for (const invalid of [{...config, sources: ["zavx0z/capsule/browser"]}, {...config, provider: {peerId: "node-a"}}]) {
      await writeFile(file, JSON.stringify(invalid), {mode: 0o600})
      await expect(readReleaseNodeConfiguration(file)).rejects.toThrow("Invalid private release node configuration")
    }
  } finally {await local.close()}
})

test("Quantum private configuration and credential stay inside the selected Mass root without symlink traversal", async () => {
  const local = await fixture()
  const massRoot = join(local.root, "mass")
  const owner = join(massRoot, "configuration")
  const path = join(owner, "peer.json")
  const tokenFile = join(owner, "token")
  try {
    await mkdir(owner, {recursive: true})
    await writeFile(tokenFile, token, {mode: 0o600})
    const config = {...local.config("mass-owner", []), tokenFile}
    await writeFile(path, JSON.stringify(config), {mode: 0o600})
    expect(await readReleaseNodeConfiguration(path, {massRoot})).toEqual(config)
    await writeFile(path, JSON.stringify({...config, tokenFile: "token"}), {mode: 0o600})
    expect(await readReleaseNodeConfiguration(path, {massRoot})).toEqual(config)
    expect(JSON.parse(await Bun.file(path).text()).tokenFile).toBe("token")
    await expect(readReleaseNodeConfiguration(path, {massRoot: join(local.root, "neighbor")})).rejects.toThrow("Invalid private release node configuration")
    await writeFile(path, JSON.stringify({...config, tokenFile: local.tokenFile}), {mode: 0o600})
    await expect(readReleaseNodeConfiguration(path, {massRoot})).rejects.toThrow("Invalid private release node configuration")
    await writeFile(path, JSON.stringify(config), {mode: 0o600})
    await symlink(owner, join(massRoot, "alias"))
    await expect(readReleaseNodeConfiguration(join(massRoot, "alias", "peer.json"), {massRoot})).rejects.toThrow("Invalid private release node configuration")
    await symlink(massRoot, join(local.root, "mass-alias"))
    await expect(readReleaseNodeConfiguration(path, {massRoot: join(local.root, "mass-alias")})).rejects.toThrow("Invalid private release node configuration")
  } finally {await local.close()}
})
