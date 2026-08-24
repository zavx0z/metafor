import {Color} from "@metafor/engine"
import {Z, drawIconCentered, type DrawTextOpts, type HitState, type UiSurface} from "@ui/elements"
import {
  moveHudSideTabFrame,
  nearestHudViewportEdge,
  type HudPaneFrameChange,
  type HudViewportEdge,
} from "./pane-frame.ts"

export * from "./window.ts"
export * from "./pane-frame.ts"
export * from "./timeline.ts"

export type HudPoint = {x: number; y: number}
export type HudRect = {x: number; y: number; w: number; h: number}
export type HudQuad = {
  topLeft: HudPoint
  topRight: HudPoint
  bottomRight: HudPoint
  bottomLeft: HudPoint
}

export type HudVisualState = HitState

export const hudColors = {
  cyan: new Color(0.36, 0.94, 1, 0.92),
  cyanDim: new Color(0.20, 0.68, 0.96, 0.48),
  cyanGlow: new Color(0.08, 0.52, 1, 0.24),
  hot: new Color(0.88, 1, 1, 0.88),
} as const

export type HudTargetReticleProps = {
  quad: HudQuad
  strength?: number
  segmentPx?: number
  markPx?: number
  z?: number
}

export type HudCornerButtonProps = {
  rect: HudRect
  key?: string
  label?: string
  anchor?: HudPoint
  onClick?: () => void
  strength?: number
  z?: number
}

export type HudReturnDockProps = {
  island: HudRect
  button: HudRect
  expanded: boolean
  dockKey?: string
  buttonKey?: string
  onDockClick?: () => void
  onReturnClick?: () => void
  z?: number
}

export type HudSideTabEdge = HudViewportEdge
export type HudSideTabTone = "neutral" | "active" | "warning" | "danger"

export type HudSideTabProps = {
  rect: HudRect
  key?: string
  edge?: HudSideTabEdge
  icon?: string
  label?: string
  tone?: HudSideTabTone
  indicatorColor?: Color | null
  tooltip?: string
  tooltipDelayMs?: number
  movable?: boolean
  onFrameRectChange?: (change: HudPaneFrameChange) => void
  onClick?: () => void
  z?: number
}

const DEFAULT_Z = Z.TEXT + 0.24

export function HudTargetReticle(host: UiSurface, props: HudTargetReticleProps): void {
  const z = props.z ?? DEFAULT_Z
  const strength = props.strength ?? 1
  const size = Math.max(edgeLength(props.quad.topLeft, props.quad.topRight), edgeLength(props.quad.topRight, props.quad.bottomRight))
  const segment = props.segmentPx ?? clamp(size * 0.105, 30, 92)
  const mark = props.markPx ?? clamp(size * 0.04, 16, 38)
  drawCorner(host, props.quad.topLeft, props.quad.topRight, props.quad.bottomLeft, segment, strength, z)
  drawCorner(host, props.quad.topRight, props.quad.topLeft, props.quad.bottomRight, segment, strength, z)
  drawCorner(host, props.quad.bottomRight, props.quad.bottomLeft, props.quad.topRight, segment, strength, z)
  drawCorner(host, props.quad.bottomLeft, props.quad.bottomRight, props.quad.topLeft, segment, strength, z)
  drawSideMark(host, props.quad.topLeft, props.quad.topRight, mark, strength, z)
  drawSideMark(host, props.quad.topRight, props.quad.bottomRight, mark, strength, z)
  drawSideMark(host, props.quad.bottomRight, props.quad.bottomLeft, mark, strength, z)
  drawSideMark(host, props.quad.bottomLeft, props.quad.topLeft, mark, strength, z)
}

export function HudCornerButton(host: UiSurface, props: HudCornerButtonProps): HudVisualState {
  const key = props.key ?? `hud-corner:${props.rect.x}:${props.rect.y}:${props.rect.w}:${props.rect.h}`
  const state = host.hitState(props.rect.x, props.rect.y, props.rect.w, props.rect.h, key)
  const z = props.z ?? DEFAULT_Z
  const strength = (props.strength ?? 0.78) * (state.pressed ? 1.2 : state.hovered ? 1.05 : 1)
  host.hit(props.rect.x, props.rect.y, props.rect.w, props.rect.h, props.onClick ?? (() => {}), {
    key,
    cursor: "pointer",
    activeCursor: "pointer",
  })
  if (props.anchor !== undefined) {
    drawLockLine(host, props.anchor, {x: props.rect.x + props.rect.w / 2, y: props.rect.y + props.rect.h / 2}, fade(hudColors.cyanDim, 0.62 * strength), 1.15, z)
  }
  drawFrameCorners(host, props.rect, strength, z)
  if (props.label !== undefined && props.label.length > 0) {
    host.drawTextCentered(props.label, props.rect.x + props.rect.w / 2, props.rect.y + props.rect.h / 2 + 1, {
      fontPx: clamp(props.rect.h * 0.43, 14, 19),
      material: host.materials.cyan,
      maxWidthPx: props.rect.w - 8,
      z: z + 0.1,
      clip: false,
    })
  }
  return state
}

