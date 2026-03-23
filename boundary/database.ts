import type { FieldKey } from "@metafor/ast"
import type { SharedOrmProjection } from "@shared/orm"
import type {
  BoundaryDatabase,
  BoundaryDatabaseBraneRecord,
  BoundaryDatabaseData,
  BoundaryDatabaseFieldRecord,
  BoundaryDatabaseFieldSchemaRecord,
  BoundaryDatabaseFieldSourceRecord,
  BoundaryDatabaseFieldValueRecord,
} from "./database.t.ts"

type SharedOrmFieldSchema = SharedOrmProjection["fields"][number]["schema"]

const cloneFieldSchema = (
  schema: BoundaryDatabaseFieldSchemaRecord | SharedOrmFieldSchema,
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

/**
 * Подготавливает плоское состояние boundary-базы из общей ORM-проекции.
 *
 * Здесь Boundary явно потребляет shared ORM как входные данные сборки,
 * но сам публичный контракт базы остаётся отдельным и не совпадает с shared API.
 *
 * @param projection Общая ORM-проекция, собранная из `Dark`.
 * @returns Собственное плоское состояние boundary-базы.
 */
export const prepareBoundaryDatabaseData = (projection: SharedOrmProjection): BoundaryDatabaseData => ({
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
 * Открывает boundary-базу поверх уже подготовленного состояния.
 *
 * Handle хранит собственные копии таблиц и индексов, поэтому база остаётся отдельной
 * от shared ORM-проекции и может независимо обновляться и переоткрываться.
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
 * Строит boundary-базу напрямую из общей ORM-проекции.
 *
 * @param projection Общая ORM-проекция, полученная из `Dark`.
 * @returns Открытый boundary-handle.
 */
export const buildBoundaryDatabase = (projection: SharedOrmProjection): BoundaryDatabase =>
  openBoundaryDatabase(prepareBoundaryDatabaseData(projection))
