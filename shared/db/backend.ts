import type { SharedDbBackend, SharedDbBackendIndexSpec } from "./backend.t.ts"
import type {
  SharedDbBraneRecord,
  SharedDbEntanglementSeedBlockMemberRecord,
  SharedDbEntanglementSeedBlockRecord,
  SharedDbEntanglementSeedFieldMemberRecord,
  SharedDbEntanglementSeedFieldRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbProjectionIndexes,
  SharedDbRuntimeSeedData,
  SharedDbStateSeedConditionRecord,
  SharedDbStateSeedStateRecord,
  SharedDbStateSeedTransitionRecord,
  SharedDbTabularData,
} from "./db.t.ts"

const cloneBrane = (brane: SharedDbBraneRecord): SharedDbBraneRecord => ({
  index: brane.index,
  darkWimpId: brane.darkWimpId,
  src: brane.src,
  ...(brane.name !== undefined ? { name: brane.name } : {}),
})

const cloneField = (field: SharedDbFieldRecord): SharedDbFieldRecord => ({
  index: field.index,
  darkFieldId: field.darkFieldId,
  ownerBraneIndex: field.ownerBraneIndex,
  key: field.key,
  schema: {
    type: field.schema.type,
    required: field.schema.required,
    topology: field.schema.topology,
    ...(field.schema.label !== undefined ? { label: field.schema.label } : {}),
    ...(field.schema.values !== undefined ? { values: structuredClone(field.schema.values) } : {}),
  },
})

const cloneFieldValue = (fieldValue: SharedDbFieldValueRecord): SharedDbFieldValueRecord => ({
  fieldIndex: fieldValue.fieldIndex,
  value: structuredClone(fieldValue.value),
})

const cloneFieldSource = (fieldSource: SharedDbFieldSourceRecord): SharedDbFieldSourceRecord => ({
  childFieldIndex: fieldSource.childFieldIndex,
  parentFieldIndex: fieldSource.parentFieldIndex,
})

const cloneEntanglementBlock = (
  block: SharedDbEntanglementSeedBlockRecord,
): SharedDbEntanglementSeedBlockRecord => ({
  index: block.index,
  key: block.key,
})

const cloneEntanglementBlockMember = (
  member: SharedDbEntanglementSeedBlockMemberRecord,
): SharedDbEntanglementSeedBlockMemberRecord => ({
  index: member.index,
  blockIndex: member.blockIndex,
  memberIndex: member.memberIndex,
  braneIndex: member.braneIndex,
})

const cloneEntanglementField = (
  field: SharedDbEntanglementSeedFieldRecord,
): SharedDbEntanglementSeedFieldRecord => ({
  index: field.index,
  blockIndex: field.blockIndex,
  blockFieldIndex: field.blockFieldIndex,
  semanticKey: field.semanticKey,
  fieldName: field.fieldName,
  provenance: field.provenance,
  representativeDarkFieldId: field.representativeDarkFieldId,
  representativeBraneIndex: field.representativeBraneIndex,
  payloadIds: structuredClone(field.payloadIds),
  semanticKeys: structuredClone(field.semanticKeys),
})

const cloneEntanglementFieldMember = (
  member: SharedDbEntanglementSeedFieldMemberRecord,
): SharedDbEntanglementSeedFieldMemberRecord => ({
  index: member.index,
  entanglementFieldIndex: member.entanglementFieldIndex,
  memberIndex: member.memberIndex,
  braneIndex: member.braneIndex,
  darkFieldId: member.darkFieldId,
})

const cloneStateSeedState = (state: SharedDbStateSeedStateRecord): SharedDbStateSeedStateRecord => ({
  index: state.index,
  ownerBraneIndex: state.ownerBraneIndex,
  stateIndex: state.stateIndex,
  name: state.name,
  initial: state.initial,
})

const cloneStateSeedTransition = (
  transition: SharedDbStateSeedTransitionRecord,
): SharedDbStateSeedTransitionRecord => ({
  index: transition.index,
  ownerBraneIndex: transition.ownerBraneIndex,
  fromStateIndex: transition.fromStateIndex,
  transitionIndex: transition.transitionIndex,
  targetStateIndex: transition.targetStateIndex,
})

