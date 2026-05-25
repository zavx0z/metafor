import {Z, type HitOptions, type UiSurface} from "./surface.ts"
import {scrollbar} from "./scrollbar.ts"
import {span} from "./span.ts"
import {
  backgroundColor,
  boxPadding,
  cssColor,
  mergeStyle,
  px,
  type InteractiveElementProps,
} from "./style.ts"
import type {Color} from "@metafor/engine"

export type DivProps = InteractiveElementProps

type DivScrollState = {
  top: number
  left: number
  dragY: {startY: number; startTop: number} | null
  dragX: {startX: number; startLeft: number} | null
}

const scrollStates = new WeakMap<UiSurface, Map<string, DivScrollState>>()
const WHEEL_LINE_PX = 40
const TRACKPAD_LINEAR_PX = 12
const TRACKPAD_LINEAR_SPEED = 1.35
const TRACKPAD_LOG_SPEED = 4.5
const TRACKPAD_MAX_STEP_PX = 34
const WHEEL_MAX_STEP_PX = 72

export function div(surface: UiSurface, x: number, y: number, width: number, height: number, props: DivProps = {}): void {
  const style = mergeStyle(props)
  if (style.display === "none" || width <= 0 || height <= 0) return
  const fill = backgroundColor(style)
  const border = style.borderColor === null ? null : style.borderColor === undefined ? undefined : cssColor(style.borderColor)
  const borderWidth = px(style.borderWidth, 1)
  const radius = px(style.borderRadius, Math.min(32, Math.min(width, height) / 2))
  const z = style.zIndex ?? Z.CONTAINER

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
  }

  if (
    props.onClick !== undefined ||
    props.onPointerEnter !== undefined ||
    props.onPointerLeave !== undefined ||
    props.onPointerDown !== undefined ||
    props.onPointerUp !== undefined
  ) {
    const hit: HitOptions = {cursor: "pointer"}
    if (props.key !== undefined) hit.key = props.key
    if (props.onPointerEnter !== undefined) hit.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hit.onPointerLeave = props.onPointerLeave
    if (props.onPointerDown !== undefined) hit.onPointerDown = props.onPointerDown
    if (props.onPointerUp !== undefined) hit.onPointerUp = props.onPointerUp
    surface.hit(x, y, width, height, props.onClick ?? (() => {}), hit)
  }

  const overflowX = style.overflowX ?? style.overflow ?? "visible"
  const overflowY = style.overflowY ?? style.overflow ?? "visible"
  const scrollableX = overflowX === "auto" || overflowX === "scroll"
  const scrollableY = overflowY === "auto" || overflowY === "scroll"

  if (typeof props.children === "function") {
    if (overflowX === "hidden" || overflowY === "hidden" || scrollableX || scrollableY) {
      surface.pushClip(x, y, width, height)
      props.children()
      surface.popClip()
    } else {
      props.children()
    }
  }
  else if (props.children !== false && props.children !== null && props.children !== undefined) {
    const pad = boxPadding(style)
    const contentX = x + pad.left
    const contentY = y + pad.top
    const trackWidth = px(style.scrollbarWidth, 4)
    const scrollbarInset = 10
    const verticalGutter = scrollableY ? trackWidth + scrollbarInset : 0
    const horizontalGutter = scrollableX ? trackWidth + scrollbarInset : 0
    const viewportW = Math.max(1, width - pad.left - pad.right - verticalGutter)
    const viewportH = Math.max(1, height - pad.top - pad.bottom - horizontalGutter)
    const text = String(props.children)
    const fontSize = px(style.fontSize, 12)
    const lineHeight = px(typeof style.lineHeight === "number" ? `${style.lineHeight * fontSize}px` : style.lineHeight, Math.round(fontSize * 1.45))
    const lines = text.split(/\r?\n/)
    const measuredW = Math.max(...lines.map((line) => surface.measureText(line, fontSize)), 0)
    const contentW = scrollableX ? Math.max(viewportW, Math.ceil(measuredW) + 2) : viewportW
    const contentH = Math.max(viewportH, lines.length * lineHeight)
    const key = props.key ?? `div:${x}:${y}:${width}:${height}`
    const state = divScrollState(surface, key)
    const maxScrollX = Math.max(0, contentW - viewportW)
    const maxScrollY = Math.max(0, contentH - viewportH)
    state.left = clamp(state.left, 0, maxScrollX)
    state.top = clamp(state.top, 0, maxScrollY)

    if ((scrollableX && maxScrollX > 0) || (scrollableY && maxScrollY > 0)) {
      surface.wheel(x, y, width, height, (event) => {
        const rawX = event.shiftKey && Math.abs(event.deltaX) < Math.abs(event.deltaY)
          ? event.deltaY
          : event.deltaX !== 0
            ? event.deltaX
            : maxScrollY === 0
              ? event.deltaY
              : event.deltaX
        const preferX = scrollableX && maxScrollX > 0 && (event.shiftKey || Math.abs(rawX) > Math.abs(event.deltaY) || maxScrollY === 0)
        if (preferX) {
          const next = clamp(state.left + wheelDeltaPx(event, viewportW, rawX), 0, maxScrollX)
          if (next === state.left) return
          state.left = next
          surface.requestRender()
          return
        }
        if (!scrollableY || maxScrollY <= 0) return
        const next = clamp(state.top + wheelDeltaPx(event, viewportH, event.deltaY), 0, maxScrollY)
        if (next === state.top) return
        state.top = next
        surface.requestRender()
      }, key)
    }

    const shouldClip = overflowX === "hidden" || overflowY === "hidden" || scrollableX || scrollableY
    if (shouldClip) surface.pushClip(contentX, contentY, viewportW, viewportH)
    if (lines.length === 1) {
      span(surface, contentX - (scrollableX ? state.left : 0), contentY - (scrollableY ? state.top : 0), contentW, viewportH, {
        children: text,
        style,
      })
    } else {
      for (const [i, line] of lines.entries()) {
        const lineY = contentY + i * lineHeight - (scrollableY ? state.top : 0)
        if (lineY + lineHeight < contentY || lineY > contentY + viewportH) continue
        span(surface, contentX - (scrollableX ? state.left : 0), lineY, contentW, lineHeight, {
          children: line,
          style,
        })
      }
    }
    if (shouldClip) surface.popClip()

    if (scrollableY && (overflowY === "scroll" || maxScrollY > 0)) {
      const scrollbarX = x + width - trackWidth - scrollbarInset
      const scrollbarKey = `${key}:scrollbar:y`
      const thumb = scrollbarThumbMetrics(state.top, viewportH, contentH)
      const thumbY = y + pad.top + thumb.y
      const thumbKey = `${key}:scrollbar:y:thumb`
      const thumbState = surface.hitState(scrollbarX, thumbY, trackWidth, thumb.h, thumbKey)
      const active = thumbState.hovered || thumbState.pressed || state.dragY !== null
      surface.hit(scrollbarX, y + pad.top, trackWidth, viewportH, () => {}, {
        key: scrollbarKey,
        cursor: "pointer",
        onPointerDown: (_localX, localY) => {
          const localTrackY = localY - (y + pad.top)
          const direction = localTrackY < thumb.y ? -1 : 1
          state.top = clamp(state.top + direction * viewportH * 0.85, 0, maxScrollY)
          surface.requestRender()
        },
      })
      surface.hit(scrollbarX, thumbY, trackWidth, thumb.h, () => {}, {
        key: thumbKey,
        cursor: "pointer",
        onPointerDown: (_localX, localY) => {
          state.dragY = {startY: localY, startTop: state.top}
        },
        onPointerMove: (_localX, localY) => {
          if (state.dragY === null) return
          const range = Math.max(1, viewportH - thumb.h)
          const contentRange = Math.max(1, contentH - viewportH)
          const next = state.dragY.startTop + ((localY - state.dragY.startY) / range) * contentRange
          state.top = clamp(next, 0, maxScrollY)
          surface.requestRender()
        },
        onPointerUp: () => {
          state.dragY = null
        },
      })
      const scrollbarOpts = {
        offset: state.top,
        visible: viewportH,
        total: contentH,
        trackWidth,
      }
      scrollbar(surface, scrollbarX, y + pad.top, viewportH, {
        ...scrollbarOpts,
        ...(style.scrollbarTrackColor === undefined ? {} : {trackColor: cssColor(style.scrollbarTrackColor)}),
        ...(style.scrollbarColor === undefined || !active ? {} : {thumbColor: cssColor(style.scrollbarColor)}),
      })
    }

    if (scrollableX && (overflowX === "scroll" || maxScrollX > 0)) {
      const scrollbarY = y + height - trackWidth - scrollbarInset
      const scrollbarKey = `${key}:scrollbar:x`
      const thumb = scrollbarThumbMetrics(state.left, viewportW, contentW)
      const thumbX = x + pad.left + thumb.y
      const thumbKey = `${key}:scrollbar:x:thumb`
      const thumbState = surface.hitState(thumbX, scrollbarY, thumb.h, trackWidth, thumbKey)
      const active = thumbState.hovered || thumbState.pressed || state.dragX !== null
      surface.hit(x + pad.left, scrollbarY, viewportW, trackWidth, () => {}, {
        key: scrollbarKey,
        cursor: "pointer",
        onPointerDown: (localX) => {
          const localTrackX = localX - (x + pad.left)
          const direction = localTrackX < thumb.y ? -1 : 1
          state.left = clamp(state.left + direction * viewportW * 0.85, 0, maxScrollX)
          surface.requestRender()
        },
      })
      surface.hit(thumbX, scrollbarY, thumb.h, trackWidth, () => {}, {
        key: thumbKey,
        cursor: "pointer",
        onPointerDown: (localX) => {
          state.dragX = {startX: localX, startLeft: state.left}
        },
        onPointerMove: (localX) => {
          if (state.dragX === null) return
          const range = Math.max(1, viewportW - thumb.h)
          const contentRange = Math.max(1, contentW - viewportW)
          const next = state.dragX.startLeft + ((localX - state.dragX.startX) / range) * contentRange
          state.left = clamp(next, 0, maxScrollX)
          surface.requestRender()
        },
        onPointerUp: () => {
          state.dragX = null
        },
      })
      horizontalScrollbar(surface, x + pad.left, scrollbarY, viewportW, {
        offset: state.left,
        visible: viewportW,
        total: contentW,
        trackWidth,
        ...(style.scrollbarTrackColor === undefined ? {} : {trackColor: cssColor(style.scrollbarTrackColor)}),
        ...(style.scrollbarColor === undefined || !active ? {} : {thumbColor: cssColor(style.scrollbarColor)}),
      })
    }
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
    state = {top: 0, left: 0, dragY: null, dragX: null}
    byKey.set(key, state)
  } else {
    state.left ??= 0
    state.dragY ??= null
    state.dragX ??= null
  }
  return state
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function scrollbarThumbMetrics(offset: number, visible: number, total: number): {y: number; h: number} {
  const thumbH = Math.max(16, Math.floor(visible * (visible / total)))
  const range = visible - thumbH
  const maxOffset = Math.max(1, total - visible)
  return {
    y: Math.floor(range * (offset / maxOffset)),
    h: thumbH,
  }
}

