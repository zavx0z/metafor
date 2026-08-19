import {Color} from "@metafor/engine"
import {Z, palette, type UiSurface} from "@ui/elements"
import {Button} from "./Button.ts"
import {Checkbox} from "./Checkbox.ts"
import {SliderControl} from "./SliderControl.ts"
import {Switcher} from "./Switcher.ts"
import {TextField} from "./TextField.ts"
import {Typography} from "./Typography.ts"

export type FieldColor = Readonly<{r: number; g: number; b: number; a: number}>
export type FieldOption = Readonly<{value: string; label: string; description?: string}>
export type FieldReference = Readonly<{id: string; label: string; kind?: string}>

export type FieldBase = Readonly<{
  id: string
  label: string
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
  dimensions?: 2 | 3 | 4
  axes?: readonly string[]
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
): number {
  const height = measureFieldHeight(definition)
  if (definition.kind === "boolean") {
    drawBooleanField(host, x, y, width, definition)
    return height
  }
  drawFieldLabel(host, x, y, width, definition)
  const controlY = y + LABEL_HEIGHT + FIELD_GAP
  if (definition.kind === "text") drawTextField(host, x, controlY, width, definition)
  else if (definition.kind === "number") drawNumberField(host, x, y, controlY, width, definition)
  else if (definition.kind === "enum") drawEnumField(host, x, controlY, width, definition)
  else if (definition.kind === "color") drawColorField(host, x, controlY, width, definition)
  else if (definition.kind === "vector" || definition.kind === "rotation") {
    drawVectorField(host, x, controlY, width, definition)
  } else if (definition.kind === "matrix") drawMatrixField(host, x, controlY, width, definition)
  else if (definition.kind === "reference") drawReferenceField(host, x, controlY, width, definition)
  else drawReadonlyField(host, x, controlY, width, definition)
  return height
}

export function measureFieldHeight(definition: FieldDefinition): number {
  if (definition.kind === "boolean") return CONTROL_HEIGHT
  if (definition.kind === "number" && definition.presentation === "slider") return 66
  if (definition.kind === "matrix") return LABEL_HEIGHT + FIELD_GAP + matrixRows(definition.value).length * 18 + 8
  return LABEL_HEIGHT + FIELD_GAP + CONTROL_HEIGHT
}

