import {Z, type HitOptions, type UiSurface} from "./surface.ts"
import {DEFAULT_ACTIVE_THUMB, scrollbar} from "./scrollbar.ts"
import {span} from "./span.ts"
import {
  backgroundColor,
  boxPadding,
  cssColor,
  glassTintColor,
  glassTintOpacity,
  isGlassBackground,
  mergeStyle,
  px,
  type ElementChildren,
  type InteractiveElementProps,
  type StyleProps,
} from "./style.ts"
import type {Color} from "@metafor/engine"

export type DivScrollContext = {
  scrollLeft: number
  scrollTop: number
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
}

export type DivProps = Omit<InteractiveElementProps, "children"> & {
  children?: ElementChildren | ((ctx: DivScrollContext) => void)
  scrollContentWidth?: number
  scrollContentHeight?: number
}

type DivScrollState = {
  top: number
  left: number
  targetTop: number
  targetLeft: number
  animationRafId: number | null
  lastWheelTopAt: number | null
  lastWheelLeftAt: number | null
  smoothPixelTopUntil: number
  smoothPixelLeftUntil: number
  dragY: {startY: number; startTop: number} | null
  dragX: {startX: number; startLeft: number} | null
}

const scrollStates = new WeakMap<UiSurface, Map<string, DivScrollState>>()
const WHEEL_LINE_PX = 40
const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
const PIXEL_WHEEL_MOMENTUM_GAP_MS = 28
const PIXEL_WHEEL_NEW_GESTURE_GAP_MS = 180
const PIXEL_WHEEL_MOMENTUM_MIN_DELTA_PX = 8
const PIXEL_WHEEL_MOMENTUM_CHAIN_MS = 90
const SMOOTH_SCROLL_FOLLOW = 0.42
const SMOOTH_SCROLL_SNAP_PX = 0.5

export function divScrollTo(surface: UiSurface, key: string, next: {left?: number; top?: number}): void {
  const state = divScrollState(surface, key)
  let changed = false
  if (next.left !== undefined && Number.isFinite(next.left)) {
    const left = Math.max(0, next.left)
    if (left !== state.left) {
      stopDivScrollAnimation(state)
      state.left = left
      state.targetLeft = left
      changed = true
    }
  }
  if (next.top !== undefined && Number.isFinite(next.top)) {
    const top = Math.max(0, next.top)
    if (top !== state.top) {
      stopDivScrollAnimation(state)
      state.top = top
      state.targetTop = top
      changed = true
    }
  }
  if (changed) surface.requestRender()
}

export function divScrollPosition(surface: UiSurface, key: string): {left: number; top: number} {
  const state = divScrollState(surface, key)
  return {left: state.left, top: state.top}
}

