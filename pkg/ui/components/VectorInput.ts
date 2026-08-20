import {
  flexColumn,
  flexRow,
  uiShapeMetrics,
  type UiSurface,
} from "@ui/elements"
import {ControlGroup, type ControlGroupContext} from "./ControlGroup.ts"
import {
  NumberInput,
  normalizeNumberInputValue,
  type NumberInputFormatOptions,
  type NumberInputProps,
} from "./NumberInput.ts"
import {Typography} from "./Typography.ts"

export type VectorInputDimension = 2 | 3 | 4
export type VectorInputDensity = "regular" | "compact"
export type VectorInputValueOptions = NumberInputFormatOptions

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
const VECTOR_INPUT_INTRINSIC_WIDTH = 146

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
  const controlWidth = Math.min(Math.max(0, width), measureVectorInputWidth())
  const controlX = x + (width - controlWidth) / 2
  ControlGroup(host, controlX, y, controlWidth, height, {
    appearance: "number",
    disabled: props.disabled === true || props.readOnly === true,
    rows: dimensions,
    children: (group) => {
      flexColumn({
        x: controlX,
        y,
        w: controlWidth,
        h: height,
        gap: 0,
        items: Array.from({length: dimensions}, (_, index) => ({
          height: "1fr" as const,
          draw: (rowX: number, rowY: number, rowW: number, rowH: number) => {
            drawVectorInputAxis(host, rowX, rowY, rowW, rowH, props, values, axes, index, group)
          },
        })),
      })
    },
  })
}

/** Returns the approved intrinsic width shared by standalone, Field and Node consumers. */
export function measureVectorInputWidth(): number {
  return VECTOR_INPUT_INTRINSIC_WIDTH
}

/** Returns the intrinsic height of the joined 2–4-axis stack in either density. */
export function measureVectorInputHeight(
  props: Pick<VectorInputProps, "value" | "dimensions" | "density">,
): number {
  const dimensions = vectorInputDimensions(props.value, props.dimensions)
  return dimensions * uiShapeMetrics.controlHeight
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
  group: ControlGroupContext,
): void {
  const numberProps = vectorAxisNumberProps(props, values, index)
  numberProps.appearance = group.cell(index, 0, {left: false}).inputAppearance
  numberProps.sx = group.cellStyle
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: 0,
    alignItems: "stretch",
    items: [
      {width: uiShapeMetrics.iconActionSlot, height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
        children: axes[index] ?? String(index),
        fontPx: uiShapeMetrics.compactFontPx,
        color: group.textColor,
        sx: {textAlign: "center"},
      })},
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
): NumberInputProps {
  const numberProps: NumberInputProps = {
    value: values[index]!,
    density: props.density ?? "regular",
    fontPx: uiShapeMetrics.compactFontPx,
  }
  if (props.key !== undefined) numberProps.key = `${props.key}:${index}`
  if (props.numberKind !== undefined) numberProps.numberKind = props.numberKind
  if (props.min !== undefined) numberProps.min = props.min
  if (props.max !== undefined) numberProps.max = props.max
  if (props.softMin !== undefined) numberProps.softMin = props.softMin
  if (props.softMax !== undefined) numberProps.softMax = props.softMax
  if (props.step !== undefined) numberProps.step = props.step
  numberProps.precision = props.precision ?? 3
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
