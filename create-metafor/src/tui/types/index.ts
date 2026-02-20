export type Field = "name" | "desc" | "dir"
export type View = "input" | "help" | "menu"

export interface MenuItem {
  key: string
  label: string
  action?: () => void
}

export interface FormState {
  field: Field
  name: string
  desc: string
  dir: string
  input: string
  view: View
  selectedItem: number
}
