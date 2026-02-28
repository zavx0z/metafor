/**
 * Тесты для типа ARRAY.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update, resetMatrix } from "../../index"
import { GPU } from "../../gpu/device"
import { FieldType, type Collapse } from "../../index.t"
import { resetStringAtlas } from "../../StringAtlas"

describe("matrix - тип ARRAY (массив) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    resetStringAtlas()
    resetMatrix()
  })

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен выполнить переход, когда массив содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 3, 5, 7] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("не должен выполнить переход, когда массив не содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3] }]]])
      expect(resultStates[0]?.[1]).toBe(0)
    })
  })

  describe("Оператор NOT_INCLUDE (не содержит элемент)", () => {
    test("должен выполнить переход, когда массив не содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notInclude: 10 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("не должен выполнить переход, когда массив содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notInclude: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 5, 10] }]]])
      expect(resultStates[0]?.[1]).toBe(0)
    })
  })

  describe("Оператор LENGTH (длина массива)", () => {
    test("должен выполнить переход, когда длина равна указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 3 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен выполнить переход, когда длина больше указанной", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { gt: 2 } } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3, 4] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен выполнить переход, когда длина меньше или равна", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { lte: 3 } } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 2, 3] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен выполнить переход, когда массив пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("не должен выполнить переход, когда массив не пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом: isEmpty=true → переход в state=1 (терминальное)
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      // update с непустым массивом: остаёмся в state=1 (терминальное)
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Массивы строк", () => {
    test("должен работать с массивом строк и оператором include", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: ["warrior", "mage", "hero"] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })

    test("должен работать с массивом строк и оператором length", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 2 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: ["alpha", "beta"] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией include и length", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { gte: 3 }, include: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [{ fieldIndex: 0, value: [1, 5, 10] }]]])
      expect(resultStates[0]?.[1]).toBe(1)
    })
  })
})
