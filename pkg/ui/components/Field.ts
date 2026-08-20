import {flexColumn, flexRow, uiShapeMetrics, type UiSurface} from "@ui/elements"
import {Button} from "./Button.ts"
import {Checkbox} from "./Checkbox.ts"
import {
  CollectionInput,
  measureCollectionInputHeight,
  type CollectionInputDensity,
  type CollectionInputItem,
  type CollectionInputMoveDirection,
  type CollectionInputProps,
} from "./CollectionInput.ts"
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
  EnumInput,
  type EnumInputDensity,
  type EnumInputOption,
  type EnumInputProps,
} from "./EnumInput.ts"
import {
  MatrixInput,
  measureMatrixInputHeight,
  type MatrixInputDensity,
  type MatrixInputProps,
} from "./MatrixInput.ts"
import {
  PathInput,
  type PathInputDensity,
  type PathInputProps,
} from "./PathInput.ts"
import {
  ReferenceInput,
  type ReferenceInputDensity,
  type ReferenceInputProps,
  type ReferenceInputValue,
} from "./ReferenceInput.ts"
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
export type FieldOption = EnumInputOption
export type FieldReference = ReferenceInputValue
export type FieldCollectionItem = CollectionInputItem

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

export type PathFieldDefinition = FieldBase & Readonly<{
  kind: "path"
  value: string
  placeholder?: string
  onChange?(value: string): void
  onBrowse?(): void
}>

export type CollectionFieldDefinition = FieldBase & Readonly<{
  kind: "collection"
  items: readonly FieldCollectionItem[]
  selectedId: string | null
  visibleRows?: number
  emptyLabel?: string
  onSelect?(id: string): void
  onAdd?(): void
  onRemove?(id: string): void
  onMove?(id: string, direction: CollectionInputMoveDirection): void
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
  | PathFieldDefinition
  | CollectionFieldDefinition
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
  "collection",
  "path",
  "readonly",
] as const)

const LEGACY_GROUP_LABEL_HEIGHT = 16
const LEGACY_GROUP_GAP = 5

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
    drawNumberSlider(host, x, y + (height - uiShapeMetrics.controlHeight) / 2, width, definition)
    return height
  }
  if (definition.kind === "boolean") {
    drawBooleanField(host, x, y, width, height, definition)
    return height
  }
  if (isScalarField(definition)) {
    drawScalarFieldRow(host, x, y, width, height, definition, "regular")
    return height
  }
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: LEGACY_GROUP_GAP,
    items: [
      {height: LEGACY_GROUP_LABEL_HEIGHT, draw: (slotX, slotY, slotW, slotH) => drawFieldLabel(host, slotX, slotY, slotW, slotH, definition)},
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
  else if (definition.kind === "collection") drawCollectionField(host, x, y, width, height, definition)
  else if (definition.kind === "path") drawPathField(host, x, y, width, height, definition)
  else drawReadonlyField(host, x, y, width, height, definition)
}

export function measureFieldHeight(definition: FieldDefinition, options: FieldRenderOptions = {}): number {
  if (options.density === "compact") return compactFieldHeight(definition)
  if (isScalarField(definition) || definition.kind === "boolean") return uiShapeMetrics.rowHeight
  if (definition.kind === "matrix") {
    return LEGACY_GROUP_LABEL_HEIGHT + LEGACY_GROUP_GAP + measureMatrixInputHeight(matrixInputProps(definition, "regular"))
  }
  if (definition.kind === "collection") {
    return LEGACY_GROUP_LABEL_HEIGHT + LEGACY_GROUP_GAP + measureCollectionInputHeight(collectionInputProps(definition, "regular"))
  }
  return LEGACY_GROUP_LABEL_HEIGHT + LEGACY_GROUP_GAP + uiShapeMetrics.controlHeight
}

type ScalarFieldDefinition = Exclude<
  FieldDefinition,
  BooleanFieldDefinition | VectorFieldDefinition | RotationFieldDefinition | MatrixFieldDefinition | CollectionFieldDefinition
>

function isScalarField(definition: FieldDefinition): definition is ScalarFieldDefinition {
  return definition.kind === "text"
    || definition.kind === "number"
    || definition.kind === "enum"
    || definition.kind === "color"
    || definition.kind === "reference"
    || definition.kind === "path"
    || definition.kind === "readonly"
}

