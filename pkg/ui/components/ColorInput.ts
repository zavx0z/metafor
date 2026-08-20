import {Color} from "@metafor/engine"
import {control, flexRow, uiShapeMetrics, type UiSurface} from "@ui/elements"
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
  onChange?(value: ColorInputValue): void
}

/** Draws one controlled RGBA swatch and exact hexadecimal editor. */
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
  const gap = uiShapeMetrics.tightGap
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: formatColorInputValue(value),
    disabled,
    submitOnEnter: true,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (!disabled && props.onChange !== undefined) {
    textFieldProps.onSubmit = (text) => {
      const next = parseColorInputValue(text)
      if (next !== null) props.onChange!(next)
    }
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap,
    alignItems: "stretch",
    items: [
      {width: uiShapeMetrics.iconActionSlot, height, draw: (slotX, slotY, slotW, slotH) => control(host, slotX, slotY, slotW, slotH, {
        style: {background: new Color(value.r, value.g, value.b, value.a)},
      })},
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        TextField(host, slotX, slotY, slotW, slotH, textFieldProps)
      }},
    ],
  })
}

/** Normalizes RGBA channels into immutable unit-range values. */
export function normalizeColorInputValue(value: Partial<ColorInputValue>): ColorInputValue {
  return {
    r: clampUnit(value.r ?? 0),
    g: clampUnit(value.g ?? 0),
    b: clampUnit(value.b ?? 0),
    a: clampUnit(value.a ?? 1),
  }
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

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
