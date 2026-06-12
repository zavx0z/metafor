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

export type TableCellContext<Row> = {
  row: Row
  rowIndex: number
  column: TableColumn<Row>
  columnIndex: number
  value: unknown
}

export type TableHeaderContext<Row> = {
  column: TableColumn<Row>
  columnIndex: number
}

export type TableProps<Row> = {
  key?: string
  columns: readonly TableColumn<Row>[]
  rows: readonly Row[]
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
    if (rowIndex % 2 === 1) host.drawRect(x, rowY, Math.max(1, ctx.viewportWidth), rowH, palette.bgPanelDim, TABLE_BODY_BG_Z)
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
  host.drawRect(x, y, headerW, headerH + TABLE_HEADER_EDGE_COVER_PX, palette.bgToolbar, TABLE_HEADER_BACKDROP_Z)
  host.drawRect(x, y, headerW, headerH, palette.bgPanel, TABLE_HEADER_BG_Z)
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
  for (let columnIndex = 0; columnIndex < props.columns.length; columnIndex += 1) {
    const column = props.columns[columnIndex]!
    const w = Math.max(1, column.width)
    const value = tableColumnValue(row, rowIndex, column)
    const cellCtx: TableCellContext<Row> = {row, rowIndex, column, columnIndex, value}
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
}

function tableColumnValue<Row>(row: Row, rowIndex: number, column: TableColumn<Row>): unknown {
  if (column.getValue !== undefined) return column.getValue(row, rowIndex)
  if (row !== null && typeof row === "object" && column.key in row) return (row as Record<string, unknown>)[column.key]
  return undefined
}

function defaultCellText(value: unknown): string {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  return JSON.stringify(value)
}
