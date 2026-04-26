import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDbFixture } from "fixture/db.fixture.ts"
import { normalizeDbData, dbRequiredBackendIndexes } from "./backend.ts"
import { readDbSqliteData } from "./fixture.ts"
import { openDbMaterializationWriter } from "../materialize.ts"
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

        // openDbSqliteBackend применяет три набора DDL: canonical meta_* + view_* + DSL-relational (33 таблицы из @store/meta/sqlite).
        // Здесь проверяем только canonical+view часть.
        const canonicalTables = tables.filter(
          (name) =>
            (name.startsWith("meta_") && name !== "meta_mass_value") ||
            name === "metas" ||
            name.startsWith("view_"),
        )
        expect(canonicalTables).toEqual([
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
          "view_entanglement_field_members",
          "view_entanglement_fields",
          "view_entanglement_members",
          "view_entanglements",
          "view_field_sources",
          "view_field_values",
          "view_wimp_edges",
          "view_wimp_fields",
          "view_wimp_states",
          "view_wimps",
        ])
        const canonicalIndexes = indexes.filter((name) =>
          dbRequiredBackendIndexes.some((spec) => spec.name === name),
        )
        expect(canonicalIndexes.sort()).toEqual(dbRequiredBackendIndexes.map((index) => index.name).sort())

        const wimpColumns = (
          database.query(`PRAGMA table_info(view_wimps)`).all() as Array<{ name: string }>
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
        const restored = readDbSqliteData(reader.database)
        expect(normalizeDbData(restored)).toEqual(normalizeDbData(expected))

        await reader.setFieldValue(fixture.fields.childAlias!.id, "Alias via sqlite")
      } finally {
        reader.close()
      }

      const reopened = openDbSqliteBackend({ filename: temp.filename })
      try {
        expect(
          readDbSqliteData(reopened.database).fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value,
        ).toBe("Alias via sqlite")
      } finally {
        reopened.close()
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })
})