const cloneStateSeedCondition = (
  condition: SharedDbStateSeedConditionRecord,
): SharedDbStateSeedConditionRecord => ({
  index: condition.index,
  transitionSeedIndex: condition.transitionSeedIndex,
  conditionIndex: condition.conditionIndex,
  darkFieldId: condition.darkFieldId,
  condition: structuredClone(condition.condition),
})

const createEmptyRuntimeSeedData = (): SharedDbRuntimeSeedData => ({
  entanglementBlocks: [],
  entanglementBlockMembers: [],
  entanglementFields: [],
  entanglementFieldMembers: [],
  stateSeedStates: [],
  stateSeedTransitions: [],
  stateSeedConditions: [],
})

const createEmptySharedDbTabularData = (): SharedDbTabularData => ({
  branes: [],
  fields: [],
  fieldValues: [],
  fieldSources: [],
  ...createEmptyRuntimeSeedData(),
})

const requireSequentialIndex = (
  entityName: string,
  records: Array<{ index: number }>,
): void => {
  records.forEach((record, expectedIndex) => {
    if (record.index !== expectedIndex) {
      throw new Error(`${entityName} index mismatch: expected ${expectedIndex}, got ${record.index}`)
    }
  })
}

const requireSequentialOrdinals = (
  entityName: string,
  records: Array<{ ordinal: number }>,
): void => {
  records.forEach((record, expectedOrdinal) => {
    if (record.ordinal !== expectedOrdinal) {
      throw new Error(`${entityName} ordinal mismatch: expected ${expectedOrdinal}, got ${record.ordinal}`)
    }
  })
}

const compareByIndex = <T extends { index: number }>(left: T, right: T): number => left.index - right.index

const deriveSharedDbRootBraneIndex = (branes: SharedDbBraneRecord[]): number => (branes.length === 0 ? 0 : branes[0]!.index)

const deriveSharedDbFieldWindows = (
  branes: SharedDbBraneRecord[],
  fields: SharedDbFieldRecord[],
): Array<{ fieldOffset: number; fieldCount: number }> => {
  const fieldWindowByBraneIndex = branes.map(() => ({ fieldOffset: fields.length, fieldCount: 0 }))
  let cursor = 0

  for (const brane of branes) {
    const fieldOffset = cursor

    while (cursor < fields.length) {
      const field = fields[cursor]
      if (!field) break
      if (field.ownerBraneIndex !== brane.index) {
        break
      }
      cursor += 1
    }

    fieldWindowByBraneIndex[brane.index] = {
      fieldOffset,
      fieldCount: cursor - fieldOffset,
    }
  }

  if (cursor !== fields.length) {
    const field = fields[cursor]
    throw new Error(
      `Fields must stay grouped by owner brane to derive in-memory field ranges; got field ${field?.index ?? cursor} for brane ${field?.ownerBraneIndex ?? "unknown"}`,
    )
  }

  return fieldWindowByBraneIndex
}

/**
 * Зафиксированный набор backend-индексов для канонического shared/db lookup API.
 */
