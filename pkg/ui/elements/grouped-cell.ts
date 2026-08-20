import type {UiSurface} from "./surface.ts"
import {Z} from "./surface.ts"
import {backgroundColor, cssColor, px, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"

export type GroupedCellCorners = Readonly<{
  topLeft: boolean
  topRight: boolean
  bottomLeft: boolean
  bottomRight: boolean
}>

export type GroupedCellAppearance = Readonly<{
  kind: "grouped-cell"
  corners: GroupedCellCorners
}>

export function isGroupedCellAppearance(value: unknown): value is GroupedCellAppearance {
  return typeof value === "object" && value !== null &&
    (value as {kind?: unknown}).kind === "grouped-cell"
}

/** One exact SDF cell quad: full caller rect with only true outer corners masked. */
export function drawGroupedCellChrome(
  surface: UiSurface,
  rect: Readonly<{x: number; y: number; width: number; height: number}>,
  style: StyleProps,
  appearance: GroupedCellAppearance,
): void {
  if (rect.width <= 0 || rect.height <= 0) return
  const fill = backgroundColor(style)
  const border = style.borderColor === null || style.borderColor === undefined ? null : cssColor(style.borderColor)
  if (fill === null && border === null) return
  const radius = Math.min(uiShapeMetrics.lowRadius, rect.width / 2, rect.height / 2)
  const corners = appearance.corners
  surface.drawRoundedRect(rect.x, rect.y, rect.width, rect.height, {
    radius: {
      tl: corners.topLeft ? radius : 0,
      tr: corners.topRight ? radius : 0,
      br: corners.bottomRight ? radius : 0,
      bl: corners.bottomLeft ? radius : 0,
    },
    fill,
    border,
    borderWidth: border === null ? 0 : px(style.borderWidth, 0),
    opacity: style.opacity ?? 1,
    z: style.zIndex ?? Z.ELEMENT,
  })
}

export function groupedCellCornerRadii(
  appearance: GroupedCellAppearance | null,
  radius = uiShapeMetrics.lowRadius,
): Readonly<{tl: number; tr: number; br: number; bl: number}> {
  if (appearance === null) return {tl: radius, tr: radius, br: radius, bl: radius}
  return {
    tl: appearance.corners.topLeft ? radius : 0,
    tr: appearance.corners.topRight ? radius : 0,
    br: appearance.corners.bottomRight ? radius : 0,
    bl: appearance.corners.bottomLeft ? radius : 0,
  }
}
