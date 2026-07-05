/**
 * Общая геометрия pane chrome.
 *
 * Здесь живут повторяемые отступы header/rule/viewport, чтобы EditorPane,
 * TerminalPane и следующие panes не расходились из-за локальных magic numbers.
 */

import {flexColumn} from "@ui/elements"

export type PaneRect = {
  x: number
  y: number
  w: number
  h: number
}

export type PaneFrameInteractionKind =
  | "move"
  | "resize-left"
  | "resize-right"
  | "resize-top"
  | "resize-bottom"
  | "resize-top-left"
  | "resize-top-right"
  | "resize-bottom-left"
  | "resize-bottom-right"

export type PaneFrameDrag = {
  kind: PaneFrameInteractionKind
  startClientX: number
  startClientY: number
  startRect: PaneRect
  minW: number
  minH: number
}

export type PaneFrameInteractionOpts = {
  showHeader?: boolean
  movable?: boolean
  resizable?: boolean
  headerHeight?: number
  resizeHandlePx?: number
  minW?: number
  minH?: number
}

export const PANE_FRAME = {
  headerHeight: 36,
  headerTextX: 16,
  headerTextY: 11,
  bodyInsetX: 8,
  bodyTopGap: 6,
  bodyBottomInset: 6,
  ruleHeight: 1,
} as const

export function paneHeaderRuleRect(rectW: number, headerHeight = PANE_FRAME.headerHeight, insetX = PANE_FRAME.bodyInsetX): PaneRect {
  return {
    x: insetX,
    y: headerHeight,
    w: Math.max(1, rectW - insetX * 2),
    h: PANE_FRAME.ruleHeight,
  }
}

export function paneBodyRect(
  rectW: number,
  rectH: number,
  opts: {
    headerHeight?: number
    showHeader?: boolean
    insetX?: number
    topGap?: number
    bottomInset?: number
  } = {},
): PaneRect {
  const showHeader = opts.showHeader ?? true
  const insetX = opts.insetX ?? PANE_FRAME.bodyInsetX
  const topGap = opts.topGap ?? PANE_FRAME.bodyTopGap
  const bottomInset = opts.bottomInset ?? PANE_FRAME.bodyBottomInset
  const headerHeight = opts.headerHeight ?? PANE_FRAME.headerHeight
  const y = showHeader ? headerHeight + topGap : 0
  const body = {
    x: insetX,
    y,
    w: Math.max(1, rectW - insetX * 2),
    h: Math.max(1, rectH - y - bottomInset),
  }
  flexColumn({
    x: 0,
    y: 0,
    w: rectW,
    h: rectH,
    paddingLeft: insetX,
    paddingRight: insetX,
    paddingBottom: bottomInset,
    items: [
      showHeader && {height: headerHeight, draw: () => {}},
      showHeader && {height: topGap, draw: () => {}},
      {height: "grow", draw: (x, y, w, h) => {
        body.x = x
        body.y = y
        body.w = Math.max(1, w)
        body.h = Math.max(1, h)
      }},
    ],
  })
  return body
}

export function paneFrameHit(localX: number, localY: number, rectW: number, rectH: number, opts: PaneFrameInteractionOpts = {}): PaneFrameInteractionKind | null {
  if (!(opts.showHeader ?? true)) return null
  const movable = opts.movable ?? false
  const resizable = opts.resizable ?? false
  const headerHeight = opts.headerHeight ?? PANE_FRAME.headerHeight
  const handle = Math.max(1, opts.resizeHandlePx ?? 9)
  const inside = localX >= 0 && localY >= 0 && localX <= rectW && localY <= rectH
  if (!inside) return null
  if (resizable) {
    const left = localX <= handle
    const right = localX >= Math.max(0, rectW - handle)
    const top = localY <= handle
    const bottom = localY >= Math.max(0, rectH - handle)
    if (left && top) return "resize-top-left"
    if (right && top) return "resize-top-right"
    if (left && bottom) return "resize-bottom-left"
    if (right && bottom) return "resize-bottom-right"
    if (left) return "resize-left"
    if (right) return "resize-right"
    if (top) return "resize-top"
    if (bottom) return "resize-bottom"
  }
  if (movable && localY <= headerHeight) return "move"
  return null
}