export const sharedDbRequiredBackendIndexes: readonly SharedDbBackendIndexSpec[] = [
  { name: "branes_by_dark_wimp_id", table: "branes", columns: ["darkWimpId"], unique: true },
  { name: "fields_by_dark_field_id", table: "fields", columns: ["darkFieldId"], unique: true },
  { name: "fields_by_owner_brane_and_key", table: "fields", columns: ["ownerBraneIndex", "key"], unique: true },
  { name: "field_values_by_field_index", table: "field_values", columns: ["fieldIndex"], unique: true },
  { name: "field_sources_by_child_field_index", table: "field_sources", columns: ["childFieldIndex"], unique: true },
  { name: "field_sources_by_parent_field_index", table: "field_sources", columns: ["parentFieldIndex"], unique: false },
  {
    name: "entanglement_seed_block_members_by_block_index",
    table: "entanglement_seed_block_members",
    columns: ["blockIndex", "memberIndex"],
    unique: true,
  },
  {
    name: "entanglement_seed_fields_by_block_index_and_block_field_index",
    table: "entanglement_seed_fields",
    columns: ["blockIndex", "blockFieldIndex"],
    unique: true,
  },
  {
    name: "entanglement_seed_field_members_by_entanglement_field_index_and_member_index",
    table: "entanglement_seed_field_members",
    columns: ["entanglementFieldIndex", "memberIndex"],
    unique: true,
  },
  {
    name: "state_seed_states_by_owner_brane_and_state_index",
    table: "state_seed_states",
    columns: ["ownerBraneIndex", "stateIndex"],
    unique: true,
  },
  {
    name: "state_seed_transitions_by_owner_brane_and_from_state_and_transition_index",
    table: "state_seed_transitions",
    columns: ["ownerBraneIndex", "fromStateIndex", "transitionIndex"],
    unique: true,
  },
  {
    name: "state_seed_conditions_by_transition_seed_index_and_condition_index",
    table: "state_seed_conditions",
    columns: ["transitionSeedIndex", "conditionIndex"],
    unique: true,
  },
] as const

/**
 * Нормализует и проверяет канонический табличный снимок shared/db.
 *
 * @param data Табличная форма для хранения или восстановления.
 * @returns Нормализованный и склонированный табличный снимок.
 */
