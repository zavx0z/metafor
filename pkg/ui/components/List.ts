import {Color, TextMaterial} from "@metafor/engine"
import {
  blenderRgba8ToColor,
  blenderTheme,
  cssColor,
  drawIconCentered,
  li as elementLi,
  resolveWidgetColors,
  span,
  textMaterial,
  ul as elementUl,
  Z,
  type CssColor,
  type LiElementProps,
  type LiElementState,
  type StyleProps,
  type UlElementContext,
  type UlElementProps,
  type UiSurface,
} from "@ui/elements"
import {Divider} from "./Divider.ts"

export type ListDense = boolean
export type ListItemAlignItems = "center" | "flex-start"

export type ListItemTextProps = {
  primary?: string | number
  secondary?: string | number
  children?: string | number
  inset?: boolean
  dense?: boolean
  disabled?: boolean
  primaryColor?: CssColor
  secondaryColor?: CssColor
  sx?: StyleProps
}

export type ListItemIconProps = {
  iconSrc?: string
  children?: string | number
  disabled?: boolean
  color?: CssColor
  sizePx?: number
  sx?: StyleProps
}

export type ListItemProps = {
  key?: string
  primary?: string | number
  secondary?: string | number
  iconSrc?: string
  icon?: string | number
  secondaryAction?: string | number | ((rect: {x: number; y: number; w: number; h: number}) => void)
  selected?: boolean
  disabled?: boolean
  dense?: boolean
  button?: boolean
  divider?: boolean
  disableGutters?: boolean
  inset?: boolean
  alignItems?: ListItemAlignItems
  height?: number
  tooltip?: string
  tooltipDelayMs?: number
  sx?: StyleProps
  onClick?: () => void
}

export type ListProps = {
  items?: readonly ListItemProps[]
  children?: (ctx: UlElementContext) => void
  key?: string
  dense?: boolean
  disablePadding?: boolean
  subheader?: string
  itemHeight?: number
  itemGap?: number
  selectedKey?: string
  sx?: StyleProps
  onItemClick?: (item: ListItemProps, index: number) => void
}

export type ListSubheaderProps = {
  children?: string | number
  inset?: boolean
  sx?: StyleProps
}

export type ListDividerProps = {
  inset?: boolean
  middle?: boolean
  light?: boolean
}

const LIST_ROW_GUTTER_X = 16
const LIST_ICON_SLOT_W = 42
const LIST_SECONDARY_ACTION_W = 76

type ListItemRenderState = LiElementState

export function List(host: UiSurface, x: number, y: number, width: number, height: number, props: ListProps = {}): void {
  const dense = props.dense === true
  const itemHeight = props.itemHeight ?? (dense ? 44 : 56)
  const itemGap = props.itemGap ?? 0
  const paddingY = props.disablePadding === true ? 0 : 8
  const subheaderH = props.subheader === undefined ? 0 : 34
  const items = props.items ?? []
  const contentHeight = listItemsContentHeight(items, itemHeight, itemGap, paddingY + subheaderH, paddingY)

  const listProps: UlElementProps = {
    dense,
    disablePadding: true,
    itemHeight,
    itemGap,
    scrollContentHeight: Math.max(height, contentHeight),
    style: {
      background: null,
      borderColor: null,
      borderRadius: 0,
      padding: 0,
      ...props.sx,
    },
    children: (ctx) => {
      if (props.subheader !== undefined) {
        ListSubheader(host, x, y + paddingY - ctx.scrollTop, width, subheaderH, {children: props.subheader})
      }

      const rowX = x
      const rowW = Math.max(1, width - (ctx.contentHeight > ctx.viewportHeight ? 10 : 0))
      let rowY = y + paddingY + subheaderH - ctx.scrollTop
      for (const [index, item] of items.entries()) {
        const rowH = item.height ?? itemHeight
        if (rowY + rowH < y || rowY > y + height) {
          rowY += rowH + itemGap
          continue
        }
        const selected = item.selected === true || (props.selectedKey !== undefined && item.key === props.selectedKey)
        const onClick = item.onClick ?? (props.onItemClick === undefined ? undefined : () => props.onItemClick?.(item, index))
        const itemProps: ListItemProps = {
          ...item,
          selected,
          dense: item.dense ?? dense,
          height: rowH,
        }
        if (onClick !== undefined) itemProps.onClick = onClick
        if (item.button === true || onClick !== undefined) ListItemButton(host, rowX, rowY, rowW, rowH, itemProps)
        else ListItem(host, rowX, rowY, rowW, rowH, itemProps)
        rowY += rowH + itemGap
      }
      props.children?.(ctx)
    },
  }
  if (props.key !== undefined) listProps.key = props.key
  elementUl(host, x, y, width, height, listProps)
}

