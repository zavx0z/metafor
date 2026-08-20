import {
  div,
  blenderRgba8ToColor,
  flexColumn,
  flexRow,
  resolveWidgetColors,
  uiShapeMetrics,
  Z,
  type ButtonElementAppearance,
  type BlenderWidgetClass,
  type CssColor,
  type GroupedCellAppearance,
  type StyleProps,
  type UiSurface,
} from "@ui/elements"

export type ControlGroupContext = Readonly<{
  cellStyle: Readonly<StyleProps>
  buttonAppearance: ButtonElementAppearance
  textColor: CssColor
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
  groupedCell: GroupedCellAppearance
  inputAppearance: GroupedCellAppearance
}>

export type ControlGroupAppearance = "text" | "number" | "pointer"

export type ControlGroupProps = Readonly<{
  rows?: number
  columns?: number | readonly ControlGroupTrack[]
  appearance?: ControlGroupAppearance
  disabled?: boolean
  children?(context: ControlGroupContext): void
}>

export type ControlGroupTrack = number | "grow" | `${number}fr`

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
  const columnTracks = controlGroupTracks(props.columns)
  const columns = columnTracks.length
  const appearance = props.appearance ?? "pointer"
  const widgetClass = controlGroupWidgetClass(appearance)
  const colors = resolveWidgetColors(widgetClass, {disabled: props.disabled === true})
  const fill = blenderRgba8ToColor(colors.inner)
  const outline = blenderRgba8ToColor(colors.outline)

  div(surface, x, y, width, height, {
    style: {
      background: fill,
      borderColor: null,
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: 0,
      zIndex: Z.CONTAINER,
    },
  })

  props.children?.(controlGroupContext(
    rows,
    columns,
    controlGroupButtonAppearance(appearance),
    blenderRgba8ToColor(colors.text),
  ))

  drawControlGroupRowRules(surface, x, y, width, height, rows, outline)
  drawControlGroupColumnRules(surface, x, y, width, height, columnTracks, outline)

  div(surface, x, y, width, height, {
    style: {
      background: null,
      borderColor: outline,
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT_RULE,
    },
  })
}

function controlGroupContext(
  rows: number,
  columns: number,
  buttonAppearance: ButtonElementAppearance,
  textColor: CssColor,
): ControlGroupContext {
  return Object.freeze({
    cellStyle: controlGroupCellStyle,
    buttonAppearance,
    textColor,
    cell(row, column, contact = {}) {
      const top = contact.top ?? true
      const right = contact.right ?? true
      const bottom = contact.bottom ?? true
      const left = contact.left ?? true
      const groupedCell: GroupedCellAppearance = Object.freeze({
        kind: "grouped-cell",
        corners: Object.freeze({
          topLeft: top && left && row === 0 && column === 0,
          topRight: top && right && row === 0 && column === columns - 1,
          bottomLeft: bottom && left && row === rows - 1 && column === 0,
          bottomRight: bottom && right && row === rows - 1 && column === columns - 1,
        }),
      })
      return Object.freeze({
        cellStyle: controlGroupCellStyle,
        groupedCell,
        inputAppearance: groupedCell,
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
  color: ReturnType<typeof blenderRgba8ToColor>,
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
          color,
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
  columns: readonly ControlGroupTrack[],
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: 0,
    items: columns.map((track, index) => ({
      width: track,
      height,
      draw: (columnX, _columnY, columnWidth) => {
        if (index < columns.length - 1) drawControlGroupRule(
          surface,
          columnX + columnWidth - uiShapeMetrics.separatorWidth / 2,
          y,
          uiShapeMetrics.separatorWidth,
          height,
          color,
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
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  div(surface, x, y, width, height, {
    style: {
      background: color,
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

function controlGroupTracks(value: number | readonly ControlGroupTrack[] | undefined): readonly ControlGroupTrack[] {
  if (Array.isArray(value)) return value.length === 0 ? ["1fr"] : [...value]
  return Array.from({length: controlGroupCount(value as number | undefined)}, () => "1fr" as const)
}

function controlGroupWidgetClass(appearance: ControlGroupAppearance): BlenderWidgetClass {
  if (appearance === "text") return "text"
  if (appearance === "number") return "number"
  return "regular"
}

function controlGroupButtonAppearance(appearance: ControlGroupAppearance): ButtonElementAppearance {
  if (appearance === "text") return "text"
  if (appearance === "number") return "number"
  return "regular"
}
