import {Color} from "@metafor/engine"
import {Z, type HitState, type UiSurface} from "@metafor/elements"

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
