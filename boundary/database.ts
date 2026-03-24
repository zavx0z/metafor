import type { FieldKey } from "@metafor/ast"
import {
  normalizeSharedDbData,
  readSharedDbData,
  type SharedDbBackend,
  type SharedDbData,
  type SharedDbFieldSchemaRecord,
} from "@shared/db"
import { FieldType, flattenBoundaryData, type Data, type Field } from "@boundary/gravity"
import { assembleStoredBoundaryData, type PreparedEntanglementProjection } from "@boundary/strong"
import type { PreparedData } from "./boundary.t.ts"
import type {
  BoundaryDatabase,
  BoundaryDatabaseBraneRecord,
  BoundaryDatabaseData,
  BoundaryDatabaseEntanglementBlockMemberRecord,
  BoundaryDatabaseEntanglementBlockRecord,
  BoundaryDatabaseEntanglementFieldMemberRecord,
  BoundaryDatabaseEntanglementFieldRecord,
  BoundaryDatabaseFieldRecord,
  BoundaryDatabaseFieldSchemaRecord,
  BoundaryDatabaseFieldSourceRecord,
  BoundaryDatabaseFieldValueRecord,
  BoundaryDatabaseStateSeedConditionRecord,
  BoundaryDatabaseStateSeedStateRecord,
  BoundaryDatabaseStateSeedTransitionRecord,
  BoundarySharedDbRuntimeOptions,
} from "./database.t.ts"

const cloneFieldSchema = (
  schema: BoundaryDatabaseFieldSchemaRecord | SharedDbFieldSchemaRecord,
): BoundaryDatabaseFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required,
  topology: schema.topology,
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const createEmptyBoundaryDatabaseData = (): BoundaryDatabaseData => ({
  rootBraneIndex: 0,
  branes: [],
  fields: [],
  fieldValues: [],
  fieldSources: [],
  entanglementBlocks: [],
  entanglementBlockMembers: [],
  entanglementFields: [],
  entanglementFieldMembers: [],
  stateSeedStates: [],
  stateSeedTransitions: [],
  stateSeedConditions: [],
})

const cloneBoundaryDatabaseData = (data: BoundaryDatabaseData): BoundaryDatabaseData => ({
  rootBraneIndex: data.rootBraneIndex,
  branes: data.branes.map((brane): BoundaryDatabaseBraneRecord => structuredClone(brane)),
  fields: data.fields.map((field): BoundaryDatabaseFieldRecord => ({
    ...field,
    schema: cloneFieldSchema(field.schema),
  })),
  fieldValues: data.fieldValues.map((fieldValue): BoundaryDatabaseFieldValueRecord => ({
    ...fieldValue,
    value: structuredClone(fieldValue.value),
  })),
  fieldSources: data.fieldSources.map((fieldSource): BoundaryDatabaseFieldSourceRecord => structuredClone(fieldSource)),
  entanglementBlocks: data.entanglementBlocks.map((block): BoundaryDatabaseEntanglementBlockRecord => structuredClone(block)),
  entanglementBlockMembers: data.entanglementBlockMembers.map(
    (member): BoundaryDatabaseEntanglementBlockMemberRecord => structuredClone(member),
  ),
  entanglementFields: data.entanglementFields.map((field): BoundaryDatabaseEntanglementFieldRecord => ({
    ...field,
    payloadIds: structuredClone(field.payloadIds),
    semanticKeys: structuredClone(field.semanticKeys),
  })),
  entanglementFieldMembers: data.entanglementFieldMembers.map(
    (member): BoundaryDatabaseEntanglementFieldMemberRecord => structuredClone(member),
  ),
  stateSeedStates: data.stateSeedStates.map((state): BoundaryDatabaseStateSeedStateRecord => structuredClone(state)),
  stateSeedTransitions: data.stateSeedTransitions.map(
    (transition): BoundaryDatabaseStateSeedTransitionRecord => structuredClone(transition),
  ),
  stateSeedConditions: data.stateSeedConditions.map((condition): BoundaryDatabaseStateSeedConditionRecord => ({
    ...condition,
    condition: structuredClone(condition.condition),
  })),
})

