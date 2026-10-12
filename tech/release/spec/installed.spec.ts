import {expect, test} from "bun:test"
import {createHash} from "node:crypto"
import {mkdtemp, realpath, rm, symlink, mkdir, readdir, stat} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {
  createInstalledReleaseStore,
  publishedReleaseGraphDigest,
  validatePublishedReleaseGraph,
  type InstalledArtifactIdentity,
  type PublishedReleaseGraph,
  type PublishedReleaseOutput,
} from "../installed"

function fixture(version = "1.0.0") {
  const bytes = new Map<string, Uint8Array>()
  const output = (artifact: PublishedReleaseOutput["artifact"], text: string, kind: PublishedReleaseOutput["kind"] = "entry-point", sourceMapFor?: PublishedReleaseOutput["artifact"]): PublishedReleaseOutput => {
    const body = Buffer.from(text)
    const sha256 = createHash("sha256").update(body).digest("hex")
    bytes.set(sha256, body)
    return {artifact, kind, type: "text/javascript", sha256, size: body.length, ...(sourceMapFor ? {sourceMapFor} : {}), load: artifact === "." ? "eager" : "lazy"}
  }
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@fixture/release", version, dependencies: {}, environments: [
      {env: "server", publicArtifacts: {"./helper": ".js"}, outputs: [
        output(".", `export const version='${version}'; export const value=1; export const dynamic=()=>import('./.cosmos/server/chunk/lazy.js'); export const helper=()=>import('./.public/server/helper/.cosmos-artifact.js'); export const icon=new URL('./.cosmos/server/asset/icon.svg',import.meta.url)`),
        output("./helper", "export const helper=2"),
        output("./.cosmos/chunk/lazy.js", "export const lazy=3", "chunk"),
        output("./.cosmos/asset/icon.svg", "<svg/>", "asset"),
        output("./.cosmos/map/root.js.map", "{\"version\":3}", "sourcemap", "."),
      ]},
      ...["main", "service", "worker", "server-worker"].map(env => ({env, publicArtifacts: {}, outputs: [output(".", `export const environment='${env}'`)]})),
    ],
  }]})
  let reads = 0
  return {graph, bytes, source: {async read(identity: InstalledArtifactIdentity) {
    reads += 1
    const body = bytes.get(identity.sha256)
    if (!body) throw new Error("Source unavailable")
    return body
  }}, reads: () => reads}
}

async function temporary(work: (root: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "installed-release-")))
  try { await work(root) } finally { await rm(root, {recursive: true, force: true}) }
}

function firstIdentity(graph: PublishedReleaseGraph): InstalledArtifactIdentity {
  const member = graph.packages[0]!
  const part = member.environments.find(part => part.env === "server")!
  const output = part.outputs.find(output => output.artifact === ".")!
  return {name: member.name, version: member.version, env: part.env, artifact: ".", sha256: output.sha256, size: output.size}
}

test("готовый полный граф устанавливается в пустой root без sources и активируется отдельно", async () => temporary(async root => {
  const value = fixture()
  const store = createInstalledReleaseStore({root})
  expect(await store.readActive()).toBeNull()
  const candidate = await store.prepare(value.graph, value.source)
  expect(await store.readActive()).toBeNull()
  expect(candidate.graph.packages[0]!.environments).toHaveLength(5)
  const executable = await store.artifactPath(candidate.digest, firstIdentity(value.graph))
  const runtime = await import(executable)
  expect(runtime.version).toBe("1.0.0")
  expect((await runtime.dynamic()).lazy).toBe(3)
  expect((await runtime.helper()).helper).toBe(2)
  expect(await Bun.file(runtime.icon).text()).toBe("<svg/>")
  await store.commitActive(candidate.digest)
  const cold = createInstalledReleaseStore({root})
  expect((await cold.readActive())?.digest).toBe(candidate.digest)
  const calls = value.reads()
  await cold.prepare(value.graph, {read: async () => {throw new Error("Network offline")}})
  expect(value.reads()).toBe(calls)
  expect(await readdir(root)).toEqual(expect.arrayContaining(["objects", "candidates", "active.json"]))
}))

