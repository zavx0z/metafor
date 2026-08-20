import {Color} from "@metafor/engine"
import {flexColumn, flexRow, type UiSurface} from "@ui/elements"
import {Button} from "./Button.ts"
import {Checkbox} from "./Checkbox.ts"
import {
  ColorInput,
  type ColorInputDensity,
  type ColorInputProps,
  type ColorInputValue,
} from "./ColorInput.ts"
import {
  NumberInput,
  normalizeNumberInputValue,
  type NumberInputDensity,
  type NumberInputProps,
} from "./NumberInput.ts"
import {
  MatrixInput,
  measureMatrixInputHeight,
  type MatrixInputDensity,
  type MatrixInputProps,
} from "./MatrixInput.ts"
import {SliderControl} from "./SliderControl.ts"
import {Switcher} from "./Switcher.ts"
import {TextField} from "./TextField.ts"
import {Typography} from "./Typography.ts"
import {
  measureVectorInputHeight,
  VectorInput,
  type VectorInputDensity,
  type VectorInputDimension,
  type VectorInputProps,
} from "./VectorInput.ts"

export type FieldColor = ColorInputValue
export type FieldOption = Readonly<{value: string; label: string; description?: string}>
export type FieldReference = Readonly<{id: string; label: string; kind?: string}>

export type FieldBase = Readonly<{
  id: string
  /** Optional render-instance identity when the same field id appears in several owners. */
  key?: string
  label: string
  /** Keeps the semantic label while allowing a compact control-only row. */
  compactLabel?: "inline" | "hidden"
  description?: string
  disabled?: boolean
  readOnly?: boolean
}>

export type TextFieldDefinition = FieldBase & Readonly<{
  kind: "text"
  value: string
  placeholder?: string
  onChange?(value: string): void
}>

export type NumberFieldDefinition = FieldBase & Readonly<{
  kind: "number"
  value: number
  numberKind?: "float" | "integer"
  presentation?: "input" | "slider"
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange?(value: number): void
}>

export type BooleanFieldDefinition = FieldBase & Readonly<{
  kind: "boolean"
  value: boolean
  presentation?: "checkbox" | "switch"
  onChange?(value: boolean): void
}>

export type EnumFieldDefinition = FieldBase & Readonly<{
  kind: "enum"
  value: string
  options: readonly FieldOption[]
  onChange?(value: string): void
}>

export type ColorFieldDefinition = FieldBase & Readonly<{
  kind: "color"
  value: FieldColor
  onChange?(value: FieldColor): void
}>

export type VectorFieldDefinition = FieldBase & Readonly<{
  kind: "vector"
  value: readonly number[]
  dimensions?: VectorInputDimension
  axes?: readonly string[]
  numberKind?: "float" | "integer"
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange?(value: readonly number[]): void
}>

export type RotationFieldDefinition = Omit<VectorFieldDefinition, "kind"> & Readonly<{
  kind: "rotation"
}>

export type MatrixFieldDefinition = FieldBase & Readonly<{
  kind: "matrix"
  value: readonly (readonly number[])[]
  onChange?(value: readonly (readonly number[])[]): void
}>

export type ReferenceFieldDefinition = FieldBase & Readonly<{
  kind: "reference"
  value: FieldReference | null
  placeholder?: string
  onActivate?(): void
  onClear?(): void
}>

export type ReadonlyFieldDefinition = FieldBase & Readonly<{
  kind: "readonly"
  value: string | number
}>

export type FieldDefinition =
  | TextFieldDefinition
  | NumberFieldDefinition
  | BooleanFieldDefinition
  | EnumFieldDefinition
  | ColorFieldDefinition
  | VectorFieldDefinition
  | RotationFieldDefinition
  | MatrixFieldDefinition
  | ReferenceFieldDefinition
  | ReadonlyFieldDefinition

export type FieldRenderOptions = Readonly<{
  density?: "regular" | "compact"
}>

export const FIELD_KINDS = Object.freeze([
  "text",
  "number",
  "boolean",
  "enum",
  "color",
  "vector",
  "rotation",
  "matrix",
  "reference",
  "readonly",
] as const)

const LABEL_HEIGHT = 16
const CONTROL_HEIGHT = 28
const FIELD_GAP = 5

