export type WimpMassValueRow = {
  id: number
  parent_value: number | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}
