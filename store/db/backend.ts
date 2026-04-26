import { dbViewRequiredBackendIndexes } from "../view/backend.t.ts"
import type { DbBackendIndexSpec } from "./backend.t.ts"
import type {
  DbData,
  DbEntanglementFieldMemberRecord,
  DbEntanglementFieldRecord,
  DbEntanglementMemberRecord,
  DbEntanglementRecord,
  DbFieldSourceRecord,
  DbFieldValueRecord,
  DbMetaFieldRecord,
  DbMetaMatterEdgeRecord,
  DbMetaMatterNodeRecord,
  DbMetaProcessReadRecord,
  DbMetaProcessRecord,
  DbMetaProcessWriteRecord,
  DbMetaReactionReadRecord,
  DbMetaReactionRecord,
  DbMetaReactionStateRecord,
  DbMetaReactionWriteRecord,
  DbMetaRecord,
  DbMetaStateRecord,
  DbMetaTransitionConditionRecord,
  DbMetaTransitionRecord,
  DbWimpEdgeRecord,
  DbWimpFieldRecord,
  DbWimpRecord,
  DbWimpStateRecord,
} from "./db.t.ts"

const cloneRows = <T>(rows: T[]): T[] => rows.map((row) => structuredClone(row))

const compareById = <T extends { id: string }>(left: T, right: T): number => left.id.localeCompare(right.id)

const requireUniqueIds = <T extends { id: string }>(name: string, rows: T[]): void => {
  const ids = new Set<string>()
  rows.forEach((row) => {
    if (ids.has(row.id)) {
      throw new Error(`Duplicate ${name} id: ${row.id}`)
    }
    ids.add(row.id)
  })
}

const requireUniqueKey = <T>(name: string, rows: T[], selectKey: (row: T) => string): void => {
  const seen = new Set<string>()
  rows.forEach((row) => {
    const key = selectKey(row)
    if (seen.has(key)) {
      throw new Error(`Duplicate ${name} key: ${key}`)
    }
    seen.add(key)
  })
}

const requireReference = (
  entityName: string,
  entityId: string,
  foreignName: string,
  foreignId: string | null | undefined,
  knownIds: Set<string>,
): void => {
  if (!foreignId) {
    throw new Error(`${entityName} ${entityId} references empty ${foreignName}`)
  }
  if (!knownIds.has(foreignId)) {
    throw new Error(`${entityName} ${entityId} references unknown ${foreignName}: ${foreignId}`)
  }
}

/**
 * Meta-уровневые индексы canonical relational DB.
 *
 * Покрывают все 14 meta_* таблиц (metas + meta_fields + meta_states + meta_transitions +
 * meta_transition_conditions + meta_processes + meta_process_reads + meta_process_writes +
 * meta_reactions + meta_reaction_states + meta_reaction_reads + meta_reaction_writes +
 * meta_matter_nodes + meta_matter_edges).
 *
 * View-уровневые индексы живут отдельно в `store/view/backend.t.ts`.
 */
