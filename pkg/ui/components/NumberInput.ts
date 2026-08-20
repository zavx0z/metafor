import type {UiSurface} from "@ui/elements"
import {TextField} from "./TextField.ts"

export type NumberInputKind = "float" | "integer"
export type NumberInputDensity = "regular" | "compact"

export type NumberInputValueOptions = {
  numberKind?: NumberInputKind
  min?: number
  max?: number
  step?: number
  unit?: string
}

export type NumberInputFormatOptions = NumberInputValueOptions & {
  precision?: number
}

export type NumberInputProps = NumberInputFormatOptions & {
  key?: string
  value: number
  disabled?: boolean
  readOnly?: boolean
  density?: NumberInputDensity
  fontPx?: number
  onChange?(value: number): void
}

/** Draws one controlled scalar number editor without owning consumer state. */
export function NumberInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: NumberInputProps,
): void {
  const disabled = props.disabled === true || props.readOnly === true
  const textFieldProps: Parameters<typeof TextField>[5] = {
    value: formatNumberInputValue(props.value, props),
    disabled,
    submitOnEnter: true,
  }
  if (props.key !== undefined) textFieldProps.key = props.key
  if (props.fontPx !== undefined) textFieldProps.fontPx = props.fontPx
  if (!disabled && props.onChange !== undefined) {
    textFieldProps.onSubmit = (text) => {
      const value = parseNumberInputValue(text, props)
      if (value !== null) props.onChange!(value)
    }
  }
  TextField(host, x, y, width, height, textFieldProps)
}

/** Normalizes a scalar value against the public integer/float and hard-range contract. */
export function normalizeNumberInputValue(
  value: number,
  options: NumberInputValueOptions = {},
): number {
  const finite = Number.isFinite(value) ? value : finiteBound(options.min, 0)
  const minimum = finiteBound(options.min, Number.NEGATIVE_INFINITY)
  const maximum = Math.max(minimum, finiteBound(options.max, Number.POSITIVE_INFINITY))
  const clamped = Math.min(maximum, Math.max(minimum, finite))
  const step = Number.isFinite(options.step) && (options.step ?? 0) > 0 ? options.step! : undefined
  const stepBase = Number.isFinite(minimum) ? minimum : 0
  const stepped = step === undefined
    ? clamped
    : stepBase + Math.round((clamped - stepBase) / step) * step
  const normalized = Math.min(maximum, Math.max(minimum, stepped))
  return options.numberKind === "integer" ? Math.round(normalized) : rounded(normalized)
}

/** Parses optional trailing units and returns a normalized finite value. */
export function parseNumberInputValue(
  text: string,
  options: NumberInputValueOptions = {},
): number | null {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  const unit = options.unit?.trim() ?? ""
  const numericText = unit.length > 0 && trimmed.endsWith(unit)
    ? trimmed.slice(0, -unit.length).trim()
    : trimmed
  if (numericText.length === 0) return null
  const value = Number(numericText)
  return Number.isFinite(value) ? normalizeNumberInputValue(value, options) : null
}

/** Formats the normalized controlled value with its optional unit suffix. */
export function formatNumberInputValue(
  value: number,
  options: NumberInputFormatOptions = {},
): string {
  const normalized = normalizeNumberInputValue(value, options)
  const precision = normalizedPrecision(options.precision)
  const formatted = precision === undefined ? String(normalized) : normalized.toFixed(precision)
  return `${formatted}${options.unit ?? ""}`
}

function normalizedPrecision(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined
  return Math.min(100, Math.max(0, Math.trunc(value!)))
}

function finiteBound(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
