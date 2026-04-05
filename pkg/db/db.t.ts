import type { FieldKey, MetaAST } from "@metafor/ast"
import type { Mass } from "../../index.ts"

/**
 * Краткий снимок схемы поля для канонической relational DB.
 *
 * Схема живёт на meta-level и затем переиспользуется instance-level сущностями через FK.
 */
export interface SharedDbFieldSchemaRecord {
  type: string
  required: boolean
  topology: boolean
  label?: string
  values?: readonly (string | number)[]
}

export interface SharedDbMetaRecord {
  id: string
  src: string
  name?: string
  bulk?: MetaAST["bulk"]
  mass?: MetaAST["mass"] | Mass
}

export interface SharedDbMetaFieldRecord {
  id: string
  ownerMetaId: string
  fieldKey: FieldKey
  fieldOrder: number
  schema: SharedDbFieldSchemaRecord
}

export interface SharedDbMetaStateRecord {
  id: string
  ownerMetaId: string
  stateName: string
  stateOrder: number
  initial: boolean
}

export interface SharedDbMetaTransitionRecord {
  id: string
  ownerMetaStateId: string
  targetMetaStateId: string | null
  transitionOrder: number
}

export interface SharedDbMetaTransitionConditionRecord {
  id: string
  ownerMetaTransitionId: string
  metaFieldId: string
  conditionOrder: number
  condition: unknown
}

export interface SharedDbMetaProcessRecord {
  id: string
  ownerMetaId: string
  processKey: string
  processOrder: number
  processKind: "action" | "finally"
  label?: string
  desc?: string
  actionSrc?: string
  actionImportSpecifier?: string
  successSrc?: string
  errorSrc?: string
  beforeSrc?: string
}

export interface SharedDbMetaProcessReadRecord {
  id: string
  ownerMetaProcessId: string
  metaFieldId: string
  phase: "action" | "success" | "error" | "before"
  readOrder: number
}

export interface SharedDbMetaProcessWriteRecord {
  id: string
  ownerMetaProcessId: string
  metaFieldId: string
  phase: "success" | "error"
  writeOrder: number
}

export interface SharedDbMetaReactionRecord {
  id: string
  ownerMetaId: string
  reactionKey: string
  reactionOrder: number
  label: string
  desc?: string
  cond: string
  src: string
}

export interface SharedDbMetaReactionStateRecord {
  id: string
  ownerMetaReactionId: string
  metaStateId: string
  stateOrder: number
}

export interface SharedDbMetaReactionReadRecord {
  id: string
  ownerMetaReactionId: string
  metaFieldId: string
  readOrder: number
}

export interface SharedDbMetaReactionWriteRecord {
  id: string
  ownerMetaReactionId: string
  metaFieldId: string
  writeOrder: number
}

export interface SharedDbMetaMatterNodeRecord {
  id: string
  ownerMetaId: string
  nodeType: string
  nodeOrder: number
  payload: Record<string, unknown>
}

export interface SharedDbMetaMatterEdgeRecord {
  id: string
  ownerMetaId: string
  parentNodeId: string | null
  childNodeId: string
  edgeOrder: number
}

export interface SharedDbWimpRecord {
  id: string
  metaId: string
  wimpOrder: number
  massOverride?: unknown
}

export interface SharedDbWimpFieldRecord {
  id: string
  ownerWimpId: string
  metaFieldId: string
  fieldOrder: number
}

export interface SharedDbWimpEdgeRecord {
  id: string
  parentWimpId: string | null
  childWimpId: string
  edgeOrder: number
}

export interface SharedDbFieldValueRecord {
  id: string
  ownerWimpFieldId: string
  value: unknown
}

export interface SharedDbFieldSourceRecord {
  id: string
  childWimpFieldId: string
  parentWimpFieldId: string
}

export interface SharedDbWimpStateRecord {
  id: string
  ownerWimpId: string
  metaStateId: string
}

export interface SharedDbEntanglementRecord {
  id: string
  membershipKey: string
  provenance: string
}

export interface SharedDbEntanglementMemberRecord {
  id: string
  ownerEntanglementId: string
  wimpId: string
  memberOrder: number
}

export interface SharedDbEntanglementFieldRecord {
  id: string
  ownerEntanglementId: string
  fieldOrder: number
  semanticKey: string
  fieldName: string
  provenance: string
  representativeWimpFieldId: string
  payloadIds: string[]
  semanticKeys: string[]
}

export interface SharedDbEntanglementFieldMemberRecord {
  id: string
  ownerEntanglementFieldId: string
  ownerWimpId: string
  wimpFieldId: string
  memberOrder: number
}

/**
 * Канонический relational dataset shared/db.
 *
 * В persisted слое хранятся только сущности и отношения.
 * Любые derived projection/index-space структуры строятся уже после чтения в CPU memory.
 */
export interface SharedDbData {
  metas: SharedDbMetaRecord[]
  metaFields: SharedDbMetaFieldRecord[]
  metaStates: SharedDbMetaStateRecord[]
  metaTransitions: SharedDbMetaTransitionRecord[]
  metaTransitionConditions: SharedDbMetaTransitionConditionRecord[]
  metaProcesses: SharedDbMetaProcessRecord[]
  metaProcessReads: SharedDbMetaProcessReadRecord[]
  metaProcessWrites: SharedDbMetaProcessWriteRecord[]
  metaReactions: SharedDbMetaReactionRecord[]
  metaReactionStates: SharedDbMetaReactionStateRecord[]
  metaReactionReads: SharedDbMetaReactionReadRecord[]
  metaReactionWrites: SharedDbMetaReactionWriteRecord[]
  metaMatterNodes: SharedDbMetaMatterNodeRecord[]
  metaMatterEdges: SharedDbMetaMatterEdgeRecord[]
  wimps: SharedDbWimpRecord[]
  wimpFields: SharedDbWimpFieldRecord[]
  wimpEdges: SharedDbWimpEdgeRecord[]
  fieldValues: SharedDbFieldValueRecord[]
  fieldSources: SharedDbFieldSourceRecord[]
  wimpStates: SharedDbWimpStateRecord[]
  entanglements: SharedDbEntanglementRecord[]
  entanglementMembers: SharedDbEntanglementMemberRecord[]
  entanglementFields: SharedDbEntanglementFieldRecord[]
  entanglementFieldMembers: SharedDbEntanglementFieldMemberRecord[]
}
