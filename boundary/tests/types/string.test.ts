import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "../fixture"

describe("Boundary — Тип STRING (string)", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture()

  // Тип STRING использует интернирование через StringAtlas.
  // Строки хранятся как [stringId, hash] для быстрого сравнения на GPU.

  describe("Оператор EQ (равно)", () => {
    test("должен перейти при значении равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { name: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { name: "hero" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "monster" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "hero" == "hero"
      expect(result.states![1]).toBe("IDLE") // "monster" != "hero"
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен перейти при значении не равном указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { neq: "enemy" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { name: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { name: "enemy" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" == "enemy"
      expect(result.states![1]).toBe("ACTIVE") // "ally" != "enemy"
    })
  })

  describe("Оператор IN (входит в список)", () => {
    test("должен перейти если значение входит в список", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { role: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { role: "warrior" }, superposition },
          { id: "q2", state: "IDLE", brane: { role: "mage" }, superposition },
          { id: "q3", state: "IDLE", brane: { role: "healer" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "warrior" in [...]
      expect(result.states![1]).toBe("ACTIVE") // "mage" in [...]
      expect(result.states![2]).toBe("IDLE") // "healer" not in [...]
    })
  })

  describe("Оператор NOT_IN (не входит в список)", () => {
    test("должен перейти если значение не входит в список", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { role: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { role: "enemy" }, superposition },
          { id: "q2", state: "IDLE", brane: { role: "boss" }, superposition },
          { id: "q3", state: "IDLE", brane: { role: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" in [enemy, boss]
      expect(result.states![1]).toBe("IDLE") // "boss" in [enemy, boss]
      expect(result.states![2]).toBe("ACTIVE") // "ally" not in [enemy, boss]
    })
  })

  describe("Пустые строки", () => {
    test("должен корректно обрабатывать пустую строку", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { name: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { name: "" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "hero" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "" == ""
      expect(result.states![1]).toBe("IDLE") // "hero" != ""
    })
  })

  describe("Специальные символы", () => {
    test("должен корректно обрабатывать строки со специальными символами", async () => {
      const superposition = {
        IDLE: { ACTIVE: { code: { eq: "test-123_@#" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { code: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { code: "test-123_@#" }, superposition },
          { id: "q2", state: "IDLE", brane: { code: "test-123" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Регистрозависимость", () => {
    test("должен учитывать регистр при сравнении", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "Hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        branes: { name: "string" },
        fields: [
          { id: "q1", state: "IDLE", brane: { name: "Hero" }, superposition },
          { id: "q2", state: "IDLE", brane: { name: "hero" }, superposition },
          { id: "q3", state: "IDLE", brane: { name: "HERO" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "Hero" == "Hero"
      expect(result.states![1]).toBe("IDLE") // "hero" != "Hero"
      expect(result.states![2]).toBe("IDLE") // "HERO" != "Hero"
    })
  })
})
