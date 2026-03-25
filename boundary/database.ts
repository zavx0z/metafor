import {
  createEmptySharedDbData,
  normalizeSharedDbData,
  readSharedDbData,
  type SharedDbBackend,
  type SharedDbData,
  type SharedDbFieldSchemaRecord,
} from "@shared/db"
import { FieldType, flattenBoundaryData, type BraneValue, type Collapse, type Data, type Field } from "@boundary/gravity"
import { assembleStoredBoundaryData, type PreparedEntanglementProjection } from "@boundary/strong"
import type { PreparedData } from "./boundary.t.ts"
import type {
  BoundaryDatabaseBraneRecord,
  BoundaryDatabaseData,
  BoundaryDatabaseEntanglementBlockMemberRecord,
  BoundaryDatabaseEntanglementBlockRecord,
  BoundaryDatabaseEntanglementFieldMemberRecord,
  BoundaryDatabaseEntanglementFieldRecord,
  BoundaryDatabaseFieldRecord,
  BoundaryDatabaseFieldSchemaRecord,
  BoundaryDatabaseFieldValueRecord,
  BoundaryRuntimeWriteContext,
  BoundaryDatabaseStateSeedConditionRecord,
  BoundaryDatabaseStateSeedStateRecord,
  BoundaryDatabaseStateSeedTransitionRecord,
  BoundarySharedDbRuntimeOptions,
} from "./database.t.ts"

const upsertRowsById = <T extends { id: string }>(target: T[], rows: T[]): void => {
  const indexById = new Map(target.map((row, index) => [row.id, index] as const))

  rows.forEach((row) => {
    const nextRow = structuredClone(row)
    const existingIndex = indexById.get(nextRow.id)

    if (existingIndex === undefined) {
      indexById.set(nextRow.id, target.length)
      target.push(nextRow)
      return
    }

    target[existingIndex] = nextRow
  })
}

const cloneFieldSchema = (
  schema: BoundaryDatabaseFieldSchemaRecord | SharedDbFieldSchemaRecord,
): BoundaryDatabaseFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required,
  topology: schema.topology,
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const cloneRuntimeField = (field: Field): Field => ({
  type: field.type,
  ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
  ...(field.enum !== undefined ? { enum: structuredClone(field.enum) } : {}),
})

const createLocalRuntimeFieldSignature = (field: BoundaryDatabaseFieldRecord): string =>
  JSON.stringify({
    scope: "local",
    key: field.key,
    type: field.schema.type,
    required: field.schema.required,
    topology: field.schema.topology,
    label: field.schema.label ?? null,
    values: field.schema.values ?? null,
  })

const createSeedRuntimeFieldSignature = (semanticKey: string, field: BoundaryDatabaseFieldRecord): string =>
  JSON.stringify({
    scope: "seed",
    semanticKey,
    type: field.schema.type,
    required: field.schema.required,
    topology: field.schema.topology,
    label: field.schema.label ?? null,
    values: field.schema.values ?? null,
  })

const mapBoundaryDatabaseFieldToRuntimeField = (field: BoundaryDatabaseFieldRecord): Field => {
  const { type, values } = field.schema

  if (type === "string") return { type: FieldType.STRING_PTR }
  if (type === "number") return { type: FieldType.F32 }
  if (type === "boolean") return { type: FieldType.BOOL }

  if (type.startsWith("enum<")) {
    if (!values) {
      throw new Error(`Boundary runtime field '${field.key}' is missing enum values`)
    }
    return { type: FieldType.U32, enum: structuredClone(values) }
  }

  if (type === "array<string>") return { type: FieldType.ARRAY_PTR, elementType: "string" }
  if (type === "array<number>") return { type: FieldType.ARRAY_PTR, elementType: "number" }
  if (type === "array<boolean>") return { type: FieldType.ARRAY_PTR, elementType: "boolean" }

  throw new Error(`Unsupported shared/db field type for Boundary runtime: ${type}`)
}

const requireBoundaryDatabaseFieldValue = (
  data: BoundaryDatabaseData,
  fieldIndex: number,
): BoundaryDatabaseFieldValueRecord => {
  const fieldValue = data.fieldValues[fieldIndex]
  if (!fieldValue) {
    throw new Error(`Boundary database field value missing for field index: ${fieldIndex}`)
  }
  return fieldValue
}

const groupEntanglementBlockMembers = (data: BoundaryDatabaseData) => {
  const grouped = new Map<number, typeof data.entanglementBlockMembers>()
  for (const member of data.entanglementBlockMembers) {
    const members = grouped.get(member.blockIndex)
    if (members) members.push(member)
    else grouped.set(member.blockIndex, [member])
  }
  for (const members of grouped.values()) {
    members.sort((left, right) => left.memberIndex - right.memberIndex)
  }
  return grouped
}

const groupEntanglementFields = (data: BoundaryDatabaseData) => {
  const grouped = new Map<number, typeof data.entanglementFields>()
  for (const field of data.entanglementFields) {
    const fields = grouped.get(field.blockIndex)
    if (fields) fields.push(field)
    else grouped.set(field.blockIndex, [field])
  }
  for (const fields of grouped.values()) {
    fields.sort((left, right) => left.blockFieldIndex - right.blockFieldIndex)
  }
  return grouped
}

const groupEntanglementFieldMembers = (data: BoundaryDatabaseData) => {
  const grouped = new Map<number, typeof data.entanglementFieldMembers>()
  for (const member of data.entanglementFieldMembers) {
    const members = grouped.get(member.entanglementFieldIndex)
    if (members) members.push(member)
    else grouped.set(member.entanglementFieldIndex, [member])
  }
  for (const members of grouped.values()) {
    members.sort((left, right) => left.memberIndex - right.memberIndex)
  }
  return grouped
}

const groupStateSeedStates = (data: BoundaryDatabaseData) => {
  const grouped = new Map<number, typeof data.stateSeedStates>()
  for (const state of data.stateSeedStates) {
    const states = grouped.get(state.ownerBraneIndex)
    if (states) states.push(state)
    else grouped.set(state.ownerBraneIndex, [state])
  }
  for (const states of grouped.values()) {
    states.sort((left, right) => left.stateIndex - right.stateIndex)
  }
  return grouped
}

