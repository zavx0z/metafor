import {Color} from "@metafor/engine"
import {
  div,
  divScrollTo,
  palette,
  Z,
  type DivScrollContext,
  type DrawTextOpts,
  type StyleProps,
  type UiSurface,
} from "@ui/elements"

export type TableColumn<Row> = {
  key: string
  label?: string
  width: number
  getValue?: (row: Row, rowIndex: number) => unknown
}

export type TableRowId = string | number

export type TableCellContext<Row> = {
  row: Row
  rowIndex: number
  rowId: TableRowId
  selected: boolean
  column: TableColumn<Row>
  columnIndex: number
  value: unknown
}

export type TableRowPointerContext<Row> = {
  row: Row
  rowIndex: number
  rowId: TableRowId
  selected: boolean
  event: MouseEvent | undefined
  cell: TableCellContext<Row> | null
  column: TableColumn<Row> | null
  columnIndex: number | null
  value: unknown
}

export type TableHeaderContext<Row> = {
  column: TableColumn<Row>
  columnIndex: number
}

export type TableSelectionGesture = {
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
}

export type TableSelectionUpdate = {
  selectedRowIds: readonly TableRowId[]
  anchorRowId: TableRowId
}

export type TableProps<Row> = {
  key?: string
  columns: readonly TableColumn<Row>[]
  rows: readonly Row[]
  selectedRowIds?: readonly TableRowId[]
  getRowId?: (row: Row, rowIndex: number) => TableRowId
  rowHeight?: number
  headerHeight?: number
  fontPx?: number
  headerFontPx?: number
  cellPaddingX?: number
  emptyLabel?: string
  sx?: StyleProps
  getCellText?: (ctx: TableCellContext<Row>) => string
  getCellMaterial?: (ctx: TableCellContext<Row>) => DrawTextOpts["material"]
  getHeaderMaterial?: (ctx: TableHeaderContext<Row>) => DrawTextOpts["material"]
  isCellInteractive?: (ctx: TableCellContext<Row>) => boolean
  cellCursor?: string | ((ctx: TableCellContext<Row>) => string)
  onCellClick?: (ctx: TableCellContext<Row>) => void
  rowCursor?: string | ((ctx: TableRowPointerContext<Row>) => string)
  onRowClick?: (ctx: TableRowPointerContext<Row>) => void
  onRowDoubleClick?: (ctx: TableRowPointerContext<Row>) => void
}

const DEFAULT_TABLE_ROW_H = 24
const DEFAULT_TABLE_HEADER_H = 27
const DEFAULT_TABLE_FONT_PX = 10
const DEFAULT_TABLE_CELL_PAD_X = 8
const TABLE_BODY_BG_Z = Z.CONTAINER + 0.01
const TABLE_BODY_RULE_Z = Z.ELEMENT_RULE
const TABLE_BODY_TEXT_Z = Z.TEXT
const TABLE_HEADER_BACKDROP_Z = Z.TEXT + 0.035
const TABLE_HEADER_BG_Z = Z.TEXT + 0.04
const TABLE_HEADER_RULE_Z = Z.TEXT + 0.05
const TABLE_HEADER_TEXT_Z = Z.TEXT + 0.06
const TABLE_HEADER_EDGE_COVER_PX = 3
const TABLE_BODY_TEXT_TOP_INSET_PX = TABLE_HEADER_EDGE_COVER_PX + 1
const TABLE_ROW_STRIPE_FILL = withAlpha(palette.bgPanelDim, 0.44)
const TABLE_ROW_HOVER_FILL = withAlpha(palette.bgHot, 0.30)
const TABLE_ROW_SELECTED_FILL = withAlpha(palette.activeRowFill, 0.68)
const TABLE_HEADER_BACKDROP_FILL = withAlpha(palette.bgToolbar, 0.62)
const TABLE_HEADER_FILL = withAlpha(palette.bgPanel, 0.58)

export function normalizeTableSelection(rowIds: readonly TableRowId[], selectedRowIds: readonly TableRowId[]): TableRowId[] {
  const known = new Set(rowIds)
  const next: TableRowId[] = []
  for (const id of selectedRowIds) {
    if (!known.has(id) || next.includes(id)) continue
    next.push(id)
  }
  return next
}

