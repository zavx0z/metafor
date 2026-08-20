import {
  blenderRgba8ToColor,
  button,
  div,
  flexColumn,
  flexRow,
  popover,
  resolveWidgetColors,
  uiShapeMetrics,
  Z,
  type ButtonElementProps,
  type PopoverProps,
  type UiSurface,
} from "@ui/elements"
import {
  colorPickerPlane,
  colorPickerSwatch,
  type ColorPickerValue,
} from "./internal/color-picker.ts"

export type ColorInputValue = Readonly<{
  r: number
  g: number
  b: number
  a: number
}>

export type ColorInputDensity = "regular" | "compact"
export type ColorInputPresentation = "compact" | "expanded"

export type ColorInputProps = {
  key?: string
  value: ColorInputValue
  disabled?: boolean
  readOnly?: boolean
  density?: ColorInputDensity
  presentation?: ColorInputPresentation
  open?: boolean
  onChange?(value: ColorInputValue): void
  onOpenChange?(open: boolean): void
}

type ColorInputRuntime = {
  drafts: Map<string, Readonly<{value: ColorInputValue; source: string}>>
}

const colorInputRuntime = new WeakMap<UiSurface, ColorInputRuntime>()
const PICKER_WHEEL_SIZE = 112
const PICKER_SLIDER_WIDTH = 14
const PICKER_GAP = uiShapeMetrics.tightGap
const PICKER_TOP_WIDTH = PICKER_WHEEL_SIZE + PICKER_GAP + PICKER_SLIDER_WIDTH
const PICKER_BAR_HEIGHT = uiShapeMetrics.controlHeight
const PICKER_EXPANDED_HEIGHT = PICKER_WHEEL_SIZE + PICKER_GAP + PICKER_BAR_HEIGHT
const PICKER_PADDING = 6
const PICKER_POPUP_WIDTH = PICKER_TOP_WIDTH + PICKER_PADDING * 2
const PICKER_POPUP_HEIGHT = PICKER_EXPANDED_HEIGHT + PICKER_PADDING * 2

/** Draws a compact disclosure swatch or the exact expanded Blender color template. */
export function ColorInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: ColorInputProps,
): void {
  const disabled = props.disabled === true || props.readOnly === true
  const value = normalizeColorInputValue(props.value)
  const key = props.key ?? `color-input:${x}:${y}:${width}:${height}`
  const runtime = runtimeFor(host)
  const presentation = props.presentation ?? "compact"
  if (presentation === "expanded") {
    drawExpandedColor(host, x, y, width, height, key, value, disabled, props.onChange, runtime, props.value)
    return
  }
  drawCompactColor(host, x, y, width, height, key, value, disabled, props, runtime)
}

/** Exact intrinsic expanded height at the shared control scale. */
export function measureColorInputHeight(presentation: ColorInputPresentation = "compact"): number {
  return presentation === "expanded" ? PICKER_EXPANDED_HEIGHT : uiShapeMetrics.controlHeight
}

function drawCompactColor(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string,
  value: ColorInputValue,
  disabled: boolean,
  props: ColorInputProps,
  runtime: ColorInputRuntime,
): void {
  const popoverProps: PopoverProps = {
    key,
    ...(props.open === undefined ? {} : {open: disabled ? false : props.open}),
    contentSize: {width: Math.max(width, PICKER_POPUP_WIDTH), height: PICKER_POPUP_HEIGHT},
    onOpenChange(open) {
      if (!open) setPickerDraft(runtime, key, value, value)
      props.onOpenChange?.(open)
    },
    trigger(context) {
      drawColorBarButton(host, x, y, width, height, `${key}:swatch`, value, context.open, disabled, context.toggle)
    },
    content(rect) {
      const menu = resolveWidgetColors("menuBack")
      div(host, rect.x, rect.y, rect.w, rect.h, {
        style: {
          background: blenderRgba8ToColor(menu.inner),
          borderColor: blenderRgba8ToColor(menu.outline),
          borderRadius: uiShapeMetrics.lowRadius,
          borderWidth: uiShapeMetrics.borderWidth,
          zIndex: Z.ELEMENT + 0.2,
        },
      })
      const padding = Math.min(PICKER_PADDING, rect.w / 2, rect.h / 2)
      drawExpandedColor(
        host,
        rect.x + padding,
        rect.y + padding,
        Math.max(0, rect.w - padding * 2),
        Math.max(0, rect.h - padding * 2),
        key,
        pickerDraft(runtime, key, value),
        disabled,
        props.onChange,
        runtime,
        props.value,
      )
    },
  }
  popover(host, x, y, width, height, popoverProps)
}

