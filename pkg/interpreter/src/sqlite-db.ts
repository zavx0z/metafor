import {existsSync, statSync} from "node:fs"
import {isAbsolute, relative, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {Database} from "bun:sqlite"
import {serializeError} from "./errors.ts"
import type {JsonObject} from "./types.ts"

export type SqliteDatabasePayload = {
  ok: true
  path: string
  label: string
  selectedTable: string | null
  limit: number
  offset: number
  tables: SqliteTableSummary[]
  schema: SqliteColumnInfo[]
  rows: JsonObject[]
}

type SqliteTableSummary = {
  name: string
  type: "table" | "view"
  rowCount: number | null
}

type SqliteColumnInfo = {
  name: string
  type: string
  notNull: boolean
  defaultValue: string | null
  primaryKey: boolean
}

export function isSqliteDatabasePath(path: string): boolean {
  return /\.sqlite$/i.test(path.trim().replaceAll("\\", "/").replace(/[?#].*$/, ""))
}

export function sqliteDatabaseInputPath(input: string, cwd = process.cwd()): string {
  const clean = cleanSqliteInputPath(input)
  if (clean.length === 0) throw new Error("sqlite path is required")
  if (!isSqliteDatabasePath(clean)) throw new Error(`sqlite path must end with .sqlite: ${input}`)
  return (isAbsolute(clean) ? clean : resolve(cwd, clean)).replaceAll("\\", "/")
}

export function sqliteDatabasePath(input: string, cwd = process.cwd()): string {
  const path = sqliteDatabaseInputPath(input, cwd)
  if (!existsSync(path)) throw new Error(`sqlite database not found: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error(`sqlite path is not a file: ${path}`)
  return path
}

function cleanSqliteInputPath(input: string): string {
  const clean = input.trim().replace(/[?#].*$/, "")
  if (clean.startsWith("file://")) return fileURLToPath(clean)
  return clean
}

function sqliteNotBeforeMs(value: string | null): number | null {
  if (value === null || value.trim().length === 0) return null
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) throw new Error(`sqlite notBefore must be an ISO date: ${value}`)
  return ms
}

export function sqliteDatabaseLabel(path: string, cwd = process.cwd()): string {
  const rel = relative(cwd, path).replaceAll("\\", "/")
  return rel.length > 0 && !rel.startsWith("../") && rel !== ".." ? rel : path.replaceAll("\\", "/")
}

export function sqliteDatabasePayload(url: URL): SqliteDatabasePayload {
  const path = sqliteDatabasePath(url.searchParams.get("path") ?? "")
  const notBefore = sqliteNotBeforeMs(url.searchParams.get("notBefore"))
  if (notBefore !== null) {
    const stat = statSync(path)
    if (stat.mtimeMs < notBefore) throw new Error(`sqlite database not ready: ${path}`)
  }
  const selectedTable = optionalParam(url.searchParams.get("table"))
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 80), 1, 250)
  const offset = clampInt(Number(url.searchParams.get("offset") ?? 0), 0, 1_000_000)
  const db = new Database(path, {readwrite: true, create: false})
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    const tables = tableSummaries(db)
    const table = selectedTable !== null && tables.some((item) => item.name === selectedTable)
      ? selectedTable
      : tables[0]?.name ?? null
    const schema = table === null ? [] : columnInfo(db, table)
    const rows = table === null ? [] : tableRows(db, table, tables.find((item) => item.name === table)?.type ?? "table", limit, offset)
    return {
      ok: true,
      path,
      label: sqliteDatabaseLabel(path),
      selectedTable: table,
      limit,
      offset,
      tables,
      schema,
      rows,
    }
  } finally {
    db.close()
  }
}

export async function updateSqliteCell(req: Request): Promise<SqliteDatabasePayload> {
  const body = await req.json().catch(() => null)
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("JSON object body expected")
  const record = body as Record<string, unknown>
  const path = sqliteDatabasePath(asString(record["path"]) ?? "")
  const table = asString(record["table"])
  const column = asString(record["column"])
  const rowid = asNumber(record["rowid"])
  if (table === undefined) throw new Error("table is required")
  if (column === undefined) throw new Error("column is required")
  if (rowid === undefined || !Number.isInteger(rowid)) throw new Error("integer rowid is required")

  const db = new Database(path, {readwrite: true, create: false})
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    const tables = tableSummaries(db)
    const summary = tables.find((item) => item.name === table)
    if (summary === undefined) throw new Error(`sqlite table not found: ${table}`)
    if (summary.type !== "table") throw new Error(`sqlite view is read-only: ${table}`)
    const schema = columnInfo(db, table)
    if (!schema.some((item) => item.name === column)) throw new Error(`sqlite column not found: ${table}.${column}`)
    db.run(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = ? WHERE rowid = ?`, [sqliteInputValue(record["value"]), rowid])
  } finally {
    db.close()
  }

  return sqliteDatabasePayload(new URL(`http://127.0.0.1/sqlite?path=${encodeURIComponent(path)}&table=${encodeURIComponent(table)}`))
}

export function sqliteJsonError(error: unknown, status = 400): Response {
  return new Response(JSON.stringify({ok: false, error: serializeError(error)}, null, 2), {
    status,
    headers: {"content-type": "application/json; charset=utf-8"},
  })
}

function tableSummaries(db: Database): SqliteTableSummary[] {
  const rows = db.query(`
    SELECT name, type
      FROM sqlite_schema
     WHERE type IN ('table', 'view')
       AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name
  `).all() as Array<{name: string; type: "table" | "view"}>
  return rows.map((row) => ({
    name: row.name,
    type: row.type,
    rowCount: row.type === "table" ? countRows(db, row.name) : null,
  }))
}

function countRows(db: Database, table: string): number | null {
  try {
    const row = db.query(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`).get() as {count?: number | bigint} | null
    return numericCount(row?.count)
  } catch {
    return null
  }
}

function columnInfo(db: Database, table: string): SqliteColumnInfo[] {
  const rows = db.query(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{
    name: string
    type: string | null
    notnull: number
    dflt_value: string | null
    pk: number
  }>
  return rows.map((row) => ({
    name: row.name,
    type: row.type ?? "",
    notNull: row.notnull === 1,
    defaultValue: row.dflt_value,
    primaryKey: row.pk > 0,
  }))
}

function tableRows(db: Database, table: string, type: "table" | "view", limit: number, offset: number): JsonObject[] {
  const select = type === "table" ? `rowid AS "__rowid", *` : "*"
  const rows = db.query(`SELECT ${select} FROM ${quoteIdent(table)} LIMIT ? OFFSET ?`).all(limit, offset) as Array<Record<string, unknown>>
  return rows.map((row) => {
    const next: JsonObject = {}
    for (const [key, value] of Object.entries(row)) next[key] = sqliteJsonValue(value)
    return next
  })
}

function sqliteJsonValue(value: unknown): JsonObject[string] {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) {
    return {
      type: "blob",
      size: value.byteLength,
      hex: [...value.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    }
  }
  return String(value)
}

function sqliteInputValue(value: unknown): string | number | null {
  if (value === null || typeof value === "string" || typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  return String(value)
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll("\"", "\"\"")}"`
}

function optionalParam(value: string | null): string | null {
  const clean = value?.trim() ?? ""
  return clean.length === 0 ? null : clean
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function numericCount(value: number | bigint | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "bigint") return Number(value)
  return null
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
