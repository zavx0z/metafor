import {expect, test} from "bun:test"
import {join} from "node:path"
import {mkdtemp, rm, realpath} from "node:fs/promises"
import {tmpdir} from "node:os"
import {createPublishedReleaseSource, readPublishedReleaseGraph} from "../index"
import {createInstalledReleaseStore} from "../installed"
import {releaseFixture} from "./fixture"

test("переносимый граф выводится из ready receipts всех сред без source build", async () => {
  const fixture = await releaseFixture(join(import.meta.dir, "fixture/unchanged.json"))
  try {
    const graph = await readPublishedReleaseGraph(fixture.release)
    expect(graph.packages.map(member => member.name)).toEqual(["@example/host", "@example/view"])
    expect(graph.packages[0]!.environments.some(part => part.env === "server")).toBe(true)
    expect(graph.packages[1]!.environments.find(part => part.env === "main")!.outputs.some(output => output.artifact === "./.cosmos/chunk/shared.js")).toBe(true)
    expect(graph.packages[1]!.environments.find(part => part.env === "main")!.publicArtifacts["./editor"]).toBe(".js")
    expect(JSON.stringify(graph)).not.toContain(fixture.root)
    expect(JSON.stringify(graph)).not.toContain("build:")
    expect(fixture.builds).toEqual([])
    const artifact = fixture.publishedArtifacts[0]!
    await Bun.write(artifact.path, "corrupt")
    await expect(readPublishedReleaseGraph(fixture.release)).rejects.toThrow("corrupt")
    expect(fixture.builds).toEqual([])
  } finally {await fixture.cleanup()}
})

test("development receipts сохраняют одинаковый map key для разных sourceMapFor", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "release-map-alias-")))
  const snapshot = await Bun.file(join(import.meta.dir, "fixture/unchanged.json")).json()
  snapshot.maps = [
    {name: "@example/view", version: "1.0.0", env: "main", sourceMapFor: "./editor", bytes: '{"version":3,"sources":["editor.ts"]}'},
    {name: "@example/view", version: "1.0.0", env: "main", sourceMapFor: "./.cosmos/chunk/shared.js", bytes: '{"version":3,"sources":["shared.ts"]}'},
  ]
  const path = join(root, "snapshot.json")
  await Bun.write(path, JSON.stringify(snapshot))
  const fixture = await releaseFixture(path)
  try {
    const offer = await createPublishedReleaseSource(fixture.release)
    const member = offer.graph.packages.find(member => member.name === "@example/view")!
    const maps = member.environments.find(part => part.env === "main")!.outputs.filter(output => output.kind === "sourcemap")
    expect(maps).toHaveLength(2)
    expect(new Set(maps.map(output => output.artifact)).size).toBe(1)
    expect(new Set(maps.map(output => output.sourceMapFor)).size).toBe(2)
    const store = createInstalledReleaseStore({root: join(root, "receiver")})
    const selected = await store.prepare(offer.graph, offer.artifacts, offer.digest)
    for (const output of maps) {
      const identity = {name: member.name, version: member.version, env: "main" as const, artifact: output.artifact, sha256: output.sha256, size: output.size}
      const file = await store.artifactPath(selected.digest, identity)
      expect(await Bun.file(file).json()).toEqual(JSON.parse(snapshot.maps.find((map: {sourceMapFor: string}) => map.sourceMapFor === output.sourceMapFor).bytes))
    }
    expect(fixture.builds).toEqual([])
  } finally {await fixture.cleanup(); await rm(root, {recursive: true, force: true})}
})

test("pinned source выдаёт exact bytes после изменения source manifests и устанавливается независимо", async () => {
  const fixture = await releaseFixture(join(import.meta.dir, "fixture/unchanged.json"))
  try {
    const offer = await createPublishedReleaseSource(fixture.release)
    const old = offer.graph.packages[0]!
    const part = old.environments.find(part => part.env === "server")!
    const output = part.outputs.find(output => output.artifact === ".")!
    const identity = {name: old.name, version: old.version, env: part.env, artifact: output.artifact, sha256: output.sha256, size: output.size}
    await Bun.write(join(fixture.packageRoot(old.name), "package.json"), JSON.stringify({name: old.name, version: "2.0.0"}))
    const stream = await offer.artifacts.read(identity)
    expect((await new Response(stream as ReadableStream<Uint8Array>).text())).toContain(old.name)
    const store = createInstalledReleaseStore({root: join(fixture.root, "independent-receiver")})
    const candidate = await store.prepare(offer.graph, offer.artifacts, offer.digest)
    expect(candidate.digest).toBe(offer.digest)
    expect(await store.readActive()).toBeNull()
    expect(fixture.builds).toEqual([])
    await expect(offer.artifacts.read({...identity, version: "2.0.0"})).rejects.toThrow("does not belong")
    await expect(fixture.release.readPublishedArtifact({...identity, version: "../escape"})).rejects.toThrow("Invalid")
  } finally {await fixture.cleanup()}
})
