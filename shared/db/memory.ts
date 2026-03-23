import {
  createEmptySharedDbTabularSnapshot,
  createSharedDbProjection,
  prepareSharedDbTabularData,
  sharedDbRequiredBackendIndexes,
} from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"
import {
  getSharedDbBraneByDarkId,
  getSharedDbBraneByIndex,
  getSharedDbDependentFields,
  getSharedDbFieldByDarkId,
  getSharedDbFieldByIndex,
  getSharedDbFieldByKey,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
} from "./db.ts"
import type { SharedDbProjection, SharedDbTabularData } from "./db.t.ts"

/**
 * Открывает reference backend поверх in-memory shared/db snapshot.
 *
 * Он нужен для фиксации backend-контракта и тестов без SQLite-зависимости.
 *
 * @param initialData Начальный табличный снимок или полная проекция.
 * @returns Shared/db backend-handle с тем же минимальным API, что и у SQL backend.
 */
export const openSharedDbMemoryBackend = (
  initialData: SharedDbTabularData | SharedDbProjection = createEmptySharedDbTabularSnapshot(),
): SharedDbBackend => {
  let projection = createSharedDbProjection(
    "braneIndexByDarkId" in initialData ? prepareSharedDbTabularData(initialData) : initialData,
  )

  const assignData = (data: SharedDbTabularData): void => {
    projection = createSharedDbProjection(data)
  }

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {},

    getRootBraneIndex() {
      return projection.rootBraneIndex
    },

    reset() {
      assignData(createEmptySharedDbTabularSnapshot())
    },

    replaceData(data) {
      assignData(data)
    },

    writeProjection(nextProjection) {
      assignData(prepareSharedDbTabularData(nextProjection))
    },

    getBrane(braneIndex) {
      const brane = getSharedDbBraneByIndex(projection, braneIndex)
      return brane ? structuredClone(brane) : undefined
    },

    getBraneByDarkId(darkWimpId) {
      const brane = getSharedDbBraneByDarkId(projection, darkWimpId)
      return brane ? structuredClone(brane) : undefined
    },

    getField(fieldIndex) {
      const field = getSharedDbFieldByIndex(projection, fieldIndex)
      return field ? structuredClone(field) : undefined
    },

    getFieldByDarkId(darkFieldId) {
      const field = getSharedDbFieldByDarkId(projection, darkFieldId)
      return field ? structuredClone(field) : undefined
    },

    getFieldByKey(braneIndex, fieldKey) {
      const field = getSharedDbFieldByKey(projection, braneIndex, fieldKey)
      return field ? structuredClone(field) : undefined
    },

    getFieldValue(fieldIndex) {
      const fieldValue = getSharedDbFieldValue(projection, fieldIndex)
      return fieldValue ? structuredClone(fieldValue) : undefined
    },

    getFieldSource(childFieldIndex) {
      const fieldSource = getSharedDbFieldSource(projection, childFieldIndex)
      return fieldSource ? structuredClone(fieldSource) : undefined
    },

    getDependentFields(parentFieldIndex) {
      return getSharedDbDependentFields(projection, parentFieldIndex).map((field) => structuredClone(field))
    },

    setFieldValue(fieldIndex, value) {
      const field = getSharedDbFieldByIndex(projection, fieldIndex)
      if (!field) {
        throw new Error(`Field index out of range: ${fieldIndex}`)
      }

      const existing = projection.fieldValues[fieldIndex]
      if (existing) {
        existing.value = structuredClone(value)
        return
      }

      projection.fieldValues[fieldIndex] = {
        fieldIndex,
        value: structuredClone(value),
      }
    },
  }
}