export const dbMetaRequiredBackendIndexes: readonly DbBackendIndexSpec[] = [
  { name: "metas_by", table: "metas", columns: ["src"], unique: true },
  { name: "meta_fields_by_owner_meta", table: "meta_fields", columns: ["ownerMetaId"], unique: false },
  { name: "meta_fields_by_owner_and_field_key", table: "meta_fields", columns: ["ownerMetaId", "fieldKey"], unique: true },
  { name: "meta_fields_by_owner_and_field_order", table: "meta_fields", columns: ["ownerMetaId", "fieldOrder"], unique: true },
  { name: "meta_states_by_owner_meta", table: "meta_states", columns: ["ownerMetaId"], unique: false },
  { name: "meta_states_by_owner_and_state_name", table: "meta_states", columns: ["ownerMetaId", "stateName"], unique: true },
  { name: "meta_states_by_owner_and_state_order", table: "meta_states", columns: ["ownerMetaId", "stateOrder"], unique: true },
  { name: "meta_transitions_by_owner_state", table: "meta_transitions", columns: ["ownerMetaStateId"], unique: false },
  { name: "meta_transitions_by_owner_state_and_order", table: "meta_transitions", columns: ["ownerMetaStateId", "transitionOrder"], unique: true },
  {
    name: "meta_transition_conditions_by_owner_transition",
    table: "meta_transition_conditions",
    columns: ["ownerMetaTransitionId"],
    unique: false,
  },
  {
    name: "meta_transition_conditions_by_owner_transition_and_order",
    table: "meta_transition_conditions",
    columns: ["ownerMetaTransitionId", "conditionOrder"],
    unique: true,
  },
  { name: "meta_processes_by_owner_meta", table: "meta_processes", columns: ["ownerMetaId"], unique: false },
  { name: "meta_processes_by_owner_and_process_key", table: "meta_processes", columns: ["ownerMetaId", "processKey"], unique: true },
  {
    name: "meta_processes_by_owner_and_process_order",
    table: "meta_processes",
    columns: ["ownerMetaId", "processOrder"],
    unique: true,
  },
  {
    name: "meta_process_reads_by_owner_process",
    table: "meta_process_reads",
    columns: ["ownerMetaProcessId"],
    unique: false,
  },
  {
    name: "meta_process_reads_by_process_phase_and_order",
    table: "meta_process_reads",
    columns: ["ownerMetaProcessId", "phase", "readOrder"],
    unique: true,
  },
  {
    name: "meta_process_writes_by_owner_process",
    table: "meta_process_writes",
    columns: ["ownerMetaProcessId"],
    unique: false,
  },
  {
    name: "meta_process_writes_by_process_phase_and_order",
    table: "meta_process_writes",
    columns: ["ownerMetaProcessId", "phase", "writeOrder"],
    unique: true,
  },
  { name: "meta_reactions_by_owner_meta", table: "meta_reactions", columns: ["ownerMetaId"], unique: false },
  { name: "meta_reactions_by_owner_and_reaction_key", table: "meta_reactions", columns: ["ownerMetaId", "reactionKey"], unique: true },
  {
    name: "meta_reactions_by_owner_and_reaction_order",
    table: "meta_reactions",
    columns: ["ownerMetaId", "reactionOrder"],
    unique: true,
  },
  {
    name: "meta_reaction_states_by_owner_reaction",
    table: "meta_reaction_states",
    columns: ["ownerMetaReactionId"],
    unique: false,
  },
  {
    name: "meta_reaction_states_by_reaction_and_state",
    table: "meta_reaction_states",
    columns: ["ownerMetaReactionId", "metaStateId"],
    unique: true,
  },
  {
    name: "meta_reaction_reads_by_owner_reaction",
    table: "meta_reaction_reads",
    columns: ["ownerMetaReactionId"],
    unique: false,
  },
  { name: "meta_reaction_reads_by_reaction_and_order", table: "meta_reaction_reads", columns: ["ownerMetaReactionId", "readOrder"], unique: true },
  {
    name: "meta_reaction_writes_by_owner_reaction",
    table: "meta_reaction_writes",
    columns: ["ownerMetaReactionId"],
    unique: false,
  },
  {
    name: "meta_reaction_writes_by_reaction_and_order",
    table: "meta_reaction_writes",
    columns: ["ownerMetaReactionId", "writeOrder"],
    unique: true,
  },
  { name: "meta_matter_nodes_by_owner_meta", table: "meta_matter_nodes", columns: ["ownerMetaId"], unique: false },
  { name: "meta_matter_nodes_by_owner_and_order", table: "meta_matter_nodes", columns: ["ownerMetaId", "nodeOrder"], unique: true },
  { name: "meta_matter_edges_by_owner_meta", table: "meta_matter_edges", columns: ["ownerMetaId"], unique: false },
  {
    name: "meta_matter_edges_by_parent_and_edge_order",
    table: "meta_matter_edges",
    columns: ["parentNodeId", "edgeOrder"],
    unique: false,
  },
] as const

/**
 * Объединённый список индексов unified DbBackend (meta + view).
 *
 * Существует для обратной совместимости — современные потребители должны брать meta-индексы
 * из `dbMetaRequiredBackendIndexes`, а view-индексы — из `dbViewRequiredBackendIndexes`
 * в `store/view/backend.t.ts`.
 */
export const dbRequiredBackendIndexes: readonly DbBackendIndexSpec[] = [
  ...dbMetaRequiredBackendIndexes,
  ...(dbViewRequiredBackendIndexes as readonly DbBackendIndexSpec[]),
] as const

