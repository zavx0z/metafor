import type {HitOptions, UiSurface} from "./surface.ts"
import {div, type DivProps} from "./div.ts"
import {controlChromePadding, controlChromeRect} from "./control-shape.ts"
import {mergeStyle, px, textMaterial, type CssTextAlign, type StyleProps} from "./style.ts"
import {uiShapeMetrics} from "./shape.ts"
import {Z} from "./surface.ts"
import {drawIconCentered} from "./icon.ts"
import {uiIcons} from "./icons.ts"
import {
  drawGroupedCellChrome,
  groupedCellCornerRadii,
  isGroupedCellAppearance,
  type GroupedCellAppearance,
  type GroupedCellCorners,
} from "./grouped-cell.ts"
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

export type InputTextLayout = Readonly<{
  start: number
  text: string
  width: number
  originX: number
}>

export type InputGroupedCellCorners = GroupedCellCorners
export type InputGroupedCellAppearance = GroupedCellAppearance

export type InputAppearance = "standalone" | InputGroupedCellAppearance
export type InputType = "text" | "number" | "range"

export type InputNumericZone = "left" | "center" | "right"
export type InputNumericGesture =
  | Readonly<{kind: "start"; zone: InputNumericZone}>
  | Readonly<{kind: "scrub"; zone: InputNumericZone; deltaX: number; distanceX: number; shiftKey: boolean; ctrlKey: boolean}>
  | Readonly<{kind: "step"; direction: -1 | 1}>
  | Readonly<{kind: "text"}>
  | Readonly<{kind: "cancel"}>
  | Readonly<{kind: "end"}>

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
  onNumericGesture?: (gesture: InputNumericGesture) => void
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
  onNumericGesture: ((gesture: InputNumericGesture) => void) | undefined
}

type InputRuntimeState = {
  activeKey: string | null
  drag: {key: string; anchor: number} | null
  numericDrag: {
    key: string
    zone: InputNumericZone
    startX: number
    lastX: number
    dragging: boolean
  } | null
  blinkKey: string | null
  caretVisible: boolean
  blinkTimer: ReturnType<typeof setInterval> | null
  values: Map<string, InputEditState>
  configs: Map<string, InputRuntimeConfig>
}

