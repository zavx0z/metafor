import type { MetaDSL } from "../../.."

export type FieldUuidByKey = Map<string, string>
export type VariantUuidByValue = Map<string, Map<string, string>>


export type FieldRow = {
  uuid: string
  key: string
  type: "string" | "number" | "boolean" | "array" | "enum"
  required: number
  label: string | null
}

export type MetaFieldSchema = NonNullable<MetaDSL["fields"]>[string]

export type GetFieldsResult = {
  fields: NonNullable<MetaDSL["fields"]>
  fieldKeys: Map<string, string>
  enumVariants: Map<string, string>
}
