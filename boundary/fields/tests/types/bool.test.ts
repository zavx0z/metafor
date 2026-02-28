/**
 * Тесты для типа BOOLEAN.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update } from "@boundary/fields"
import { resetMatrix } from "@boundary/matrix"
import { GPU } from "@boundary/matrix"
import { FieldType, type Collapse } from "@boundary/fields"
import { resetStringAtlas } from "@boundary/atlas"

describe("matrix - тип BOOLEAN (логический) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Прямое значение", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const collapses: Collapse[][] = [[[1, { 0: true }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, false]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: true }]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const collapses: Collapse[][] = [[[1, { 0: false }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: false }]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: true } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, false]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: true }]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: false } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: false }]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно true", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: true } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: false }]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })
})
