import type {UiSurface, UiSurfaceRect} from "@ui/elements"

export type HudPaneFramePhase = "change" | "end"
export type HudPaneFrameEdge =
  | "move"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"

export type HudPaneFrameChange = Readonly<{
  rect: UiSurfaceRect
  phase: HudPaneFramePhase
}>

export type HudPaneFrameInteractionProps = Readonly<{
  movable?: boolean
  resizable?: boolean
  headerHeight?: number
  minWidth?: number
  minHeight?: number
  onFrameRectChange?: (change: HudPaneFrameChange) => void
}>

type HudPaneFrameDrag = Readonly<{
  edge: HudPaneFrameEdge
  startClientX: number
  startClientY: number
  startRect: UiSurfaceRect
  minWidth: number
  minHeight: number
}>

export function HudPaneFrameInteractions(host: UiSurface, props: HudPaneFrameInteractionProps): void {
  if (props.movable === true) {
    registerFrameHit(host, "move", {x: 6, y: 4, w: Math.max(1, host.frameWidth - 12), h: props.headerHeight ?? 30}, "grab", "grabbing", props)
  }
  if (props.resizable !== true) return

  const edge = 6
  const corner = 12
  registerFrameHit(host, "left", {x: 0, y: corner, w: edge, h: Math.max(1, host.frameHeight - corner * 2)}, "ew-resize", "ew-resize", props)
  registerFrameHit(host, "right", {x: Math.max(0, host.frameWidth - edge), y: corner, w: edge, h: Math.max(1, host.frameHeight - corner * 2)}, "ew-resize", "ew-resize", props)
  registerFrameHit(host, "top", {x: corner, y: 0, w: Math.max(1, host.frameWidth - corner * 2), h: edge}, "ns-resize", "ns-resize", props)
  registerFrameHit(host, "bottom", {x: corner, y: Math.max(0, host.frameHeight - edge), w: Math.max(1, host.frameWidth - corner * 2), h: edge}, "ns-resize", "ns-resize", props)
  registerFrameHit(host, "top-left", {x: 0, y: 0, w: corner, h: corner}, "nwse-resize", "nwse-resize", props)
  registerFrameHit(host, "top-right", {x: Math.max(0, host.frameWidth - corner), y: 0, w: corner, h: corner}, "nesw-resize", "nesw-resize", props)
  registerFrameHit(host, "bottom-left", {x: 0, y: Math.max(0, host.frameHeight - corner), w: corner, h: corner}, "nesw-resize", "nesw-resize", props)
  registerFrameHit(host, "bottom-right", {x: Math.max(0, host.frameWidth - corner), y: Math.max(0, host.frameHeight - corner), w: corner, h: corner}, "nwse-resize", "nwse-resize", props)
}

export function moveHudPaneFrame(
  start: UiSurfaceRect,
  edge: HudPaneFrameEdge,
  dx: number,
  dy: number,
  bounds: Readonly<{w: number; h: number}>,
  minWidth = 240,
  minHeight = 160,
): UiSurfaceRect {
  const safeWidth = Math.max(1, bounds.w)
  const safeHeight = Math.max(1, bounds.h)
  const current = constrainHudPaneFrame(start, bounds, minWidth, minHeight)
  if (edge === "move") {
    return constrainHudPaneFrame({...current, x: current.x + dx, y: current.y + dy}, bounds, minWidth, minHeight)
  }

  const minimumWidth = Math.min(Math.max(1, minWidth), safeWidth)
  const minimumHeight = Math.min(Math.max(1, minHeight), safeHeight)
  let left = current.x
  let right = current.x + current.w
  let top = current.y
  let bottom = current.y + current.h
  if (edge.includes("left")) left = clamp(left + dx, 0, right - minimumWidth)
  if (edge.includes("right")) right = clamp(right + dx, left + minimumWidth, safeWidth)
  if (edge.includes("top")) top = clamp(top + dy, 0, bottom - minimumHeight)
  if (edge.includes("bottom")) bottom = clamp(bottom + dy, top + minimumHeight, safeHeight)
  return {x: left, y: top, w: right - left, h: bottom - top}
}

export function constrainHudPaneFrame(
  frame: UiSurfaceRect,
  bounds: Readonly<{w: number; h: number}>,
  minWidth = 1,
  minHeight = 1,
): UiSurfaceRect {
  const safeWidth = Math.max(1, bounds.w)
  const safeHeight = Math.max(1, bounds.h)
  const w = clamp(frame.w, Math.min(Math.max(1, minWidth), safeWidth), safeWidth)
  const h = clamp(frame.h, Math.min(Math.max(1, minHeight), safeHeight), safeHeight)
  return {
    x: clamp(frame.x, 0, safeWidth - w),
    y: clamp(frame.y, 0, safeHeight - h),
    w,
    h,
  }
}

function registerFrameHit(
  host: UiSurface,
  edge: HudPaneFrameEdge,
  rect: UiSurfaceRect,
  cursor: string,
  activeCursor: string,
  props: HudPaneFrameInteractionProps,
): void {
  let drag: HudPaneFrameDrag | null = null
  host.hit(rect.x, rect.y, rect.w, rect.h, () => {}, {
    key: `hud-pane-frame:${edge}`,
    cursor,
    activeCursor,
    onPointerDown: (_localX, _localY, event) => {
      const frame = host.surfaceFrame()
      if (frame === null || frame === undefined || event === undefined) return
      drag = {
        edge,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: frame.rect,
        minWidth: props.minWidth ?? 240,
        minHeight: props.minHeight ?? 160,
      }
      event.preventDefault()
    },
    onPointerMove: (_localX, _localY, event) => {
      const frame = host.surfaceFrame()
      if (drag === null || frame === null || frame === undefined || event === undefined) return
      const next = moveHudPaneFrame(
        drag.startRect,
        drag.edge,
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
        frame.bounds,
        drag.minWidth,
        drag.minHeight,
      )
      host.setSurfaceFrame(next)
      props.onFrameRectChange?.({rect: next, phase: "change"})
    },
    onPointerUp: (event) => {
      const frame = host.surfaceFrame()
      if (drag === null || frame === null || frame === undefined || event === undefined) return
      const next = moveHudPaneFrame(
        drag.startRect,
        drag.edge,
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
        frame.bounds,
        drag.minWidth,
        drag.minHeight,
      )
      host.setSurfaceFrame(next)
      props.onFrameRectChange?.({rect: next, phase: "end"})
      drag = null
    },
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
