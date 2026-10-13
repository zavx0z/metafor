import {expect, test} from "bun:test"
import {parseMetaAddress, type MetaAddress, type MetaMatterParticle} from "@metafor/types/metafor/graph"
import type {MetaDSL, MetaMassDSL} from "@metafor/types/metafor/schema"
import type {MetaMatterAddRequest, MetaMatterMoveRequest, MetaMatterRequest} from "shared/protocol/metafor/authoring"
import {validateWorkingMatter} from "./working-validation"

const ROOT = parseMetaAddress("test/root")!
const PARENT = parseMetaAddress("test/parent")!
const LEAF = parseMetaAddress("test/leaf")!
const OTHER = parseMetaAddress("test/other")!
const revision = `sha256:${"a".repeat(64)}` as const
const meta = (mass: MetaMassDSL[] = [], matter: MetaDSL["matter"] = []): MetaDSL => ({name: "Fixture", fields: [], superposition: [], processes: [], mass, matter})
const alias = (source = "registry", target = "cache"): MetaMatterParticle => ({kind: "wimp", src: LEAF,
  massBinding: {data: `/mass/${source}`, expr: `{ ${target}: _[0] }`, directMass: {kind: "keys", entries: [{source, target}]}},
})
const add = (particle = alias()): MetaMatterAddRequest => ({contractVersion: 1, capability: "meta.matter.write", operationId: "add", operation: "add", particle,
  revisions: [{address: ROOT, revision}], to: {address: ROOT, parent: null, edgeSlot: "root", position: 0}})
function catalog(entries: Array<[MetaAddress, MetaDSL]>) {
  const declarations = new Map(entries)
  const calls: MetaAddress[] = []
  return {calls, async read(address: MetaAddress) {
    calls.push(address)
    const declaration = declarations.get(address)
    if (!declaration) throw new Error("Installed canonical Meta is unavailable")
    return declaration
  }}
}

test("closed named Mass mappings require actual declared source/target keys and matching formats", async () => {
  for (const format of ["json", "binary", "directory"] as const) {
    const source = catalog([[ROOT, meta([{key: "registry", format}])], [LEAF, meta([{key: "cache", format}])]])
    await expect(validateWorkingMatter(add(), source.read)).resolves.toBeUndefined()
  }
  await expect(validateWorkingMatter(add(alias("missing")), catalog([[ROOT, meta([{key: "registry", format: "json"}])], [LEAF, meta([{key: "cache", format: "json"}])]]).read)).rejects.toThrow("source Mass key is undeclared")
  await expect(validateWorkingMatter(add(alias("registry", "missing")), catalog([[ROOT, meta([{key: "registry", format: "json"}])], [LEAF, meta([{key: "cache", format: "json"}])]]).read)).rejects.toThrow("target Mass key is undeclared")
  await expect(validateWorkingMatter(add(), catalog([[ROOT, meta([{key: "registry", format: "binary"}])], [LEAF, meta([{key: "cache", format: "json"}])]]).read)).rejects.toThrow("formats differ")
})

test("nested WIMP changes the Mass owner while Axion/Macho topology preserves it", async () => {
  const particle: MetaMatterParticle = {kind: "axion", predicateBinding: "true", children: [{edgeSlot: "then", particle: {
    kind: "wimp", src: PARENT, children: [{edgeSlot: "child", particle: {
      kind: "macho", collectionBinding: "[]", children: [{edgeSlot: "child", particle: alias()}],
    }}],
  }}]}
  const request = add(particle)
  const snapshots = catalog([[ROOT, meta([{key: "registry", format: "binary"}])], [PARENT, meta([{key: "registry", format: "json"}])], [LEAF, meta([{key: "cache", format: "json"}])]])
  const before = structuredClone(request)
  await expect(validateWorkingMatter(request, snapshots.read)).resolves.toBeUndefined()
  expect(request).toEqual(before)
})

