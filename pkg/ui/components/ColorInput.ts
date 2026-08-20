import {Color} from "@metafor/engine"
import {
  button,
  flexColumn,
  flexRow,
  palette,
  uiShapeMetrics,
  Z,
  type ButtonElementProps,
  type UiSurface,
} from "@ui/elements"
import {
  colorPickerPlane,
  type ColorPickerValue,
} from "./internal/color-picker.ts"
import {TextField} from "./TextField.ts"

export type ColorInputValue = Readonly<{
  r: number
  g: number
  b: number
  a: number
}>

export type ColorInputDensity = "regular" | "compact"

export type ColorInputProps = {
  key?: string
  value: ColorInputValue
  disabled?: boolean
  readOnly?: boolean
  density?: ColorInputDensity
  open?: boolean
  onChange?(value: ColorInputValue): void
  onOpenChange?(open: boolean): void
}

type ColorInputRuntime = {
  openKeys: Set<string>
  drafts: Map<string, Readonly<{value: ColorInputValue; source: string}>>
}

const colorInputRuntime = new WeakMap<UiSurface, ColorInputRuntime>()
const PICKER_WHEEL_SIZE = 112
const PICKER_SLIDER_WIDTH = 14
const PICKER_PADDING = 6
const PICKER_TOP_WIDTH = PICKER_WHEEL_SIZE + uiShapeMetrics.tightGap * 2 + PICKER_SLIDER_WIDTH * 2
const PICKER_WIDTH = PICKER_TOP_WIDTH + PICKER_PADDING * 2
const PICKER_FOOTER_HEIGHT = uiShapeMetrics.controlHeight
const PICKER_HEIGHT = PICKER_PADDING * 2 + PICKER_WHEEL_SIZE + uiShapeMetrics.tightGap + PICKER_FOOTER_HEIGHT

/** Draws one controlled RGBA swatch, hexadecimal editor and retained analytical picker. */
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
  if (disabled) runtime.openKeys.delete(key)
  const open = !disabled && (props.open ?? runtime.openKeys.has(key))
  const draft = pickerDraft(runtime, key, value, open)
  host.registerRenderKey(key)
  drawClosedColorInput(host, x, y, width, height, key, value, open, disabled, props, runtime)
  if (open) {
    drawColorPickerPopup(host, x, y + height + uiShapeMetrics.separatorWidth, key, draft, disabled, props, runtime)
  }
}

function drawClosedColorInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  key: string,
  value: ColorInputValue,
  open: boolean,
  disabled: boolean,
  props: ColorInputProps,
  runtime: ColorInputRuntime,
): void {
  const textFieldProps: Parameters<typeof TextField>[5] = {
    key,
    value: formatColorInputValue(value),
    disabled,
    submitOnEnter: true,
  }
  if (!disabled && props.onChange !== undefined) {
    textFieldProps.onSubmit = (text) => {
      const next = parseColorInputValue(text)
      if (next === null) return
      setPickerDraft(runtime, key, next, value)
      props.onChange?.(next)
      host.requestKeyedRender(key)
    }
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: uiShapeMetrics.tightGap,
    alignItems: "stretch",
    items: [
      {width: uiShapeMetrics.iconActionSlot, height, draw: (slotX, slotY, slotW, slotH) => {
        drawSwatchButton(host, slotX, slotY, slotW, slotH, `${key}:swatch`, value, open, disabled, () => {
          const nextOpen = !open
          if (props.open === undefined) {
            if (nextOpen) runtime.openKeys.add(key)
            else runtime.openKeys.delete(key)
          }
          if (nextOpen) setPickerDraft(runtime, key, value, value)
          props.onOpenChange?.(nextOpen)
          host.requestKeyedRender(key)
        })
      }},
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        TextField(host, slotX, slotY, slotW, slotH, textFieldProps)
      }},
    ],
  })
}

