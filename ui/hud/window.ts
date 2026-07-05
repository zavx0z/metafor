import {Color} from "@metafor/engine"
import {IconButton, type ButtonVariant} from "@ui/components"
import {Z, flexColumn, flexRow, palette, radii, uiIcons, type Tone, type UiSurface, type UiSurfaceRect} from "@ui/elements"

export type HudWindowTitleBarAction = {
  label: string
  iconSrc?: string
  tooltip?: string
  tone?: Tone
  active?: boolean
  disabled?: boolean
  dividerAfter?: boolean
  action?: () => void
  onHover?: () => void
  onLeave?: () => void
  render?: (rect: {x: number; y: number; w: number; h: number}) => void
  width?: number
}

export type HudWindowTitleBarProps = {
  title: string
  subtitle?: string
  onMinimize?: () => void
  minimizeLabel?: string
  leftActions?: readonly HudWindowTitleBarAction[]
  rightActions?: readonly HudWindowTitleBarAction[]
  height?: number
  insetX?: number
  buttonSize?: number
  buttonGap?: number
  ruleInsetX?: number
  ruleColor?: Color | null
  titleFontPx?: number
  subtitleFontPx?: number
  z?: number
}

export type HudWindowProps = HudWindowTitleBarProps & {
  active?: boolean
  fill?: Color | null
  border?: Color | null
  borderWidth?: number
  radius?: number
  frameZ?: number
  bodyInsetX?: number
  bodyTopGap?: number
  bodyBottomInset?: number
}

export function HudWindow(host: UiSurface, x: number, y: number, w: number, h: number, props: HudWindowProps): UiSurfaceRect {
  const headerH = props.height ?? 36
  const bodyInsetX = props.bodyInsetX ?? 8
  const bodyTopGap = props.bodyTopGap ?? 6
  const bodyBottomInset = props.bodyBottomInset ?? 6
  const border = props.border ?? (props.active === true ? palette.windowActiveBorder : palette.borderDim)
  host.drawRoundedRect(x, y, w, h, {
    radius: props.radius ?? radii.pane,
    fill: props.fill ?? palette.bgPanelDim,
    border,
    borderWidth: props.borderWidth ?? (border === null ? 0 : 1),
    z: props.frameZ ?? Z.CONTAINER,
  })

  const body = {x: x + bodyInsetX, y: y + headerH + bodyTopGap, w: Math.max(1, w - bodyInsetX * 2), h: Math.max(1, h - headerH - bodyTopGap - bodyBottomInset)}
  HudWindowTitleBar(host, x, y, w, props)
  flexColumn({
    x,
    y,
    w,
    h,
    paddingLeft: bodyInsetX,
    paddingRight: bodyInsetX,
    paddingBottom: bodyBottomInset,
    items: [
      {height: headerH, draw: () => {}},
      bodyTopGap > 0 && {height: bodyTopGap, draw: () => {}},
      {height: "grow", draw: (slotX, slotY, slotW, slotH) => {
        body.x = slotX
        body.y = slotY
        body.w = Math.max(1, slotW)
        body.h = Math.max(1, slotH)
      }},
    ],
  })
  return body
}

