import type { NodeType, ReactionsSchema } from "@metafor/dsl"
import type { Mass } from "@metafor/dsl"

export type ArrayElementType = "string" | "number"

export type MetaDSLLike = {
  name: string
  desc?: string
  fields?: Record<string, unknown>
  superposition?: Record<string, Record<string, unknown> | null>
  processes?: Record<string, unknown>
  reactions?: ReactionsSchema | null
  matter?: NodeType[]
  view?: string
  mass?: Record<string, unknown>
}

export interface MetaJson {
  type: "action" | "finally"
  label?: string
  desc?: string
  action?: {
    src?: string
    importSpecifier?: string
    read?: string[]
  }
  success?: {
    src: string
    read?: string[]
    write?: string[]
  }
  error?: {
    src: string
    read?: string[]
    write?: string[]
  }
  before?: {
    src: string
    read?: string[]
  }
}

export interface ViewJson {
  view?: string
}

export type FieldKey = string

export interface FieldDefinitionJson {
  type: string
  required?: boolean
  label?: string
  default?: unknown
  values?: string[] | number[]
}

export type FieldsAST = Record<FieldKey, FieldDefinitionJson>

export interface ReactionDefinitionJson {
  label: string
  desc?: string
  cond: string
  read?: string[]
  write?: string[]
  src: string
}

export interface MetaAST {
  name: string
  fields: FieldsAST
  superposition: Record<string, Record<string, unknown> | null>
  processes?: Record<string, MetaJson>
  reactions?: {
    reactions: Record<string, ReactionDefinitionJson>
    superposition: Record<string, string[]>
  }
  matter?: NodeType[]
  bulk?: ViewJson
  mass?: Mass
}

export interface NormalizeMetaASTOptions {
  arrayElementTypes?: Record<string, ArrayElementType>
}