export function tableSelectionAfterClick(
  rowIds: readonly TableRowId[],
  currentSelectedRowIds: readonly TableRowId[],
  clickedRowId: TableRowId,
  anchorRowId: TableRowId | null,
  gesture: TableSelectionGesture = {},
): TableSelectionUpdate {
  const selected = uniqueRowIds(currentSelectedRowIds)
  const additive = gesture.metaKey === true || gesture.ctrlKey === true
  if (gesture.shiftKey === true) {
    const rangeIds = tableRangeRowIds(rowIds, anchorRowId ?? selected[selected.length - 1] ?? clickedRowId, clickedRowId)
    if (rangeIds.length === 0) return {selectedRowIds: [clickedRowId], anchorRowId: clickedRowId}
    if (additive) return {selectedRowIds: uniqueRowIds([...selected, ...rangeIds]), anchorRowId: anchorRowId ?? clickedRowId}
    return {selectedRowIds: rangeIds, anchorRowId: anchorRowId ?? clickedRowId}
  }

  if (additive) {
    const next = selected.includes(clickedRowId)
      ? selected.filter((id) => id !== clickedRowId)
      : [...selected, clickedRowId]
    return {selectedRowIds: next, anchorRowId: clickedRowId}
  }

  return {selectedRowIds: [clickedRowId], anchorRowId: clickedRowId}
}

export function Table<Row>(host: UiSurface, x: number, y: number, width: number, height: number, props: TableProps<Row>): void {
  if (width <= 0 || height <= 0) return
  const key = props.key ?? `component-table:${x}:${y}:${width}:${height}`
  const rowH = props.rowHeight ?? DEFAULT_TABLE_ROW_H
  const headerH = props.headerHeight ?? DEFAULT_TABLE_HEADER_H
  const contentW = Math.max(1, props.columns.reduce((sum, column) => sum + Math.max(1, column.width), 0))
  const contentH = Math.max(1, headerH + props.rows.length * rowH)
  div(host, x, y, width, height, {
    key,
    scrollContentWidth: contentW,
    scrollContentHeight: contentH,
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      padding: 0,
      overflowX: "auto",
      overflowY: "auto",
      scrollbarWidth: 4,
      ...props.sx,
    },
    children: (ctx) => renderTable(host, x, y, props, ctx, rowH, headerH, key),
  })
}

export function tableScrollTo(surface: UiSurface, key: string, next: {left?: number; top?: number}): void {
  divScrollTo(surface, key, next)
}

function renderTable<Row>(
  host: UiSurface,
  x: number,
  y: number,
  props: TableProps<Row>,
  ctx: DivScrollContext,
  rowH: number,
  headerH: number,
  key: string,
): void {
  const bodyY = y + headerH
  const bodyH = Math.max(1, ctx.viewportHeight - headerH)
  const firstRow = Math.max(0, Math.floor(ctx.scrollTop / rowH))
  const rowOffset = ctx.scrollTop - firstRow * rowH
  const visibleRows = Math.ceil(bodyH / rowH) + 1

  host.pushClip(x, bodyY, Math.max(1, ctx.viewportWidth), bodyH)
  try {
    renderTableBody(host, x, bodyY, bodyH, props, ctx, rowH, firstRow, rowOffset, visibleRows, key)
  } finally {
    host.popClip()
  }
  renderTableHeader(host, x, y, props, ctx, headerH)
}

function renderTableBody<Row>(
  host: UiSurface,
  x: number,
  bodyY: number,
  bodyH: number,
  props: TableProps<Row>,
  ctx: DivScrollContext,
  rowH: number,
  firstRow: number,
  rowOffset: number,
  visibleRows: number,
  key: string,
): void {
  if (props.rows.length === 0) {
    host.drawText(props.emptyLabel ?? "No rows", x + 10, bodyY + 16, {
      fontPx: 12,
      material: host.materials.muted,
      maxWidthPx: Math.max(1, ctx.viewportWidth - 20),
      z: TABLE_BODY_TEXT_Z,
    })
    renderVerticalRules(host, x, bodyY, bodyH, props.columns, ctx.scrollLeft, TABLE_BODY_RULE_Z)
    return
  }

  for (let visibleIndex = 0; visibleIndex < visibleRows; visibleIndex += 1) {
    const rowIndex = firstRow + visibleIndex
    const row = props.rows[rowIndex]
    if (row === undefined) continue
    const rowY = bodyY + visibleIndex * rowH - rowOffset
    if (rowIndex % 2 === 1) host.drawRect(x, rowY, Math.max(1, ctx.viewportWidth), rowH, TABLE_ROW_STRIPE_FILL, TABLE_BODY_BG_Z)
    host.drawRect(x, rowY + rowH - 1, Math.max(1, ctx.viewportWidth), 1, palette.borderRule, TABLE_BODY_RULE_Z)
    renderTableRow(host, x, rowY, rowH, props, ctx, row, rowIndex, key, bodyY, bodyH)
  }
  renderVerticalRules(host, x, bodyY, bodyH, props.columns, ctx.scrollLeft, TABLE_BODY_RULE_Z)
}