export function HudReturnDock(host: UiSurface, props: HudReturnDockProps): {dock: HudVisualState; button: HudVisualState} {
  const dockKey = props.dockKey ?? `hud-return-dock:${props.island.x}:${props.island.y}`
  const buttonKey = props.buttonKey ?? `hud-return-button:${props.button.x}:${props.button.y}`
  const dock = host.hitState(props.island.x, props.island.y, props.island.w, props.island.h, dockKey)
  const button = host.hitState(props.button.x, props.button.y, props.button.w, props.button.h, buttonKey)
  const z = props.z ?? DEFAULT_Z
  host.hit(props.island.x, props.island.y, props.island.w, props.island.h, props.onDockClick ?? (() => {}), {
    key: dockKey,
    cursor: "pointer",
    activeCursor: "pointer",
  })
  const islandStrength = props.expanded ? 1 : 0.62
  host.drawRoundedRect(props.island.x, props.island.y, props.island.w, props.island.h, {
    radius: props.island.h / 2,
    fill: fade(hudColors.cyanGlow, 0.4 * islandStrength),
    border: fade(hudColors.cyanDim, 0.95 * islandStrength),
    borderWidth: 1.2,
    z,
  })
  drawLockLine(
    host,
    {x: props.island.x + props.island.w * 0.32, y: props.island.y + props.island.h / 2},
    {x: props.island.x + props.island.w * 0.68, y: props.island.y + props.island.h / 2},
    fade(hudColors.hot, 0.62 * islandStrength),
    1.6,
    z + 0.04,
  )
  if (props.expanded) {
    host.hit(props.button.x, props.button.y, props.button.w, props.button.h, props.onReturnClick ?? (() => {}), {
      key: buttonKey,
      cursor: "pointer",
      activeCursor: "pointer",
    })
    const strength = button.pressed ? 1.18 : button.hovered ? 1 : 0.82
    drawLockLine(
      host,
      {x: props.button.x + props.button.w / 2, y: props.button.y + props.button.h},
      {x: props.island.x + props.island.w / 2, y: props.island.y},
      fade(hudColors.cyanDim, 0.58 * strength),
      1.1,
      z + 0.02,
    )
    drawFrameCorners(host, props.button, strength, z)
    drawReturnArrow(host, {x: props.button.x + props.button.w / 2, y: props.button.y + props.button.h / 2}, props.button.w, strength, z)
  }
  return {dock, button}
}