export function normalizeNumberFieldValue(
  value: number,
  options: Pick<NumberFieldDefinition, "numberKind" | "min" | "max" | "step"> = {},
): number {
  const finite = Number.isFinite(value) ? value : finiteBound(options.min, 0)
  const minimum = finiteBound(options.min, Number.NEGATIVE_INFINITY)
  const maximum = Math.max(minimum, finiteBound(options.max, Number.POSITIVE_INFINITY))
  const clamped = Math.min(maximum, Math.max(minimum, finite))
  const step = Number.isFinite(options.step) && (options.step ?? 0) > 0 ? options.step! : undefined
  const stepped = step === undefined || !Number.isFinite(minimum)
    ? clamped
    : minimum + Math.round((clamped - minimum) / step) * step
  const normalized = Math.min(maximum, Math.max(minimum, stepped))
  return options.numberKind === "integer" ? Math.round(normalized) : rounded(normalized)
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

export function normalizeFieldColor(value: Partial<FieldColor>): FieldColor {
  return {
    r: clampUnit(value.r ?? 0),
    g: clampUnit(value.g ?? 0),
    b: clampUnit(value.b ?? 0),
    a: clampUnit(value.a ?? 1),
  }
}

export function fieldColorToHex(value: Partial<FieldColor>, includeAlpha = true): string {
  const color = normalizeFieldColor(value)
  const channel = (entry: number): string => Math.round(entry * 255).toString(16).padStart(2, "0").toUpperCase()
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}${includeAlpha ? channel(color.a) : ""}`
}

export function parseFieldColor(value: string): FieldColor | null {
  const hex = value.trim().replace(/^#/, "")
  if (!/^[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(hex)) return null
  const channel = (offset: number): number => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
  return normalizeFieldColor({
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: hex.length === 8 ? channel(6) : 1,
  })
}

export function normalizeVectorFieldValue(
  value: readonly number[],
  dimensions: 2 | 3 | 4 = 3,
  options: Pick<VectorFieldDefinition, "min" | "max" | "step"> = {},
): readonly number[] {
  return Array.from({length: dimensions}, (_, index) => normalizeNumberFieldValue(value[index] ?? 0, options))
}

export function normalizeMatrixFieldValue(
  value: readonly (readonly number[])[],
): readonly (readonly number[])[] {
  const size = Math.min(4, Math.max(2, value.length || 2))
  return Array.from({length: size}, (_, row) => Array.from({length: size}, (_, column) => {
    const entry = value[row]?.[column]
    return Number.isFinite(entry) ? rounded(entry!) : row === column ? 1 : 0
  }))
}

function drawFieldLabel(host: UiSurface, x: number, y: number, width: number, field: FieldBase): void {
  Typography(host, x, y, width, LABEL_HEIGHT, {
    children: field.label,
    variant: "caption",
    color: field.disabled ? "muted" : "text",
  })
}

function drawTextField(host: UiSurface, x: number, y: number, width: number, field: TextFieldDefinition): void {
  const props: Parameters<typeof TextField>[5] = {
    key: `field:${field.id}`,
    value: field.value,
    disabled: isFieldDisabled(field),
  }
  if (field.placeholder !== undefined) props.placeholder = field.placeholder
  if (!isFieldDisabled(field) && field.onChange !== undefined) props.onChange = (value) => field.onChange!(value)
  TextField(host, x, y, width, CONTROL_HEIGHT, props)
}

function drawNumberField(
  host: UiSurface,
  x: number,
  fieldY: number,
  controlY: number,
  width: number,
  field: NumberFieldDefinition,
): void {
  const value = normalizeNumberFieldValue(field.value, field)
  if (field.presentation === "slider" && field.max !== undefined) {
    const props: Parameters<typeof SliderControl>[4] = {
      key: `field:${field.id}`,
      label: field.label,
      value,
      max: field.max,
      step: field.step ?? (field.numberKind === "integer" ? 1 : 0.01),
      format: (entry) => `${entry}${field.unit ?? ""}`,
      onChange: (entry) => {
        if (!field.disabled && !field.readOnly) field.onChange?.(normalizeNumberFieldValue(entry, field))
      },
    }
    if (field.min !== undefined) props.min = field.min
    SliderControl(host, x, fieldY, width, props)
    return
  }
  const props: Parameters<typeof TextField>[5] = {
    key: `field:${field.id}`,
    value: `${value}${field.unit ?? ""}`,
    disabled: isFieldDisabled(field),
    submitOnEnter: true,
  }
  if (!isFieldDisabled(field)) props.onSubmit = (text) => {
      const parsed = Number(text.replace(field.unit ?? "", "").trim())
      if (Number.isFinite(parsed)) field.onChange?.(normalizeNumberFieldValue(parsed, field))
    }
  TextField(host, x, controlY, width, CONTROL_HEIGHT, props)
}

function drawBooleanField(host: UiSurface, x: number, y: number, width: number, field: BooleanFieldDefinition): void {
  Typography(host, x, y, Math.max(1, width - 48), CONTROL_HEIGHT, {
    children: field.label,
    color: field.disabled ? "muted" : "text",
  })
  const disabled = isFieldDisabled(field)
  const onChange = !disabled && field.onChange !== undefined ? (value: boolean) => field.onChange!(value) : undefined
  if (field.presentation === "checkbox") {
    const props: Parameters<typeof Checkbox>[5] = {checked: field.value, disabled}
    if (onChange !== undefined) props.onChange = onChange
    Checkbox(host, x + width - 30, y + 4, 22, 22, props)
  } else {
    const props: Parameters<typeof Switcher>[5] = {checked: field.value, disabled}
    if (onChange !== undefined) props.onChange = onChange
    Switcher(host, x + width - 44, y + 4, 38, 20, props)
  }
}

function drawEnumField(host: UiSurface, x: number, y: number, width: number, field: EnumFieldDefinition): void {
  const selected = field.options.find((option) => option.value === field.value)
  const props: Parameters<typeof Button>[5] = {
    children: selected?.label ?? field.value,
    variant: "outlined",
    disabled: isFieldDisabled(field) || field.options.length === 0,
    action: () => field.onChange?.(nextEnumFieldValue(field.value, field.options)),
  }
  const tooltip = selected?.description ?? field.description
  if (tooltip !== undefined) props.tooltip = tooltip
  Button(host, x, y, width, CONTROL_HEIGHT, props)
}

function drawColorField(host: UiSurface, x: number, y: number, width: number, field: ColorFieldDefinition): void {
  const value = normalizeFieldColor(field.value)
  const swatch = CONTROL_HEIGHT
  host.drawRoundedRect(x, y, swatch, swatch, {
    radius: 6,
    fill: new Color(value.r, value.g, value.b, value.a),
    border: palette.border,
    borderWidth: 1,
    z: Z.ELEMENT,
  })
  const props: Parameters<typeof TextField>[5] = {
    key: `field:${field.id}`,
    value: fieldColorToHex(value),
    disabled: isFieldDisabled(field),
    submitOnEnter: true,
  }
  if (!isFieldDisabled(field)) props.onSubmit = (text) => {
      const parsed = parseFieldColor(text)
      if (parsed !== null) field.onChange?.(parsed)
    }
  TextField(host, x + swatch + 7, y, Math.max(1, width - swatch - 7), CONTROL_HEIGHT, props)
}

function drawVectorField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  field: VectorFieldDefinition | RotationFieldDefinition,
): void {
  const dimensions = field.dimensions ?? (field.value.length >= 2 && field.value.length <= 4 ? field.value.length as 2 | 3 | 4 : 3)
  const values = normalizeVectorFieldValue(field.value, dimensions, field)
  const axes = field.axes ?? (field.kind === "rotation" ? ["X°", "Y°", "Z°", "W°"] : ["X", "Y", "Z", "W"])
  const gap = 5
  const cellWidth = (width - gap * (dimensions - 1)) / dimensions
  for (let index = 0; index < dimensions; index += 1) {
    const cellX = x + index * (cellWidth + gap)
    const axisWidth = 18
    Typography(host, cellX, y, axisWidth, CONTROL_HEIGHT, {children: axes[index] ?? String(index), variant: "caption"})
    const props: Parameters<typeof TextField>[5] = {
      key: `field:${field.id}:${index}`,
      value: String(values[index]),
      disabled: isFieldDisabled(field),
      submitOnEnter: true,
    }
    if (!isFieldDisabled(field)) props.onSubmit = (text) => {
        const parsed = Number(text)
        if (!Number.isFinite(parsed)) return
        const next = [...values]
        next[index] = normalizeNumberFieldValue(parsed, field)
        field.onChange?.(next)
      }
    TextField(host, cellX + axisWidth, y, Math.max(1, cellWidth - axisWidth), CONTROL_HEIGHT, props)
  }
}

function drawMatrixField(host: UiSurface, x: number, y: number, width: number, field: MatrixFieldDefinition): void {
  const matrix = normalizeMatrixFieldValue(field.value)
  for (let row = 0; row < matrix.length; row += 1) {
    Typography(host, x, y + row * 18, width, 18, {
      children: matrix[row]!.map((value) => value.toFixed(2)).join("   "),
      variant: "caption",
      color: field.disabled ? "muted" : "text",
    })
  }
}

function drawReferenceField(host: UiSurface, x: number, y: number, width: number, field: ReferenceFieldDefinition): void {
  const props: Parameters<typeof Button>[5] = {
    children: field.value?.label ?? field.placeholder ?? "Не выбрано",
    variant: "outlined",
    disabled: isFieldDisabled(field),
    action: () => field.onActivate?.(),
  }
  const tooltip = field.value?.kind ?? field.description
  if (tooltip !== undefined) props.tooltip = tooltip
  Button(host, x, y, width, CONTROL_HEIGHT, props)
}

function drawReadonlyField(host: UiSurface, x: number, y: number, width: number, field: ReadonlyFieldDefinition): void {
  TextField(host, x, y, width, CONTROL_HEIGHT, {
    key: `field:${field.id}`,
    value: String(field.value),
    disabled: true,
  })
}

function matrixRows(value: readonly (readonly number[])[]): readonly (readonly number[])[] {
  return normalizeMatrixFieldValue(value)
}

function finiteBound(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback
}

function isFieldDisabled(field: FieldBase): boolean {
  return field.disabled === true || field.readOnly === true
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
