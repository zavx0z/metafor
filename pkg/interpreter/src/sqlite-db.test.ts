import {afterEach, describe, expect, test} from "bun:test"
import {Database} from "bun:sqlite"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {sqliteDatabasePayload} from "./sqlite-db.ts"

const tmpRoots: string[] = []

afterEach(() => {
  for (const root of tmpRoots.splice(0)) rmSync(root, {recursive: true, force: true})
})

function createSqliteFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "metafor-sqlite-"))
  tmpRoots.push(root)
  const path = join(root, "test.sqlite")
  const db = new Database(path)
  try {
    db.exec("CREATE TABLE item (name TEXT NOT NULL)")
    db.run("INSERT INTO item (name) VALUES (?)", ["alpha"])
  } finally {
    db.close()
  }
  return path
}

describe("sqliteDatabasePayload", () => {
  test("reads an existing sqlite database", () => {
    const path = createSqliteFixture()
    const payload = sqliteDatabasePayload(new URL(`http://127.0.0.1/sqlite?path=${encodeURIComponent(path)}`))

    expect(payload.selectedTable).toBe("item")
    expect(payload.rows).toEqual([{__rowid: 1, name: "alpha"}])
  })

  test("rejects stale sqlite databases older than notBefore", () => {
    const path = createSqliteFixture()
    const notBefore = encodeURIComponent(new Date(Date.now() + 60_000).toISOString())

    expect(() => sqliteDatabasePayload(new URL(`http://127.0.0.1/sqlite?path=${encodeURIComponent(path)}&notBefore=${notBefore}`)))
      .toThrow("sqlite database not ready")
  })
})
