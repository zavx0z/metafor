import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice } from "fixture/bunWebGPU"
import { Boundary, GPU, FieldType } from "../../src/index"

describe("Boundary - тип ARRAY с bun-webgpu", () => {
  beforeAll(async () => {
    GPU._device = await setupDevice()
  })

  // ПРИМЕЧАНИЕ: Тип ARRAY хранится как длина + указатели на элементы.
  // Поддерживаемые типы элементов: array<string>, array<number>

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен выполнить переход, если массив содержит указанный элемент (число)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { include: 5 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, [1, 5, 10]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
          { state: "IDLE", params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, если массив содержит указанный элемент (строка)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { include: "fire" } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "string" }]],
        branes: [
          { state: "IDLE", params: [[0, ["fire", "ice", "lightning"]]], superposition },
          { state: "IDLE", params: [[0, ["ice", "lightning"]]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
    })
  })

  describe("Оператор NOT_INCLUDE (не содержит элемент)", () => {
    test("должен выполнить переход, если массив не содержит указанный элемент", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { notInclude: 99 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
          { state: "IDLE", params: [[0, [99, 100]]], superposition },
          { state: "IDLE", params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор LENGTH (длина массива)", () => {
    test("должен выполнить переход, когда длина равна указанному значению", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { length: 3 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
          { state: "IDLE", params: [[0, [1, 2]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3, 4]]], superposition },
          { state: "IDLE", params: [[0, []]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
      expect(states[3]).toBe("IDLE")
    })

    test("должен поддерживать сравнение длины с операторами", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { length: { gte: 2 } } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, [1]]], superposition },
          { state: "IDLE", params: [[0, [1, 2]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен выполнить переход, если массив пустой", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { EMPTY: { 0: { isEmpty: true } } },
        EMPTY: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, []]], superposition },
          { state: "IDLE", params: [[0, [1]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("EMPTY")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, если массив не пустой (isEmpty: false)", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { isEmpty: false } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          { state: "IDLE", params: [[0, []]], superposition },
          { state: "IDLE", params: [[0, [1]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3]]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("IDLE")
      expect(states[1]).toBe("ACTIVE")
      expect(states[2]).toBe("ACTIVE")
    })
  })

  describe("Комбинированные условия с массивами", () => {
    test("должен выполнить переход, когда несколько условий выполнены", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: {
          ACTIVE: {
            0: { length: { gte: 2, lte: 5 } },
            1: { include: 1 },
          },
        },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [
          [0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }],
          [1, { fieldId: 1, type: FieldType.ARRAY_PTR, elementType: "number" }],
        ],
        branes: [
          { state: "IDLE", params: [[0, [1, 2, 3]], [1, [1, 5]]], superposition },
          { state: "IDLE", params: [[0, [1]], [1, [1, 5]]], superposition },
          { state: "IDLE", params: [[0, [1, 2, 3]], [1, [2, 3]]], superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })
  })

  describe("Пограничные случаи", () => {
    test("должен корректно обрабатывать пустой массив", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { isEmpty: true } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [{ state: "IDLE", params: [[0, []]], superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать массив с одним элементом", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { length: 1 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [{ state: "IDLE", params: [[0, [42]]], superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать большой массив", async () => {
      const boundary = new Boundary()

      const superposition = {
        IDLE: { ACTIVE: { 0: { length: 100 } } },
        ACTIVE: null,
      }

      await boundary.write({
        fields: [[0, { fieldId: 0, type: FieldType.ARRAY_PTR, elementType: "number" }]],
        branes: [
          {
            state: "IDLE",
            params: [[0, Array.from({ length: 100 }, (_, i) => i)]],
            superposition,
          },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })
  })
})