export const normalizeSharedDbTabularData = (data: SharedDbTabularData): SharedDbTabularData => {
  const branes = data.branes.map(cloneBrane).sort(compareByIndex)
  const fields = data.fields.map(cloneField).sort(compareByIndex)
  requireSequentialIndex("Brane", branes)
  requireSequentialIndex("Field", fields)

  const fieldValues: Array<SharedDbFieldValueRecord | undefined> = new Array(fields.length)
  for (const fieldValue of data.fieldValues) {
    const field = fields[fieldValue.fieldIndex]
    if (!field) {
      throw new Error(`Field value references unknown field index: ${fieldValue.fieldIndex}`)
    }
    if (fieldValues[fieldValue.fieldIndex]) {
      throw new Error(`Duplicate field value for field index: ${fieldValue.fieldIndex}`)
    }
    fieldValues[fieldValue.fieldIndex] = cloneFieldValue(fieldValue)
  }

  fields.forEach((field, fieldIndex) => {
    const ownerBrane = branes[field.ownerBraneIndex]
    if (!ownerBrane) {
      throw new Error(`Field ${fieldIndex} references unknown brane index: ${field.ownerBraneIndex}`)
    }
    if (!fieldValues[fieldIndex]) {
      throw new Error(`Field value missing for field index: ${fieldIndex}`)
    }
  })

  deriveSharedDbFieldWindows(branes, fields)

  const fieldSources = data.fieldSources.map(cloneFieldSource).sort(
    (left, right) => left.childFieldIndex - right.childFieldIndex,
  )
  const seenChildFieldIndexes = new Set<number>()
  for (const fieldSource of fieldSources) {
    if (!fields[fieldSource.childFieldIndex]) {
      throw new Error(`Field source references unknown child field index: ${fieldSource.childFieldIndex}`)
    }
    if (!fields[fieldSource.parentFieldIndex]) {
      throw new Error(`Field source references unknown parent field index: ${fieldSource.parentFieldIndex}`)
    }
    if (seenChildFieldIndexes.has(fieldSource.childFieldIndex)) {
      throw new Error(`Duplicate field source for child field index: ${fieldSource.childFieldIndex}`)
    }
    seenChildFieldIndexes.add(fieldSource.childFieldIndex)
  }

  const fieldByDarkId = new Map<string, SharedDbFieldRecord>()
  fields.forEach((field) => {
    if (fieldByDarkId.has(field.darkFieldId)) {
      throw new Error(`Duplicate field dark id: ${field.darkFieldId}`)
    }
    fieldByDarkId.set(field.darkFieldId, field)
  })

  const entanglementBlocks = data.entanglementBlocks.map(cloneEntanglementBlock).sort(compareByIndex)
  const entanglementBlockMembers = data.entanglementBlockMembers.map(cloneEntanglementBlockMember).sort(compareByIndex)
  const entanglementFields = data.entanglementFields.map(cloneEntanglementField).sort(compareByIndex)
  const entanglementFieldMembers = data.entanglementFieldMembers.map(cloneEntanglementFieldMember).sort(compareByIndex)
  const stateSeedStates = data.stateSeedStates.map(cloneStateSeedState).sort(compareByIndex)
  const stateSeedTransitions = data.stateSeedTransitions.map(cloneStateSeedTransition).sort(compareByIndex)
  const stateSeedConditions = data.stateSeedConditions.map(cloneStateSeedCondition).sort(compareByIndex)

  requireSequentialIndex("Entanglement block", entanglementBlocks)
  requireSequentialIndex("Entanglement block member", entanglementBlockMembers)
  requireSequentialIndex("Entanglement field", entanglementFields)
  requireSequentialIndex("Entanglement field member", entanglementFieldMembers)
  requireSequentialIndex("State seed state", stateSeedStates)
  requireSequentialIndex("State seed transition", stateSeedTransitions)
  requireSequentialIndex("State seed condition", stateSeedConditions)

  const entanglementBlockByIndex = new Map<number, SharedDbEntanglementSeedBlockRecord>()
  const entanglementBlockMembersByBlockIndex = new Map<number, SharedDbEntanglementSeedBlockMemberRecord[]>()
  for (const block of entanglementBlocks) {
    if (entanglementBlockByIndex.has(block.index)) {
      throw new Error(`Duplicate entanglement block index: ${block.index}`)
    }
    entanglementBlockByIndex.set(block.index, block)
  }

  for (const member of entanglementBlockMembers) {
    if (!entanglementBlockByIndex.has(member.blockIndex)) {
      throw new Error(`Entanglement block member references unknown block index: ${member.blockIndex}`)
    }
    if (!branes[member.braneIndex]) {
      throw new Error(`Entanglement block member references unknown brane index: ${member.braneIndex}`)
    }

    const blockMembers = entanglementBlockMembersByBlockIndex.get(member.blockIndex) ?? []
    if (blockMembers.some((candidate) => candidate.memberIndex === member.memberIndex)) {
      throw new Error(
        `Duplicate entanglement block member ordinal ${member.memberIndex} in block ${member.blockIndex}`,
      )
    }
    if (blockMembers.some((candidate) => candidate.braneIndex === member.braneIndex)) {
      throw new Error(`Duplicate brane ${member.braneIndex} in entanglement block ${member.blockIndex}`)
    }
    blockMembers.push(member)
    entanglementBlockMembersByBlockIndex.set(member.blockIndex, blockMembers)
  }

  entanglementBlocks.forEach((block) => {
    const members = (entanglementBlockMembersByBlockIndex.get(block.index) ?? [])
      .map((member) => ({ ordinal: member.memberIndex }))
      .sort((left, right) => left.ordinal - right.ordinal)
    if (members.length < 2) {
      throw new Error(`Entanglement block ${block.index} requires at least 2 branes`)
    }
    requireSequentialOrdinals(`Entanglement block ${block.index} membership`, members)
  })

  const entanglementFieldByIndex = new Map<number, SharedDbEntanglementSeedFieldRecord>()
  const entanglementFieldsByBlockIndex = new Map<number, SharedDbEntanglementSeedFieldRecord[]>()
  for (const seedField of entanglementFields) {
    if (!entanglementBlockByIndex.has(seedField.blockIndex)) {
      throw new Error(`Entanglement field references unknown block index: ${seedField.blockIndex}`)
    }
    const representativeField = fieldByDarkId.get(seedField.representativeDarkFieldId)
    if (!representativeField) {
      throw new Error(`Entanglement field references unknown representative field: ${seedField.representativeDarkFieldId}`)
    }
    if (representativeField.ownerBraneIndex !== seedField.representativeBraneIndex) {
      throw new Error(
        `Entanglement field representative brane mismatch for field ${seedField.representativeDarkFieldId}`,
      )
    }

    const blockMembers = entanglementBlockMembersByBlockIndex.get(seedField.blockIndex) ?? []
    if (!blockMembers.some((member) => member.braneIndex === seedField.representativeBraneIndex)) {
      throw new Error(
        `Entanglement field representative brane ${seedField.representativeBraneIndex} is outside block ${seedField.blockIndex}`,
      )
    }

    const fieldsInBlock = entanglementFieldsByBlockIndex.get(seedField.blockIndex) ?? []
    if (fieldsInBlock.some((candidate) => candidate.blockFieldIndex === seedField.blockFieldIndex)) {
      throw new Error(
        `Duplicate entanglement field ordinal ${seedField.blockFieldIndex} in block ${seedField.blockIndex}`,
      )
    }
    fieldsInBlock.push(seedField)
    entanglementFieldsByBlockIndex.set(seedField.blockIndex, fieldsInBlock)
    entanglementFieldByIndex.set(seedField.index, seedField)
  }

  entanglementBlocks.forEach((block) => {
    const fieldsInBlock = (entanglementFieldsByBlockIndex.get(block.index) ?? [])
      .map((seedField) => ({ ordinal: seedField.blockFieldIndex }))
      .sort((left, right) => left.ordinal - right.ordinal)
    if (fieldsInBlock.length === 0) {
      throw new Error(`Entanglement block ${block.index} requires at least 1 shared field seed`)
    }
    requireSequentialOrdinals(`Entanglement block ${block.index} fields`, fieldsInBlock)
  })

  const entanglementFieldMembersByFieldIndex = new Map<number, SharedDbEntanglementSeedFieldMemberRecord[]>()
  for (const member of entanglementFieldMembers) {
    const seedField = entanglementFieldByIndex.get(member.entanglementFieldIndex)
    if (!seedField) {
      throw new Error(`Entanglement field member references unknown seed field: ${member.entanglementFieldIndex}`)
    }

    const field = fieldByDarkId.get(member.darkFieldId)
    if (!field) {
      throw new Error(`Entanglement field member references unknown darkFieldId: ${member.darkFieldId}`)
    }
    if (field.ownerBraneIndex !== member.braneIndex) {
      throw new Error(`Entanglement field member brane mismatch for field ${member.darkFieldId}`)
    }
    if (!(entanglementBlockMembersByBlockIndex.get(seedField.blockIndex) ?? []).some((item) => item.braneIndex === member.braneIndex)) {
      throw new Error(
        `Entanglement field member brane ${member.braneIndex} is outside block ${seedField.blockIndex}`,
      )
    }

    const members = entanglementFieldMembersByFieldIndex.get(member.entanglementFieldIndex) ?? []
    if (members.some((candidate) => candidate.memberIndex === member.memberIndex)) {
      throw new Error(
        `Duplicate entanglement field member ordinal ${member.memberIndex} in seed field ${member.entanglementFieldIndex}`,
      )
    }
    if (members.some((candidate) => candidate.braneIndex === member.braneIndex)) {
      throw new Error(
        `Duplicate entanglement field member brane ${member.braneIndex} in seed field ${member.entanglementFieldIndex}`,
      )
    }
    members.push(member)
    entanglementFieldMembersByFieldIndex.set(member.entanglementFieldIndex, members)
  }

  for (const seedField of entanglementFields) {
    const members = (entanglementFieldMembersByFieldIndex.get(seedField.index) ?? []).sort(
      (left, right) => left.memberIndex - right.memberIndex,
    )
    if (members.length < 2) {
      throw new Error(`Entanglement seed field ${seedField.index} requires at least 2 members`)
    }
    requireSequentialOrdinals(
      `Entanglement seed field ${seedField.index} membership`,
      members.map((member) => ({ ordinal: member.memberIndex })),
    )
    if (!members.some((member) => member.darkFieldId === seedField.representativeDarkFieldId)) {
      throw new Error(
        `Entanglement seed field ${seedField.index} representative field is not part of membership`,
      )
    }

    const blockBraneIndices = (entanglementBlockMembersByBlockIndex.get(seedField.blockIndex) ?? [])
      .map((member) => member.braneIndex)
      .sort((left, right) => left - right)
    const memberBraneIndices = members.map((member) => member.braneIndex).sort((left, right) => left - right)
    if (JSON.stringify(blockBraneIndices) !== JSON.stringify(memberBraneIndices)) {
      throw new Error(`Entanglement seed field ${seedField.index} membership does not match block membership`)
    }
  }

  const stateSeedsByBraneIndex = new Map<number, SharedDbStateSeedStateRecord[]>()
  for (const state of stateSeedStates) {
    if (!branes[state.ownerBraneIndex]) {
      throw new Error(`State seed references unknown brane index: ${state.ownerBraneIndex}`)
    }
    const states = stateSeedsByBraneIndex.get(state.ownerBraneIndex) ?? []
    if (states.some((candidate) => candidate.stateIndex === state.stateIndex)) {
      throw new Error(
        `Duplicate state seed index ${state.stateIndex} for brane ${state.ownerBraneIndex}`,
      )
    }
    states.push(state)
    stateSeedsByBraneIndex.set(state.ownerBraneIndex, states)
  }

  branes.forEach((brane) => {
    const states = (stateSeedsByBraneIndex.get(brane.index) ?? []).sort((left, right) => left.stateIndex - right.stateIndex)
    if (states.length === 0) {
      throw new Error(`State seeds missing for brane ${brane.index}`)
    }
    requireSequentialOrdinals(
      `State seeds for brane ${brane.index}`,
      states.map((state) => ({ ordinal: state.stateIndex })),
    )
    const initialCount = states.filter((state) => state.initial).length
    if (initialCount !== 1) {
      throw new Error(`Brane ${brane.index} must have exactly 1 initial state seed`)
    }
  })

  const stateSeedTransitionByIndex = new Map<number, SharedDbStateSeedTransitionRecord>()
  const stateSeedTransitionsByState = new Map<string, SharedDbStateSeedTransitionRecord[]>()
  for (const transition of stateSeedTransitions) {
    const states = stateSeedsByBraneIndex.get(transition.ownerBraneIndex) ?? []
    if (!states.some((state) => state.stateIndex === transition.fromStateIndex)) {
      throw new Error(
        `State seed transition references unknown from-state ${transition.fromStateIndex} for brane ${transition.ownerBraneIndex}`,
      )
    }
    if (
      transition.targetStateIndex !== null &&
      !states.some((state) => state.stateIndex === transition.targetStateIndex)
    ) {
      throw new Error(
        `State seed transition references unknown target-state ${transition.targetStateIndex} for brane ${transition.ownerBraneIndex}`,
      )
    }

    const key = `${transition.ownerBraneIndex}:${transition.fromStateIndex}`
    const transitions = stateSeedTransitionsByState.get(key) ?? []
    if (transitions.some((candidate) => candidate.transitionIndex === transition.transitionIndex)) {
      throw new Error(
        `Duplicate state seed transition ordinal ${transition.transitionIndex} for brane ${transition.ownerBraneIndex} state ${transition.fromStateIndex}`,
      )
    }
    transitions.push(transition)
    stateSeedTransitionsByState.set(key, transitions)
    stateSeedTransitionByIndex.set(transition.index, transition)
  }

  for (const [key, transitions] of stateSeedTransitionsByState) {
    requireSequentialOrdinals(
      `State seed transitions for ${key}`,
      transitions
        .map((transition) => ({ ordinal: transition.transitionIndex }))
        .sort((left, right) => left.ordinal - right.ordinal),
    )
  }

  const stateSeedConditionsByTransitionIndex = new Map<number, SharedDbStateSeedConditionRecord[]>()
  for (const condition of stateSeedConditions) {
    const transition = stateSeedTransitionByIndex.get(condition.transitionSeedIndex)
    if (!transition) {
      throw new Error(`State seed condition references unknown transition: ${condition.transitionSeedIndex}`)
    }
    if (transition.targetStateIndex === null) {
      throw new Error(`Terminal state seed transition ${transition.index} cannot have conditions`)
    }

    const field = fieldByDarkId.get(condition.darkFieldId)
    if (!field) {
      throw new Error(`State seed condition references unknown darkFieldId: ${condition.darkFieldId}`)
    }
    if (field.ownerBraneIndex !== transition.ownerBraneIndex) {
      throw new Error(
        `State seed condition field ${condition.darkFieldId} does not belong to brane ${transition.ownerBraneIndex}`,
      )
    }

    const conditions = stateSeedConditionsByTransitionIndex.get(condition.transitionSeedIndex) ?? []
    if (conditions.some((candidate) => candidate.conditionIndex === condition.conditionIndex)) {
      throw new Error(
        `Duplicate state seed condition ordinal ${condition.conditionIndex} for transition ${condition.transitionSeedIndex}`,
      )
    }
    conditions.push(condition)
    stateSeedConditionsByTransitionIndex.set(condition.transitionSeedIndex, conditions)
  }

  for (const [transitionIndex, conditions] of stateSeedConditionsByTransitionIndex) {
    requireSequentialOrdinals(
      `State seed conditions for transition ${transitionIndex}`,
      conditions
        .map((condition) => ({ ordinal: condition.conditionIndex }))
        .sort((left, right) => left.ordinal - right.ordinal),
    )
  }

  return {
    branes,
    fields,
    fieldValues: fieldValues as SharedDbFieldValueRecord[],
    fieldSources,
    entanglementBlocks,
    entanglementBlockMembers,
    entanglementFields,
    entanglementFieldMembers,
    stateSeedStates,
    stateSeedTransitions,
    stateSeedConditions,
  }
}

