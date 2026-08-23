/**
 * Тесты typeBridge.
 */
import { describe, expect, test } from "bun:test"
import { VALUE_TYPE } from "../weak"
import { fieldTypeToBytecodeType } from "../weak/encode"
import { FieldType } from "../gravity"

describe("fieldTypeToBytecodeType", () => {
  test("маппит прямые соответствия FieldType -> VALUE_TYPE", () => {
    expect(fieldTypeToBytecodeType(FieldType.F32)).toBe(VALUE_TYPE.FLOAT)
    expect(fieldTypeToBytecodeType(FieldType.U32)).toBe(VALUE_TYPE.UINT)
    expect(fieldTypeToBytecodeType(FieldType.BOOL)).toBe(VALUE_TYPE.BOOL)
    expect(fieldTypeToBytecodeType(FieldType.STRING_PTR)).toBe(VALUE_TYPE.STRING)
    expect(fieldTypeToBytecodeType(FieldType.ARRAY_PTR)).toBe(VALUE_TYPE.ARRAY)
  })
})