function drawExpandedColor(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string,
  value: ColorInputValue,
  disabled: boolean,
  onChange: ((value: ColorInputValue) => void) | undefined,
  runtime: ColorInputRuntime,
  sourceValue: ColorInputValue,
): void {
  if (width <= 0 || height <= 0) return
  const pickerValue = colorInputValueToPicker(value)
  const topHeight = Math.max(0, height - PICKER_GAP - PICKER_BAR_HEIGHT)
  const wheelSize = Math.max(0, Math.min(PICKER_WHEEL_SIZE, topHeight, width - PICKER_GAP - PICKER_SLIDER_WIDTH))
  const topWidth = wheelSize + PICKER_GAP + PICKER_SLIDER_WIDTH
  const publish = (next: ColorPickerValue): void => {
    const rgba = colorPickerValueToInput(next)
    setPickerDraft(runtime, key, rgba, sourceValue)
    onChange?.(rgba)
    host.requestKeyedRender(key)
  }
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: PICKER_GAP,
    alignItems: "center",
    items: [
      {height: topHeight, width: topWidth, draw: (topX, topY, topW, topH) => {
        flexRow({
          x: topX,
          y: topY,
          w: topW,
          h: topH,
          gap: PICKER_GAP,
          alignItems: "stretch",
          items: [
            {width: wheelSize, height: topH, draw: (slotX, slotY, slotW, slotH) => {
              colorPickerPlane(host, slotX, slotY, slotW, slotH, {
                key: `${key}:wheel`,
                mode: "wheel",
                value: pickerValue,
                disabled: disabled || onChange === undefined,
                onChange: publish,
              })
            }},
            {width: PICKER_SLIDER_WIDTH, height: topH, draw: (slotX, slotY, slotW, slotH) => {
              colorPickerPlane(host, slotX, slotY, slotW, slotH, {
                key: `${key}:value`,
                mode: "value",
                value: pickerValue,
                disabled: disabled || onChange === undefined,
                onChange: publish,
              })
            }},
          ],
        })
      }},
      {height: PICKER_BAR_HEIGHT, width, draw: (barX, barY, barW, barH) => {
        drawCurrentColorBar(host, barX, barY, barW, barH, pickerValue)
      }},
    ],
  })
}

function drawColorBarButton(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string,
  value: ColorInputValue,
  selected: boolean,
  disabled: boolean,
  onClick: () => void,
): void {
  const regular = resolveWidgetColors("regular", {
    ...(selected ? {pressed: true} : {}),
    ...(disabled ? {disabled: true} : {}),
  })
  const buttonProps: ButtonElementProps = {
    key,
    children: (_state, layout) => {
      drawCurrentColorBar(host, layout.chrome.x, layout.chrome.y, layout.chrome.width, layout.chrome.height, colorInputValueToPicker(value))
    },
    disabled,
    onClick,
    style: {
      background: null,
      borderColor: blenderRgba8ToColor(regular.outline),
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT + 0.24,
    },
  }
  button(host, x, y, width, height, buttonProps)
}

function drawCurrentColorBar(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  value: ColorPickerValue,
): void {
  const inset = Math.min(uiShapeMetrics.borderWidth, width / 2, height / 2)
  colorPickerSwatch(host, x + inset, y + inset, Math.max(0, width - inset * 2), Math.max(0, height - inset * 2), value)
  const regular = resolveWidgetColors("regular")
  div(host, x, y, width, height, {
    style: {
      background: null,
      borderColor: blenderRgba8ToColor(regular.outline),
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT_RULE + 0.22,
    },
  })
}

