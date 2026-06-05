/**
 * Общая геометрия pane chrome.
 *
 * Здесь живут повторяемые отступы header/rule/viewport, чтобы EditorPane,
 * TerminalPane и следующие panes не расходились из-за локальных magic numbers.
 */

export type PaneRect = {
  x: number
  y: number
  w: number
  h: number
}

export type PaneFrameInteractionKind = "move" | "resize-right" | "resize-bottom" | "resize-bottom-right"

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
  return {
    x: insetX,
    y,
    w: Math.max(1, rectW - insetX * 2),
    h: Math.max(1, rectH - y - bottomInset),
  }
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
    const right = localX >= Math.max(0, rectW - handle)
    const bottom = localY >= Math.max(0, rectH - handle)
    if (right && bottom) return "resize-bottom-right"
    if (right) return "resize-right"
    if (bottom) return "resize-bottom"
  }
  if (movable && localY <= headerHeight) return "move"
  return null
}

export function paneFrameCursor(kind: PaneFrameInteractionKind | null, active = false): string | null {
  if (kind === null) return null
  if (kind === "move") return active ? "grabbing" : "grab"
  if (kind === "resize-right") return "ew-resize"
  if (kind === "resize-bottom") return "ns-resize"
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
  } else {
    if (drag.kind === "resize-right" || drag.kind === "resize-bottom-right") {
      w = clampNumber(drag.startRect.w + dx, Math.min(minW, Math.max(1, bw - x)), Math.max(1, bw - x))
    }
    if (drag.kind === "resize-bottom" || drag.kind === "resize-bottom-right") {
      h = clampNumber(drag.startRect.h + dy, Math.min(minH, Math.max(1, bh - y)), Math.max(1, bh - y))
    }
  }

  w = clampNumber(w, minW, bw)
  h = clampNumber(h, minH, bh)
  x = clampNumber(x, 0, Math.max(0, bw - w))
  y = clampNumber(y, 0, Math.max(0, bh - h))
  return {x, y, w, h}
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
