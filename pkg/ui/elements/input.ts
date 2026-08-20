import type {HitOptions, UiSurface} from "./surface.ts"
import {div, type DivProps} from "./div.ts"
import {controlChromePadding, controlChromeRect} from "./control-shape.ts"
import {mergeStyle, px, textMaterial, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"
import {Z} from "./surface.ts"
import {drawIconCentered} from "./icon.ts"
import {uiIcons} from "./icons.ts"
import {
  blenderRgba8ToColor,
  blenderTheme,
  resolveNumericZoneColors,
  resolveWidgetColors,
  type BlenderWidgetState,
} from "./blender-theme.ts"

export type InputEditState = {
  value: string
  cursor: number
  selectionAnchor: number | null
}

export type InputKeyResult = {
  handled: boolean
  state: InputEditState
  valueChanged: boolean
  stateChanged: boolean
  submit: boolean
  paste: boolean
}

export type InputKeyOptions = {
  submitOnEnter?: boolean
  allowTab?: boolean
}

export type InputGroupedCellCorners = Readonly<{
  topLeft: boolean
  topRight: boolean
  bottomLeft: boolean
  bottomRight: boolean
}>

export type InputGroupedCellAppearance = Readonly<{
  kind: "grouped-cell"
  corners: InputGroupedCellCorners
}>

export type InputAppearance = "standalone" | InputGroupedCellAppearance
export type InputType = "text" | "number" | "range"

export type InputProps = DivProps & {
  value?: string
  placeholder?: string
  active?: boolean
  disabled?: boolean
  cursor?: number
  selectionAnchor?: number | null
  cursorVisible?: boolean
  fontPx?: number
  appearance?: InputAppearance
  type?: InputType
  onActivate?: () => void
  onChange?: (value: string, state: InputEditState) => void
  onSubmit?: (value: string, state: InputEditState) => void
  submitOnEnter?: boolean
  allowTab?: boolean
}

type InputRuntimeConfig = {
  controlled: boolean
  onChange: ((value: string, state: InputEditState) => void) | undefined
  onSubmit: ((value: string, state: InputEditState) => void) | undefined
  submitOnEnter: boolean
  allowTab: boolean
}

type InputRuntimeState = {
  activeKey: string | null
  drag: {key: string; anchor: number} | null
  blinkKey: string | null
  caretVisible: boolean
  blinkTimer: ReturnType<typeof setInterval> | null
  values: Map<string, InputEditState>
  configs: Map<string, InputRuntimeConfig>
}

const inputRuntime = new WeakMap<UiSurface, InputRuntimeState>()
const INPUT_CARET_BLINK_MS = 530

export function createInputEditState(value = "", cursor = value.length): InputEditState {
  return clampInputState({value, cursor, selectionAnchor: null})
}

export function insertInputText(state: InputEditState, text: string): InputEditState {
  if (text.length === 0) return clampInputState(state)
  return replaceInputSelection(state, text)
}

export function handleInputKey(state: InputEditState, event: KeyboardEvent, opts: InputKeyOptions = {}): InputKeyResult {
  const current = clampInputState(state)
  const isMod = event.metaKey || event.ctrlKey
  const key = event.key

  const done = (next: InputEditState, valueChanged: boolean, extra: Partial<Pick<InputKeyResult, "submit" | "paste">> = {}): InputKeyResult => {
    event.preventDefault()
    const normalized = clampInputState(next)
    return {
      handled: true,
      state: normalized,
      valueChanged,
      stateChanged: valueChanged || !sameInputState(current, normalized),
      submit: extra.submit === true,
      paste: extra.paste === true,
    }
  }

  if (isMod) {
    const k = key.toLowerCase()
    if (k === "a") return done({value: current.value, cursor: current.value.length, selectionAnchor: 0}, false)
    if (k === "v") return done(current, false, {paste: true})
    if (key === "ArrowLeft" || key === "Home") return done(moveInputCursor(current, 0, event.shiftKey), false)
    if (key === "ArrowRight" || key === "End") return done(moveInputCursor(current, current.value.length, event.shiftKey), false)
    return inputUnhandled(current)
  }

  if (key === "Enter") {
    if (opts.submitOnEnter === true) return done(current, false, {submit: true})
    return inputUnhandled(current)
  }
  if (key === "Backspace") return done(backspaceInput(current), true)
  if (key === "Delete") return done(deleteInput(current), true)
  if (key === "ArrowLeft") return done(stepInputCursor(current, -1, event.shiftKey), false)
  if (key === "ArrowRight") return done(stepInputCursor(current, 1, event.shiftKey), false)
  if (key === "Home") return done(moveInputCursor(current, 0, event.shiftKey), false)
  if (key === "End") return done(moveInputCursor(current, current.value.length, event.shiftKey), false)
  if (key === "Tab" && opts.allowTab === true) return done(replaceInputSelection(current, "\t"), true)
  if (key.length === 1 && !event.ctrlKey && !event.metaKey) return done(replaceInputSelection(current, key), true)

  return inputUnhandled(current)
}

export function handleActiveInputKey(surface: UiSurface, event: KeyboardEvent): boolean {
  const runtime = inputRuntime.get(surface)
  if (runtime?.activeKey === null || runtime === undefined) return false
  const key = runtime.activeKey
  const current = runtime.values.get(key)
  if (current === undefined) return false
  const config = runtime.configs.get(key)
  const opts: InputKeyOptions = {}
  if (config !== undefined) {
    opts.submitOnEnter = config.submitOnEnter
    opts.allowTab = config.allowTab
  }
  const result = handleInputKey(current, event, opts)
  if (!result.handled) return false
  if (result.paste) {
    void pasteIntoActiveInput(surface)
    return true
  }
  resetInputBlink(surface, runtime, key)
  applyInputResult(surface, key, result.state, config)
  if (result.submit) config?.onSubmit?.(result.state.value, result.state)
  return true
}

export function insertActiveInputText(surface: UiSurface, text: string): boolean {
  const runtime = inputRuntime.get(surface)
  if (runtime?.activeKey === null || runtime === undefined) return false
  const key = runtime.activeKey
  const current = runtime.values.get(key)
  if (current === undefined) return false
  const config = runtime.configs.get(key)
  resetInputBlink(surface, runtime, key)
  applyInputResult(surface, key, insertInputText(current, text), config)
  return true
}

export function surfaceHasActiveInput(surface: UiSurface): boolean {
  const runtime = inputRuntime.get(surface)
  return runtime !== undefined && runtime.activeKey !== null
}

export function focusInput(surface: UiSurface, key: string, state?: InputEditState): void {
  const runtime = inputRuntimeFor(surface)
  if (state !== undefined) runtime.values.set(key, clampInputState(state))
  runtime.activeKey = key
  resetInputBlink(surface, runtime, key)
}

export function input(surface: UiSurface, x: number, y: number, width: number, height: number, props: InputProps): void {
  const style = mergeStyle(props)
  const disabled = props.disabled === true
  const groupedAppearance = typeof props.appearance === "object" && props.appearance.kind === "grouped-cell"
    ? props.appearance
    : null
  const groupedCell = groupedAppearance !== null
  const fontPx = props.fontPx ?? px(style.fontSize, uiShapeMetrics.compactFontPx)
  const chrome = controlChromeRect(x, y, width, height, style)
  const padding = controlChromePadding(style)
  const runtime = inputRuntimeFor(surface)
  const key = props.key ?? inputKeyFor(x, y, width, height)
  surface.registerRenderKey(key)
  const hitState = surface.hitState(x, y, width, height, key)
  const initialValue = props.value ?? (typeof props.children === "string" || typeof props.children === "number" ? String(props.children) : "")
  const controlled = props.onChange !== undefined
  const state = inputStateFor(runtime, key, initialValue, controlled, props)
  const active = (props.active ?? runtime.activeKey === key) && !disabled
  const widgetClass = inputWidgetClass(props.type)
  const widgetState: BlenderWidgetState = {
    hovered: hitState.hovered,
    pressed: hitState.pressed,
    selected: active,
    disabled,
    textInput: active,
    numericZone: inputNumericZone(surface, chrome, hitState.hovered, props.type),
  }
  const colors = resolveWidgetColors(widgetClass, widgetState)
  const value = state.value
  const cursor = state.cursor
  const selectionAnchor = state.selectionAnchor
  const contentX = chrome.x + padding.left
  const contentW = Math.max(1, chrome.width - padding.left - padding.right)
  const view = inputTextView(surface, value, cursor, fontPx, contentW)
  if (active && props.cursorVisible !== false) ensureInputBlink(surface, runtime, key)
  runtime.configs.set(key, {
    controlled,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    submitOnEnter: props.submitOnEnter === true,
    allowTab: props.allowTab === true,
  })

  const chromeStyle: StyleProps = {
    ...style,
    borderColor: style.borderColor === undefined ? groupedCell ? null : blenderRgba8ToColor(colors.outline) : style.borderColor,
    borderRadius: style.borderRadius ?? (groupedCell ? 0 : uiShapeMetrics.lowRadius),
    borderWidth: style.borderWidth ?? (groupedCell ? 0 : uiShapeMetrics.borderWidth),
  }
  if (style.background === undefined && style.backgroundColor === undefined) {
    chromeStyle.background = groupedCell ? active ? blenderRgba8ToColor(colors.inner) : null : blenderRgba8ToColor(colors.inner)
  }
  const chromeProps: DivProps = {style: chromeStyle}
  chromeProps.key = key
  if (groupedAppearance !== null && active) drawGroupedInputChrome(surface, chrome, chromeStyle, groupedAppearance.corners)
  else div(surface, chrome.x, chrome.y, chrome.width, chrome.height, chromeProps)
  drawNumericInputZone(surface, chrome, widgetClass, widgetState)
  if (!disabled) {
    const hit: HitOptions = {
      key,
      cursor: "text",
      onPointerDown: (localX, _localY, event) => {
        const next = {...inputStateFor(runtime, key, initialValue, controlled, props)}
        const nextCursor = inputIndexFromX(surface, next.value, inputTextView(surface, next.value, next.cursor, fontPx, contentW).start, fontPx, localX - contentX)
        const anchor = event?.shiftKey === true ? next.selectionAnchor ?? next.cursor : null
        runtime.activeKey = key
        runtime.drag = {key, anchor: anchor ?? nextCursor}
        next.cursor = nextCursor
        next.selectionAnchor = anchor
        applyInputResult(surface, key, clampInputState(next), runtime.configs.get(key))
        resetInputBlink(surface, runtime, key)
        props.onActivate?.()
        props.onPointerDown?.(localX, _localY, event)
        surface.requestKeyedRender(key)
      },
      onPointerMove: (localX, localY, event) => {
        if (runtime.drag?.key !== key) return
        const current = inputStateFor(runtime, key, initialValue, controlled, props)
        const currentView = inputTextView(surface, current.value, current.cursor, fontPx, contentW)
        const nextCursor = inputIndexFromX(surface, current.value, currentView.start, fontPx, localX - contentX)
        if (nextCursor === current.cursor && current.selectionAnchor === runtime.drag.anchor) return
        applyInputResult(surface, key, {value: current.value, cursor: nextCursor, selectionAnchor: runtime.drag.anchor}, runtime.configs.get(key))
        resetInputBlink(surface, runtime, key)
        props.onPointerMove?.(localX, localY, event)
        surface.requestKeyedRender(key)
      },
      onPointerUp: (event) => {
        runtime.drag = null
        props.onPointerUp?.(event)
      },
    }
    if (props.onPointerEnter !== undefined) hit.onPointerEnter = props.onPointerEnter
    if (props.onPointerLeave !== undefined) hit.onPointerLeave = props.onPointerLeave
    surface.hit(x, y, width, height, () => props.onClick?.(), hit)
  }

  surface.pushClip(contentX, chrome.y, contentW, chrome.height)
  if (active) drawInputSelection(
    surface,
    value,
    selectionAnchor,
    cursor,
    view.start,
    contentX,
    chrome.y,
    chrome.height,
    fontPx,
    blenderRgba8ToColor(blenderTheme.widgets[widgetClass].item),
  )

  const hasValue = value.length > 0
  const text = hasValue ? view.text : props.placeholder ?? ""
  if (text.length > 0) {
    surface.drawText(text, contentX, chrome.y + (chrome.height - fontPx) / 2, {
      fontPx,
      material: textMaterial(surface, style.color ?? blenderRgba8ToColor(
        hasValue ? colors.text : resolveWidgetColors(widgetClass, {inactive: true}).text,
      )),
      maxWidthPx: contentW,
      z: Z.TEXT,
    })
  }

  if (active && props.cursorVisible !== false && runtime.caretVisible) {
    const cursorX = contentX + surface.measureText(value.slice(view.start, cursor), fontPx)
    surface.drawRect(
      Math.round(cursorX),
      Math.round(chrome.y + (chrome.height - fontPx) / 2),
      2,
      Math.max(1, fontPx + 2),
      blenderRgba8ToColor(blenderTheme.material.widgetTextCursor),
      Z.TEXT + 0.02,
    )
  }
  surface.popClip()
}

function drawGroupedInputChrome(
  surface: UiSurface,
  chrome: Readonly<{x: number; y: number; width: number; height: number}>,
  style: StyleProps,
  corners: InputGroupedCellCorners,
): void {
  if (!corners.topLeft && !corners.topRight && !corners.bottomLeft && !corners.bottomRight) {
    div(surface, chrome.x, chrome.y, chrome.width, chrome.height, {style: {...style, borderRadius: 0}})
    return
  }

  const radius = Math.min(uiShapeMetrics.lowRadius, chrome.width / 2, chrome.height / 2)
  if (radius <= 0) return
  drawGroupedInputChromePart(surface, chrome.x + radius, chrome.y, chrome.width - radius * 2, chrome.height, 0, style)
  drawGroupedInputChromePart(surface, chrome.x, chrome.y + radius, chrome.width, chrome.height - radius * 2, 0, style)
  drawGroupedInputCorner(surface, chrome.x, chrome.y, radius, corners.topLeft, style)
  drawGroupedInputCorner(surface, chrome.x + chrome.width - radius, chrome.y, radius, corners.topRight, style, "top-right")
  drawGroupedInputCorner(surface, chrome.x, chrome.y + chrome.height - radius, radius, corners.bottomLeft, style, "bottom-left")
  drawGroupedInputCorner(surface, chrome.x + chrome.width - radius, chrome.y + chrome.height - radius, radius, corners.bottomRight, style, "bottom-right")
}

function drawGroupedInputCorner(
  surface: UiSurface,
  x: number,
  y: number,
  radius: number,
  rounded: boolean,
  style: StyleProps,
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" = "top-left",
): void {
  if (!rounded) {
    drawGroupedInputChromePart(surface, x, y, radius, radius, 0, style)
    return
  }
  const patchX = corner === "top-right" || corner === "bottom-right" ? x - radius : x
  const patchY = corner === "bottom-left" || corner === "bottom-right" ? y - radius : y
  drawGroupedInputChromePart(surface, patchX, patchY, radius * 2, radius * 2, radius, style)
}

function drawGroupedInputChromePart(
  surface: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  style: StyleProps,
): void {
  if (width <= 0 || height <= 0) return
  div(surface, x, y, width, height, {style: {...style, borderRadius: radius}})
}

async function pasteIntoActiveInput(surface: UiSurface): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text.length > 0) insertActiveInputText(surface, text)
  } catch (err) {
    console.warn("input clipboard paste failed:", err)
  }
}