const buildBoundaryDatabaseIndexes = (data: BoundaryDatabaseData) => {
  const braneIndexByWimpId = new Map<string, number>()
  const fieldIndexByWimpFieldId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<BoundaryDatabaseFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()

  for (const brane of data.branes) {
    braneIndexByWimpId.set(brane.wimpId, brane.index)
    fieldIndexByBraneAndKey.set(brane.index, new Map())
  }

  for (const field of data.fields) {
    fieldIndexByWimpFieldId.set(field.wimpFieldId, field.index)
    fieldIndexByBraneAndKey.get(field.ownerBraneIndex)?.set(field.key, field.index)
  }

  for (const fieldSource of data.fieldSources) {
    fieldSourceByChildFieldIndex[fieldSource.childFieldIndex] = fieldSource
    const dependents = dependentFieldIndexesByParentFieldIndex.get(fieldSource.parentFieldIndex)
    if (dependents) {
      dependents.push(fieldSource.childFieldIndex)
    } else {
      dependentFieldIndexesByParentFieldIndex.set(fieldSource.parentFieldIndex, [fieldSource.childFieldIndex])
    }
  }

  return {
    braneIndexByWimpId,
    fieldIndexByWimpFieldId,
    fieldIndexByBraneAndKey,
    fieldSourceByChildFieldIndex,
    dependentFieldIndexesByParentFieldIndex,
  }
}

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
  database: BoundaryDatabase,
  fieldIndex: number,
): BoundaryDatabaseFieldValueRecord => {
  const fieldValue = database.getFieldValue(fieldIndex)
  if (!fieldValue) {
    throw new Error(`Boundary database field value missing for field index: ${fieldIndex}`)
  }
  return fieldValue
}

const groupEntanglementBlockMembers = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.entanglementBlockMembers>()
  for (const member of database.entanglementBlockMembers) {
    const members = grouped.get(member.blockIndex)
    if (members) members.push(member)
    else grouped.set(member.blockIndex, [member])
  }
  for (const members of grouped.values()) {
    members.sort((left, right) => left.memberIndex - right.memberIndex)
  }
  return grouped
}

const groupEntanglementFields = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.entanglementFields>()
  for (const field of database.entanglementFields) {
    const fields = grouped.get(field.blockIndex)
    if (fields) fields.push(field)
    else grouped.set(field.blockIndex, [field])
  }
  for (const fields of grouped.values()) {
    fields.sort((left, right) => left.blockFieldIndex - right.blockFieldIndex)
  }
  return grouped
}

const groupEntanglementFieldMembers = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.entanglementFieldMembers>()
  for (const member of database.entanglementFieldMembers) {
    const members = grouped.get(member.entanglementFieldIndex)
    if (members) members.push(member)
    else grouped.set(member.entanglementFieldIndex, [member])
  }
  for (const members of grouped.values()) {
    members.sort((left, right) => left.memberIndex - right.memberIndex)
  }
  return grouped
}

const groupStateSeedStates = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.stateSeedStates>()
  for (const state of database.stateSeedStates) {
    const states = grouped.get(state.ownerBraneIndex)
    if (states) states.push(state)
    else grouped.set(state.ownerBraneIndex, [state])
  }
  for (const states of grouped.values()) {
    states.sort((left, right) => left.stateIndex - right.stateIndex)
  }
  return grouped
}

