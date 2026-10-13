import {expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import {createPreparedDeclarationActivation, type PreparedDeclarationSnapshot} from "./prepared-declarations"

const root = parseMetaAddress("fixture/prepared")!
const meta = (): MetaDSL => ({name: "Prepared", fields: [{key: "one", type: "string"}, {key: "two", type: "string"}], superposition: [{name: "idle", transitions: null}], mass: [], processes: [], reactions: [], matter: []})
const input = () => ({operationId: "owner-activation", releaseDigest: "a".repeat(64), root, expectedFrontier: {cutId: "prepared-test", throughSequence: 5}, readMeta: async () => ({...meta(), fields: [...meta().fields, {key: "new", type: "boolean" as const}]})})
function fixture() {
  let sequence = 5, calls = 0, failure = false, installed = 0
  const snapshot = (): PreparedDeclarationSnapshot => ({root, frontier: {cutId: "prepared-test", throughSequence: sequence}, canonical: {root, declarations: [{address: root, meta: meta()}]}, busy: false})
  const deps = {async gate<T>(action: () => Promise<T>) {return await action()}, async read() {return snapshot()},
    async accept() {calls++; sequence++; if (failure) throw new Error("delivery outcome unknown")},
    async settle() {return {cutId: "prepared-test", throughSequence: sequence}}, closeAdmission() {}, openAdmission() {}, install() {installed++}}
  return {deps, apply: createPreparedDeclarationActivation(deps), calls: () => calls, installed: () => installed, fail() {failure = true}}
}

test("prepared activation rejects positional reorder before effects and complete identity replays no effects", async () => {
  const f = fixture(), request = input()
  await expect(f.apply({...request, operationId: "reordered", readMeta: async () => ({...meta(), fields: meta().fields.toReversed()})})).rejects.toThrow("local identities")
  expect(f.calls()).toBe(0)
  const result = await f.apply(request)
  expect(result.phase).toBe("complete"); expect(f.installed()).toBe(1)
  expect(await f.apply(request)).toEqual(result)
  expect(f.calls()).toBe(result.accepted)
  await expect(f.apply({...request, releaseDigest: "b".repeat(64)})).rejects.toThrow("already binds")
})

test("partial or unknown first acceptance is retained uncertain and old frontier cannot replay after restart", async () => {
  const f = fixture(); f.fail()
  const request = input(), result = await f.apply(request)
  expect(result).toMatchObject({phase: "uncertain", accepted: 0})
  expect(result.error).toContain("automatic replay is forbidden")
  expect(f.installed()).toBe(0)
  expect(await f.apply(request)).toEqual(result)
  expect(f.calls()).toBe(1)
  const restarted = createPreparedDeclarationActivation(f.deps)
  await expect(restarted(request)).rejects.toThrow("frontier/world mismatch")
  expect(f.calls()).toBe(1)
})
