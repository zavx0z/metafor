import { describe, expect, test } from "bun:test"
import { TYPE } from "../src/opcodes"
import { FieldType } from "../src/core/FieldRegistry"
import { fieldTypeToBytecodeType } from "../src/utils/typeBridge"

describe("fieldTypeToBytecodeType", () => {
  test("маппит прямые соответствия FieldType -> TYPE", () => {
    expect(fieldTypeToBytecodeType(FieldType.F32)).toBe(TYPE.FLOAT)
    expect(fieldTypeToBytecodeType(FieldType.U32)).toBe(TYPE.UINT)
    expect(fieldTypeToBytecodeType(FieldType.BOOL)).toBe(TYPE.BOOL)
    expect(fieldTypeToBytecodeType(FieldType.STRING_PTR)).toBe(TYPE.STRING)
    expect(fieldTypeToBytecodeType(FieldType.ARRAY_PTR)).toBe(TYPE.ARRAY)
  })

  test("маппит SHARED_PTR в TYPE.UINT как fallback совместимости", () => {
    expect(fieldTypeToBytecodeType(FieldType.SHARED_PTR)).toBe(TYPE.UINT)
  })
})
