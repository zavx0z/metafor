/** Cross-axis alignment used by UI elements. */
export type FlexAlign = "start" | "center" | "end" | "stretch"
export type FlexJustify = "start" | "center" | "end" | "space-between" | "space-around"

export type FlexBoxBase = {
  x: number
  y: number
  w: number
  h: number
  paddingX?: number
  paddingY?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  gap?: number
  alignItems?: FlexAlign
  justifyContent?: FlexJustify
}

export type FlexMainSize = number | "grow" | `${number}fr`
export type FlexRowItem = {
  width: FlexMainSize
  height: number
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}
export type FlexColumnItem = {
  height: FlexMainSize
  width?: number
  alignSelf?: FlexAlign
  draw(x: number, y: number, width: number, height: number): void
}
export type FlexRowOpts = FlexBoxBase & {items: Array<FlexRowItem | null | undefined | false>}
export type FlexColumnOpts = FlexBoxBase & {items: Array<FlexColumnItem | null | undefined | false>}