export function ListItem(host: UiSurface, x: number, y: number, width: number, height: number, props: ListItemProps = {}): void {
  renderListItem(host, x, y, width, height, {...props, button: false})
}

export function ListItemButton(host: UiSurface, x: number, y: number, width: number, height: number, props: ListItemProps = {}): void {
  renderListItem(host, x, y, width, height, {...props, button: true})
}

export function ListItemText(host: UiSurface, x: number, y: number, width: number, height: number, props: ListItemTextProps = {}): void {
  const primary = String(props.primary ?? props.children ?? "")
  const secondary = props.secondary === undefined ? null : String(props.secondary)
  const dense = props.dense === true
  const primaryPx = dense ? 11 : 12
  const secondaryPx = dense ? 9 : 10
  const disabledColors = resolveWidgetColors("listItem", {disabled: true, listItem: true})
  const primaryColor = props.disabled === true
    ? blenderRgba8ToColor(disabledColors.text)
    : props.primaryColor ?? props.sx?.color ?? blenderRgba8ToColor(blenderTheme.widgets.listItem.text)
  const secondaryColor = props.disabled === true
    ? blenderRgba8ToColor(disabledColors.text)
    : props.secondaryColor ?? withAlpha(blenderRgba8ToColor(blenderTheme.widgets.listItem.text), 0.5)
  const textX = x + (props.inset === true ? LIST_ICON_SLOT_W : 0)
  const textW = Math.max(1, width - (props.inset === true ? LIST_ICON_SLOT_W : 0))

  if (secondary === null || secondary.length === 0) {
    span(host, textX, y, textW, height, {
      children: primary,
      style: {fontSize: primaryPx, color: primaryColor, ...props.sx},
    })
    return
  }

  const totalH = primaryPx + secondaryPx + 8
  const textY = y + Math.max(0, (height - totalH) / 2)
  span(host, textX, textY, textW, primaryPx + 4, {
    children: primary,
    style: {fontSize: primaryPx, color: primaryColor, ...props.sx},
  })
  span(host, textX, textY + primaryPx + 8, textW, secondaryPx + 4, {
    children: secondary,
    style: {fontSize: secondaryPx, color: secondaryColor},
  })
}

export function ListItemIcon(host: UiSurface, x: number, y: number, width: number, height: number, props: ListItemIconProps = {}): void {
  const size = Math.min(props.sizePx ?? 20, Math.max(1, width), Math.max(1, height))
  const cx = x + width / 2
  const cy = y + height / 2
  if (props.iconSrc !== undefined && props.iconSrc.length > 0) {
    drawIconCentered(host, props.iconSrc, cx, cy, size, {
      opacity: 1,
      tint: cssColor(props.disabled === true
        ? blenderRgba8ToColor(resolveWidgetColors("listItem", {disabled: true, listItem: true}).text)
        : props.color ?? blenderRgba8ToColor(blenderTheme.widgets.listItem.text)),
      z: Z.TEXT,
    })
    return
  }
  const label = String(props.children ?? "")
  if (label.length === 0) return
  const material = listTextMaterial(host, props.disabled === true
    ? blenderRgba8ToColor(resolveWidgetColors("listItem", {disabled: true, listItem: true}).text)
    : props.color ?? blenderRgba8ToColor(blenderTheme.widgets.listItem.text))
  host.drawTextCentered(label, cx, cy, {
    fontPx: Math.min(13, size),
    material,
    maxWidthPx: width,
    z: Z.TEXT,
  })
}

export function ListSubheader(host: UiSurface, x: number, y: number, width: number, height: number, props: ListSubheaderProps = {}): void {
  const inset = props.inset === true ? LIST_ROW_GUTTER_X + LIST_ICON_SLOT_W : LIST_ROW_GUTTER_X
  span(host, x + inset, y, Math.max(1, width - inset - LIST_ROW_GUTTER_X), height, {
    children: props.children ?? "",
    style: {
      color: blenderRgba8ToColor(blenderTheme.widgets.listItem.text),
      fontSize: 10,
      textAlign: "left",
      ...props.sx,
    },
  })
}