function compactFieldHeight(definition: FieldDefinition): number {
  const metrics = compactMetrics()
  if (definition.kind === "vector" || definition.kind === "rotation") {
    return metrics.control + metrics.gap + measureVectorInputHeight(vectorInputProps(definition, "compact"))
  }
  if (definition.kind === "matrix") {
    return metrics.control + metrics.gap + measureMatrixInputHeight(matrixInputProps(definition, "compact"))
  }
  if (definition.kind === "collection") {
    const control = measureCollectionInputHeight(collectionInputProps(definition, "compact"))
    return definition.compactLabel === "hidden" ? control : metrics.control + metrics.gap + control
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
  if (field.kind === "collection") {
    drawCompactCollectionField(host, x, y, width, height, field, metrics)
    return height
  }
  if (field.kind === "number" && field.presentation === "slider" && field.max !== undefined) {
    drawNumberSlider(host, x, y, width, field)
    return height
  }
  if (field.kind === "boolean") {
    drawBooleanField(host, x, y, width, height, field)
    return height
  }
  drawScalarFieldRow(host, x, y, width, height, field, "compact")
  return height
}

type CompactMetrics = Readonly<{control: number; gap: number; font: number}>

function compactMetrics(): CompactMetrics {
  return {
    control: uiShapeMetrics.controlHeight,
    gap: uiShapeMetrics.tightGap,
    font: uiShapeMetrics.compactFontPx,
  }
}

function drawScalarFieldRow(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: Exclude<FieldDefinition, BooleanFieldDefinition | VectorFieldDefinition | RotationFieldDefinition | MatrixFieldDefinition | CollectionFieldDefinition>,
  density: "regular" | "compact",
): void {
  if (density === "compact" && field.compactLabel === "hidden") {
    drawScalarControl(host, x, y, width, height, field, density)
    return
  }
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: uiShapeMetrics.tightGap * 2,
    alignItems: "stretch",
    items: [
      {width: "2fr", height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
        children: field.label,
        fontPx: uiShapeMetrics.compactFontPx,
        color: isFieldDisabled(field) ? "muted" : "text",
      })},
      {width: "3fr", height, draw: (slotX, slotY, slotW, slotH) => drawScalarControl(host, slotX, slotY, slotW, slotH, field, density)},
    ],
  })
}

