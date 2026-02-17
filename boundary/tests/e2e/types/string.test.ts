import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BrowserWebGPU } from "../../fixture/browserWebGPU"

describe("Boundary — Тип STRING (строка)", () => {
  beforeAll(async () => await BrowserWebGPU.setup())
  afterAll(async () => await BrowserWebGPU.teardown(), 20000)
  const fixture = new BrowserWebGPU()

  // Тип STRING использует интернирование через StringAtlas.
  // Строки хранятся как [stringId, hash] для быстрого сравнения на GPU.

  describe("Оператор EQ (равно)", () => {
    test("должен перейти при равенстве значения указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "monster" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "hero" == "hero"
      expect(result.states![1]).toBe("IDLE") // "monster" != "hero"
    })
  })

  describe("Оператор NEQ (не равно)", () => {
    test("должен перейти при неравенстве значения указанному", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { neq: "enemy" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" == "enemy"
      expect(result.states![1]).toBe("ACTIVE") // "ally" != "enemy"
    })
  })

  describe("Оператор IN (в списке)", () => {
    test("должен перейти если значение в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage", "rogue"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "warrior" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "mage" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "healer" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE") // "warrior" в [...]
      expect(result.states![1]).toBe("ACTIVE") // "mage" в [...]
      expect(result.states![2]).toBe("IDLE") // "healer" не в [...]
    })
  })

  describe("Обновление строковых значений", () => {
    test("должен корректно применять обновление строк и обрабатывать IN", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { in: ["warrior", "mage"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [{ id: "q1", state: "IDLE", fields: { role: "healer" }, superposition }],
        updates: [{ braneIndex: 0, componentName: "role", value: "warrior" }],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
    })
  })

  describe("Оператор NOT_IN (не в списке)", () => {
    test("должен перейти если значение не в списке", async () => {
      const superposition = {
        IDLE: { ACTIVE: { role: { notIn: ["enemy", "boss"] } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { role: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { role: "enemy" }, superposition },
          { id: "q2", state: "IDLE", fields: { role: "boss" }, superposition },
          { id: "q3", state: "IDLE", fields: { role: "ally" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("IDLE") // "enemy" в [enemy, boss]
      expect(result.states![1]).toBe("IDLE") // "boss" в [enemy, boss]
      expect(result.states![2]).toBe("ACTIVE") // "ally" не в [enemy, boss]
    })
  })

  describe("Пустые строки", () => {
    test("должен корректно обрабатывать пустую строку", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
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
        fields: { code: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { code: "test-123_@#" }, superposition },
          { id: "q2", state: "IDLE", fields: { code: "test-123" }, superposition },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.states).toBeDefined()
      expect(result.states![0]).toBe("ACTIVE")
      expect(result.states![1]).toBe("IDLE")
    })
  })

  describe("Учёт регистра", () => {
    test("должен учитывать регистр при сравнении", async () => {
      const superposition = {
        IDLE: { ACTIVE: { name: { eq: "Hero" } } },
        ACTIVE: null,
      }
      const result = await fixture.runSimulation({
        fields: { name: { type: "string" } },
        branes: [
          { id: "q1", state: "IDLE", fields: { name: "Hero" }, superposition },
          { id: "q2", state: "IDLE", fields: { name: "hero" }, superposition },
          { id: "q3", state: "IDLE", fields: { name: "HERO" }, superposition },
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
