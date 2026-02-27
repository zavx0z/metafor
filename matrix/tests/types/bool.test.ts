/**
 * Тесты для типа BOOLEAN.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../../index"
import { GPU } from "../../gpu/device"
import { FieldType } from "../../index.t"
import { resetStringAtlas } from "../../StringAtlas"

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
      const collapses = [[[1, { 0: true }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, false]], collapses }],
      })
      const resultStates = await update(0, 0, true)
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const collapses = [[[1, { 0: false }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update(0, 0, false)
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно true", async () => {
      const collapses = [[[1, { 0: { eq: true } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, false]], collapses }],
      })
      const resultStates = await update(0, 0, true)
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен выполнить переход, когда значение равно false", async () => {
      const collapses = [[[1, { 0: { eq: false } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update(0, 0, false)
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно true", async () => {
      const collapses = [[[1, { 0: { neq: true } }]], [null]]
      await write({
        fields: [{ type: FieldType.BOOL }],
        branes: [{ state: 0, params: [[0, true]], collapses }],
      })
      const resultStates = await update(0, 0, false)
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })
})
