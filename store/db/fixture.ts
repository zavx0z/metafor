import type { Database } from "bun:sqlite"
import { normalizeDbData } from "./backend.ts"
import type { DbEntanglementFamilyRows, DbMetaRows, DbWimpRows } from "./backend.t.ts"
import type { DbData, DbFieldSchemaRecord } from "./db.t.ts"

const parseJson = <T = unknown>(value: string | null | undefined): T | undefined => {
  if (value === null || value === undefined) return undefined
  return JSON.parse(value) as T
}

const readFieldSchema = (row: Record<string, unknown>): DbFieldSchemaRecord => ({
  type: String(row.schemaType),
  required: Boolean(row.schemaRequired),
  topology: Boolean(row.schemaTopology),
  ...(row.schemaLabel !== null && row.schemaLabel !== undefined ? { label: String(row.schemaLabel) } : {}),
  ...(row.schemaValues !== null && row.schemaValues !== undefined
    ? { values: parseJson<readonly (string | number)[]>(String(row.schemaValues)) }
    : {}),
})

export const readDbSqliteData = (database: Database): DbData =>
  normalizeDbData({
    metas: (
      database.query(`SELECT id, src, name, bulkJson, massJson FROM metas ORDER BY id`).all() as Array<
        Record<string, unknown>
      >
    ).map((row) => ({
      id: String(row.id),
      src: String(row.src),
      ...(row.name !== null && row.name !== undefined ? { name: String(row.name) } : {}),
      ...(row.bulkJson !== null && row.bulkJson !== undefined ? { bulk: parseJson(String(row.bulkJson)) } : {}),
      ...(row.massJson !== null && row.massJson !== undefined ? { mass: parseJson(String(row.massJson)) } : {}),
    })),
    metaFields: (
      database
        .query(
          `SELECT id, ownerMetaId, fieldKey, fieldOrder, schemaType, schemaRequired, schemaTopology, schemaLabel, schemaValues
           FROM meta_fields
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      fieldKey: String(row.fieldKey),
      fieldOrder: Number(row.fieldOrder),
      schema: readFieldSchema(row),
    })),
    metaStates: (
      database
        .query(`SELECT id, ownerMetaId, stateName, stateOrder, initial FROM meta_states ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      stateName: String(row.stateName),
      stateOrder: Number(row.stateOrder),
      initial: Boolean(row.initial),
    })),
    metaTransitions: (
      database
        .query(`SELECT id, ownerMetaStateId, targetMetaStateId, transitionOrder FROM meta_transitions ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaStateId: String(row.ownerMetaStateId),
      targetMetaStateId:
        row.targetMetaStateId === null || row.targetMetaStateId === undefined ? null : String(row.targetMetaStateId),
      transitionOrder: Number(row.transitionOrder),
    })),
    metaTransitionConditions: (
      database
        .query(
          `SELECT id, ownerMetaTransitionId, metaFieldId, conditionOrder, conditionJson
           FROM meta_transition_conditions
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaTransitionId: String(row.ownerMetaTransitionId),
      metaFieldId: String(row.metaFieldId),
      conditionOrder: Number(row.conditionOrder),
      condition: parseJson(String(row.conditionJson)),
    })),
    metaProcesses: (
      database
        .query(
          `SELECT id, ownerMetaId, processKey, processOrder, processKind, label, desc,
                  actionSrc, actionImportSpecifier, actionWrapperSrc, successSrc, errorSrc, beforeSrc
           FROM meta_processes
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      processKey: String(row.processKey),
      processOrder: Number(row.processOrder),
      processKind: row.processKind === "finally" ? "finally" : "action",
      ...(row.label !== null && row.label !== undefined ? { label: String(row.label) } : {}),
      ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
      ...(row.actionSrc !== null && row.actionSrc !== undefined ? { actionSrc: String(row.actionSrc) } : {}),
      ...(row.actionImportSpecifier !== null && row.actionImportSpecifier !== undefined
        ? { actionImportSpecifier: String(row.actionImportSpecifier) }
        : {}),
      ...(row.actionWrapperSrc !== null && row.actionWrapperSrc !== undefined
        ? { actionWrapperSrc: String(row.actionWrapperSrc) }
        : {}),
      ...(row.successSrc !== null && row.successSrc !== undefined ? { successSrc: String(row.successSrc) } : {}),
      ...(row.errorSrc !== null && row.errorSrc !== undefined ? { errorSrc: String(row.errorSrc) } : {}),
      ...(row.beforeSrc !== null && row.beforeSrc !== undefined ? { beforeSrc: String(row.beforeSrc) } : {}),
    })),
    metaProcessReads: (
      database
        .query(`SELECT id, ownerMetaProcessId, metaFieldId, phase, readOrder FROM meta_process_reads ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaProcessId: String(row.ownerMetaProcessId),
      metaFieldId: String(row.metaFieldId),
      phase: String(row.phase) as "action" | "success" | "error" | "before",
      readOrder: Number(row.readOrder),
    })),
    metaProcessWrites: (
      database
        .query(`SELECT id, ownerMetaProcessId, metaFieldId, phase, writeOrder FROM meta_process_writes ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaProcessId: String(row.ownerMetaProcessId),
      metaFieldId: String(row.metaFieldId),
      phase: String(row.phase) as "success" | "error",
      writeOrder: Number(row.writeOrder),
    })),
    metaReactions: (
      database
        .query(
          `SELECT id, ownerMetaId, reactionKey, reactionOrder, label, desc, cond, src
           FROM meta_reactions
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      reactionKey: String(row.reactionKey),
      reactionOrder: Number(row.reactionOrder),
      label: String(row.label),
      ...(row.desc !== null && row.desc !== undefined ? { desc: String(row.desc) } : {}),
      cond: String(row.cond),
      src: String(row.src),
    })),
    metaReactionStates: (
      database
        .query(`SELECT id, ownerMetaReactionId, metaStateId, stateOrder FROM meta_reaction_states ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaReactionId: String(row.ownerMetaReactionId),
      metaStateId: String(row.metaStateId),
      stateOrder: Number(row.stateOrder),
    })),
    metaReactionReads: (
      database
        .query(`SELECT id, ownerMetaReactionId, metaFieldId, readOrder FROM meta_reaction_reads ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaReactionId: String(row.ownerMetaReactionId),
      metaFieldId: String(row.metaFieldId),
      readOrder: Number(row.readOrder),
    })),
    metaReactionWrites: (
      database
        .query(`SELECT id, ownerMetaReactionId, metaFieldId, writeOrder FROM meta_reaction_writes ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaReactionId: String(row.ownerMetaReactionId),
      metaFieldId: String(row.metaFieldId),
      writeOrder: Number(row.writeOrder),
    })),
    metaMatterNodes: (
      database
        .query(`SELECT id, ownerMetaId, nodeType, nodeOrder, payloadJson FROM meta_matter_nodes ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      nodeType: String(row.nodeType),
      nodeOrder: Number(row.nodeOrder),
      payload: parseJson<Record<string, unknown>>(String(row.payloadJson)) ?? {},
    })),
    metaMatterEdges: (
      database
        .query(`SELECT id, ownerMetaId, parentNodeId, childNodeId, edgeOrder FROM meta_matter_edges ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerMetaId: String(row.ownerMetaId),
      parentNodeId: row.parentNodeId === null || row.parentNodeId === undefined ? null : String(row.parentNodeId),
      childNodeId: String(row.childNodeId),
      edgeOrder: Number(row.edgeOrder),
    })),
    wimps: (
      database.query(`SELECT id, metaId, wimpOrder, massOverrideJson FROM view_wimps ORDER BY id`).all() as Array<
        Record<string, unknown>
      >
    ).map((row) => ({
      id: String(row.id),
      metaId: String(row.metaId),
      wimpOrder: Number(row.wimpOrder),
      ...(row.massOverrideJson !== null && row.massOverrideJson !== undefined
        ? { massOverride: parseJson(String(row.massOverrideJson)) }
        : {}),
    })),
    wimpFields: (
      database
        .query(`SELECT id, ownerWimpId, metaFieldId, fieldOrder FROM view_wimp_fields ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerWimpId: String(row.ownerWimpId),
      metaFieldId: String(row.metaFieldId),
      fieldOrder: Number(row.fieldOrder),
    })),
    wimpEdges: (
      database
        .query(`SELECT id, parentWimpId, childWimpId, edgeOrder FROM view_wimp_edges ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      parentWimpId: row.parentWimpId === null || row.parentWimpId === undefined ? null : String(row.parentWimpId),
      childWimpId: String(row.childWimpId),
      edgeOrder: Number(row.edgeOrder),
    })),
    fieldValues: (
      database.query(`SELECT id, ownerWimpFieldId, valueJson FROM view_field_values ORDER BY id`).all() as Array<
        Record<string, unknown>
      >
    ).map((row) => ({
      id: String(row.id),
      ownerWimpFieldId: String(row.ownerWimpFieldId),
      value: parseJson(String(row.valueJson)),
    })),
    fieldSources: (
      database
        .query(`SELECT id, childWimpFieldId, parentWimpFieldId FROM view_field_sources ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      childWimpFieldId: String(row.childWimpFieldId),
      parentWimpFieldId: String(row.parentWimpFieldId),
    })),
    wimpStates: (
      database.query(`SELECT id, ownerWimpId, metaStateId FROM view_wimp_states ORDER BY id`).all() as Array<
        Record<string, unknown>
      >
    ).map((row) => ({
      id: String(row.id),
      ownerWimpId: String(row.ownerWimpId),
      metaStateId: String(row.metaStateId),
    })),
    entanglements: (
      database.query(`SELECT id, membershipKey, provenance FROM view_entanglements ORDER BY id`).all() as Array<
        Record<string, unknown>
      >
    ).map((row) => ({
      id: String(row.id),
      membershipKey: String(row.membershipKey),
      provenance: String(row.provenance),
    })),
    entanglementMembers: (
      database
        .query(`SELECT id, ownerEntanglementId, wimpId, memberOrder FROM view_entanglement_members ORDER BY id`)
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerEntanglementId: String(row.ownerEntanglementId),
      wimpId: String(row.wimpId),
      memberOrder: Number(row.memberOrder),
    })),
    entanglementFields: (
      database
        .query(
          `SELECT id, ownerEntanglementId, fieldOrder, semanticKey, fieldName, provenance,
                  representativeWimpFieldId, payloadIdsJson, semanticKeysJson
           FROM view_entanglement_fields
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerEntanglementId: String(row.ownerEntanglementId),
      fieldOrder: Number(row.fieldOrder),
      semanticKey: String(row.semanticKey),
      fieldName: String(row.fieldName),
      provenance: String(row.provenance),
      representativeWimpFieldId: String(row.representativeWimpFieldId),
      payloadIds: parseJson<string[]>(String(row.payloadIdsJson)) ?? [],
      semanticKeys: parseJson<string[]>(String(row.semanticKeysJson)) ?? [],
    })),
    entanglementFieldMembers: (
      database
        .query(
          `SELECT id, ownerEntanglementFieldId, ownerWimpId, wimpFieldId, memberOrder
           FROM view_entanglement_field_members
           ORDER BY id`,
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id),
      ownerEntanglementFieldId: String(row.ownerEntanglementFieldId),
      ownerWimpId: String(row.ownerWimpId),
      wimpFieldId: String(row.wimpFieldId),
      memberOrder: Number(row.memberOrder),
    })),
  })

export const selectDbMetaRows = (data: DbData, metaId: string): DbMetaRows | null => {
  const meta = data.metas.find((row) => row.id === metaId)
  if (!meta) return null

  const states = data.metaStates.filter((row) => row.ownerMetaId === metaId)
  const stateIds = new Set(states.map((row) => row.id))
  const transitions = data.metaTransitions.filter((row) => stateIds.has(row.ownerMetaStateId))
  const transitionIds = new Set(transitions.map((row) => row.id))
  const processes = data.metaProcesses.filter((row) => row.ownerMetaId === metaId)
  const processIds = new Set(processes.map((row) => row.id))
  const reactions = data.metaReactions.filter((row) => row.ownerMetaId === metaId)
  const reactionIds = new Set(reactions.map((row) => row.id))

  return {
    meta,
    fields: data.metaFields.filter((row) => row.ownerMetaId === metaId),
    states,
    transitions,
    transitionConditions: data.metaTransitionConditions.filter((row) => transitionIds.has(row.ownerMetaTransitionId)),
    processes,
    processReads: data.metaProcessReads.filter((row) => processIds.has(row.ownerMetaProcessId)),
    processWrites: data.metaProcessWrites.filter((row) => processIds.has(row.ownerMetaProcessId)),
    reactions,
    reactionStates: data.metaReactionStates.filter((row) => reactionIds.has(row.ownerMetaReactionId)),
    reactionReads: data.metaReactionReads.filter((row) => reactionIds.has(row.ownerMetaReactionId)),
    reactionWrites: data.metaReactionWrites.filter((row) => reactionIds.has(row.ownerMetaReactionId)),
    matterNodes: data.metaMatterNodes.filter((row) => row.ownerMetaId === metaId),
    matterEdges: data.metaMatterEdges.filter((row) => row.ownerMetaId === metaId),
  }
}

export const selectDbWimpRows = (data: DbData, wimpId: string): DbWimpRows | null => {
  const wimp = data.wimps.find((row) => row.id === wimpId)
  if (!wimp) return null

  const fields = data.wimpFields.filter((row) => row.ownerWimpId === wimpId)
  const fieldIds = new Set(fields.map((row) => row.id))
  const state = data.wimpStates.find((row) => row.ownerWimpId === wimpId)
  if (!state) {
    throw new Error(`Wimp ${wimpId} is missing wimp_state row`)
  }

  return {
    wimp,
    fields,
    values: data.fieldValues.filter((row) => fieldIds.has(row.ownerWimpFieldId)),
    sources: data.fieldSources.filter((row) => fieldIds.has(row.childWimpFieldId)),
    state,
  }
}

export const selectDbFieldValue = (data: DbData, wimpFieldId: string) =>
  data.fieldValues.find((row) => row.ownerWimpFieldId === wimpFieldId) ?? null

export const selectDbEntanglementFamilyRows = (data: DbData, entanglementId: string): DbEntanglementFamilyRows | null => {
  const entanglement = data.entanglements.find((row) => row.id === entanglementId)
  if (!entanglement) return null

  const field = data.entanglementFields.find((row) => row.ownerEntanglementId === entanglementId)
  if (!field) {
    throw new Error(`Entanglement ${entanglementId} is missing entanglement_field rows`)
  }

  return {
    entanglement,
    members: data.entanglementMembers.filter((row) => row.ownerEntanglementId === entanglementId),
    field,
    fieldMembers: data.entanglementFieldMembers.filter((row) => row.ownerEntanglementFieldId === field.id),
  }
}
