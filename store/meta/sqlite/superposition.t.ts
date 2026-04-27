export type FieldUuidByKey = Map<string, string>
export type StateUuidByName = Map<string, string>

export type PredicateRow = {
  uuid: string
  condition: string
  predicate_order: number
  operator: string
  value_kind: "null" | "boolean" | "number" | "string" | "enum" | "list"
  value_boolean: number | null
  value_number: number | null
  value_text: string | null
  value_variant: string | null
}

export type ConditionListItemRow = {
  predicate: string
  item_order: number
  value_kind: PredicateRow["value_kind"]
  value_boolean: number | null
  value_number: number | null
  value_text: string | null
  value_variant: string | null
}