export function div(surface: UiSurface, x: number, y: number, width: number, height: number, props: DivProps = {}): void {
  const style = mergeStyle(props)
  if (style.display === "none" || width <= 0 || height <= 0) return
  const fill = backgroundColor(style)
  const border = style.borderColor === null ? null : style.borderColor === undefined ? undefined : cssColor(style.borderColor)
  const borderWidth = px(style.borderWidth, 1)
  const radius = px(style.borderRadius, Math.min(32, Math.min(width, height) / 2))
  const z = style.zIndex ?? Z.CONTAINER
  const isGlass = isGlassBackground(style)

  if (fill !== null || border !== null) {
    const roundedOpts: {
      radius: number
      fill: Color | null
      border: Color | null
      borderWidth: number
      opacity?: number
      z: number
    } = {
      radius,
      fill,
      border: border ?? null,
      borderWidth: border === null || border === undefined ? 0 : borderWidth,
      z,
    }
    if (style.opacity !== undefined) roundedOpts.opacity = style.opacity
    surface.drawRoundedRect(x, y, width, height, roundedOpts)
    if (isGlass) {
      const tint = glassTintColor(style)
      const tintOpacity = glassTintOpacity(style) * (style.opacity ?? 1)
      if (tint !== null && tintOpacity > 0 && width > 4 && height > 4) {
        surface.drawRoundedRect(x + 2, y + 2, width - 4, height - 4, {
          radius: Math.max(0, radius - 2),
          fill: tint,
          border: null,
          borderWidth: 0,
          opacity: tintOpacity,
          z: z + 0.01,
        })
      }
    }
  }

  if (
    props.onClick !== undefined ||
    props.onPointerEnter !== undefined ||
    props.onPointerLeave !== undefined ||
    props.onPointerDown !== undefined ||
    props.onPointerMove !== undefined ||
    props.onPointerUp !== undefined
  ) {
    const hit: HitOptions = {cursor: "pointer"}
    if (props.key !== undefined) hit.key = props.key
    if (props.onPointerEnter !== undefined) hit.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hit.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) hit.onPointerDown = props.onPointerDown
    if (props.onPointerMove !== undefined) hit.onPointerMove = props.onPointerMove
    if (props.onPointerUp !== undefined) hit.onPointerUp = props.onPointerUp
    surface.hit(x, y, width, height, props.onClick ?? (() => {}), hit)
  }

  const overflowX = style.overflowX ?? style.overflow ?? "visible"
  const overflowY = style.overflowY ?? style.overflow ?? "visible"
  const scrollableX = overflowX === "auto" || overflowX === "scroll"
  const scrollableY = overflowY === "auto" || overflowY === "scroll"

  if (typeof props.children === "function") {
    const layout = divScrollLayout(surface, {
      x,
      y,
      width,
      height,
      style,
      key: props.key,
      overflowX,
      overflowY,
      scrollableX,
      scrollableY,
      contentWidth: props.scrollContentWidth,
      contentHeight: props.scrollContentHeight,
    })
    const shouldClip = overflowX === "hidden" || overflowY === "hidden" || scrollableX || scrollableY
    if (shouldClip) surface.pushClip(layout.contentX, layout.contentY, layout.viewportW, layout.viewportH)
    props.children({
      scrollLeft: scrollableX ? layout.state.left : 0,
      scrollTop: scrollableY ? layout.state.top : 0,
      viewportWidth: layout.viewportW,
      viewportHeight: layout.viewportH,
      contentWidth: layout.contentW,
      contentHeight: layout.contentH,
    })
    if (shouldClip) surface.popClip()
    renderDivScrollbars(surface, layout)
  }
  else if (props.children !== false && props.children !== null && props.children !== undefined) {
    const text = String(props.children)
    const fontSize = px(style.fontSize, 12)
    const lineHeight = px(typeof style.lineHeight === "number" ? `${style.lineHeight * fontSize}px` : style.lineHeight, Math.round(fontSize * 1.45))
    const lines = text.split(/\r?\n/)
    const lineWidths = lines.map((line) => surface.measureText(line, fontSize))
    const maxLineW = Math.max(1, ...lineWidths)
    const layout = divScrollLayout(surface, {
      x,
      y,
      width,
      height,
      style,
      key: props.key,
      overflowX,
      overflowY,
      scrollableX,
      scrollableY,
      contentWidth: maxLineW,
      contentHeight: lines.length * lineHeight,
    })
    const shouldClip = overflowX === "hidden" || overflowY === "hidden" || scrollableX || scrollableY
    if (shouldClip) surface.pushClip(layout.contentX, layout.contentY, layout.viewportW, layout.viewportH)
    if (lines.length === 1) {
      span(surface, layout.contentX - (scrollableX ? layout.state.left : 0), layout.contentY - (scrollableY ? layout.state.top : 0), scrollableX ? Math.max(maxLineW, layout.viewportW + layout.state.left) : layout.viewportW, layout.viewportH, {
        children: text,
        style,
      })
    } else {
      for (const [i, line] of lines.entries()) {
        const lineY = layout.contentY + i * lineHeight - (scrollableY ? layout.state.top : 0)
        if (lineY + lineHeight < y || lineY > y + height) continue
        span(surface, layout.contentX - (scrollableX ? layout.state.left : 0), lineY, scrollableX ? Math.max(lineWidths[i] ?? 1, layout.viewportW + layout.state.left) : layout.viewportW, lineHeight, {
          children: line,
          style,
        })
      }
    }
    if (shouldClip) surface.popClip()
    renderDivScrollbars(surface, layout)
  }
}

