import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary — Тип FLOAT (число)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  describe("Оператор EQ (равно)", () => {
    test("должен перейти при равенстве значения указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 42 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 43 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 42 == 42
      expect(result.states![1]).toBe("IDLE") // 41 != 42
      expect(result.states![2]).toBe("IDLE") // 43 != 42
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: -10 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 10 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен работать с дробными числами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 3.14 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 3.14 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 3.15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })

    test("должен работать с нулём", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { eq: 0 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 0.001 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен перейти при неравенстве значения указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { neq: 42 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 42 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 41 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 43 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 42 == 42
      expect(result.states![1]).toBe("ACTIVE") // 41 != 42
      expect(result.states![2]).toBe("ACTIVE") // 43 != 42
    })

    test("должен работать с алиасом 'ne'", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { ne: 0 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 0 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 1 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("ACTIVE")
    })

    test("должен работать с алиасом 'notEq'", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notEq: 100 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 99 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE")
      expect(result.states![1]).toBe("ACTIVE")
    })
  })

  describe("Оператор GT (больше)", () => {
    test("должен перейти при значении больше указанного", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 49 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 100 > 50
      expect(result.states![1]).toBe("IDLE") // 50 not > 50
      expect(result.states![2]).toBe("IDLE") // 49 not > 50
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gt: -10 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -5 }, superposition },
          { id: "q2", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q3", state: "IDLE", params: { value: -15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // -5 > -10
      expect(result.states![1]).toBe("IDLE") // -10 not > -10
      expect(result.states![2]).toBe("IDLE") // -15 not > -10
    })
  })

  describe("Оператор LT (меньше)", () => {
    test("должен перейти при значении меньше указанного", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 49 < 50
      expect(result.states![1]).toBe("IDLE") // 50 not < 50
      expect(result.states![2]).toBe("IDLE") // 51 not < 50
    })

    test("должен работать с отрицательными числами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lt: -5 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: -10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: -5 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 0 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // -10 < -5
      expect(result.states![1]).toBe("IDLE") // -5 not < -5
      expect(result.states![2]).toBe("IDLE") // 0 not < -5
    })
  })

  describe("Оператор GTE (больше или равно)", () => {
    test("должен перейти при значении больше или равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 100 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 49 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 100 >= 50
      expect(result.states![1]).toBe("ACTIVE") // 50 >= 50
      expect(result.states![2]).toBe("IDLE") // 49 not >= 50
    })
  })

  describe("Оператор LTE (меньше или равно)", () => {
    test("должен перейти при значении меньше или равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { lte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 49 <= 50
      expect(result.states![1]).toBe("ACTIVE") // 50 <= 50
      expect(result.states![2]).toBe("IDLE") // 51 not <= 50
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен перейти, если значение в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { in: [10, 20, 30] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 20 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 30 }, superposition },
          { id: "q4", state: "IDLE", params: { value: 15 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // 10 in [10, 20, 30]
      expect(result.states![1]).toBe("ACTIVE") // 20 in [10, 20, 30]
      expect(result.states![2]).toBe("ACTIVE") // 30 in [10, 20, 30]
      expect(result.states![3]).toBe("IDLE") // 15 not in [10, 20, 30]
    })

    test("должен работать с пустым списком", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { in: [] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [{ id: "q1", state: "IDLE", params: { value: 10 }, superposition }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // Nothing is in empty list
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен перейти, если значения нет в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notIn: [10, 20, 30] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 25 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // 10 in [10, 20, 30]
      expect(result.states![1]).toBe("ACTIVE") // 15 not in [10, 20, 30]
      expect(result.states![2]).toBe("ACTIVE") // 25 not in [10, 20, 30]
    })
  })

  describe("Составные условия (between)", () => {
    test("должен перейти, если значение в диапазоне", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { between: [10, 20] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 10 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q4", state: "IDLE", params: { value: 20 }, superposition },
          { id: "q5", state: "IDLE", params: { value: 21 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // between compiles to gte(10) AND lte(20)
      expect(result.states![0]).toBe("IDLE") // 9 < 10
      expect(result.states![1]).toBe("ACTIVE") // 10 >= 10 && 10 <= 20
      expect(result.states![2]).toBe("ACTIVE") // 15 >= 10 && 15 <= 20
      expect(result.states![3]).toBe("ACTIVE") // 20 >= 10 && 20 <= 20
      expect(result.states![4]).toBe("IDLE") // 21 > 20
    })
  })

  describe("Отрицательные условия (notGt, notGte, notLt, notLte)", () => {
    test("notGt должен быть эквивалентен lte", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notGt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // !(49 > 50) == true
      expect(result.states![1]).toBe("ACTIVE") // !(50 > 50) == true
      expect(result.states![2]).toBe("IDLE") // !(51 > 50) == false
    })

    test("notGte должен быть эквивалентен lt", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notGte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // !(49 >= 50) == true
      expect(result.states![1]).toBe("IDLE") // !(50 >= 50) == false
      expect(result.states![2]).toBe("IDLE") // !(51 >= 50) == false
    })

    test("notLt должен быть эквивалентен gte", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notLt: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // !(49 < 50) == false
      expect(result.states![1]).toBe("ACTIVE") // !(50 < 50) == true
      expect(result.states![2]).toBe("ACTIVE") // !(51 < 50) == true
    })

    test("notLte должен быть эквивалентен gt", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { notLte: 50 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 49 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 50 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 51 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // !(49 <= 50) == false
      expect(result.states![1]).toBe("IDLE") // !(50 <= 50) == false
      expect(result.states![2]).toBe("ACTIVE") // !(51 <= 50) == true
    })
  })

  describe("Множественные условия", () => {
    test("должен перейти при выполнении всех условий для одного поля (логика AND)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { value: { gte: 10, lte: 20 } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { value: { type: "number" } },
        branes: [
          { id: "q1", state: "IDLE", params: { value: 9 }, superposition },
          { id: "q2", state: "IDLE", params: { value: 15 }, superposition },
          { id: "q3", state: "IDLE", params: { value: 21 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      // All conditions for one field are checked with AND logic
      expect(result.states![0]).toBe("IDLE") // 9 < 10 (fails gte)
      expect(result.states![1]).toBe("ACTIVE") // 15 >= 10 && 15 <= 20 (both conditions)
      expect(result.states![2]).toBe("IDLE") // 21 > 20 (fails lte)
    })
  })
})
