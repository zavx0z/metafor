import type { FieldKey } from "@metafor/ast"
import {
  readSharedDbProjection,
  type SharedDbBackend,
  type SharedDbFieldSchemaRecord,
  type SharedDbProjection,
} from "@shared/db"
import { FieldType, flattenBoundaryData, type Data, type Field } from "@boundary/gravity"
import { assembleStoredBoundaryData, type PreparedEntanglementProjection } from "@boundary/strong"
import type { PreparedData } from "./boundary.t.ts"
import type {
  BoundaryDatabase,
  BoundaryDatabaseBraneRecord,
  BoundaryDatabaseData,
  BoundaryDatabaseFieldRecord,
  BoundaryDatabaseFieldSchemaRecord,
  BoundaryDatabaseFieldSourceRecord,
  BoundaryDatabaseFieldValueRecord,
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
  branes: data.branes.map((brane): BoundaryDatabaseBraneRecord => ({
    index: brane.index,
    darkWimpId: brane.darkWimpId,
    src: brane.src,
    ...(brane.name !== undefined ? { name: brane.name } : {}),
    fieldOffset: brane.fieldOffset,
    fieldCount: brane.fieldCount,
  })),
  fields: data.fields.map((field): BoundaryDatabaseFieldRecord => ({
    index: field.index,
    darkFieldId: field.darkFieldId,
    ownerBraneIndex: field.ownerBraneIndex,
    key: field.key,
    schema: cloneFieldSchema(field.schema),
  })),
  fieldValues: data.fieldValues.map((fieldValue): BoundaryDatabaseFieldValueRecord => ({
    fieldIndex: fieldValue.fieldIndex,
    value: structuredClone(fieldValue.value),
  })),
  fieldSources: data.fieldSources.map((fieldSource): BoundaryDatabaseFieldSourceRecord => ({
    childFieldIndex: fieldSource.childFieldIndex,
    parentFieldIndex: fieldSource.parentFieldIndex,
  })),
  entanglementBlocks: data.entanglementBlocks.map((block) => structuredClone(block)),
  entanglementBlockMembers: data.entanglementBlockMembers.map((member) => structuredClone(member)),
  entanglementFields: data.entanglementFields.map((field) => structuredClone(field)),
  entanglementFieldMembers: data.entanglementFieldMembers.map((member) => structuredClone(member)),
  stateSeedStates: data.stateSeedStates.map((state) => structuredClone(state)),
  stateSeedTransitions: data.stateSeedTransitions.map((transition) => structuredClone(transition)),
  stateSeedConditions: data.stateSeedConditions.map((condition) => structuredClone(condition)),
})

const buildBoundaryDatabaseIndexes = (data: BoundaryDatabaseData) => {
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<BoundaryDatabaseFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()

  for (const brane of data.branes) {
    braneIndexByDarkId.set(brane.darkWimpId, brane.index)
    fieldIndexByBraneAndKey.set(brane.index, new Map())
  }

  for (const field of data.fields) {
    fieldIndexByDarkId.set(field.darkFieldId, field.index)
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
    braneIndexByDarkId,
    fieldIndexByDarkId,
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

  if (type === "string") {
    return { type: FieldType.STRING_PTR }
  }

  if (type === "number") {
    return { type: FieldType.F32 }
  }

  if (type === "boolean") {
    return { type: FieldType.BOOL }
  }

  if (type.startsWith("enum<")) {
    if (!values) {
      throw new Error(`Boundary runtime field '${field.key}' is missing enum values`)
    }

    return {
      type: FieldType.U32,
      enum: structuredClone(values),
    }
  }

  if (type === "array<string>") {
    return { type: FieldType.ARRAY_PTR, elementType: "string" }
  }

  if (type === "array<number>") {
    return { type: FieldType.ARRAY_PTR, elementType: "number" }
  }

  if (type === "array<boolean>") {
    return { type: FieldType.ARRAY_PTR, elementType: "boolean" }
  }

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
    if (members) {
      members.push(member)
    } else {
      grouped.set(member.blockIndex, [member])
    }
  }
  for (const members of grouped.values()) {
    members.sort((left, right) => left.memberIndex - right.memberIndex)
  }
  return grouped
}

