import { createEmptySharedDbData, normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend, SharedDbEntanglementRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
import type { SharedDbData } from "./db.t.ts"

const upsertRowById = <T extends { id: string }>(rows: T[], row: T): void => {
  const index = rows.findIndex((existing) => existing.id === row.id)
  if (index >= 0) {
    rows[index] = row
    return
  }

  rows.push(row)
}

const removeRowsByPredicate = <T>(rows: T[], predicate: (row: T) => boolean): void => {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (predicate(rows[index]!)) {
      rows.splice(index, 1)
    }
  }
}

const writeMetaRows = (data: SharedDbData, rows: SharedDbMetaRows): void => {
  removeRowsByPredicate(data.metas, (row) => row.id === rows.meta.id)
  removeRowsByPredicate(data.metaFields, (row) => row.ownerMetaId === rows.meta.id)
  removeRowsByPredicate(data.metaStates, (row) => row.ownerMetaId === rows.meta.id)
  removeRowsByPredicate(data.metaTransitions, (row) => rows.states.some((state) => state.id === row.ownerMetaStateId))
  removeRowsByPredicate(data.metaTransitionConditions, (row) =>
    rows.transitions.some((transition) => transition.id === row.ownerMetaTransitionId),
  )
  removeRowsByPredicate(data.metaProcesses, (row) => row.ownerMetaId === rows.meta.id)
  removeRowsByPredicate(data.metaProcessReads, (row) => rows.processes.some((process) => process.id === row.ownerMetaProcessId))
  removeRowsByPredicate(data.metaProcessWrites, (row) => rows.processes.some((process) => process.id === row.ownerMetaProcessId))
  removeRowsByPredicate(data.metaReactions, (row) => row.ownerMetaId === rows.meta.id)
  removeRowsByPredicate(data.metaReactionStates, (row) => rows.reactions.some((reaction) => reaction.id === row.ownerMetaReactionId))
  removeRowsByPredicate(data.metaReactionReads, (row) => rows.reactions.some((reaction) => reaction.id === row.ownerMetaReactionId))
  removeRowsByPredicate(data.metaReactionWrites, (row) => rows.reactions.some((reaction) => reaction.id === row.ownerMetaReactionId))
  removeRowsByPredicate(data.metaMatterNodes, (row) => row.ownerMetaId === rows.meta.id)
  removeRowsByPredicate(data.metaMatterEdges, (row) => row.ownerMetaId === rows.meta.id)

  upsertRowById(data.metas, structuredClone(rows.meta))
  rows.fields.forEach((row) => upsertRowById(data.metaFields, structuredClone(row)))
  rows.states.forEach((row) => upsertRowById(data.metaStates, structuredClone(row)))
  rows.transitions.forEach((row) => upsertRowById(data.metaTransitions, structuredClone(row)))
  rows.transitionConditions.forEach((row) => upsertRowById(data.metaTransitionConditions, structuredClone(row)))
  rows.processes.forEach((row) => upsertRowById(data.metaProcesses, structuredClone(row)))
  rows.processReads.forEach((row) => upsertRowById(data.metaProcessReads, structuredClone(row)))
  rows.processWrites.forEach((row) => upsertRowById(data.metaProcessWrites, structuredClone(row)))
  rows.reactions.forEach((row) => upsertRowById(data.metaReactions, structuredClone(row)))
  rows.reactionStates.forEach((row) => upsertRowById(data.metaReactionStates, structuredClone(row)))
  rows.reactionReads.forEach((row) => upsertRowById(data.metaReactionReads, structuredClone(row)))
  rows.reactionWrites.forEach((row) => upsertRowById(data.metaReactionWrites, structuredClone(row)))
  rows.matterNodes.forEach((row) => upsertRowById(data.metaMatterNodes, structuredClone(row)))
  rows.matterEdges.forEach((row) => upsertRowById(data.metaMatterEdges, structuredClone(row)))
}

const writeWimpRows = (data: SharedDbData, rows: SharedDbWimpRows): void => {
  removeRowsByPredicate(data.wimps, (row) => row.id === rows.wimp.id)
  removeRowsByPredicate(data.wimpFields, (row) => row.ownerWimpId === rows.wimp.id)
  removeRowsByPredicate(data.fieldValues, (row) => rows.fields.some((field) => field.id === row.ownerWimpFieldId))
  removeRowsByPredicate(data.fieldSources, (row) => rows.fields.some((field) => field.id === row.childWimpFieldId))
  removeRowsByPredicate(data.wimpStates, (row) => row.ownerWimpId === rows.wimp.id)

  upsertRowById(data.wimps, structuredClone(rows.wimp))
  rows.fields.forEach((row) => upsertRowById(data.wimpFields, structuredClone(row)))
  rows.values.forEach((row) => upsertRowById(data.fieldValues, structuredClone(row)))
  rows.sources.forEach((row) => upsertRowById(data.fieldSources, structuredClone(row)))
  upsertRowById(data.wimpStates, structuredClone(rows.state))
}

const replaceWimpEdges = (data: SharedDbData, rows: { id: string; parentWimpId: string | null; childWimpId: string; edgeOrder: number }[]): void => {
  data.wimpEdges = rows.map((row) => structuredClone(row))
}

const replaceEntanglementRows = (data: SharedDbData, rows: SharedDbEntanglementRows): void => {
  data.entanglements = rows.entanglements.map((row) => structuredClone(row))
  data.entanglementMembers = rows.members.map((row) => structuredClone(row))
  data.entanglementFields = rows.fields.map((row) => structuredClone(row))
  data.entanglementFieldMembers = rows.fieldMembers.map((row) => structuredClone(row))
}

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

    writeData(nextData) {
      data = normalizeSharedDbData(nextData)
    },

    writeMetaRows(rows) {
      const nextData = normalizeSharedDbData(data)
      writeMetaRows(nextData, rows)
      data = normalizeSharedDbData(nextData)
    },

    writeWimpRows(rows) {
      const nextData = normalizeSharedDbData(data)
      writeWimpRows(nextData, rows)
      data = normalizeSharedDbData(nextData)
    },

    replaceWimpEdges(rows) {
      const nextData = normalizeSharedDbData(data)
      replaceWimpEdges(nextData, rows)
      data = normalizeSharedDbData(nextData)
    },

    replaceEntanglementRows(rows) {
      const nextData = normalizeSharedDbData(data)
      replaceEntanglementRows(nextData, rows)
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
