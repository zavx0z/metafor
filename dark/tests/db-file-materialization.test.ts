import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Wimp } from "@dark/strong"
import { openDbMaterializationWriter, openDbSqliteBackend } from "store/db"
import { HubFixture } from "fixture"
import { matter } from "../index.ts"
import { dark$ } from "../store.ts"

const hub = new HubFixture()
const sqliteFilename = join(dirname(fileURLToPath(import.meta.url)), "tmp", "metafor-issue-52-materialized.sqlite")

describe("dark -> db file materialization", () => {
  beforeAll(async () => {
    await hub.setup()
  })

  afterAll(async () => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    await hub.teardown()
  })

  test("полный dark-проход пишет существующую db schema по мере завершения каждого Wimp и оставляет файловую SQLite-базу для прямого просмотра", async () => {
    mkdirSync(dirname(sqliteFilename), { recursive: true })
    rmSync(sqliteFilename, { force: true })

    const backend = openDbSqliteBackend({ filename: sqliteFilename })
    const writer = openDbMaterializationWriter(backend)
    const root = new Wimp({ src: "zavx0z/git", parent: null })

    await matter(root, undefined, { dbWriter: writer })
    backend.close()

    expect(existsSync(sqliteFilename)).toBe(true)

    const database = new Database(sqliteFilename, { readonly: true })
    try {
      const wimpRows = database.query(`SELECT id, metaId, wimpOrder FROM view_wimps ORDER BY wimpOrder`).all() as Array<{
        id: string
        metaId: string
        wimpOrder: number
      }>
      const metaRows = database.query(`SELECT id, src FROM metas ORDER BY src`).all() as Array<{
        id: string
        src: string
      }>
      const wimpColumns = database.query(`PRAGMA table_info(view_wimps)`).all() as Array<{ name: string }>
      const metaFieldCountRow = database.query(`SELECT COUNT(*) AS count FROM meta_fields`).get() as { count: number }
      const wimpFieldCountRow = database.query(`SELECT COUNT(*) AS count FROM view_wimp_fields`).get() as { count: number }
      const fieldValueCountRow = database.query(`SELECT COUNT(*) AS count FROM view_field_values`).get() as { count: number }
      const fieldSourceCountRow = database.query(`SELECT COUNT(*) AS count FROM view_field_sources`).get() as { count: number }
      const entanglementFieldCountRow = database
        .query(`SELECT COUNT(*) AS count FROM view_entanglement_fields`)
        .get() as { count: number }
      const metaStateCountRow = database.query(`SELECT COUNT(*) AS count FROM meta_states`).get() as {
        count: number
      }
      const startArgsSourceRow = database
        .query(
          `SELECT view_field_sources.parentWimpFieldId AS parentWimpFieldId
           FROM view_field_sources
           INNER JOIN view_wimp_fields AS child_field ON child_field.id = view_field_sources.childWimpFieldId
           INNER JOIN view_wimps AS child_wimp ON child_wimp.id = child_field.ownerWimpId
           INNER JOIN metas AS child_meta ON child_meta.id = child_wimp.metaId
           INNER JOIN meta_fields AS child_meta_field ON child_meta_field.id = child_field.metaFieldId
           WHERE child_meta.src = 'zavx0z/git-start'
             AND child_meta_field.fieldKey = 'args'`,
        )
        .get() as { parentWimpFieldId: string } | null

      expect(wimpRows[0]?.wimpOrder).toBe(0)
      expect(metaRows.some((row) => row.src === "zavx0z/git")).toBe(true)
      expect(metaRows.some((row) => row.src === "zavx0z/git-start")).toBe(true)
      expect(wimpColumns.map((column) => column.name)).toEqual(["id", "metaId", "wimpOrder", "massOverrideJson"])
      expect(metaFieldCountRow.count).toBeGreaterThan(0)
      expect(wimpFieldCountRow.count).toBeGreaterThan(0)
      expect(fieldValueCountRow.count).toBe(wimpFieldCountRow.count)
      expect(fieldSourceCountRow.count).toBeGreaterThan(0)
      expect(entanglementFieldCountRow.count).toBeGreaterThan(0)
      expect(metaStateCountRow.count).toBeGreaterThan(0)
      expect(typeof startArgsSourceRow?.parentWimpFieldId).toBe("string")
    } finally {
      database.close()
    }
  })
})
