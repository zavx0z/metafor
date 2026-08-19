import type {FieldColor, FieldDefinition, FieldReference} from "@ui/components"

export type FieldSection = "Values" | "Selection" | "Composite" | "Reference"
export type FieldRoute = "field/values" | "field/selection" | "field/composite" | "field/reference"

export const FIELD_SECTIONS: readonly FieldSection[] = ["Values", "Selection", "Composite", "Reference"]
export const FIELD_ROUTES: readonly FieldRoute[] = ["field/values", "field/selection", "field/composite", "field/reference"]

const SECTION_BY_ID: Readonly<Record<string, FieldSection>> = Object.freeze({
  text: "Values",
  number: "Values",
  slider: "Values",
  readonly: "Values",
  boolean: "Selection",
  enum: "Selection",
  color: "Selection",
  vector: "Composite",
  rotation: "Composite",
  matrix: "Composite",
  reference: "Reference",
})

export function createFieldPlaygroundDefinitions(
  update: (id: string, value: unknown) => void,
  activateReference: () => void,
): readonly FieldDefinition[] {
  return [
    {id: "text", label: "Text", kind: "text", value: "UI component", onChange: (value) => update("text", value)},
    {id: "number", label: "Number", kind: "number", value: 0.625, step: 0.025, onChange: (value) => update("number", value)},
    {id: "slider", label: "Factor", kind: "number", presentation: "slider", value: 0.72, min: 0, max: 1, step: 0.01, onChange: (value) => update("slider", value)},
    {id: "readonly", label: "Result", kind: "readonly", value: "Ready"},
    {id: "boolean", label: "Normalize", kind: "boolean", presentation: "switch", value: true, onChange: (value) => update("boolean", value)},
    {id: "enum", label: "Operation", kind: "enum", value: "multiply", options: [
      {value: "add", label: "Add"},
      {value: "multiply", label: "Multiply"},
      {value: "power", label: "Power"},
    ], onChange: (value) => update("enum", value)},
    {id: "color", label: "Color", kind: "color", value: {r: 0.18, g: 0.58, b: 0.92, a: 1}, onChange: (value) => update("color", value)},
    {id: "vector", label: "Vector", kind: "vector", value: [1, 2, 3], onChange: (value) => update("vector", value)},
    {id: "rotation", label: "Rotation", kind: "rotation", value: [0, 45, 90], unit: "°", onChange: (value) => update("rotation", value)},
    {id: "matrix", label: "Matrix", kind: "matrix", value: [[1, 0], [0, 1]], onChange: (value) => update("matrix", value)},
    {id: "reference", label: "Material", kind: "reference", value: {id: "material-1", label: "Material.001", kind: "material"}, onActivate: activateReference},
  ]
}

export function fieldsForSection(fields: readonly FieldDefinition[], section: FieldSection): readonly FieldDefinition[] {
  return fields.filter(({id}) => SECTION_BY_ID[id] === section)
}

export function fieldSectionFromRoute(route: FieldRoute): FieldSection {
  if (route === "field/selection") return "Selection"
  if (route === "field/composite") return "Composite"
  if (route === "field/reference") return "Reference"
  return "Values"
}

export function fieldRouteFromSection(section: FieldSection): FieldRoute {
  if (section === "Selection") return "field/selection"
  if (section === "Composite") return "field/composite"
  if (section === "Reference") return "field/reference"
  return "field/values"
}

export function updateFieldDefinition(field: FieldDefinition, value: unknown): FieldDefinition {
  if (field.kind === "text" && typeof value === "string") return {...field, value}
  if (field.kind === "number" && typeof value === "number") return {...field, value}
  if (field.kind === "boolean" && typeof value === "boolean") return {...field, value}
  if (field.kind === "enum" && typeof value === "string") return {...field, value}
  if (field.kind === "color" && isFieldColor(value)) return {...field, value}
  if ((field.kind === "vector" || field.kind === "rotation") && isNumberArray(value)) return {...field, value}
  if (field.kind === "matrix" && isMatrix(value)) return {...field, value}
  if (field.kind === "reference" && (value === null || isFieldReference(value))) return {...field, value}
  return field
}

export function toggledReference(value: FieldReference | null): FieldReference | null {
  return value === null ? {id: "material-1", label: "Material.001", kind: "material"} : null
}

export function displayFieldValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null) return "null"
  if (Array.isArray(value)) return JSON.stringify(value)
  if (isFieldReference(value)) return value.label
  if (isFieldColor(value)) return `rgba(${value.r.toFixed(2)}, ${value.g.toFixed(2)}, ${value.b.toFixed(2)}, ${value.a.toFixed(2)})`
  return "updated"
}

function isFieldColor(value: unknown): value is FieldColor {
  return typeof value === "object" && value !== null &&
    ["r", "g", "b", "a"].every((key) => Number.isFinite((value as Record<string, unknown>)[key]))
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(Number.isFinite)
}

function isMatrix(value: unknown): value is readonly (readonly number[])[] {
  return Array.isArray(value) && value.every(isNumberArray)
}

function isFieldReference(value: unknown): value is FieldReference {
  return typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).label === "string"
}