function applyInputResult(surface: UiSurface, key: string, state: InputEditState, config: InputRuntimeConfig | undefined): void {
  const runtime = inputRuntimeFor(surface)
  runtime.values.set(key, state)
  config?.onChange?.(state.value, state)
  surface.requestKeyedRender(key)
}

function inputRuntimeFor(surface: UiSurface): InputRuntimeState {
  let runtime = inputRuntime.get(surface)
  if (runtime === undefined) {
    runtime = {activeKey: null, drag: null, blinkKey: null, caretVisible: true, blinkTimer: null, values: new Map(), configs: new Map()}
    inputRuntime.set(surface, runtime)
  }
  return runtime
}

function ensureInputBlink(surface: UiSurface, runtime: InputRuntimeState, key: string): void {
  if (runtime.blinkKey !== key) {
    runtime.blinkKey = key
    runtime.caretVisible = true
  }
  if (runtime.blinkTimer !== null || typeof setInterval !== "function") return
  runtime.blinkTimer = setInterval(() => {
    const activeKey = runtime.blinkKey
    if (activeKey === null) return
    runtime.caretVisible = !runtime.caretVisible
    surface.requestKeyedRender(activeKey)
  }, INPUT_CARET_BLINK_MS)
}

function resetInputBlink(surface: UiSurface, runtime: InputRuntimeState, key: string): void {
  runtime.blinkKey = key
  runtime.caretVisible = true
  surface.requestKeyedRender(key)
}

