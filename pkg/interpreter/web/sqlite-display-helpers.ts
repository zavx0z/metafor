import type {FileListItem} from "@ui/panes"
import {booleanParam, objectParam, stringParam} from "./command-params.ts"
import type {SqliteDatabasePayload} from "./sqlite-types.ts"

export type SqliteOpenParams = {
  path: string
  table?: string
  notBefore?: string
  reveal?: boolean
}

export function sqliteOpenParams(params: unknown): SqliteOpenParams {
  const direct = stringParam(params)
  if (direct !== undefined) return {path: direct}
  const body = objectParam(params)
  const path = stringParam(body["path"])
    ?? stringParam(body["sourceUrl"])
    ?? stringParam(body["modulePath"])
    ?? stringParam(body["database"])
  if (path === undefined) throw new Error("sqlite.open requires path")
  const table = stringParam(body["table"])
  const notBefore = stringParam(body["notBefore"])
  const reveal = booleanParam(body["reveal"])
  return {
    path,
    ...(table === undefined ? {} : {table}),
    ...(notBefore === undefined ? {} : {notBefore}),
    ...(reveal === undefined ? {} : {reveal}),
  }
}

export function sqliteComparablePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/[?#].*$/, "")
}

export async function sqliteResponseError(response: Response): Promise<Error> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as {error?: unknown}
    const error = parsed.error
    if (typeof error === "object" && error !== null && typeof (error as {message?: unknown}).message === "string") {
      return new Error((error as {message: string}).message)
    }
    if (typeof error === "string") return new Error(error)
  } catch {
    // Use raw response text below.
  }
  return new Error(text.length > 0 ? text : `sqlite request failed: ${response.status}`)
}

export function sqliteTableItems(payload: SqliteDatabasePayload): FileListItem[] {
  return payload.tables.map((table) => ({
    id: sqliteTableItemId(table.name),
    name: table.name,
    kind: "file",
    path: table.name,
    sizeLabel: table.rowCount === null ? table.type : `${table.rowCount}`,
    statusLabel: table.type,
  }))
}

export function sqliteTableItemId(name: string): string {
  return `sqlite-table:${encodeURIComponent(name)}`
}

export function sqliteInitialLabel(path: string): string {
  const clean = sqliteComparablePath(path)
  return clean.split("/").pop() ?? clean
}

export function isSqliteSourcePath(path: string): boolean {
  return /\.sqlite(?:[?#].*)?$/i.test(path.trim().replaceAll("\\", "/"))
}

export function isSqliteMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /sqlite database not found|sqlite database not ready|unable to open database file|no such file/i.test(message)
}