export const createEmptyDbData = (): DbData => ({
  metas: [],
  metaFields: [],
  metaStates: [],
  metaTransitions: [],
  metaTransitionConditions: [],
  metaProcesses: [],
  metaProcessReads: [],
  metaProcessWrites: [],
  metaReactions: [],
  metaReactionStates: [],
  metaReactionReads: [],
  metaReactionWrites: [],
  metaMatterNodes: [],
  metaMatterEdges: [],
  wimps: [],
  wimpFields: [],
  wimpEdges: [],
  fieldValues: [],
  fieldSources: [],
  wimpStates: [],
  entanglements: [],
  entanglementMembers: [],
  entanglementFields: [],
  entanglementFieldMembers: [],
})

const normalizeMetaRecords = (rows: DbMetaRecord[]): DbMetaRecord[] => cloneRows(rows).sort(compareById)
const normalizeMetaFieldRecords = (rows: DbMetaFieldRecord[]): DbMetaFieldRecord[] => cloneRows(rows).sort(compareById)
const normalizeMetaStateRecords = (rows: DbMetaStateRecord[]): DbMetaStateRecord[] => cloneRows(rows).sort(compareById)
const normalizeMetaTransitionRecords = (rows: DbMetaTransitionRecord[]): DbMetaTransitionRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaTransitionConditionRecords = (
  rows: DbMetaTransitionConditionRecord[],
): DbMetaTransitionConditionRecord[] => cloneRows(rows).sort(compareById)
const normalizeMetaProcessRecords = (rows: DbMetaProcessRecord[]): DbMetaProcessRecord[] => cloneRows(rows).sort(compareById)
const normalizeMetaProcessReadRecords = (rows: DbMetaProcessReadRecord[]): DbMetaProcessReadRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaProcessWriteRecords = (rows: DbMetaProcessWriteRecord[]): DbMetaProcessWriteRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaReactionRecords = (rows: DbMetaReactionRecord[]): DbMetaReactionRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaReactionStateRecords = (rows: DbMetaReactionStateRecord[]): DbMetaReactionStateRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaReactionReadRecords = (rows: DbMetaReactionReadRecord[]): DbMetaReactionReadRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaReactionWriteRecords = (rows: DbMetaReactionWriteRecord[]): DbMetaReactionWriteRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaMatterNodeRecords = (rows: DbMetaMatterNodeRecord[]): DbMetaMatterNodeRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeMetaMatterEdgeRecords = (rows: DbMetaMatterEdgeRecord[]): DbMetaMatterEdgeRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeWimpRecords = (rows: DbWimpRecord[]): DbWimpRecord[] => cloneRows(rows).sort(compareById)
const normalizeWimpFieldRecords = (rows: DbWimpFieldRecord[]): DbWimpFieldRecord[] => cloneRows(rows).sort(compareById)
const normalizeWimpEdgeRecords = (rows: DbWimpEdgeRecord[]): DbWimpEdgeRecord[] => cloneRows(rows).sort(compareById)
const normalizeFieldValueRecords = (rows: DbFieldValueRecord[]): DbFieldValueRecord[] => cloneRows(rows).sort(compareById)
const normalizeFieldSourceRecords = (rows: DbFieldSourceRecord[]): DbFieldSourceRecord[] => cloneRows(rows).sort(compareById)
const normalizeWimpStateRecords = (rows: DbWimpStateRecord[]): DbWimpStateRecord[] => cloneRows(rows).sort(compareById)
const normalizeEntanglementRecords = (rows: DbEntanglementRecord[]): DbEntanglementRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeEntanglementMemberRecords = (rows: DbEntanglementMemberRecord[]): DbEntanglementMemberRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeEntanglementFieldRecords = (rows: DbEntanglementFieldRecord[]): DbEntanglementFieldRecord[] =>
  cloneRows(rows).sort(compareById)
const normalizeEntanglementFieldMemberRecords = (
  rows: DbEntanglementFieldMemberRecord[],
): DbEntanglementFieldMemberRecord[] => cloneRows(rows).sort(compareById)

