import { join, isAbsolute, dirname } from "node:path"
import { unlinkSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { SQL } from "bun"
import { metaSchemaSql } from "@store/meta/sqlite"

/**
 * Фикстура для подготовки SQLite базы данных MetaDSL.
 *
 * @param dbPath - Путь к файлу базы данных. По умолчанию "meta.sqlite" рядом с вызывающим тестом.
 * @returns Открытый Bun.SQL с применённой meta-схемой.
 */
export async function createMetaforSqliteFixture(dbPath = "meta.sqlite") {
  let finalPath = dbPath

  if (!isAbsolute(dbPath)) {
    const stack = new Error().stack
    const lines = stack?.split("\n")
    if (lines && lines.length >= 3) {
      const callerLine = lines[2]!
      const match = callerLine.match(/(?:at\s+)?(?:.+\s+\()?(.*):(\d+):(\d+)\)?/)
      if (match && match[1]) {
        let callerFile = match[1]
        if (callerFile.startsWith("file://")) {
          callerFile = fileURLToPath(callerFile)
        }
        finalPath = join(dirname(callerFile), dbPath)
      }
    }
  }

  const absolutePath = isAbsolute(finalPath) ? finalPath : join(process.cwd(), finalPath)

  if (existsSync(absolutePath)) {
    unlinkSync(absolutePath)
  }

  const sql = new SQL(`sqlite://${absolutePath}`)
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  await sql.unsafe("PRAGMA journal_mode = WAL;")
  await sql.unsafe(metaSchemaSql)
  return sql
}
