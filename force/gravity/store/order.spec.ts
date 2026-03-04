/**
 * Тесты для модуля order.
 */

import { describe, expect, test } from "bun:test"
import { first, last, between, compare } from "./order"

describe("order", () => {
  describe("first()", () => {
    test("возвращает Uint8Array", () => {
      const result = first()
      expect(result).toBeInstanceOf(Uint8Array)
    })

    test("возвращает [128]", () => {
      const result = first()
      expect(result).toEqual(new Uint8Array([128]))
    })
  })

  describe("last()", () => {
    test("возвращает Uint8Array", () => {
      const result = last()
      expect(result).toBeInstanceOf(Uint8Array)
    })

    test("возвращает [255]", () => {
      const result = last()
      expect(result).toEqual(new Uint8Array([255]))
    })
  })

  describe("between()", () => {
    test("создаёт первый элемент когда оба null", () => {
      const result = between(null, null)
      expect(result).toEqual(new Uint8Array([128]))
    })

    test("создаёт следующий элемент после prev", () => {
      const prev = new Uint8Array([128])
      const result = between(prev, null)
      expect(result).toEqual(new Uint8Array([128, 128]))
    })

    test("создаёт элемент перед next", () => {
      const next = new Uint8Array([128])
      const result = between(null, next)
      expect(result).toEqual(new Uint8Array([64]))
    })

    test("создаёт промежуточный элемент между prev и next", () => {
      const prev = new Uint8Array([100])
      const next = new Uint8Array([200])
      const result = between(prev, next)
      expect(result).toEqual(new Uint8Array([150]))
    })
  })

  describe("compare()", () => {
    test("возвращает -1 когда a < b", () => {
      const a = first()
      const b = last()
      expect(compare(a, b)).toBe(-1)
    })

    test("возвращает 0 когда a === b", () => {
      const a = first()
      const b = first()
      expect(compare(a, b)).toBe(0)
    })

    test("возвращает 1 когда a > b", () => {
      const a = last()
      const b = first()
      expect(compare(a, b)).toBe(1)
    })
  })
})