export function ListDivider(host: UiSurface, x: number, y: number, width: number, props: ListDividerProps = {}): void {
  const inset = props.inset === true ? LIST_ROW_GUTTER_X + LIST_ICON_SLOT_W : props.middle === true ? LIST_ROW_GUTTER_X : 0
  Divider(host, x + inset, y, Math.max(1, width - inset - (props.middle === true ? LIST_ROW_GUTTER_X : 0)), {
    light: props.light ?? true,
  })
}

function renderListItem(host: UiSurface, x: number, y: number, width: number, height: number, props: ListItemProps): void {
  const dense = props.dense === true
  const rowH = props.height ?? height
  const key = props.key ?? `component-list-item:${x}:${y}:${width}:${height}:${String(props.primary ?? "")}`
  const itemProps: LiElementProps = {
    key,
    style: {padding: 0, ...props.sx},
    children: (state) => {
      drawListItemContent(host, x, y, width, rowH, props, state, dense)
      if (props.divider === true) ListDivider(host, x, y + rowH - 1, width, {inset: props.iconSrc !== undefined || props.icon !== undefined})
    },
  }
  if (props.tooltip !== undefined) itemProps.tooltip = props.tooltip
  if (props.tooltipDelayMs !== undefined) itemProps.tooltipDelayMs = props.tooltipDelayMs
  if (props.selected !== undefined) itemProps.selected = props.selected
  if (props.disabled !== undefined) itemProps.disabled = props.disabled
  if (props.disabled !== true) {
    if (props.onClick !== undefined) itemProps.onClick = props.onClick
  }
  elementLi(host, x, y, width, rowH, itemProps)
}

function drawListItemContent(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ListItemProps,
  state: ListItemRenderState,
  dense: boolean,
): void {
  const gutter = props.disableGutters === true ? 0 : LIST_ROW_GUTTER_X
  let cursorX = x + gutter
  const rightPad = props.disableGutters === true ? 0 : LIST_ROW_GUTTER_X
  const actionW = props.secondaryAction === undefined ? 0 : LIST_SECONDARY_ACTION_W
  const iconValue = props.icon ?? undefined
  if (props.iconSrc !== undefined || iconValue !== undefined) {
    const iconProps: ListItemIconProps = {}
    if (props.iconSrc !== undefined) iconProps.iconSrc = props.iconSrc
    if (iconValue !== undefined) iconProps.children = iconValue
    if (props.disabled !== undefined) iconProps.disabled = props.disabled
    iconProps.color = blenderRgba8ToColor(state.colors.text)
    ListItemIcon(host, cursorX, y, LIST_ICON_SLOT_W, height, iconProps)
    cursorX += LIST_ICON_SLOT_W
  } else if (props.inset === true) {
    cursorX += LIST_ICON_SLOT_W
  }

  const textW = Math.max(1, x + width - rightPad - actionW - cursorX)
  const textProps: ListItemTextProps = {
    dense,
    primaryColor: blenderRgba8ToColor(state.colors.text),
    secondaryColor: withAlpha(blenderRgba8ToColor(state.colors.text), 0.5),
  }
  if (props.primary !== undefined) textProps.primary = props.primary
  if (props.secondary !== undefined) textProps.secondary = props.secondary
  if (props.disabled !== undefined) textProps.disabled = props.disabled
  ListItemText(host, cursorX, y, textW, height, textProps)

  if (props.secondaryAction !== undefined) {
    const actionRect = {x: x + width - rightPad - actionW, y, w: actionW, h: height}
    if (typeof props.secondaryAction === "function") {
      props.secondaryAction(actionRect)
    } else {
      const material = listTextMaterial(host, withAlpha(blenderRgba8ToColor(state.colors.text), 0.75))
      host.drawTextCentered(String(props.secondaryAction), actionRect.x + actionRect.w / 2, actionRect.y + actionRect.h / 2, {
        fontPx: dense ? 10 : 11,
        material,
        maxWidthPx: actionRect.w,
        z: Z.TEXT,
      })
    }
  }
}

function listTextMaterial(host: UiSurface, color: CssColor): TextMaterial {
  return textMaterial(host, color)
}

function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}

function listItemsContentHeight(items: readonly ListItemProps[], itemHeight: number, itemGap: number, paddingTop: number, paddingBottom: number): number {
  if (items.length === 0) return paddingTop + paddingBottom
  let total = paddingTop + paddingBottom + itemGap * Math.max(0, items.length - 1)
  for (const item of items) total += item.height ?? itemHeight
  return total
}
