import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDbFixture } from "fixture/db.fixture.ts"
import { normalizeDbData, readDbData, dbRequiredBackendIndexes } from "./backend.ts"
import { openDbMaterializationWriter } from "./materialize.ts"
import { openDbSqliteBackend } from "./sqlite.ts"
import { assembleDbData } from "fixture/dark.ts"

const createTempSqliteTarget = (): { dir: string; filename: string } => {
  const dir = mkdtempSync(join(tmpdir(), "metafor-db-"))
  return {
    dir,
    filename: join(dir, "db.sqlite"),
  }
}

const materializeFixture = async (fixture = createDbFixture(), backend = openDbSqliteBackend()) => {
  const writer = openDbMaterializationWriter(backend)

  await fixture.root.save(writer)
  await fixture.child.save(writer)

  return { fixture, backend }
}

describe("db sqlite backend", () => {
  test("создаёт canonical relational schema и SQL indexes", () => {
    const temp = createTempSqliteTarget()

    try {
      const backend = openDbSqliteBackend({ filename: temp.filename })
      backend.close()

      const database = new Database(temp.filename, { readonly: true })
      try {
        const tables = (
          database
            .query(
              `SELECT name
               FROM sqlite_master
               WHERE type = 'table'
               ORDER BY name`,
            )
            .all() as Array<{ name: string }>
        ).map((row) => row.name)

        const indexes = (
          database
            .query(
              `SELECT name
               FROM sqlite_master
               WHERE type = 'index'
                 AND name NOT LIKE 'sqlite_autoindex%'
               ORDER BY name`,
            )
            .all() as Array<{ name: string }>
        ).map((row) => row.name)

        expect(tables).toEqual([
          "entanglement_field_members",
          "entanglement_fields",
          "entanglement_members",
          "entanglements",
          "field_sources",
          "field_values",
          "meta_fields",
          "meta_matter_edges",
          "meta_matter_nodes",
          "meta_process_reads",
          "meta_process_writes",
          "meta_processes",
          "meta_reaction_reads",
          "meta_reaction_states",
          "meta_reaction_writes",
          "meta_reactions",
          "meta_states",
          "meta_transition_conditions",
          "meta_transitions",
          "metas",
          "wimp_edges",
          "wimp_fields",
          "wimp_states",
          "wimps",
        ])
        expect(indexes).toEqual(dbRequiredBackendIndexes.map((index) => index.name).sort())

        const wimpColumns = (
          database.query(`PRAGMA table_info(wimps)`).all() as Array<{ name: string }>
        ).map((row) => row.name)
        expect(wimpColumns).toEqual(["id", "metaId", "wimpOrder", "massOverrideJson"])
      } finally {
        database.close()
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })

  test("сохраняет canonical relational rows через row-group writes и перечитывает их после повторного открытия", async () => {
    const temp = createTempSqliteTarget()
    const fixture = createDbFixture()
    const expected = await assembleDbData(fixture.root)

    try {
      const writer = openDbSqliteBackend({ filename: temp.filename })
      await materializeFixture(fixture, writer)
      writer.close()

      const reader = openDbSqliteBackend({ filename: temp.filename })
      try {
        const restored = readDbData(reader)
        expect(normalizeDbData(restored)).toEqual(normalizeDbData(expected))

        await reader.setFieldValue(fixture.fields.childAlias!.id, "Alias via sqlite")
      } finally {
        reader.close()
      }

      const reopened = openDbSqliteBackend({ filename: temp.filename })
      try {
        expect(
          readDbData(reopened).fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value,
        ).toBe("Alias via sqlite")
      } finally {
        reopened.close()
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })
})
