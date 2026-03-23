import type { FieldKey } from "@metafor/ast"
import {
  readSharedDbProjection,
  type SharedDbBackend,
  type SharedDbFieldSchemaRecord,
  type SharedDbProjection,
} from "@shared/db"
import { FieldType, flattenBoundaryData, type Data, type Field } from "@boundary/gravity"
import { assembleStoredBoundaryData } from "@boundary/strong"
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

const createRuntimeFieldSignature = (field: BoundaryDatabaseFieldRecord): string =>
  JSON.stringify({
    key: field.key,
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
  branes: projection.branes.map((brane): BoundaryDatabaseBraneRecord => ({
    index: brane.index,
    darkWimpId: brane.darkWimpId,
    src: brane.src,
    ...(brane.name !== undefined ? { name: brane.name } : {}),
    fieldOffset: brane.fieldOffset,
    fieldCount: brane.fieldCount,
  })),
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
 * собирает runtime field registry, brane values и тривиальный state graph.
 *
 * @param database Boundary-база, уже загруженная из shared/db.
 * @param options Boundary-owned runtime options.
 * @returns Boundary input-структура для существующего gravity/strong pipeline.
 */
export const prepareBoundaryWriteData = (
  database: BoundaryDatabase,
  options: BoundarySharedDbRuntimeOptions = {},
): Data => {
  const runtimeFields: Field[] = []
  const runtimeFieldIndexByDbFieldIndex: number[] = []
  const runtimeFieldIndexBySignature = new Map<string, number>()

  for (const field of database.fields) {
    const signature = createRuntimeFieldSignature(field)
    const existingRuntimeFieldIndex = runtimeFieldIndexBySignature.get(signature)
    if (existingRuntimeFieldIndex !== undefined) {
      runtimeFieldIndexByDbFieldIndex[field.index] = existingRuntimeFieldIndex
      continue
    }

    const runtimeFieldIndex = runtimeFields.length
    runtimeFields.push(cloneRuntimeField(mapBoundaryDatabaseFieldToRuntimeField(field)))
    runtimeFieldIndexBySignature.set(signature, runtimeFieldIndex)
    runtimeFieldIndexByDbFieldIndex[field.index] = runtimeFieldIndex
  }

  return {
    fields: runtimeFields,
    branes: database.branes.map((brane) => ({
      values: database.fields
        .slice(brane.fieldOffset, brane.fieldOffset + brane.fieldCount)
        .map((field) => [
          runtimeFieldIndexByDbFieldIndex[field.index]!,
          structuredClone(requireBoundaryDatabaseFieldValue(database, field.index).value),
        ]),
      state: 0,
      collapses: [[null]],
    })),
    ...(options.entanglement !== undefined ? { entanglement: structuredClone(options.entanglement) } : {}),
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