/**
 * Строит производные индексы поверх канонической табличной формы.
 *
 * @param data Канонический табличный снимок.
 * @returns Производные индексы проекции.
 */
export const buildSharedDbProjectionIndexes = (
  data: SharedDbTabularData,
): SharedDbProjectionIndexes => {
  const normalized = normalizeSharedDbTabularData(data)
  const rootBraneIndex = deriveSharedDbRootBraneIndex(normalized.branes)
  const fieldWindowByBraneIndex = deriveSharedDbFieldWindows(normalized.branes, normalized.fields)
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<string, number>>()
  const fieldSourceByChildFieldIndex: Array<SharedDbFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()

  for (const brane of normalized.branes) {
    if (braneIndexByDarkId.has(brane.darkWimpId)) {
      throw new Error(`Duplicate brane dark id: ${brane.darkWimpId}`)
    }
    braneIndexByDarkId.set(brane.darkWimpId, brane.index)
    fieldIndexByBraneAndKey.set(brane.index, new Map())
  }

  for (const field of normalized.fields) {
    if (fieldIndexByDarkId.has(field.darkFieldId)) {
      throw new Error(`Duplicate field dark id: ${field.darkFieldId}`)
    }
    fieldIndexByDarkId.set(field.darkFieldId, field.index)

    const fieldLookup = fieldIndexByBraneAndKey.get(field.ownerBraneIndex)
    if (!fieldLookup) {
      throw new Error(`Field ${field.index} references unknown brane index: ${field.ownerBraneIndex}`)
    }
    if (fieldLookup.has(field.key)) {
      throw new Error(`Duplicate field key '${field.key}' for brane ${field.ownerBraneIndex}`)
    }
    fieldLookup.set(field.key, field.index)
  }

  for (const fieldSource of normalized.fieldSources) {
    fieldSourceByChildFieldIndex[fieldSource.childFieldIndex] = cloneFieldSource(fieldSource)
    const dependents = dependentFieldIndexesByParentFieldIndex.get(fieldSource.parentFieldIndex)
    if (dependents) {
      dependents.push(fieldSource.childFieldIndex)
    } else {
      dependentFieldIndexesByParentFieldIndex.set(fieldSource.parentFieldIndex, [fieldSource.childFieldIndex])
    }
  }

  return {
    rootBraneIndex,
    fieldWindowByBraneIndex,
    braneIndexByDarkId,
    fieldIndexByDarkId,
    fieldIndexByBraneAndKey: fieldIndexByBraneAndKey as SharedDbProjectionIndexes["fieldIndexByBraneAndKey"],
    fieldSourceByChildFieldIndex,
    dependentFieldIndexesByParentFieldIndex,
  }
}