function inputStateFor(runtime: InputRuntimeState, key: string, value: string, controlled: boolean, props: InputProps): InputEditState {
  const current = runtime.values.get(key)
  if (controlled) {
    const cursor = props.cursor ?? current?.cursor ?? value.length
    const selectionAnchor = props.selectionAnchor === undefined ? current?.selectionAnchor ?? null : props.selectionAnchor
    const next = clampInputState({value, cursor, selectionAnchor})
    runtime.values.set(key, next)
    return next
  }
  if (current !== undefined) return current
  const next = createInputEditState(value, value.length)
  runtime.values.set(key, next)
  return next
}

function inputKeyFor(x: number, y: number, width: number, height: number): string {
  return `input:${Math.round(x)}:${Math.round(y)}:${Math.round(width)}:${Math.round(height)}`
}

function inputUnhandled(state: InputEditState): InputKeyResult {
  return {handled: false, state, valueChanged: false, stateChanged: false, submit: false, paste: false}
}

function sameInputState(a: InputEditState, b: InputEditState): boolean {
  return a.value === b.value && a.cursor === b.cursor && a.selectionAnchor === b.selectionAnchor
}

function clampInputState(state: InputEditState): InputEditState {
  const value = state.value
  const cursor = clampIndex(state.cursor, value.length)
  const selectionAnchor = state.selectionAnchor === null ? null : clampIndex(state.selectionAnchor, value.length)
  return {value, cursor, selectionAnchor}
}

