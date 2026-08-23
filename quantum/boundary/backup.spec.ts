import {afterEach, describe, expect, test} from "bun:test"
import {Database} from "bun:sqlite"
import {existsSync, mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {backupBoundaryDatabase} from "./backup.ts"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, {recursive: true, force: true})
  }
})

const temporaryDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "metafor-boundary-backup-"))
  temporaryDirectories.push(directory)
  return directory
}

describe("Boundary SQLite backup", () => {
  test("includes WAL and replaces the previous backup", () => {
    const directory = temporaryDirectory()
    const source = join(directory, "source.sqlite")
    const target = join(directory, "backup.sqlite")
    const writer = new Database(source, {create: true})
    writer.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA wal_autocheckpoint = 0;
      CREATE TABLE value (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO value (name) VALUES ('first');
      PRAGMA wal_checkpoint(TRUNCATE);
      INSERT INTO value (name) VALUES ('from-wal');
    `)

    const stale = new Database(target, {create: true})
    stale.exec("CREATE TABLE stale (id INTEGER PRIMARY KEY)")
    stale.close()

    const result = backupBoundaryDatabase({source, target})
    expect(result.target).toBe(target)
    expect(result.bytes).toBeGreaterThan(0)
    expect(existsSync(`${target}.tmp`)).toBe(false)

    const backup = new Database(target, {readonly: true})
    expect(backup.query("SELECT name FROM value ORDER BY id").all()).toEqual([
      {name: "first"},
      {name: "from-wal"},
    ])
    expect(backup.query("SELECT name FROM sqlite_master WHERE name = 'stale'").get()).toBeNull()
    backup.close()
    writer.close()
  })

  test("keeps the previous backup when verification fails", () => {
    const directory = temporaryDirectory()
    const source = join(directory, "source.sqlite")
    const target = join(directory, "backup.sqlite")

    const previous = new Database(target, {create: true})
    previous.exec("CREATE TABLE preserved (id INTEGER PRIMARY KEY)")
    previous.close()

    const invalid = new Database(source, {create: true})
    invalid.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parent(id)
      );
      INSERT INTO child (parent_id) VALUES (404);
    `)
    invalid.close()

    expect(() => backupBoundaryDatabase({source, target})).toThrow(
      "Boundary backup foreign key check failed",
    )

    const preserved = new Database(target, {readonly: true})
    expect(preserved.query("SELECT name FROM sqlite_master WHERE name = 'preserved'").get()).not.toBeNull()
    preserved.close()
    expect(existsSync(`${target}.tmp`)).toBe(false)
  })
})
