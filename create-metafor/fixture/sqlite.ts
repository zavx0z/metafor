import { join, isAbsolute, dirname } from "node:path"
import { unlinkSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { getMetaDB } from "@store/meta/sqlite"

/**
 * Фикстура для подготовки SQLite базы данных MetaDSL.
 *
 * @param dbPath - Путь к файлу базы данных. По умолчанию "meta.sqlite" рядом с вызывающим тестом.
 * @returns Открытый экземпляр Database с инициализированной схемой и расширенным методом close().
 */
export function createMetaforSqliteFixture(dbPath = "meta.sqlite") {
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

  return getMetaDB(absolutePath)
}
