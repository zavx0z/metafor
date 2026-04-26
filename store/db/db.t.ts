import type { FieldKey, Mass, MetaDSL } from "../../index.ts"

/**
 * Краткий снимок схемы поля для канонической relational DB.
 *
 * Схема живёт на meta-level и затем переиспользуется actor-level сущностями через FK.
 */
export interface DbFieldSchemaRecord {
  type: string
  required: boolean
  topology: boolean
  label?: string
  values?: readonly (string | number)[]
}

export interface DbMetaRecord {
  id: string
  src: string
  name?: string
  bulk?: MetaDSL["bulk"]
  mass?: MetaDSL["mass"] | Mass
}

export interface DbMetaFieldRecord {
  id: string
  ownerMetaId: string
  fieldKey: FieldKey
  fieldOrder: number
  schema: DbFieldSchemaRecord
}

export interface DbMetaStateRecord {
  id: string
  ownerMetaId: string
  stateName: string
  stateOrder: number
  initial: boolean
}

export interface DbMetaTransitionRecord {
  id: string
  ownerMetaStateId: string
  targetMetaStateId: string | null
  transitionOrder: number
}

export interface DbMetaTransitionConditionRecord {
  id: string
  ownerMetaTransitionId: string
  metaFieldId: string
  conditionOrder: number
  condition: unknown
}

export interface DbMetaProcessRecord {
  id: string
  ownerMetaId: string
  processKey: string
  processOrder: number
  processKind: "action" | "finally"
  label?: string
  desc?: string
  actionSrc?: string
  actionImportSpecifier?: string
  actionWrapperSrc?: string
  successSrc?: string
  errorSrc?: string
  beforeSrc?: string
}

export interface DbMetaProcessReadRecord {
  id: string
  ownerMetaProcessId: string
  metaFieldId: string
  phase: "action" | "success" | "error" | "before"
  readOrder: number
}

export interface DbMetaProcessWriteRecord {
  id: string
  ownerMetaProcessId: string
  metaFieldId: string
  phase: "success" | "error"
  writeOrder: number
}

export interface DbMetaReactionRecord {
  id: string
  ownerMetaId: string
  reactionKey: string
  reactionOrder: number
  label: string
  desc?: string
  cond: string
  src: string
}

export interface DbMetaReactionStateRecord {
  id: string
  ownerMetaReactionId: string
  metaStateId: string
  stateOrder: number
}

export interface DbMetaReactionReadRecord {
  id: string
  ownerMetaReactionId: string
  metaFieldId: string
  readOrder: number
}

export interface DbMetaReactionWriteRecord {
  id: string
  ownerMetaReactionId: string
  metaFieldId: string
  writeOrder: number
}

export interface DbMetaMatterNodeRecord {
  id: string
  ownerMetaId: string
  nodeType: string
  nodeOrder: number
  payload: Record<string, unknown>
}

export interface DbMetaMatterEdgeRecord {
  id: string
  ownerMetaId: string
  parentNodeId: string | null
  childNodeId: string
  edgeOrder: number
}

export type {
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpStateRecord,
} from "../view/types.t.ts"
import type {
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpStateRecord,
} from "../view/types.t.ts"

/**
 * Канонический relational dataset DB-layer.
 *
 * В persisted слое хранятся только сущности и отношения.
 * Любые derived projection/index-space структуры строятся уже после чтения в CPU memory.
 */
export interface DbData {
  metas: DbMetaRecord[]
  metaFields: DbMetaFieldRecord[]
  metaStates: DbMetaStateRecord[]
  metaTransitions: DbMetaTransitionRecord[]
  metaTransitionConditions: DbMetaTransitionConditionRecord[]
  metaProcesses: DbMetaProcessRecord[]
  metaProcessReads: DbMetaProcessReadRecord[]
  metaProcessWrites: DbMetaProcessWriteRecord[]
  metaReactions: DbMetaReactionRecord[]
  metaReactionStates: DbMetaReactionStateRecord[]
  metaReactionReads: DbMetaReactionReadRecord[]
  metaReactionWrites: DbMetaReactionWriteRecord[]
  metaMatterNodes: DbMetaMatterNodeRecord[]
  metaMatterEdges: DbMetaMatterEdgeRecord[]
  wimps: DbWimpRecord[]
  wimpFields: DbWimpFieldRecord[]
  wimpEdges: DbWimpEdgeRecord[]
  fieldValues: DbFieldValueRecord[]
  fieldSources: DbFieldSourceRecord[]
  wimpStates: DbWimpStateRecord[]
  entanglements: DbEntanglementRecord[]
  entanglementMembers: DbEntanglementMemberRecord[]
  entanglementFields: DbEntanglementFieldRecord[]
  entanglementFieldMembers: DbEntanglementFieldMemberRecord[]
}