/** Draws one controlled universal field and returns its occupied height. */
export function Field(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  definition: FieldDefinition,
  options: FieldRenderOptions = {},
): number {
  if (options.density === "compact") return drawCompactField(host, x, y, width, definition, options)
  const height = measureFieldHeight(definition, options)
  if (definition.kind === "number" && definition.presentation === "slider" && definition.max !== undefined) {
    drawNumberSlider(host, x, y, width, definition)
    return height
  }
  if (definition.kind === "boolean") {
    drawBooleanField(host, x, y, width, definition)
    return height
  }
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: FIELD_GAP,
    items: [
      {height: LABEL_HEIGHT, draw: (slotX, slotY, slotW, slotH) => drawFieldLabel(host, slotX, slotY, slotW, slotH, definition)},
      {height: "grow", draw: (slotX, slotY, slotW, slotH) => drawFieldControl(host, slotX, slotY, slotW, slotH, definition)},
    ],
  })
  return height
}

function drawFieldControl(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  definition: Exclude<FieldDefinition, BooleanFieldDefinition>,
): void {
  if (definition.kind === "text") drawTextField(host, x, y, width, height, definition)
  else if (definition.kind === "number") drawNumberField(host, x, y, width, height, definition)
  else if (definition.kind === "enum") drawEnumField(host, x, y, width, height, definition)
  else if (definition.kind === "color") drawColorField(host, x, y, width, height, definition)
  else if (definition.kind === "vector" || definition.kind === "rotation") drawVectorField(host, x, y, width, height, definition)
  else if (definition.kind === "matrix") drawMatrixField(host, x, y, width, height, definition)
  else if (definition.kind === "reference") drawReferenceField(host, x, y, width, height, definition)
  else drawReadonlyField(host, x, y, width, height, definition)
}

export function measureFieldHeight(definition: FieldDefinition, options: FieldRenderOptions = {}): number {
  if (options.density === "compact") return compactFieldHeight(definition)
  if (definition.kind === "boolean") return CONTROL_HEIGHT
  if (definition.kind === "number" && definition.presentation === "slider") return 66
  if (definition.kind === "matrix") {
    return LABEL_HEIGHT + FIELD_GAP + measureMatrixInputHeight(matrixInputProps(definition, "regular"))
  }
  return LABEL_HEIGHT + FIELD_GAP + CONTROL_HEIGHT
}

function compactFieldHeight(definition: FieldDefinition): number {
  const metrics = compactMetrics()
  if (definition.kind === "vector" || definition.kind === "rotation") {
    return metrics.control + metrics.gap + measureVectorInputHeight(vectorInputProps(definition, "compact"))
  }
  if (definition.kind === "matrix") {
    return metrics.control + metrics.gap + measureMatrixInputHeight(matrixInputProps(definition, "compact"))
  }
  return metrics.control
}

function drawCompactField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  field: FieldDefinition,
  options: FieldRenderOptions,
): number {
  const metrics = compactMetrics()
  const height = compactFieldHeight(field)
  if (field.kind === "vector" || field.kind === "rotation") {
    drawCompactVectorField(host, x, y, width, height, field, metrics)
    return height
  }
  if (field.kind === "matrix") {
    drawCompactMatrixField(host, x, y, width, height, field, metrics)
    return height
  }
  if (field.kind === "number" && field.presentation === "slider" && field.max !== undefined) {
    const props: Parameters<typeof SliderControl>[4] = {
      key: fieldKey(field),
      label: field.label,
      layout: "inline",
      value: normalizeNumberFieldValue(field.value, field),
      max: field.max,
      step: field.step ?? (field.numberKind === "integer" ? 1 : 0.01),
      buttonHeight: metrics.control,
      labelFontPx: metrics.font,
      valueFontPx: metrics.font,
      format: (value) => `${value}${field.unit ?? ""}`,
      onChange: (value) => {
        if (!isFieldDisabled(field)) field.onChange?.(normalizeNumberFieldValue(value, field))
      },
    }
    if (field.min !== undefined) props.min = field.min
    SliderControl(host, x, y, width, props)
    return height
  }
  if (field.kind === "boolean") {
    const disabled = isFieldDisabled(field)
    flexRow({
      x,
      y,
      w: width,
      h: height,
      gap: metrics.gap * 2,
      alignItems: "center",
      items: [
        {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
          children: field.label,
          fontPx: metrics.font,
          color: disabled ? "muted" : "text",
        })},
        {width: metrics.control * 1.6, height: metrics.control * 0.82, draw: (slotX, slotY, slotW, slotH) => {
          const onChange = !disabled && field.onChange !== undefined ? (value: boolean) => field.onChange!(value) : undefined
          if (field.presentation === "checkbox") {
            const props: Parameters<typeof Checkbox>[5] = {checked: field.value, disabled}
            if (onChange !== undefined) props.onChange = onChange
            Checkbox(host, slotX, slotY, slotW, slotH, props)
          } else {
            const props: Parameters<typeof Switcher>[5] = {checked: field.value, disabled}
            if (onChange !== undefined) props.onChange = onChange
            Switcher(host, slotX, slotY, slotW, slotH, props)
          }
        }},
      ],
    })
    return height
  }
  drawCompactSingleRow(host, x, y, width, height, field, metrics)
  return height
}

