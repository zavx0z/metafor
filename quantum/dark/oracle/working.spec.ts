import {expect, test} from "bun:test"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {sourceForceMessage} from "shared/protocol/force/message"
import {open} from "../../boundary/sqlite.ts"
import {readBoundaryMeta} from "../../boundary/graph/declaration.ts"
import {DarkForceHistory} from "../force/history.ts"
import {WorkingDeclarationService} from "./working.ts"
import {metaAuthoringCapabilitiesForScopes} from "./registry.ts"
import {evaluateMetaSource} from "../load.ts"
import {matterParticles} from "../dark.ts"
import {readBoundaryGraphProjection} from "../../boundary/graph/runtime.ts"
import {assertCanonicalFieldSource} from "create-metafor/library"

test("unsupported source Field metadata cannot be silently dropped by a working rewrite", () => {
  for (const definition of ['items: field.array.required([], {data:"item"})', 'name: field.string.required("", {id:true})']) {
    expect(() => assertCanonicalFieldSource(`export default MetaFor("Test").fields(field => ({${definition}}))`)).toThrow("would lose source data")
  }
  expect(() => assertCanonicalFieldSource('export default MetaFor("Test").fields(field => ({data:field.string.optional({label:"Data"})}))')).not.toThrow()
})

test("several working steps remain in Boundary across restart and publish only on explicit commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-working-authoring-"))
  const address = parseMetaAddress("test/working-authoring")!
  const path = join(directory, "meta.ts")
  const original = `export default MetaFor("Original").fields(field => ({}))
    .superposition({}).mass(() => ({})).energy().processes(() => [])
    .reactions(() => []).matter(({html}) => html\`\`).bulk()`
  await writeFile(path, original)
  let boundary = await open(join(directory, "world.sqlite"))
  let history = new DarkForceHistory(join(directory, "history"), {cutId: "working-test", startedAt: "2026-10-12T00:00:00.000Z"})
  const source = "test/author"
  const grants = metaAuthoringCapabilitiesForScopes([address])
  const service = () => new WorkingDeclarationService(history, {
    async acceptAuthoringParticle(input, cause) {
      const particle = sourceForceMessage(input, "dark").parts[0]
      const entry = history.accept(particle, cause)
      await boundary.materialize({parts: [particle]})
      return {ok: true, delivered: ["boundary"], acceptance: {id: entry.id, cutId: "working-test", sequence: entry.sequence}, particle}
    },
  }, id => id === source ? grants : [], async root => (await readBoundaryMeta(boundary, {root})).declarations[0]!.meta, () => path)
  const readRequest = {contractVersion: 1, capability: "meta.source.read", addresses: [address]}
  try {
    await boundary.materialize({parts: [{part: "inflaton", op: "add", path: "wimp", ts: 1, value: {src: address, name: "Original"}}]})
    let working = service()
    const revision = (await working.read(readRequest, source)).sources[0]!.revision
    const first = await working.stage({contractVersion: 1, operationId: "rename", capability: "meta.declaration.write",
      operation: "replace", entity: "metadata", address, metadata: {name: "Working", description: "Working draft"},
      revisions: [{address, revision}]}, source)
    expect(first.phase).toBe("working")
    expect(await readFile(path, "utf8")).toBe(original)
    const next = (await working.read(readRequest, source)).sources[0]!
    expect(next.sourceRevision).toBe(revision)
    expect(next.revision).not.toBe(revision)
    const second = await working.stage({contractVersion: 1, operationId: "field", capability: "meta.declaration.write",
      operation: "add", entity: "field", address, field: {key: "note", type: "string", required: false, default: "saved"},
      revisions: [{address, revision: next.revision}]}, source)
    expect(second.phase).toBe("working")
    expect(await readFile(path, "utf8")).toBe(original)
    await boundary.close()
    boundary = await open(join(directory, "world.sqlite"))
    history = new DarkForceHistory(join(directory, "history"), {cutId: "working-test", startedAt: "2026-10-12T00:00:00.000Z"})
    working = service()
    const persisted = (await readBoundaryMeta(boundary, {root: address})).declarations[0]!.meta
    expect(persisted.name).toBe("Working")
    expect(persisted.fields).toEqual([{key: "note", type: "string", default: "saved"}])
    const earlier = {contractVersion: 1, capability: "meta.declaration.write", operationId: first.operationId, requestDigest: first.requestDigest}
    await working.commit(earlier, source)
    expect((await evaluateMetaSource(await readFile(path, "utf8"))).fields).toHaveLength(0)
    expect((await working.read(readRequest, source)).sources[0]!.revision).toBe(second.sourceProjections[0]!.afterRevision)
    const commit = {contractVersion: 1, capability: "meta.declaration.write", operationId: second.operationId, requestDigest: second.requestDigest}
    const beforeCommit = history.status().sequence
    const published = await working.commit(commit, source)
    expect(published.phase).toBe("complete")
    const selected = await evaluateMetaSource(await readFile(path, "utf8"))
    expect(selected.name).toBe("Working")
    expect(selected.fields[0]).toMatchObject({key: "note", default: "saved"})
    expect((await working.commit(commit, source)).source.outcome).toBe("already_published")
    await working.commit(earlier, source)
    expect((await working.read(readRequest, source)).sources[0]!.revision).toBe(second.sourceProjections[0]!.afterRevision)
    await working.commit(commit, source)
    expect((await evaluateMetaSource(await readFile(path, "utf8"))).fields[0]?.key).toBe("note")
    expect(history.status().sequence).toBe(beforeCommit)
    expect((await working.read(readRequest, source)).sources[0]!.revision).toBe(second.sourceProjections[0]!.afterRevision)
  } finally {
    await boundary.close()
    await rm(directory, {recursive: true, force: true})
  }
})

