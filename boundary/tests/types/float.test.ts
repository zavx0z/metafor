/**
 * Тесты для типа FLOAT.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import {write, update} from "../../boundary"
import { GPU, matrix$ } from "@boundary/matrix"
import { FieldType, type Collapse } from "../../fields/index.t"

describe("matrix - тип FLOAT (число) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    matrix$.reset()
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: 42 } }]], [null]]
      // Начальное значение 0 ≠ 42, поэтому после write() state=0
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 0]], collapses }],
      })
      const resultStates = await update([[0, [[0, 42]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с отрицательными числами", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: -10 } }]], [null]]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 0]], collapses }],
      })
      const resultStates = await update([[0, [[0, -10]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с дробными числами", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: 3.14 } }]], [null]]
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 0]], collapses }],
      })
      const resultStates = await update([[0, [[0, 3.14]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с нулём", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: 0 } }]], [null]]
      // Начальное значение 1 ≠ 0, поэтому после write() state=0
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 1]], collapses }],
      })
      const resultStates = await update([[0, [[0, 0]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: 42 } }]], [null]]
      // Начальное значение 42 = 42, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 42]], collapses }],
      })
      const resultStates = await update([[0, [[0, 41]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен выполнить переход, когда значение больше указанного", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { gt: 100 } }]], [null]]
      // Начальное значение 50 ≤ 100, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 50]], collapses }],
      })
      const resultStates = await update([[0, [[0, 101]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен выполнить переход, когда значение меньше указанного", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { lt: 50 } }]], [null]]
      // Начальное значение 100 ≥ 50, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 100]], collapses }],
      })
      const resultStates = await update([[0, [[0, 49]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен выполнить переход, когда значение больше или равно", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { gte: 50 } }]], [null]]
      // Начальное значение 0 < 50, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 0]], collapses }],
      })
      const resultStates = await update([[0, [[0, 50]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен выполнить переход, когда значение меньше или равно", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { lte: 50 } }]], [null]]
      // Начальное значение 100 > 50, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.F32 }],
        branes: [{ state: 0, values: [[0, 100]], collapses }],
      })
      const resultStates = await update([[0, [[0, 50]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })
})