type CompactMetrics = Readonly<{control: number; gap: number; font: number; radius: number}>

function compactMetrics(): CompactMetrics {
  return {
    control: 22,
    gap: 3,
    font: 11,
    radius: 3,
  }
}

function compactTextStyle(metrics: CompactMetrics) {
  return {
    background: new Color(0.235, 0.235, 0.235, 1),
    borderColor: new Color(0.11, 0.11, 0.11, 1),
    borderWidth: 1,
    borderRadius: metrics.radius,
    color: "#E6E6E6" as const,
    fontSize: metrics.font,
  }
}

function drawCompactSingleRow(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: Exclude<FieldDefinition, BooleanFieldDefinition | VectorFieldDefinition | RotationFieldDefinition | MatrixFieldDefinition>,
  metrics: CompactMetrics,
): void {
  if (field.compactLabel === "hidden") {
    drawCompactControl(host, x, y, width, height, field, metrics)
    return
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.gap * 2,
    alignItems: "stretch",
    items: [
      {width: "2fr", height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
        children: field.label,
        fontPx: metrics.font,
        color: isFieldDisabled(field) ? "muted" : "text",
      })},
      {width: "3fr", height, draw: (slotX, slotY, slotW, slotH) => drawCompactControl(host, slotX, slotY, slotW, slotH, field, metrics)},
    ],
  })
}

function drawCompactControl(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: Exclude<FieldDefinition, BooleanFieldDefinition | VectorFieldDefinition | RotationFieldDefinition | MatrixFieldDefinition>,
  metrics: CompactMetrics,
): void {
  const disabled = isFieldDisabled(field)
  if (field.kind === "number") {
    NumberInput(host, x, y, width, height, numberInputProps(field, "compact"))
    return
  }
  if (field.kind === "enum") {
    const selected = field.options.find((option) => option.value === field.value)
    Button(host, x, y, width, height, {
      children: selected?.label ?? field.value,
      variant: "contained",
      fill: new Color(0.235, 0.235, 0.235, 1),
      border: new Color(0.11, 0.11, 0.11, 1),
      radius: metrics.radius,
      fontPx: metrics.font,
      disabled: disabled || field.options.length === 0,
      action: () => field.onChange?.(nextEnumFieldValue(field.value, field.options)),
    })
    return
  }
  if (field.kind === "color") {
    ColorInput(host, x, y, width, height, colorInputProps(field, "compact"))
    return
  }
  if (field.kind === "reference") {
    Button(host, x, y, width, height, {
      children: field.value?.label ?? field.placeholder ?? "Не выбрано",
      variant: "contained",
      fill: new Color(0.235, 0.235, 0.235, 1),
      border: new Color(0.11, 0.11, 0.11, 1),
      radius: metrics.radius,
      fontPx: metrics.font,
      disabled,
      action: () => field.onActivate?.(),
    })
    return
  }
  const value = field.kind === "readonly" ? String(field.value) : field.value
  const props: Parameters<typeof TextField>[5] = {
    key: fieldKey(field),
    value,
    disabled: disabled || field.kind === "readonly",
    submitOnEnter: true,
    fontPx: metrics.font,
    sx: compactTextStyle(metrics),
  }
  if (!disabled && field.kind === "text") props.onChange = (text) => field.onChange?.(text)
  TextField(host, x, y, width, height, props)
}