const groupStateSeedTransitions = (database: BoundaryDatabase) => {
  const grouped = new Map<string, typeof database.stateSeedTransitions>()
  for (const transition of database.stateSeedTransitions) {
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

const groupStateSeedConditions = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.stateSeedConditions>()
  for (const condition of database.stateSeedConditions) {
    const conditions = grouped.get(condition.transitionSeedIndex)
    if (conditions) conditions.push(condition)
    else grouped.set(condition.transitionSeedIndex, [condition])
  }
  for (const conditions of grouped.values()) {
    conditions.sort((left, right) => left.conditionIndex - right.conditionIndex)
  }
  return grouped
}

const buildBoundaryRuntimeFieldRegistry = (database: BoundaryDatabase) => {
  const runtimeFields: Field[] = []
  const runtimeFieldIndexByDbFieldIndex: number[] = []
  const runtimeFieldIndexBySignature = new Map<string, number>()
  const entanglementFieldMembers = groupEntanglementFieldMembers(database)

  const ensureRuntimeField = (signature: string, field: BoundaryDatabaseFieldRecord): number => {
    const existing = runtimeFieldIndexBySignature.get(signature)
    if (existing !== undefined) return existing

    const runtimeFieldIndex = runtimeFields.length
    runtimeFields.push(cloneRuntimeField(mapBoundaryDatabaseFieldToRuntimeField(field)))
    runtimeFieldIndexBySignature.set(signature, runtimeFieldIndex)
    return runtimeFieldIndex
  }

  for (const seedField of [...database.entanglementFields].sort((left, right) => left.index - right.index)) {
    const representativeField = database.getField(seedField.representativeFieldIndex)
    if (!representativeField) {
      throw new Error(`Boundary runtime seed representative field missing: ${seedField.representativeFieldIndex}`)
    }

    const runtimeFieldIndex = ensureRuntimeField(
      createSeedRuntimeFieldSignature(seedField.semanticKey, representativeField),
      representativeField,
    )

    for (const member of entanglementFieldMembers.get(seedField.index) ?? []) {
      const existing = runtimeFieldIndexByDbFieldIndex[member.fieldIndex]
      if (existing !== undefined && existing !== runtimeFieldIndex) {
        throw new Error(`Boundary runtime field index mismatch for DB field ${member.fieldIndex}`)
      }
      runtimeFieldIndexByDbFieldIndex[member.fieldIndex] = runtimeFieldIndex
    }
  }

  for (const field of database.fields) {
    if (runtimeFieldIndexByDbFieldIndex[field.index] !== undefined) continue
    const runtimeFieldIndex = ensureRuntimeField(createLocalRuntimeFieldSignature(field), field)
    runtimeFieldIndexByDbFieldIndex[field.index] = runtimeFieldIndex
  }

  return { runtimeFields, runtimeFieldIndexByDbFieldIndex }
}

const prepareBoundaryEntanglementProjection = (
  database: BoundaryDatabase,
  runtimeFieldIndexByDbFieldIndex: number[],
): PreparedEntanglementProjection | undefined => {
  if (database.entanglementBlocks.length === 0) return undefined

  const blockMembers = groupEntanglementBlockMembers(database)
  const blockFields = groupEntanglementFields(database)
  const fieldMembers = groupEntanglementFieldMembers(database)

  return {
    blocks: [...database.entanglementBlocks]
      .sort((left, right) => left.index - right.index)
      .map((block) => ({
        key: block.key,
        braneIndices: (blockMembers.get(block.index) ?? []).map((member) => member.braneIndex),
        fields: (blockFields.get(block.index) ?? []).map((seedField) => {
          const representativeField = database.getField(seedField.representativeFieldIndex)
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
  database: BoundaryDatabase,
  braneIndex: number,
  runtimeFieldIndexByDbFieldIndex: number[],
  stateSeeds: ReturnType<typeof groupStateSeedStates>,
  transitionSeeds: ReturnType<typeof groupStateSeedTransitions>,
  conditionSeeds: ReturnType<typeof groupStateSeedConditions>,
): { state: number; collapses: Data["branes"][number]["collapses"] } => {
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
        wimpFieldId: wimpField.id,
        metaFieldId: metaField.id,
        ownerBraneIndex: braneIndex,
        key: metaField.fieldKey,
        schema: cloneFieldSchema(metaField.schema),
      })

      const value = fieldValueByWimpFieldId.get(wimpField.id)
      if (!value) {
        throw new Error(`Boundary database missing field value for wimp field ${wimpField.id}`)
      }

      fieldValues.push({
        fieldIndex,
        wimpFieldId: wimpField.id,
        value: structuredClone(value.value),
      })
    })

    metaFieldIdToWimpFieldIdByWimpId.set(wimp.id, wimpFieldIdsByMetaFieldId)
    branes.push({
      index: braneIndex,
      wimpId: wimp.id,
      metaId: wimp.metaId,
      src: meta.src,
      ...(meta.name !== undefined ? { name: meta.name } : {}),
      fieldOffset,
      fieldCount: wimpFields.length,
    })
  })

  const fieldSources: BoundaryDatabaseFieldSourceRecord[] = data.fieldSources
    .map((source) => {
      const childFieldIndex = fieldIndexByWimpFieldId.get(source.childWimpFieldId)
      const parentFieldIndex = fieldIndexByWimpFieldId.get(source.parentWimpFieldId)
      if (childFieldIndex === undefined || parentFieldIndex === undefined) {
        throw new Error(`Boundary database cannot resolve field source ${source.id}`)
      }
      return {
        id: source.id,
        childFieldIndex,
        parentFieldIndex,
      }
    })
    .sort((left, right) => left.childFieldIndex - right.childFieldIndex)

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
        entanglementId: orderedFamilies[0]!.entanglement.id,
        key: membershipKey,
      })

      blockMembers.forEach((member) => {
        const braneIndex = braneIndexByWimpId.get(member.wimpId)
        if (braneIndex === undefined) {
          throw new Error(`Boundary database cannot resolve entanglement member wimp ${member.wimpId}`)
        }

        entanglementBlockMembers.push({
          index: entanglementBlockMembers.length,
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
            index: entanglementFieldMembers.length,
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
        index: stateSeedStates.length,
        ownerBraneIndex: braneIndex,
        stateIndex,
        metaStateId: state.id,
        name: state.stateName,
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
            index: stateSeedConditions.length,
            transitionSeedIndex,
            conditionIndex: condition.conditionOrder,
            fieldIndex,
            condition: structuredClone(condition.condition),
          })
        })
      })
    })
  })

  const rootWimpId =
    [...data.wimpEdges]
      .filter((edge) => edge.parentWimpId === null)
      .sort((left, right) => left.edgeOrder - right.edgeOrder)[0]?.childWimpId ?? orderedWimps[0]?.id

  return {
    rootBraneIndex: rootWimpId ? (braneIndexByWimpId.get(rootWimpId) ?? 0) : 0,
    branes,
    fields,
    fieldValues,
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

const openBoundaryDatabase = (data: BoundaryDatabaseData = createEmptyBoundaryDatabaseData()): BoundaryDatabase => {
  const database: BoundaryDatabase = {
    rootBraneIndex: 0,
    branes: [],
    fields: [],
    fieldValues: [],
    fieldSources: [],
    entanglementBlocks: [],
    entanglementBlockMembers: [],
    entanglementFields: [],
    entanglementFieldMembers: [],
    stateSeedStates: [],
    stateSeedTransitions: [],
    stateSeedConditions: [],
    braneIndexByWimpId: new Map(),
    fieldIndexByWimpFieldId: new Map(),
    fieldIndexByBraneAndKey: new Map(),
    fieldSourceByChildFieldIndex: [],
    dependentFieldIndexesByParentFieldIndex: new Map(),

    reset() {
      assignState(createEmptyBoundaryDatabaseData())
    },

    restore(nextData) {
      assignState(nextData)
    },

    getBrane(braneIndex) {
      return this.branes[braneIndex]
    },

    getBraneByWimpId(wimpId) {
      const braneIndex = this.braneIndexByWimpId.get(wimpId)
      return braneIndex === undefined ? undefined : this.branes[braneIndex]
    },

    getField(fieldIndex) {
      return this.fields[fieldIndex]
    },

    getFieldByWimpFieldId(wimpFieldId) {
      const fieldIndex = this.fieldIndexByWimpFieldId.get(wimpFieldId)
      return fieldIndex === undefined ? undefined : this.fields[fieldIndex]
    },

    getFieldByKey(braneIndex, fieldKey) {
      const fieldIndex = this.fieldIndexByBraneAndKey.get(braneIndex)?.get(fieldKey)
      return fieldIndex === undefined ? undefined : this.fields[fieldIndex]
    },

    getFieldValue(fieldIndex) {
      return this.fieldValues[fieldIndex]
    },

    getFieldSource(childFieldIndex) {
      return this.fieldSourceByChildFieldIndex[childFieldIndex]
    },

    getDependentFields(parentFieldIndex) {
      return (this.dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex) ?? []).map(
        (fieldIndex) => this.fields[fieldIndex]!,
      )
    },

    setFieldValue(fieldIndex, value) {
      const field = this.fields[fieldIndex]
      if (!field) throw new Error(`Field index out of range: ${fieldIndex}`)

      const nextValue = structuredClone(value)
      const existing = this.fieldValues[fieldIndex]

      if (existing) {
        existing.value = nextValue
        return
      }

      this.fieldValues[fieldIndex] = {
        fieldIndex,
        wimpFieldId: field.wimpFieldId,
        value: nextValue,
      }
    },
  }

  const assignState = (nextData: BoundaryDatabaseData): void => {
    const cloned = cloneBoundaryDatabaseData(nextData)
    const indexes = buildBoundaryDatabaseIndexes(cloned)

    database.rootBraneIndex = cloned.rootBraneIndex
    database.branes = cloned.branes
    database.fields = cloned.fields
    database.fieldValues = cloned.fieldValues
    database.fieldSources = cloned.fieldSources
    database.entanglementBlocks = cloned.entanglementBlocks
    database.entanglementBlockMembers = cloned.entanglementBlockMembers
    database.entanglementFields = cloned.entanglementFields
    database.entanglementFieldMembers = cloned.entanglementFieldMembers
    database.stateSeedStates = cloned.stateSeedStates
    database.stateSeedTransitions = cloned.stateSeedTransitions
    database.stateSeedConditions = cloned.stateSeedConditions
    database.braneIndexByWimpId = indexes.braneIndexByWimpId
    database.fieldIndexByWimpFieldId = indexes.fieldIndexByWimpFieldId
    database.fieldIndexByBraneAndKey = indexes.fieldIndexByBraneAndKey
    database.fieldSourceByChildFieldIndex = indexes.fieldSourceByChildFieldIndex
    database.dependentFieldIndexesByParentFieldIndex = indexes.dependentFieldIndexesByParentFieldIndex
  }

  assignState(data)
  return database
}

