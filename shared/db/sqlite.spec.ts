import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { normalizeSharedDbData, readSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import { openSharedDbMemoryBackend } from "./memory.ts"
import { openSharedDbMaterializationWriter } from "./materialize.ts"
import { openSharedDbSqliteBackend } from "./sqlite.ts"

const createTempSqliteTarget = (): { dir: string; filename: string } => {
  const dir = mkdtempSync(join(tmpdir(), "metafor-shared-db-"))
  return {
    dir,
    filename: join(dir, "shared-db.sqlite"),
  }
}

const materializeFixture = (fixture = createSharedDbFixture(), backend = openSharedDbMemoryBackend()) => {
  const writer = openSharedDbMaterializationWriter(backend)

  fixture.root.save(writer)
  fixture.child.save(writer)

  return { fixture, backend }
}

describe("shared db sqlite backend", () => {
  test("создаёт canonical relational schema и SQL indexes", () => {
    const temp = createTempSqliteTarget()

    try {
      const backend = openSharedDbSqliteBackend({ filename: temp.filename })
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
        expect(indexes).toEqual(sharedDbRequiredBackendIndexes.map((index) => index.name).sort())

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

  test("сохраняет canonical relational rows через row-group writes и перечитывает их после повторного открытия", () => {
    const temp = createTempSqliteTarget()
    const fixture = createSharedDbFixture()
    const { backend: expectedBackend } = materializeFixture(fixture)

    try {
      const writer = openSharedDbSqliteBackend({ filename: temp.filename })
      materializeFixture(fixture, writer)
      writer.close()

      const reader = openSharedDbSqliteBackend({ filename: temp.filename })
      try {
        const restored = readSharedDbData(reader)
        expect(normalizeSharedDbData(restored)).toEqual(normalizeSharedDbData(expectedBackend.readData()))

        reader.setFieldValue(fixture.fields.childAlias.id, "Alias via sqlite")
      } finally {
        reader.close()
      }

      const reopened = openSharedDbSqliteBackend({ filename: temp.filename })
      try {
        expect(
          readSharedDbData(reopened).fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias.id)?.value,
        ).toBe("Alias via sqlite")
      } finally {
        reopened.close()
      }
    } finally {
      expectedBackend.close()
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })
})