const groupEntanglementFields = (database: BoundaryDatabase) => {
  const grouped = new Map<number, typeof database.entanglementFields>()
  for (const seedField of database.entanglementFields) {
    const fields = grouped.get(seedField.blockIndex)
    if (fields) {
      fields.push(seedField)
    } else {
      grouped.set(seedField.blockIndex, [seedField])
    }
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
    if (members) {
      members.push(member)
    } else {
      grouped.set(member.entanglementFieldIndex, [member])
    }
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
    if (states) {
      states.push(state)
    } else {
      grouped.set(state.ownerBraneIndex, [state])
    }
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
    if (transitions) {
      transitions.push(transition)
    } else {
      grouped.set(key, [transition])
    }
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
    if (conditions) {
      conditions.push(condition)
    } else {
      grouped.set(condition.transitionSeedIndex, [condition])
    }
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
    if (existing !== undefined) {
      return existing
    }

    const runtimeFieldIndex = runtimeFields.length
    runtimeFields.push(cloneRuntimeField(mapBoundaryDatabaseFieldToRuntimeField(field)))
    runtimeFieldIndexBySignature.set(signature, runtimeFieldIndex)
    return runtimeFieldIndex
  }

  for (const seedField of [...database.entanglementFields].sort((left, right) => left.index - right.index)) {
    const representativeField = database.getFieldByDarkId(seedField.representativeDarkFieldId)
    if (!representativeField) {
      throw new Error(`Boundary runtime seed representative field missing: ${seedField.representativeDarkFieldId}`)
    }

    const runtimeFieldIndex = ensureRuntimeField(
      createSeedRuntimeFieldSignature(seedField.semanticKey, representativeField),
      representativeField,
    )

    for (const member of entanglementFieldMembers.get(seedField.index) ?? []) {
      const field = database.getFieldByDarkId(member.darkFieldId)
      if (!field) {
        throw new Error(`Boundary runtime seed member field missing: ${member.darkFieldId}`)
      }
      const existing = runtimeFieldIndexByDbFieldIndex[field.index]
      if (existing !== undefined && existing !== runtimeFieldIndex) {
        throw new Error(`Boundary runtime field index mismatch for DB field ${field.index}`)
      }
      runtimeFieldIndexByDbFieldIndex[field.index] = runtimeFieldIndex
    }
  }

  for (const field of database.fields) {
    if (runtimeFieldIndexByDbFieldIndex[field.index] !== undefined) {
      continue
    }

    const runtimeFieldIndex = ensureRuntimeField(createLocalRuntimeFieldSignature(field), field)
    runtimeFieldIndexByDbFieldIndex[field.index] = runtimeFieldIndex
  }

  return {
    runtimeFields,
    runtimeFieldIndexByDbFieldIndex,
  }
}

