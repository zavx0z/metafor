export type EnergyRuntimeActorRow = {id: number; wimp: string}

export type EnergyRuntimeProcessActionRow = {
  wimp: string
  key: string
  action: string
  importSpecifier: string | null
  wrapperSrc: string | null
  success: string | null
  error: string | null
}

export type EnergyRuntimeProcessFinallyRow = {
  wimp: string
  key: string
  before: string
}

export type EnergyRuntimeProcessEnvRow = {wimp: string; key: string; env: string}

export interface EnergyRuntimeProcessActionFieldAccessRow {
  wimp: string
  key: string
  phase: string
  field: number
  fieldKey: string
}

export interface EnergyRuntimeProcessFinallyFieldAccessRow {
  wimp: string
  key: string
  field: number
  fieldKey: string
}

export type BoundaryMatrixActorRow = {id: number; wimp: string; position: number}

export type BoundaryMatrixFieldRow = {
  id: number
  wimp: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
  label: string | null
}

export type BoundaryMatrixStateRow = {id: number; wimp: string; name: string; position: number}

export type BoundaryMatrixTransitionRow = {id: number; fromState: number; toState: number; position: number}

export type BoundaryMatrixConditionRow = {id: number; transition: number; field: number; position: number}

export type BoundaryMatrixPredicateRow = {
  id: number
  condition: number
  predicateOrder: number
  subjectKind: "value" | "length"
  operator: string
  valueKind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: number | null
}

export type BoundaryMatrixPredicateListItemRow = {
  predicate: number
  itemOrder: number
  valueKind: "null" | "boolean" | "number" | "string" | "enum"
  valueBoolean: number | null
  valueNumber: number | null
  valueText: string | null
  valueVariant: number | null
}

export type BoundaryMatrixProcessRow = {wimp: string; key: string}

export type BoundaryMatrixValueRow = {
  id: number
  kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  booleanValue: number | null
  numberValue: number | null
  textValue: string | null
  variant: number | null
  enumValue: string | null
}