test("working Matter creates another Atom from installed Meta before its source is published", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-working-matter-"))
  const address = parseMetaAddress(`test/working-matter-${crypto.randomUUID()}`)!
  const child = parseMetaAddress(`${address}-child`)!
  const path = join(directory, "meta.ts")
  const source = `export default MetaFor("Room").fields(() => ({})).superposition({ready:{}})
    .mass(() => ({})).energy().processes(() => []).reactions(() => [])
    .matter(({html}) => html\`<meta-for src="${child}" />\`).bulk()`
  await writeFile(path, source)
  let boundary = await open(join(directory, "world.sqlite"))
  const history = new DarkForceHistory(join(directory, "history"), {cutId: "matter-working", startedAt: "2026-10-12T00:00:00.000Z"})
  const rootMeta = await evaluateMetaSource(source)
  const childMeta = await evaluateMetaSource(`export default MetaFor("Agent template").fields(() => ({})).superposition({ready:{}})
    .mass(() => ({})).energy().processes(() => []).reactions(() => []).matter().bulk()`)
  try {
    for await (const particle of matterParticles(address, async key => key === address ? rootMeta : childMeta))
      await boundary.materialize({parts: [particle]})
    const service = new WorkingDeclarationService(history, {async acceptAuthoringParticle(input, cause) {
      const particle = sourceForceMessage(input, "dark").parts[0]
      const entry = history.accept(particle, cause)
      await boundary.materialize({parts: [particle]})
      return {ok: true, delivered: ["boundary"], acceptance: {id: entry.id, cutId: "matter-working", sequence: entry.sequence}, particle}
    }}, () => metaAuthoringCapabilitiesForScopes([address, child]),
    async root => (await readBoundaryMeta(boundary, {root})).declarations[0]!.meta, () => path)
    const revision = (await service.read({contractVersion: 1, capability: "meta.source.read", addresses: [address]}, "author")).sources[0]!.revision
    const request = {contractVersion: 1, operationId: "connect-another", capability: "meta.matter.write",
      operation: "add", particle: {kind: "wimp", src: child}, to: {address, parent: null, edgeSlot: "root", position: 1},
      revisions: [{address, revision}]}
    const accepted = await service.stageMatter(request, "author")
    expect(accepted.phase).toBe("working")
    expect((await readBoundaryGraphProjection(boundary, {})).runtime.roots[0]!.children).toHaveLength(2)
    expect(await readFile(path, "utf8")).toBe(source)
    const sequence = history.status().sequence
    expect((await service.stageMatter(request, "author")).acceptance).toEqual(accepted.acceptance)
    expect(history.status().sequence).toBe(sequence)
    await boundary.close()
    boundary = await open(join(directory, "world.sqlite"))
    expect((await readBoundaryMeta(boundary, {root: address})).declarations[0]!.meta.matter).toHaveLength(2)
    await service.commit({contractVersion: 1, capability: "meta.matter.write", operationId: accepted.operationId, requestDigest: accepted.requestDigest}, "author")
    expect((await evaluateMetaSource(await readFile(path, "utf8"))).matter).toHaveLength(2)
  } finally {
    await boundary.close()
    await rm(directory, {recursive: true, force: true})
  }
})