export const normalizeDbData = (data: DbData): DbData => {
  const metas = normalizeMetaRecords(data.metas)
  const metaFields = normalizeMetaFieldRecords(data.metaFields)
  const metaStates = normalizeMetaStateRecords(data.metaStates)
  const metaTransitions = normalizeMetaTransitionRecords(data.metaTransitions)
  const metaTransitionConditions = normalizeMetaTransitionConditionRecords(data.metaTransitionConditions)
  const metaProcesses = normalizeMetaProcessRecords(data.metaProcesses)
  const metaProcessReads = normalizeMetaProcessReadRecords(data.metaProcessReads)
  const metaProcessWrites = normalizeMetaProcessWriteRecords(data.metaProcessWrites)
  const metaReactions = normalizeMetaReactionRecords(data.metaReactions)
  const metaReactionStates = normalizeMetaReactionStateRecords(data.metaReactionStates)
  const metaReactionReads = normalizeMetaReactionReadRecords(data.metaReactionReads)
  const metaReactionWrites = normalizeMetaReactionWriteRecords(data.metaReactionWrites)
  const metaMatterNodes = normalizeMetaMatterNodeRecords(data.metaMatterNodes)
  const metaMatterEdges = normalizeMetaMatterEdgeRecords(data.metaMatterEdges)
  const wimps = normalizeWimpRecords(data.wimps)
  const wimpFields = normalizeWimpFieldRecords(data.wimpFields)
  const wimpEdges = normalizeWimpEdgeRecords(data.wimpEdges)
  const fieldValues = normalizeFieldValueRecords(data.fieldValues)
  const fieldSources = normalizeFieldSourceRecords(data.fieldSources)
  const wimpStates = normalizeWimpStateRecords(data.wimpStates)
  const entanglements = normalizeEntanglementRecords(data.entanglements)
  const entanglementMembers = normalizeEntanglementMemberRecords(data.entanglementMembers)
  const entanglementFields = normalizeEntanglementFieldRecords(data.entanglementFields)
  const entanglementFieldMembers = normalizeEntanglementFieldMemberRecords(data.entanglementFieldMembers)

  requireUniqueIds("meta", metas)
  requireUniqueIds("meta_field", metaFields)
  requireUniqueIds("meta_state", metaStates)
  requireUniqueIds("meta_transition", metaTransitions)
  requireUniqueIds("meta_transition_condition", metaTransitionConditions)
  requireUniqueIds("meta_process", metaProcesses)
  requireUniqueIds("meta_process_read", metaProcessReads)
  requireUniqueIds("meta_process_write", metaProcessWrites)
  requireUniqueIds("meta_reaction", metaReactions)
  requireUniqueIds("meta_reaction_state", metaReactionStates)
  requireUniqueIds("meta_reaction_read", metaReactionReads)
  requireUniqueIds("meta_reaction_write", metaReactionWrites)
  requireUniqueIds("meta_matter_node", metaMatterNodes)
  requireUniqueIds("meta_matter_edge", metaMatterEdges)
  requireUniqueIds("wimp", wimps)
  requireUniqueIds("wimp_field", wimpFields)
  requireUniqueIds("wimp_edge", wimpEdges)
  requireUniqueIds("field_value", fieldValues)
  requireUniqueIds("field_source", fieldSources)
  requireUniqueIds("wimp_state", wimpStates)
  requireUniqueIds("entanglement", entanglements)
  requireUniqueIds("entanglement_member", entanglementMembers)
  requireUniqueIds("entanglement_field", entanglementFields)
  requireUniqueIds("entanglement_field_member", entanglementFieldMembers)

  const metaIds = new Set(metas.map((row) => row.id))
  const metaFieldIds = new Set(metaFields.map((row) => row.id))
  const metaStateIds = new Set(metaStates.map((row) => row.id))
  const metaTransitionIds = new Set(metaTransitions.map((row) => row.id))
  const metaProcessIds = new Set(metaProcesses.map((row) => row.id))
  const metaReactionIds = new Set(metaReactions.map((row) => row.id))
  const metaMatterNodeIds = new Set(metaMatterNodes.map((row) => row.id))
  const wimpIds = new Set(wimps.map((row) => row.id))
  const wimpFieldIds = new Set(wimpFields.map((row) => row.id))
  const entanglementIds = new Set(entanglements.map((row) => row.id))
  const entanglementFieldIds = new Set(entanglementFields.map((row) => row.id))

  requireUniqueKey("meta src", metas, (row) => row.src)
  requireUniqueKey("meta field owner/key", metaFields, (row) => `${row.ownerMetaId}:${row.fieldKey}`)
  requireUniqueKey("meta field owner/order", metaFields, (row) => `${row.ownerMetaId}:${row.fieldOrder}`)
  requireUniqueKey("meta state owner/name", metaStates, (row) => `${row.ownerMetaId}:${row.stateName}`)
  requireUniqueKey("meta state owner/order", metaStates, (row) => `${row.ownerMetaId}:${row.stateOrder}`)
  requireUniqueKey("meta transition owner/order", metaTransitions, (row) => `${row.ownerMetaStateId}:${row.transitionOrder}`)
  requireUniqueKey(
    "meta transition condition owner/order",
    metaTransitionConditions,
    (row) => `${row.ownerMetaTransitionId}:${row.conditionOrder}`,
  )
  requireUniqueKey("meta process owner/key", metaProcesses, (row) => `${row.ownerMetaId}:${row.processKey}`)
  requireUniqueKey("meta process owner/order", metaProcesses, (row) => `${row.ownerMetaId}:${row.processOrder}`)
  requireUniqueKey("meta reaction owner/key", metaReactions, (row) => `${row.ownerMetaId}:${row.reactionKey}`)
  requireUniqueKey("meta reaction owner/order", metaReactions, (row) => `${row.ownerMetaId}:${row.reactionOrder}`)
  requireUniqueKey("wimp order", wimps, (row) => String(row.wimpOrder))
  requireUniqueKey("wimp field owner/meta field", wimpFields, (row) => `${row.ownerWimpId}:${row.metaFieldId}`)
  requireUniqueKey("wimp field owner/order", wimpFields, (row) => `${row.ownerWimpId}:${row.fieldOrder}`)
  requireUniqueKey("wimp edge child", wimpEdges, (row) => row.childWimpId)
  requireUniqueKey("field value owner", fieldValues, (row) => row.ownerWimpFieldId)
  requireUniqueKey("field source child", fieldSources, (row) => row.childWimpFieldId)
  requireUniqueKey("wimp state owner", wimpStates, (row) => row.ownerWimpId)
  requireUniqueKey("entanglement member owner/order", entanglementMembers, (row) => `${row.ownerEntanglementId}:${row.memberOrder}`)
  requireUniqueKey("entanglement field owner/order", entanglementFields, (row) => `${row.ownerEntanglementId}:${row.fieldOrder}`)
  requireUniqueKey(
    "entanglement field member owner/order",
    entanglementFieldMembers,
    (row) => `${row.ownerEntanglementFieldId}:${row.memberOrder}`,
  )

  metaFields.forEach((row) => requireReference("meta_field", row.id, "ownerMetaId", row.ownerMetaId, metaIds))
  metaStates.forEach((row) => requireReference("meta_state", row.id, "ownerMetaId", row.ownerMetaId, metaIds))
  metaTransitions.forEach((row) => {
    requireReference("meta_transition", row.id, "ownerMetaStateId", row.ownerMetaStateId, metaStateIds)
    if (row.targetMetaStateId !== null) {
      requireReference("meta_transition", row.id, "targetMetaStateId", row.targetMetaStateId, metaStateIds)
    }
  })
  metaTransitionConditions.forEach((row) => {
    requireReference("meta_transition_condition", row.id, "ownerMetaTransitionId", row.ownerMetaTransitionId, metaTransitionIds)
    requireReference("meta_transition_condition", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  metaProcesses.forEach((row) => requireReference("meta_process", row.id, "ownerMetaId", row.ownerMetaId, metaIds))
  metaProcessReads.forEach((row) => {
    requireReference("meta_process_read", row.id, "ownerMetaProcessId", row.ownerMetaProcessId, metaProcessIds)
    requireReference("meta_process_read", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  metaProcessWrites.forEach((row) => {
    requireReference("meta_process_write", row.id, "ownerMetaProcessId", row.ownerMetaProcessId, metaProcessIds)
    requireReference("meta_process_write", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  metaReactions.forEach((row) => requireReference("meta_reaction", row.id, "ownerMetaId", row.ownerMetaId, metaIds))
  metaReactionStates.forEach((row) => {
    requireReference("meta_reaction_state", row.id, "ownerMetaReactionId", row.ownerMetaReactionId, metaReactionIds)
    requireReference("meta_reaction_state", row.id, "metaStateId", row.metaStateId, metaStateIds)
  })
  metaReactionReads.forEach((row) => {
    requireReference("meta_reaction_read", row.id, "ownerMetaReactionId", row.ownerMetaReactionId, metaReactionIds)
    requireReference("meta_reaction_read", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  metaReactionWrites.forEach((row) => {
    requireReference("meta_reaction_write", row.id, "ownerMetaReactionId", row.ownerMetaReactionId, metaReactionIds)
    requireReference("meta_reaction_write", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  metaMatterNodes.forEach((row) => requireReference("meta_matter_node", row.id, "ownerMetaId", row.ownerMetaId, metaIds))
  metaMatterEdges.forEach((row) => {
    requireReference("meta_matter_edge", row.id, "ownerMetaId", row.ownerMetaId, metaIds)
    if (row.parentNodeId !== null) {
      requireReference("meta_matter_edge", row.id, "parentNodeId", row.parentNodeId, metaMatterNodeIds)
    }
    requireReference("meta_matter_edge", row.id, "childNodeId", row.childNodeId, metaMatterNodeIds)
  })
  wimps.forEach((row) => requireReference("wimp", row.id, "metaId", row.metaId, metaIds))
  wimpFields.forEach((row) => {
    requireReference("wimp_field", row.id, "ownerWimpId", row.ownerWimpId, wimpIds)
    requireReference("wimp_field", row.id, "metaFieldId", row.metaFieldId, metaFieldIds)
  })
  wimpEdges.forEach((row) => {
    requireReference("wimp_edge", row.id, "childWimpId", row.childWimpId, wimpIds)
    if (row.parentWimpId !== null) {
      requireReference("wimp_edge", row.id, "parentWimpId", row.parentWimpId, wimpIds)
    }
  })
  fieldValues.forEach((row) => requireReference("field_value", row.id, "ownerWimpFieldId", row.ownerWimpFieldId, wimpFieldIds))
  fieldSources.forEach((row) => {
    requireReference("field_source", row.id, "childWimpFieldId", row.childWimpFieldId, wimpFieldIds)
    requireReference("field_source", row.id, "parentWimpFieldId", row.parentWimpFieldId, wimpFieldIds)
  })
  wimpStates.forEach((row) => {
    requireReference("wimp_state", row.id, "ownerWimpId", row.ownerWimpId, wimpIds)
    requireReference("wimp_state", row.id, "metaStateId", row.metaStateId, metaStateIds)
  })
  entanglementMembers.forEach((row) => {
    requireReference("entanglement_member", row.id, "ownerEntanglementId", row.ownerEntanglementId, entanglementIds)
    requireReference("entanglement_member", row.id, "wimpId", row.wimpId, wimpIds)
  })
  entanglementFields.forEach((row) => {
    requireReference("entanglement_field", row.id, "ownerEntanglementId", row.ownerEntanglementId, entanglementIds)
    requireReference("entanglement_field", row.id, "representativeWimpFieldId", row.representativeWimpFieldId, wimpFieldIds)
  })
  entanglementFieldMembers.forEach((row) => {
    requireReference("entanglement_field_member", row.id, "ownerEntanglementFieldId", row.ownerEntanglementFieldId, entanglementFieldIds)
    requireReference("entanglement_field_member", row.id, "ownerWimpId", row.ownerWimpId, wimpIds)
    requireReference("entanglement_field_member", row.id, "wimpFieldId", row.wimpFieldId, wimpFieldIds)
  })

  const metaFieldById = new Map(metaFields.map((row) => [row.id, row] as const))
  const metaStateById = new Map(metaStates.map((row) => [row.id, row] as const))
  const metaTransitionById = new Map(metaTransitions.map((row) => [row.id, row] as const))
  const metaProcessById = new Map(metaProcesses.map((row) => [row.id, row] as const))
  const metaReactionById = new Map(metaReactions.map((row) => [row.id, row] as const))
  const wimpById = new Map(wimps.map((row) => [row.id, row] as const))
  const wimpFieldById = new Map(wimpFields.map((row) => [row.id, row] as const))
  const entanglementById = new Map(entanglements.map((row) => [row.id, row] as const))
  const entanglementFieldById = new Map(entanglementFields.map((row) => [row.id, row] as const))

  const initialStateCountByMeta = new Map<string, number>()
  metaStates.forEach((state) => {
    if (state.initial) {
      initialStateCountByMeta.set(state.ownerMetaId, (initialStateCountByMeta.get(state.ownerMetaId) ?? 0) + 1)
    }
  })
  metas.forEach((meta) => {
    const initialCount = initialStateCountByMeta.get(meta.id) ?? 0
    if (initialCount !== 1) {
      throw new Error(`Meta ${meta.id} must have exactly one initial state, got ${initialCount}`)
    }
  })

  metaTransitionConditions.forEach((row) => {
    const transition = metaTransitionById.get(row.ownerMetaTransitionId)!
    const ownerState = metaStateById.get(transition.ownerMetaStateId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (ownerState.ownerMetaId !== metaField.ownerMetaId) {
      throw new Error(`Transition condition ${row.id} crosses meta boundary`)
    }
  })

  metaProcessReads.forEach((row) => {
    const process = metaProcessById.get(row.ownerMetaProcessId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (process.ownerMetaId !== metaField.ownerMetaId) {
      throw new Error(`Process read ${row.id} crosses meta boundary`)
    }
  })
  metaProcessWrites.forEach((row) => {
    const process = metaProcessById.get(row.ownerMetaProcessId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (process.ownerMetaId !== metaField.ownerMetaId) {
      throw new Error(`Process write ${row.id} crosses meta boundary`)
    }
  })
  metaReactionStates.forEach((row) => {
    const reaction = metaReactionById.get(row.ownerMetaReactionId)!
    const state = metaStateById.get(row.metaStateId)!
    if (reaction.ownerMetaId !== state.ownerMetaId) {
      throw new Error(`Reaction state ${row.id} crosses meta boundary`)
    }
  })
  metaReactionReads.forEach((row) => {
    const reaction = metaReactionById.get(row.ownerMetaReactionId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (reaction.ownerMetaId !== metaField.ownerMetaId) {
      throw new Error(`Reaction read ${row.id} crosses meta boundary`)
    }
  })
  metaReactionWrites.forEach((row) => {
    const reaction = metaReactionById.get(row.ownerMetaReactionId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (reaction.ownerMetaId !== metaField.ownerMetaId) {
      throw new Error(`Reaction write ${row.id} crosses meta boundary`)
    }
  })
  wimpFields.forEach((row) => {
    const wimp = wimpById.get(row.ownerWimpId)!
    const metaField = metaFieldById.get(row.metaFieldId)!
    if (wimp.metaId !== metaField.ownerMetaId) {
      throw new Error(`Wimp field ${row.id} references meta field from another meta`)
    }
  })
  wimpStates.forEach((row) => {
    const wimp = wimpById.get(row.ownerWimpId)!
    const metaState = metaStateById.get(row.metaStateId)!
    if (wimp.metaId !== metaState.ownerMetaId) {
      throw new Error(`Wimp state ${row.id} references state from another meta`)
    }
  })
  entanglementMembers.forEach((row) => {
    if (!entanglementById.has(row.ownerEntanglementId)) {
      throw new Error(`Entanglement member ${row.id} references unknown entanglement`)
    }
  })
  entanglementFields.forEach((row) => {
    const representativeField = wimpFieldById.get(row.representativeWimpFieldId)!
    const entanglement = entanglementById.get(row.ownerEntanglementId)!
    if (!entanglement.membershipKey.split(",").includes(representativeField.ownerWimpId)) {
      throw new Error(`Entanglement field ${row.id} representative field is outside entanglement membership`)
    }
  })
  entanglementFieldMembers.forEach((row) => {
    const wimpField = wimpFieldById.get(row.wimpFieldId)!
    if (wimpField.ownerWimpId !== row.ownerWimpId) {
      throw new Error(`Entanglement field member ${row.id} has mismatched ownerWimpId`)
    }
    const entanglementField = entanglementFieldById.get(row.ownerEntanglementFieldId)!
    const entanglement = entanglementById.get(entanglementField.ownerEntanglementId)!
    if (!entanglement.membershipKey.split(",").includes(row.ownerWimpId)) {
      throw new Error(`Entanglement field member ${row.id} is outside entanglement membership`)
    }
  })

  return {
    metas,
    metaFields,
    metaStates,
    metaTransitions,
    metaTransitionConditions,
    metaProcesses,
    metaProcessReads,
    metaProcessWrites,
    metaReactions,
    metaReactionStates,
    metaReactionReads,
    metaReactionWrites,
    metaMatterNodes,
    metaMatterEdges,
    wimps,
    wimpFields,
    wimpEdges,
    fieldValues,
    fieldSources,
    wimpStates,
    entanglements,
    entanglementMembers,
    entanglementFields,
    entanglementFieldMembers,
  }
}

