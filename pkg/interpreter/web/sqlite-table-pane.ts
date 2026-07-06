import {UiSurface, palette, radii, Z, type UiSurfaceRect} from "@ui/elements"
import {Button, Table, TextField, focusTextField, normalizeTableSelection, tableScrollTo, tableSelectionAfterClick, type TableCellContext, type TableColumn, type TableRowId, type TableRowPointerContext, type TextFieldEditState} from "@ui/components"
import {clampNumber, withAlpha} from "./geometry.ts"
import {sameStringArray} from "./array-utils.ts"
import type {SqliteCellEditSession, SqliteCellValue, SqliteColumnInfo, SqliteDatabasePayload, SqliteRowSelectionContext, SqliteSelectedRowContext} from "./sqlite-types.ts"

const SQLITE_CONTEXT_SELECTED_ROW_LIMIT = 20
const SQLITE_TABLE_SCROLL_KEY = "sqlite-table-scroll"
const SQLITE_CELL_EDIT_FIELD_KEY = "sqlite-cell-edit-value"
const SQLITE_CELL_EDIT_MODAL_W = 500
const SQLITE_CELL_EDIT_MODAL_H = 192
const HUD_CODE_BG = withAlpha(palette.bgCode, 0.62)
const HUD_LOCAL_BACKDROP_BG = withAlpha(palette.bg, 0.24)
const HUD_MODAL_SHADOW_BG = withAlpha(palette.bgInput, 0.32)
const HUD_MODAL_BG = withAlpha(palette.bgElevated, 0.78)

export class SqliteTablePane extends UiSurface {
  #payload: SqliteDatabasePayload | null = null
  #status = "Open SQLite database"
  #selectedRowIds: string[] = []
  #selectionAnchorRowId: string | null = null
  #editSession: SqliteCellEditSession | null = null
  #editInput: TextFieldEditState = {value: "", cursor: 0, selectionAnchor: null}
  readonly #onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void
  readonly #onSelectionChange: () => void

  constructor(onCellEdit: (rowid: number, column: string, value: SqliteCellValue) => void, onSelectionChange: () => void) {
    super({bgColor: HUD_CODE_BG, borderColor: palette.borderDim, borderWidthPx: 1, borderRadiusPx: radii.pane})
    this.node.name = "SqliteTablePane"
    this.#onCellEdit = onCellEdit
    this.#onSelectionChange = onSelectionChange
  }

  setPayload(payload: SqliteDatabasePayload): void {
    const tableChanged = this.#payload?.path !== payload.path || this.#payload.selectedTable !== payload.selectedTable
    this.#payload = payload
    this.#status = payload.selectedTable === null ? "No tables" : `${payload.selectedTable} · ${payload.rows.length} rows`
    const selectionChanged = tableChanged ? this.#clearSelectionState() : this.#normalizeSelectionState()
    if (tableChanged) {
      tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
      this.#closeEdit({blur: false})
    }
    if (selectionChanged) this.#onSelectionChange()
    this.requestRender()
  }

  setStatus(status: string): void {
    this.#status = status
    this.requestRender()
  }

  clearPayload(status: string): void {
    this.#payload = null
    this.#status = status
    const selectionChanged = this.#clearSelectionState()
    tableScrollTo(this, SQLITE_TABLE_SCROLL_KEY, {left: 0, top: 0})
    this.#closeEdit({blur: false})
    if (selectionChanged) this.#onSelectionChange()
    this.requestRender()
  }

