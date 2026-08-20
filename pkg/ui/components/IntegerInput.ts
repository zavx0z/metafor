import type {UiSurface} from "@ui/elements"
import {
  NumberInput,
  formatNumberInputValue,
  normalizeNumberInputValue,
  parseNumberInputValue,
  resolveNumberInputSoftRange,
  type NumberInputFormatOptions,
  type NumberInputProps,
  type NumberInputSoftRange,
  type NumberInputValueOptions,
} from "./NumberInput.ts"
import {numberInputLabel, type NumberInputInternalProps} from "./number-input-internal.ts"

export type IntegerInputValueOptions = Omit<NumberInputValueOptions, "numberKind">
export type IntegerInputProps = Omit<NumberInputProps, "numberKind" | "precision"> & {
  label?: string
}

/** Draws one canonical integer control through the shared NumberInput engine. */
export function IntegerInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: IntegerInputProps,
): void {
  const {label, ...rest} = props
  const options = integerNumberOptions(props)
  const key = props.key ?? `integer-input:${x}:${y}:${width}:${height}`
  const numberProps: NumberInputProps & NumberInputInternalProps = {
    ...rest,
    ...options,
    key,
    value: normalizeIntegerInputValue(props.value, props),
    [numberInputLabel]: Object.freeze({text: label ?? ""}),
  }
  if (props.onChange !== undefined) {
    numberProps.onChange = (value) => props.onChange!(normalizeIntegerInputValue(value, props))
  }
  NumberInput(host, x, y, width, height, numberProps)
}

export function normalizeIntegerInputValue(
  value: number,
  options: IntegerInputValueOptions = {},
): number {
  return normalizeNumberInputValue(value, integerNumberOptions(options))
}

export function parseIntegerInputValue(
  text: string,
  options: IntegerInputValueOptions = {},
): number | null {
  return parseNumberInputValue(text, integerNumberOptions(options))
}

export function formatIntegerInputValue(
  value: number,
  options: IntegerInputValueOptions = {},
): string {
  return formatNumberInputValue(value, integerNumberOptions(options))
}

export function resolveIntegerInputSoftRange(
  value: number,
  options: IntegerInputValueOptions = {},
): NumberInputSoftRange {
  return resolveNumberInputSoftRange(value, integerNumberOptions(options))
}

function integerNumberOptions(options: IntegerInputValueOptions): NumberInputFormatOptions {
  const minimum = finiteIntegerBound(options.min, "minimum")
  let maximum = finiteIntegerBound(options.max, "maximum")
  if (minimum !== undefined && maximum !== undefined && maximum < minimum) maximum = minimum
  const result: NumberInputFormatOptions = {
    numberKind: "integer",
    precision: 0,
    step: integerStep(options.step),
  }
  if (minimum !== undefined) result.min = minimum
  if (maximum !== undefined) result.max = maximum
  const softMin = finiteIntegerBound(options.softMin, "minimum")
  const softMax = finiteIntegerBound(options.softMax, "maximum")
  if (softMin !== undefined) result.softMin = softMin
  if (softMax !== undefined) result.softMax = softMax
  if (options.unit !== undefined) result.unit = options.unit
  return result
}

function finiteIntegerBound(value: number | undefined, side: "minimum" | "maximum"): number | undefined {
  if (!Number.isFinite(value)) return undefined
  return side === "minimum" ? Math.ceil(value!) : Math.floor(value!)
}

function integerStep(value: number | undefined): number {
  if (!Number.isFinite(value) || value! <= 0) return 1
  return Math.max(1, Math.round(value!))
}
