import { test, expect, describe, beforeAll, afterEach } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"
import type { NumericSuperposition } from "../../src/index.t"

describe("Boundary - тип ARRAY с bun-webgpu", () => {
  let boundary: Boundary

  beforeAll(async () => {
    GPU._device = await setupDevice()
    boundary = new Boundary()
  })

  afterEach(() => {
    boundary.clear()
  })

  // Поддерживаемые типы элементов: array<string>, array<number>

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен выполнить переход, если массив содержит указанный элемент (число)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { include: 5 } } }],  // IDLE → ACTIVE если array включает 5
          [null],                                           // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [1, 5, 10]]], superposition },
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
          { state: 0, params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход, если массив содержит указанный элемент (строка)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { include: "fire" } } }],  // IDLE → ACTIVE если array включает "fire"
          [null],                                                // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "string" }]],
        branes: [
          { state: 0, params: [[0, ["fire", "ice", "lightning"]]], superposition },
          { state: 0, params: [[0, ["ice", "lightning"]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор NOT_INCLUDE (не содержит элемент)", () => {
    test("должен выполнить переход, если массив не содержит указанный элемент", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { notInclude: 5 } } }],  // IDLE → ACTIVE если array НЕ включает 5
          [null],                                              // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
          { state: 0, params: [[0, [99, 100]]], superposition },
          { state: 0, params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1) — [1,2,3] не содержит 5 → ACTIVE
      expect(resultStates[1]).toBe(1)  // ACTIVE (индекс 1) — [99,100] не содержит 5 → ACTIVE
      expect(resultStates[2]).toBe(1)  // ACTIVE (индекс 1) — [] не содержит 5 → ACTIVE
    })
  })

  describe("Оператор LENGTH (длина массива)", () => {
    test("должен выполнить переход, когда длина равна указанному значению", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { length: 2 } } }],  // IDLE → ACTIVE если length === 2
          [null],                                          // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [1, 2]]], superposition },
          { state: 0, params: [[0, [1]]], superposition },
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен поддерживать сравнение длины с операторами", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { length: { gt: 2 } } } }],  // IDLE → ACTIVE если length > 2
          [null],                                                  // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [1, 2, 3, 4]]], superposition },
          { state: 0, params: [[0, [1, 2]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен выполнить переход, если массив пустой", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { isEmpty: true } } }],  // IDLE → ACTIVE если array пуст
          [null],                                              // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, []]], superposition },
          { state: 0, params: [[0, [1]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен выполнить переход, если массив не пустой (isEmpty: false)", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { isEmpty: false } } }],  // IDLE → ACTIVE если array НЕ пуст
          [null],                                               // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
          { state: 0, params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Комбинированные условия с массивами", () => {
    test("должен выполнить переход, когда несколько условий выполнены", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [
            {
              to: 1,
              conditions: {
                0: { length: { gte: 2 } },  // array1.length >= 2
                1: { include: 5 },           // array2 включает 5
              },
            },
          ],
          [null],
        ],
      }

      await boundary.write({
        fields: [
          [0, { type: FieldType.ARRAY_PTR, elementType: "number" }],
          [1, { type: FieldType.ARRAY_PTR, elementType: "number" }],
        ],
        branes: [
          { state: 0, params: [[0, [1, 2, 3]], [1, [1, 5]]], superposition },
          { state: 0, params: [[0, [1]], [1, [1, 5]]], superposition },
          { state: 0, params: [[0, [1, 2, 3]], [1, [2, 3]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })
  })

  describe("Пограничные случаи", () => {
    test("должен корректно обрабатывать пустой массив", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { length: 0 } } }],  // IDLE → ACTIVE если length === 0
          [null],                                          // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, []]], superposition },
          { state: 0, params: [[0, [1]]], superposition },
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен корректно обрабатывать массив с одним элементом", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { length: 1 } } }],  // IDLE → ACTIVE если length === 1
          [null],                                          // ACTIVE — терминальное
        ],
      }

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, [42]]], superposition },
          { state: 0, params: [[0, []]], superposition },
          { state: 0, params: [[0, [1, 2]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
      expect(resultStates[2]).toBe(0)  // IDLE (индекс 0)
    })

    test("должен корректно обрабатывать большой массив", async () => {
      const superposition: NumericSuperposition = {
        transitions: [
          [{ to: 1, conditions: { 0: { length: { gte: 100 } } } }],  // IDLE → ACTIVE если length >= 100
          [null],                                                     // ACTIVE — терминальное
        ],
      }

      const largeArray = Array.from({ length: 100 }, (_, i) => i)

      await boundary.write({
        fields: [[0, { type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: 0, params: [[0, largeArray]], superposition },
          { state: 0, params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const resultStates = await boundary.getStates()

      expect(resultStates[0]).toBe(1)  // ACTIVE (индекс 1)
      expect(resultStates[1]).toBe(0)  // IDLE (индекс 0)
    })
  })
})
