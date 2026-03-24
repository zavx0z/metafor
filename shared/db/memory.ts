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
import type { SharedDbProjection, SharedDbRuntimeSeedData, SharedDbTabularData } from "./db.t.ts"

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
  let tabular = "braneIndexByDarkId" in initialData ? prepareSharedDbTabularData(initialData) : initialData
  let projection = createSharedDbProjection(tabular)
  let dirty = false

  const assignData = (data: SharedDbTabularData): void => {
    tabular = structuredClone(data)
    projection = createSharedDbProjection(data)
    dirty = false
  }

  const ensureProjection = (): void => {
    if (!dirty) return
    projection = createSharedDbProjection(tabular)
    dirty = false
  }

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {},

    getRootBraneIndex() {
      ensureProjection()
      return projection.rootBraneIndex
    },

    setRootBraneIndex(braneIndex) {
      if (braneIndex !== 0) {
        throw new Error(`Shared DB root brane index is derived in memory and currently fixed to 0, got ${braneIndex}`)
      }
    },

    getRuntimeSeedData(): SharedDbRuntimeSeedData {
      ensureProjection()
      return {
        entanglementBlocks: projection.entanglementBlocks.map((block) => structuredClone(block)),
        entanglementBlockMembers: projection.entanglementBlockMembers.map((member) => structuredClone(member)),
        entanglementFields: projection.entanglementFields.map((field) => structuredClone(field)),
        entanglementFieldMembers: projection.entanglementFieldMembers.map((member) => structuredClone(member)),
        stateSeedStates: projection.stateSeedStates.map((state) => structuredClone(state)),
        stateSeedTransitions: projection.stateSeedTransitions.map((transition) => structuredClone(transition)),
        stateSeedConditions: projection.stateSeedConditions.map((condition) => structuredClone(condition)),
      }
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

    upsertBrane(brane) {
      tabular.branes[brane.index] = structuredClone(brane)
      dirty = true
    },

    upsertField(field) {
      tabular.fields[field.index] = structuredClone(field)
      dirty = true
    },

    setFieldSource(childFieldIndex, parentFieldIndex) {
      if (parentFieldIndex === null) {
        tabular.fieldSources = tabular.fieldSources.filter((fieldSource) => fieldSource.childFieldIndex !== childFieldIndex)
        dirty = true
        return
      }

      const nextFieldSource = { childFieldIndex, parentFieldIndex }
      const existingIndex = tabular.fieldSources.findIndex((fieldSource) => fieldSource.childFieldIndex === childFieldIndex)
      if (existingIndex >= 0) {
        tabular.fieldSources[existingIndex] = nextFieldSource
      } else {
        tabular.fieldSources.push(nextFieldSource)
      }
      dirty = true
    },

    replaceRuntimeSeedData(data) {
      tabular.entanglementBlocks = data.entanglementBlocks.map((block) => structuredClone(block))
      tabular.entanglementBlockMembers = data.entanglementBlockMembers.map((member) => structuredClone(member))
      tabular.entanglementFields = data.entanglementFields.map((field) => structuredClone(field))
      tabular.entanglementFieldMembers = data.entanglementFieldMembers.map((member) => structuredClone(member))
      tabular.stateSeedStates = data.stateSeedStates.map((state) => structuredClone(state))
      tabular.stateSeedTransitions = data.stateSeedTransitions.map((transition) => structuredClone(transition))
      tabular.stateSeedConditions = data.stateSeedConditions.map((condition) => structuredClone(condition))
      dirty = true
    },

    getBrane(braneIndex) {
      ensureProjection()
      const brane = getSharedDbBraneByIndex(projection, braneIndex)
      return brane ? structuredClone(brane) : undefined
    },

    getBraneByDarkId(darkWimpId) {
      ensureProjection()
      const brane = getSharedDbBraneByDarkId(projection, darkWimpId)
      return brane ? structuredClone(brane) : undefined
    },

    getField(fieldIndex) {
      ensureProjection()
      const field = getSharedDbFieldByIndex(projection, fieldIndex)
      return field ? structuredClone(field) : undefined
    },

    getFieldByDarkId(darkFieldId) {
      ensureProjection()
      const field = getSharedDbFieldByDarkId(projection, darkFieldId)
      return field ? structuredClone(field) : undefined
    },

    getFieldByKey(braneIndex, fieldKey) {
      ensureProjection()
      const field = getSharedDbFieldByKey(projection, braneIndex, fieldKey)
      return field ? structuredClone(field) : undefined
    },

    getFieldValue(fieldIndex) {
      ensureProjection()
      const fieldValue = getSharedDbFieldValue(projection, fieldIndex)
      return fieldValue ? structuredClone(fieldValue) : undefined
    },

    getFieldSource(childFieldIndex) {
      ensureProjection()
      const fieldSource = getSharedDbFieldSource(projection, childFieldIndex)
      return fieldSource ? structuredClone(fieldSource) : undefined
    },

    getDependentFields(parentFieldIndex) {
      ensureProjection()
      return getSharedDbDependentFields(projection, parentFieldIndex).map((field) => structuredClone(field))
    },

    setFieldValue(fieldIndex, value) {
      const field = tabular.fields[fieldIndex]
      if (!field) {
        throw new Error(`Field index out of range: ${fieldIndex}`)
      }

      const existing = tabular.fieldValues[fieldIndex]
      if (existing) {
        existing.value = structuredClone(value)
        dirty = true
        return
      }

      tabular.fieldValues[fieldIndex] = {
        fieldIndex,
        value: structuredClone(value),
      }
      dirty = true
    },
  }
}
