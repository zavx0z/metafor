import {expect, test} from "bun:test"
import {mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {extname, join, resolve} from "node:path"
import {prepareMetaPackage, type PreparedMetaPackage} from "@metafor/tech-build"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph, type PublishedReleasePackage} from "@metafor/tech-release/installed"
import {createRendezvousHandler, type RendezvousSession} from "@metafor/tech-peer/rendezvous"
import {locateDirectoryMass} from "energy/mass-location"
import {backupBoundaryDatabase} from "boundary/backup"
import type {BoundaryInitialProjection, BoundaryInitialState} from "shared/protocol/boundary/initial"
import {evaluateMetaSource} from "../../../quantum/dark/load"
import {createInstalledMetaMapping} from "../server/installed/metas"
import {parseMetaAddress} from "@metafor/types/metafor/graph"

function member(item: PreparedMetaPackage): PublishedReleasePackage {
  return {name: item.address, version: item.version, dependencies: {}, environments: [{env: "server",
    publicArtifacts: Object.fromEntries(item.owner.sources.filter(source => source.artifact !== ".").map(source => [source.artifact, /\.[cm]?[jt]sx?$/.test(source.source) ? ".js" : extname(source.source)])),
    outputs: item.result.outputs.map(output => ({artifact: output.artifact!, kind: output.kind!, type: output.type, sha256: output.sha256, size: output.size,
      ...(output.load ? {load: output.load} : {}), ...(output.sourceMapFor ? {sourceMapFor: output.sourceMapFor} : {})})),
  }]}
}
const values = (state: BoundaryInitialState, source: string) => {
  const atom = state.atoms.find(atom => atom.wimp === source)!
  const fields = state.declarations.filter(item => item.src === source && item.section === "fields")
  const fieldValues = Object.fromEntries(fields.map(item => [item.value.key, atom.values.find(value => value.field === item.value.id)?.value]))
  const name = state.declarations.find(item => item.src === source && item.section === "states" && item.value.id === atom.state)?.value.name
  return {atom, values: fieldValues, state: name}
}
const alive = (pid: number) => {try {process.kill(pid, 0); return true} catch {return false}}

