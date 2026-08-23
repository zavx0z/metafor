import type {ParsedFinally} from "@metafor/types/metafor/finally"
import type {ProcessType, ParsedProcess} from "@metafor/types/metafor/process"
import type {MetaDSL, MetaFieldDSL, MetaReactionDSL, MetaSuperpositionDSL} from "@metafor/types/metafor/schema"
import type {MatterParticle} from "@metafor/types/metafor/matter"

export interface WimpCreateProcessInput {
  key: string
  declaration: ParsedProcess | ParsedFinally
}

export interface WimpCreateInput {
  name?: string | null | undefined
  desc?: string | null | undefined
  bulk?: MetaDSL["bulk"] | null | undefined
  fields?: readonly MetaFieldDSL[] | undefined
  superposition?: readonly MetaSuperpositionDSL[] | undefined
  processes?: readonly WimpCreateProcessInput[] | undefined
  reactions?: readonly MetaReactionDSL[] | undefined
  matter?: readonly MatterParticle[] | undefined
}

export interface WimpReactionRow {
  id: number
  key: string
  label: string
  desc: string | null
  cond_source: string
  update_source: string
}

export type WimpSnapshot = {
  wimp: {src: string; name: string | null; desc: string | null; view: string | null}
  fields: Array<{id: number; wimp: string; key: string; type: string; required: boolean; label: string | null}>
  enumVariants: Array<{id: number; field: number; position: number; itemValue: string}>
  states: Array<{id: number; wimp: string; name: string; position: number}>
}

export type PredicateRow = {
  id: number
  condition: number
  predicate_order: number
  operator: string
  value_kind: "null" | "boolean" | "number" | "string" | "enum" | "list" | "json"
  value_boolean: number | null
  value_number: number | null
  value_text: string | null
  value_variant: number | null
  value_json: string | null
}

export type ProcessTypeValue = `${ProcessType}`

export type ProcessActionReadPhase = "action" | "success" | "error"

export type ProcessActionWritePhase = "success" | "error"
