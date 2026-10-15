import {expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, realpath, rename, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {createPackageBuilder} from "@metafor/tech-build"
import {createRelease, type PublishedReleaseGraph, type ReleaseArtifactSource} from "@metafor/tech-release"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, validatePublishedReleaseGraph} from "@metafor/tech-release/installed"
import {createDevelopmentPreparation} from "../server/development-prepare"

const stateBytes = Buffer.from('{"version":1,"compatibilityLine":"line1"}')
const coreName = "@cosmos/release"
const visualName = "@internal/visual"
const metaName = "@metafor/example"

async function fixture() {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "cosmos-development-prepare-")))
  const sourceRoot = join(directory, "source")
  const core = join(sourceRoot, "core")
  const visual = join(sourceRoot, "visual")
  const store = createInstalledReleaseStore({root: join(directory, "installed")})
  const coreSource = 'export const release = "core"; export const version = import.meta.env.COSMOS_PACKAGE_VERSION\n'
  const visualSource = 'export const visual = "ready"; export const version = import.meta.env.COSMOS_PACKAGE_VERSION\n'
  await Bun.write(join(sourceRoot, "package.json"), JSON.stringify({dependencies: {
    [coreName]: "workspace:^1.0.0", [visualName]: "workspace:^1.0.0",
  }}))
  await Bun.write(join(core, "package.json"), JSON.stringify({name: coreName, version: "1.0.0", type: "module", dependencies: {},
    exports: {".": {"cosmos:server": "./server/index.ts"}, "./persisted-state.json": {"cosmos:server": "./persisted-state.json"}},
    scripts: {typecheck: "bun ./check.ts", "build:server": "bun build ./server/index.ts --conditions=cosmos:server --target=bun --production --minify --drop console.debug --outfile=dist/server.js"}}))
  await Bun.write(join(core, "server/index.ts"), coreSource)
  await Bun.write(join(core, "persisted-state.json"), stateBytes)
  await Bun.write(join(core, "check.ts"), "export {}\n")
  await Bun.write(join(visual, "package.json"), JSON.stringify({name: visualName, version: "1.0.0", type: "module", dependencies: {},
    exports: {".": {"internal:server": "./server/index.ts"}},
    scripts: {typecheck: "bun ./check.ts", "build:server": "bun build ./server/index.ts --conditions=internal:server --target=bun --production --minify --drop console.debug --outfile=dist/server.js"}}))
  await Bun.write(join(visual, "server/index.ts"), visualSource)
  await Bun.write(join(visual, "check.ts"), "export {}\n")

  const oldBytes = new Map<string, Uint8Array>()
  const oldOutput = (name: string, bytes: Uint8Array, artifact = ".", kind: "entry-point" | "copy" = "entry-point") => {
    const sha256 = createHash("sha256").update(bytes).digest("hex")
    oldBytes.set(`${name}:${artifact}`, bytes)
    return {artifact, kind, type: kind === "copy" ? "application/json" : "text/javascript", sha256, size: bytes.length, load: "eager" as const}
  }
  const oldCore = oldOutput(coreName, Buffer.from("export const oldCore = true\n"))
  const oldState = oldOutput(coreName, stateBytes, "./persisted-state.json", "copy")
  const oldVisual = oldOutput(visualName, Buffer.from("export const oldVisual = true\n"))
  const oldMeta = oldOutput(metaName, Buffer.from("export const retainedMeta = true\n"))
  const oldGraph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [
    {name: coreName, version: "1.0.0", dependencies: {}, environments: [{env: "server",
      publicArtifacts: {"./persisted-state.json": ".json"}, outputs: [oldCore, oldState]}]},
    {name: visualName, version: "1.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [oldVisual]}]},
    {name: metaName, version: "1.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [oldMeta]}]},
  ]})
  const activeDigest = publishedReleaseGraphDigest(oldGraph)
  await store.prepare(oldGraph, {read: async (identity) => oldBytes.get(`${identity.name}:${identity.artifact}`)!})
  await store.commitActive(activeDigest)
  const expected = {digest: activeDigest, revision: (await store.readActivation())!.revision}

  let failVisual = false
  let failChildCommit = false
  let mutateDuringChecks = false
  let checkGate: Promise<void> | null = null
  let releaseCheckGate: (() => void) | null = null
  let compilerCalls = 0
  let checks = 0
  let assignmentRevision = "assignment-1"
  const spawn = ((command: string[], options: Parameters<typeof Bun.spawn>[1]) => {
    if (command.includes("build") || command.some((arg) => arg.endsWith("/adapter.ts"))) compilerCalls++
    if (failVisual && options?.cwd === visual && command.includes("build")) {
      failVisual = false
      return Bun.spawn([process.execPath, "-e", 'console.error("Injected visual compiler failure"); process.exit(7)'], options)
    }
    return Bun.spawn(command, options)
  }) as typeof Bun.spawn
  const builder = createPackageBuilder({resolvePackage: name => {
    if (name === coreName) return core
    if (name === visualName) return visual
    throw new Error("Package is outside assigned release")
  }, spawn, provenance: {roots: [sourceRoot], excludedDirectoryNames: ["dist", ".release"],
    excludedDirectoryNamePrefixes: [".package-update-", ".package-recovery-"]},
  adapterEntrypoint: async () => fileURLToPath(import.meta.resolve("@metafor/tech-build/adapter"))})
  const publication = createRelease({root: sourceRoot, builder, isMember: name => name === coreName || name === visualName,
    io: {async rename(from, to) {
      if (failChildCommit && to === join(core, "package.json")) {
        failChildCommit = false
        throw new Error("Injected late child manifest failure")
      }
      await rename(from, to)
    }}})
  const preparation = createDevelopmentPreparation({publication, builder, store,
    receiptsDirectory: join(directory, "receipts"),
    authorizeSubject(subject) {if (subject !== "room:core") throw new Error("Subject is not assigned")},
    assignmentRevision: () => assignmentRevision,
    async checks() {
      checks++
      if (checkGate) await checkGate
      if (mutateDuringChecks) await Bun.write(join(visual, "server/index.ts"), "export const changedDuringChecks = true\n")
      return [{id: "types", passed: true, detail: "checked"}]
    },
    async compatibility(graph: PublishedReleaseGraph, source: ReleaseArtifactSource) {
      const member = graph.packages.find(item => item.name === coreName)!
      const output = member.environments.find(item => item.env === "server")!.outputs.find(item => item.artifact === "./persisted-state.json")!
      const body = await source.read({name: coreName, version: member.version, env: "server", artifact: output.artifact,
        sha256: output.sha256, size: output.size})
      const bytes = body instanceof Uint8Array ? body : body instanceof ReadableStream
        ? new Uint8Array(await new Response(body).arrayBuffer())
        : Buffer.concat(await Array.fromAsync(body))
      return (JSON.parse(new TextDecoder().decode(bytes)) as {compatibilityLine: string}).compatibilityLine
    },
  })
  return {directory, sourceRoot, visual, visualSource, store, publication, preparation, expected, oldGraph, oldMeta,
    failVisual() {failVisual = true}, failChildCommit() {failChildCommit = true},
    mutateDuringChecks() {mutateDuringChecks = true},
    pauseChecks() {checkGate = new Promise<void>(resolve => {releaseCheckGate = resolve})},
    resumeChecks() {releaseCheckGate?.(); checkGate = null; releaseCheckGate = null},
    get compilerCalls() {return compilerCalls}, get checks() {return checks},
    set assignmentRevision(value: string) {assignmentRevision = value},
    cleanup: () => rm(directory, {recursive: true, force: true})}
}

