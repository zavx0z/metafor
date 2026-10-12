import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {artifactIntegrity} from "@metafor/tech-build/identity"
import {createInstalledReleaseStore, publishedReleaseGraphDigest, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import {bootstrapNodeConfiguration, prepareInstalledBootstrap} from "../../bootstrap"

test("bootstrap honors only the selected instance's explicit Mass configuration", () => {
  expect(bootstrapNodeConfiguration("/fixture/left", "/fixture/left/mass/key/peer.json")).toBe("/fixture/left/mass/key/peer.json")
  expect(bootstrapNodeConfiguration("/fixture/right", "/fixture/left/mass/key/peer.json")).toBeUndefined()
  expect(bootstrapNodeConfiguration("/fixture/left", "/fixture/left/node.json")).toBeUndefined()
  expect(bootstrapNodeConfiguration("/fixture/left", "/fixture/left/mass-other/peer.json")).toBeUndefined()
  expect(bootstrapNodeConfiguration("/fixture/left", "/fixture/left/mass/../peer.json")).toBeUndefined()
  expect(bootstrapNodeConfiguration("/fixture/left", "mass/key/peer.json")).toBeUndefined()
  expect(bootstrapNodeConfiguration("/fixture/left", undefined)).toBeUndefined()
})

async function composition(version: string, code: string) {
  const bytes = new TextEncoder().encode(code)
  const identity = await artifactIntegrity(bytes.buffer)
  const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{
    name: "@cosmos/release", version, dependencies: {}, environments: [{env: "server", publicArtifacts: {},
      outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript;charset=utf-8", ...identity}]}],
  }]}
  return {graph, digest: publishedReleaseGraphDigest(graph), source: {async read() {return bytes}}}
}

test("MetaFor bootstrap seeds verified storage once and preserves later active release without source shipment", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-bootstrap-"))
  try {
    const codeRoot = join(directory, "code")
    const dataRoot = join(directory, "data")
    const first = await composition("1.0.0", "export const value = 1")
    const source = createInstalledReleaseStore({root: join(codeRoot, "release")})
    await source.prepare(first.graph, first.source, first.digest)
    const initial = await prepareInstalledBootstrap({codeRoot, dataRoot, initialDigest: first.digest})
    const installed = createInstalledReleaseStore({root: initial.storeRoot})
    expect((await installed.verifyCandidate(initial.digest)).graph).toEqual(first.graph)
    expect(await installed.readActive()).toBeNull()
    await installed.commitActive(first.digest)
    const second = await composition("1.1.0", "export const value = 2")
    await installed.prepare(second.graph, second.source, second.digest)
    await installed.commitActive(second.digest)
    await rm(codeRoot, {recursive: true})
    expect((await prepareInstalledBootstrap({dataRoot})).digest).toBe(second.digest)
  } finally {await rm(directory, {recursive: true, force: true})}
})

test("missing initial code fails without synthesizing an active release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-bootstrap-missing-"))
  try {
    const dataRoot = join(directory, "data")
    await expect(prepareInstalledBootstrap({dataRoot, codeRoot: join(directory, "missing"), initialDigest: "a".repeat(64)})).rejects.toThrow()
    expect(await createInstalledReleaseStore({root: join(dataRoot, "store")}).readActive()).toBeNull()
  } finally {await rm(directory, {recursive: true, force: true})}
})