test("прерванная загрузка продолжает verified objects и не меняет active", async () => temporary(async root => {
  const value = fixture()
  const store = createInstalledReleaseStore({root})
  let calls = 0
  await expect(store.prepare(value.graph, {async read(identity) {
    calls += 1
    if (calls === 3) throw new Error("Disconnected")
    return await value.source.read(identity)
  }})).rejects.toThrow("Disconnected")
  expect(await store.readActive()).toBeNull()
  const retained = await readdir(join(root, "objects"))
  expect(retained).toHaveLength(2)
  const candidate = await createInstalledReleaseStore({root}).prepare(value.graph, value.source)
  expect(value.reads()).toBe(9)
  expect(await store.verifyCandidate(candidate.digest)).toEqual(candidate)
}))

test("неполные и неверные bytes не заменяют действующий состав", async () => temporary(async root => {
  const old = fixture()
  const store = createInstalledReleaseStore({root})
  const selected = await store.prepare(old.graph, old.source)
  await store.commitActive(selected.digest)
  const next = fixture("1.0.1")
  await expect(store.prepare(next.graph, {async read() {return new Uint8Array([1])}})).rejects.toThrow("size differs")
  expect((await store.readActive())?.digest).toBe(selected.digest)
  await expect(store.prepare(next.graph, {async read(identity) {return new Uint8Array(identity.size)}})).rejects.toThrow("hash differs")
  expect(await store.readCandidate(publishedReleaseGraphDigest(next.graph))).toBeNull()
  expect((await store.readActive())?.digest).toBe(selected.digest)
}))

test("повреждение immutable object и materialized artifact отклоняется без перезаписи", async () => temporary(async root => {
  const value = fixture()
  const store = createInstalledReleaseStore({root})
  const selected = await store.prepare(value.graph, value.source)
  const identity = firstIdentity(value.graph)
  const artifact = await store.artifactPath(selected.digest, identity)
  await Bun.write(artifact, new Uint8Array(identity.size))
  await expect(store.verifyCandidate(selected.digest)).rejects.toThrow("corrupt")
  await expect(store.prepare(value.graph, value.source)).rejects.toThrow("conflict")
  await Bun.write(artifact, value.bytes.get(identity.sha256)!)
  await Bun.write(join(root, "objects", identity.sha256), new Uint8Array(identity.size))
  await expect(store.prepare(value.graph, value.source)).rejects.toThrow("corrupt")
}))

test("receiver отклоняет symlinks и пути чужой identity", async () => temporary(async root => {
  const value = fixture()
  const outside = join(root, "outside")
  await mkdir(outside)
  const target = join(root, "store")
  await mkdir(target)
  await symlink(outside, join(target, "objects"))
  const store = createInstalledReleaseStore({root: target})
  await expect(store.prepare(value.graph, value.source)).rejects.toThrow("regular file")
  expect(await readdir(outside)).toEqual([])
  await rm(join(target, "objects"))
  const candidate = await store.prepare(value.graph, value.source)
  await expect(store.artifactPath(candidate.digest, {...firstIdentity(value.graph), version: "2.0.0"})).rejects.toThrow("does not belong")
  await expect(store.artifactPath("../escape", firstIdentity(value.graph))).rejects.toThrow("digest")
}))

test("ограничения bytes проверяются до source read, oversized stream отменяется", async () => temporary(async root => {
  const value = fixture()
  const limited = createInstalledReleaseStore({root, limits: {artifactBytes: 1}})
  await expect(limited.prepare(value.graph, value.source)).rejects.toThrow("byte limit")
  expect(value.reads()).toBe(0)
  let cancelled = false
  await expect(createInstalledReleaseStore({root}).prepare(value.graph, {async read(identity) {
    return new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(identity.size + 1))}, cancel() {cancelled = true}})
  }})).rejects.toThrow("exceeds")
  expect(cancelled).toBe(true)
  expect(await readdir(join(root, "objects"))).toEqual([])
}))