export function HudSideTab(host: UiSurface, props: HudSideTabProps): HudVisualState {
  const key = props.key ?? `hud-side-tab:${props.rect.x}:${props.rect.y}:${props.rect.w}:${props.rect.h}`
  const state = host.hitState(props.rect.x, props.rect.y, props.rect.w, props.rect.h, key)
  const z = props.z ?? DEFAULT_Z
  const surfaceFrame = props.movable === true ? host.surfaceFrame() : null
  const preferredEdge = props.edge ?? "left"
  const edge = surfaceFrame === null || surfaceFrame === undefined
    ? preferredEdge
    : nearestHudViewportEdge(surfaceFrame.rect, surfaceFrame.bounds, preferredEdge)
  const tone = props.tone ?? "neutral"
  const active = state.pressed
  const hovered = state.hovered
  const strength = active ? 1.08 : hovered ? 1 : 0.78
  const accent = sideTabAccent(tone, strength)
  const fill = sideTabFill(active, hovered)
  const vertical = edge === "left" || edge === "right"
  const outerRadius = clamp(Math.min(props.rect.w, props.rect.h) * 0.48, 8, 15)
  const radius = sideTabRadius(edge, outerRadius)
  const pressX = active ? (edge === "left" ? 1 : edge === "right" ? -1 : 0) : 0
  const pressY = active ? (edge === "top" ? 1 : edge === "bottom" ? -1 : 0) : 0
  const tabX = props.rect.x + pressX
  const tabY = props.rect.y + pressY
  const contentPad = vertical
    ? Math.min(8, Math.max(5, props.rect.w * 0.22))
    : Math.min(8, Math.max(5, props.rect.h * 0.2))
  const iconSize = props.icon === undefined || props.icon.length === 0
    ? 0
    : vertical
      ? Math.min(16, Math.max(11, props.rect.w * 0.5))
      : Math.min(16, Math.max(11, props.rect.h * 0.46))
  const label = props.label ?? ""
  const labelFontPx = vertical ? clamp(props.rect.w * 0.3, 9, 11) : clamp(props.rect.h * 0.3, 9, 11)
  const reservedGap = iconSize > 0 && label.length > 0 ? 5 : 0
  const labelW = vertical
    ? Math.max(1, props.rect.h - contentPad * 2 - iconSize - reservedGap)
    : Math.max(1, props.rect.w - contentPad * 2 - iconSize - reservedGap)
  const measuredLabelW = label.length > 0 ? Math.min(labelW, host.measureText(label, labelFontPx)) : 0
  const gap = iconSize > 0 && measuredLabelW > 0 ? reservedGap : 0
  const centeredSpan = iconSize + gap + measuredLabelW
  const groupStart = vertical
    ? tabY + Math.max(contentPad, (props.rect.h - centeredSpan) / 2)
    : tabX + Math.max(contentPad, (props.rect.w - centeredSpan) / 2)
  const iconCx = vertical
    ? tabX + props.rect.w / 2
    : groupStart + iconSize / 2
  const iconCy = vertical ? groupStart + iconSize / 2 : tabY + props.rect.h / 2
  const labelX = vertical
    ? tabX + props.rect.w / 2 - labelFontPx / 2
    : groupStart + iconSize + gap
  const labelY = vertical
    ? groupStart + iconSize + gap
    : tabY + props.rect.h / 2 - labelFontPx / 2 - 1

  host.drawRoundedRect(tabX, tabY, props.rect.w, props.rect.h, {
    radius,
    fill,
    border: accent,
    borderWidth: 1,
    opacity: 0.92,
    z,
  })
  drawSideTabFlatEdge(host, edge, {x: tabX, y: tabY, w: props.rect.w, h: props.rect.h}, fill, z + 0.02)
  if (props.icon !== undefined && props.icon.length > 0) {
    drawIconCentered(host, props.icon, iconCx, iconCy, iconSize, {opacity: hovered ? 0.92 : 0.76, z: z + 0.16})
  }
  if (label.length > 0) {
    const textOpts: DrawTextOpts = {
      fontPx: labelFontPx,
      material: tone === "danger" ? host.materials.red : host.materials.text,
      maxWidthPx: labelW,
      z: z + 0.17,
      clip: false,
    }
    if (vertical) textOpts.rotationRad = Math.PI / 2
    host.drawText(label, labelX, labelY, textOpts)
  }
  if (props.indicatorColor !== undefined && props.indicatorColor !== null) {
    const indicator = sideTabIndicatorRect(edge, {x: tabX, y: tabY, w: props.rect.w, h: props.rect.h})
    host.drawRoundedRect(indicator.x, indicator.y, indicator.w, indicator.h, {
      radius: 2.5,
      fill: props.indicatorColor,
      border: fade(hudColors.hot, 0.18),
      borderWidth: 1,
      z: z + 0.18,
    })
  }

  let drag: Readonly<{
    startClientX: number
    startClientY: number
    startRect: HudRect
    startEdge: HudSideTabEdge
  }> | null = null
  let moved = false
  const hitOptions = {
    key,
    cursor: props.movable === true ? "grab" : "pointer",
    activeCursor: props.movable === true ? "grabbing" : "pointer",
    ...(props.movable !== true ? {} : {
      onPointerDown: (_localX: number, _localY: number, event?: MouseEvent) => {
        const frame = host.surfaceFrame()
        if (frame === null || frame === undefined || event === undefined) return
        drag = {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startRect: frame.rect,
          startEdge: nearestHudViewportEdge(frame.rect, frame.bounds, preferredEdge),
        }
        moved = false
        event.preventDefault()
      },
      onPointerMove: (_localX: number, _localY: number, event?: MouseEvent) => {
        const frame = host.surfaceFrame()
        if (drag === null || frame === null || frame === undefined || event === undefined) return
        const dx = event.clientX - drag.startClientX
        const dy = event.clientY - drag.startClientY
        if (Math.abs(dx) + Math.abs(dy) >= 1) moved = true
        const next = moveHudSideTabFrame(drag.startRect, dx, dy, frame.bounds, drag.startEdge)
        host.setSurfaceFrame(next.rect)
        props.onFrameRectChange?.({rect: next.rect, phase: "change"})
      },
      onPointerUp: (event?: MouseEvent) => {
        const frame = host.surfaceFrame()
        if (drag === null || frame === null || frame === undefined || event === undefined) return
        const next = moveHudSideTabFrame(
          drag.startRect,
          event.clientX - drag.startClientX,
          event.clientY - drag.startClientY,
          frame.bounds,
          drag.startEdge,
        )
        host.setSurfaceFrame(next.rect)
        props.onFrameRectChange?.({rect: next.rect, phase: "end"})
        drag = null
      },
    }),
  }
  const click = () => {
    if (!moved) props.onClick?.()
  }
  if (props.tooltip !== undefined && props.tooltip.length > 0) {
    host.hit(props.rect.x, props.rect.y, props.rect.w, props.rect.h, click, {
      ...hitOptions,
      tooltip: {label: props.tooltip, delayMs: props.tooltipDelayMs ?? 450},
    })
    const tooltipOptions: {delayMs?: number} = {}
    if (props.tooltipDelayMs !== undefined) tooltipOptions.delayMs = props.tooltipDelayMs
    host.drawTooltipForHit(props.rect.x, props.rect.y, props.rect.w, props.rect.h, props.tooltip, tooltipOptions)
  } else {
    host.hit(props.rect.x, props.rect.y, props.rect.w, props.rect.h, click, hitOptions)
  }

  return state
}