  selectedRowIds(): readonly string[] {
    return [...this.#selectedRowIds]
  }

  contextSnapshot(limit = SQLITE_CONTEXT_SELECTED_ROW_LIMIT): SqliteRowSelectionContext {
    const payload = this.#payload
    if (payload === null) {
      return {
        selectedRowIds: [],
        selectedRowCount: 0,
        selectedRows: [],
        selectionTruncated: false,
      }
    }
    const selected = new Set(this.#selectedRowIds)
    const selectedRows: SqliteSelectedRowContext[] = []
    for (let rowIndex = 0; rowIndex < payload.rows.length; rowIndex += 1) {
      const row = payload.rows[rowIndex]!
      const rowId = sqliteRowSelectionId(row, rowIndex)
      if (!selected.has(rowId)) continue
      if (selectedRows.length < limit) {
        selectedRows.push({
          rowId,
          rowIndex,
          rowid: sqliteRowId(row["__rowid"]),
          values: {...row},
        })
      }
    }
    return {
      selectedRowIds: [...this.#selectedRowIds],
      selectedRowCount: this.#selectedRowIds.length,
      selectedRows,
      selectionTruncated: selectedRows.length < this.#selectedRowIds.length,
    }
  }

  protected render(): void {
    const payload = this.#payload
    const pad = 14
    const headerH = 58
    this.drawText("SQLite", pad, 10, {fontPx: 13, material: this.materials.cyan, maxWidthPx: 120})
    this.drawText(payload?.label ?? this.#status, 78, 10, {
      fontPx: 12,
      material: this.materials.text,
      maxWidthPx: Math.max(1, this.rectW - 78 - pad),
    })
    const status = this.#statusLabel()
    this.drawText(status, pad, 34, {
      fontPx: 11,
      material: payload === null ? this.materials.muted : this.materials.green,
      maxWidthPx: Math.max(1, this.rectW - pad * 2),
    })
    this.drawRect(pad, headerH - 1, Math.max(1, this.rectW - pad * 2), 1, palette.borderDim)

    if (payload === null) return
    if (payload.selectedTable === null) {
      this.drawText("No tables in database", pad, headerH + 18, {
        fontPx: 12,
        material: this.materials.muted,
        maxWidthPx: Math.max(1, this.rectW - pad * 2),
      })
      return
    }

    const schema = sqliteSchemaSummary(payload.schema)
    this.drawText(schema, pad, headerH + 10, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, this.rectW - pad * 2),
    })

    const tableY = headerH + 34
    const tableH = Math.max(1, this.rectH - tableY - pad)
    const columnNames = sqliteTableColumns(payload)
    const widths = sqliteTableColumnWidths(this, payload, columnNames)
    const selectedSummary = payload.tables.find((table) => table.name === payload.selectedTable)
    const editableTable = selectedSummary?.type === "table"
    const columns: Array<TableColumn<Record<string, SqliteCellValue>>> = columnNames.map((column, index) => ({
      key: column,
      label: sqliteTableColumnLabel(column),
      ...(column === "__rowid" ? {getValue: (_row, rowIndex) => sqliteDisplayRowNumber(payload, rowIndex)} : {}),
      width: widths[index] ?? 104,
    }))
    Table(this, pad, tableY, Math.max(1, this.rectW - pad * 2), tableH, {
      key: SQLITE_TABLE_SCROLL_KEY,
      columns,
      rows: payload.rows,
      rowHeight: 24,
      headerHeight: 27,
      emptyLabel: "No rows",
      getRowId: (row, rowIndex) => sqliteRowSelectionId(row, rowIndex),
      selectedRowIds: this.#selectedRowIds,
      getHeaderMaterial: ({column}) => column.key === "__rowid" ? this.materials.muted : this.materials.cyan,
      getCellText: ({value}) => sqliteCellLabel(value as SqliteCellValue | undefined),
      getCellMaterial: ({column, value}) => column.key === "__rowid"
        ? this.materials.muted
        : value === null || value === undefined ? this.materials.muted : this.materials.text,
      onRowClick: (ctx) => this.#selectRow(ctx),
      ...(editableTable ? {onRowDoubleClick: (ctx: TableRowPointerContext<Record<string, SqliteCellValue>>) => this.#editRowCell(ctx)} : {}),
    })
    if (this.#editSession !== null) this.#renderEditOverlay()
  }

  #statusLabel(): string {
    if (this.#payload === null || this.#selectedRowIds.length === 0) return this.#status
    return `${this.#status} · ${this.#selectedRowIds.length} selected`
  }

  #selectRow(ctx: TableRowPointerContext<Record<string, SqliteCellValue>>): void {
    const payload = this.#payload
    if (payload === null) return
    const rowIds = sqlitePayloadRowIds(payload)
    const update = tableSelectionAfterClick(rowIds, this.#selectedRowIds, String(ctx.rowId), this.#selectionAnchorRowId, ctx.event)
    this.#applySelection(update.selectedRowIds.map(String), String(update.anchorRowId))
  }

  #editRowCell(ctx: TableRowPointerContext<Record<string, SqliteCellValue>>): void {
    if (ctx.cell === null) return
    this.#editCell(ctx.cell)
  }

  #applySelection(selectedRowIds: readonly string[], anchorRowId: string): void {
    const payload = this.#payload
    const rowIds = payload === null ? [] : sqlitePayloadRowIds(payload)
    const next = normalizeTableSelection(rowIds, selectedRowIds).map(String)
    const nextAnchor = next.includes(anchorRowId) ? anchorRowId : next[0] ?? null
    if (sameStringArray(next, this.#selectedRowIds) && nextAnchor === this.#selectionAnchorRowId) return
    this.#selectedRowIds = next
    this.#selectionAnchorRowId = nextAnchor
    this.#onSelectionChange()
    this.requestRender()
  }

  #normalizeSelectionState(): boolean {
    const payload = this.#payload
    const rowIds = payload === null ? [] : sqlitePayloadRowIds(payload)
    const next = normalizeTableSelection(rowIds, this.#selectedRowIds).map(String)
    const nextAnchor = this.#selectionAnchorRowId !== null && next.includes(this.#selectionAnchorRowId)
      ? this.#selectionAnchorRowId
      : next[0] ?? null
    if (sameStringArray(next, this.#selectedRowIds) && nextAnchor === this.#selectionAnchorRowId) return false
    this.#selectedRowIds = next
    this.#selectionAnchorRowId = nextAnchor
    return true
  }

  #clearSelectionState(): boolean {
    if (this.#selectedRowIds.length === 0 && this.#selectionAnchorRowId === null) return false
    this.#selectedRowIds = []
    this.#selectionAnchorRowId = null
    return true
  }

  #editCell(ctx: TableCellContext<Record<string, SqliteCellValue>>): void {
    const rowid = sqliteRowId(ctx.row["__rowid"])
    if (rowid === null || ctx.column.key === "__rowid") return
    const value = ctx.row[ctx.column.key] ?? null
    this.#openEdit({
      rowid,
      column: ctx.column.key,
      previous: value,
      onSubmit: this.#onCellEdit,
    })
  }

  #openEdit(session: SqliteCellEditSession): void {
    const raw = sqliteCellPromptValue(session.previous)
    this.#editSession = session
    this.#editInput = {value: raw, cursor: raw.length, selectionAnchor: raw.length > 0 ? 0 : null}
    focusTextField(this, SQLITE_CELL_EDIT_FIELD_KEY, this.#editInput)
    this.canvas?.setFocused(this)
    this.canvas?.inputProxy?.focus()
    this.requestRender()
  }

  #renderEditOverlay(): void {
    const session = this.#editSession
    if (session === null) return

    const rect = this.#editModalRect()
    this.hit(0, 0, this.rectW, this.rectH, () => this.#cancel(), {
      key: "sqlite-cell-edit-backdrop",
      cursor: "default",
    })
    this.drawRoundedRect(0, 0, this.rectW, this.rectH, {
      radius: 0,
      fill: HUD_LOCAL_BACKDROP_BG,
      z: Z.CONTAINER,
    })
    this.drawRoundedRect(rect.x + 3, rect.y + 4, rect.w, rect.h, {
      radius: radii.pane,
      fill: HUD_MODAL_SHADOW_BG,
      z: Z.ELEMENT,
    })
    this.drawRoundedRect(rect.x, rect.y, rect.w, rect.h, {
      radius: radii.pane,
      fill: HUD_MODAL_BG,
      border: palette.borderDim,
      borderWidth: 1,
      z: Z.ELEMENT + 0.01,
    })
    this.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
      key: "sqlite-cell-edit-panel",
      cursor: "default",
    })

    const pad = 18
    const titleY = rect.y + 16
    this.drawText("Edit SQLite cell", rect.x + pad, titleY, {
      fontPx: 14,
      material: this.materials.cyan,
      maxWidthPx: Math.max(1, rect.w - pad * 2),
      z: Z.TEXT,
    })
    this.drawText(`rowid ${session.rowid} · ${session.column}`, rect.x + pad, titleY + 26, {
      fontPx: 11,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, rect.w - pad * 2),
      z: Z.TEXT,
    })

    const fieldY = rect.y + 74
    TextField(this, rect.x + pad, fieldY, Math.max(1, rect.w - pad * 2), 34, {
      key: SQLITE_CELL_EDIT_FIELD_KEY,
      value: this.#editInput.value,
      cursor: this.#editInput.cursor,
      selectionAnchor: this.#editInput.selectionAnchor,
      active: true,
      submitOnEnter: true,
      fontPx: 12,
      sx: {borderRadius: 8},
      onChange: (_value, state) => {
        this.#editInput = state
      },
      onSubmit: () => this.#submit(),
    })
    this.drawText("Use NULL for SQL null. Enter applies, Esc cancels.", rect.x + pad, fieldY + 45, {
      fontPx: 10,
      material: this.materials.muted,
      maxWidthPx: Math.max(1, rect.w - pad * 2),
      z: Z.TEXT,
    })

    const buttonY = rect.y + rect.h - 44
    const buttonW = 104
    Button(this, rect.x + rect.w - pad - buttonW, buttonY, buttonW, 30, {
      label: "Apply",
      variant: "contained",
      color: "success",
      onClick: () => this.#submit(),
    })
    Button(this, rect.x + rect.w - pad - buttonW * 2 - 10, buttonY, buttonW, 30, {
      label: "Cancel",
      variant: "outlined",
      color: "neutral",
      onClick: () => this.#cancel(),
    })
  }

  onActivate(): void {
    if (this.#editSession !== null) focusTextField(this, SQLITE_CELL_EDIT_FIELD_KEY, this.#editInput)
  }

  onKey(event: KeyboardEvent): void {
    if (this.#editSession === null || event.key !== "Escape") return
    event.preventDefault()
    this.#cancel()
  }

  #submit(): void {
    const session = this.#editSession
    if (session === null) return
    const next = sqliteCellInputValue(this.#editInput.value, session.previous)
    this.#closeEdit()
    session.onSubmit(session.rowid, session.column, next)
  }

  #cancel(): void {
    if (this.#editSession === null) return
    this.#closeEdit()
  }

  #closeEdit(opts: {blur?: boolean} = {}): void {
    if (this.#editSession === null) return
    this.#editSession = null
    this.#editInput = {value: "", cursor: 0, selectionAnchor: null}
    if (opts.blur !== false) {
      this.canvas?.setFocused(null)
      this.canvas?.inputProxy?.blur()
    }
    this.requestRender()
  }

  #editModalRect(): UiSurfaceRect {
    const maxW = Math.max(1, Math.min(SQLITE_CELL_EDIT_MODAL_W, this.rectW - 32))
    const maxH = Math.max(1, Math.min(SQLITE_CELL_EDIT_MODAL_H, this.rectH - 32))
    const modalW = clampNumber(SQLITE_CELL_EDIT_MODAL_W, Math.min(280, maxW), maxW)
    const modalH = clampNumber(SQLITE_CELL_EDIT_MODAL_H, Math.min(164, maxH), maxH)
    return {
      x: clampNumber(this.rectW / 2 - modalW / 2, 16, Math.max(16, this.rectW - modalW - 16)),
      y: clampNumber(this.rectH / 2 - modalH / 2, 16, Math.max(16, this.rectH - modalH - 16)),
      w: modalW,
      h: modalH,
    }
  }
}

