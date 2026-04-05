import type { FieldKey, MetaDSL } from "../../index.ts"

export type MetaAST = MetaDSL
export type MetaJson = MetaDSL
export type FieldsAST = NonNullable<MetaDSL["fields"]>
export type FieldDefinitionJson = FieldsAST[string]
export type { FieldKey }