function clampIndex(index: number, max: number): number {
  if (!Number.isFinite(index)) return 0
  return Math.max(0, Math.min(max, Math.floor(index)))
}

function selectionRange(state: InputEditState): {start: number; end: number} | null {
  if (state.selectionAnchor === null || state.selectionAnchor === state.cursor) return null
  return {
    start: Math.min(state.selectionAnchor, state.cursor),
    end: Math.max(state.selectionAnchor, state.cursor),
  }
}

function replaceInputSelection(state: InputEditState, text: string): InputEditState {
  const current = clampInputState(state)
  const range = selectionRange(current)
  const start = range?.start ?? current.cursor
  const end = range?.end ?? current.cursor
  const value = current.value.slice(0, start) + text + current.value.slice(end)
  return {value, cursor: start + text.length, selectionAnchor: null}
}

function backspaceInput(state: InputEditState): InputEditState {
  const current = clampInputState(state)
  if (selectionRange(current) !== null) return replaceInputSelection(current, "")
  if (current.cursor <= 0) return current
  const value = current.value.slice(0, current.cursor - 1) + current.value.slice(current.cursor)
  return {value, cursor: current.cursor - 1, selectionAnchor: null}
}

function deleteInput(state: InputEditState): InputEditState {
  const current = clampInputState(state)
  if (selectionRange(current) !== null) return replaceInputSelection(current, "")
  if (current.cursor >= current.value.length) return current
  const value = current.value.slice(0, current.cursor) + current.value.slice(current.cursor + 1)
  return {value, cursor: current.cursor, selectionAnchor: null}
}

