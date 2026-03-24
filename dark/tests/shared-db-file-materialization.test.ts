import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Wimp } from "@dark/strong"
import { openSharedDbMaterializationWriter, openSharedDbSqliteBackend } from "@shared/db"
import { HubFixture } from "fixture"
import { matter } from "../dark.ts"
import { dark$ } from "../store.ts"

const hub = new HubFixture("./github/")
const sqliteFilename = join(dirname(fileURLToPath(import.meta.url)), "tmp", "metafor-issue-52-materialized.sqlite")

describe("dark -> shared/db file materialization", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterAll(async () => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    await hub.teardown()
  })

  test("полный dark-проход пишет существующую shared/db schema по мере завершения каждого Wimp и оставляет файловую SQLite-базу для прямого просмотра", async () => {
    mkdirSync(dirname(sqliteFilename), { recursive: true })
    rmSync(sqliteFilename, { force: true })

    const backend = openSharedDbSqliteBackend({ filename: sqliteFilename })
    const writer = openSharedDbMaterializationWriter(backend)
    const root = new Wimp({ src: "zavx0z/git", parent: null })

    await matter(root, undefined, { sharedDbWriter: writer })
    backend.close()

    expect(existsSync(sqliteFilename)).toBe(true)

    const database = new Database(sqliteFilename, { readonly: true })
    try {
      const braneRows = database.query(`SELECT "index", src FROM branes ORDER BY "index"`).all() as Array<{
        index: number
        src: string
      }>
      const braneColumns = database.query(`PRAGMA table_info(branes)`).all() as Array<{ name: string }>
      const fieldCountRow = database.query(`SELECT COUNT(*) AS count FROM fields`).get() as { count: number }
      const fieldValueCountRow = database.query(`SELECT COUNT(*) AS count FROM field_values`).get() as { count: number }
      const fieldSourceCountRow = database.query(`SELECT COUNT(*) AS count FROM field_sources`).get() as { count: number }
      const entanglementFieldCountRow = database
        .query(`SELECT COUNT(*) AS count FROM entanglement_seed_fields`)
        .get() as { count: number }
      const stateSeedStateCountRow = database.query(`SELECT COUNT(*) AS count FROM state_seed_states`).get() as {
        count: number
      }
      const startArgsSourceRow = database
        .query(
          `SELECT field_sources.parentFieldIndex AS parentFieldIndex
           FROM field_sources
           INNER JOIN fields AS child_field ON child_field."index" = field_sources.childFieldIndex
           INNER JOIN branes AS child_brane ON child_brane."index" = child_field.ownerBraneIndex
           WHERE child_brane.src = 'zavx0z/git-start'
             AND child_field."key" = 'args'`,
        )
        .get() as { parentFieldIndex: number } | null

      expect(braneRows[0]?.index).toBe(0)
      expect(braneRows[0]?.src).toBe("zavx0z/git")
      expect(braneColumns.map((column) => column.name)).toEqual(["index", "darkWimpId", "src", "name"])
      expect(braneRows.some((row) => row.src === "zavx0z/git-start")).toBe(true)
      expect(fieldCountRow.count).toBeGreaterThan(0)
      expect(fieldValueCountRow.count).toBe(fieldCountRow.count)
      expect(fieldSourceCountRow.count).toBeGreaterThan(0)
      expect(entanglementFieldCountRow.count).toBeGreaterThan(0)
      expect(stateSeedStateCountRow.count).toBeGreaterThan(0)
      expect(startArgsSourceRow?.parentFieldIndex).toBeGreaterThanOrEqual(0)
    } finally {
      database.close()
    }
  })
})
