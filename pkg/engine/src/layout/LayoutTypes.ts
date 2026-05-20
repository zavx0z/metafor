export type LayoutProps = {
  display?: "flex" | "none"
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse"
  justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly"
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline"
  alignSelf?: "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline"
  width?: number | string
  height?: number | string
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  flex?: number
  flexGrow?: number
  flexShrink?: number
  gap?: number
  padding?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
}

export type ComputedLayout = {
  left: number
  top: number
  width: number
  height: number
}