export function paneFrameCursor(kind: PaneFrameInteractionKind | null, active = false): string | null {
  if (kind === null) return null
  if (kind === "move") return active ? "grabbing" : "grab"
  if (kind === "resize-left" || kind === "resize-right") return "ew-resize"
  if (kind === "resize-top" || kind === "resize-bottom") return "ns-resize"
  if (kind === "resize-top-right" || kind === "resize-bottom-left") return "nesw-resize"
  return "nwse-resize"
}

export function beginPaneFrameDrag(kind: PaneFrameInteractionKind, event: MouseEvent, rect: PaneRect, opts: PaneFrameInteractionOpts = {}): PaneFrameDrag {
  return {
    kind,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startRect: {...rect},
    minW: Math.max(1, opts.minW ?? 240),
    minH: Math.max(1, opts.minH ?? PANE_FRAME.headerHeight + 96),
  }
}

export function paneFrameDragRect(drag: PaneFrameDrag, event: MouseEvent, bounds: {w: number; h: number}): PaneRect {
  const dx = event.clientX - drag.startClientX
  const dy = event.clientY - drag.startClientY
  const bw = Math.max(1, bounds.w)
  const bh = Math.max(1, bounds.h)
  const minW = Math.min(bw, drag.minW)
  const minH = Math.min(bh, drag.minH)
  let x = drag.startRect.x
  let y = drag.startRect.y
  let w = drag.startRect.w
  let h = drag.startRect.h

  if (drag.kind === "move") {
    x = drag.startRect.x + dx
    y = drag.startRect.y + dy
    w = clampNumber(w, 1, bw)
    h = clampNumber(h, 1, bh)
    x = clampNumber(x, 0, Math.max(0, bw - w))
    y = clampNumber(y, 0, Math.max(0, bh - h))
    return {x, y, w, h}
  } else if (paneFrameResizesLeft(drag.kind)) {
    const right = drag.startRect.x + drag.startRect.w
    w = Math.min(Math.max(1, right), bw)
    x = clampNumber(right - w, 0, Math.max(0, bw - w))
    const nextX = drag.startRect.x + dx
    const maxX = Math.max(0, right - minW)
    x = clampNumber(nextX, 0, maxX)
    w = Math.max(1, right - x)
  } else if (paneFrameResizesRight(drag.kind)) {
    const right = drag.startRect.x + drag.startRect.w
    const nextRight = right + dx
    const minRight = Math.min(bw, drag.startRect.x + minW)
    const clampedRight = clampNumber(nextRight, minRight, bw)
    x = drag.startRect.x
    w = Math.max(1, clampedRight - x)
  }

  if (paneFrameResizesTop(drag.kind)) {
    const bottom = drag.startRect.y + drag.startRect.h
    h = Math.min(Math.max(1, bottom), bh)
    y = clampNumber(bottom - h, 0, Math.max(0, bh - h))
    const nextY = drag.startRect.y + dy
    const maxY = Math.max(0, bottom - minH)
    y = clampNumber(nextY, 0, maxY)
    h = Math.max(1, bottom - y)
  } else if (paneFrameResizesBottom(drag.kind)) {
    const bottom = drag.startRect.y + drag.startRect.h
    const nextBottom = bottom + dy
    const minBottom = Math.min(bh, drag.startRect.y + minH)
    const clampedBottom = clampNumber(nextBottom, minBottom, bh)
    y = drag.startRect.y
    h = Math.max(1, clampedBottom - y)
  }

  w = clampNumber(w, minW, bw)
  h = clampNumber(h, minH, bh)
  x = clampNumber(x, 0, Math.max(0, bw - w))
  y = clampNumber(y, 0, Math.max(0, bh - h))
  return {x, y, w, h}
}

function paneFrameResizesLeft(kind: PaneFrameInteractionKind): boolean {
  return kind === "resize-left" || kind === "resize-top-left" || kind === "resize-bottom-left"
}

function paneFrameResizesRight(kind: PaneFrameInteractionKind): boolean {
  return kind === "resize-right" || kind === "resize-top-right" || kind === "resize-bottom-right"
}

function paneFrameResizesTop(kind: PaneFrameInteractionKind): boolean {
  return kind === "resize-top" || kind === "resize-top-left" || kind === "resize-top-right"
}

function paneFrameResizesBottom(kind: PaneFrameInteractionKind): boolean {
  return kind === "resize-bottom" || kind === "resize-bottom-left" || kind === "resize-bottom-right"
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