function drawCompactVectorField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: VectorFieldDefinition | RotationFieldDefinition,
  metrics: CompactMetrics,
): void {
  const props = vectorInputProps(field, "compact")
  const controlHeight = measureVectorInputHeight(props)
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.gap,
    items: [
      {height: metrics.control, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {children: field.label, fontPx: metrics.font})},
      {height: controlHeight, draw: (slotX, slotY, slotW, slotH) => {
        VectorInput(host, slotX, slotY, slotW, slotH, props)
      }},
    ],
  })
}

function drawCompactMatrixField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: MatrixFieldDefinition,
  metrics: CompactMetrics,
): void {
  const props = matrixInputProps(field, "compact")
  const controlHeight = measureMatrixInputHeight(props)
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.gap,
    items: [
      {height: metrics.control, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {children: field.label, fontPx: metrics.font})},
      {height: controlHeight, draw: (slotX, slotY, slotW, slotH) => {
        MatrixInput(host, slotX, slotY, slotW, slotH, props)
      }},
    ],
  })
}

export function normalizeNumberFieldValue(
  value: number,
  options: Pick<NumberFieldDefinition, "numberKind" | "min" | "max" | "step"> = {},
): number {
  return normalizeNumberInputValue(value, options)
}

export function nextEnumFieldValue(
  value: string,
  options: readonly FieldOption[],
  step = 1,
): string {
  if (options.length === 0) return value
  const current = options.findIndex((option) => option.value === value)
  const start = current < 0 ? 0 : current
  const index = ((start + step) % options.length + options.length) % options.length
  return options[index]!.value
}

export {
  formatColorInputValue as fieldColorToHex,
  normalizeColorInputValue as normalizeFieldColor,
  parseColorInputValue as parseFieldColor,
} from "./ColorInput.ts"

export {normalizeVectorInputValue as normalizeVectorFieldValue} from "./VectorInput.ts"

export {normalizeMatrixInputValue as normalizeMatrixFieldValue} from "./MatrixInput.ts"

function drawFieldLabel(host: UiSurface, x: number, y: number, width: number, height: number, field: FieldBase): void {
  Typography(host, x, y, width, height, {
    children: field.label,
    variant: "caption",
    color: field.disabled ? "muted" : "text",
  })
}

function drawTextField(host: UiSurface, x: number, y: number, width: number, height: number, field: TextFieldDefinition): void {
  const props: Parameters<typeof TextField>[5] = {
    key: fieldKey(field),
    value: field.value,
    disabled: isFieldDisabled(field),
  }
  if (field.placeholder !== undefined) props.placeholder = field.placeholder
  if (!isFieldDisabled(field) && field.onChange !== undefined) props.onChange = (value) => field.onChange!(value)
  TextField(host, x, y, width, height, props)
}

function drawNumberField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: NumberFieldDefinition,
): void {
  NumberInput(host, x, y, width, height, numberInputProps(field, "regular"))
}

function numberInputProps(field: NumberFieldDefinition, density: NumberInputDensity): NumberInputProps {
  const props: NumberInputProps = {
    key: fieldKey(field),
    value: field.value,
    density,
  }
  if (field.numberKind !== undefined) props.numberKind = field.numberKind
  if (field.min !== undefined) props.min = field.min
  if (field.max !== undefined) props.max = field.max
  if (field.step !== undefined) props.step = field.step
  if (field.unit !== undefined) props.unit = field.unit
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  return props
}

function drawNumberSlider(host: UiSurface, x: number, y: number, width: number, field: NumberFieldDefinition): void {
  const props: Parameters<typeof SliderControl>[4] = {
    key: fieldKey(field),
    label: field.label,
    value: normalizeNumberFieldValue(field.value, field),
    max: field.max!,
    step: field.step ?? (field.numberKind === "integer" ? 1 : 0.01),
    format: (entry) => `${entry}${field.unit ?? ""}`,
    onChange: (entry) => {
      if (!isFieldDisabled(field)) field.onChange?.(normalizeNumberFieldValue(entry, field))
    },
  }
  if (field.min !== undefined) props.min = field.min
  SliderControl(host, x, y, width, props)
}

