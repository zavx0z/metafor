import {describe, expect, test} from "bun:test"
import {
  resolveCanonicalForceFieldsPayload,
  resolveForceFieldsPayload,
} from "./fields.ts"

describe("canonical Gluon Field payload", () => {
  test("keeps one field key with exactly one canonical Value identity and value", () => {
    const payload = {
      fields: {
        11: {valueId: 101, value: "left"},
        22: {valueId: 101, value: "right"},
      },
    }
    expect(resolveCanonicalForceFieldsPayload(payload)).toEqual(payload.fields)
    expect(resolveForceFieldsPayload(payload)).toEqual({11: "left", 22: "right"})
  })

  test("rejects missing, ambiguous and duplicated identity facts", () => {
    expect(resolveCanonicalForceFieldsPayload({fields: {11: {value: "x"}}})).toBeNull()
    expect(resolveCanonicalForceFieldsPayload({fields: {11: {valueId: 0, value: "x"}}})).toBeNull()
    expect(resolveCanonicalForceFieldsPayload({
      fields: {11: {valueId: 1, fieldId: 11, value: "x"}},
    })).toBeNull()
  })
})