const groupStateSeedTransitions = (data: BoundaryDatabaseData) => {
  const grouped = new Map<string, typeof data.stateSeedTransitions>()
  for (const transition of data.stateSeedTransitions) {
    const key = `${transition.ownerBraneIndex}:${transition.fromStateIndex}`
    const transitions = grouped.get(key)
    if (transitions) transitions.push(transition)
    else grouped.set(key, [transition])
  }
  for (const transitions of grouped.values()) {
    transitions.sort((left, right) => left.transitionIndex - right.transitionIndex)
  }
  return grouped
}

const groupStateSeedConditions = (data: BoundaryDatabaseData) => {
  const grouped = new Map<number, typeof data.stateSeedConditions>()
  for (const condition of data.stateSeedConditions) {
    const conditions = grouped.get(condition.transitionSeedIndex)
    if (conditions) conditions.push(condition)
    else grouped.set(condition.transitionSeedIndex, [condition])
  }
  for (const conditions of grouped.values()) {
    conditions.sort((left, right) => left.conditionIndex - right.conditionIndex)
  }
  return grouped
}

const buildBoundaryRuntimeFieldRegistry = (data: BoundaryDatabaseData) => {
  const runtimeFields: Field[] = []
  const runtimeFieldIndexByDbFieldIndex: number[] = []
  const runtimeFieldIndexToWimpFieldIds: string[][] = []
  const runtimeFieldIndexBySignature = new Map<string, number>()
  const entanglementFieldMembers = groupEntanglementFieldMembers(data)

  const ensureRuntimeField = (signature: string, field: BoundaryDatabaseFieldRecord): number => {
    const existing = runtimeFieldIndexBySignature.get(signature)
    if (existing !== undefined) return existing

    const runtimeFieldIndex = runtimeFields.length
    runtimeFields.push(cloneRuntimeField(mapBoundaryDatabaseFieldToRuntimeField(field)))
    runtimeFieldIndexBySignature.set(signature, runtimeFieldIndex)
    runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] = []
    return runtimeFieldIndex
  }

  for (const seedField of [...data.entanglementFields].sort((left, right) => left.index - right.index)) {
    const representativeField = data.fields[seedField.representativeFieldIndex]
    if (!representativeField) {
      throw new Error(`Boundary runtime seed representative field missing: ${seedField.representativeFieldIndex}`)
    }

    const runtimeFieldIndex = ensureRuntimeField(
      createSeedRuntimeFieldSignature(seedField.semanticKey, representativeField),
      representativeField,
    )
    const seedRuntimeFieldIds = runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] ?? []
    if (!seedRuntimeFieldIds.includes(representativeField.wimpFieldId)) {
      seedRuntimeFieldIds.push(representativeField.wimpFieldId)
    }
    runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] = seedRuntimeFieldIds

    for (const member of entanglementFieldMembers.get(seedField.index) ?? []) {
      const existing = runtimeFieldIndexByDbFieldIndex[member.fieldIndex]
      if (existing !== undefined && existing !== runtimeFieldIndex) {
        throw new Error(`Boundary runtime field index mismatch for DB field ${member.fieldIndex}`)
      }
      runtimeFieldIndexByDbFieldIndex[member.fieldIndex] = runtimeFieldIndex
      const runtimeFieldIds = runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] ?? []
      const wimpFieldId = data.fields[member.fieldIndex]?.wimpFieldId
      if (!wimpFieldId) {
        throw new Error(`Boundary runtime field missing Wimp field id for DB field ${member.fieldIndex}`)
      }
      if (!runtimeFieldIds.includes(wimpFieldId)) {
        runtimeFieldIds.push(wimpFieldId)
      }
      runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] = runtimeFieldIds
    }
  }

  for (const field of data.fields) {
    if (runtimeFieldIndexByDbFieldIndex[field.index] !== undefined) continue
    const runtimeFieldIndex = ensureRuntimeField(createLocalRuntimeFieldSignature(field), field)
    runtimeFieldIndexByDbFieldIndex[field.index] = runtimeFieldIndex
    const runtimeFieldIds = runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] ?? []
    if (!runtimeFieldIds.includes(field.wimpFieldId)) {
      runtimeFieldIds.push(field.wimpFieldId)
    }
    runtimeFieldIndexToWimpFieldIds[runtimeFieldIndex] = runtimeFieldIds
  }

  return { runtimeFields, runtimeFieldIndexByDbFieldIndex, runtimeFieldIndexToWimpFieldIds }
}

const prepareBoundaryEntanglementProjection = (
  data: BoundaryDatabaseData,
  runtimeFieldIndexByDbFieldIndex: number[],
): PreparedEntanglementProjection | undefined => {
  if (data.entanglementBlocks.length === 0) return undefined

  const blockMembers = groupEntanglementBlockMembers(data)
  const blockFields = groupEntanglementFields(data)
  const fieldMembers = groupEntanglementFieldMembers(data)

  return {
    blocks: [...data.entanglementBlocks]
      .sort((left, right) => left.index - right.index)
      .map((block) => ({
        key: block.key,
        braneIndices: (blockMembers.get(block.index) ?? []).map((member) => member.braneIndex),
        fields: (blockFields.get(block.index) ?? []).map((seedField) => {
          const representativeField = data.fields[seedField.representativeFieldIndex]
          if (!representativeField) {
            throw new Error(`Boundary runtime entanglement representative field missing: ${seedField.representativeFieldIndex}`)
          }

          const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[representativeField.index]
          if (runtimeFieldIndex === undefined) {
            throw new Error(`Boundary runtime field index missing for DB field ${representativeField.index}`)
          }

          for (const member of fieldMembers.get(seedField.index) ?? []) {
            if (runtimeFieldIndexByDbFieldIndex[member.fieldIndex] !== runtimeFieldIndex) {
              throw new Error(`Boundary runtime entanglement member ${member.fieldIndex} resolves to different runtime field`)
            }
          }

          return {
            fieldIndex: runtimeFieldIndex,
            fieldName: seedField.fieldName,
            payloadIds: structuredClone(seedField.payloadIds),
            semanticKeys: Array.from(new Set([seedField.semanticKey, ...seedField.semanticKeys])).sort(),
            representativeBraneIndex: seedField.representativeBraneIndex,
          }
        }),
      })),
  }
}

