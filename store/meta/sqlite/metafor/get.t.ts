export type MetaRow = {
  src: string
  name: string | null
  desc: string | null
  view_css: string | null
  has_processes: number
  has_reactions: number
  has_matter: number
}

export type MetaMassValueRow = {
  uuid: string
  parent_value: string | null
  value_kind: "object" | "array" | "string" | "number" | "boolean" | "null"
  entry_key: string | null
  entry_order: number | null
  text_value: string | null
  number_value: number | null
  boolean_value: number | null
}
