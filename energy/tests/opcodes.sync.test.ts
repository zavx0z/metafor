/**
 * Тест на синхронизацию констант OP и TYPE между TypeScript и WGSL.
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
 *
 * **TYPE (типы данных):**
 * - FLOAT = 0u, UINT = 1u, BOOL = 2u, STRING = 3u, ARRAY = 4u
 *
 * @see opcodes.ts — TypeScript константы
 * @see evolution.wgsl — WGSL шейдер (строки 300-400)
 */

import { test, expect, describe } from "bun:test"
import { OP, TYPE } from "../weak"

describe("Синхронизация констант OP/TYPE", () => {
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
  })

  describe("TYPE (типы данных)", () => {
    test("FLOAT должен быть 0 (wgsl: field_type == 0u)", () => {
      expect(TYPE.FLOAT).toBe(0)
    })

    test("UINT должен быть 1 (wgsl: field_type == 1u)", () => {
      expect(TYPE.UINT).toBe(1)
    })

    test("BOOL должен быть 2 (wgsl: field_type == 2u)", () => {
      expect(TYPE.BOOL).toBe(2)
    })

    test("STRING должен быть 3 (wgsl: field_type == 3u)", () => {
      expect(TYPE.STRING).toBe(3)
    })

    test("ARRAY должен быть 4 (wgsl: field_type == 4u)", () => {
      expect(TYPE.ARRAY).toBe(4)
    })
  })

  describe("Порядок констант", () => {
    test("OP должен быть последовательным (0-11)", () => {
      const values = Object.values(OP) as number[]
      for (let i = 0; i < values.length; i++) {
        expect(values[i]).toBe(i)
      }
    })

    test("TYPE должен быть последовательным (0-4)", () => {
      const values = Object.values(TYPE) as number[]
      for (let i = 0; i < values.length; i++) {
        expect(values[i]).toBe(i)
      }
    })
  })
})