function drawColorPickerPopup(
  host: UiSurface,
  x: number,
  y: number,
  key: string,
  value: ColorInputValue,
  disabled: boolean,
  props: ColorInputProps,
  runtime: ColorInputRuntime,
): void {
  host.drawRoundedRect(x, y, PICKER_WIDTH, PICKER_HEIGHT, {
    radius: uiShapeMetrics.lowRadius,
    fill: palette.bgPanel,
    border: palette.borderRule,
    borderWidth: uiShapeMetrics.borderWidth,
    z: Z.ELEMENT + 0.2,
  })
  const pickerValue = colorInputValueToPicker(value)
  const publish = (next: ColorPickerValue): void => {
    const rgba = colorPickerValueToInput(next)
    setPickerDraft(runtime, key, rgba, props.value)
    props.onChange?.(rgba)
    host.requestKeyedRender(key)
  }
  flexColumn({
    x: x + PICKER_PADDING,
    y: y + PICKER_PADDING,
    w: PICKER_TOP_WIDTH,
    h: PICKER_HEIGHT - PICKER_PADDING * 2,
    gap: uiShapeMetrics.tightGap,
    items: [
      {height: PICKER_WHEEL_SIZE, draw: (topX, topY, topW, topH) => {
        flexRow({
          x: topX,
          y: topY,
          w: topW,
          h: topH,
          gap: uiShapeMetrics.tightGap,
          alignItems: "stretch",
          items: [
            {width: PICKER_WHEEL_SIZE, height: topH, draw: (slotX, slotY, slotW, slotH) => {
              colorPickerPlane(host, slotX, slotY, slotW, slotH, {
                key: `${key}:wheel`,
                mode: "wheel",
                value: pickerValue,
                disabled: disabled || props.onChange === undefined,
                onChange: publish,
              })
            }},
            {width: PICKER_SLIDER_WIDTH, height: topH, draw: (slotX, slotY, slotW, slotH) => {
              colorPickerPlane(host, slotX, slotY, slotW, slotH, {
                key: `${key}:value`,
                mode: "value",
                value: pickerValue,
                disabled: disabled || props.onChange === undefined,
                onChange: publish,
              })
            }},
            {width: PICKER_SLIDER_WIDTH, height: topH, draw: (slotX, slotY, slotW, slotH) => {
              colorPickerPlane(host, slotX, slotY, slotW, slotH, {
                key: `${key}:alpha`,
                mode: "alpha",
                value: pickerValue,
                disabled: disabled || props.onChange === undefined,
                onChange: publish,
              })
            }},
          ],
        })
      }},
      {height: PICKER_FOOTER_HEIGHT, draw: (footerX, footerY, footerW, footerH) => {
        drawPickerFooter(host, footerX, footerY, footerW, footerH, key, value, disabled, props, runtime)
      }},
    ],
  })
}

function drawPickerFooter(
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
  const hexProps: Parameters<typeof TextField>[5] = {
    key: `${key}:picker-hex`,
    value: formatColorInputValue(value),
    disabled,
    submitOnEnter: true,
  }
  if (!disabled && props.onChange !== undefined) {
    hexProps.onSubmit = (text) => {
      const next = parseColorInputValue(text)
      if (next === null) return
      setPickerDraft(runtime, key, next, props.value)
      props.onChange?.(next)
      host.requestKeyedRender(key)
    }
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: uiShapeMetrics.tightGap,
    alignItems: "stretch",
    items: [
      {width: uiShapeMetrics.iconActionSlot, height, draw: (slotX, slotY, slotW, slotH) => {
        drawSwatchButton(host, slotX, slotY, slotW, slotH, `${key}:picker-swatch`, value, true, disabled, () => {
          if (props.open === undefined) runtime.openKeys.delete(key)
          props.onOpenChange?.(false)
          host.requestKeyedRender(key)
        })
      }},
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        TextField(host, slotX, slotY, slotW, slotH, hexProps)
      }},
    ],
  })
}

function drawSwatchButton(
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
  const buttonProps: ButtonElementProps = {
    key,
    children: false,
    disabled,
    onClick,
    style: (state) => ({
      background: new Color(value.r, value.g, value.b, value.a),
      borderColor: selected || state === "active" || state === "hover" ? "cyan" : "borderDim",
      borderRadius: uiShapeMetrics.lowRadius,
      borderWidth: uiShapeMetrics.borderWidth,
      zIndex: Z.ELEMENT + (selected ? 0.24 : 0),
    }),
  }
  button(host, x, y, width, height, buttonProps)
}

function runtimeFor(host: UiSurface): ColorInputRuntime {
  let runtime = colorInputRuntime.get(host)
  if (runtime === undefined) {
    runtime = {openKeys: new Set<string>(), drafts: new Map()}
    colorInputRuntime.set(host, runtime)
  }
  return runtime
}

function pickerDraft(runtime: ColorInputRuntime, key: string, value: ColorInputValue, open: boolean): ColorInputValue {
  const source = formatColorInputValue(value)
  const current = runtime.drafts.get(key)
  if (!open || current === undefined || current.source !== source) {
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