function drawBooleanField(host: UiSurface, x: number, y: number, width: number, field: BooleanFieldDefinition): void {
  const disabled = isFieldDisabled(field)
  const onChange = !disabled && field.onChange !== undefined ? (value: boolean) => field.onChange!(value) : undefined
  const controlWidth = field.presentation === "checkbox" ? 24 : 40
  flexRow({
    x,
    y,
    w: width,
    h: CONTROL_HEIGHT,
    gap: 8,
    alignItems: "center",
    items: [
      {width: "grow", height: CONTROL_HEIGHT, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {children: field.label, color: disabled ? "muted" : "text"})},
      {width: controlWidth, height: 22, draw: (slotX, slotY, slotW, slotH) => {
        if (field.presentation === "checkbox") {
          const props: Parameters<typeof Checkbox>[5] = {checked: field.value, disabled}
          if (onChange !== undefined) props.onChange = onChange
          Checkbox(host, slotX, slotY, slotW, slotH, props)
        } else {
          const props: Parameters<typeof Switcher>[5] = {checked: field.value, disabled}
          if (onChange !== undefined) props.onChange = onChange
          Switcher(host, slotX, slotY, slotW, slotH, props)
        }
      }},
    ],
  })
}

function drawEnumField(host: UiSurface, x: number, y: number, width: number, height: number, field: EnumFieldDefinition): void {
  const selected = field.options.find((option) => option.value === field.value)
  const props: Parameters<typeof Button>[5] = {
    children: selected?.label ?? field.value,
    variant: "outlined",
    disabled: isFieldDisabled(field) || field.options.length === 0,
    action: () => field.onChange?.(nextEnumFieldValue(field.value, field.options)),
  }
  const tooltip = selected?.description ?? field.description
  if (tooltip !== undefined) props.tooltip = tooltip
  Button(host, x, y, width, height, props)
}

function drawColorField(host: UiSurface, x: number, y: number, width: number, height: number, field: ColorFieldDefinition): void {
  ColorInput(host, x, y, width, height, colorInputProps(field, "regular"))
}

function colorInputProps(field: ColorFieldDefinition, density: ColorInputDensity): ColorInputProps {
  const props: ColorInputProps = {
    key: fieldKey(field),
    value: field.value,
    density,
  }
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  return props
}

function drawVectorField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: VectorFieldDefinition | RotationFieldDefinition,
): void {
  VectorInput(host, x, y, width, height, vectorInputProps(field, "regular"))
}

function vectorInputProps(
  field: VectorFieldDefinition | RotationFieldDefinition,
  density: VectorInputDensity,
): VectorInputProps {
  const props: VectorInputProps = {
    key: fieldKey(field),
    value: field.value,
    density,
  }
  if (field.dimensions !== undefined) props.dimensions = field.dimensions
  const axes = field.axes ?? (field.kind === "rotation" ? ["X°", "Y°", "Z°", "W°"] : undefined)
  if (axes !== undefined) props.axes = axes
  if (field.numberKind !== undefined) props.numberKind = field.numberKind
  if (field.min !== undefined) props.min = field.min
  if (field.max !== undefined) props.max = field.max
  if (field.step !== undefined) props.step = field.step
  if (field.unit !== undefined) props.unit = field.unit
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  return props
}

function drawMatrixField(host: UiSurface, x: number, y: number, width: number, height: number, field: MatrixFieldDefinition): void {
  MatrixInput(host, x, y, width, height, matrixInputProps(field, "regular"))
}

function matrixInputProps(field: MatrixFieldDefinition, density: MatrixInputDensity): MatrixInputProps {
  const props: MatrixInputProps = {
    key: fieldKey(field),
    value: field.value,
    density,
  }
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  return props
}

function drawReferenceField(host: UiSurface, x: number, y: number, width: number, height: number, field: ReferenceFieldDefinition): void {
  const props: Parameters<typeof Button>[5] = {
    children: field.value?.label ?? field.placeholder ?? "Не выбрано",
    variant: "outlined",
    disabled: isFieldDisabled(field),
    action: () => field.onActivate?.(),
  }
  const tooltip = field.value?.kind ?? field.description
  if (tooltip !== undefined) props.tooltip = tooltip
  Button(host, x, y, width, height, props)
}

function drawReadonlyField(host: UiSurface, x: number, y: number, width: number, height: number, field: ReadonlyFieldDefinition): void {
  TextField(host, x, y, width, height, {
    key: fieldKey(field),
    value: String(field.value),
    disabled: true,
  })
}

function isFieldDisabled(field: FieldBase): boolean {
  return field.disabled === true || field.readOnly === true
}

function fieldKey(field: FieldBase): string {
  return `field:${field.key ?? field.id}`
}