const prepareBoundaryEntanglementProjection = (
  database: BoundaryDatabase,
  runtimeFieldIndexByDbFieldIndex: number[],
): PreparedEntanglementProjection | undefined => {
  if (database.entanglementBlocks.length === 0) {
    return undefined
  }

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
          const representativeField = database.getFieldByDarkId(seedField.representativeDarkFieldId)
          if (!representativeField) {
            throw new Error(`Boundary runtime entanglement representative field missing: ${seedField.representativeDarkFieldId}`)
          }

          const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[representativeField.index]
          if (runtimeFieldIndex === undefined) {
            throw new Error(`Boundary runtime field index missing for representative DB field ${representativeField.index}`)
          }

          for (const member of fieldMembers.get(seedField.index) ?? []) {
            const field = database.getFieldByDarkId(member.darkFieldId)
            if (!field) {
              throw new Error(`Boundary runtime entanglement member field missing: ${member.darkFieldId}`)
            }
            if (runtimeFieldIndexByDbFieldIndex[field.index] !== runtimeFieldIndex) {
              throw new Error(`Boundary runtime entanglement member ${field.index} resolves to different runtime field`)
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
        if (transition.targetStateIndex === null) {
          return null
        }

        const rawConditions = conditionSeeds.get(transition.index) ?? []
        const conditions: Record<number, unknown> = {}

        rawConditions.forEach((condition) => {
          const dbFieldIndex = database.fieldIndexByDarkId.get(condition.darkFieldId)
          if (dbFieldIndex === undefined) {
            throw new Error(`Boundary state seed condition field missing: ${condition.darkFieldId}`)
          }

          const runtimeFieldIndex = runtimeFieldIndexByDbFieldIndex[dbFieldIndex]
          if (runtimeFieldIndex === undefined) {
            throw new Error(`Boundary runtime field missing for DB field ${dbFieldIndex}`)
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

/**
 * Подготавливает плоское состояние boundary-базы из общей DB-проекции.
 *
 * Здесь Boundary явно потребляет shared DB как входные данные сборки,
 * но сам публичный контракт базы остаётся отдельным и не совпадает с shared API.
 *
 * @param projection Общая DB-проекция, собранная из `Dark`.
 * @returns Собственное плоское состояние boundary-базы.
 */
export const prepareBoundaryDatabaseData = (projection: SharedDbProjection): BoundaryDatabaseData => ({
  rootBraneIndex: projection.rootBraneIndex,
  branes: projection.branes.map((brane): BoundaryDatabaseBraneRecord => {
    const fieldWindow = projection.fieldWindowByBraneIndex[brane.index] ?? { fieldOffset: 0, fieldCount: 0 }
    return {
      index: brane.index,
      darkWimpId: brane.darkWimpId,
      src: brane.src,
      ...(brane.name !== undefined ? { name: brane.name } : {}),
      fieldOffset: fieldWindow.fieldOffset,
      fieldCount: fieldWindow.fieldCount,
    }
  }),
  fields: projection.fields.map((field): BoundaryDatabaseFieldRecord => ({
    index: field.index,
    darkFieldId: field.darkFieldId,
    ownerBraneIndex: field.ownerBraneIndex,
    key: field.key,
    schema: cloneFieldSchema(field.schema),
  })),
  fieldValues: projection.fieldValues.map((fieldValue): BoundaryDatabaseFieldValueRecord => ({
    fieldIndex: fieldValue.fieldIndex,
    value: structuredClone(fieldValue.value),
  })),
  fieldSources: projection.fieldSources.map((fieldSource): BoundaryDatabaseFieldSourceRecord => ({
    childFieldIndex: fieldSource.childFieldIndex,
    parentFieldIndex: fieldSource.parentFieldIndex,
  })),
  entanglementBlocks: projection.entanglementBlocks.map((block) => structuredClone(block)),
  entanglementBlockMembers: projection.entanglementBlockMembers.map((member) => structuredClone(member)),
  entanglementFields: projection.entanglementFields.map((field) => structuredClone(field)),
  entanglementFieldMembers: projection.entanglementFieldMembers.map((member) => structuredClone(member)),
  stateSeedStates: projection.stateSeedStates.map((state) => structuredClone(state)),
  stateSeedTransitions: projection.stateSeedTransitions.map((transition) => structuredClone(transition)),
  stateSeedConditions: projection.stateSeedConditions.map((condition) => structuredClone(condition)),
})

/**
 * Подготавливает boundary-базу напрямую из shared/db backend API.
 *
 * @param backend Shared/db backend-handle.
 * @returns Собственное плоское состояние boundary-базы.
 */
export const prepareBoundaryDatabaseDataFromSharedDb = (backend: SharedDbBackend): BoundaryDatabaseData =>
  prepareBoundaryDatabaseData(readSharedDbProjection(backend))

/**
 * Открывает boundary-базу поверх уже подготовленного состояния.
 *
 * Handle хранит собственные копии таблиц и индексов, поэтому база остаётся отдельной
 * от shared DB-проекции и может независимо обновляться и переоткрываться.
 *
 * @param data Подготовленное состояние базы. Если не передано, открывается пустая база.
 * @returns Открытый boundary-handle для индексного доступа и минимального управления.
 */
export const openBoundaryDatabase = (data: BoundaryDatabaseData = createEmptyBoundaryDatabaseData()): BoundaryDatabase => {
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
    braneIndexByDarkId: new Map(),
    fieldIndexByDarkId: new Map(),
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

    getBraneByDarkId(darkWimpId) {
      const braneIndex = this.braneIndexByDarkId.get(darkWimpId)
      return braneIndex === undefined ? undefined : this.branes[braneIndex]
    },

    getField(fieldIndex) {
      return this.fields[fieldIndex]
    },

    getFieldByDarkId(darkFieldId) {
      const fieldIndex = this.fieldIndexByDarkId.get(darkFieldId)
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
      if (!field) {
        throw new Error(`Field index out of range: ${fieldIndex}`)
      }

      const nextValue = structuredClone(value)
      const existing = this.fieldValues[fieldIndex]

      if (existing) {
        existing.value = nextValue
        return
      }

      this.fieldValues[fieldIndex] = {
        fieldIndex: field.index,
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
    database.braneIndexByDarkId = indexes.braneIndexByDarkId
    database.fieldIndexByDarkId = indexes.fieldIndexByDarkId
    database.fieldIndexByBraneAndKey = indexes.fieldIndexByBraneAndKey
    database.fieldSourceByChildFieldIndex = indexes.fieldSourceByChildFieldIndex
    database.dependentFieldIndexesByParentFieldIndex = indexes.dependentFieldIndexesByParentFieldIndex
  }

  assignState(data)
  return database
}

/**
 * Строит boundary-базу напрямую из общей DB-проекции.
 *
 * @param projection Общая DB-проекция, полученная из `Dark`.
 * @returns Открытый boundary-handle.
 */
export const buildBoundaryDatabase = (projection: SharedDbProjection): BoundaryDatabase =>
  openBoundaryDatabase(prepareBoundaryDatabaseData(projection))

/**
 * Строит boundary-базу напрямую из shared/db backend.
 *
 * @param backend Shared/db backend-handle.
 * @returns Открытый boundary-handle.
 */
export const buildBoundaryDatabaseFromSharedDb = (backend: SharedDbBackend): BoundaryDatabase =>
  openBoundaryDatabase(prepareBoundaryDatabaseDataFromSharedDb(backend))

/**
 * Адаптирует boundary-базу в Boundary runtime input, сохраняя runtime materialization в Boundary.
 *
 * Shared/db остаётся источником табличных данных, а Boundary здесь отдельно
 * собирает runtime field registry, shared/local layout и state graph из DB-fed seeds.
 *
 * @param database Boundary-база, уже загруженная из shared/db.
 * @param options Boundary-owned runtime options.
 * @returns Boundary input-структура для существующего gravity/strong pipeline.
 */
export const prepareBoundaryWriteData = (
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

            return [
              runtimeFieldIndex,
              structuredClone(requireBoundaryDatabaseFieldValue(database, field.index).value),
            ] as [number, unknown]
          }),
        state: stateGraph.state,
        collapses: stateGraph.collapses,
      }
    }),
    ...(entanglement !== undefined ? { entanglement: structuredClone(entanglement) } : {}),
  }
}

/**
 * Готовит канонический Boundary store из boundary-базы, загруженной из shared/db.
 *
 * @param database Boundary-база, построенная на shared/db данных.
 * @param options Boundary-owned runtime options.
 * @returns Канонический prepared Boundary store.
 */
export const prepareBoundaryStoreFromDatabase = (
  database: BoundaryDatabase,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => assembleStoredBoundaryData(flattenBoundaryData(prepareBoundaryWriteData(database, options)))

/**
 * Готовит Boundary runtime input напрямую из shared/db backend.
 *
 * @param backend Shared/db backend-handle.
 * @param options Boundary-owned runtime options.
 * @returns Boundary input-структура для текущего runtime pipeline.
 */
export const prepareBoundaryWriteDataFromSharedDb = (
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => prepareBoundaryWriteData(buildBoundaryDatabaseFromSharedDb(backend), options)

/**
 * Готовит канонический Boundary store напрямую из shared/db backend.
 *
 * @param backend Shared/db backend-handle.
 * @param options Boundary-owned runtime options.
 * @returns Канонический prepared Boundary store.
 */
export const prepareBoundaryStoreFromSharedDb = (
  backend: SharedDbBackend,
  options: BoundarySharedDbRuntimeOptions = {},
): PreparedData => prepareBoundaryStoreFromDatabase(buildBoundaryDatabaseFromSharedDb(backend), options)
