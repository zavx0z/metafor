import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "../fixture"

describe("Boundary — Тип BOOL (boolean)", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture()

  describe("Прямое значение true", () => {
    test("должен перейти при значении true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true == true
      expect(result.states![1]).toBe("IDLE") // false != true
    })
  })

  describe("Прямое значение false", () => {
    test("должен перейти при значении false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // false == false
      expect(result.states![1]).toBe("IDLE") // true != false
    })
  })

  describe("Оператор EQ (равно)", () => {
    test("должен перейти при значении равном true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: { eq: true } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true == true
      expect(result.states![1]).toBe("IDLE") // false != true
    })

    test("должен перейти при значении равном false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: { eq: false } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // false == false
      expect(result.states![1]).toBe("IDLE") // true != false
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен перейти при значении не равном true", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: { neq: true } } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // true == true
      expect(result.states![1]).toBe("DEAD") // false != true
    })

    test("должен перейти при значении не равном false", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: { neq: false } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // false == false
      expect(result.states![1]).toBe("ACTIVE") // true != false
    })
  })

  describe("Множественные булевы условия", () => {
    test("должен перейти при выполнении всех условий (AND)", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, hasMana: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean", hasMana: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, hasMana: true }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, hasMana: false }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, hasMana: true }, superposition },
          { id: "q4", state: "IDLE", brane: { isAlive: false, hasMana: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true && true
      expect(result.states![1]).toBe("IDLE") // true && false
      expect(result.states![2]).toBe("IDLE") // false && true
      expect(result.states![3]).toBe("IDLE") // false && false
    })

    test("должен перейти при разных комбинациях булевых значений", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isAlive: true, isStunned: false } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean", isStunned: "boolean" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, isStunned: false }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, isStunned: true }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, isStunned: false }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // true && !false
      expect(result.states![1]).toBe("IDLE") // true && !true
      expect(result.states![2]).toBe("IDLE") // false && !false
    })
  })

  describe("Обновление булевых значений", () => {
    test("должен перейти после обновления значения на true", async () => {
      const superposition = {
        IDLE: { ACTIVE: { isReady: true } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { isReady: "boolean" },
        fields: [{ id: "q1", state: "IDLE", brane: { isReady: false }, superposition }],
        updates: [{ fieldIndex: 0, componentName: "isReady", value: true }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // После обновления isReady = true
    })

    test("должен перейти после обновления значения на false", async () => {
      const superposition = {
        IDLE: { DEAD: { isAlive: false } },
        DEAD: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean" },
        fields: [{ id: "q1", state: "IDLE", brane: { isAlive: true }, superposition }],
        updates: [{ fieldIndex: 0, componentName: "isAlive", value: false }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("DEAD") // После обновления isAlive = false
    })
  })

  describe("Смешанные условия (boolean + number)", () => {
    test("должен перейти при выполнении обоих условий разных типов", async () => {
      const superposition = {
        IDLE: { COMBAT: { isAlive: true, hp: { gt: 50 } } },
        COMBAT: null,
      }
      const result = await fixture.runSimulation({
        branes: { isAlive: "boolean", hp: "number" },
        fields: [
          { id: "q1", state: "IDLE", brane: { isAlive: true, hp: 100 }, superposition },
          { id: "q2", state: "IDLE", brane: { isAlive: true, hp: 30 }, superposition },
          { id: "q3", state: "IDLE", brane: { isAlive: false, hp: 100 }, superposition },
          { id: "q4", state: "IDLE", brane: { isAlive: false, hp: 30 }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("COMBAT") // true && 100 > 50
      expect(result.states![1]).toBe("IDLE") // true && 30 не > 50
      expect(result.states![2]).toBe("IDLE") // false && 100 > 50
      expect(result.states![3]).toBe("IDLE") // false && 30 не > 50
    })
  })
})
