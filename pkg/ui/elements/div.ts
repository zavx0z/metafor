import {Z, type HitOptions, type UiSurface} from "./surface.ts"
import {scrollbar} from "./scrollbar.ts"
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
  animationLastAtMs: number | null
  pendingTop: number
  pendingLeft: number
  wheelTauTopMs: number
  wheelTauLeftMs: number
  maxScrollTop: number
  maxScrollLeft: number
  wheelAxis: ScrollAxis
  lastWheelAtMs: number | null
  dragY: {startY: number; startTop: number} | null
  dragX: {startX: number; startLeft: number} | null
}

export type ScrollAxis = "x" | "y" | null

const scrollStates = new WeakMap<UiSurface, Map<string, DivScrollState>>()
const WHEEL_LINE_PX = 40
const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2
const WHEEL_PIXEL_TAU_MS = 42
const WHEEL_LINE_TAU_MS = 72
const WHEEL_PAGE_TAU_MS = 100
const WHEEL_ANIMATION_DEFAULT_FRAME_MS = 1000 / 60
const WHEEL_ANIMATION_MAX_FRAME_MS = 34
const WHEEL_PENDING_SNAP_PX = 0.35
const WHEEL_AXIS_EVENT_SEPARATION_MS = 28
const WHEEL_AXIS_UNLOCK_PERCENT = 1.9
const WHEEL_AXIS_UNLOCK_MIN_PX = 6

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
  if (changed) surface.requestKeyedRender(key)
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
  surface.registerRenderKey(key)
  const state = divScrollState(surface, key)
  const maxScrollX = Math.max(0, contentW - viewportW)
  const maxScrollY = Math.max(0, contentH - viewportH)
  const left = clamp(state.left, 0, maxScrollX)
  const top = clamp(state.top, 0, maxScrollY)
  if (left !== state.left) state.pendingLeft = 0
  if (top !== state.top) state.pendingTop = 0
  state.left = left
  state.top = top
  state.targetLeft = clamp(state.left + state.pendingLeft, 0, maxScrollX)
  state.targetTop = clamp(state.top + state.pendingTop, 0, maxScrollY)
  state.pendingLeft = state.targetLeft - state.left
  state.pendingTop = state.targetTop - state.top
  state.maxScrollLeft = maxScrollX
  state.maxScrollTop = maxScrollY
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
      const eventAtMs = wheelEventTimeMs(event.timeStamp)
      const delta = wheelDeltasForEvent(event, layout)
      const locked = applyWheelAxisLock(delta.x, delta.y, nextWheelAxis(delta.x, delta.y, state.wheelAxis, state.lastWheelAtMs, eventAtMs))
      state.wheelAxis = locked.axis
      state.lastWheelAtMs = eventAtMs
      let handled = false
      if (locked.x !== 0) handled = applyWheelScroll(surface, state, layout.key, "left", locked.x, event.deltaMode, layout.maxScrollX, eventAtMs) || handled
      if (locked.y !== 0) handled = applyWheelScroll(surface, state, layout.key, "top", locked.y, event.deltaMode, layout.maxScrollY, eventAtMs) || handled
      if (handled) event.preventDefault()
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
    surface.hit(scrollbarX, scrollbarY, layout.trackWidth, scrollbarH, () => {}, {
      key: scrollbarKey,
      cursor: "pointer",
      onPointerDown: (_localX, localY) => {
        const localTrackY = localY - scrollbarY
        const direction = localTrackY < thumb.y ? -1 : 1
        stopDivScrollAnimation(state)
        state.top = clamp(state.top + direction * layout.viewportH * 0.85, 0, layout.maxScrollY)
        state.targetTop = state.top
        surface.requestKeyedRender(layout.key)
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
        surface.requestKeyedRender(layout.key)
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
      ...(style.scrollbarColor === undefined ? {} : {thumbColor: cssColor(style.scrollbarColor)}),
      pressed: thumbState.pressed || state.dragY !== null,
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
    surface.hit(scrollbarX, scrollbarY, scrollbarW, layout.trackWidth, () => {}, {
      key: scrollbarKey,
      cursor: "pointer",
      onPointerDown: (localX) => {
        const localTrackX = localX - scrollbarX
        const direction = localTrackX < thumb.y ? -1 : 1
        stopDivScrollAnimation(state)
        state.left = clamp(state.left + direction * layout.viewportW * 0.85, 0, layout.maxScrollX)
        state.targetLeft = state.left
        surface.requestKeyedRender(layout.key)
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
        surface.requestKeyedRender(layout.key)
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
      ...(style.scrollbarColor === undefined ? {} : {thumbColor: cssColor(style.scrollbarColor)}),
      pressed: thumbState.pressed || state.dragX !== null,
    })
  }
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
      animationLastAtMs: null,
      pendingTop: 0,
      pendingLeft: 0,
      wheelTauTopMs: WHEEL_PIXEL_TAU_MS,
      wheelTauLeftMs: WHEEL_PIXEL_TAU_MS,
      maxScrollTop: 0,
      maxScrollLeft: 0,
      wheelAxis: null,
      lastWheelAtMs: null,
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
  state.animationLastAtMs ??= null
  state.pendingTop ??= 0
  state.pendingLeft ??= 0
  state.wheelTauTopMs ??= WHEEL_PIXEL_TAU_MS
  state.wheelTauLeftMs ??= WHEEL_PIXEL_TAU_MS
  state.maxScrollTop ??= 0
  state.maxScrollLeft ??= 0
  state.wheelAxis ??= null
  state.lastWheelAtMs ??= null
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

export function wheelQueueTauMs(deltaMode: number): number {
  if (deltaMode === DOM_DELTA_PAGE) return WHEEL_PAGE_TAU_MS
  if (deltaMode === DOM_DELTA_LINE) return WHEEL_LINE_TAU_MS
  return WHEEL_PIXEL_TAU_MS
}

export function integrateQueuedScroll(current: number, pending: number, elapsedMs: number, tauMs: number, maxScroll: number): {value: number; pending: number} {
  if (!Number.isFinite(current)) return {value: 0, pending: 0}
  const currentPending = Number.isFinite(pending) ? pending : 0
  if (Math.abs(currentPending) <= WHEEL_PENDING_SNAP_PX) {
    const value = clamp(current + currentPending, 0, maxScroll)
    return {value, pending: 0}
  }

  const dt = clamp(elapsedMs, 1, WHEEL_ANIMATION_MAX_FRAME_MS) / 1000
  const tauSeconds = Math.max(0.001, tauMs / 1000)
  const consume = 1 - Math.exp(-dt / tauSeconds)
  const step = currentPending * consume
  const rawValue = current + step
  const value = clamp(rawValue, 0, maxScroll)
  let nextPending = currentPending - (value - current)
  if (value !== rawValue || Math.abs(nextPending) <= WHEEL_PENDING_SNAP_PX) nextPending = 0
  return {value, pending: nextPending}
}

function wheelDeltasForEvent(event: WheelEvent, layout: DivScrollLayout): {x: number; y: number} {
  let x = wheelDeltaPxFor(event.deltaX, event.deltaMode, layout.viewportW)
  let y = wheelDeltaPxFor(event.deltaY, event.deltaMode, layout.viewportH)
  if (event.shiftKey && y !== 0) {
    x = y
    y = 0
  }
  if (!layout.showX && layout.showY && y === 0 && x !== 0) {
    y = x
    x = 0
  }
  if (!layout.showY && layout.showX && x === 0 && y !== 0) {
    x = y
    y = 0
  }
  if (!layout.showX) x = 0
  if (!layout.showY) y = 0
  return {x, y}
}

export function nextWheelAxis(deltaX: number, deltaY: number, previousAxis: ScrollAxis, lastEventAtMs: number | null, eventAtMs: number): ScrollAxis {
  const x = Math.abs(deltaX)
  const y = Math.abs(deltaY)
  if (x === 0 && y === 0) return previousAxis
  let axis = previousAxis
  const newScroll = !isFiniteNumber(lastEventAtMs) || eventAtMs - lastEventAtMs > WHEEL_AXIS_EVENT_SEPARATION_MS
  if (newScroll) {
    axis = x > y ? "x" : "y"
  } else if (Math.max(x, y) >= WHEEL_AXIS_UNLOCK_MIN_PX) {
    if (axis === "y" && x > y && x >= y * WHEEL_AXIS_UNLOCK_PERCENT) axis = null
    else if (axis === "x" && y > x && y >= x * WHEEL_AXIS_UNLOCK_PERCENT) axis = null
  }
  return axis
}

export function applyWheelAxisLock(deltaX: number, deltaY: number, axis: ScrollAxis): {x: number; y: number; axis: ScrollAxis} {
  if (axis === "x") return {x: deltaX, y: 0, axis}
  if (axis === "y") return {x: 0, y: deltaY, axis}
  return {x: deltaX, y: deltaY, axis}
}

function applyWheelScroll(surface: UiSurface, state: DivScrollState, key: string, axis: "left" | "top", deltaPx: number, deltaMode: number, maxScroll: number, eventAtMs: number): boolean {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return false
  const pendingKey = axis === "left" ? "pendingLeft" : "pendingTop"
  const targetKey = axis === "left" ? "targetLeft" : "targetTop"
  const tauKey = axis === "left" ? "wheelTauLeftMs" : "wheelTauTopMs"
  const current = state[axis]
  const target = clamp(current + state[pendingKey] + deltaPx, 0, maxScroll)
  const nextPending = target - current
  if (nextPending === state[pendingKey]) return false
  state[targetKey] = target
  state[pendingKey] = nextPending
  state[tauKey] = wheelQueueTauMs(deltaMode)
  startDivScrollAnimation(surface, state, key, eventAtMs)
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

function startDivScrollAnimation(surface: UiSurface, state: DivScrollState, key: string, eventAtMs = animationTimeMs()): void {
  if (state.animationRafId !== null) return
  if (typeof requestAnimationFrame !== "function") {
    state.left = state.targetLeft
    state.top = state.targetTop
    state.pendingLeft = 0
    state.pendingTop = 0
    state.animationLastAtMs = null
    surface.requestKeyedRender(key)
    return
  }
  state.animationLastAtMs = eventAtMs

  const tick = (timestamp: number) => {
    state.animationRafId = null
    const now = isFiniteNumber(timestamp) ? timestamp : animationTimeMs()
    const previous = state.animationLastAtMs ?? now - WHEEL_ANIMATION_DEFAULT_FRAME_MS
    const elapsedMs = clamp(now - previous, 1, WHEEL_ANIMATION_MAX_FRAME_MS)
    state.animationLastAtMs = now
    const nextLeft = integrateQueuedScroll(state.left, state.pendingLeft, elapsedMs, state.wheelTauLeftMs, state.maxScrollLeft)
    const nextTop = integrateQueuedScroll(state.top, state.pendingTop, elapsedMs, state.wheelTauTopMs, state.maxScrollTop)
    const changed = nextLeft.value !== state.left || nextTop.value !== state.top
    state.left = nextLeft.value
    state.top = nextTop.value
    state.pendingLeft = nextLeft.pending
    state.pendingTop = nextTop.pending
    state.targetLeft = state.left + state.pendingLeft
    state.targetTop = state.top + state.pendingTop
    if (changed) surface.requestKeyedRender(key)
    if (state.pendingLeft !== 0 || state.pendingTop !== 0) {
      state.animationRafId = requestAnimationFrame(tick)
    } else {
      state.animationLastAtMs = null
    }
  }
  state.animationRafId = requestAnimationFrame(tick)
}

function stopDivScrollAnimation(state: DivScrollState): void {
  if (state.animationRafId !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state.animationRafId)
  state.animationRafId = null
  state.animationLastAtMs = null
  state.pendingLeft = 0
  state.pendingTop = 0
  state.wheelAxis = null
  state.lastWheelAtMs = null
}

function animationTimeMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now()
  return Date.now()
}