function drawScalarControl(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: Exclude<FieldDefinition, BooleanFieldDefinition | VectorFieldDefinition | RotationFieldDefinition | MatrixFieldDefinition | CollectionFieldDefinition>,
  density: "regular" | "compact",
): void {
  const disabled = isFieldDisabled(field)
  if (field.kind === "number") {
    NumberInput(host, x, y, width, height, numberInputProps(field, density))
    return
  }
  if (field.kind === "enum") {
    EnumInput(host, x, y, width, height, enumInputProps(field, density))
    return
  }
  if (field.kind === "color") {
    ColorInput(host, x, y, width, height, colorInputProps(field, density))
    return
  }
  if (field.kind === "reference") {
    ReferenceInput(host, x, y, width, height, referenceInputProps(field, density))
    return
  }
  if (field.kind === "path") {
    PathInput(host, x, y, width, height, pathInputProps(field, density))
    return
  }
  const value = field.kind === "readonly" ? String(field.value) : field.value
  const props: Parameters<typeof TextField>[5] = {
    key: fieldKey(field),
    value,
    disabled: disabled || field.kind === "readonly",
    submitOnEnter: true,
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

function drawCompactCollectionField(
  host: UiSurface,
  x: number,
  y: number,
  width: number,
  height: number,
  field: CollectionFieldDefinition,
  metrics: CompactMetrics,
): void {
  const props = collectionInputProps(field, "compact")
  const controlHeight = measureCollectionInputHeight(props)
  if (field.compactLabel === "hidden") {
    CollectionInput(host, x, y, width, controlHeight, props)
    return
  }
  flexColumn({
    x,
    y,
    w: width,
    h: height,
    gap: metrics.gap,
    items: [
      {height: metrics.control, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {children: field.label, fontPx: metrics.font})},
      {height: controlHeight, draw: (slotX, slotY, slotW, slotH) => {
        CollectionInput(host, slotX, slotY, slotW, slotH, props)
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

export {nextEnumInputValue as nextEnumFieldValue} from "./EnumInput.ts"

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
    layout: "inline",
    value: normalizeNumberFieldValue(field.value, field),
    max: field.max!,
    step: field.step ?? (field.numberKind === "integer" ? 1 : 0.01),
    buttonHeight: uiShapeMetrics.controlHeight,
    labelFontPx: uiShapeMetrics.compactFontPx,
    valueFontPx: uiShapeMetrics.compactFontPx,
    format: (entry) => `${entry}${field.unit ?? ""}`,
    onChange: (entry) => {
      if (!isFieldDisabled(field)) field.onChange?.(normalizeNumberFieldValue(entry, field))
    },
  }
  if (field.min !== undefined) props.min = field.min
  SliderControl(host, x, y, width, props)
}

function drawBooleanField(host: UiSurface, x: number, y: number, width: number, height: number, field: BooleanFieldDefinition): void {
  const disabled = isFieldDisabled(field)
  const onChange = !disabled && field.onChange !== undefined ? (value: boolean) => field.onChange!(value) : undefined
  const controlWidth = field.presentation === "checkbox"
    ? uiShapeMetrics.iconActionSlot
    : uiShapeMetrics.iconActionSlot * 1.9
  flexRow({
    x,
    y,
    w: width,
    h: height,
    gap: uiShapeMetrics.tightGap * 2,
    alignItems: "center",
    items: [
      {width: "grow", height, draw: (slotX, slotY, slotW, slotH) => Typography(host, slotX, slotY, slotW, slotH, {
        children: field.label,
        color: disabled ? "muted" : "text",
        fontPx: uiShapeMetrics.compactFontPx,
      })},
      {width: controlWidth, height: uiShapeMetrics.controlHeight, draw: (slotX, slotY, slotW, slotH) => {
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
  EnumInput(host, x, y, width, height, enumInputProps(field, "regular"))
}

function enumInputProps(field: EnumFieldDefinition, density: EnumInputDensity): EnumInputProps {
  const props: EnumInputProps = {
    value: field.value,
    options: field.options,
    density,
  }
  if (field.description !== undefined) props.tooltip = field.description
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  return props
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
  ReferenceInput(host, x, y, width, height, referenceInputProps(field, "regular"))
}

function referenceInputProps(
  field: ReferenceFieldDefinition,
  density: ReferenceInputDensity,
): ReferenceInputProps {
  const props: ReferenceInputProps = {
    value: field.value,
    density,
  }
  if (field.placeholder !== undefined) props.placeholder = field.placeholder
  if (field.description !== undefined) props.tooltip = field.description
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onActivate !== undefined) props.onActivate = field.onActivate
  if (field.onClear !== undefined) props.onClear = field.onClear
  return props
}

function drawPathField(host: UiSurface, x: number, y: number, width: number, height: number, field: PathFieldDefinition): void {
  PathInput(host, x, y, width, height, pathInputProps(field, "regular"))
}

function pathInputProps(
  field: PathFieldDefinition,
  density: PathInputDensity,
): PathInputProps {
  const props: PathInputProps = {
    key: fieldKey(field),
    value: field.value,
    density,
  }
  if (field.placeholder !== undefined) props.placeholder = field.placeholder
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onChange !== undefined) props.onChange = field.onChange
  if (field.onBrowse !== undefined) props.onBrowse = field.onBrowse
  return props
}

function drawCollectionField(host: UiSurface, x: number, y: number, width: number, height: number, field: CollectionFieldDefinition): void {
  CollectionInput(host, x, y, width, height, collectionInputProps(field, "regular"))
}

function collectionInputProps(
  field: CollectionFieldDefinition,
  density: CollectionInputDensity,
): CollectionInputProps {
  const props: CollectionInputProps = {
    key: fieldKey(field),
    items: field.items,
    selectedId: field.selectedId,
    density,
  }
  if (field.visibleRows !== undefined) props.visibleRows = field.visibleRows
  if (field.emptyLabel !== undefined) props.emptyLabel = field.emptyLabel
  if (field.disabled !== undefined) props.disabled = field.disabled
  if (field.readOnly !== undefined) props.readOnly = field.readOnly
  if (field.onSelect !== undefined) props.onSelect = field.onSelect
  if (field.onAdd !== undefined) props.onAdd = field.onAdd
  if (field.onRemove !== undefined) props.onRemove = field.onRemove
  if (field.onMove !== undefined) props.onMove = field.onMove
  return props
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