type DivScrollLayout = {
  x: number
  y: number
  width: number
  height: number
  pad: {top: number; right: number; bottom: number; left: number}
  contentX: number
  contentY: number
  viewportW: number
  viewportH: number
  contentW: number
  contentH: number
  trackWidth: number
  radius: number
  key: string
  style: StyleProps
  state: DivScrollState
  showX: boolean
  showY: boolean
  maxScrollX: number
  maxScrollY: number
}

function divScrollLayout(
  surface: UiSurface,
  opts: {
    x: number
    y: number
    width: number
    height: number
    style: StyleProps
    key: string | undefined
    overflowX: string
    overflowY: string
    scrollableX: boolean
    scrollableY: boolean
    contentWidth: number | undefined
    contentHeight: number | undefined
  },
): DivScrollLayout {
  const pad = boxPadding(opts.style)
  const trackWidth = px(opts.style.scrollbarWidth, 4)
  const radius = Math.max(0, Math.min(
    px(opts.style.borderRadius, Math.min(32, Math.min(opts.width, opts.height) / 2)),
    Math.min(opts.width, opts.height) / 2,
  ))
  const rawViewportW = Math.max(1, opts.width - pad.left - pad.right)
  const rawViewportH = Math.max(1, opts.height - pad.top - pad.bottom)
  const intrinsicW = Math.max(1, opts.contentWidth ?? rawViewportW)
  const intrinsicH = Math.max(1, opts.contentHeight ?? rawViewportH)
  const scrollGutter = trackWidth
  let showX = opts.scrollableX && (opts.overflowX === "scroll" || intrinsicW > rawViewportW)
  let showY = opts.scrollableY && (opts.overflowY === "scroll" || intrinsicH > rawViewportH)
  for (let i = 0; i < 2; i++) {
    const viewportW = Math.max(1, rawViewportW - (showY ? scrollGutter : 0))
    const viewportH = Math.max(1, rawViewportH - (showX ? scrollGutter : 0))
    showX = opts.scrollableX && (opts.overflowX === "scroll" || intrinsicW > viewportW)
    showY = opts.scrollableY && (opts.overflowY === "scroll" || intrinsicH > viewportH)
  }
  const viewportW = Math.max(1, rawViewportW - (showY ? scrollGutter : 0))
  const viewportH = Math.max(1, rawViewportH - (showX ? scrollGutter : 0))
  const contentW = Math.max(viewportW, intrinsicW)
  const contentH = Math.max(viewportH, intrinsicH)
  const key = opts.key ?? `div:${opts.x}:${opts.y}:${opts.width}:${opts.height}`
  const state = divScrollState(surface, key)
  const maxScrollX = Math.max(0, contentW - viewportW)
  const maxScrollY = Math.max(0, contentH - viewportH)
  state.left = clamp(state.left, 0, maxScrollX)
  state.top = clamp(state.top, 0, maxScrollY)
  state.targetLeft = clamp(state.targetLeft, 0, maxScrollX)
  state.targetTop = clamp(state.targetTop, 0, maxScrollY)
  return {
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    pad,
    contentX: opts.x + pad.left,
    contentY: opts.y + pad.top,
    viewportW,
    viewportH,
    contentW,
    contentH,
    trackWidth,
    radius,
    key,
    style: opts.style,
    state,
    showX,
    showY,
    maxScrollX,
    maxScrollY,
  }
}

