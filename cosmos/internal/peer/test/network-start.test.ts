import {expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import start, {type MetaforCosmosInternalPeerProcessStart as Start} from "../process/start"
import stop from "../process/stop"

/** Tests only the local action lifetime; compiled canonical Process fencing belongs to the four-domain acceptance. */
test("network action owns one participant and pins its prepared source while credentials stay in directory Mass", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meta-network-start-"))
  const mass = join(directory, "mass", "configuration")
  const storeRoot = join(directory, "store")
  await mkdir(mass, {recursive: true})
  const token = "test-only-meta-network-room-credential"
  const tokenFile = join(mass, "token")
  const configurationFile = join(mass, "peer.json")
  const broker = createRendezvousServer({token, relay: true})
  const previous = {COSMOS_NODE_CONFIG: Bun.env.COSMOS_NODE_CONFIG, COSMOS_RELEASE_STORE: Bun.env.COSMOS_RELEASE_STORE, COSMOS_RELEASE_DIGEST: Bun.env.COSMOS_RELEASE_DIGEST}
  let releases = 0
  const input: Start.Input = {
    requestId: "start-one", energy: {}, signal: new AbortController().signal,
    mass: {configuration: {async acquire() {return {path: mass, signal: new AbortController().signal, async release() {releases++}}}}},
  }
  try {
    await writeFile(tokenFile, token, {mode: 0o600})
    await writeFile(configurationFile, JSON.stringify({id: "meta-network-test", signalingUrl: broker.url, tokenFile, allowedPeers: [], iceServers: []}), {mode: 0o600})
    const bytes = new TextEncoder().encode("export default 'prepared source'")
    const integrity = await artifactIntegrity(bytes.buffer)
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: "@fixture/source", version: "1.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", ...integrity}]}]}]}
    const digest = publishedReleaseGraphDigest(graph)
    await createInstalledReleaseStore({root: storeRoot}).prepare(graph, {async read() {return bytes}}, digest)
    Bun.env.COSMOS_NODE_CONFIG = configurationFile
    Bun.env.COSMOS_RELEASE_STORE = storeRoot
    Bun.env.COSMOS_RELEASE_DIGEST = digest
    expect(await start(input)).toEqual({ackId: "start-one", status: "running", error: null, oracleReady: false, oracleError: "Peer Oracle capability is not assigned"})
    const resource = input.energy.resource
    expect(resource?.digest).toBe(digest)
    expect(resource?.node?.id).toBe("meta-network-test")
    expect(resource?.lease.path).toBe(mass)
    expect(releases).toBe(0)
    input.requestId = "start-two"
    expect(await start(input)).toEqual({ackId: "start-two", status: "running", error: null, oracleReady: false, oracleError: "Peer Oracle capability is not assigned"})
    expect(input.energy.resource).toBe(resource)
    expect(releases).toBe(0)
    Bun.env.COSMOS_NODE_CONFIG = join(directory, "unrelated.json")
    expect(await start(input)).toEqual({ackId: "start-two", status: "failed", error: "Network startup failed", oracleReady: false, oracleError: "Peer Oracle startup failed"})
    expect(input.energy.resource).toBe(resource)
    expect(await stop({energy: input.energy, signal: input.signal, requestId: "stop-one"})).toEqual({ackId: "stop-one", status: "stopped", error: null})
    expect(releases).toBe(1)
    expect(input.energy.resource).toBeUndefined()
    Bun.env.COSMOS_NODE_CONFIG = configurationFile
    await writeFile(configurationFile, JSON.stringify({id: "meta-network-test", signalingUrl: broker.url, tokenFile,
      allowedPeers: [], iceServers: [], sources: ["metafor"]}), {mode: 0o600})
    expect(await start(input)).toEqual({ackId: "start-two", status: "failed", error: "Network startup failed", oracleReady: false, oracleError: "Peer Oracle startup failed"})
    expect(input.energy.resource).toBeUndefined()
    expect(releases).toBe(2)
  } finally {
    await stop.cleanup({energy: input.energy})
    for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete Bun.env[key]; else Bun.env[key] = value}
    await broker.close()
    await rm(directory, {recursive: true, force: true})
  }
})

test("a configuration outside the granted directory fails before opening network and releases its lease", async () => {
  const previous = {COSMOS_NODE_CONFIG: Bun.env.COSMOS_NODE_CONFIG, COSMOS_RELEASE_STORE: Bun.env.COSMOS_RELEASE_STORE, COSMOS_RELEASE_DIGEST: Bun.env.COSMOS_RELEASE_DIGEST}
  let releases = 0
  const input: Start.Input = {
    requestId: "foreign-path", energy: {}, signal: new AbortController().signal,
    mass: {configuration: {async acquire() {return {path: "/fixture/owned-mass", signal: new AbortController().signal, async release() {releases++}}}}},
  }
  try {
    Bun.env.COSMOS_NODE_CONFIG = "/fixture/foreign/peer.json"
    Bun.env.COSMOS_RELEASE_STORE = "/fixture/store"
    Bun.env.COSMOS_RELEASE_DIGEST = "a".repeat(64)
    expect(await start(input)).toEqual({ackId: "foreign-path", status: "failed", error: "Network startup failed", oracleReady: false, oracleError: "Peer Oracle startup failed"})
    expect(releases).toBe(1)
    expect(input.energy.resource).toBeUndefined()
  } finally {
    for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete Bun.env[key]; else Bun.env[key] = value}
  }
})

test("a failed partial-construction lease release remains in Energy for explicit stop retry", async () => {
  const previous = {COSMOS_NODE_CONFIG: Bun.env.COSMOS_NODE_CONFIG, COSMOS_RELEASE_STORE: Bun.env.COSMOS_RELEASE_STORE, COSMOS_RELEASE_DIGEST: Bun.env.COSMOS_RELEASE_DIGEST}
  let releases = 0
  const input: Start.Input = {
    requestId: "partial-start", energy: {}, signal: new AbortController().signal,
    mass: {configuration: {async acquire() {return {path: "/fixture/owned-mass", signal: new AbortController().signal, async release() {if (++releases === 1) throw new Error("release failed")}}}}},
  }
  try {
    Bun.env.COSMOS_NODE_CONFIG = "/fixture/foreign/peer.json"
    Bun.env.COSMOS_RELEASE_STORE = "/fixture/store"
    Bun.env.COSMOS_RELEASE_DIGEST = "a".repeat(64)
    expect(await start(input)).toEqual({ackId: "partial-start", status: "failed", error: "Network startup failed", oracleReady: false, oracleError: "Peer Oracle startup failed"})
    expect(input.energy.resource?.node).toBeUndefined()
    expect(input.energy.resource?.admission.open).toBeFalse()
    expect(input.energy.resource?.lease.path).toBe("/fixture/owned-mass")
    expect(await stop({energy: input.energy, signal: input.signal, requestId: "partial-stop"})).toEqual({ackId: "partial-stop", status: "stopped", error: null})
    expect(releases).toBe(2)
    expect(input.energy.resource).toBeUndefined()
  } finally {
    await stop.cleanup({energy: input.energy})
    for (const [key, value] of Object.entries(previous)) {if (value === undefined) delete Bun.env[key]; else Bun.env[key] = value}
  }
})
