import {Color} from "@metafor/engine"
import {Z, flexRow, palette, type StyleProps, type UiSurface} from "@ui/elements"
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

const COMPACT_STYLE: StyleProps = {
  background: new Color(0.235, 0.235, 0.235, 1),
  borderColor: new Color(0.11, 0.11, 0.11, 1),
  borderWidth: 1,
  borderRadius: 3,
  color: "#E6E6E6",
  fontSize: 11,
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
  const compact = props.density === "compact"
  const disabled = props.disabled === true || props.readOnly === true
  const value = normalizeColorInputValue(props.value)
  const gap = compact ? 3 : 7
  const radius = compact ? 3 : 6
  const border = compact ? new Color(0.11, 0.11, 0.11, 1) : palette.border
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: formatColorInputValue(value),
    disabled,
    submitOnEnter: true,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (compact) {
    textFieldProps.fontPx = 11
    textFieldProps.sx = COMPACT_STYLE
  }
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
      {width: height, height, draw: (slotX, slotY, slotW, slotH) => host.drawRoundedRect(slotX, slotY, slotW, slotH, {
        radius,
        fill: new Color(value.r, value.g, value.b, value.a),
        border,
        borderWidth: 1,
        z: Z.ELEMENT,
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