function sqliteSchemaSummary(schema: readonly SqliteColumnInfo[]): string {
  if (schema.length === 0) return "No schema"
  return schema.map((column) => {
    const flags = [
      column.type || "value",
      column.primaryKey ? "pk" : "",
      column.notNull ? "not null" : "",
    ].filter(Boolean).join(" ")
    return `${column.name}: ${flags}`
  }).join(" · ")
}

function sqliteTableColumns(payload: SqliteDatabasePayload): string[] {
  const out: string[] = []
  if (payload.rows.some((row) => Object.prototype.hasOwnProperty.call(row, "__rowid"))) out.push("__rowid")
  for (const column of payload.schema) if (!out.includes(column.name)) out.push(column.name)
  for (const row of payload.rows) {
    for (const key of Object.keys(row)) if (!out.includes(key)) out.push(key)
  }
  return out
}

function sqliteTableColumnLabel(column: string): string {
  return column === "__rowid" ? "#" : column
}

function sqliteDisplayRowNumber(payload: SqliteDatabasePayload, rowIndex: number): number {
  return payload.offset + rowIndex + 1
}

function sqliteTableColumnWidths(surface: UiSurface, payload: SqliteDatabasePayload, columns: readonly string[]): number[] {
  const sampleRows = payload.rows.slice(0, 40)
  return columns.map((column) => {
    let width = surface.measureText(sqliteTableColumnLabel(column), 10) + 28
    const schema = payload.schema.find((item) => item.name === column)
    if (schema !== undefined) width = Math.max(width, surface.measureText(schema.type || "value", 9) + 28)
    for (let rowIndex = 0; rowIndex < sampleRows.length; rowIndex += 1) {
      const value = column === "__rowid" ? sqliteDisplayRowNumber(payload, rowIndex) : sampleRows[rowIndex]?.[column] ?? null
      width = Math.max(width, surface.measureText(sqliteCellLabel(value), 10) + 28)
    }
    const min = column === "__rowid" ? 48 : 104
    return Math.min(260, Math.max(min, Math.ceil(width)))
  })
}

