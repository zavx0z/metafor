import {div, type DivProps, type DivScrollContext} from "./div.ts"
import {Z, type UiSurface} from "./surface.ts"
import {boxPadding, mergeStyle, px, type ElementChildren, type InteractiveElementProps, type StyleProps} from "./style.ts"

export type UlElementContext = DivScrollContext & {
  x: number
  y: number
  width: number
  height: number
  itemX: number
  itemY: number
  itemWidth: number
  itemHeight: number
  padding: {top: number; right: number; bottom: number; left: number}
}

export type UlElementProps = Omit<InteractiveElementProps, "children"> & {
  children?: (ctx: UlElementContext) => void
  dense?: boolean
  disablePadding?: boolean
  itemHeight?: number
  itemGap?: number
  scrollContentHeight?: number
  style?: StyleProps
}

export type OlElementProps = UlElementProps

export type LiElementState = {
  hovered: boolean
  pressed: boolean
}

export type LiElementChildren = ElementChildren | ((state: LiElementState) => void)

export type LiElementProps = Omit<InteractiveElementProps, "children" | "style"> & {
  children?: LiElementChildren
  style?: StyleProps | ((state: LiElementState) => StyleProps)
}

export function ul(surface: UiSurface, x: number, y: number, width: number, height: number, props: UlElementProps = {}): void {
  const style = mergeStyle(props)
  const padding = props.disablePadding === true ? {top: 0, right: 0, bottom: 0, left: 0} : boxPadding({paddingY: 8, ...style})
  const itemHeight = props.itemHeight ?? (props.dense === true ? 40 : 52)
  const itemGap = props.itemGap ?? px(style.gap, 0)
  const contentHeight = props.scrollContentHeight ?? height
  const divProps: DivProps = {
    scrollContentHeight: contentHeight,
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      padding: 0,
      overflowY: "auto",
      zIndex: Z.CONTAINER,
      ...style,
    },
  }
  if (props.key !== undefined) divProps.key = props.key
  if (props.children !== undefined) {
    divProps.children = (ctx) => {
      props.children?.({
        ...ctx,
        x,
        y,
        width,
        height,
        itemX: x + padding.left,
        itemY: y + padding.top - ctx.scrollTop,
        itemWidth: Math.max(1, width - padding.left - padding.right - (ctx.contentHeight > ctx.viewportHeight ? 10 : 0)),
        itemHeight,
        padding,
      })
    }
  }
  div(surface, x, y, width, height, divProps)
}

export function ol(surface: UiSurface, x: number, y: number, width: number, height: number, props: OlElementProps = {}): void {
  ul(surface, x, y, width, height, props)
}

export function li(surface: UiSurface, x: number, y: number, width: number, height: number, props: LiElementProps = {}): void {
  if (width <= 0 || height <= 0) return
  const key = props.key ?? `li:${x}:${y}:${width}:${height}`
  const hit = surface.hitState(x, y, width, height, key)
  const state: LiElementState = {
    hovered: hit.hovered,
    pressed: hit.pressed,
  }
  const rawStyle = typeof props.style === "function" ? props.style(state) : props.style
  const children = typeof props.children === "function"
    ? () => {
      const render = props.children
      if (typeof render === "function") render(state)
    }
    : props.children
  div(surface, x, y, width, height, {
    key,
    children,
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      padding: 0,
      zIndex: Z.ELEMENT,
      ...rawStyle,
    },
  })

  const interactive =
    props.onClick !== undefined ||
    props.onPointerEnter !== undefined ||
    props.onPointerLeave !== undefined ||
    props.onPointerDown !== undefined ||
    props.onPointerMove !== undefined ||
    props.onPointerUp !== undefined
  if (!interactive) return
  surface.hit(x, y, width, height, props.onClick ?? (() => {}), {
    key,
    cursor: "pointer",
    ...(props.onPointerEnter === undefined ? {} : {onPointerEnter: props.onPointerEnter}),
    ...(props.onPointerLeave === undefined ? {} : {onPointerLeave: props.onPointerLeave}),
    ...(props.onPointerDown === undefined ? {} : {onPointerDown: props.onPointerDown}),
    ...(props.onPointerMove === undefined ? {} : {onPointerMove: props.onPointerMove}),
    ...(props.onPointerUp === undefined ? {} : {onPointerUp: props.onPointerUp}),
  })
}

export function ulContentHeight(count: number, opts: {itemHeight?: number; itemGap?: number; paddingTop?: number; paddingBottom?: number} = {}): number {
  const itemHeight = opts.itemHeight ?? 52
  const itemGap = opts.itemGap ?? 0
  const paddingTop = opts.paddingTop ?? 8
  const paddingBottom = opts.paddingBottom ?? 8
  if (count <= 0) return paddingTop + paddingBottom
  return paddingTop + paddingBottom + count * itemHeight + (count - 1) * itemGap
}

export function liY(index: number, opts: {startY?: number; itemHeight?: number; itemGap?: number} = {}): number {
  return (opts.startY ?? 0) + index * ((opts.itemHeight ?? 52) + (opts.itemGap ?? 0))
}