/** Production Meta/Process code, actual four domains and canonical Mass; no direct store/gate seeding. */
test.each([
  {source: "@internal/network", folder: "../../internal/network", full: false},
  {source: "metafor", folder: "../../..", full: true},
])("$source prepares private Mass without participation; restored stopped birth uses ordinary policy", async scenario => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "network-prepared-quantum-")))
  const producer = join(root, "producer")
  const stateRoot = join(root, "state")
  const inbox = join(root, "inbox")
  const inputFile = join(root, "initial-fields.json")
  const executable = join(root, "quantum.mjs")
  const bin = join(root, "bin")
  const dockerLog = join(root, "docker-calls")
  const token = "test-only-native-network-preparation-credential"
  const rendezvous = createRendezvousHandler({token, relay: true})
  let connections = 0
  const broker = Bun.serve<RendezvousSession>({hostname: "127.0.0.1", port: 0,
    fetch(request, server) {connections++; return rendezvous.upgrade(request, (request, data) => server.upgrade(request, {data}))},
    websocket: rendezvous.websocket,
  })
  let current: Awaited<ReturnType<typeof launch>> | undefined
  await mkdir(inbox)
  await mkdir(bin)
  await writeFile(join(bin, "docker"), '#!/bin/sh\nprintf "called\\n" >> "$FIXTURE_DOCKER_LOG"\nexit 71\n', {mode: 0o755})
  await mkdir(stateRoot)
  const store = createInstalledReleaseStore({root: join(stateRoot, "store")})
  let digest = ""
  let mapping: Awaited<ReturnType<typeof createInstalledMetaMapping>> = {}
  type Ready = {type: "ready", initialization: {mode: string}, initialFieldReads: number, rootReads: number,
    world: {state: BoundaryInitialState, projection: BoundaryInitialProjection}, children: {pid: number, domain: string}[]}
  async function launch(configuration?: string) {
    const ready = Promise.withResolvers<Ready>()
    const child = Bun.spawn([process.execPath, executable], {cwd: root, env: {
      PATH: `${bin}:${process.env.PATH}`, TMPDIR: process.env.TMPDIR, METAFOR_WEAK_BACKEND: "cpu", FIXTURE_DOCKER_LOG: dockerLog,
      QUANTUM_FIXTURE_STATE: stateRoot, QUANTUM_FIXTURE_INSTALLED_ROOT: scenario.source, QUANTUM_FIXTURE_PEER: "1",
      QUANTUM_FIXTURE_INITIAL_FIELDS_FILE: inputFile, QUANTUM_FIXTURE_NETWORK_PREPARATION_FILE: configuration ? undefined : join(inbox, "peer.json"),
      METAFOR_META_ARTIFACT_ROOT: join(stateRoot, "store"), METAFOR_META_ARTIFACT_MAP: JSON.stringify(mapping),
      COSMOS_RELEASE_STORE: join(stateRoot, "store"), COSMOS_RELEASE_DIGEST: digest, COSMOS_NODE_CONFIG: configuration,
    }, stdout: "pipe", stderr: "pipe", ipc(message) {
      if (message && typeof message === "object" && "type" in message && message.type === "ready") ready.resolve(message as Ready)
    }})
    const stderr = new Response(child.stderr).text()
    const stdout = new Response(child.stdout).text()
    const done = child.exited.then(async code => ({code, stderr: await stderr, stdout: await stdout}))
    return {child, async ready() {
      return await Promise.race([ready.promise, done.then(result => {throw new Error(`Preparation fixture exited ${result.code}: ${result.stderr}\n${result.stdout}`)}),
        Bun.sleep(30_000).then(() => {throw new Error("Preparation readiness timed out")}),
      ])
    }, async stop() {
      child.send("stop")
      const result = await Promise.race([done, Bun.sleep(15_000).then(() => {throw new Error("Preparation stop timed out")})])
      expect(result.code, result.stderr).toBe(0)
    }}
  }
  try {
    const prepared: PreparedMetaPackage[] = []
    const roots = [[scenario.source, scenario.folder], ["@internal/peer", "../../internal/peer"],
      ...(scenario.full ? [["capsule", "../../../../capsule"], ["@capsule/runtime", "../../../../capsule/packages/runtime"]] : [])]
    for (const [address, path] of roots) {
      const item = await prepareMetaPackage({root: resolve(import.meta.dir, path!), address: address!, outdir: join(producer, address!.split("/").pop()!),
        readDeclaration: async path => evaluateMetaSource(await Bun.file(path).text())})
      expect(item.result.success, `${item.result.stage}: ${item.result.stdout}\n${item.result.stderr}`).toBeTrue()
      prepared.push(item)
    }
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: prepared.map(member)}
    digest = publishedReleaseGraphDigest(graph)
    await store.prepare(graph, {async read(identity) {
      const owner = prepared.find(item => item.address === identity.name)!
      const output = owner.result.outputs.find(output => output.artifact === identity.artifact && output.sha256 === identity.sha256)!
      return Bun.file(output.path).stream()
    }}, digest)
    mapping = await createInstalledMetaMapping({store, digest, graph})
    const build = await Bun.build({entrypoints: [resolve(import.meta.dir, "fixture/quantum.ts")], target: "bun",
      conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
    expect(build.success, build.logs.map(String).join("\n")).toBeTrue()
    await Bun.write(executable, build.outputs[0]!)
    await rm(producer, {recursive: true})
    await writeFile(join(inbox, "peer.json"), JSON.stringify({id: "prepared-device", signalingUrl: `ws://127.0.0.1:${broker.port}/peer`, tokenFile: "token", allowedPeers: [], iceServers: []}), {mode: 0o600})
    await writeFile(join(inbox, "token"), token, {mode: 0o600})
    const capsuleConfiguration = JSON.stringify({hostname: "127.0.0.1", port: 17777,
      environment: {CAPSULE_RUNTIME_IMAGE_DESKTOP_AUDIO_MICROPHONE: `sha256:${"a".repeat(64)}`, CAPSULE_RTC_PUBLIC_ICE_HOST: "192.0.2.1"}})
    await writeFile(inputFile, JSON.stringify({prepareOnBirth: true, ...(scenario.full ? {capsuleConfiguration} : {})}))
    current = await launch()
    const first = await current.ready()
    expect(first.initialization.mode).toBe("initialized")
    expect(first.initialFieldReads).toBe(1)
    expect(first.children.map(item => item.domain).sort()).toEqual(["boundary", "energy", "matrix"])
    expect(first.world.state.atoms.map(atom => atom.wimp).sort()).toEqual(scenario.full ? ["@capsule/runtime", "@internal/peer", "capsule", "metafor"] : ["@internal/network", "@internal/peer"])
    expect(values(first.world.state, scenario.source).state).toBe("prepared")
    expect(values(first.world.state, "@internal/peer").values).toMatchObject({ack: true, status: "prepared", error: null})
    expect(connections).toBe(0)
    expect(await Bun.file(dockerLog).exists()).toBeFalse()
    if (scenario.full) {
      expect(values(first.world.state, scenario.source).values.capsuleConfiguration).toBe(capsuleConfiguration)
      expect(values(first.world.state, "@capsule/runtime").state).toBe("idle")
      expect(values(first.world.state, "@capsule/runtime").values.instanceId).toBeNull()
    }
    expect(JSON.stringify(first.world)).not.toContain(token)
    expect(JSON.stringify(first.world)).not.toContain(inbox)
    await current.stop(); current = undefined
    for (const child of first.children) expect(alive(child.pid)).toBeFalse()
    const closed = await import("boundary").then(async ({open}) => {
      const boundary = await open(join(stateRoot, "dev.sqlite"))
      try {return {state: await boundary.initialState(), projection: await boundary.initialProjection()}}
      finally {await boundary.close()}
    })
    expect(values(closed.state, scenario.source).state).toBe("stopped")
    const peer = values(closed.state, "@internal/peer").atom
    const location = await locateDirectoryMass({massRoot: join(stateRoot, "mass"), projection: closed.projection,
      atom: {root: parseMetaAddress(scenario.source)!, ref: `atom:${peer.id}`, meta: parseMetaAddress("@internal/peer")!}, key: "configuration"})
    expect((await readdir(location.directory)).sort()).toEqual(["peer.json", "token"])
    const configuration = join(location.directory, "peer.json")
    const bytes = await readFile(configuration)
    expect(JSON.parse(bytes.toString()).tokenFile).toBe("token")
    expect((await readFile(join(location.directory, "token"), "utf8")).trim()).toBe(token)
    expect(backupBoundaryDatabase({source: join(stateRoot, "dev.sqlite"), target: join(root, "closed-world.sqlite")}).bytes).toBeGreaterThan(0)
    await rm(inbox, {recursive: true})
    await rm(inputFile)
    // The full Linux composition is never activated on this Mac. Missing native
    // node context explicitly fails its ordinary start before Capsule launch.
    current = await launch(scenario.full ? undefined : configuration)
    const restored = await current.ready()
    expect(restored.initialization.mode).toBe("restored")
    expect(restored.initialFieldReads).toBe(0)
    expect(restored.rootReads).toBe(0)
    expect(values(restored.world.state, scenario.source).state).toBe(scenario.full ? "failed-network" : "ready")
    expect(values(restored.world.state, "@internal/peer").values.status).toBe(scenario.full ? "failed" : "running")
    if (scenario.full) {
      expect(values(restored.world.state, "@internal/peer").values.request).toBe("start")
      expect(values(restored.world.state, "@capsule/runtime").state).toBe("idle")
      expect(values(restored.world.state, scenario.source).values.capsuleConfiguration).toBe(capsuleConfiguration)
      expect(connections).toBe(0)
    } else expect(connections).toBeGreaterThan(0)
    expect(await Bun.file(dockerLog).exists()).toBeFalse()
    await current.stop(); current = undefined
    for (const child of restored.children) expect(alive(child.pid)).toBeFalse()
    expect(await readFile(configuration)).toEqual(bytes)
  } finally {
    if (current?.child.exitCode === null) {
      current.child.send("stop")
      await Promise.race([current.child.exited, Bun.sleep(10_000)])
      if (current.child.exitCode === null) {current.child.kill("SIGKILL"); await current.child.exited}
    }
    rendezvous.close()
    await broker.stop(true)
    await rm(root, {recursive: true, force: true})
  }
}, 180_000)