function sqlitePayloadRowIds(payload: SqliteDatabasePayload): TableRowId[] {
  return payload.rows.map((row, rowIndex) => sqliteRowSelectionId(row, rowIndex))
}

function sqliteRowSelectionId(row: Record<string, SqliteCellValue>, rowIndex: number): string {
  const rowid = sqliteRowId(row["__rowid"])
  return rowid === null ? `index:${rowIndex}` : `rowid:${rowid}`
}

function sqliteRowId(value: SqliteCellValue | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value)
  return null
}

function sqliteCellLabel(value: SqliteCellValue | undefined): string {
  if (value === undefined || value === null) return "NULL"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof value === "object") {
    const size = typeof value.size === "number" ? `${value.size}b` : "blob"
    const hex = typeof value.hex === "string" && value.hex.length > 0 ? ` ${value.hex}` : ""
    return `<${size}${hex}>`
  }
  return String(value)
}

function sqliteCellPromptValue(value: SqliteCellValue): string {
  if (value === null) return "NULL"
  if (typeof value === "object") return sqliteCellLabel(value)
  return String(value)
}

function sqliteCellInputValue(raw: string, previous: SqliteCellValue): SqliteCellValue {
  const clean = raw.trim()
  if (/^null$/i.test(clean)) return null
  if (typeof previous === "number") {
    const number = Number(clean)
    return Number.isFinite(number) ? number : raw
  }
  if (typeof previous === "boolean") {
    if (/^true$/i.test(clean)) return true
    if (/^false$/i.test(clean)) return false
  }
  return raw
}
