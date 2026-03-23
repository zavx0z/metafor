import { Database } from "bun:sqlite"
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assembleSharedDbProjection } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { describeSharedDbBackendContract } from "./backend.contract.ts"
import { prepareSharedDbTabularData, readSharedDbProjection, sharedDbRequiredBackendIndexes } from "./backend.ts"
import { openSharedDbSqliteBackend } from "./sqlite.ts"

const createTempSqliteTarget = (): { dir: string; filename: string } => {
  const dir = mkdtempSync(join(tmpdir(), "metafor-shared-db-"))
  return {
    dir,
    filename: join(dir, "shared-db.sqlite"),
  }
}

describeSharedDbBackendContract("shared db sqlite backend", () => openSharedDbSqliteBackend())

describe("shared db sqlite backend", () => {
  test("создаёт обязательную схему и SQL indexes", () => {
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

        expect(tables).toEqual(["branes", "field_sources", "field_values", "fields", "shared_db_meta"])
        expect(indexes).toEqual(sharedDbRequiredBackendIndexes.map((index) => index.name).sort())
      } finally {
        database.close()
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })

  test("сохраняет projection в file-backed SQLite и читает её после повторного открытия", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const temp = createTempSqliteTarget()

    try {
      const writer = openSharedDbSqliteBackend({ filename: temp.filename })
      writer.writeProjection(projection)
      writer.close()

      const reader = openSharedDbSqliteBackend({ filename: temp.filename })
      try {
        expect(prepareSharedDbTabularData(readSharedDbProjection(reader))).toEqual(
          prepareSharedDbTabularData(projection),
        )

        reader.setFieldValue(3, "Alias via sqlite")
      } finally {
        reader.close()
      }

      const reopened = openSharedDbSqliteBackend({ filename: temp.filename })
      try {
        expect(reopened.getFieldValue(3)?.value).toBe("Alias via sqlite")
      } finally {
        reopened.close()
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })
})