function stepInputCursor(state: InputEditState, delta: -1 | 1, extendSelection: boolean): InputEditState {
  const current = clampInputState(state)
  const range = selectionRange(current)
  if (!extendSelection && range !== null) return {value: current.value, cursor: delta < 0 ? range.start : range.end, selectionAnchor: null}
  return moveInputCursor(current, current.cursor + delta, extendSelection)
}

function moveInputCursor(state: InputEditState, cursor: number, extendSelection: boolean): InputEditState {
  const current = clampInputState(state)
  return {
    value: current.value,
    cursor: clampIndex(cursor, current.value.length),
    selectionAnchor: extendSelection ? current.selectionAnchor ?? current.cursor : null,
  }
}

function inputTextView(surface: UiSurface, value: string, cursor: number, fontPx: number, contentW: number): {start: number; text: string} {
  if (value.length === 0) return {start: 0, text: ""}
  let start = 0
  const available = Math.max(1, contentW - 4)
  if (surface.measureText(value.slice(0, cursor), fontPx) > available) {
    let lo = 0
    let hi = cursor
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (surface.measureText(value.slice(mid, cursor), fontPx) > available) lo = mid + 1
      else hi = mid
    }
    start = lo
  }
  return {start, text: value.slice(start)}
}

function inputIndexFromX(surface: UiSurface, value: string, viewStart: number, fontPx: number, x: number): number {
  if (value.length === 0 || x <= 0) return viewStart
  let prev = 0
  for (let i = viewStart; i < value.length; i++) {
    const next = surface.measureText(value.slice(viewStart, i + 1), fontPx)
    const mid = prev + (next - prev) / 2
    if (x < mid) return i
    prev = next
  }
  return value.length
}

