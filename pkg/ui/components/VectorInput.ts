import {flexColumn, flexRow, type UiSurface} from "@ui/elements"
import {
  NumberInput,
  normalizeNumberInputValue,
  type NumberInputProps,
  type NumberInputValueOptions,
} from "./NumberInput.ts"
import {Typography} from "./Typography.ts"

export type VectorInputDimension = 2 | 3 | 4
export type VectorInputDensity = "regular" | "compact"
export type VectorInputValueOptions = NumberInputValueOptions

export type VectorInputProps = VectorInputValueOptions & {
  key?: string
  value: readonly number[]
  dimensions?: VectorInputDimension
  axes?: readonly string[]
  disabled?: boolean
  readOnly?: boolean
  density?: VectorInputDensity
  onChange?(value: readonly number[]): void
}

const DEFAULT_AXES = Object.freeze(["X", "Y", "Z", "W"])
const REGULAR_HEIGHT = 28
const REGULAR_GAP = 5
const REGULAR_AXIS_GAP = 3
const REGULAR_AXIS_WIDTH = 18
const COMPACT_HEIGHT = 22
const COMPACT_GAP = 3

/** Draws one controlled 2–4-axis numeric editor without owning consumer state. */
export function VectorInput(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: VectorInputProps,
): void {
  const dimensions = vectorInputDimensions(props.value, props.dimensions)
  const values = normalizeVectorInputValue(props.value, dimensions, props)
  const axes = props.axes ?? DEFAULT_AXES
  if (props.density === "compact") {
    flexColumn({
      x,
      y,
      w: width,
      h: height,
      gap: COMPACT_GAP,
      items: Array.from({length: dimensions}, (_, index) => ({
        height: COMPACT_HEIGHT,
        draw: (rowX: number, rowY: number, rowW: number, rowH: number) => {
          drawVectorInputAxis(host, rowX, rowY, rowW, rowH, props, values, axes, index, "compact")
        },
      })),
    })
    return
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: REGULAR_GAP,
    alignItems: "stretch",
    items: Array.from({length: dimensions}, (_, index) => ({
      width: "1fr" as const,
      height,
      draw: (cellX: number, cellY: number, cellW: number, cellH: number) => {
        drawVectorInputAxis(host, cellX, cellY, cellW, cellH, props, values, axes, index, "regular")
      },
    })),
  })
}

/** Returns the intrinsic height of the regular row or compact vertical axis stack. */
export function measureVectorInputHeight(
  props: Pick<VectorInputProps, "value" | "dimensions" | "density">,
): number {
  if (props.density !== "compact") return REGULAR_HEIGHT
  const dimensions = vectorInputDimensions(props.value, props.dimensions)
  return dimensions * COMPACT_HEIGHT + (dimensions - 1) * COMPACT_GAP
}

/** Normalizes an immutable vector through the public scalar number contract. */
export function normalizeVectorInputValue(
  value: readonly number[],
  dimensions: VectorInputDimension = 3,
  options: VectorInputValueOptions = {},
): readonly number[] {
  return Array.from({length: dimensions}, (_, index) => normalizeNumberInputValue(value[index] ?? 0, options))
}

function drawVectorInputAxis(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  props: VectorInputProps,
  values: readonly number[],
  axes: readonly string[],
  index: number,
  density: VectorInputDensity,
): void {
  const compact = density === "compact"
  const labelWidth = compact ? COMPACT_HEIGHT : REGULAR_AXIS_WIDTH
  const numberProps = vectorAxisNumberProps(props, values, index, density)
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: compact ? COMPACT_GAP : REGULAR_AXIS_GAP,
    alignItems: "stretch",
    items: [
      {width: labelWidth, height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, compact
        ? {children: axes[index] ?? String(index), fontPx: 11, color: "muted"}
        : {children: axes[index] ?? String(index), variant: "caption"})},
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => {
        NumberInput(host, slotX, slotY, slotW, slotH, numberProps)
      }},
    ],
  })
}

function vectorAxisNumberProps(
  props: VectorInputProps,
  values: readonly number[],
  index: number,
  density: VectorInputDensity,
): NumberInputProps {
  const numberProps: NumberInputProps = {
    value: values[index]!,
    density,
  }
  if (props.key !== undefined) numberProps.key = `${props.key}:${index}`
  if (props.numberKind !== undefined) numberProps.numberKind = props.numberKind
  if (props.min !== undefined) numberProps.min = props.min
  if (props.max !== undefined) numberProps.max = props.max
  if (props.step !== undefined) numberProps.step = props.step
  if (props.unit !== undefined) numberProps.unit = props.unit
  if (props.disabled !== undefined) numberProps.disabled = props.disabled
  if (props.readOnly !== undefined) numberProps.readOnly = props.readOnly
  if (props.onChange !== undefined) numberProps.onChange = (value) => {
    const next = [...values]
    next[index] = value
    props.onChange!(normalizeVectorInputValue(next, values.length as VectorInputDimension, props))
  }
  return numberProps
}

function vectorInputDimensions(
  value: readonly number[],
  dimensions: VectorInputDimension | undefined,
): VectorInputDimension {
  if (dimensions !== undefined) return dimensions
  return value.length >= 2 && value.length <= 4 ? value.length as VectorInputDimension : 3
}
