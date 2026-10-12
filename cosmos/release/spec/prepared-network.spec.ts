import {expect, test} from "bun:test"
import {mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, extname, join, resolve} from "node:path"
import {prepareMetaPackage, type PreparedMetaPackage} from "@metafor/tech-build"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type InstalledArtifactIdentity, type PublishedReleaseGraph, type PublishedReleasePackage} from "@metafor/tech-release/installed"
import {startReleaseNode, type ReleaseNode} from "@cosmos/release/node"
import {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import {open as openBoundary} from "../../../quantum/boundary/sqlite"
import {EnergyCatalogStore} from "../../../quantum/energy/graph/catalog"
import {createFilesystemEnergyMassStore, EnergyMassCatalog, EnergyMassGate} from "../../../quantum/energy/mass"
import type {MassDirectoryHandle} from "@metafor/types/metafor/mass"
import {evaluateMetaSource} from "../../../quantum/dark/load"

const ROOT = "@fixture/network-root"
const PARTICIPANT = "prepared-network"
const RECEIVER = "reserve-receiver"
const token = "test-only-prepared-network-room-credential"
const alive = (pid: number) => {try {process.kill(pid, 0); return true} catch {return false}}

async function processTree(root: number) {
  const command = Bun.spawn(["ps", "-axo", "pid=,ppid=,command="], {stdout: "pipe", stderr: "pipe"})
  const output = await new Response(command.stdout).text()
  if (await command.exited !== 0) throw new Error("Cannot inspect owned fixture processes")
  const rows = output.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line)
    return match ? [{pid: Number(match[1]), parent: Number(match[2]), command: match[3]!}] : []
  })
  const known = new Set([root])
  const result: typeof rows = []
  for (;;) {
    const next = rows.filter(row => known.has(row.parent) && !known.has(row.pid))
    if (!next.length) return result
    for (const row of next) {known.add(row.pid); result.push(row)}
  }
}
async function until<T>(read: () => Promise<T | undefined>, timeout: number, label: string): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {const result = await read(); if (result !== undefined) return result; await Bun.sleep(25)}
  throw new Error(`${label} timed out`)
}
function packageGraph(prepared: PreparedMetaPackage): PublishedReleasePackage {
  if (!prepared.result.success) throw new Error(`${prepared.result.stage}: ${prepared.result.stderr}`)
  return {name: prepared.address, version: prepared.version, dependencies: {}, environments: [{env: "server",
    publicArtifacts: Object.fromEntries(prepared.owner.sources.filter(source => source.artifact !== ".").map(source => [source.artifact, /\.[cm]?[jt]sx?$/.test(source.source) ? ".js" : extname(source.source)])),
    outputs: prepared.result.outputs.map(output => ({artifact: output.artifact!, kind: output.kind!, type: output.type, sha256: output.sha256, size: output.size,
      ...(output.load ? {load: output.load} : {}), ...(output.sourceMapFor ? {sourceMapFor: output.sourceMapFor} : {})})),
  }]}
}
async function canonical(dataRoot: string) {
  const boundary = await openBoundary(join(dataRoot, "dev.sqlite"))
  try {
    const state = await boundary.initialState()
    const projection = await boundary.initialProjection()
    const values = (src: string) => {
      const atom = state.atoms.find(atom => atom.wimp === src)
      if (!atom) throw new Error(`Canonical fixture Atom is missing: ${src}`)
      const fields = state.declarations.filter(item => item.src === src && item.section === "fields")
      return {atom, values: Object.fromEntries(fields.map(field => [String(field.value.key), atom.values.find(value => value.field === field.value.id)?.value]))}
    }
    return {state, projection, root: values(ROOT), peer: values("@internal/peer")}
  } finally {await boundary.close()}
}

