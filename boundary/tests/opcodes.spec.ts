/**
 * Тесты для opcodes.
 *
 * Проверяет:
 * - Наличие всех кодов операций
 * - Наличие всех типов данных
 * - Соответствие значений (для синхронизации с WGSL)
 */

import { describe, it, expect } from "bun:test"
import { OP, TYPE } from "@boundary/matrix"

describe("OP (коды операций)", () => {
  it("должен содержать все коды операций", () => {
    expect(OP.EQ).toBe(0)
    expect(OP.NEQ).toBe(1)
    expect(OP.GT).toBe(2)
    expect(OP.LT).toBe(3)
    expect(OP.GTE).toBe(4)
    expect(OP.LTE).toBe(5)
    expect(OP.IN).toBe(6)
    expect(OP.NOT_IN).toBe(7)
    expect(OP.INCLUDE).toBe(8)
    expect(OP.NOT_INCLUDE).toBe(9)
    expect(OP.LENGTH).toBe(10)
    expect(OP.IS_EMPTY).toBe(11)
  })

  it("должен иметь последовательные значения", () => {
    const values = Object.values(OP) as number[]
    for (let i = 0; i < values.length; i++) {
      expect(values[i]).toBe(i)
    }
  })
})

describe("TYPE (типы данных)", () => {
  it("должен содержать все типы данных", () => {
    expect(TYPE.FLOAT).toBe(0)
    expect(TYPE.UINT).toBe(1)
    expect(TYPE.BOOL).toBe(2)
    expect(TYPE.STRING).toBe(3)
    expect(TYPE.ARRAY).toBe(4)
  })

  it("должен иметь последовательные значения", () => {
    const values = Object.values(TYPE) as number[]
    for (let i = 0; i < values.length; i++) {
      expect(values[i]).toBe(i)
    }
  })
})
