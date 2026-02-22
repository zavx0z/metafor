import { test, expect, describe, beforeAll } from "bun:test"
import { setupDevice, getDevice } from "../../../../fixture/bunWebGPU"
import { Boundary } from "../../../src/index"

describe("Boundary - тип ARRAY с bun-webgpu", () => {
  beforeAll(async () => {
    await setupDevice()
  })

  // ПРИМЕЧАНИЕ: Тип ARRAY хранится как длина + указатели на элементы.
  // Поддерживаемые типы элементов: array<string>, array<number>

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен выполнить переход, если массив содержит указанный элемент (число)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { include: 5 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: [1, 5, 10] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: [1, 2, 3] }, superposition },
          { id: "q3", state: "IDLE", params: { tags: [] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, если массив содержит указанный элемент (строка)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { include: "fire" } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<string>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: ["fire", "ice", "lightning"] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: ["ice", "lightning"] }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { tags: { notInclude: 99 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { tags: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: [99, 100] }, superposition },
          { id: "q3", state: "IDLE", params: { tags: [] }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 3 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3, 4] }, superposition },
          { id: "q4", state: "IDLE", params: { items: [] }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: { gte: 2 } } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { EMPTY: { items: { isEmpty: true } } },
        EMPTY: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
        ],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("EMPTY")
      expect(states[1]).toBe("IDLE")
      expect(states[2]).toBe("IDLE")
    })

    test("должен выполнить переход, если массив не пустой (isEmpty: false)", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: false } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: {
          ACTIVE: {
            items: { length: { gte: 2, lte: 5 } },
            tags: { include: 1 },
          },
        },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" }, tags: { type: "array<number>" } },
        branes: [
          {
            id: "q1",
            state: "IDLE",
            params: { items: [1, 2, 3], tags: [1, 5] },
            superposition,
          },
          {
            id: "q2",
            state: "IDLE",
            params: { items: [1], tags: [1, 5] },
            superposition,
          },
          {
            id: "q3",
            state: "IDLE",
            params: { items: [1, 2, 3], tags: [2, 3] },
            superposition,
          },
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
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: true } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [{ id: "q1", state: "IDLE", params: { items: [] }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать массив с одним элементом", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 1 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [{ id: "q1", state: "IDLE", params: { items: [42] }, superposition }],
      })

      boundary.step()
      const states = await boundary.getStates()

      expect(states[0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать большой массив", async () => {
      const device = getDevice()
      const boundary = new Boundary(device)

      const superposition = {
        IDLE: { ACTIVE: { items: { length: 100 } } },
        ACTIVE: null,
      }

      await boundary.init({
        fields: { items: { type: "array<number>" } },
        branes: [
          {
            id: "q1",
            state: "IDLE",
            params: { items: Array.from({ length: 100 }, (_, i) => i) },
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