const prepareBoundaryStateSeedGraph = (
  braneIndex: number,
  runtimeFieldIndexByDbFieldIndex: number[],
  stateSeeds: ReturnType<typeof groupStateSeedStates>,
  transitionSeeds: ReturnType<typeof groupStateSeedTransitions>,
  conditionSeeds: ReturnType<typeof groupStateSeedConditions>,
): { state: number; collapses: Collapse[][] } => {
  const states = stateSeeds.get(braneIndex) ?? []
  if (states.length === 0) {
    throw new Error(`Boundary state seeds missing for brane ${braneIndex}`)
  }

  const initialState = states.find((state) => state.initial)
  if (!initialState) {
    throw new Error(`Boundary initial state seed missing for brane ${braneIndex}`)
  }

  return {
    state: initialState.stateIndex,
    collapses: states.map((state) => {
      const transitions = transitionSeeds.get(`${braneIndex}:${state.stateIndex}`) ?? []
      return transitions.map((transition) => {
        if (transition.targetStateIndex === null) return null

        const rawConditions = conditionSeeds.get(transition.index) ?? []
        const conditions: Record<number, unknown> = {}

        rawConditions.forEach((condition) => {
          const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[condition.fieldIndex]
          if (runtimeFieldIndex === undefined) {
            throw new Error(`Boundary runtime field missing for DB field ${condition.fieldIndex}`)
          }

          if (Object.prototype.hasOwnProperty.call(conditions, runtimeFieldIndex)) {
            throw new Error(
              `Boundary state seed transition ${transition.index} has duplicate runtime field ${runtimeFieldIndex}`,
            )
          }

          conditions[runtimeFieldIndex] = structuredClone(condition.condition)
        })

        return [transition.targetStateIndex, conditions]
      })
    }),
  }
}