function renderDivScrollbars(surface: UiSurface, layout: DivScrollLayout): void {
  const {state, style} = layout
  if ((layout.showX && layout.maxScrollX > 0) || (layout.showY && layout.maxScrollY > 0)) {
    surface.wheel(layout.x, layout.y, layout.width, layout.height, (event) => {
      const horizontal = layout.showX && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !layout.showY)
      if (horizontal) {
        const delta = event.shiftKey && event.deltaY !== 0
          ? event.deltaY
          : event.deltaX !== 0
            ? event.deltaX
            : !layout.showY
              ? event.deltaY
              : 0
        if (!applyWheelScroll(surface, state, "left", wheelDeltaPxFor(delta, event.deltaMode, layout.viewportW), event.deltaMode, layout.maxScrollX, event.timeStamp)) return
        event.preventDefault()
        return
      }
      if (!applyWheelScroll(surface, state, "top", wheelDeltaPxFor(event.deltaY, event.deltaMode, layout.viewportH), event.deltaMode, layout.maxScrollY, event.timeStamp)) return
      event.preventDefault()
    }, layout.key)
  }

  if (layout.showY) {
    const edgeInset = scrollbarEdgeInset(layout.radius, layout.height)
    const topInset = edgeInset
    const bottomInset = Math.max(edgeInset, layout.showX ? layout.trackWidth : 0)
    const scrollbarX = layout.x + layout.width - layout.trackWidth
    const scrollbarY = layout.y + topInset
    const scrollbarH = Math.max(1, layout.height - topInset - bottomInset)
    const scrollbarKey = `${layout.key}:scrollbar-y`
    const thumb = scrollbarThumbMetrics(state.top, layout.viewportH, layout.contentH, scrollbarH)
    const thumbY = scrollbarY + thumb.y
    const thumbKey = `${scrollbarKey}:thumb`
    const thumbState = surface.hitState(scrollbarX, thumbY, layout.trackWidth, thumb.h, thumbKey)
    const active = thumbState.hovered || thumbState.pressed || state.dragY !== null
    surface.hit(scrollbarX, scrollbarY, layout.trackWidth, scrollbarH, () => {}, {
      key: scrollbarKey,
      cursor: "pointer",
      onPointerDown: (_localX, localY) => {
        const localTrackY = localY - scrollbarY
        const direction = localTrackY < thumb.y ? -1 : 1
        stopDivScrollAnimation(state)
        state.top = clamp(state.top + direction * layout.viewportH * 0.85, 0, layout.maxScrollY)
        state.targetTop = state.top
        surface.requestRender()
      },
    })
    surface.hit(scrollbarX, thumbY, layout.trackWidth, thumb.h, () => {}, {
      key: thumbKey,
      cursor: "grab",
      activeCursor: "grabbing",
      onPointerDown: (_localX, localY) => {
        stopDivScrollAnimation(state)
        state.dragY = {startY: localY, startTop: state.top}
      },
      onPointerMove: (_localX, localY) => {
        if (state.dragY === null) return
        const range = Math.max(1, scrollbarH - thumb.h)
        const contentRange = Math.max(1, layout.contentH - layout.viewportH)
        const next = state.dragY.startTop + ((localY - state.dragY.startY) / range) * contentRange
        state.top = clamp(next, 0, layout.maxScrollY)
        state.targetTop = state.top
        surface.requestRender()
      },
      onPointerUp: () => {
        state.dragY = null
      },
    })
    scrollbar(surface, scrollbarX, scrollbarY, scrollbarH, {
      offset: state.top,
      visible: layout.viewportH,
      total: layout.contentH,
      trackWidth: layout.trackWidth,
      ...(style.scrollbarTrackColor === undefined ? {} : {trackColor: cssColor(style.scrollbarTrackColor)}),
      ...(active ? {thumbColor: activeScrollbarThumb(style)} : {}),
    })
  }

  if (layout.showX) {
    const edgeInset = scrollbarEdgeInset(layout.radius, layout.width)
    const leftInset = edgeInset
    const rightInset = Math.max(edgeInset, layout.showY ? layout.trackWidth : 0)
    const scrollbarX = layout.x + leftInset
    const scrollbarY = layout.y + layout.height - layout.trackWidth
    const scrollbarW = Math.max(1, layout.width - leftInset - rightInset)
    const scrollbarKey = `${layout.key}:scrollbar-x`
    const thumb = scrollbarThumbMetrics(state.left, layout.viewportW, layout.contentW, scrollbarW)
    const thumbX = scrollbarX + thumb.y
    const thumbKey = `${scrollbarKey}:thumb`
    const thumbState = surface.hitState(thumbX, scrollbarY, thumb.h, layout.trackWidth, thumbKey)
    const active = thumbState.hovered || thumbState.pressed || state.dragX !== null
    surface.hit(scrollbarX, scrollbarY, scrollbarW, layout.trackWidth, () => {}, {
      key: scrollbarKey,
      cursor: "pointer",
      onPointerDown: (localX) => {
        const localTrackX = localX - scrollbarX
        const direction = localTrackX < thumb.y ? -1 : 1
        stopDivScrollAnimation(state)
        state.left = clamp(state.left + direction * layout.viewportW * 0.85, 0, layout.maxScrollX)
        state.targetLeft = state.left
        surface.requestRender()
      },
    })
    surface.hit(thumbX, scrollbarY, thumb.h, layout.trackWidth, () => {}, {
      key: thumbKey,
      cursor: "grab",
      activeCursor: "grabbing",
      onPointerDown: (localX) => {
        stopDivScrollAnimation(state)
        state.dragX = {startX: localX, startLeft: state.left}
      },
      onPointerMove: (localX) => {
        if (state.dragX === null) return
        const range = Math.max(1, scrollbarW - thumb.h)
        const contentRange = Math.max(1, layout.contentW - layout.viewportW)
        const next = state.dragX.startLeft + ((localX - state.dragX.startX) / range) * contentRange
        state.left = clamp(next, 0, layout.maxScrollX)
        state.targetLeft = state.left
        surface.requestRender()
      },
      onPointerUp: () => {
        state.dragX = null
      },
    })
    scrollbar(surface, scrollbarX, scrollbarY, scrollbarW, {
      axis: "horizontal",
      offset: state.left,
      visible: layout.viewportW,
      total: layout.contentW,
      trackWidth: layout.trackWidth,
      ...(style.scrollbarTrackColor === undefined ? {} : {trackColor: cssColor(style.scrollbarTrackColor)}),
      ...(active ? {thumbColor: activeScrollbarThumb(style)} : {}),
    })
  }
}