function drawInputSelection(
  surface: UiSurface,
  value: string,
  anchor: number | null,
  cursor: number,
  viewStart: number,
  x: number,
  y: number,
  h: number,
  fontPx: number,
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  if (anchor === null || anchor === cursor) return
  const start = Math.max(viewStart, Math.min(anchor, cursor))
  const end = Math.max(start, Math.max(anchor, cursor))
  if (end <= viewStart) return
  const sx = x + surface.measureText(value.slice(viewStart, start), fontPx)
  const sw = surface.measureText(value.slice(start, end), fontPx)
  if (sw <= 0) return
  surface.drawRect(sx, y + 4, sw, Math.max(1, h - 8), color, Z.ELEMENT + 0.01)
}

function inputWidgetClass(type: InputType | undefined): "text" | "number" | "numberSlider" {
  if (type === "number") return "number"
  if (type === "range") return "numberSlider"
  return "text"
}

function inputNumericZone(
  surface: UiSurface,
  chrome: Readonly<{x: number; y: number; width: number; height: number}>,
  hovered: boolean,
  type: InputType | undefined,
): "left" | "center" | "right" | null {
  if (!hovered || type !== "number") return null
  const pointer = surface.hoveredPointer()
  if (pointer === null) return null
  const handleWidth = Math.min(chrome.width / 3, chrome.height * 0.7)
  if (pointer.x < chrome.x + handleWidth) return "left"
  if (pointer.x > chrome.x + chrome.width - handleWidth) return "right"
  return "center"
}

function drawNumericInputZone(
  surface: UiSurface,
  chrome: Readonly<{x: number; y: number; width: number; height: number}>,
  kind: "text" | "number" | "numberSlider",
  state: BlenderWidgetState,
): void {
  if (kind === "text") return
  const zone = resolveNumericZoneColors(kind, state)
  if (zone === null) return
  const handleWidth = Math.min(chrome.width / 3, chrome.height * 0.7)
  const x = zone.zone === "left"
    ? chrome.x
    : zone.zone === "right"
      ? chrome.x + chrome.width - handleWidth
      : chrome.x + handleWidth
  const width = zone.zone === "center" ? Math.max(0, chrome.width - handleWidth * 2) : handleWidth
  const radius = zone.zone === "left"
    ? {tl: uiShapeMetrics.lowRadius, tr: 0, br: 0, bl: uiShapeMetrics.lowRadius}
    : zone.zone === "right"
      ? {tl: 0, tr: uiShapeMetrics.lowRadius, br: uiShapeMetrics.lowRadius, bl: 0}
      : 0
  surface.drawRoundedRect(x, chrome.y, width, chrome.height, {
    radius,
    fill: blenderRgba8ToColor(zone.colors.inner),
    border: null,
    borderWidth: 0,
    z: Z.ELEMENT + 0.01,
  })
  if (zone.zone !== "center") {
    drawIconCentered(
      surface,
      zone.zone === "left" ? uiIcons.chevronLeft : uiIcons.chevronRight,
      x + width / 2,
      chrome.y + chrome.height / 2,
      Math.min(uiShapeMetrics.iconGlyphSize, width, chrome.height),
      {tint: blenderRgba8ToColor(zone.colors.item), z: Z.TEXT},
    )
  }
}
