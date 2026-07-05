/**
 * Тесты для модуля encodeValue.
 *
 * Проверяет кодирование всех типов значений:
 * - Float через bitcast
 * - Bool как 0/1
 * - Enum как индекс
 * - String через StringAtlas
 * - UINT напрямую
 */

import { test, expect, describe, beforeEach } from "bun:test"
import { createStoredStringInterner } from "../strong/string-table"
import { encodeValue, encodeFieldValue, fieldTypeToBytecodeType, floatToUint, uintToFloat } from "../weak/encode"
import { VALUE_TYPE } from "../weak"
import { FieldType } from "../gravity"

let stringInterner = createStoredStringInterner()

describe("encodeValue — кодирование значений", () => {
  beforeEach(() => {
    stringInterner = createStoredStringInterner()
  })

  test("должен кодировать float через bitcast", () => {
    const result = encodeValue(3.14, { type: VALUE_TYPE.FLOAT })
    expect(result.value1).toBe(floatToUint(3.14))
  })

  test("должен кодировать отрицательные float", () => {
    const result = encodeValue(-10.5, { type: VALUE_TYPE.FLOAT })
    expect(result.value1).toBe(floatToUint(-10.5))
  })

  test("должен кодировать bool как 0/1", () => {
    expect(encodeValue(true, { type: VALUE_TYPE.BOOL }).value1).toBe(1)
    expect(encodeValue(false, { type: VALUE_TYPE.BOOL }).value1).toBe(0)
  })

  test("должен кодировать enum как индекс", () => {
    const result = encodeValue("MAGE", {
      type: VALUE_TYPE.UINT,
      enum: ["WARRIOR", "MAGE", "ROGUE"],
    })
    expect(result.value1).toBe(1)
  })

  test("должен бросать ошибку для неизвестного enum значения", () => {
    expect(() =>
      encodeValue("UNKNOWN", {
        type: VALUE_TYPE.UINT,
        enum: ["WARRIOR", "MAGE"],
      }),
    ).toThrow()
  })

  test("должен интернировать строки через StringAtlas", () => {
    const result1 = encodeValue("hero", { type: VALUE_TYPE.STRING, stringInterner })
    const result2 = encodeValue("hero", { type: VALUE_TYPE.STRING, stringInterner })
    expect(result1.value1).toBe(result2.value1) // Одинаковый ID для одинаковой строки
    expect(result1.value2).toBe(0)
    expect(result2.value2).toBe(0)
    expect(stringInterner.table).toEqual(["", "hero"])
  })

  test("должен кодировать числа как UINT", () => {
    expect(encodeValue(42, { type: VALUE_TYPE.UINT }).value1).toBe(42)
    expect(encodeValue(100, { type: VALUE_TYPE.UINT }).value1).toBe(100)
  })
})

describe("encodeFieldValue — кодирование значений для heap", () => {
  beforeEach(() => {
    stringInterner = createStoredStringInterner()
  })

  test("должен кодировать float через bitcast", () => {
    const result = encodeFieldValue(3.14, { type: VALUE_TYPE.FLOAT })
    expect(result).toBe(floatToUint(3.14))
  })

  test("должен кодировать bool как 0/1", () => {
    expect(encodeFieldValue(true, { type: VALUE_TYPE.BOOL })).toBe(1)
    expect(encodeFieldValue(false, { type: VALUE_TYPE.BOOL })).toBe(0)
  })

  test("должен кодировать enum как индекс", () => {
    const result = encodeFieldValue("MAGE", {
      type: VALUE_TYPE.UINT,
      enum: ["WARRIOR", "MAGE", "ROGUE"],
    })
    expect(result).toBe(1)
  })

  test("должен интернировать строки через StringAtlas", () => {
    const result1 = encodeFieldValue("hero", { type: VALUE_TYPE.STRING, stringInterner })
    const result2 = encodeFieldValue("hero", { type: VALUE_TYPE.STRING, stringInterner })
    expect(result1).toBe(result2) // Одинаковый ID для одинаковой строки
    expect(stringInterner.table).toEqual(["", "hero"])
  })

  test("должен кодировать числа как UINT", () => {
    expect(encodeFieldValue(42, { type: VALUE_TYPE.UINT })).toBe(42)
    expect(encodeFieldValue(100, { type: VALUE_TYPE.UINT })).toBe(100)
  })
})

describe("fieldTypeToBytecodeType — маппинг типов", () => {
  test("должен маппить прямые соответствия", () => {
    expect(fieldTypeToBytecodeType(FieldType.F32)).toBe(VALUE_TYPE.FLOAT)
    expect(fieldTypeToBytecodeType(FieldType.U32)).toBe(VALUE_TYPE.UINT)
    expect(fieldTypeToBytecodeType(FieldType.BOOL)).toBe(VALUE_TYPE.BOOL)
    expect(fieldTypeToBytecodeType(FieldType.STRING_PTR)).toBe(VALUE_TYPE.STRING)
    expect(fieldTypeToBytecodeType(FieldType.ARRAY_PTR)).toBe(VALUE_TYPE.ARRAY)
  })
})

describe("floatToUint / uintToFloat — bitcast", () => {
  test("должен конвертировать float → uint → float без потерь", () => {
    const original = 3.14159
    const encoded = floatToUint(original)
    const decoded = uintToFloat(encoded)
    expect(decoded).toBeCloseTo(original, 5)
  })

  test("должен работать с отрицательными числами", () => {
    const original = -10.5
    const encoded = floatToUint(original)
    const decoded = uintToFloat(encoded)
    expect(decoded).toBeCloseTo(original, 5)
  })

  test("должен работать с нулём", () => {
    const original = 0.0
    const encoded = floatToUint(original)
    const decoded = uintToFloat(encoded)
    expect(decoded).toBe(original)
  })
})
