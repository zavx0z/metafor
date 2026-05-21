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
  drag: {startY: number; startTop: number} | null
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

  const overflowY = style.overflowY ?? style.overflow ?? "visible"
  const scrollable = overflowY === "auto" || overflowY === "scroll"

  if (typeof props.children === "function") {
    if (overflowY === "hidden" || scrollable) {
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
    const scrollGutter = scrollable ? trackWidth + 10 : 0
    const contentW = Math.max(1, width - pad.left - pad.right - scrollGutter)
    const viewportH = Math.max(1, height - pad.top - pad.bottom)
    const text = String(props.children)
    const fontSize = px(style.fontSize, 12)
    const lineHeight = px(typeof style.lineHeight === "number" ? `${style.lineHeight * fontSize}px` : style.lineHeight, Math.round(fontSize * 1.45))
    const lines = text.split(/\r?\n/)
    const contentH = Math.max(viewportH, lines.length * lineHeight)
    const key = props.key ?? `div:${x}:${y}:${width}:${height}`
    const state = divScrollState(surface, key)
    const maxScroll = Math.max(0, contentH - viewportH)
    state.top = clamp(state.top, 0, maxScroll)

    if (scrollable && maxScroll > 0) {
      surface.wheel(x, y, width, height, (event) => {
        const next = clamp(state.top + wheelDeltaPx(event, viewportH), 0, maxScroll)
        if (next === state.top) return
        state.top = next
        surface.requestRender()
      }, key)
    }

    const shouldClip = overflowY === "hidden" || scrollable
    if (shouldClip) surface.pushClip(x, y, width, height)
    if (lines.length === 1) {
      span(surface, contentX, contentY - (scrollable ? state.top : 0), contentW, viewportH, {
        children: text,
        style,
      })
    } else {
      for (const [i, line] of lines.entries()) {
        const lineY = contentY + i * lineHeight - (scrollable ? state.top : 0)
        if (lineY + lineHeight < y || lineY > y + height) continue
        span(surface, contentX, lineY, contentW, lineHeight, {
          children: line,
          style,
        })
      }
    }
    if (shouldClip) surface.popClip()

    if (scrollable && (overflowY === "scroll" || maxScroll > 0)) {
      const scrollbarX = x + width - trackWidth - 10
      const scrollbarKey = `${key}:scrollbar`
      const thumb = scrollbarThumbMetrics(state.top, viewportH, contentH)
      const thumbY = y + pad.top + thumb.y
      const thumbKey = `${key}:scrollbar:thumb`
      const thumbState = surface.hitState(scrollbarX, thumbY, trackWidth, thumb.h, thumbKey)
      const trackState = surface.hitState(scrollbarX, y + pad.top, trackWidth, viewportH, scrollbarKey)
      const active = thumbState.hovered || thumbState.pressed || state.drag !== null
      surface.hit(scrollbarX, y + pad.top, trackWidth, viewportH, () => {
        const pageDirection = trackState.hovered && !thumbState.hovered ? 1 : 0
        if (pageDirection === 0) return
        state.top = clamp(state.top + viewportH * 0.85, 0, maxScroll)
      }, {key: scrollbarKey, cursor: "pointer"})
      surface.hit(scrollbarX, thumbY, trackWidth, thumb.h, () => {}, {
        key: thumbKey,
        cursor: "pointer",
        onPointerDown: (_localX, localY) => {
          state.drag = {startY: localY, startTop: state.top}
        },
        onPointerMove: (_localX, localY) => {
          if (state.drag === null) return
          const range = Math.max(1, viewportH - thumb.h)
          const contentRange = Math.max(1, contentH - viewportH)
          const next = state.drag.startTop + ((localY - state.drag.startY) / range) * contentRange
          state.top = clamp(next, 0, maxScroll)
          surface.requestRender()
        },
        onPointerUp: () => {
          state.drag = null
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
    state = {top: 0, drag: null}
    byKey.set(key, state)
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

function wheelDeltaPx(event: WheelEvent, viewportH: number): number {
  const sign = Math.sign(event.deltaY)
  if (sign === 0) return 0
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return sign * Math.min(viewportH, WHEEL_MAX_STEP_PX)
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return sign * Math.min(Math.abs(event.deltaY) * WHEEL_LINE_PX, WHEEL_MAX_STEP_PX)

  const px = Math.abs(event.deltaY)
  if (px <= TRACKPAD_LINEAR_PX) return event.deltaY * TRACKPAD_LINEAR_SPEED

  const linear = TRACKPAD_LINEAR_PX * TRACKPAD_LINEAR_SPEED
  const compressed = linear + Math.log1p(px - TRACKPAD_LINEAR_PX) * TRACKPAD_LOG_SPEED
  return sign * Math.min(compressed, TRACKPAD_MAX_STEP_PX)
}