const inputRuntime = new WeakMap<UiSurface, InputRuntimeState>()
const INPUT_CARET_BLINK_MS = 530
const INPUT_NUMERIC_DRAG_THRESHOLD_PX = uiShapeMetrics.tightGap + uiShapeMetrics.borderWidth

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
  if (runtime === undefined) return false
  if (runtime.numericDrag !== null && event.key === "Escape") {
    const key = runtime.numericDrag.key
    runtime.configs.get(key)?.onNumericGesture?.({kind: "cancel"})
    runtime.numericDrag = null
    event.preventDefault()
    surface.requestKeyedRender(key)
    return true
  }
  if (runtime.activeKey === null) return false
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
  const groupedAppearance = isGroupedCellAppearance(props.appearance) ? props.appearance : null
  const groupedCell = groupedAppearance !== null
  const fontPx = props.fontPx ?? px(style.fontSize, uiShapeMetrics.compactFontPx)
  const chrome = groupedAppearance === null
    ? controlChromeRect(x, y, width, height, style)
    : {x, y, width, height}
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
  const textAlign = style.textAlign ?? (props.type === "number" ? "right" : "left")
  const view = planInputTextLayout(surface, value, cursor, fontPx, contentX, contentW, textAlign)
  if (active && props.cursorVisible !== false) ensureInputBlink(surface, runtime, key)
  runtime.configs.set(key, {
    controlled,
    onChange: props.onChange,
    onSubmit: props.onSubmit,
    submitOnEnter: props.submitOnEnter === true,
    allowTab: props.allowTab === true,
    onNumericGesture: props.onNumericGesture,
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
  if (groupedAppearance !== null) drawGroupedCellChrome(surface, chrome, chromeStyle, groupedAppearance)
  else div(surface, chrome.x, chrome.y, chrome.width, chrome.height, chromeProps)
  drawNumericInputZone(surface, chrome, widgetClass, widgetState, groupedAppearance)
  if (!disabled) {
    const numericPointer = props.type === "number" && props.onNumericGesture !== undefined && !active
    const pointerZone = widgetState.numericZone
    const pointerCursor = numericPointer && pointerZone === "center" ? "ew-resize" : numericPointer ? "default" : "text"
    const hit: HitOptions = {
      key,
      cursor: pointerCursor,
      activeCursor: pointerCursor,
      onPointerDown: (localX, _localY, event) => {
        if (numericPointer) {
          if (event?.button === 2) {
            event.preventDefault()
            cancelNumericInputGesture(surface, runtime)
            return
          }
          if (event?.button !== undefined && event.button !== 0) return
          if (event?.ctrlKey === true) {
            cancelNumericInputGesture(surface, runtime)
            runtime.configs.get(key)?.onNumericGesture?.({kind: "text"})
            activateInputText(surface, runtime, key, initialValue, controlled, props, localX, _localY, contentX, contentW, fontPx, event)
            return
          }
          if (runtime.numericDrag !== null) cancelNumericInputGesture(surface, runtime)
          const zone = inputNumericZoneFromX(chrome, localX)
          runtime.activeKey = null
          runtime.drag = null
          runtime.numericDrag = {key, zone, startX: localX, lastX: localX, dragging: false}
          runtime.configs.get(key)?.onNumericGesture?.({kind: "start", zone})
          props.onPointerDown?.(localX, _localY, event)
          surface.requestKeyedRender(key)
          return
        }
        activateInputText(surface, runtime, key, initialValue, controlled, props, localX, _localY, contentX, contentW, fontPx, event)
      },
      onPointerMove: (localX, localY, event) => {
        const numeric = runtime.numericDrag
        if (numeric?.key === key) {
          const distanceX = localX - numeric.startX
          if (!numeric.dragging) {
            if (Math.abs(distanceX) < INPUT_NUMERIC_DRAG_THRESHOLD_PX) return
            numeric.dragging = true
            numeric.startX = localX
            numeric.lastX = localX
            props.onPointerMove?.(localX, localY, event)
            surface.requestKeyedRender(key)
            return
          }
          const deltaX = localX - numeric.lastX
          if (deltaX === 0) return
          numeric.lastX = localX
          runtime.configs.get(key)?.onNumericGesture?.({
            kind: "scrub",
            zone: numeric.zone,
            deltaX,
            distanceX,
            shiftKey: event?.shiftKey === true,
            ctrlKey: event?.ctrlKey === true,
          })
          props.onPointerMove?.(localX, localY, event)
          surface.requestKeyedRender(key)
          return
        }
        if (runtime.drag?.key !== key) return
        const current = inputStateFor(runtime, key, initialValue, controlled, props)
        const currentView = planInputTextLayout(surface, current.value, current.cursor, fontPx, contentX, contentW, textAlign)
        const nextCursor = inputIndexFromX(surface, current.value, currentView.start, fontPx, localX - currentView.originX)
        if (nextCursor === current.cursor && current.selectionAnchor === runtime.drag.anchor) return
        applyInputResult(surface, key, {value: current.value, cursor: nextCursor, selectionAnchor: runtime.drag.anchor}, runtime.configs.get(key))
        resetInputBlink(surface, runtime, key)
        props.onPointerMove?.(localX, localY, event)
        surface.requestKeyedRender(key)
      },
      onPointerUp: (event) => {
        const numeric = runtime.numericDrag
        if (numeric?.key === key) {
          if (!numeric.dragging) {
            if (numeric.zone === "left" || numeric.zone === "right") {
              runtime.configs.get(key)?.onNumericGesture?.({
                kind: "step",
                direction: numeric.zone === "left" ? -1 : 1,
              })
            }
            else {
              runtime.configs.get(key)?.onNumericGesture?.({kind: "text"})
              activateInputText(
                surface,
                runtime,
                key,
                initialValue,
                controlled,
                props,
                numeric.startX,
                chrome.y + chrome.height / 2,
                contentX,
                contentW,
                fontPx,
                event,
                false,
              )
            }
          }
          runtime.configs.get(key)?.onNumericGesture?.({kind: "end"})
          runtime.numericDrag = null
          props.onPointerUp?.(event)
          surface.requestKeyedRender(key)
          return
        }
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
    view,
    chrome.y,
    chrome.height,
    fontPx,
    blenderRgba8ToColor(blenderTheme.widgets[widgetClass].item),
  )

  const hasValue = value.length > 0
  const placeholder = props.placeholder ?? ""
  const display = hasValue
    ? view
    : planInputTextLayout(surface, placeholder, 0, fontPx, contentX, contentW, textAlign)
  const text = hasValue ? display.text : placeholder
  if (text.length > 0) {
    surface.drawText(text, display.originX, chrome.y + (chrome.height - fontPx) / 2, {
      fontPx,
      material: textMaterial(surface, style.color ?? blenderRgba8ToColor(
        hasValue ? colors.text : resolveWidgetColors(widgetClass, {inactive: true}).text,
      )),
      maxWidthPx: contentW,
      z: Z.TEXT,
    })
  }

  if (active && props.cursorVisible !== false && runtime.caretVisible) {
    const cursorX = view.originX + surface.measureText(value.slice(view.start, cursor), fontPx)
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
    runtime = {
      activeKey: null,
      drag: null,
      numericDrag: null,
      blinkKey: null,
      caretVisible: true,
      blinkTimer: null,
      values: new Map(),
      configs: new Map(),
    }
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

/** Resolves one horizontal origin shared by text, caret, selection and pointer indexing. */
export function planInputTextLayout(
  surface: UiSurface,
  value: string,
  cursor: number,
  fontPx: number,
  contentX: number,
  contentW: number,
  align: CssTextAlign = "left",
): InputTextLayout {
  const availableWidth = Math.max(0, contentW)
  const view = inputTextView(surface, value, cursor, fontPx, availableWidth)
  const width = Math.min(availableWidth, surface.measureText(view.text, fontPx))
  const free = Math.max(0, availableWidth - width)
  const originX = contentX + (align === "right" ? free : align === "center" ? free / 2 : 0)
  return Object.freeze({...view, width, originX})
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
  layout: InputTextLayout,
  y: number,
  h: number,
  fontPx: number,
  color: ReturnType<typeof blenderRgba8ToColor>,
): void {
  if (anchor === null || anchor === cursor) return
  const start = Math.max(layout.start, Math.min(anchor, cursor))
  const end = Math.max(start, Math.max(anchor, cursor))
  if (end <= layout.start) return
  const sx = layout.originX + surface.measureText(value.slice(layout.start, start), fontPx)
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
  return inputNumericZoneFromX(chrome, pointer.x)
}

function inputNumericZoneFromX(
  chrome: Readonly<{x: number; width: number; height: number}>,
  pointerX: number,
): InputNumericZone {
  const handleWidth = Math.min(chrome.width / 3, chrome.height * 0.7)
  if (pointerX < chrome.x + handleWidth) return "left"
  if (pointerX > chrome.x + chrome.width - handleWidth) return "right"
  return "center"
}

function activateInputText(
  surface: UiSurface,
  runtime: InputRuntimeState,
  key: string,
  initialValue: string,
  controlled: boolean,
  props: InputProps,
  localX: number,
  localY: number,
  contentX: number,
  contentW: number,
  fontPx: number,
  event: MouseEvent | undefined,
  notifyPointerDown = true,
): void {
  const next = {...inputStateFor(runtime, key, initialValue, controlled, props)}
  const style = mergeStyle(props)
  const align = style.textAlign ?? (props.type === "number" ? "right" : "left")
  const layout = planInputTextLayout(surface, next.value, next.cursor, fontPx, contentX, contentW, align)
  const nextCursor = inputIndexFromX(
    surface,
    next.value,
    layout.start,
    fontPx,
    localX - layout.originX,
  )
  const anchor = event?.shiftKey === true ? next.selectionAnchor ?? next.cursor : null
  runtime.activeKey = key
  runtime.drag = {key, anchor: anchor ?? nextCursor}
  next.cursor = nextCursor
  next.selectionAnchor = anchor
  applyInputResult(surface, key, clampInputState(next), runtime.configs.get(key))
  resetInputBlink(surface, runtime, key)
  props.onActivate?.()
  if (notifyPointerDown) props.onPointerDown?.(localX, localY, event)
  surface.requestKeyedRender(key)
}

function cancelNumericInputGesture(surface: UiSurface, runtime: InputRuntimeState): void {
  const numeric = runtime.numericDrag
  if (numeric === null) return
  runtime.configs.get(numeric.key)?.onNumericGesture?.({kind: "cancel"})
  runtime.numericDrag = null
  surface.requestKeyedRender(numeric.key)
}

function drawNumericInputZone(
  surface: UiSurface,
  chrome: Readonly<{x: number; y: number; width: number; height: number}>,
  kind: "text" | "number" | "numberSlider",
  state: BlenderWidgetState,
  groupedAppearance: GroupedCellAppearance | null,
): void {
  if (kind === "text") return
  if (!state.numericZone || !state.hovered || state.textInput) return
  const handleWidth = Math.min(chrome.width / 3, chrome.height * 0.7)
  const cellRadii = groupedCellCornerRadii(groupedAppearance)
  for (const target of ["left", "center", "right"] as const) {
    const zone = resolveNumericZoneColors(kind, state, target)
    if (zone === null) continue
    const x = target === "left"
      ? chrome.x
      : target === "right"
        ? chrome.x + chrome.width - handleWidth
        : chrome.x + handleWidth
    const width = target === "center" ? Math.max(0, chrome.width - handleWidth * 2) : handleWidth
    const radius = target === "left"
      ? {tl: cellRadii.tl, tr: 0, br: 0, bl: cellRadii.bl}
      : target === "right"
        ? {tl: 0, tr: cellRadii.tr, br: cellRadii.br, bl: 0}
        : 0
    surface.drawRoundedRect(x, chrome.y, width, chrome.height, {
      radius,
      fill: blenderRgba8ToColor(zone.colors.inner),
      border: null,
      borderWidth: 0,
      z: Z.ELEMENT + 0.01,
    })
    if (target !== "center") {
      drawIconCentered(
        surface,
        target === "left" ? uiIcons.chevronLeft : uiIcons.chevronRight,
        x + width / 2,
        chrome.y + chrome.height / 2,
        Math.min(uiShapeMetrics.iconGlyphSize, width, chrome.height),
        {tint: blenderRgba8ToColor(zone.colors.item), z: Z.TEXT},
      )
    }
  }
}