function drawCorner(host: UiSurface, corner: HudPoint, edgeA: HudPoint, edgeB: HudPoint, length: number, strength: number, z: number): void {
  const hotLength = length * 0.46
  drawLockLine(host, corner, pointAlong(corner, edgeA, length), fade(hudColors.cyanDim, strength), 3.4, z)
  drawLockLine(host, corner, pointAlong(corner, edgeB, length), fade(hudColors.cyanDim, strength), 3.4, z)
  drawLockLine(host, corner, pointAlong(corner, edgeA, hotLength), fade(hudColors.hot, strength), 1.25, z + 0.03)
  drawLockLine(host, corner, pointAlong(corner, edgeB, hotLength), fade(hudColors.hot, strength), 1.25, z + 0.03)
}

function drawSideMark(host: UiSurface, a: HudPoint, b: HudPoint, length: number, strength: number, z: number): void {
  const center = lerpPoint(a, b, 0.5)
  drawLockLine(host, pointAlong(center, a, length / 2), pointAlong(center, b, length / 2), fade(hudColors.cyan, 0.54 * strength), 1.4, z + 0.01)
}

function drawFrameCorners(host: UiSurface, rect: HudRect, strength: number, z: number): void {
  const x0 = rect.x
  const y0 = rect.y
  const x1 = rect.x + rect.w
  const y1 = rect.y + rect.h
  const segment = clamp(Math.min(rect.w, rect.h) * 0.28, 9, 14)
  const color = fade(hudColors.hot, 0.92 * strength)
  const dim = fade(hudColors.cyanDim, 0.8 * strength)
  drawLockLine(host, {x: x0, y: y0 + segment}, {x: x0, y: y0}, dim, 2.4, z + 0.04)
  drawLockLine(host, {x: x0, y: y0}, {x: x0 + segment, y: y0}, color, 1.55, z + 0.08)
  drawLockLine(host, {x: x1 - segment, y: y0}, {x: x1, y: y0}, dim, 2.4, z + 0.04)
  drawLockLine(host, {x: x1, y: y0}, {x: x1, y: y0 + segment}, color, 1.55, z + 0.08)
  drawLockLine(host, {x: x1, y: y1 - segment}, {x: x1, y: y1}, dim, 2.4, z + 0.04)
  drawLockLine(host, {x: x1, y: y1}, {x: x1 - segment, y: y1}, color, 1.55, z + 0.08)
  drawLockLine(host, {x: x0 + segment, y: y1}, {x: x0, y: y1}, dim, 2.4, z + 0.04)
  drawLockLine(host, {x: x0, y: y1}, {x: x0, y: y1 - segment}, color, 1.55, z + 0.08)
}

