import {Color} from "@metafor/engine"
import type {UiSurfaceRect} from "@ui/elements"

export function hiddenRect(): UiSurfaceRect {
  return {x: -10000, y: -10000, w: 1, h: 1, visible: false}
}

export function pointInUiRect(x: number, y: number, rect: UiSurfaceRect): boolean {
  if (rect.visible === false) return false
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function withAlpha(color: Color, alpha: number): Color {
  return new Color(color.r, color.g, color.b, alpha)
}
