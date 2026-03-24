import { createEmptySharedDbData, normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"
import type { SharedDbData } from "./db.t.ts"

export const openSharedDbMemoryBackend = (initialData: SharedDbData = createEmptySharedDbData()): SharedDbBackend => {
  let data = normalizeSharedDbData(initialData)

  return {
    requiredIndexes: sharedDbRequiredBackendIndexes,

    close() {},

    reset() {
      data = createEmptySharedDbData()
    },

    readData() {
      return normalizeSharedDbData(data)
    },

    replaceData(nextData) {
      data = normalizeSharedDbData(nextData)
    },

    writeData(nextData) {
      data = normalizeSharedDbData(nextData)
    },

    setFieldValue(wimpFieldId, value) {
      const fieldValue = data.fieldValues.find((row) => row.ownerWimpFieldId === wimpFieldId)
      if (!fieldValue) {
        throw new Error(`Field value not found for wimp field ${wimpFieldId}`)
      }

      fieldValue.value = structuredClone(value)
    },
  }
}