function drawReturnArrow(host: UiSurface, center: HudPoint, size: number, strength: number, z: number): void {
  const left = center.x - size * 0.14
  const right = center.x + size * 0.16
  const top = center.y - size * 0.14
  const midY = center.y + size * 0.03
  const bottom = center.y + size * 0.18
  const color = fade(hudColors.hot, 0.9 * strength)
  drawLockLine(host, {x: right, y: top}, {x: left, y: midY}, color, 1.8, z + 0.1)
  drawLockLine(host, {x: left, y: midY}, {x: right, y: bottom}, color, 1.8, z + 0.1)
  drawLockLine(host, {x: left, y: midY}, {x: center.x + size * 0.24, y: midY}, fade(hudColors.cyan, 0.7 * strength), 1.25, z + 0.08)
}

function drawLockLine(host: UiSurface, a: HudPoint, b: HudPoint, color: Color, thickness: number, z: number): void {
  host.drawRoundedLine(a.x, a.y, b.x, b.y, fade(hudColors.cyanGlow, 0.55), thickness + 3.2, z - 0.02)
  host.drawRoundedLine(a.x, a.y, b.x, b.y, color, thickness, z)
}

function edgeLength(a: HudPoint, b: HudPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointAlong(a: HudPoint, b: HudPoint, distance: number): HudPoint {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length <= 0) return a
  return lerpPoint(a, b, clamp(distance / length, 0, 1))
}

function lerpPoint(a: HudPoint, b: HudPoint, t: number): HudPoint {
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t}
}

function fade(color: Color, opacity: number): Color {
  return new Color(color.r, color.g, color.b, clamp(color.a * opacity, 0, 1))
}

function sideTabFill(active: boolean, hovered: boolean): Color {
  if (active) return new Color(0.13, 0.15, 0.18, 0.94)
  if (hovered) return new Color(0.10, 0.12, 0.15, 0.92)
  return new Color(0.07, 0.08, 0.10, 0.86)
}

function sideTabAccent(tone: HudSideTabTone, strength: number): Color {
  if (tone === "active") return new Color(0.72, 0.86, 0.96, clamp(0.36 * strength, 0, 0.52))
  if (tone === "warning") return new Color(1.0, 0.78, 0.52, clamp(0.30 * strength, 0, 0.46))
  if (tone === "danger") return new Color(1.0, 0.48, 0.42, clamp(0.34 * strength, 0, 0.5))
  return new Color(0.90, 0.94, 1.0, clamp(0.22 * strength, 0, 0.34))
}

function sideTabRadius(edge: HudSideTabEdge, radius: number): {tl: number; tr: number; br: number; bl: number} {
  if (edge === "left") return {tl: 0, tr: radius, br: radius, bl: 0}
  if (edge === "right") return {tl: radius, tr: 0, br: 0, bl: radius}
  if (edge === "top") return {tl: 0, tr: 0, br: radius, bl: radius}
  return {tl: radius, tr: radius, br: 0, bl: 0}
}

function drawSideTabFlatEdge(host: UiSurface, edge: HudSideTabEdge, rect: HudRect, fill: Color, z: number): void {
  if (edge === "left") {
    host.drawRect(rect.x, rect.y + 1, 2, Math.max(1, rect.h - 2), fill, z)
    return
  }
  if (edge === "right") {
    host.drawRect(rect.x + rect.w - 2, rect.y + 1, 2, Math.max(1, rect.h - 2), fill, z)
    return
  }
  if (edge === "top") {
    host.drawRect(rect.x + 1, rect.y, Math.max(1, rect.w - 2), 2, fill, z)
    return
  }
  host.drawRect(rect.x + 1, rect.y + rect.h - 2, Math.max(1, rect.w - 2), 2, fill, z)
}

function sideTabIndicatorRect(edge: HudSideTabEdge, rect: HudRect): HudRect {
  if (edge === "left") return {x: rect.x + rect.w - 10, y: rect.y + rect.h - 15, w: 5, h: 5}
  if (edge === "right") return {x: rect.x + 4, y: rect.y + rect.h - 15, w: 5, h: 5}
  if (edge === "top") return {x: rect.x + rect.w - 15, y: rect.y + rect.h - 10, w: 5, h: 5}
  return {x: rect.x + rect.w - 15, y: rect.y + 4, w: 5, h: 5}
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
