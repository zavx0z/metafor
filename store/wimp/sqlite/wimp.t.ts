export type WimpSource = string

export type WimpRow = {
  src: string
  name: string | null
  desc: string | null
  view_css: string | null
}

export type WimpMassValueRow = {
  uuid: string
  parent_value: string | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}
