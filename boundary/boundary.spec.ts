import {describe, expect, test} from "bun:test"
import {open} from "./sqlite.ts"

describe("Boundary SQLite domain", () => {
  test("opens canonical and incremental projection tables on one database", async () => {
    const boundary = await open(":memory:")
    const tables = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
    `).map((row) => row.name)

    expect(tables).toContain("wimp")
    expect(tables).toContain("actor")
    expect(tables).toContain("topology")
    expect(tables).toContain("boundary_declaration_entity")
    expect(tables).toContain("boundary_runtime_origin")
    expect(tables).toContain("boundary_actor_field")

    await boundary.close()
    await boundary.close()
  })
})
