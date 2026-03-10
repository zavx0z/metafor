/**
 * Тесты для типа UINT с enum.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import {write, update} from "../../boundary"
import {GPU, matrixStoreReset} from "@boundary/matrix"
import { FieldType, type Collapse } from "../../fields/index.t"

describe("matrix - тип UINT (enum) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    matrixStoreReset()
  })

  describe("Прямое значение enum", () => {
    test("должен выполнить переход, когда значение равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: "MAGE" }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "MAGE"]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("не должен выполнить переход, когда значение не равно enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: "MAGE" }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "ROGUE"]]]])
      expect(resultStates).toEqual([])
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен выполнить переход, когда значение равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "WARRIOR" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "ROGUE"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "WARRIOR"]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен выполнить переход, когда значение не равно указанному enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { neq: "WARRIOR" } }]], [null]]
      // Начальное значение "WARRIOR" = "WARRIOR", поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "MAGE"]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Оператор IN (список enum)", () => {
    test("должен выполнить переход, когда enum в списке", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { in: ["WARRIOR", "MAGE"] } }]], [null]]
      // Начальное значение "ROGUE" не в списке, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "ROGUE"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "WARRIOR"]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с NOT_IN для enum", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notIn: ["WARRIOR", "MAGE"] } }]], [null]]
      // Начальное значение "WARRIOR" в списке, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "ROGUE"]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Сравнение индексов enum", () => {
    test("должен работать с GT для enum (сравнение индексов)", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { gt: "WARRIOR" } }]], [null]]
      // WARRIOR=0, начальное значение WARRIOR не > WARRIOR, поэтому НЕ переходит
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "ROGUE"]]]])  // ROGUE=2 > WARRIOR=0
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с LT для enum (сравнение индексов)", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { lt: "ROGUE" } }]], [null]]
      // ROGUE=2, начальное значение ROGUE не < ROGUE, поэтому НЕ переходит
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "ROGUE"]], collapses }],
      })
      const resultStates = await update([[0, [[0, "WARRIOR"]]]])  // WARRIOR=0 < ROGUE=2
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Ошибка при неизвестном значении enum", () => {
    test("должен выбросить ошибку при неизвестном значении enum в write()", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "MAGE" } }]], [null]]
      await expect(write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "UNKNOWN"]], collapses }],
      })).rejects.toThrow("not in enum")
    })

    test("должен выбросить ошибку при неизвестном значении enum в update", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { eq: "MAGE" } }]], [null]]
      await write({
        fields: [{ type: FieldType.U32, enum: ["WARRIOR", "MAGE", "ROGUE"] }],
        branes: [{ state: 0, values: [[0, "WARRIOR"]], collapses }],
      })
      await expect(update([[0, [[0, "UNKNOWN"]]]])).rejects.toThrow("not found in enum")
    })
  })
})
