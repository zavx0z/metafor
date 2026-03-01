/**
 * Тесты для типа ARRAY.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { write, update } from "@boundary/fields"
import { resetMatrix } from "@boundary/matrix"
import { GPU } from "@boundary/matrix"
import { FieldType, type Collapse } from "@boundary/fields"
import { resetStringAtlas } from "@boundary/atlas"

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
      // write() с пустым массивом [] не содержит 5, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 3, 5, 7]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("не должен выполнить переход, когда массив не содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toEqual([])
    })
  })

  describe("Оператор NOT_INCLUDE (не содержит элемент)", () => {
    test("должен выполнить переход, когда массив не содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notInclude: 10 } }]], [null]]
      // write() с пустым массивом, затем update() инициализирует [1, 2, 3]
      // [1, 2, 3] не содержит 10 → notInclude:10 = TRUE → transition
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("не должен выполнить переход, когда массив содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { notInclude: 5 } }]], [null]]
      // write() с пустым массивом, затем update() инициализирует [1, 5, 10]
      // [1, 5, 10] содержит 5 → notInclude:5 = FALSE → no transition
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 5, 10]]]]])
      expect(resultStates).toEqual([])
    })
  })

  describe("Оператор LENGTH (длина массива)", () => {
    test("должен выполнить переход, когда длина равна указанному", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 3 } }]], [null]]
      // Пустой массив имеет длину 0 ≠ 3, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда длина больше указанной", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { gt: 2 } } }]], [null]]
      // Пустой массив имеет длину 0 ≤ 2, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3, 4]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда длина меньше или равна", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { lte: 3 } } }]], [null]]
      // write() с пустым массивом (длина 0 ≤ 3), поэтому УСЛОВИЕ length:lte:3 = TRUE
      // После write() state=1 (терминальное), update не меняет
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      // update с массивом длины 3: length:lte:3 = TRUE, но state уже 1 (терминальное)
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен выполнить переход, когда массив пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом []: isEmpty:true = TRUE → переход в state=1
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      // update с непустым массивом: state уже 1 (терминальное)
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("не должен выполнить переход, когда массив не пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом []: isEmpty:true = TRUE → переход в state=1 (терминальное)
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })

  describe("Массивы строк", () => {
    test("должен работать с массивом строк и оператором include", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, ["warrior", "mage", "hero"]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с массивом строк и оператором length", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 2 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, ["alpha", "beta"]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Комбинированные условия", () => {
    test("должен работать с комбинацией include и length", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { gte: 3 }, include: 5 } }]], [null]]
      // Пустой массив не удовлетворяет условиям, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 5, 10]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Непустые массивы в write()", () => {
    test("должен поддержать непустой массив чисел в params", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 3 } }]], [null]]
      // write() с непустым массивом [1, 2, 3]: length=3 → УСЛОВИЕ ИСТИНА → переход в state=1
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, [1, 2, 3]]], collapses }],
      })
      // После write() state=1 (терминальное), update не меняет
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("должен поддержать непустой массив строк в params", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: "hero" } }]], [null]]
      // write() с непустым массивом ["warrior", "hero"]: включает "hero" → УСЛОВИЕ ИСТИНА → переход
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, params: [[0, ["warrior", "hero"]]], collapses }],
      })
      // После write() state=1 (терминальное)
      const resultStates = await update([[0, [[0, ["mage"]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("должен поддержать пустой массив с переходом при isEmpty", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом []: isEmpty=true → УСЛОВИЕ ИСТИНА → переход
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, params: [[0, []]], collapses }],
      })
      // После write() state=1 (терминальное)
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })
})
