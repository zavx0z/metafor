import {SQL} from "bun"
import {describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {open} from "./sqlite.ts"

describe("Boundary SQLite domain", () => {
  test("opens one normalized relational world without declaration JSON mirrors", async () => {
    const boundary = await open(":memory:")
    const tables = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
    `).map((row) => row.name)

    expect(tables).toContain("wimp")
    expect(tables).toContain("atom")
    expect(tables).toContain("topology")
    expect(tables).toContain("boundary_runtime_origin")
    expect(tables).toContain("atom_value")
    expect(tables).not.toContain("boundary_declaration_entity")
    expect(tables).not.toContain("boundary_atom_field")

    await boundary.close()
    await boundary.close()
  })

  test("removes the legacy JSON projection and recreates only relational runtime origin", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-boundary-migration-"))
    const filename = join(directory, "legacy.sqlite")
    try {
      const legacy = new SQL(`sqlite://${filename}`)
      await legacy.unsafe(`
        CREATE TABLE wimp (src TEXT PRIMARY KEY, name TEXT, desc TEXT, view_css TEXT);
        INSERT INTO wimp (src, name) VALUES ('legacy/meta', 'Legacy');
        CREATE TABLE boundary_declaration_entity (path TEXT PRIMARY KEY, value_json TEXT);
        CREATE TABLE boundary_atom_field (atom INTEGER, field INTEGER, value_json TEXT);
        CREATE TABLE boundary_root (src TEXT PRIMARY KEY);
        CREATE TABLE boundary_runtime_origin (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL,
          runtime_id INTEGER NOT NULL,
          declaration_path TEXT NOT NULL,
          parent_key TEXT NOT NULL,
          owner_atom INTEGER NOT NULL,
          ordinal INTEGER NOT NULL DEFAULT 0
        );
      `)
      await legacy.close()

      const boundary = await open(filename)
      const tables = (await boundary.projection.sql<Array<{name: string}>>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `).map((row) => row.name)
      const columns = (await boundary.projection.sql<Array<{name: string}>>`
        PRAGMA table_info(boundary_runtime_origin)
      `).map((row) => row.name)
      expect(tables).not.toContain("boundary_declaration_entity")
      expect(tables).not.toContain("boundary_atom_field")
      expect(tables).not.toContain("boundary_root")
      expect(columns).toContain("declaration_wimp")
      expect(columns).toContain("declaration_local_id")
      expect(columns).not.toContain("declaration_path")
      expect(await boundary.projection.sql<unknown[]>`SELECT src FROM wimp`).toEqual([])
      await boundary.close()
    } finally {
      await rm(directory, {recursive: true, force: true})
    }
  })
})