export function HudWindowTitleBar(host: UiSurface, x: number, y: number, w: number, props: HudWindowTitleBarProps): void {
  const h = props.height ?? 36
  const insetX = props.insetX ?? 16
  const buttonSize = props.buttonSize ?? 22
  const buttonGap = props.buttonGap ?? 5
  const z = props.z ?? Z.TEXT
  const leftActions = props.leftActions ?? []
  const rightActions = props.rightActions ?? []
  const leftActionsW = (props.onMinimize === undefined ? 0 : buttonSize + (leftActions.length > 0 ? buttonGap : 0))
    + titleBarActionsWidth(leftActions, buttonSize, buttonGap)
  const rightActionsW = titleBarActionsWidth(rightActions, buttonSize, buttonGap)
  const sideW = Math.max(leftActionsW, rightActionsW)
  let titleRect = {x: x + insetX + sideW, y, w: Math.max(1, w - insetX * 2 - sideW * 2), h}
  flexRow({
    x,
    y,
    w,
    h,
    paddingLeft: insetX,
    paddingRight: insetX,
    alignItems: "center",
    items: [
      {width: sideW, height: h, draw: (slotX, slotY, _slotW, slotH) => {
        let left = slotX
        const buttonY = slotY + Math.max(0, (slotH - buttonSize) / 2)
        if (props.onMinimize !== undefined) {
          IconButton(host, left, buttonY, buttonSize, buttonSize, {
            label: props.minimizeLabel ?? "Свернуть",
            iconSrc: uiIcons.minus,
            variant: "text",
            radius: 7,
            action: props.onMinimize,
          })
          left += buttonSize + buttonGap
        }
        drawTitleBarActions(host, leftActions, left, buttonY, buttonSize, buttonGap)
      }},
      {width: "grow", height: h, draw: (slotX, slotY, slotW, slotH) => { titleRect = {x: slotX, y: slotY, w: Math.max(1, slotW), h: slotH} }},
      {width: sideW, height: h, draw: (slotX, slotY, slotW, slotH) => {
        const buttonY = slotY + Math.max(0, (slotH - buttonSize) / 2)
        drawTitleBarActions(host, rightActions, slotX + Math.max(0, slotW - rightActionsW), buttonY, buttonSize, buttonGap)
      }},
    ],
  })

  const titleCenterX = titleRect.x + titleRect.w / 2
  const titleMaxW = Math.max(1, titleRect.w - buttonGap * 2)
  const titleFontPx = props.titleFontPx ?? 12
  const subtitleFontPx = props.subtitleFontPx ?? 10
  host.drawTextCentered(props.title, titleCenterX, y + (props.subtitle === undefined || props.subtitle.length === 0 ? 12 : 10), {
    fontPx: titleFontPx,
    material: host.materials.cyan,
    maxWidthPx: titleMaxW,
    z,
  })
  if (props.subtitle !== undefined && props.subtitle.length > 0) {
    host.drawTextCentered(props.subtitle, titleCenterX, y + 24, {
      fontPx: subtitleFontPx,
      material: host.materials.muted,
      maxWidthPx: titleMaxW,
      z,
    })
  }

  const ruleColor = props.ruleColor ?? palette.borderDim
  if (ruleColor !== null) {
    const ruleInset = props.ruleInsetX ?? 8
    host.drawRect(x + ruleInset, y + h, Math.max(1, w - ruleInset * 2), 1, ruleColor, Z.SEPARATOR)
  }
}

function drawTitleBarActions(host: UiSurface, actions: readonly HudWindowTitleBarAction[], x: number, y: number, buttonSize: number, gap: number): number {
  let cursor = x
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!
    const width = action.width ?? buttonSize
    if (action.render !== undefined) {
      action.render({x: cursor, y, w: width, h: buttonSize})
    } else if (action.iconSrc !== undefined) {
      const variant: ButtonVariant = action.active === true ? "contained" : "text"
      IconButton(host, cursor, y, width, buttonSize, {
        label: action.label,
        iconSrc: action.iconSrc,
        tooltip: action.tooltip ?? action.label,
        tone: action.tone ?? "neutral",
        ...(action.disabled === undefined ? {} : {disabled: action.disabled}),
        variant,
        radius: 7,
        action: action.action ?? (() => {}),
        ...(action.onHover === undefined ? {} : {onHover: action.onHover}),
        ...(action.onLeave === undefined ? {} : {onLeave: action.onLeave}),
      })
    }
    cursor += width
    if (action.dividerAfter === true && i < actions.length - 1) {
      cursor += gap
      host.drawRect(cursor, y + 5, 1, Math.max(1, buttonSize - 10), palette.borderDim, Z.SEPARATOR)
      cursor += 1 + gap
    } else if (i < actions.length - 1) {
      cursor += gap
    }
  }
  return cursor
}

function titleBarActionsWidth(actions: readonly HudWindowTitleBarAction[], buttonSize: number, gap: number): number {
  let width = 0
  for (let i = 0; i < actions.length; i++) {
    width += actions[i]?.width ?? buttonSize
    if (actions[i]?.dividerAfter === true && i < actions.length - 1) width += gap * 2 + 1
    else if (i < actions.length - 1) width += gap
  }
  return width
}