function activeScrollbarThumb(style: StyleProps): Color {
  return style.scrollbarColor === undefined ? DEFAULT_ACTIVE_THUMB : cssColor(style.scrollbarColor)
}

function divScrollState(surface: UiSurface, key: string): DivScrollState {
  let byKey = scrollStates.get(surface)
  if (byKey === undefined) {
    byKey = new Map()
    scrollStates.set(surface, byKey)
  }
  let state = byKey.get(key)
  if (state === undefined) {
    state = {
      top: 0,
      left: 0,
      targetTop: 0,
      targetLeft: 0,
      animationRafId: null,
      lastWheelTopAt: null,
      lastWheelLeftAt: null,
      smoothPixelTopUntil: 0,
      smoothPixelLeftUntil: 0,
      dragY: null,
      dragX: null,
    }
    byKey.set(key, state)
  }
  state.top ??= 0
  state.left ??= 0
  state.targetTop ??= state.top
  state.targetLeft ??= state.left
  state.animationRafId ??= null
  state.lastWheelTopAt ??= null
  state.lastWheelLeftAt ??= null
  state.smoothPixelTopUntil ??= 0
  state.smoothPixelLeftUntil ??= 0
  state.dragY ??= null
  state.dragX ??= null
  return state
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scrollbarThumbMetrics(offset: number, visible: number, total: number, trackSize = visible): {y: number; h: number} {
  const thumbH = Math.max(16, Math.floor(trackSize * (visible / total)))
  const range = trackSize - thumbH
  const maxOffset = Math.max(1, total - visible)
  return {
    y: Math.floor(range * (offset / maxOffset)),
    h: thumbH,
  }
}

function scrollbarEdgeInset(radius: number, axisSize: number): number {
  if (radius <= 0 || axisSize <= 0) return 0
  return Math.ceil(Math.min(radius, axisSize / 2))
}

export function wheelDeltaPxFor(delta: number, deltaMode: number, pageSizePx: number): number {
  if (!Number.isFinite(delta) || delta === 0) return 0
  if (deltaMode === DOM_DELTA_PIXEL) return delta
  if (deltaMode === DOM_DELTA_PAGE) return delta * Math.max(1, pageSizePx)
  if (deltaMode === DOM_DELTA_LINE) return delta * WHEEL_LINE_PX
  return delta
}

export function shouldSmoothWheelDelta(
  deltaPx: number,
  deltaMode: number,
  opts: {eventAtMs?: number; lastEventAtMs?: number | null; smoothUntilMs?: number} = {},
): boolean {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return false
  if (deltaMode !== DOM_DELTA_PIXEL) return true
  const eventAtMs = opts.eventAtMs
  if (!isFiniteNumber(eventAtMs)) return false
  if (eventAtMs <= (opts.smoothUntilMs ?? 0)) return true
  const lastEventAtMs = opts.lastEventAtMs
  if (!isFiniteNumber(lastEventAtMs)) return false
  const gapMs = eventAtMs - lastEventAtMs
  return gapMs >= PIXEL_WHEEL_MOMENTUM_GAP_MS
    && gapMs <= PIXEL_WHEEL_NEW_GESTURE_GAP_MS
    && Math.abs(deltaPx) >= PIXEL_WHEEL_MOMENTUM_MIN_DELTA_PX
}

export function smoothScrollStep(current: number, target: number): number {
  if (!Number.isFinite(current)) return Number.isFinite(target) ? target : 0
  if (!Number.isFinite(target)) return current
  const delta = target - current
  if (Math.abs(delta) <= SMOOTH_SCROLL_SNAP_PX) return target
  return current + delta * SMOOTH_SCROLL_FOLLOW
}

function applyWheelScroll(surface: UiSurface, state: DivScrollState, axis: "left" | "top", deltaPx: number, deltaMode: number, maxScroll: number, eventTimeStamp: number | undefined): boolean {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return false
  const targetKey = axis === "left" ? "targetLeft" : "targetTop"
  const lastWheelAtKey = axis === "left" ? "lastWheelLeftAt" : "lastWheelTopAt"
  const smoothPixelUntilKey = axis === "left" ? "smoothPixelLeftUntil" : "smoothPixelTopUntil"
  const eventAtMs = wheelEventTimeMs(eventTimeStamp)
  const current = state[axis]
  const currentTarget = state[targetKey]
  const smooth = shouldSmoothWheelDelta(deltaPx, deltaMode, {
    eventAtMs,
    lastEventAtMs: state[lastWheelAtKey],
    smoothUntilMs: state[smoothPixelUntilKey],
  })
  const next = clamp((smooth ? currentTarget : current) + deltaPx, 0, maxScroll)
  state[lastWheelAtKey] = eventAtMs
  state[smoothPixelUntilKey] = smooth && deltaMode === DOM_DELTA_PIXEL
    ? eventAtMs + PIXEL_WHEEL_MOMENTUM_CHAIN_MS
    : 0
  if (next === current && next === currentTarget) return false
  state[targetKey] = next

  if (smooth) {
    startDivScrollAnimation(surface, state)
    return true
  }

  stopDivScrollAnimation(state)
  state[axis] = next
  surface.requestRender()
  return true
}

function wheelEventTimeMs(eventTimeStamp: number | undefined): number {
  if (isFiniteNumber(eventTimeStamp)) return eventTimeStamp
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now()
  return Date.now()
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function startDivScrollAnimation(surface: UiSurface, state: DivScrollState): void {
  if (state.animationRafId !== null) return
  if (typeof requestAnimationFrame !== "function") {
    state.left = state.targetLeft
    state.top = state.targetTop
    surface.requestRender()
    return
  }

  const tick = () => {
    state.animationRafId = null
    const nextLeft = smoothScrollStep(state.left, state.targetLeft)
    const nextTop = smoothScrollStep(state.top, state.targetTop)
    const changed = nextLeft !== state.left || nextTop !== state.top
    state.left = nextLeft
    state.top = nextTop
    if (changed) surface.requestRender()
    if (state.left !== state.targetLeft || state.top !== state.targetTop) {
      state.animationRafId = requestAnimationFrame(tick)
    }
  }
  state.animationRafId = requestAnimationFrame(tick)
}

function stopDivScrollAnimation(state: DivScrollState): void {
  if (state.animationRafId === null) return
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.animationRafId)
  state.animationRafId = null
}
