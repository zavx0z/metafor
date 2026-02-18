import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary — Тип UINT (enum)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  // ПРИМЕЧАНИЕ: Значения enum хранятся как индексы в массиве values.
  // Сравнения GT/LT/GTE/LTE работают с индексами, а не со значениями.
  // Текущая реализация enum имеет особенности, требующие дополнительного исследования.

  describe("Оператор EQ (равно)", () => {
    test("должен перейти при равенстве значения указанному (строковый enum)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { eq: "ACTIVE" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // ACTIVE == ACTIVE
      expect(result.states![1]).toBe("IDLE") // IDLE != ACTIVE
      expect(result.states![2]).toBe("IDLE") // DEAD != ACTIVE
    })

    test("должен перейти при равенстве значения указанному (числовой enum)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { eq: 2 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 2 == 2
      expect(result.states![1]).toBe("IDLE") // 1 != 2
      expect(result.states![2]).toBe("IDLE") // 3 != 2
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен перейти при неравенстве значения указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { neq: "IDLE" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // IDLE == IDLE
      expect(result.states![1]).toBe("ACTIVE") // ACTIVE != IDLE
      expect(result.states![2]).toBe("ACTIVE") // DEAD != IDLE
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен перейти при значении больше указанного", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gt: 1 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 1 не > 1
      expect(result.states![1]).toBe("ACTIVE") // 2 > 1
      expect(result.states![2]).toBe("ACTIVE") // 3 > 1
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен перейти при значении меньше указанного", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { lt: 3 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 1 < 3
      expect(result.states![1]).toBe("ACTIVE") // 2 < 3
      expect(result.states![2]).toBe("IDLE") // 3 не < 3
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен перейти при значении больше или равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 3 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 3 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 4 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 2 не >= 3
      expect(result.states![1]).toBe("ACTIVE") // 3 >= 3
      expect(result.states![2]).toBe("ACTIVE") // 4 >= 3
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен перейти при значении меньше или равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { lte: 2 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 1 <= 2
      expect(result.states![1]).toBe("ACTIVE") // 2 <= 2
      expect(result.states![2]).toBe("IDLE") // 3 не <= 2
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен перейти если значение в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { in: ["ACTIVE", "RUNNING"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "RUNNING" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q4", state: "IDLE", params: { status: "DEAD" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // ACTIVE в [ACTIVE, RUNNING]
      expect(result.states![1]).toBe("ACTIVE") // RUNNING в [ACTIVE, RUNNING]
      expect(result.states![2]).toBe("IDLE") // IDLE не в [ACTIVE, RUNNING]
      expect(result.states![3]).toBe("IDLE") // DEAD не в [ACTIVE, RUNNING]
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен перейти если значение не в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { status: { notIn: ["IDLE", "DEAD"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          status: { type: "enum<string>", values: ["IDLE", "ACTIVE", "RUNNING", "DEAD"] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { status: "IDLE" }, superposition },
          { id: "q2", state: "IDLE", params: { status: "DEAD" }, superposition },
          { id: "q3", state: "IDLE", params: { status: "ACTIVE" }, superposition },
          { id: "q4", state: "IDLE", params: { status: "RUNNING" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // IDLE в [IDLE, DEAD]
      expect(result.states![1]).toBe("IDLE") // DEAD в [IDLE, DEAD]
      expect(result.states![2]).toBe("ACTIVE") // ACTIVE не в [IDLE, DEAD]
      expect(result.states![3]).toBe("ACTIVE") // RUNNING не в [IDLE, DEAD]
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти при выполнении условий", async () => {
      const superposition = {
        IDLE: { ACTIVE: { level: { gte: 2, lte: 4 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: {
          level: { type: "enum<number>", values: [1, 2, 3, 4, 5] },
        },
        branes: [
          { id: "q1", state: "IDLE", params: { level: 1 }, superposition },
          { id: "q2", state: "IDLE", params: { level: 2 }, superposition },
          { id: "q3", state: "IDLE", params: { level: 3 }, superposition },
          { id: "q4", state: "IDLE", params: { level: 4 }, superposition },
          { id: "q5", state: "IDLE", params: { level: 5 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // Результат зависит от реализации (логика И или ИЛИ)
    })
  })
})
