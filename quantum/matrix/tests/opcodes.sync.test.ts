/**
 * Тест на синхронизацию констант OP и VALUE_TYPE между TypeScript и WGSL.
 *
 * ## Важность
 *
 * Константы в `opcodes.ts` должны **бинарно совпадать** с литералами в `evolution.wgsl`.
 * Рассинхронизация приведёт к некорректному выполнению шейдера.
 *
 * ## WGSL константы (из evolution.wgsl)
 *
 * **OP (операции сравнения):**
 * - EQ = 0u, NEQ = 1u, GT = 2u, LT = 3u, GTE = 4u, LTE = 5u
 * - IN = 6u, NOT_IN = 7u
 * - INCLUDE = 8u, NOT_INCLUDE = 9u
 * - LENGTH = 10u, IS_EMPTY = 11u
 * - IS_NULL = 12u, IS_NOT_NULL = 13u
 * - строковые операции = 14u..19u
 * - проверки длины = 20u..23u
 * - ARRAY_EQ = 24u, EVERY = 25u, SOME = 26u
 * - STRING_BETWEEN = 27u, PATTERN = 28u, RESOLVED = 29u
 *
 * **VALUE_TYPE (типы данных):**
 * - FLOAT = 0u, UINT = 1u, BOOL = 2u, STRING = 3u, ARRAY = 4u
 *
 * @see opcodes.ts — TypeScript константы
 * @see evolution.wgsl — WGSL шейдер (строки 300-400)
 */

import { test, expect, describe } from "bun:test"
import { OP, VALUE_TYPE } from "../weak"

describe("Синхронизация констант OP/VALUE_TYPE", () => {
  describe("OP (операции сравнения)", () => {
    test("EQ должен быть 0 (wgsl: op == 0u)", () => {
      expect(OP.EQ).toBe(0)
    })

    test("NEQ должен быть 1 (wgsl: op == 1u)", () => {
      expect(OP.NEQ).toBe(1)
    })

    test("GT должен быть 2 (wgsl: op == 2u)", () => {
      expect(OP.GT).toBe(2)
    })

    test("LT должен быть 3 (wgsl: op == 3u)", () => {
      expect(OP.LT).toBe(3)
    })

    test("GTE должен быть 4 (wgsl: op == 4u)", () => {
      expect(OP.GTE).toBe(4)
    })

    test("LTE должен быть 5 (wgsl: op == 5u)", () => {
      expect(OP.LTE).toBe(5)
    })

    test("IN должен быть 6 (wgsl: op == 6u)", () => {
      expect(OP.IN).toBe(6)
    })

    test("NOT_IN должен быть 7 (wgsl: op == 7u)", () => {
      expect(OP.NOT_IN).toBe(7)
    })

    test("INCLUDE должен быть 8 (wgsl: op == 8u)", () => {
      expect(OP.INCLUDE).toBe(8)
    })

    test("NOT_INCLUDE должен быть 9 (wgsl: op == 9u)", () => {
      expect(OP.NOT_INCLUDE).toBe(9)
    })

    test("LENGTH должен быть 10 (wgsl: op == 10u)", () => {
      expect(OP.LENGTH).toBe(10)
    })

    test("IS_EMPTY должен быть 11 (wgsl: op == 11u)", () => {
      expect(OP.IS_EMPTY).toBe(11)
    })

    test("расширенный язык должен занимать коды 12-29", () => {
      expect({
        IS_NULL: OP.IS_NULL,
        IS_NOT_NULL: OP.IS_NOT_NULL,
        STARTS_WITH: OP.STARTS_WITH,
        ENDS_WITH: OP.ENDS_WITH,
        CONTAINS: OP.CONTAINS,
        NOT_CONTAINS: OP.NOT_CONTAINS,
        NOT_STARTS_WITH: OP.NOT_STARTS_WITH,
        NOT_ENDS_WITH: OP.NOT_ENDS_WITH,
        LENGTH_GT: OP.LENGTH_GT,
        LENGTH_GTE: OP.LENGTH_GTE,
        LENGTH_LT: OP.LENGTH_LT,
        LENGTH_LTE: OP.LENGTH_LTE,
        ARRAY_EQ: OP.ARRAY_EQ,
        EVERY: OP.EVERY,
        SOME: OP.SOME,
        STRING_BETWEEN: OP.STRING_BETWEEN,
        PATTERN: OP.PATTERN,
        RESOLVED: OP.RESOLVED,
      }).toEqual({
        IS_NULL: 12,
        IS_NOT_NULL: 13,
        STARTS_WITH: 14,
        ENDS_WITH: 15,
        CONTAINS: 16,
        NOT_CONTAINS: 17,
        NOT_STARTS_WITH: 18,
        NOT_ENDS_WITH: 19,
        LENGTH_GT: 20,
        LENGTH_GTE: 21,
        LENGTH_LT: 22,
        LENGTH_LTE: 23,
        ARRAY_EQ: 24,
        EVERY: 25,
        SOME: 26,
        STRING_BETWEEN: 27,
        PATTERN: 28,
        RESOLVED: 29,
      })
    })
  })

  describe("VALUE_TYPE (типы данных)", () => {
    test("FLOAT должен быть 0 (wgsl: field_type == 0u)", () => {
      expect(VALUE_TYPE.FLOAT).toBe(0)
    })

    test("UINT должен быть 1 (wgsl: field_type == 1u)", () => {
      expect(VALUE_TYPE.UINT).toBe(1)
    })

    test("BOOL должен быть 2 (wgsl: field_type == 2u)", () => {
      expect(VALUE_TYPE.BOOL).toBe(2)
    })

    test("STRING должен быть 3 (wgsl: field_type == 3u)", () => {
      expect(VALUE_TYPE.STRING).toBe(3)
    })

    test("ARRAY должен быть 4 (wgsl: field_type == 4u)", () => {
      expect(VALUE_TYPE.ARRAY).toBe(4)
    })
  })

  describe("Порядок констант", () => {
    test("OP должен быть последовательным (0-29)", () => {
      const values = Object.values(OP) as number[]
      for (let i = 0; i < values.length; i++) {
        expect(values[i]).toBe(i)
      }
    })

    test("VALUE_TYPE должен быть последовательным (0-4)", () => {
      const values = Object.values(VALUE_TYPE) as number[]
      for (let i = 0; i < values.length; i++) {
        expect(values[i]).toBe(i)
      }
    })
  })
})