function renderTableHeader<Row>(
  host: UiSurface,
  x: number,
  y: number,
  props: TableProps<Row>,
  ctx: DivScrollContext,
  headerH: number,
): void {
  const headerW = Math.max(1, ctx.viewportWidth)
  host.drawRect(x, y, headerW, headerH + TABLE_HEADER_EDGE_COVER_PX, TABLE_HEADER_BACKDROP_FILL, TABLE_HEADER_BACKDROP_Z)
  host.drawRect(x, y, headerW, headerH, TABLE_HEADER_FILL, TABLE_HEADER_BG_Z)
  let columnX = x - ctx.scrollLeft
  const fontPx = props.headerFontPx ?? props.fontPx ?? DEFAULT_TABLE_FONT_PX
  const padX = props.cellPaddingX ?? DEFAULT_TABLE_CELL_PAD_X
  for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
    const column = props.columns[columnIndex]!
    const w = Math.max(1, column.width)
    host.drawRect(columnX, y, 1, headerH, palette.borderRule, TABLE_HEADER_RULE_Z)
    host.drawText(column.label ?? column.key, columnX + padX, y + 8, {
      fontPx,
      material: props.getHeaderMaterial?.({column, columnIndex}) ?? host.materials.cyan,
      maxWidthPx: Math.max(1, w - padX * 2),
      z: TABLE_HEADER_TEXT_Z,
    })
    columnX += w
  }
  host.drawRect(columnX, y, 1, headerH, palette.borderRule, TABLE_HEADER_RULE_Z)
  host.drawRect(x, y + headerH - 2, Math.max(1, ctx.viewportWidth), 2, palette.borderDim, TABLE_HEADER_RULE_Z)
}

function renderVerticalRules<Row>(
  host: UiSurface,
  x: number,
  y: number,
  h: number,
  columns: readonly TableColumn<Row>[],
  scrollLeft: number,
  z: number,
): void {
  let columnX = x - scrollLeft
  for (const column of columns) {
    host.drawRect(columnX, y, 1, h, palette.borderRule, z)
    columnX += Math.max(1, column.width)
  }
  host.drawRect(columnX, y, 1, h, palette.borderRule, z)
}