/**
 * Отбрасывает derived indexes и возвращает канонический tabular snapshot.
 *
 * @param projection Проекция с индексами.
 * @returns Канонический табличный снимок для backend-хранения.
 */
export const prepareSharedDbTabularData = (projection: SharedDbProjection): SharedDbTabularData =>
  normalizeSharedDbTabularData({
    branes: projection.branes,
    fields: projection.fields,
    fieldValues: projection.fieldValues,
    fieldSources: projection.fieldSources,
    entanglementBlocks: projection.entanglementBlocks,
    entanglementBlockMembers: projection.entanglementBlockMembers,
    entanglementFields: projection.entanglementFields,
    entanglementFieldMembers: projection.entanglementFieldMembers,
    stateSeedStates: projection.stateSeedStates,
    stateSeedTransitions: projection.stateSeedTransitions,
    stateSeedConditions: projection.stateSeedConditions,
  })

/**
 * Материализует полную shared/db проекцию из канонической табличной формы.
 *
 * @param data Канонический tabular snapshot.
 * @returns Полная проекция с производными индексами.
 */
export const createSharedDbProjection = (data: SharedDbTabularData): SharedDbProjection => {
  const normalized = normalizeSharedDbTabularData(data)
  return {
    ...normalized,
    ...buildSharedDbProjectionIndexes(normalized),
  }
}

