import {Database} from "bun:sqlite"
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import {dirname, join, resolve} from "node:path"

export type BoundaryBackupOptions = {
  source?: string
  target?: string
}

export type BoundaryBackupResult = {
  source: string
  target: string
  bytes: number
}

const defaultSource = (): string =>
  resolve(process.env.BOUNDARY_PATH || join(import.meta.dir, "..", ".metafor", "dev.sqlite"))

const defaultTarget = (source: string): string =>
  resolve(process.env.BOUNDARY_BACKUP_PATH || join(dirname(source), "dev.backup.sqlite"))

const verifyBackup = (filename: string): void => {
  const database = new Database(filename, {readonly: true})
  try {
    const integrity = database.query("PRAGMA integrity_check").all() as Array<Record<string, unknown>>
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new Error(`Boundary backup integrity check failed: ${JSON.stringify(integrity)}`)
    }

    const foreignKeys = database.query("PRAGMA foreign_key_check").all()
    if (foreignKeys.length !== 0) {
      throw new Error(`Boundary backup foreign key check failed: ${JSON.stringify(foreignKeys)}`)
    }
  } finally {
    database.close()
  }
}

/**
 * Создаёт согласованный снимок Boundary SQLite, включая изменения из WAL.
 *
 * Новая копия сначала записывается и проверяется во временном файле. Только
 * после успешной проверки она атомарно заменяет предыдущую постоянную копию.
 */
export const backupBoundaryDatabase = (
  options: BoundaryBackupOptions = {},
): BoundaryBackupResult => {
  const source = resolve(options.source || defaultSource())
  const target = resolve(options.target || defaultTarget(source))
  if (source === target) throw new Error("Boundary backup target must differ from source")
  if (!existsSync(source)) throw new Error(`Boundary database does not exist: ${source}`)

  const temporary = `${target}.tmp`
  mkdirSync(dirname(target), {recursive: true})
  rmSync(temporary, {force: true})

  try {
    const database = new Database(source, {readonly: true})
    try {
      database.exec("PRAGMA busy_timeout = 5000")
      database.query("VACUUM INTO ?").run(temporary)
    } finally {
      database.close()
    }
    chmodSync(temporary, 0o600)
    const descriptor = openSync(temporary, "r")
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    verifyBackup(temporary)
    renameSync(temporary, target)
    chmodSync(target, 0o600)
  } catch (error) {
    rmSync(temporary, {force: true})
    throw error
  }

  return {source, target, bytes: statSync(target).size}
}

const main = (): void => {
  const [sourceArgument, targetArgument, ...unknown] = process.argv.slice(2)
  if (unknown.length !== 0) {
    throw new Error("Usage: bun run boundary:backup [source.sqlite] [backup.sqlite]")
  }
  const options: BoundaryBackupOptions = {}
  if (sourceArgument !== undefined) options.source = sourceArgument
  if (targetArgument !== undefined) options.target = targetArgument
  const result = backupBoundaryDatabase(options)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (import.meta.main) main()