function horizontalScrollbar(
  surface: UiSurface,
  x: number,
  y: number,
  w: number,
  opts: {
    offset: number
    visible: number
    total: number
    trackWidth: number
    minThumbHeight?: number
    trackColor?: Color
    thumbColor?: Color
    thumbWidth?: number
  },
): void {
  if (opts.total <= opts.visible) return
  const th = opts.trackWidth
  const minThumb = opts.minThumbHeight ?? 16
  const trackColor = opts.trackColor ?? cssColor("rgba(149, 164, 186, 0.16)")
  const thumbColor = opts.thumbColor ?? cssColor("rgba(149, 164, 186, 0.62)")

  surface.drawRoundedRect(x, y, w, th, {
    radius: th / 2,
    fill: trackColor,
    z: Z.SEPARATOR,
  })

  const ratio = opts.visible / opts.total
  const thumbW = Math.max(minThumb, Math.floor(w * ratio))
  const range = w - thumbW
  const maxOffset = Math.max(1, opts.total - opts.visible)
  const thumbX = x + Math.floor(range * (opts.offset / maxOffset))
  const drawH = Math.min(th, opts.thumbWidth ?? Math.max(3, th - 2))
  const thumbY = y + (th - drawH) / 2
  surface.drawRoundedRect(thumbX, thumbY, thumbW, drawH, {
    radius: drawH / 2,
    fill: thumbColor,
    z: Z.TEXT,
  })
}

function wheelDeltaPx(event: WheelEvent, viewport: number, delta: number): number {
  const sign = Math.sign(delta)
  if (sign === 0) return 0
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return sign * Math.min(viewport, WHEEL_MAX_STEP_PX)
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return sign * Math.min(Math.abs(delta) * WHEEL_LINE_PX, WHEEL_MAX_STEP_PX)

  const px = Math.abs(delta)
  if (px <= TRACKPAD_LINEAR_PX) return delta * TRACKPAD_LINEAR_SPEED

  const linear = TRACKPAD_LINEAR_PX * TRACKPAD_LINEAR_SPEED
  const compressed = linear + Math.log1p(px - TRACKPAD_LINEAR_PX) * TRACKPAD_LOG_SPEED
  return sign * Math.min(compressed, TRACKPAD_MAX_STEP_PX)
}