/**
 * Полностью вычитывает каноническую tabular форму через backend API.
 *
 * @param backend Открытый shared/db backend.
 * @returns Канонический табличный снимок.
 */
export const readSharedDbTabularData = (backend: SharedDbBackend): SharedDbTabularData => {
  const branes: SharedDbBraneRecord[] = []
  for (let braneIndex = 0; ; braneIndex += 1) {
    const brane = backend.getBrane(braneIndex)
    if (!brane) break
    branes.push(cloneBrane(brane))
  }

  const fields: SharedDbFieldRecord[] = []
  const fieldValues: SharedDbFieldValueRecord[] = []
  const fieldSources: SharedDbFieldSourceRecord[] = []

  for (let fieldIndex = 0; ; fieldIndex += 1) {
    const field = backend.getField(fieldIndex)
    if (!field) break
    fields.push(cloneField(field))

    const fieldValue = backend.getFieldValue(fieldIndex)
    if (!fieldValue) {
      throw new Error(`Field value missing in backend for field index: ${fieldIndex}`)
    }
    fieldValues.push(cloneFieldValue(fieldValue))

    const fieldSource = backend.getFieldSource(fieldIndex)
    if (fieldSource) {
      fieldSources.push(cloneFieldSource(fieldSource))
    }
  }

  const runtimeSeedData = backend.getRuntimeSeedData()

  return normalizeSharedDbTabularData({
    branes,
    fields,
    fieldValues,
    fieldSources,
    entanglementBlocks: runtimeSeedData.entanglementBlocks,
    entanglementBlockMembers: runtimeSeedData.entanglementBlockMembers,
    entanglementFields: runtimeSeedData.entanglementFields,
    entanglementFieldMembers: runtimeSeedData.entanglementFieldMembers,
    stateSeedStates: runtimeSeedData.stateSeedStates,
    stateSeedTransitions: runtimeSeedData.stateSeedTransitions,
    stateSeedConditions: runtimeSeedData.stateSeedConditions,
  })
}

/**
 * Полностью вычитывает shared/db проекцию через backend API.
 *
 * @param backend Открытый shared/db backend.
 * @returns Полная проекция с derived indexes.
 */
export const readSharedDbProjection = (backend: SharedDbBackend): SharedDbProjection =>
  createSharedDbProjection(readSharedDbTabularData(backend))

/**
 * Пустой канонический снимок для backend reset/open по умолчанию.
 *
 * @returns Пустая табличная форма shared/db.
 */
export const createEmptySharedDbTabularSnapshot = (): SharedDbTabularData => createEmptySharedDbTabularData()