const prepareBoundaryDatabaseData = (rawData: SharedDbData): BoundaryDatabaseData => {
  const data = normalizeSharedDbData(rawData)
  const metaById = new Map(data.metas.map((meta) => [meta.id, meta] as const))
  const metaFieldById = new Map(data.metaFields.map((field) => [field.id, field] as const))
  const metaStatesByMetaId = new Map<string, typeof data.metaStates>()
  const metaTransitionsByStateId = new Map<string, typeof data.metaTransitions>()
  const metaTransitionConditionsByTransitionId = new Map<string, typeof data.metaTransitionConditions>()
  const wimpFieldsByWimpId = new Map<string, typeof data.wimpFields>()
  const fieldValueByWimpFieldId = new Map(data.fieldValues.map((row) => [row.ownerWimpFieldId, row] as const))
  const wimpStateByWimpId = new Map(data.wimpStates.map((row) => [row.ownerWimpId, row] as const))
  const entanglementMembersByEntanglementId = new Map<string, typeof data.entanglementMembers>()
  const entanglementFieldsByEntanglementId = new Map<string, typeof data.entanglementFields>()
  const entanglementFieldMembersByFieldId = new Map<string, typeof data.entanglementFieldMembers>()

  data.metaStates.forEach((state) => {
    const states = metaStatesByMetaId.get(state.ownerMetaId)
    if (states) states.push(state)
    else metaStatesByMetaId.set(state.ownerMetaId, [state])
  })
  data.metaTransitions.forEach((transition) => {
    const transitions = metaTransitionsByStateId.get(transition.ownerMetaStateId)
    if (transitions) transitions.push(transition)
    else metaTransitionsByStateId.set(transition.ownerMetaStateId, [transition])
  })
  data.metaTransitionConditions.forEach((condition) => {
    const conditions = metaTransitionConditionsByTransitionId.get(condition.ownerMetaTransitionId)
    if (conditions) conditions.push(condition)
    else metaTransitionConditionsByTransitionId.set(condition.ownerMetaTransitionId, [condition])
  })
  data.wimpFields.forEach((field) => {
    const fields = wimpFieldsByWimpId.get(field.ownerWimpId)
    if (fields) fields.push(field)
    else wimpFieldsByWimpId.set(field.ownerWimpId, [field])
  })
  data.entanglementMembers.forEach((member) => {
    const members = entanglementMembersByEntanglementId.get(member.ownerEntanglementId)
    if (members) members.push(member)
    else entanglementMembersByEntanglementId.set(member.ownerEntanglementId, [member])
  })
  data.entanglementFields.forEach((field) => {
    const fields = entanglementFieldsByEntanglementId.get(field.ownerEntanglementId)
    if (fields) fields.push(field)
    else entanglementFieldsByEntanglementId.set(field.ownerEntanglementId, [field])
  })
  data.entanglementFieldMembers.forEach((member) => {
    const members = entanglementFieldMembersByFieldId.get(member.ownerEntanglementFieldId)
    if (members) members.push(member)
    else entanglementFieldMembersByFieldId.set(member.ownerEntanglementFieldId, [member])
  })

  for (const states of metaStatesByMetaId.values()) {
    states.sort((left, right) => left.stateOrder - right.stateOrder)
  }
  for (const transitions of metaTransitionsByStateId.values()) {
    transitions.sort((left, right) => left.transitionOrder - right.transitionOrder)
  }
  for (const conditions of metaTransitionConditionsByTransitionId.values()) {
    conditions.sort((left, right) => left.conditionOrder - right.conditionOrder)
  }
  for (const fields of wimpFieldsByWimpId.values()) {
    fields.sort((left, right) => left.fieldOrder - right.fieldOrder)
  }
  for (const members of entanglementMembersByEntanglementId.values()) {
    members.sort((left, right) => left.memberOrder - right.memberOrder)
  }
  for (const fields of entanglementFieldsByEntanglementId.values()) {
    fields.sort((left, right) => left.fieldOrder - right.fieldOrder)
  }
  for (const members of entanglementFieldMembersByFieldId.values()) {
    members.sort((left, right) => left.memberOrder - right.memberOrder)
  }

  const orderedWimps = [...data.wimps].sort((left, right) => left.wimpOrder - right.wimpOrder)
  const braneIndexByWimpId = new Map<string, number>()
  const fieldIndexByWimpFieldId = new Map<string, number>()
  const metaFieldIdToWimpFieldIdByWimpId = new Map<string, Map<string, string>>()
  const branes: BoundaryDatabaseBraneRecord[] = []
  const fields: BoundaryDatabaseFieldRecord[] = []
  const fieldValues: BoundaryDatabaseFieldValueRecord[] = []

  orderedWimps.forEach((wimp, braneIndex) => {
    const meta = metaById.get(wimp.metaId)
    if (!meta) {
      throw new Error(`Boundary database missing meta ${wimp.metaId} for wimp ${wimp.id}`)
    }

    braneIndexByWimpId.set(wimp.id, braneIndex)
    const wimpFields = wimpFieldsByWimpId.get(wimp.id) ?? []
    const fieldOffset = fields.length
    const wimpFieldIdsByMetaFieldId = new Map<string, string>()

    wimpFields.forEach((wimpField) => {
      const metaField = metaFieldById.get(wimpField.metaFieldId)
      if (!metaField) {
        throw new Error(`Boundary database missing meta field ${wimpField.metaFieldId} for wimp field ${wimpField.id}`)
      }

      const fieldIndex = fields.length
      fieldIndexByWimpFieldId.set(wimpField.id, fieldIndex)
      wimpFieldIdsByMetaFieldId.set(wimpField.metaFieldId, wimpField.id)

      fields.push({
        index: fieldIndex,
        ownerBraneIndex: braneIndex,
        wimpFieldId: wimpField.id,
        key: metaField.fieldKey,
        schema: cloneFieldSchema(metaField.schema),
      })

      const value = fieldValueByWimpFieldId.get(wimpField.id)
      if (!value) {
        throw new Error(`Boundary database missing field value for wimp field ${wimpField.id}`)
      }

      fieldValues.push({
        fieldIndex,
        value: structuredClone(value.value),
      })
    })

    metaFieldIdToWimpFieldIdByWimpId.set(wimp.id, wimpFieldIdsByMetaFieldId)
    branes.push({
      index: braneIndex,
      fieldOffset,
      fieldCount: wimpFields.length,
    })
  })

  const entanglementBlocks: BoundaryDatabaseEntanglementBlockRecord[] = []
  const entanglementBlockMembers: BoundaryDatabaseEntanglementBlockMemberRecord[] = []
  const entanglementFields: BoundaryDatabaseEntanglementFieldRecord[] = []
  const entanglementFieldMembers: BoundaryDatabaseEntanglementFieldMemberRecord[] = []

  const entanglementFamiliesByMembershipKey = new Map<
    string,
    Array<{
      entanglement: (typeof data.entanglements)[number]
      members: (typeof data.entanglementMembers)
      seedField: (typeof data.entanglementFields)[number]
      fieldMembers: (typeof data.entanglementFieldMembers)
    }>
  >()

  ;[...data.entanglements].forEach((entanglement) => {
    const members = entanglementMembersByEntanglementId.get(entanglement.id) ?? []
    const seedField = (entanglementFieldsByEntanglementId.get(entanglement.id) ?? [])[0]
    const fieldMembers = seedField ? (entanglementFieldMembersByFieldId.get(seedField.id) ?? []) : []
    const distinctFieldMemberWimpIds = new Set(fieldMembers.map((member) => member.ownerWimpId))

    if (!seedField || members.length < 2) return
    if (fieldMembers.length !== members.length) return
    if (distinctFieldMemberWimpIds.size !== members.length) return

    const families = entanglementFamiliesByMembershipKey.get(entanglement.membershipKey)
    const family = { entanglement, members, seedField, fieldMembers }
    if (families) families.push(family)
    else entanglementFamiliesByMembershipKey.set(entanglement.membershipKey, [family])
  })

  Array.from(entanglementFamiliesByMembershipKey.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .forEach(([membershipKey, families], blockIndex) => {
      const orderedFamilies = [...families].sort((left, right) => {
        const leftRepresentativeFieldIndex =
          fieldIndexByWimpFieldId.get(left.seedField.representativeWimpFieldId) ?? Number.MAX_SAFE_INTEGER
        const rightRepresentativeFieldIndex =
          fieldIndexByWimpFieldId.get(right.seedField.representativeWimpFieldId) ?? Number.MAX_SAFE_INTEGER

        return (
          leftRepresentativeFieldIndex - rightRepresentativeFieldIndex ||
          left.seedField.fieldName.localeCompare(right.seedField.fieldName)
        )
      })
      const blockMembers = orderedFamilies[0]?.members ?? []

      entanglementBlocks.push({
        index: blockIndex,
        key: membershipKey,
      })

      blockMembers.forEach((member) => {
        const braneIndex = braneIndexByWimpId.get(member.wimpId)
        if (braneIndex === undefined) {
          throw new Error(`Boundary database cannot resolve entanglement member wimp ${member.wimpId}`)
        }

        entanglementBlockMembers.push({
          blockIndex,
          memberIndex: member.memberOrder,
          braneIndex,
        })
      })

      orderedFamilies.forEach(({ seedField, fieldMembers }, blockFieldIndex) => {
        const representativeFieldIndex = fieldIndexByWimpFieldId.get(seedField.representativeWimpFieldId)
        if (representativeFieldIndex === undefined) {
          throw new Error(`Boundary database cannot resolve entanglement representative field ${seedField.representativeWimpFieldId}`)
        }

        const representativeBraneIndex = fields[representativeFieldIndex]?.ownerBraneIndex
        if (representativeBraneIndex === undefined) {
          throw new Error(`Boundary database cannot resolve representative brane for field ${seedField.representativeWimpFieldId}`)
        }

        const entanglementFieldIndex = entanglementFields.length
        entanglementFields.push({
          index: entanglementFieldIndex,
          blockIndex,
          blockFieldIndex,
          semanticKey: seedField.semanticKey,
          fieldName: seedField.fieldName,
          representativeBraneIndex,
          representativeFieldIndex,
          payloadIds: structuredClone(seedField.payloadIds),
          semanticKeys: structuredClone(seedField.semanticKeys),
        })

        fieldMembers.forEach((member) => {
          const fieldIndex = fieldIndexByWimpFieldId.get(member.wimpFieldId)
          const braneIndex = braneIndexByWimpId.get(member.ownerWimpId)
          if (fieldIndex === undefined || braneIndex === undefined) {
            throw new Error(`Boundary database cannot resolve entanglement field member ${member.id}`)
          }

          entanglementFieldMembers.push({
            entanglementFieldIndex,
            memberIndex: member.memberOrder,
            braneIndex,
            fieldIndex,
          })
        })
      })
    })

  const stateSeedStates: BoundaryDatabaseStateSeedStateRecord[] = []
  const stateSeedTransitions: BoundaryDatabaseStateSeedTransitionRecord[] = []
  const stateSeedConditions: BoundaryDatabaseStateSeedConditionRecord[] = []

  orderedWimps.forEach((wimp) => {
    const braneIndex = braneIndexByWimpId.get(wimp.id)
    if (braneIndex === undefined) {
      throw new Error(`Boundary database missing brane index for wimp ${wimp.id}`)
    }

    const metaStates = metaStatesByMetaId.get(wimp.metaId) ?? []
    const currentWimpState = wimpStateByWimpId.get(wimp.id)
    const metaStateIndexById = new Map(metaStates.map((state, stateIndex) => [state.id, stateIndex] as const))

    metaStates.forEach((state, stateIndex) => {
      stateSeedStates.push({
        ownerBraneIndex: braneIndex,
        stateIndex,
        metaStateId: state.id,
        stateName: state.stateName,
        initial: currentWimpState ? currentWimpState.metaStateId === state.id : state.initial,
      })
    })

    metaStates.forEach((state, fromStateIndex) => {
      const transitions = metaTransitionsByStateId.get(state.id) ?? []
      transitions.forEach((transition) => {
        const transitionSeedIndex = stateSeedTransitions.length
        stateSeedTransitions.push({
          index: transitionSeedIndex,
          ownerBraneIndex: braneIndex,
          fromStateIndex,
          transitionIndex: transition.transitionOrder,
          targetStateIndex:
            transition.targetMetaStateId === null ? null : (metaStateIndexById.get(transition.targetMetaStateId) ?? null),
        })

        ;(metaTransitionConditionsByTransitionId.get(transition.id) ?? []).forEach((condition) => {
          const wimpFieldId = metaFieldIdToWimpFieldIdByWimpId.get(wimp.id)?.get(condition.metaFieldId)
          const fieldIndex = wimpFieldId === undefined ? undefined : fieldIndexByWimpFieldId.get(wimpFieldId)
          if (fieldIndex === undefined) {
            throw new Error(`Boundary database cannot resolve state condition field for meta field ${condition.metaFieldId}`)
          }

          stateSeedConditions.push({
            transitionSeedIndex,
            conditionIndex: condition.conditionOrder,
            fieldIndex,
            condition: structuredClone(condition.condition),
          })
        })
      })
    })
  })

  return {
    branes,
    fields,
    fieldValues,
    entanglementBlocks,
    entanglementBlockMembers,
    entanglementFields,
    entanglementFieldMembers,
    stateSeedStates,
    stateSeedTransitions,
    stateSeedConditions,
  }
}

export const prepareBoundaryRuntimeWriteContext = (
  rawData: SharedDbData,
): BoundaryRuntimeWriteContext => {
  const data = prepareBoundaryDatabaseData(rawData)
  const { runtimeFieldIndexToWimpFieldIds } = buildBoundaryRuntimeFieldRegistry(data)
  const stateMetaStateIdsByBraneIndex: string[][] = []

  for (const state of data.stateSeedStates) {
    const braneStateIds = stateMetaStateIdsByBraneIndex[state.ownerBraneIndex] ?? []
    braneStateIds[state.stateIndex] = state.metaStateId
    stateMetaStateIdsByBraneIndex[state.ownerBraneIndex] = braneStateIds
  }

  return {
    fieldIdsByRuntimeFieldIndex: Array.from(runtimeFieldIndexToWimpFieldIds, (ids) => [...(ids ?? [])]),
    stateMetaStateIdsByBraneIndex: Array.from(stateMetaStateIdsByBraneIndex, (ids) => [...(ids ?? [])]),
  }
}

const filterSharedDbDataForActiveRuntime = (rawData: SharedDbData): SharedDbData => {
  const data = normalizeSharedDbData(rawData)
  const wimps = [...data.wimps]
  const wimpIds = new Set(wimps.map((row) => row.id))
  const metaIds = new Set(wimps.map((row) => row.metaId))

  const metas = data.metas.filter((row) => metaIds.has(row.id))
  const metaFields = data.metaFields.filter((row) => metaIds.has(row.ownerMetaId))
  const metaFieldIds = new Set(metaFields.map((row) => row.id))
  const metaStates = data.metaStates.filter((row) => metaIds.has(row.ownerMetaId))
  const metaStateIds = new Set(metaStates.map((row) => row.id))
  const metaTransitions = data.metaTransitions.filter(
    (row) => metaStateIds.has(row.ownerMetaStateId) && (row.targetMetaStateId === null || metaStateIds.has(row.targetMetaStateId)),
  )
  const metaTransitionIds = new Set(metaTransitions.map((row) => row.id))
  const metaTransitionConditions = data.metaTransitionConditions.filter(
    (row) => metaTransitionIds.has(row.ownerMetaTransitionId) && metaFieldIds.has(row.metaFieldId),
  )
  const metaProcesses = data.metaProcesses.filter((row) => metaIds.has(row.ownerMetaId))
  const metaProcessIds = new Set(metaProcesses.map((row) => row.id))
  const metaProcessReads = data.metaProcessReads.filter(
    (row) => metaProcessIds.has(row.ownerMetaProcessId) && metaFieldIds.has(row.metaFieldId),
  )
  const metaProcessWrites = data.metaProcessWrites.filter(
    (row) => metaProcessIds.has(row.ownerMetaProcessId) && metaFieldIds.has(row.metaFieldId),
  )
  const metaReactions = data.metaReactions.filter((row) => metaIds.has(row.ownerMetaId))
  const metaReactionIds = new Set(metaReactions.map((row) => row.id))
  const metaReactionStates = data.metaReactionStates.filter(
    (row) => metaReactionIds.has(row.ownerMetaReactionId) && metaStateIds.has(row.metaStateId),
  )
  const metaReactionReads = data.metaReactionReads.filter(
    (row) => metaReactionIds.has(row.ownerMetaReactionId) && metaFieldIds.has(row.metaFieldId),
  )
  const metaReactionWrites = data.metaReactionWrites.filter(
    (row) => metaReactionIds.has(row.ownerMetaReactionId) && metaFieldIds.has(row.metaFieldId),
  )
  const metaMatterNodes = data.metaMatterNodes.filter((row) => metaIds.has(row.ownerMetaId))
  const metaMatterNodeIds = new Set(metaMatterNodes.map((row) => row.id))
  const metaMatterEdges = data.metaMatterEdges.filter(
    (row) =>
      metaIds.has(row.ownerMetaId) &&
      metaMatterNodeIds.has(row.childNodeId) &&
      (row.parentNodeId === null || metaMatterNodeIds.has(row.parentNodeId)),
  )

  const wimpFields = data.wimpFields.filter((row) => wimpIds.has(row.ownerWimpId) && metaFieldIds.has(row.metaFieldId))
  const wimpFieldIds = new Set(wimpFields.map((row) => row.id))
  const wimpEdges = data.wimpEdges.filter(
    (row) => wimpIds.has(row.childWimpId) && (row.parentWimpId === null || wimpIds.has(row.parentWimpId)),
  )
  const fieldValues = data.fieldValues.filter((row) => wimpFieldIds.has(row.ownerWimpFieldId))
  const fieldSources = data.fieldSources.filter(
    (row) => wimpFieldIds.has(row.childWimpFieldId) && wimpFieldIds.has(row.parentWimpFieldId),
  )
  const wimpStates = data.wimpStates.filter((row) => wimpIds.has(row.ownerWimpId) && metaStateIds.has(row.metaStateId))

  const entanglementMembersById = new Map<string, typeof data.entanglementMembers>()
  const entanglementFieldsById = new Map<string, typeof data.entanglementFields>()
  const entanglementFieldMembersByFieldId = new Map<string, typeof data.entanglementFieldMembers>()

  data.entanglementMembers.forEach((row) => {
    const members = entanglementMembersById.get(row.ownerEntanglementId)
    if (members) members.push(row)
    else entanglementMembersById.set(row.ownerEntanglementId, [row])
  })
  data.entanglementFields.forEach((row) => {
    const fields = entanglementFieldsById.get(row.ownerEntanglementId)
    if (fields) fields.push(row)
    else entanglementFieldsById.set(row.ownerEntanglementId, [row])
  })
  data.entanglementFieldMembers.forEach((row) => {
    const members = entanglementFieldMembersByFieldId.get(row.ownerEntanglementFieldId)
    if (members) members.push(row)
    else entanglementFieldMembersByFieldId.set(row.ownerEntanglementFieldId, [row])
  })

  const entanglements: typeof data.entanglements = []
  const entanglementMembers: typeof data.entanglementMembers = []
  const entanglementFields: typeof data.entanglementFields = []
  const entanglementFieldMembers: typeof data.entanglementFieldMembers = []

  data.entanglements.forEach((row) => {
    const members = entanglementMembersById.get(row.id) ?? []
    const fieldsForEntanglement = entanglementFieldsById.get(row.id) ?? []

    if (members.length < 2) return
    if (!members.every((member) => wimpIds.has(member.wimpId))) return

    const validFields = fieldsForEntanglement.filter((field) => {
      const fieldMembers = entanglementFieldMembersByFieldId.get(field.id) ?? []

      return (
        wimpFieldIds.has(field.representativeWimpFieldId) &&
        fieldMembers.length === members.length &&
        fieldMembers.every((member) => wimpIds.has(member.ownerWimpId) && wimpFieldIds.has(member.wimpFieldId))
      )
    })

    if (validFields.length === 0) return

    entanglements.push(structuredClone(row))
    entanglementMembers.push(...members.map((member) => structuredClone(member)))
    entanglementFields.push(...validFields.map((field) => structuredClone(field)))
    validFields.forEach((field) => {
      entanglementFieldMembers.push(
        ...(entanglementFieldMembersByFieldId.get(field.id) ?? []).map((member) => structuredClone(member)),
      )
    })
  })

  return normalizeSharedDbData({
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
  })
}

export const mergeBoundaryRuntimeFragments = (fragments: Iterable<SharedDbData>): SharedDbData => {
  const merged = createEmptySharedDbData()

  for (const fragment of fragments) {
    const data = normalizeSharedDbData(fragment)
    upsertRowsById(merged.metas, data.metas)
    upsertRowsById(merged.metaFields, data.metaFields)
    upsertRowsById(merged.metaStates, data.metaStates)
    upsertRowsById(merged.metaTransitions, data.metaTransitions)
    upsertRowsById(merged.metaTransitionConditions, data.metaTransitionConditions)
    upsertRowsById(merged.metaProcesses, data.metaProcesses)
    upsertRowsById(merged.metaProcessReads, data.metaProcessReads)
    upsertRowsById(merged.metaProcessWrites, data.metaProcessWrites)
    upsertRowsById(merged.metaReactions, data.metaReactions)
    upsertRowsById(merged.metaReactionStates, data.metaReactionStates)
    upsertRowsById(merged.metaReactionReads, data.metaReactionReads)
    upsertRowsById(merged.metaReactionWrites, data.metaReactionWrites)
    upsertRowsById(merged.metaMatterNodes, data.metaMatterNodes)
    upsertRowsById(merged.metaMatterEdges, data.metaMatterEdges)
    upsertRowsById(merged.wimps, data.wimps)
    upsertRowsById(merged.wimpFields, data.wimpFields)
    upsertRowsById(merged.wimpEdges, data.wimpEdges)
    upsertRowsById(merged.fieldValues, data.fieldValues)
    upsertRowsById(merged.fieldSources, data.fieldSources)
    upsertRowsById(merged.wimpStates, data.wimpStates)
    upsertRowsById(merged.entanglements, data.entanglements)
    upsertRowsById(merged.entanglementMembers, data.entanglementMembers)
    upsertRowsById(merged.entanglementFields, data.entanglementFields)
    upsertRowsById(merged.entanglementFieldMembers, data.entanglementFieldMembers)
  }

  return filterSharedDbDataForActiveRuntime(merged)
}

export const prepareBoundaryRuntimeFragment = (
  rawData: SharedDbData,
  wimpId: string,
): SharedDbData => {
  const data = normalizeSharedDbData(rawData)
  const wimp = data.wimps.find((row) => row.id === wimpId)
  if (!wimp) {
    throw new Error(`Boundary runtime fragment missing wimp ${wimpId}`)
  }
  const wimpFieldById = new Map(data.wimpFields.map((row) => [row.id, row] as const))
  const packageWimpIds = new Set<string>([wimpId])
  const entanglementIds = new Set<string>()

  let changed = true
  while (changed) {
    changed = false
    const packageFieldIds = new Set(
      data.wimpFields.filter((row) => packageWimpIds.has(row.ownerWimpId)).map((row) => row.id),
    )

    data.fieldSources.forEach((row) => {
      if (!packageFieldIds.has(row.childWimpFieldId)) return

      const parentOwnerWimpId = wimpFieldById.get(row.parentWimpFieldId)?.ownerWimpId

      if (!parentOwnerWimpId || packageWimpIds.has(parentOwnerWimpId)) return
      packageWimpIds.add(parentOwnerWimpId)
      changed = true
    })

    const touchedEntanglementFieldIds = new Set<string>()

    data.entanglementMembers.forEach((row) => {
      if (packageWimpIds.has(row.wimpId)) entanglementIds.add(row.ownerEntanglementId)
    })
    data.entanglementFields.forEach((row) => {
      if (packageFieldIds.has(row.representativeWimpFieldId)) {
        entanglementIds.add(row.ownerEntanglementId)
      }
    })
    data.entanglementFieldMembers.forEach((row) => {
      if (packageWimpIds.has(row.ownerWimpId) || packageFieldIds.has(row.wimpFieldId)) {
        touchedEntanglementFieldIds.add(row.ownerEntanglementFieldId)
      }
    })
    touchedEntanglementFieldIds.forEach((fieldId) => {
      const entanglementField = data.entanglementFields.find((row) => row.id === fieldId)
      if (entanglementField) entanglementIds.add(entanglementField.ownerEntanglementId)
    })
  }

  const packageWimps = data.wimps.filter((row) => packageWimpIds.has(row.id))
  const metaIds = new Set(packageWimps.map((row) => row.metaId))
  const packageMetas = data.metas.filter((row) => metaIds.has(row.id))
  const packageMetaFields = data.metaFields.filter((row) => metaIds.has(row.ownerMetaId))
  const packageMetaFieldIds = new Set(packageMetaFields.map((row) => row.id))
  const packageMetaStates = data.metaStates.filter((row) => metaIds.has(row.ownerMetaId))
  const packageMetaStateIds = new Set(packageMetaStates.map((row) => row.id))
  const packageMetaTransitions = data.metaTransitions.filter(
    (row) =>
      packageMetaStateIds.has(row.ownerMetaStateId) &&
      (row.targetMetaStateId === null || packageMetaStateIds.has(row.targetMetaStateId)),
  )
  const packageMetaTransitionIds = new Set(packageMetaTransitions.map((row) => row.id))
  const packageMetaProcesses = data.metaProcesses.filter((row) => metaIds.has(row.ownerMetaId))
  const packageMetaProcessIds = new Set(packageMetaProcesses.map((row) => row.id))
  const packageMetaReactions = data.metaReactions.filter((row) => metaIds.has(row.ownerMetaId))
  const packageMetaReactionIds = new Set(packageMetaReactions.map((row) => row.id))
  const packageFieldIds = new Set(
    data.wimpFields.filter((row) => packageWimpIds.has(row.ownerWimpId)).map((row) => row.id),
  )
  const packageEntanglementMembersById = new Map<string, typeof data.entanglementMembers>()
  const packageEntanglementFieldsById = new Map<string, typeof data.entanglementFields>()
  const packageEntanglementFieldMembersByFieldId = new Map<string, typeof data.entanglementFieldMembers>()

  data.entanglementMembers.forEach((row) => {
    const members = packageEntanglementMembersById.get(row.ownerEntanglementId)
    if (members) members.push(row)
    else packageEntanglementMembersById.set(row.ownerEntanglementId, [row])
  })
  data.entanglementFields.forEach((row) => {
    const fields = packageEntanglementFieldsById.get(row.ownerEntanglementId)
    if (fields) fields.push(row)
    else packageEntanglementFieldsById.set(row.ownerEntanglementId, [row])
  })
  data.entanglementFieldMembers.forEach((row) => {
    const members = packageEntanglementFieldMembersByFieldId.get(row.ownerEntanglementFieldId)
    if (members) members.push(row)
    else packageEntanglementFieldMembersByFieldId.set(row.ownerEntanglementFieldId, [row])
  })

  const packageEntanglements: typeof data.entanglements = []
  const packageEntanglementMembers: typeof data.entanglementMembers = []
  const packageEntanglementFields: typeof data.entanglementFields = []
  const packageEntanglementFieldMembers: typeof data.entanglementFieldMembers = []

  data.entanglements.forEach((row) => {
    const members = packageEntanglementMembersById.get(row.id) ?? []
    const fieldsForEntanglement = packageEntanglementFieldsById.get(row.id) ?? []

    if (!entanglementIds.has(row.id)) return
    if (members.length < 2) return
    if (!members.every((member) => packageWimpIds.has(member.wimpId))) return

    const validFields = fieldsForEntanglement.filter((field) => {
      const fieldMembers = packageEntanglementFieldMembersByFieldId.get(field.id) ?? []

      return (
        packageFieldIds.has(field.representativeWimpFieldId) &&
        fieldMembers.length === members.length &&
        fieldMembers.every(
          (member) => packageWimpIds.has(member.ownerWimpId) && packageFieldIds.has(member.wimpFieldId),
        )
      )
    })

    if (validFields.length === 0) return

    packageEntanglements.push(structuredClone(row))
    packageEntanglementMembers.push(...members.map((member) => structuredClone(member)))
    packageEntanglementFields.push(...validFields.map((field) => structuredClone(field)))
    validFields.forEach((field) => {
      packageEntanglementFieldMembers.push(
        ...(packageEntanglementFieldMembersByFieldId.get(field.id) ?? []).map((member) => structuredClone(member)),
      )
    })
  })

  return filterSharedDbDataForActiveRuntime({
    metas: packageMetas.map((row) => structuredClone(row)),
    metaFields: packageMetaFields.map((row) => structuredClone(row)),
    metaStates: packageMetaStates.map((row) => structuredClone(row)),
    metaTransitions: packageMetaTransitions.map((row) => structuredClone(row)),
    metaTransitionConditions: data.metaTransitionConditions
      .filter((row) => packageMetaTransitionIds.has(row.ownerMetaTransitionId) && packageMetaFieldIds.has(row.metaFieldId))
      .map((row) => structuredClone(row)),
    metaProcesses: packageMetaProcesses.map((row) => structuredClone(row)),
    metaProcessReads: data.metaProcessReads
      .filter((row) => packageMetaProcessIds.has(row.ownerMetaProcessId) && packageMetaFieldIds.has(row.metaFieldId))
      .map((row) => structuredClone(row)),
    metaProcessWrites: data.metaProcessWrites
      .filter((row) => packageMetaProcessIds.has(row.ownerMetaProcessId) && packageMetaFieldIds.has(row.metaFieldId))
      .map((row) => structuredClone(row)),
    metaReactions: packageMetaReactions.map((row) => structuredClone(row)),
    metaReactionStates: data.metaReactionStates
      .filter((row) => packageMetaReactionIds.has(row.ownerMetaReactionId) && packageMetaStateIds.has(row.metaStateId))
      .map((row) => structuredClone(row)),
    metaReactionReads: data.metaReactionReads
      .filter((row) => packageMetaReactionIds.has(row.ownerMetaReactionId) && packageMetaFieldIds.has(row.metaFieldId))
      .map((row) => structuredClone(row)),
    metaReactionWrites: data.metaReactionWrites
      .filter((row) => packageMetaReactionIds.has(row.ownerMetaReactionId) && packageMetaFieldIds.has(row.metaFieldId))
      .map((row) => structuredClone(row)),
    metaMatterNodes: data.metaMatterNodes.filter((row) => metaIds.has(row.ownerMetaId)).map((row) => structuredClone(row)),
    metaMatterEdges: data.metaMatterEdges.filter((row) => metaIds.has(row.ownerMetaId)).map((row) => structuredClone(row)),
    wimps: packageWimps.map((row) => structuredClone(row)),
    wimpFields: data.wimpFields.filter((row) => packageWimpIds.has(row.ownerWimpId)).map((row) => structuredClone(row)),
    wimpEdges: data.wimpEdges
      .filter((row) => packageWimpIds.has(row.childWimpId) && (row.parentWimpId === null || packageWimpIds.has(row.parentWimpId)))
      .map((row) => structuredClone(row)),
    fieldValues: data.fieldValues
      .filter((row) => packageFieldIds.has(row.ownerWimpFieldId))
      .map((row) => structuredClone(row)),
    fieldSources: data.fieldSources
      .filter((row) => packageFieldIds.has(row.childWimpFieldId) && packageFieldIds.has(row.parentWimpFieldId))
      .map((row) => structuredClone(row)),
    wimpStates: data.wimpStates.filter((row) => packageWimpIds.has(row.ownerWimpId)).map((row) => structuredClone(row)),
    entanglements: packageEntanglements,
    entanglementMembers: packageEntanglementMembers,
    entanglementFields: packageEntanglementFields,
    entanglementFieldMembers: packageEntanglementFieldMembers,
  })
}

export const prepareBoundaryRuntimeLoadedFragment = (
  rawData: SharedDbData,
  activeWimpIds?: Iterable<string>,
): SharedDbData => {
  const data = normalizeSharedDbData(rawData)

  if (activeWimpIds === undefined) {
    return filterSharedDbDataForActiveRuntime(data)
  }

  const requestedWimpIds = Array.from(new Set(activeWimpIds))

  if (requestedWimpIds.length === 0) {
    return createEmptySharedDbData()
  }

  return mergeBoundaryRuntimeFragments(requestedWimpIds.map((wimpId) => prepareBoundaryRuntimeFragment(data, wimpId)))
}

const prepareBoundaryWriteData = (
  data: BoundaryDatabaseData,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => {
  const { runtimeFields, runtimeFieldIndexByDbFieldIndex } = buildBoundaryRuntimeFieldRegistry(data)
  const stateSeeds = groupStateSeedStates(data)
  const transitionSeeds = groupStateSeedTransitions(data)
  const conditionSeeds = groupStateSeedConditions(data)
  const entanglement = options.entanglement ?? prepareBoundaryEntanglementProjection(data, runtimeFieldIndexByDbFieldIndex)

  const stateNames: string[][] = []
  for (let braneIndex = 0; braneIndex < data.branes.length; braneIndex++) {
    const braneStateSeeds = stateSeeds.get(braneIndex) ?? []
    stateNames[braneIndex] = braneStateSeeds.map((seed) => seed.stateName)
  }

  return {
    fields: runtimeFields,
    branes: data.branes.map((brane) => {
      const stateGraph = prepareBoundaryStateSeedGraph(
        brane.index,
        runtimeFieldIndexByDbFieldIndex,
        stateSeeds,
        transitionSeeds,
        conditionSeeds,
      )

      return {
        values: data.fields
          .slice(brane.fieldOffset, brane.fieldOffset + brane.fieldCount)
          .map((field) => {
            const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[field.index]
            if (runtimeFieldIndex === undefined) {
              throw new Error(`Boundary runtime field index missing for DB field ${field.index}`)
            }

            return [runtimeFieldIndex, structuredClone(requireBoundaryDatabaseFieldValue(data, field.index).value)] as [
              number,
              BraneValue,
            ]
          }) as [number, BraneValue][],
        state: stateGraph.state,
        collapses: stateGraph.collapses,
      }
    }),
    stateNames,
    ...(entanglement !== undefined ? { entanglement: structuredClone(entanglement) } : {}),
  }
}

const prepareBoundaryStoreFromDatabase = (
  data: BoundaryDatabaseData,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => assembleStoredBoundaryData(flattenBoundaryData(prepareBoundaryWriteData(data, options)))

export const prepareBoundaryRuntimeData = (
  rawData: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => prepareBoundaryWriteData(prepareBoundaryDatabaseData(rawData), options)

export const prepareBoundaryRuntimeStore = (
  rawData: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => prepareBoundaryStoreFromDatabase(prepareBoundaryDatabaseData(rawData), options)

export const prepareBoundaryRuntimeFragmentFromSharedDb = (
  backend: SharedDbBackend,
  wimpId: string,
): SharedDbData => prepareBoundaryRuntimeFragment(readSharedDbData(backend), wimpId)

export const prepareBoundaryRuntimeLoadedFragmentFromSharedDb = (
  backend: SharedDbBackend,
  activeWimpIds?: Iterable<string>,
): SharedDbData => prepareBoundaryRuntimeLoadedFragment(readSharedDbData(backend), activeWimpIds)

export const prepareBoundaryRuntimeStoreFromSharedDb = (
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => prepareBoundaryRuntimeStore(readSharedDbData(backend), options)