test("real checks bind preparation; partial publication is retained and retry keeps Meta bytes", async () => {
  const f = await fixture()
  try {
    const checked = await f.preparation.check({requestId: "check-1", subject: "room:core"})
    expect(checked.passed).toBe(true)
    expect(checked.checkId).toBe("check-1")
    await Bun.write(join(f.visual, "server/index.ts"), "export const changed = true\n")
    await expect(f.preparation.prepare({requestId: "stale-1", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})).rejects.toThrow("Source inventory changed after check")
    await Bun.write(join(f.visual, "server/index.ts"), f.visualSource)

    f.failVisual()
    const first = await f.preparation.prepare({requestId: "prepare-1", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})
    expect(first.state).toBe("failed")
    expect(first.publication?.success).toBe(false)
    expect(first.error).toContain("Injected visual compiler failure")
    expect(first.effects?.packages.find(item => item.name === coreName)?.prepared).toHaveLength(1)
    expect(first.effects?.packages.find(item => item.name === visualName)?.prepared).toHaveLength(0)
    expect(first.candidate).toBeUndefined()
    expect((await f.store.readActive())?.digest).toBe(f.expected.digest)
    const calls = f.compilerCalls
    expect(await f.preparation.prepare({requestId: "prepare-1", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})).toEqual(first)
    expect(f.compilerCalls).toBe(calls)
    await expect(f.preparation.prepare({requestId: "prepare-1", subject: "other", checkId: checked.checkId,
      expected: f.expected})).rejects.toThrow("not assigned")

    const second = await f.preparation.prepare({requestId: "prepare-2", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})
    expect(second.state, second.error).toBe("complete")
    expect(second.candidate?.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(second.target).toEqual(second.candidate)
    const candidate = await f.store.verifyCandidate(second.candidate!.digest)
    const retained = candidate.graph.packages.find(item => item.name === metaName)
    expect(retained).toEqual(f.oldGraph.packages.find(item => item.name === metaName))
    const metaPath = await f.store.artifactPath(candidate.digest, {name: metaName, version: "1.0.0", env: "server",
      artifact: ".", sha256: f.oldMeta.sha256, size: f.oldMeta.size})
    expect(createHash("sha256").update(new Uint8Array(await Bun.file(metaPath).arrayBuffer())).digest("hex")).toBe(f.oldMeta.sha256)
    expect((await f.store.readActive())?.digest).toBe(f.expected.digest)
    expect(f.checks).toBe(1)
    const {candidate: _candidate, ...interrupted} = second
    const receiptPath = join(f.directory, "receipts", `${createHash("sha256").update("prepare-2").digest("hex")}.json`)
    await Bun.write(receiptPath, JSON.stringify({...interrupted, state: "running"}))
    const readback = await f.preparation.read("prepare-2", "room:core")
    expect(readback).toMatchObject({state: "unknown", operatorReadback: true, candidate: second.candidate})
    expect((await f.store.readActive())?.digest).toBe(f.expected.digest)
  } finally {await f.preparation.close(); await f.cleanup()}
})

test("late publication failure leaves ready receipts visible and active unchanged", async () => {
  const f = await fixture()
  try {
    const checked = await f.preparation.check({requestId: "check-late", subject: "room:core"})
    f.failChildCommit()
    const receipt = await f.preparation.prepare({requestId: "prepare-late", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})
    expect(receipt.state).toBe("failed")
    expect(receipt.effects?.packages.every(item => item.ready)).toBe(true)
    expect(receipt.effects?.packages.every(item => item.prepared.length > 0)).toBe(true)
    expect(receipt.candidate).toBeUndefined()
    expect((await f.store.readActive())?.digest).toBe(f.expected.digest)
    expect(await f.preparation.read("prepare-late")).toEqual(receipt)
    await expect(f.preparation.read("prepare-late", "room:other")).rejects.toThrow("another subject")
  } finally {await f.preparation.close(); await f.cleanup()}
})

test("orphaned running request blocks a new preparation until explicit readback", async () => {
  const f = await fixture()
  try {
    const checked = await f.preparation.check({requestId: "check-orphan", subject: "room:core"})
    const plan = await f.publication.planPublication([{name: coreName, change: "patch"}, {name: visualName, change: "patch"}])
    const requestId = "orphaned-prepare"
    const path = join(f.directory, "receipts", `${createHash("sha256").update(requestId).digest("hex")}.json`)
    await Bun.write(path, JSON.stringify({schemaVersion: 1, kind: "prepare", requestId,
      subject: "room:core", checkId: checked.checkId, assignmentRevision: checked.assignmentRevision,
      inventorySha256: checked.inventorySha256, expected: f.expected, fingerprint: "0".repeat(64),
      plan, state: "running"}))
    await expect(f.preparation.prepare({requestId: "new-prepare", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})).rejects.toThrow("operator readback")
    const observed = await f.preparation.read(requestId)
    expect(observed).toMatchObject({kind: "prepare", state: "unknown", operatorReadback: true})
    expect(observed?.kind === "prepare" && observed.effects?.packages.every(item => item.prepared.length === 0)).toBe(true)
    const next = await f.preparation.prepare({requestId: "new-prepare", subject: "room:core", checkId: checked.checkId,
      expected: f.expected})
    expect(next.state, next.error).toBe("complete")
  } finally {await f.preparation.close(); await f.cleanup()}
})

test("check records failure when source changes during host checks", async () => {
  const f = await fixture()
  try {
    f.mutateDuringChecks()
    const receipt = await f.preparation.check({requestId: "check-race", subject: "room:core"})
    expect(receipt.passed).toBe(false)
    expect(receipt.error).toBe("Source inventory changed during checks")
    expect(await f.preparation.read("check-race")).toEqual(receipt)
    await expect(f.preparation.prepare({requestId: "prepare-race", subject: "room:core",
      checkId: receipt.checkId, expected: f.expected})).rejects.toThrow("successful source check")
    expect((await f.store.readActive())?.digest).toBe(f.expected.digest)
  } finally {await f.preparation.close(); await f.cleanup()}
})

test("changed active revision rejects preparation before compiler or installed candidate effects", async () => {
  const f = await fixture()
  try {
    const checked = await f.preparation.check({requestId: "check-cas", subject: "room:core"})
    const before = f.compilerCalls
    await f.store.recordOperation({id: "other-operation", kind: "activate", target: f.expected.digest,
      expected: f.expected, state: "running"}, f.expected)
    await expect(f.preparation.prepare({requestId: "prepare-cas", subject: "room:core",
      checkId: checked.checkId, expected: f.expected})).rejects.toThrow("activation changed")
    expect(f.compilerCalls).toBe(before)
    expect((await f.store.listCandidates()).length).toBe(1)
  } finally {await f.preparation.close(); await f.cleanup()}
})

test("one owner rejects another request while checks are running", async () => {
  const f = await fixture()
  try {
    f.pauseChecks()
    let started!: () => void
    const startedPromise = new Promise<void>(resolve => {started = resolve})
    const first = f.preparation.check({requestId: "check-busy-1", subject: "room:core"}, undefined,
      event => {if (event.phase === "checking") started()})
    await startedPromise
    await expect(f.preparation.check({requestId: "check-busy-2", subject: "room:core"})).rejects.toThrow("Another preparation request is running")
    f.resumeChecks()
    expect((await first).passed).toBe(true)
  } finally {f.resumeChecks(); await f.preparation.close(); await f.cleanup()}
})
