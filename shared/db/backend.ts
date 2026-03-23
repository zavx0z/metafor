import type { SharedDbBackend, SharedDbBackendIndexSpec } from "./backend.t.ts"
import type {
  SharedDbBraneRecord,
  SharedDbFieldRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbProjectionIndexes,
  SharedDbTabularData,
} from "./db.t.ts"

const cloneBrane = (brane: SharedDbBraneRecord): SharedDbBraneRecord => ({
  index: brane.index,
  darkWimpId: brane.darkWimpId,
  src: brane.src,
  ...(brane.name !== undefined ? { name: brane.name } : {}),
  fieldOffset: brane.fieldOffset,
  fieldCount: brane.fieldCount,
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

const createEmptySharedDbTabularData = (): SharedDbTabularData => ({
  rootBraneIndex: 0,
  branes: [],
  fields: [],
  fieldValues: [],
  fieldSources: [],
})

const requireSequentialIndex = (
  entityName: "Brane" | "Field",
  records: Array<{ index: number }>,
): void => {
  records.forEach((record, expectedIndex) => {
    if (record.index !== expectedIndex) {
      throw new Error(`${entityName} index mismatch: expected ${expectedIndex}, got ${record.index}`)
    }
  })
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
] as const

/**
 * Нормализует и проверяет канонический табличный снимок shared/db.
 *
 * @param data Табличная форма для хранения или восстановления.
 * @returns Нормализованный и склонированный табличный снимок.
 */
export const normalizeSharedDbTabularData = (data: SharedDbTabularData): SharedDbTabularData => {
  const branes = data.branes.map(cloneBrane).sort((left, right) => left.index - right.index)
  const fields = data.fields.map(cloneField).sort((left, right) => left.index - right.index)
  requireSequentialIndex("Brane", branes)
  requireSequentialIndex("Field", fields)

  if (branes.length === 0) {
    if (data.rootBraneIndex !== 0) {
      throw new Error(`Root brane index out of range: ${data.rootBraneIndex}`)
    }
  } else if (data.rootBraneIndex < 0 || data.rootBraneIndex >= branes.length) {
    throw new Error(`Root brane index out of range: ${data.rootBraneIndex}`)
  }

  branes.forEach((brane) => {
    if (brane.fieldOffset < 0 || brane.fieldCount < 0 || brane.fieldOffset + brane.fieldCount > fields.length) {
      throw new Error(`Brane ${brane.index} field window is out of range`)
    }
  })

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
    if (fieldIndex < ownerBrane.fieldOffset || fieldIndex >= ownerBrane.fieldOffset + ownerBrane.fieldCount) {
      throw new Error(`Field ${fieldIndex} is outside owner brane ${ownerBrane.index} window`)
    }
    if (!fieldValues[fieldIndex]) {
      throw new Error(`Field value missing for field index: ${fieldIndex}`)
    }
  })

  const fieldSources = data.fieldSources.map(cloneFieldSource).sort((left, right) => left.childFieldIndex - right.childFieldIndex)
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

  return {
    rootBraneIndex: data.rootBraneIndex,
    branes,
    fields,
    fieldValues: fieldValues as SharedDbFieldValueRecord[],
    fieldSources,
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
    rootBraneIndex: projection.rootBraneIndex,
    branes: projection.branes,
    fields: projection.fields,
    fieldValues: projection.fieldValues,
    fieldSources: projection.fieldSources,
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

  return normalizeSharedDbTabularData({
    rootBraneIndex: backend.getRootBraneIndex(),
    branes,
    fields,
    fieldValues,
    fieldSources,
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
