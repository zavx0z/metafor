import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary — Тип ARRAY (array)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  // ПРИМЕЧАНИЕ: Тип ARRAY хранится как длина + указатели на элементы.
  // Поддерживаемые типы элементов: array<string>, array<number>

  describe("Оператор INCLUDE (содержит элемент)", () => {
    test("должен перейти если массив содержит указанный элемент (number)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { tags: { include: 5 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { tags: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: [1, 5, 10] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: [1, 2, 3] }, superposition },
          { id: "q3", state: "IDLE", params: { tags: [] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 5 in [1, 5, 10]
      expect(result.states![1]).toBe("IDLE") // 5 not in [1, 2, 3]
      expect(result.states![2]).toBe("IDLE") // 5 not in []
    })

    test("должен перейти если массив содержит указанный элемент (string)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { tags: { include: "fire" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { tags: "array<string>" },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: ["fire", "ice", "lightning"] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: ["ice", "lightning"] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "fire" in [...]
      expect(result.states![1]).toBe("IDLE") // "fire" not in [...]
    })
  })

  describe("Оператор NOT_INCLUDE (не содержит элемент)", () => {
    test("должен перейти если массив не содержит указанный элемент", async () => {
      const superposition = {
        IDLE: { ACTIVE: { tags: { notInclude: 99 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { tags: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { tags: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", params: { tags: [99, 100] }, superposition },
          { id: "q3", state: "IDLE", params: { tags: [] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 99 not in [1, 2, 3]
      expect(result.states![1]).toBe("IDLE") // 99 in [99, 100]
      expect(result.states![2]).toBe("ACTIVE") // 99 not in []
    })
  })

  describe("Оператор LENGTH (длина массива)", () => {
    test("должен перейти при равенстве длины указанному значению", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { length: 3 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3, 4] }, superposition },
          { id: "q4", state: "IDLE", params: { items: [] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // length == 3
      expect(result.states![1]).toBe("IDLE") // length == 2
      expect(result.states![2]).toBe("IDLE") // length == 4
      expect(result.states![3]).toBe("IDLE") // length == 0
    })

    test("должен поддерживать сравнение длины с операторами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { length: { gte: 2 } } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1, 2] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // length 1 < 2
      expect(result.states![1]).toBe("ACTIVE") // length 2 >= 2
      expect(result.states![2]).toBe("ACTIVE") // length 3 >= 2
    })
  })

  describe("Оператор IS_EMPTY (пустой массив)", () => {
    test("должен перейти если массив пуст", async () => {
      const superposition = {
        IDLE: { EMPTY: { items: { isEmpty: true } } },
        EMPTY: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("EMPTY") // [] is empty
      expect(result.states![1]).toBe("IDLE") // [1] is not empty
      expect(result.states![2]).toBe("IDLE") // [1, 2, 3] is not empty
    })

    test("должен перейти если массив не пуст (isEmpty: false)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: false } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [
          { id: "q1", state: "IDLE", params: { items: [] }, superposition },
          { id: "q2", state: "IDLE", params: { items: [1] }, superposition },
          { id: "q3", state: "IDLE", params: { items: [1, 2, 3] }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // [] is empty
      expect(result.states![1]).toBe("ACTIVE") // [1] is not empty
      expect(result.states![2]).toBe("ACTIVE") // [1, 2, 3] is not empty
    })
  })

  describe("Комбинированные условия с массивами", () => {
    test("должен перейти при выполнении нескольких условий", async () => {
      const superposition = {
        IDLE: {
          ACTIVE: {
            items: { length: { gte: 2, lte: 5 } },
            tags: { include: 1 },
          },
        },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>", tags: "array<number>" },
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

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // length 3 in [2..5] && 1 in tags
      expect(result.states![1]).toBe("IDLE") // length 1 < 2
      expect(result.states![2]).toBe("IDLE") // 1 not in tags
    })
  })

  describe("Граничные случаи", () => {
    test("должен корректно обрабатывать пустой массив", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { isEmpty: true } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [{ id: "q1", state: "IDLE", params: { items: [] }, superposition }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать массив с одним элементом", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { length: 1 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [{ id: "q1", state: "IDLE", params: { items: [42] }, superposition }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
    })

    test("должен корректно обрабатывать большой массив", async () => {
      const superposition = {
        IDLE: { ACTIVE: { items: { length: 100 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { items: "array<number>" },
        branes: [
          {
            id: "q1",
            state: "IDLE",
            params: { items: Array.from({ length: 100 }, (_, i) => i) },
            superposition,
          },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
    })
  })
})
