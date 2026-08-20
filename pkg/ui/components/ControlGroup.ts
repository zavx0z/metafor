import {
  div,
  flexColumn,
  flexRow,
  palette,
  uiShapeMetrics,
  Z,
  type InputAppearance,
  type StyleProps,
  type UiSurface,
} from "@ui/elements"

export type ControlGroupContext = Readonly<{
  cellStyle: Readonly<StyleProps>
  cell(row: number, column: number, contact?: ControlGroupCellContact): ControlGroupCellContext
}>

export type ControlGroupCellContact = Readonly<{
  top?: boolean
  right?: boolean
  bottom?: boolean
  left?: boolean
}>

export type ControlGroupCellContext = Readonly<{
  cellStyle: Readonly<StyleProps>
  inputAppearance: InputAppearance
}>

export type ControlGroupProps = Readonly<{
  rows?: number
  columns?: number
  children?(context: ControlGroupContext): void
}>

const controlGroupCellStyle: Readonly<StyleProps> = Object.freeze({
  borderRadius: 0,
  borderWidth: 0,
  fontSize: uiShapeMetrics.compactFontPx,
})

/** Composes one joined control chrome from generic Elements and shared rules. */
export function ControlGroup(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ControlGroupProps = {},
): void {
  if (width <= 0 || height <= 0) return
  const rows = controlGroupCount(props.rows)
  const columns = controlGroupCount(props.columns)

  div(surface, x, y, width, height, {
    style: {
      background: "bgInput",
      borderColor: null,
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: 0,
      zIndex: Z.CONTAINER,
    },
  })

  props.children?.(controlGroupContext(rows, columns))

  drawControlGroupRowRules(surface, x, y, width, height, rows)
  drawControlGroupColumnRules(surface, x, y, width, height, columns)

  div(surface, x, y, width, height, {
    style: {
      background: null,
      borderColor: "borderRule",
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT_RULE,
    },
  })
}

function controlGroupContext(rows: number, columns: number): ControlGroupContext {
  return Object.freeze({
    cellStyle: controlGroupCellStyle,
    cell(row, column, contact = {}) {
      const top = contact.top ?? true
      const right = contact.right ?? true
      const bottom = contact.bottom ?? true
      const left = contact.left ?? true
      return Object.freeze({
        cellStyle: controlGroupCellStyle,
        inputAppearance: Object.freeze({
          kind: "grouped-cell" as const,
          corners: Object.freeze({
            topLeft: top && left && row === 0 && column === 0,
            topRight: top && right && row === 0 && column === columns - 1,
            bottomLeft: bottom && left && row === rows - 1 && column === 0,
            bottomRight: bottom && right && row === rows - 1 && column === columns - 1,
          }),
        }),
      })
    },
  })
}

function drawControlGroupRowRules(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  rows: number,
): void {
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: 0,
    items: Array.from({length: rows}, (_, index) => ({
      height: "1fr" as const,
      draw: (_rowX, rowY, _rowWidth, rowHeight) => {
        if (index < rows - 1) drawControlGroupRule(
          surface,
          x,
          rowY + rowHeight - uiShapeMetrics.separatorWidth / 2,
          width,
          uiShapeMetrics.separatorWidth,
        )
      },
    })),
  })
}

function drawControlGroupColumnRules(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  columns: number,
): void {
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: 0,
    items: Array.from({length: columns}, (_, index) => ({
      width: "1fr" as const,
      height,
      draw: (columnX, _columnY, columnWidth) => {
        if (index < columns - 1) drawControlGroupRule(
          surface,
          columnX + columnWidth - uiShapeMetrics.separatorWidth / 2,
          y,
          uiShapeMetrics.separatorWidth,
          height,
        )
      },
    })),
  })
}

function drawControlGroupRule(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  div(surface, x, y, width, height, {
    style: {
      background: palette.borderRule,
      borderColor: null,
      borderRadius: 0,
      borderWidth: 0,
      zIndex: Z.ELEMENT_RULE,
    },
  })
}

function controlGroupCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.trunc(value!))
}
