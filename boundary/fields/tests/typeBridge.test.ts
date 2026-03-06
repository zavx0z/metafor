/**
 * Тесты typeBridge.
 */
import { describe, expect, test } from "bun:test"
import { TYPE } from "../opcodes"
import { fieldTypeToBytecodeType } from "../values"
import { FieldType } from "../index.t"

describe("fieldTypeToBytecodeType", () => {
  test("маппит прямые соответствия FieldType -> TYPE", () => {
    expect(fieldTypeToBytecodeType(FieldType.F32)).toBe(TYPE.FLOAT)
    expect(fieldTypeToBytecodeType(FieldType.U32)).toBe(TYPE.UINT)
    expect(fieldTypeToBytecodeType(FieldType.BOOL)).toBe(TYPE.BOOL)
    expect(fieldTypeToBytecodeType(FieldType.STRING_PTR)).toBe(TYPE.STRING)
    expect(fieldTypeToBytecodeType(FieldType.ARRAY_PTR)).toBe(TYPE.ARRAY)
  })
})