test("artifact stream reaches disk before requesting the next reusable chunk", async () => temporary(async root => {
  const chunks = 64
  const chunk = Buffer.alloc(64 * 1024)
  const expected = createHash("sha256")
  for (let index = 0; index < chunks; index++) expected.update(chunk.fill(index))
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: [{
    name: "@fixture/streamed", version: "1.0.0", dependencies: {}, environments: [{
      env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript",
        size: chunks * chunk.length, sha256: expected.digest("hex"), load: "eager"}],
    }],
  }]})
  let finished = false
  const store = createInstalledReleaseStore({root})
  const candidate = await store.prepare(graph, {async read() {
    return (async function* () {
      try {
        for (let index = 0; index < chunks; index++) {
          if (index > 0) {
            const pending = await readdir(join(root, "objects"))
            expect(pending).toHaveLength(1)
            expect(pending[0]).toEndWith(".tmp")
            expect((await stat(join(root, "objects", pending[0]!))).size).toBe(index * chunk.length)
          }
          yield chunk.fill(index)
        }
      } finally { finished = true }
    })()
  }})
  expect(finished).toBeTrue()
  expect(await readdir(join(root, "objects"))).toEqual([firstIdentity(graph).sha256])
  expect((await stat(await store.artifactPath(candidate.digest, firstIdentity(graph)))).size).toBe(chunks * chunk.length)
  expect(await store.verifyCandidate(candidate.digest)).toEqual(candidate)
  expect(await store.readActive()).toBeNull()
  await createInstalledReleaseStore({root}).prepare(graph, {async read() {throw new Error("Network unavailable")}})
}))

test("failed async artifact stream closes the iterator and removes unverified bytes", async () => temporary(async root => {
  const value = fixture()
  const store = createInstalledReleaseStore({root})
  let closed = false
  await expect(store.prepare(value.graph, {async read(identity) {
    return (async function* () {
      try {
        yield value.bytes.get(identity.sha256)!.subarray(0, 1)
        const pending = await readdir(join(root, "objects"))
        expect(pending).toHaveLength(1)
        expect((await stat(join(root, "objects", pending[0]!))).size).toBe(1)
        throw new Error("Stream disconnected")
      } finally { closed = true }
    })()
  }})).rejects.toThrow("Stream disconnected")
  expect(closed).toBeTrue()
  expect(await readdir(join(root, "objects"))).toEqual([])
  expect(await store.readCandidate(publishedReleaseGraphDigest(value.graph))).toBeNull()
  expect(await store.readActive()).toBeNull()
  const candidate = await store.prepare(value.graph, value.source)
  expect(await store.verifyCandidate(candidate.digest)).toEqual(candidate)
}))

test("canonical digest не зависит от порядка полей и выбирает exact requested composition", async () => temporary(async root => {
  const value = fixture()
  const reordered = JSON.parse(JSON.stringify(value.graph))
  reordered.packages[0].environments.reverse()
  for (const part of reordered.packages[0].environments) part.outputs = part.outputs.reverse().map((output: Record<string, unknown>) => Object.fromEntries(Object.entries(output).reverse()))
  expect(publishedReleaseGraphDigest(reordered)).toBe(publishedReleaseGraphDigest(value.graph))
  await expect(createInstalledReleaseStore({root}).prepare(value.graph, value.source, "0".repeat(64))).rejects.toThrow("digest differs")
  expect(value.reads()).toBe(0)
}))

