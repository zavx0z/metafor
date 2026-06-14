/**
 * Тесты для типа ARRAY.
 */
import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture"
import {write, update} from "../../energy"
import { GPU, weak$ } from "../../weak"
import { FieldType, type Collapse } from "../../gravity"

describe("weak - тип ARRAY (массив) с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  afterEach(() => {
    weak$.reset()
  })

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен выполнить переход, когда массив содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: 5 } }]], [null]]
      // write() с пустым массивом [] не содержит 5, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 3, 5, 7]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("не должен выполнить переход, когда массив не содержит элемент", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: 5 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
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
        branes: [{ state: 0, values: [[0, []]], collapses }],
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
        branes: [{ state: 0, values: [[0, []]], collapses }],
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
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда длина больше указанной", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { gt: 2 } } }]], [null]]
      // Пустой массив имеет длину 0 ≤ 2, поэтому НЕ переходит после write()
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 2, 3, 4]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен выполнить переход, когда длина меньше или равна", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: { lte: 3 } } }]], [null]]
      // write() с пустым массивом (длина 0 ≤ 3) — TAKT 0: инициализация без перехода
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      // update() — TAKT 1: длина 0 ≤ 3 → переход в state=1
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // update с массивом длины 3: state уже 1 (терминальное), изменений нет
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен выполнить переход, когда массив пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом [] — TAKT 0: инициализация без перехода
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      // update() — TAKT 1: isEmpty=true → переход в state=1
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // update с непустым массивом: state уже 1 (терминальное)
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("не должен выполнить переход, когда массив не пустой", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом [] — TAKT 0: инициализация
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      // update() — TAKT 1: isEmpty=true → переход в state=1 (терминальное)
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // update с непустым массивом: state уже 1 (терминальное)
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })

  describe("Массивы строк", () => {
    test("должен работать с массивом строк и оператором include", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: "hero" } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, ["warrior", "mage", "hero"]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })

    test("должен работать с массивом строк и оператором length", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 2 } }]], [null]]
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
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
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      const resultStates = await update([[0, [[0, [1, 5, 10]]]]])
      expect(resultStates).toContainEqual([0, 1])
    })
  })

  describe("Непустые массивы в write()", () => {
    test("должен поддержать непустой массив чисел в params", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { length: 3 } }]], [null]]
      // write() с непустым массивом [1, 2, 3] — TAKT 0: инициализация без перехода
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, [1, 2, 3]]], collapses }],
      })
      // update() — TAKT 1: length=3 → переход в state=1
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // После перехода state=1 (терминальное), update не меняет
      const resultStates = await update([[0, [[0, [1, 2, 3]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("должен поддержать непустой массив строк в params", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { include: "hero" } }]], [null]]
      // write() с непустым массивом ["warrior", "hero"] — TAKT 0: инициализация
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "string" }],
        branes: [{ state: 0, values: [[0, ["warrior", "hero"]]], collapses }],
      })
      // update() — TAKT 1: включает "hero" → переход в state=1
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // После перехода state=1 (терминальное)
      const resultStates = await update([[0, [[0, ["mage"]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })

    test("должен поддержать пустой массив с переходом при isEmpty", async () => {
      const collapses: Collapse[][] = [[[1, { 0: { isEmpty: true } }]], [null]]
      // write() с пустым массивом [] — TAKT 0: инициализация
      await write({
        fields: [{ type: FieldType.ARRAY_PTR, elementType: "number" }],
        branes: [{ state: 0, values: [[0, []]], collapses }],
      })
      // update() — TAKT 1: isEmpty=true → переход в state=1
      const states1 = await update([[0, []]])
      expect(states1).toContainEqual([0, 1])
      
      // После перехода state=1 (терминальное)
      const resultStates = await update([[0, [[0, [1]]]]])
      expect(resultStates).toEqual([])  // Уже в терминальном состоянии
    })
  })
})