const buildBoundaryDatabase = (data: SharedDbData): BoundaryDatabase =>
  openBoundaryDatabase(prepareBoundaryDatabaseData(data))

const prepareBoundaryWriteData = (
  database: BoundaryDatabase,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => {
  const { runtimeFields, runtimeFieldIndexByDbFieldIndex } = buildBoundaryRuntimeFieldRegistry(database)
  const stateSeeds = groupStateSeedStates(database)
  const transitionSeeds = groupStateSeedTransitions(database)
  const conditionSeeds = groupStateSeedConditions(database)
  const entanglement = options.entanglement ?? prepareBoundaryEntanglementProjection(database, runtimeFieldIndexByDbFieldIndex)

  return {
    fields: runtimeFields,
    branes: database.branes.map((brane) => {
      const stateGraph = prepareBoundaryStateSeedGraph(
        database,
        brane.index,
        runtimeFieldIndexByDbFieldIndex,
        stateSeeds,
        transitionSeeds,
        conditionSeeds,
      )

      return {
        values: database.fields
          .slice(brane.fieldOffset, brane.fieldOffset + brane.fieldCount)
          .map((field) => {
            const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[field.index]
            if (runtimeFieldIndex === undefined) {
              throw new Error(`Boundary runtime field index missing for DB field ${field.index}`)
            }

            return [runtimeFieldIndex, structuredClone(requireBoundaryDatabaseFieldValue(database, field.index).value)] as [
              number,
              unknown,
            ]
          }),
        state: stateGraph.state,
        collapses: stateGraph.collapses,
      }
    }),
    ...(entanglement !== undefined ? { entanglement: structuredClone(entanglement) } : {}),
  }
}

const prepareBoundaryStoreFromDatabase = (
  database: BoundaryDatabase,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => assembleStoredBoundaryData(flattenBoundaryData(prepareBoundaryWriteData(database, options)))

export const prepareBoundaryRuntimeData = (
  rawData: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => prepareBoundaryWriteData(buildBoundaryDatabase(rawData), options)

export const prepareBoundaryRuntimeStore = (
  rawData: SharedDbData,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => prepareBoundaryStoreFromDatabase(buildBoundaryDatabase(rawData), options)

export const prepareBoundaryRuntimeDataFromSharedDb = (
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => prepareBoundaryRuntimeData(readSharedDbData(backend), options)

export const prepareBoundaryRuntimeStoreFromSharedDb = (
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => prepareBoundaryRuntimeStore(readSharedDbData(backend), options)