function runtimeFor(host: UiSurface): ColorInputRuntime {
  let runtime = colorInputRuntime.get(host)
  if (runtime === undefined) {
    runtime = {drafts: new Map()}
    colorInputRuntime.set(host, runtime)
  }
  return runtime
}

function pickerDraft(runtime: ColorInputRuntime, key: string, value: ColorInputValue): ColorInputValue {
  const source = formatColorInputValue(value)
  const current = runtime.drafts.get(key)
  if (current === undefined || current.source !== source) {
    runtime.drafts.set(key, Object.freeze({value, source}))
    return value
  }
  return current.value
}

function setPickerDraft(
  runtime: ColorInputRuntime,
  key: string,
  value: ColorInputValue,
  sourceValue: ColorInputValue,
): void {
  runtime.drafts.set(key, Object.freeze({
    value: normalizeColorInputValue(value),
    source: formatColorInputValue(sourceValue),
  }))
}

/** Normalizes RGBA channels into immutable unit-range values. */
export function normalizeColorInputValue(value: Partial<ColorInputValue>): ColorInputValue {
  return Object.freeze({
    r: clampUnit(value.r ?? 0),
    g: clampUnit(value.g ?? 0),
    b: clampUnit(value.b ?? 0),
    a: clampUnit(value.a ?? 1),
  })
}

/** Formats normalized RGB or RGBA as exact two-digit hexadecimal channels. */
export function formatColorInputValue(value: Partial<ColorInputValue>, includeAlpha = true): string {
  const color = normalizeColorInputValue(value)
  const channel = (entry: number): string => Math.round(entry * 255).toString(16).padStart(2, "0").toUpperCase()
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${includeAlpha ? channel(color.a) : ""}`
}

/** Parses exact six- or eight-digit RGB(A) hexadecimal text. */
export function parseColorInputValue(value: string): ColorInputValue | null {
  const hex = value.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(hex)) return null
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  return normalizeColorInputValue({
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) : 1,
  })
}

/** Converts normalized RGBA to immutable hue/saturation/value/alpha. */
export function colorInputValueToPicker(value: Partial<ColorInputValue>): ColorPickerValue {
  const color = normalizeColorInputValue(value)
  const max = Math.max(color.r, color.g, color.b)
  const min = Math.min(color.r, color.g, color.b)
  const delta = max - min
  let hue = 0
  if (delta > 0) {
    if (max === color.r) hue = ((color.g - color.b) / delta) % 6
    else if (max === color.g) hue = (color.b - color.r) / delta + 2
    else hue = (color.r - color.g) / delta + 4
    hue /= 6
  }
  return Object.freeze({
    h: wrapUnit(hue),
    s: max <= 0 ? 0 : delta / max,
    v: max,
    a: color.a,
  })
}

/** Converts normalized HSVA to a new immutable RGBA value. */
export function colorPickerValueToInput(value: Partial<ColorPickerValue>): ColorInputValue {
  const hue = wrapUnit(value.h ?? 0) * 6
  const saturation = clampUnit(value.s ?? 0)
  const brightness = clampUnit(value.v ?? 0)
  const chroma = brightness * saturation
  const secondary = chroma * (1 - Math.abs((hue % 2) - 1))
  const match = brightness - chroma
  const sector = Math.floor(hue) % 6
  const rgb = sector === 0 ? [chroma, secondary, 0]
    : sector === 1 ? [secondary, chroma, 0]
      : sector === 2 ? [0, chroma, secondary]
        : sector === 3 ? [0, secondary, chroma]
          : sector === 4 ? [secondary, 0, chroma]
            : [chroma, 0, secondary]
  return normalizeColorInputValue({
    r: rgb[0]! + match,
    g: rgb[1]! + match,
    b: rgb[2]! + match,
    a: value.a ?? 1,
  })
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function wrapUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return ((value % 1) + 1) % 1
}
