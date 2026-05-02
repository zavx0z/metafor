export type FieldUuidByKey = Map<string, string>

export type ProcessRow = {
  uuid: string
  key: string
  type: "action" | "finally"
  label: string | null
  desc: string | null
}

export type ProcessActionRow = {
  process: string
  action: string
  action_import_specifier: string | null
  action_wrapper_src: string | null
  success: string | null
  error: string | null
}

export type ProcessActionReadRow = {
  process: string
  phase: "action" | "success" | "error"
  field: string
}

export type ProcessActionWriteRow = {
  process: string
  phase: "success" | "error"
  field: string
}