/** Actual compiled CLI with prepared Meta/actions; no production provisioner or Capsule is simulated. */
test("prepared network-only Root runs from immutable Meta entries, restores without its former root path and drains reserve work", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "prepared-network-world-")))
  const producer = join(directory, "producer")
  const rootSource = join(producer, "root")
  const dataRoot = join(directory, "data")
  const storeRoot = join(dataRoot, "store")
  const cli = join(directory, "metafor.mjs")
  const observed = new Map<number, string>()
  let current: ReturnType<typeof launch> | undefined
  let receiver: ReleaseNode | undefined
  await mkdir(rootSource, {recursive: true})
  await symlink(resolve(import.meta.dir, "../../../node_modules"), join(rootSource, "node_modules"))
  await writeFile(join(rootSource, "package.json"), JSON.stringify({name: ROOT, version: "1.0.0", type: "module", exports: {".": "./index.ts", "./meta": "./meta.ts", "./payload": "./payload.bin"}, dependencies: {"@internal/peer": "workspace:*", "@cosmos/peer-lifecycle": "workspace:*"}}))
  await writeFile(join(rootSource, "index.ts"), 'export default "network-only Root product"\n')
  await writeFile(join(rootSource, "meta.ts"), await readFile(resolve(import.meta.dir, "fixture/network-root.ts")))
  const payload = Uint8Array.from({length: 64 * 1024}, (_, index) => index % 251)
  await writeFile(join(rootSource, "payload.bin"), payload)
  const reservation = Bun.serve({port: 0, fetch: () => new Response()})
  const port = reservation.port!
  await reservation.stop(true)
  let nodeConfig: string | undefined
  let digest = ""
  function launch(rootPath?: string) {
    const child = Bun.spawn([process.execPath, cli, "--port", String(port), "--data-dir", dataRoot, "--release", digest, ...(rootPath ? ["--meta-root", rootPath] : [])],
      {cwd: directory, env: {PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, METAFOR_WEAK_BACKEND: "cpu", COSMOS_NODE_CONFIG: nodeConfig}, stdout: "pipe", stderr: "pipe"})
    let stdout = ""
    let stderr = ""
    const out = (async () => {for await (const bytes of child.stdout) stdout += new TextDecoder().decode(bytes)})()
    const err = (async () => {for await (const bytes of child.stderr) stderr += new TextDecoder().decode(bytes)})()
    const inventory = async () => {const entries = await processTree(child.pid); for (const entry of entries) observed.set(entry.pid, entry.command); return entries}
    return {child, inventory, async ready() {
      return await until(async () => {
        await inventory()
        if (child.exitCode !== null) throw new Error(`Prepared CLI exited ${child.exitCode}: ${stderr.slice(-4000)}\n${stdout.slice(-2000)}`)
        const response = await fetch(`http://127.0.0.1:${port}/health`).catch(() => undefined)
        if (!response?.ok) return
        return await response.json()
      }, 30_000, "Prepared CLI readiness")
    }, async exit() {
      await until(async () => {await inventory(); return child.exitCode !== null ? true : undefined}, 15_000, "Prepared CLI exit")
      await child.exited
      await out; await err
      return {code: child.exitCode, stderr, stdout}
    }, async stop() {child.kill("SIGTERM"); return await this.exit()}}
  }
  try {
    const prepared = [] as PreparedMetaPackage[]
    for (const [root, address, folder] of [[rootSource, ROOT, "root"], [resolve(import.meta.dir, "../../internal/peer"), "@internal/peer", "peer"]]) {
      prepared.push(await prepareMetaPackage({root: root!, address: address!, outdir: join(producer, `${folder}-outputs`), readDeclaration: async path => evaluateMetaSource(await Bun.file(path).text())}))
    }
    for (const item of prepared) expect(item.result.success, `${item.result.stage}: ${item.result.stderr}`).toBeTrue()
    const [cliBuild, releaseBuild] = await Promise.all([
      Bun.build({entrypoints: [resolve(import.meta.dir, "../../cli.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"]}),
      Bun.build({entrypoints: [resolve(import.meta.dir, "../server/index.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]}),
    ])
    expect(cliBuild.success, cliBuild.logs.map(String).join("\n")).toBeTrue()
    expect(releaseBuild.success, releaseBuild.logs.map(String).join("\n")).toBeTrue()
    await Bun.write(cli, cliBuild.outputs[0]!)
    const releaseBytes = new Uint8Array(await releaseBuild.outputs[0]!.arrayBuffer())
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [
      {name: "@cosmos/release", version: "92.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", ...await artifactIntegrity(releaseBytes.buffer)}]}]},
      ...prepared.map(packageGraph),
    ]}
    digest = publishedReleaseGraphDigest(graph)
    const store = createInstalledReleaseStore({root: storeRoot})
    await store.prepare(graph, {async read(identity) {
      if (identity.name === "@cosmos/release") return releaseBytes
      const owner = prepared.find(item => item.address === identity.name)
      const output = owner?.result.outputs.find(output => output.artifact === identity.artifact && output.sha256 === identity.sha256)
      if (!output) throw new Error("Prepared fixture identity is absent")
      return Bun.file(output.path).stream()
    }}, digest)
    const rootMember = graph.packages.find(member => member.name === ROOT)!
    const rootOutput = rootMember.environments[0]!.outputs.find(output => output.artifact === ".")!
    const rootPath = dirname(await store.artifactPath(digest, {name: ROOT, version: rootMember.version, env: "server", ...rootOutput}))
    const payloadOutput = rootMember.environments[0]!.outputs.find(output => output.artifact === "./payload")!
    const payloadIdentity: InstalledArtifactIdentity = {name: ROOT, version: rootMember.version, env: "server", artifact: payloadOutput.artifact, sha256: payloadOutput.sha256, size: payloadOutput.size}
    await rm(producer, {recursive: true, force: true})
    expect(await Bun.file(join(rootSource, "meta.ts")).exists()).toBeFalse()

    // A source-shaped file under the store is not an admitted installed entry.
    const unverified = join(storeRoot, "unverified-root")
    await mkdir(unverified)
    await writeFile(join(unverified, "package.json"), JSON.stringify({name: "@fixture/unverified", type: "module"}))
    await writeFile(join(unverified, "meta.ts"), 'export default MetaFor("Unverified").fields(() => ({})).superposition({ready:{}}).mass(() => ({})).energy().processes(() => []).reactions().matter().bulk()\n')
    current = launch(join(unverified, "meta.ts"))
    const rejected = await current.exit()
    expect(rejected.code).not.toBe(0)
    expect(rejected.stderr).toContain("Selected installed root is not a verified Meta entry or package version directory")
    current = undefined
    await rm(unverified, {recursive: true})

    // TEST prepared-world setup: import the real graph before obtaining its exact canonical Mass identity.
    current = launch(rootPath)
    await current.ready()
    let stopped = await current.stop()
    expect(stopped.code, stopped.stderr).toBe(0)
    current = undefined
    const initial = await canonical(dataRoot)
    expect(initial.root.values.status).toBe("stopped")
    expect(initial.root.values.requestId).toBe(initial.root.values.ackId)
    const catalog = new EnergyCatalogStore()
    for (const entry of initial.projection.entries) catalog.apply({...entry, by: "boundary", ts: 0})
    const artifact = catalog.mass(initial.peer.atom.id).find(item => item.key === "configuration")!
    expect(artifact.format).toBe("directory")
    const masses = createFilesystemEnergyMassStore(new EnergyMassGate(), new EnergyMassCatalog(join(dataRoot, "mass")))
    const context = {energyId: "prepared-world-test", atomId: initial.peer.atom.id, wimp: "@internal/peer", state: "stopped"}
    masses.authorize!(context, [artifact])
    const lease = await (masses.get(context).configuration as MassDirectoryHandle).acquire()
    const tokenFile = join(lease.path, "token")
    nodeConfig = join(lease.path, "peer.json")
    try {
      await writeFile(tokenFile, token, {mode: 0o600})
      await writeFile(nodeConfig, JSON.stringify({id: PARTICIPANT, signalingUrl: `ws://127.0.0.1:${port}/peer`, tokenFile: "token", allowedPeers: [RECEIVER], iceServers: [], rtc: {ipv4: true, ipv6: false}}), {mode: 0o600})
    } finally {await lease.release(); masses.clear!()}

    // Former path is deliberately absent: restoration must use Boundary and the immutable code map.
    const formerRoot = join(storeRoot, "absent-former-root")
    current = launch(formerRoot)
    await current.ready()
    await expect(connectWebSocketSignaling({url: `ws://127.0.0.1:${port}/peer`, id: "unauthorized", token: "wrong-credential", relay: true, reconnect: false})).rejects.toThrow()
    receiver = await startReleaseNode({config: {id: RECEIVER, signalingUrl: `ws://127.0.0.1:${port}/peer`, tokenFile, allowedPeers: [PARTICIPANT], iceServers: []}, source: {
      async readGraph() {throw new Error("Receiver is not a source")}, async read() {throw new Error("Receiver is not a source")},
    }}, {rtc: () => {throw new Error("Force the admitted reserve in this fixture")}})
    await until(async () => receiver!.snapshot().peers.includes(PARTICIPANT) ? true : undefined, 5000, "Prepared participant roster")
    const remote = await receiver.peer(PARTICIPANT)
    expect(await remote.getGraph(digest)).toEqual(graph)
    expect(receiver.snapshot().links.some(link => link.peerId === PARTICIPANT && link.transport === "relay")).toBeTrue()
    const stream = remote.readArtifact(payloadIdentity)
    const iterator = stream[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.done).toBeFalse()
    const chunks = [first.value!]
    current.child.kill("SIGTERM")
    await until(async () => {
      try {await remote.getGraph(digest); return undefined} catch {return true}
    }, 2000, "Meta source admission close")
    expect(current.child.exitCode).toBeNull()
    for (;;) {const next = await iterator.next(); if (next.done) break; chunks.push(next.value)}
    const received = Buffer.concat(chunks)
    expect(received.byteLength).toBe(payloadIdentity.size)
    expect(new Bun.CryptoHasher("sha256").update(received).digest("hex")).toBe(payloadIdentity.sha256)
    stopped = await current.exit()
    expect(stopped.code, stopped.stderr).toBe(0)
    current = undefined
    await receiver.close(); receiver = undefined
    const after = await canonical(dataRoot)
    expect(after.root.values.status).toBe("stopped")
    expect(after.root.values.error).toBeNull()
    expect(after.root.values.ack).toBe(true)
    expect(after.root.values.requestId).toBe(after.root.values.ackId)
    expect(after.peer.values.requestId).toBe(after.root.values.requestId)
    expect(after.peer.values.ackId).toBe(after.root.values.ackId)
    expect(after.root.values.requestId).not.toBe(initial.root.values.requestId)
    expect(after.projection.entries.filter(entry => entry.path === "wimp")).toEqual(initial.projection.entries.filter(entry => entry.path === "wimp"))
    for (const pid of observed.keys()) expect(alive(pid)).toBeFalse()
  } finally {
    await receiver?.close()
    if (current?.child.exitCode === null) {
      current.child.kill("SIGTERM")
      await Promise.race([current.child.exited, Bun.sleep(10_000)])
      if (current.child.exitCode === null) {current.child.kill("SIGKILL"); await current.child.exited}
    }
    for (const entry of await processTree(process.pid)) if (observed.has(entry.pid) && entry.command === observed.get(entry.pid) && entry.command.includes(directory)) {
      try {process.kill(entry.pid, "SIGKILL")} catch {}
    }
    await rm(directory, {recursive: true, force: true})
  }
}, 180_000)
