import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { BoundaryTestFixture } from "../fixture"

describe("Boundary — Отладка IN для строк", () => {
  beforeAll(async () => await BoundaryTestFixture.setup())
  afterAll(async () => await BoundaryTestFixture.teardown(), 20000)
  const fixture = new BoundaryTestFixture({ debug: true })

  test("простой IN для строк", async () => {
    const superposition = {
      IDLE: { ACTIVE: { role: { in: ["warrior", "mage"] } } },
      ACTIVE: null,
    }
    const result = await fixture.runSimulation({
      branes: { role: "string" },
      fields: [
        { id: "q1", state: "IDLE", brane: { role: "warrior" }, superposition },
      ],
    })

    console.log("Result:", result)
    expect(result.success).toBe(true)
    expect(result.states).toBeDefined()
    expect(result.states![0]).toBe("ACTIVE") // "warrior" in ["warrior", "mage"]
  })
  
  test("EQ для строк", async () => {
    const superposition = {
      IDLE: { ACTIVE: { role: { eq: "warrior" } } },
      ACTIVE: null,
    }
    const result = await fixture.runSimulation({
      branes: { role: "string" },
      fields: [
        { id: "q1", state: "IDLE", brane: { role: "warrior" }, superposition },
      ],
    })

    console.log("EQ Result:", result)
    expect(result.success).toBe(true)
    expect(result.states).toBeDefined()
    expect(result.states![0]).toBe("ACTIVE") // "warrior" == "warrior"
  })
})
