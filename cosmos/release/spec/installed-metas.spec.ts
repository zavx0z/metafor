import {expect, test} from "bun:test"
import {mkdtemp, realpath, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {dirname, join, relative, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph, type PublishedReleaseOutput} from "@metafor/tech-release/installed"
import {createMetaSourceResolver} from "shared/metafor/source"
import {loadMeta} from "../../../quantum/dark/load"
import {createInstalledMetaMapping, findInstalledRootMeta} from "../server/installed/metas"

test("installed Meta selects public declarations across namespaces and keeps actions based at the verified version root", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "installed-meta-mapping-")))
  const store = createInstalledReleaseStore({root: join(directory, "store")})
  const bytes = new Map<string, Uint8Array>()
  async function output(name: string, artifact: string, code: string, kind: PublishedReleaseOutput["kind"] = "entry-point") {
    const value = new TextEncoder().encode(code)
    bytes.set(`${name}:${artifact}`, value)
    return {artifact, kind, type: "text/javascript", ...await artifactIntegrity(value.buffer)} as PublishedReleaseOutput
  }
  try {
    const declaration = {name: "Cosmos Meta", fields: [], superposition: [{name: "ready"}],
      processes: [{key: "ready", declaration: {type: "action", action: {src: "./.cosmos/server/entry/action.js"}}}],
    }
    const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [
      {name: "@cosmos/demo", version: "1.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {"./meta": ".js"}, outputs: [
        await output("@cosmos/demo", ".", 'throw new Error("Product must not be loaded as Meta")'),
        await output("@cosmos/demo", "./meta", `export default ${JSON.stringify(declaration)}`),
        await output("@cosmos/demo", "./.cosmos/entry/action.js", 'import value from "./shared.js"; export default () => value'),
        await output("@cosmos/demo", "./.cosmos/entry/shared.js", 'export default "exact prepared action"', "chunk"),
      ]}]},
      {name: "@internal/demo", version: "2.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {"./meta": ".js"}, outputs: [
        await output("@internal/demo", ".", 'throw new Error("Product must not be loaded as Meta")'),
        await output("@internal/demo", "./meta", 'export default {name:"Internal Meta",fields:[],superposition:[{name:"ready"}]}'),
      ]}]},
      {name: "@fixture/legacy", version: "3.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [
        await output("@fixture/legacy", ".", 'export default {name:"Legacy Meta",fields:[],superposition:[{name:"ready"}]}'),
      ]}]},
      {name: "@fixture/component", version: "4.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [
        await output("@fixture/component", ".", 'export default () => "ordinary component"'),
      ]}]},
    ]}
    const digest = publishedReleaseGraphDigest(graph)
    await store.prepare(graph, {async read(identity) {return bytes.get(`${identity.name}:${identity.artifact}`)!}}, digest)
    const mapping = await createInstalledMetaMapping({store, digest, graph})
    expect(Object.keys(mapping).sort()).toEqual(["@cosmos/demo", "@internal/demo"])
    const rootOutput = graph.packages[0]!.environments[0]!.outputs[0]!
    const productPath = await store.artifactPath(digest, {name: "@cosmos/demo", version: "1.0.0", env: "server", ...rootOutput})
    const metaOutput = graph.packages[0]!.environments[0]!.outputs[1]!
    const metaPath = await store.artifactPath(digest, {name: "@cosmos/demo", version: "1.0.0", env: "server", ...metaOutput})
    expect(mapping["@cosmos/demo"]!.directory).toBe(dirname(productPath))
    expect(mapping["@cosmos/demo"]!.entry).toBe(relative(dirname(productPath), metaPath))
    expect(await findInstalledRootMeta({store, digest, graph, path: metaPath})).toBe("@cosmos/demo")
    expect(await findInstalledRootMeta({store, digest, graph, path: dirname(productPath)})).toBe("@cosmos/demo")
    expect(await findInstalledRootMeta({store, digest, graph, path: productPath})).toBeUndefined()
    expect(await findInstalledRootMeta({store, digest, graph, path: join(dirname(productPath), "unverified-meta.js")})).toBeUndefined()
    const resolver = createMetaSourceResolver({root: join(directory, "store"), artifacts: mapping})
    expect((await loadMeta("@cosmos/demo", resolver)).name).toBe("Cosmos Meta")
    expect((await loadMeta("@internal/demo", resolver)).name).toBe("Internal Meta")
    const action = await import(pathToFileURL(resolve(resolver.resolveDirectory("@cosmos/demo"), declaration.processes[0]!.declaration.action.src)).href)
    expect(action.default()).toBe("exact prepared action")
    await expect(loadMeta("@fixture/legacy", resolver)).rejects.toThrow("not installed")
    const legacy = await createInstalledMetaMapping({store, digest, graph, knownRoots: ["@fixture/legacy"]})
    const legacyResolver = createMetaSourceResolver({root: join(directory, "store"), artifacts: legacy})
    expect((await loadMeta("@fixture/legacy", legacyResolver)).name).toBe("Legacy Meta")
    const legacyOutput = graph.packages[2]!.environments[0]!.outputs[0]!
    const legacyPath = await store.artifactPath(digest, {name: "@fixture/legacy", version: "3.0.0", env: "server", ...legacyOutput})
    expect(legacy["@fixture/legacy"]!.entry).toBe(relative(dirname(legacyPath), legacyPath))
    expect(await findInstalledRootMeta({store, digest, graph, path: legacyPath})).toBe("@fixture/legacy")
    expect(legacy["@fixture/component"]).toBeUndefined()
    await expect(createInstalledMetaMapping({store, digest, graph, knownRoots: ["@fixture/missing"]})).rejects.toThrow("Known Meta root is missing")
  } finally {await rm(directory, {recursive: true, force: true})}
})