test("destination locator resolves the nearest owning WIMP through nested topology", async () => {
  const root = meta([{key: "rootOnly", format: "binary"}], [{kind: "wimp", src: PARENT, children: [{edgeSlot: "child", particle: {
    kind: "axion", predicateBinding: "true", children: [{edgeSlot: "then", particle: {kind: "macho", collectionBinding: "[]"}}],
  }}]}])
  const request = add(alias("nestedOnly"))
  request.to = {address: ROOT, parent: {address: ROOT, path: [{edgeSlot: "root", position: 0}, {edgeSlot: "child", position: 0}, {edgeSlot: "then", position: 0}]}, edgeSlot: "child", position: 0}
  const source = catalog([[ROOT, root], [PARENT, meta([{key: "nestedOnly", format: "json"}])], [LEAF, meta([{key: "cache", format: "json"}])]])
  await expect(validateWorkingMatter(request, source.read)).resolves.toBeUndefined()
  const bad = structuredClone(request)
  if (!bad.to.parent) throw new Error("Expected parent locator")
  bad.to.parent.path[1]!.edgeSlot = "else"
  await expect(validateWorkingMatter(bad, source.read)).rejects.toThrow("locator is unavailable")
})

test("move validates bindings against the destination owner rather than the old source", async () => {
  const request: MetaMatterMoveRequest = {...add(), operation: "move", from: {address: OTHER, path: [{edgeSlot: "root", position: 0}]},
    revisions: [{address: ROOT, revision}, {address: OTHER, revision}]}
  const source = catalog([[ROOT, meta([{key: "registry", format: "json"}])], [OTHER, meta([{key: "registry", format: "binary"}])], [LEAF, meta([{key: "cache", format: "json"}])]])
  await expect(validateWorkingMatter(request, source.read)).resolves.toBeUndefined()
  expect(source.calls).not.toContain(OTHER)
  const invalid = {...request, to: {...request.to, address: OTHER}}
  await expect(validateWorkingMatter(invalid, source.read)).rejects.toThrow("formats differ")
})

test("whole Mass binding retains matching-key/codec intersection semantics without requiring all keys", async () => {
  const request = add({kind: "wimp", src: LEAF, massBinding: {data: "/mass", directMass: {kind: "whole"}}})
  const source = catalog([[ROOT, meta([{key: "shared", format: "json"}, {key: "different", format: "binary"}, {key: "parentOnly", format: "json"}])],
    [LEAF, meta([{key: "shared", format: "json"}, {key: "different", format: "directory"}, {key: "childOnly", format: "json"}])]])
  await expect(validateWorkingMatter(request, source.read)).resolves.toBeUndefined()
})

test("remove repairs dangling bindings without loading missing Meta or Mass declarations", async () => {
  const request: MetaMatterRequest = {contractVersion: 1, capability: "meta.matter.write", operationId: "remove", operation: "remove", particle: alias("missing"),
    target: {address: ROOT, path: [{edgeSlot: "root", position: 0}]}, revisions: [{address: ROOT, revision}]}
  let reads = 0
  await expect(validateWorkingMatter(request, async () => {reads++; throw new Error("Missing Meta") })).resolves.toBeUndefined()
  expect(reads).toBe(0)
})

test("canonical declarations are read once per request and unavailable child Meta fails before admission", async () => {
  const request = add({kind: "macho", collectionBinding: "[]", children: [{edgeSlot: "child", particle: alias()}, {edgeSlot: "child", particle: alias()}]})
  const source = catalog([[ROOT, meta([{key: "registry", format: "json"}])], [LEAF, meta([{key: "cache", format: "json"}])]])
  await validateWorkingMatter(request, source.read)
  expect(source.calls).toEqual([ROOT, LEAF])
  await expect(validateWorkingMatter(request, catalog([[ROOT, meta()]]).read)).rejects.toThrow("canonical Meta is unavailable")
})