function renderTableRow<Row>(
  host: UiSurface,
  x: number,
  y: number,
  rowH: number,
  props: TableProps<Row>,
  ctx: DivScrollContext,
  row: Row,
  rowIndex: number,
  key: string,
  bodyY: number,
  bodyH: number,
): void {
  let columnX = x - ctx.scrollLeft
  const fontPx = props.fontPx ?? DEFAULT_TABLE_FONT_PX
  const padX = props.cellPaddingX ?? DEFAULT_TABLE_CELL_PAD_X
  const rowId = tableRowId(row, rowIndex, props)
  const selected = props.selectedRowIds?.includes(rowId) === true
  const rowHitKey = `${key}:row:${String(rowId)}`
  const rowHitY = Math.max(y, bodyY)
  const rowHitH = Math.min(y + rowH, bodyY + bodyH) - rowHitY
  if (rowHitH > 0) {
    const state = host.hitState(x, rowHitY, Math.max(1, ctx.viewportWidth), rowHitH, rowHitKey)
    if (selected) host.drawRect(x, rowHitY, Math.max(1, ctx.viewportWidth), rowHitH, TABLE_ROW_SELECTED_FILL, TABLE_BODY_BG_Z + 0.01)
    else if (state.hovered) host.drawRect(x, rowHitY, Math.max(1, ctx.viewportWidth), rowHitH, TABLE_ROW_HOVER_FILL, TABLE_BODY_BG_Z + 0.01)
  }
  for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
    const column = props.columns[columnIndex]!
    const w = Math.max(1, column.width)
    const value = tableColumnValue(row, rowIndex, column)
    const cellCtx: TableCellContext<Row> = {row, rowIndex, rowId, selected, column, columnIndex, value}
    const textY = y + 7
    if (textY >= bodyY + TABLE_BODY_TEXT_TOP_INSET_PX && textY < bodyY + bodyH) {
      host.drawText(props.getCellText?.(cellCtx) ?? defaultCellText(value), columnX + padX, textY, {
        fontPx,
        material: props.getCellMaterial?.(cellCtx) ?? host.materials.text,
        maxWidthPx: Math.max(1, w - padX * 2),
        z: TABLE_BODY_TEXT_Z,
      })
    }

    if (props.onCellClick !== undefined && props.isCellInteractive?.(cellCtx) === true) {
      const hitX = Math.max(columnX, x)
      const hitW = Math.min(columnX + w, x + ctx.viewportWidth) - hitX
      const hitY = Math.max(y, bodyY)
      const hitH = Math.min(y + rowH, bodyY + bodyH) - hitY
      if (hitW > 0 && hitH > 0) {
        const cursor = typeof props.cellCursor === "function" ? props.cellCursor(cellCtx) : props.cellCursor
        host.hit(hitX, hitY, hitW, hitH, () => props.onCellClick?.(cellCtx), {
          key: `${key}:cell:${rowIndex}:${column.key}`,
          cursor: cursor ?? "pointer",
        })
      }
    }
    columnX += w
  }
  if ((props.onRowClick !== undefined || props.onRowDoubleClick !== undefined) && rowHitH > 0) {
    const rowCursor = typeof props.rowCursor === "string" ? props.rowCursor : "pointer"
    host.hit(x, rowHitY, Math.max(1, ctx.viewportWidth), rowHitH, () => {}, {
      key: rowHitKey,
      cursor: rowCursor,
      onPointerDown: (localX, _localY, event) => {
        if (event?.button !== undefined && event.button !== 0) return
        event?.preventDefault()
        const pointerCtx = tableRowPointerContext(row, rowIndex, rowId, selected, props, ctx, x, localX, event)
        props.onRowClick?.(pointerCtx)
        if ((event?.detail ?? 1) >= 2) props.onRowDoubleClick?.(pointerCtx)
      },
    })
  }
}

function tableColumnValue<Row>(row: Row, rowIndex: number, column: TableColumn<Row>): unknown {
  if (column.getValue !== undefined) return column.getValue(row, rowIndex)
  if (row !== null && typeof row === "object" && column.key in row) return (row as Record<string, unknown>)[column.key]
  return undefined
}

function tableRowId<Row>(row: Row, rowIndex: number, props: TableProps<Row>): TableRowId {
  return props.getRowId?.(row, rowIndex) ?? rowIndex
}

function tableRowPointerContext<Row>(
  row: Row,
  rowIndex: number,
  rowId: TableRowId,
  selected: boolean,
  props: TableProps<Row>,
  ctx: DivScrollContext,
  tableX: number,
  localX: number,
  event: MouseEvent | undefined,
): TableRowPointerContext<Row> {
  let columnX = tableX - ctx.scrollLeft
  for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
    const column = props.columns[columnIndex]!
    const w = Math.max(1, column.width)
    if (localX >= columnX && localX <= columnX + w) {
      const value = tableColumnValue(row, rowIndex, column)
      const cell: TableCellContext<Row> = {row, rowIndex, rowId, selected, column, columnIndex, value}
      return {row, rowIndex, rowId, selected, event, cell, column, columnIndex, value}
    }
    columnX += w
  }
  return {row, rowIndex, rowId, selected, event, cell: null, column: null, columnIndex: null, value: undefined}
}

function uniqueRowIds(ids: readonly TableRowId[]): TableRowId[] {
  const out: TableRowId[] = []
  for (const id of ids) if (!out.includes(id)) out.push(id)
  return out
}

function tableRangeRowIds(rowIds: readonly TableRowId[], from: TableRowId, to: TableRowId): TableRowId[] {
  const a = rowIds.indexOf(from)
  const b = rowIds.indexOf(to)
  if (a < 0 || b < 0) return []
  const start = Math.min(a, b)
  const end = Math.max(a, b)
  return rowIds.slice(start, end + 1)
}

function defaultCellText(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  return JSON.stringify(value)
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
