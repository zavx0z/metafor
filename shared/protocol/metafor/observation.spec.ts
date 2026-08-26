import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import {
  ENERGY_MASS_RESULT_MAX_BYTES,
  parseMetaRuntimeAtomPointer,
  validateDarkForceHistoryReadRequest,
  validateEnergyMassResultReadRequest,
  validateMetaFieldValueApplyRequest,
  validateMetaProcessExecutionReadRequest,
} from "./observation.ts"

const ROOT = parseMetaAddress("zavx0z/lada")!
const CHILD = parseMetaAddress("zavx0z/lada-test")!

describe("agent observation public contracts", () => {
  test("parses only Graph runtime root/children pointers", () => {
    expect(parseMetaRuntimeAtomPointer("/runtime/roots/0")).toEqual([0])
    expect(parseMetaRuntimeAtomPointer("/runtime/roots/0/children/2/children/1")).toEqual([0, 2, 1])
    expect(parseMetaRuntimeAtomPointer("/template/zavx0z~1lada")).toBeNull()
    expect(parseMetaRuntimeAtomPointer("/runtime/roots/-1")).toBeNull()
    expect(parseMetaRuntimeAtomPointer("/runtime/roots/0/child/1")).toBeNull()
  })

  test("accepts closed frontier and bounded range history reads", () => {
    expect(validateDarkForceHistoryReadRequest({contractVersion: 1, query: {kind: "frontier"}})).toEqual({
      ok: true,
      value: {contractVersion: 1, query: {kind: "frontier"}},
    })
    expect(validateDarkForceHistoryReadRequest({
      contractVersion: 1,
      query: {kind: "range", cutId: "cut-1", fromSequence: 2, toSequence: 9, limit: 4},
    })).toMatchObject({ok: true})
    expect(validateDarkForceHistoryReadRequest({
      contractVersion: 1,
      query: {kind: "range", cutId: "cut-1", fromSequence: 9, toSequence: 2, limit: 4},
    })).toMatchObject({ok: false, issues: [{code: "invalid_range"}]})
    expect(validateDarkForceHistoryReadRequest({
      contractVersion: 1,
      query: {kind: "frontier", clear: true},
    })).toMatchObject({ok: false, issues: [{code: "unknown_property"}]})
  })

  test("accepts a bounded Mass result locator and rejects filesystem-shaped input", () => {
    const request = {
      contractVersion: 1 as const,
      atom: {root: ROOT, ref: "atom:2" as const, meta: CHILD},
      key: "profile",
      maxBytes: 4096,
      expectedDigest: `sha256:${"a".repeat(64)}` as const,
    }
    expect(validateEnergyMassResultReadRequest(request)).toEqual({ok: true, value: request})
    expect(validateEnergyMassResultReadRequest({...request, key: "профиль состояния"})).toMatchObject({ok: true})
    expect(validateEnergyMassResultReadRequest({...request, path: "/tmp/profile.json"}))
      .toMatchObject({ok: false, issues: [{code: "invalid_request"}]})
    expect(validateEnergyMassResultReadRequest({...request, maxBytes: ENERGY_MASS_RESULT_MAX_BYTES + 1}))
      .toMatchObject({ok: false, issues: [{code: "invalid_limit"}]})
    expect(validateEnergyMassResultReadRequest({...request, atom: {...request.atom, ref: "atom:missing"}}))
      .toMatchObject({ok: false, issues: [{code: "invalid_atom_ref"}]})
  })

  test("accepts one typed Field input at an exact causal frontier", () => {
    const request = {
      contractVersion: 1 as const,
      atom: {root: ROOT, ref: "atom:2" as const, meta: CHILD},
      field: "mode",
      value: "ready",
      expectedFrontier: {cutId: "cut-1", throughSequence: 17, retroactiveComplete: false as const},
    }
    expect(validateMetaFieldValueApplyRequest(request)).toEqual({ok: true, value: request})
    expect(validateMetaFieldValueApplyRequest({...request, value: [1, 2]}))
      .toMatchObject({ok: false, issues: [{code: "invalid_field_value"}]})
    expect(validateMetaFieldValueApplyRequest({...request, value: [1, Number.NaN]}))
      .toMatchObject({ok: false, issues: [{code: "invalid_field_value"}]})
    expect(validateMetaFieldValueApplyRequest({...request, expectedFrontier: {...request.expectedFrontier, throughSequence: -1}}))
      .toMatchObject({ok: false, issues: [{code: "invalid_sequence"}]})
    expect(validateMetaFieldValueApplyRequest({...request, atomId: 41}))
      .toMatchObject({ok: false, issues: [{code: "invalid_request"}]})
  })

  test("accepts Process observation only by locator, semantic key and public execution", () => {
    const request = {
      contractVersion: 1 as const,
      atom: {root: ROOT, ref: "atom:1" as const, meta: ROOT},
      process: "ready",
      execution: "execution-17",
    }
    expect(validateMetaProcessExecutionReadRequest(request)).toEqual({ok: true, value: request})
    expect(validateMetaProcessExecutionReadRequest({...request, execution: "boundary:17"}))
      .toMatchObject({ok: false, issues: [{code: "invalid_execution"}]})
    expect(validateMetaProcessExecutionReadRequest({...request, processId: 9}))
      .toMatchObject({ok: false, issues: [{code: "invalid_request"}]})
  })

  test("rejects accessors without invoking them", () => {
    let invoked = false
    const input: Record<string, unknown> = {contractVersion: 1, query: {kind: "frontier"}}
    Object.defineProperty(input, "query", {
      enumerable: true,
      get() {
        invoked = true
        return {kind: "frontier"}
      },
    })
    expect(validateDarkForceHistoryReadRequest(input).ok).toBe(false)
    expect(invoked).toBe(false)
  })
})
