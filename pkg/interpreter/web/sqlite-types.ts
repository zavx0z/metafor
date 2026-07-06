export type SqliteCellValue = string | number | boolean | null | {type?: string; size?: number; hex?: string}
export type SqliteTableSummary = {
  name: string
  type: "table" | "view"
  rowCount: number | null
}
export type SqliteColumnInfo = {
  name: string
  type: string
  notNull: boolean
  defaultValue: string | null
  primaryKey: boolean
}
export type SqliteDatabasePayload = {
  ok: true
  path: string
  label: string
  version: string
  selectedTable: string | null
  limit: number
  offset: number
  tables: SqliteTableSummary[]
  schema: SqliteColumnInfo[]
  rows: Array<Record<string, SqliteCellValue>>
}
export type SqliteSelectedRowContext = {
  rowId: string
  rowIndex: number
  rowid: number | null
  values: Record<string, SqliteCellValue>
}
export type SqliteRowSelectionContext = {
  selectedRowIds: string[]
  selectedRowCount: number
  selectedRows: SqliteSelectedRowContext[]
  selectionTruncated: boolean
}
export type SqliteHudContextSnapshot = {
  activeId: string
  docked: boolean
  path: string
  label: string
  selectedTable: string | null
  ready: boolean
  loading: boolean
  selectedRowIds: string[]
  selectedRowCount: number
  selectedRows: SqliteSelectedRowContext[]
  selectionTruncated: boolean
}
export type SqliteCellEditSession = {
  rowid: number
  column: string
  previous: SqliteCellValue
  onSubmit(rowid: number, column: string, value: SqliteCellValue): void
}