test("server-only composition принимается, неполные slots и dependency closure отклоняются", () => {
  const value = fixture()
  const graph = JSON.parse(JSON.stringify(value.graph))
  graph.packages[0].environments = graph.packages[0].environments.filter((part: {env: string}) => part.env === "server")
  expect(validatePublishedReleaseGraph(graph).packages[0]!.environments).toHaveLength(1)
  const invalid = (change: (copy: any) => void) => {const copy = structuredClone(graph); change(copy); expect(() => validatePublishedReleaseGraph(copy)).toThrow()}
  invalid(copy => copy.packages[0].environments[0].outputs.push(copy.packages[0].environments[0].outputs[0]))
  invalid(copy => copy.packages[0].environments[0].outputs = copy.packages[0].environments[0].outputs.filter((output: any) => output.artifact !== "."))
  invalid(copy => copy.packages[0].environments[0].outputs[0].artifact = "./../escape")
  invalid(copy => copy.packages[0].environments[0].outputs[0].path = "/private/source")
  invalid(copy => copy.packages[0].environments[0].outputs[0].type = "text/javascript\r\nX-Header: value")
  invalid(copy => {const outputs = copy.packages[0].environments[0].outputs; outputs[1].sha256 = outputs[0].sha256; outputs[1].size = outputs[0].size + 1})
  invalid(copy => copy.packages[0].dependencies["@fixture/missing"] = "workspace:*")
  invalid(copy => copy.packages[0].version = "01.0.0")
})

test("одна package version immutable между разными candidates и ready inventory сохраняет старый состав", async () => temporary(async root => {
  const value = fixture()
  const store = createInstalledReleaseStore({root})
  const first = await store.prepare(value.graph, value.source)
  const conflicting = structuredClone(value.graph) as any
  const output = conflicting.packages[0].environments[0].outputs[0]
  output.sha256 = "f".repeat(64)
  let calls = 0
  await expect(store.prepare(conflicting, {async read() {calls += 1; return new Uint8Array(output.size)}})).rejects.toThrow("conflict")
  expect(calls).toBe(0)
  const next = fixture("1.0.1")
  const second = await store.prepare(next.graph, next.source)
  await store.commitActive(second.digest)
  expect((await store.listCandidates()).map(candidate => candidate.digest).sort()).toEqual([first.digest, second.digest].sort())
  expect((await store.artifactPath(first.digest, firstIdentity(value.graph)))).toContain("1.0.0")
  expect((await store.readActive())?.digest).toBe(second.digest)
}))

test("ASCII порядок package, public artifacts и outputs не зависит от locale", () => {
  const value = fixture()
  const base = value.graph.packages[0]!
  const root = base.environments.find(part => part.env === "server")!.outputs.find(output => output.artifact === ".")!
  const names = ["@fixture/a_b", "@fixture/aB", "@fixture/a-b", "@fixture/Ab"]
  const artifacts = ["./a_b", "./aB", "./a-b", "./Ab"] as const
  const graph = validatePublishedReleaseGraph({schemaVersion: 1, packages: names.map(name => ({
    name, version: "1.0.0", dependencies: Object.fromEntries(names.map(name => [name, "workspace:*"])),
    environments: [{env: "server", publicArtifacts: Object.fromEntries(artifacts.map(key => [key, ".js"])), outputs: [root, ...artifacts.map(artifact => ({...root, artifact}))]}],
  }))})
  const expectedNames = ["@fixture/Ab", "@fixture/a-b", "@fixture/aB", "@fixture/a_b"]
  expect(graph.packages.map(member => member.name)).toEqual(expectedNames)
  expect(Object.keys(graph.packages[0]!.dependencies)).toEqual(expectedNames)
  expect(Object.keys(graph.packages[0]!.environments[0]!.publicArtifacts)).toEqual(["./Ab", "./a-b", "./aB", "./a_b"])
  expect(graph.packages[0]!.environments[0]!.outputs.map(output => output.artifact)).toEqual([".", "./Ab", "./a-b", "./aB", "./a_b"])
  const shuffled = structuredClone(graph) as any
  shuffled.packages.reverse()
  for (const member of shuffled.packages) member.environments[0].outputs.reverse()
  expect(publishedReleaseGraphDigest(shuffled)).toBe(publishedReleaseGraphDigest(graph))
})
