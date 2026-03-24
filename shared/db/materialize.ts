import type { FieldKey, MetaAST, MetaJson, ReactionDefinitionJson } from "@metafor/ast"
import type {
  SharedDbData,
  SharedDbEntanglementFieldMemberRecord,
  SharedDbEntanglementFieldRecord,
  SharedDbEntanglementMemberRecord,
  SharedDbEntanglementRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbMetaFieldRecord,
  SharedDbMetaMatterEdgeRecord,
  SharedDbMetaMatterNodeRecord,
  SharedDbMetaProcessReadRecord,
  SharedDbMetaProcessRecord,
  SharedDbMetaProcessWriteRecord,
  SharedDbMetaReactionReadRecord,
  SharedDbMetaReactionRecord,
  SharedDbMetaReactionStateRecord,
  SharedDbMetaReactionWriteRecord,
  SharedDbMetaRecord,
  SharedDbMetaStateRecord,
  SharedDbMetaTransitionConditionRecord,
  SharedDbMetaTransitionRecord,
  SharedDbWimpEdgeRecord,
  SharedDbWimpFieldRecord,
  SharedDbWimpRecord,
  SharedDbWimpStateRecord,
} from "./db.t.ts"
import type { SharedDbBackend, SharedDbEntanglementFamilyRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
import { createEmptySharedDbData, normalizeSharedDbData } from "./backend.ts"
import { deriveUuid } from "./uuid.ts"

export interface SharedDbMetaFieldBundle {
  id: string
  key: FieldKey
  schema: SharedDbFieldSchemaRecord
}

export interface SharedDbMetaBundle {
  id: string
  src: string
  name?: string
  fields: SharedDbMetaFieldBundle[]
  superposition?: MetaAST["superposition"]
  processes?: MetaAST["processes"]
  reactions?: MetaAST["reactions"]
  matter?: MetaAST["matter"]
  bulk?: MetaAST["bulk"]
  mass?: MetaAST["mass"]
}

export interface SharedDbWimpFieldBundle {
  id: string
  metaFieldId: string
  fieldOrder: number
  key: FieldKey
  schema: SharedDbFieldSchemaRecord
  value: unknown
  sourceWimpFieldId?: string
}

export interface SharedDbWimpBundle {
  id: string
  parentWimpId?: string
  meta: SharedDbMetaBundle
  fields: SharedDbWimpFieldBundle[]
  massOverride?: unknown
}

export interface SharedDbMaterializationWriter {
  saveWimpBundle(bundle: SharedDbWimpBundle): void
}

type MetaContext = {
  fieldIdByKey: Map<FieldKey, string>
  stateIdByName: Map<string, string>
  initialStateId: string
}

type WimpFieldWithOwner = SharedDbWimpFieldBundle & { ownerWimpId: string }

type MetaMaterializationState = {
  nextMatterNodeOrder: number
}

type SavedFieldState = {
  id: string
  ownerWimpId: string
  metaFieldId: string
  key: FieldKey
  fieldOrder: number
  rootFieldId: string
  sourceWimpFieldId?: string
}

type EntanglementFamilyState = {
  rootFieldId: string
  representativeFieldId: string
  representativeFieldName: FieldKey
  members: SavedFieldState[]
}

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")

const cloneFieldSchema = (schema: SharedDbFieldSchemaRecord): SharedDbFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required,
  topology: schema.topology,
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const cloneMetaFieldBundle = (field: SharedDbMetaFieldBundle): SharedDbMetaFieldBundle => ({
  id: field.id,
  key: field.key,
  schema: cloneFieldSchema(field.schema),
})

const cloneMetaBundle = (meta: SharedDbMetaBundle): SharedDbMetaBundle => ({
  id: meta.id,
  src: meta.src,
  ...(meta.name !== undefined ? { name: meta.name } : {}),
  fields: meta.fields.map(cloneMetaFieldBundle),
  ...(meta.superposition !== undefined ? { superposition: structuredClone(meta.superposition) } : {}),
  ...(meta.processes !== undefined ? { processes: structuredClone(meta.processes) } : {}),
  ...(meta.reactions !== undefined ? { reactions: structuredClone(meta.reactions) } : {}),
  ...(meta.matter !== undefined ? { matter: structuredClone(meta.matter) } : {}),
  ...(meta.bulk !== undefined ? { bulk: structuredClone(meta.bulk) } : {}),
  ...(meta.mass !== undefined ? { mass: structuredClone(meta.mass) } : {}),
})

const cloneWimpFieldBundle = (field: SharedDbWimpFieldBundle): SharedDbWimpFieldBundle => ({
  id: field.id,
  metaFieldId: field.metaFieldId,
  fieldOrder: field.fieldOrder,
  key: field.key,
  schema: cloneFieldSchema(field.schema),
  value: structuredClone(field.value),
  ...(field.sourceWimpFieldId !== undefined ? { sourceWimpFieldId: field.sourceWimpFieldId } : {}),
})

const cloneWimpBundle = (bundle: SharedDbWimpBundle): SharedDbWimpBundle => ({
  id: bundle.id,
  ...(bundle.parentWimpId !== undefined ? { parentWimpId: bundle.parentWimpId } : {}),
  meta: cloneMetaBundle(bundle.meta),
  fields: bundle.fields.map(cloneWimpFieldBundle),
  ...(bundle.massOverride !== undefined ? { massOverride: structuredClone(bundle.massOverride) } : {}),
})

const createDefaultSuperposition = (): NonNullable<SharedDbMetaBundle["superposition"]> => ({
  default: null,
})

const resolveMetaStateGraph = (meta: SharedDbMetaBundle): NonNullable<SharedDbMetaBundle["superposition"]> =>
  meta.superposition && Object.keys(meta.superposition).length > 0
    ? structuredClone(meta.superposition)
    : createDefaultSuperposition()

const requireMetaFieldId = (context: MetaContext, ownerMetaId: string, fieldKey: FieldKey): string => {
  const metaFieldId = context.fieldIdByKey.get(fieldKey)
  if (!metaFieldId) {
    throw new Error(`Shared DB meta ${ownerMetaId} references unknown field key '${fieldKey}'`)
  }
  return metaFieldId
}

const appendMetaMatter = (
  data: SharedDbData,
  ownerMetaId: string,
  nodes: SharedDbMetaBundle["matter"],
  state: MetaMaterializationState,
  parentNodeId: string | null = null,
  path: number[] = [],
): void => {
  if (!nodes) return

  nodes.forEach((rawNode, edgeOrder) => {
    const node = structuredClone(rawNode)
    const nextPath = [...path, edgeOrder]
    const nodeId = deriveUuid("meta-matter-node", ownerMetaId, nextPath.join("."))
    const { child, ...payload } = node as Record<string, unknown> & { child?: SharedDbMetaBundle["matter"] }

    data.metaMatterNodes.push({
      id: nodeId,
      ownerMetaId,
      nodeType: String(node.type),
      nodeOrder: state.nextMatterNodeOrder,
      payload,
    })
    state.nextMatterNodeOrder += 1

    data.metaMatterEdges.push({
      id: deriveUuid("meta-matter-edge", ownerMetaId, parentNodeId ?? "root", nodeId, edgeOrder),
      ownerMetaId,
      parentNodeId,
      childNodeId: nodeId,
      edgeOrder,
    })

    if (Array.isArray(child) && child.length > 0) {
      appendMetaMatter(data, ownerMetaId, child, state, nodeId, nextPath)
    }
  })
}

const appendMetaProcesses = (data: SharedDbData, meta: SharedDbMetaBundle, context: MetaContext): void => {
  const processes = Object.entries(meta.processes ?? {})

  processes.forEach(([processKey, process], processOrder) => {
    const record: SharedDbMetaProcessRecord = {
      id: deriveUuid("meta-process", meta.id, processKey, processOrder),
      ownerMetaId: meta.id,
      processKey,
      processOrder,
      processKind: process.type,
      ...(process.label !== undefined ? { label: process.label } : {}),
      ...(process.desc !== undefined ? { desc: process.desc } : {}),
      ...(process.action?.src !== undefined ? { actionSrc: process.action.src } : {}),
      ...(process.action?.importSpecifier !== undefined ? { actionImportSpecifier: process.action.importSpecifier } : {}),
      ...(process.success?.src !== undefined ? { successSrc: process.success.src } : {}),
      ...(process.error?.src !== undefined ? { errorSrc: process.error.src } : {}),
      ...(process.before?.src !== undefined ? { beforeSrc: process.before.src } : {}),
    }

    data.metaProcesses.push(record)

    const appendReads = (phase: SharedDbMetaProcessReadRecord["phase"], reads: MetaJson[keyof MetaJson] | undefined): void => {
      if (!reads || typeof reads !== "object" || !("read" in reads) || !Array.isArray(reads.read)) return

      reads.read.forEach((fieldKey, readOrder) => {
        data.metaProcessReads.push({
          id: deriveUuid("meta-process-read", record.id, phase, fieldKey, readOrder),
          ownerMetaProcessId: record.id,
          metaFieldId: requireMetaFieldId(context, meta.id, fieldKey),
          phase,
          readOrder,
        })
      })
    }

    const appendWrites = (
      phase: SharedDbMetaProcessWriteRecord["phase"],
      writes: MetaJson[keyof MetaJson] | undefined,
    ): void => {
      if (!writes || typeof writes !== "object" || !("write" in writes) || !Array.isArray(writes.write)) return

      writes.write.forEach((fieldKey, writeOrder) => {
        data.metaProcessWrites.push({
          id: deriveUuid("meta-process-write", record.id, phase, fieldKey, writeOrder),
          ownerMetaProcessId: record.id,
          metaFieldId: requireMetaFieldId(context, meta.id, fieldKey),
          phase,
          writeOrder,
        })
      })
    }

    appendReads("action", process.action)
    appendReads("success", process.success)
    appendReads("error", process.error)
    appendReads("before", process.before)
    appendWrites("success", process.success)
    appendWrites("error", process.error)
  })
}

const appendMetaReactions = (data: SharedDbData, meta: SharedDbMetaBundle, context: MetaContext): void => {
  if (!meta.reactions) return

  const reactionDefinitions = Object.entries(meta.reactions.reactions ?? {})
  const reactionIdByKey = new Map<string, string>()

  reactionDefinitions.forEach(([reactionKey, reaction], reactionOrder) => {
    const record: SharedDbMetaReactionRecord = {
      id: deriveUuid("meta-reaction", meta.id, reactionKey, reactionOrder),
      ownerMetaId: meta.id,
      reactionKey,
      reactionOrder,
      label: reaction.label,
      cond: reaction.cond,
      src: reaction.src,
      ...(reaction.desc !== undefined ? { desc: reaction.desc } : {}),
    }

    reactionIdByKey.set(reactionKey, record.id)
    data.metaReactions.push(record)

    reaction.read?.forEach((fieldKey, readOrder) => {
      data.metaReactionReads.push({
        id: deriveUuid("meta-reaction-read", record.id, fieldKey, readOrder),
        ownerMetaReactionId: record.id,
        metaFieldId: requireMetaFieldId(context, meta.id, fieldKey),
        readOrder,
      })
    })

    reaction.write?.forEach((fieldKey, writeOrder) => {
      data.metaReactionWrites.push({
        id: deriveUuid("meta-reaction-write", record.id, fieldKey, writeOrder),
        ownerMetaReactionId: record.id,
        metaFieldId: requireMetaFieldId(context, meta.id, fieldKey),
        writeOrder,
      })
    })
  })

  Object.entries(meta.reactions.superposition ?? {}).forEach(([stateName, reactionKeys]) => {
    const metaStateId = context.stateIdByName.get(stateName)
    if (!metaStateId) {
      throw new Error(`Shared DB meta ${meta.id} reaction state '${stateName}' is not defined in superposition`)
    }

    reactionKeys.forEach((reactionKey, stateOrder) => {
      const reactionId = reactionIdByKey.get(reactionKey)
      if (!reactionId) {
        throw new Error(`Shared DB meta ${meta.id} reaction '${reactionKey}' is not declared`)
      }

      data.metaReactionStates.push({
        id: deriveUuid("meta-reaction-state", reactionId, metaStateId, stateOrder),
        ownerMetaReactionId: reactionId,
        metaStateId,
        stateOrder,
      })
    })
  })
}

const materializeMetaRows = (meta: SharedDbMetaBundle): { rows: SharedDbMetaRows; context: MetaContext } => {
  const data = createEmptySharedDbData()

  data.metas.push({
    id: meta.id,
    src: meta.src,
    ...(meta.name !== undefined ? { name: meta.name } : {}),
    ...(meta.bulk !== undefined ? { bulk: structuredClone(meta.bulk) } : {}),
    ...(meta.mass !== undefined ? { mass: structuredClone(meta.mass) } : {}),
  })

  const fieldIdByKey = new Map<FieldKey, string>()
  meta.fields.forEach((field, fieldOrder) => {
    const record: SharedDbMetaFieldRecord = {
      id: field.id,
      ownerMetaId: meta.id,
      fieldKey: field.key,
      fieldOrder,
      schema: cloneFieldSchema(field.schema),
    }
    data.metaFields.push(record)
    fieldIdByKey.set(field.key, field.id)
  })

  const stateIdByName = new Map<string, string>()
  const superposition = resolveMetaStateGraph(meta)
  Object.keys(superposition).forEach((stateName, stateOrder) => {
    const record: SharedDbMetaStateRecord = {
      id: deriveUuid("meta-state", meta.id, stateName, stateOrder),
      ownerMetaId: meta.id,
      stateName,
      stateOrder,
      initial: stateOrder === 0,
    }
    data.metaStates.push(record)
    stateIdByName.set(stateName, record.id)
  })

  Object.entries(superposition).forEach(([stateName, transitions]) => {
    const ownerMetaStateId = stateIdByName.get(stateName)
    if (!ownerMetaStateId) {
      throw new Error(`Shared DB meta ${meta.id} state '${stateName}' is missing after normalization`)
    }

    if (transitions === null) return

    Object.entries(transitions).forEach(([targetStateName, conditions], transitionOrder) => {
      const targetMetaStateId = stateIdByName.get(targetStateName) ?? null
      if (!targetMetaStateId) {
        throw new Error(`Shared DB meta ${meta.id} transition target '${targetStateName}' is not declared`)
      }

      const transitionRecord: SharedDbMetaTransitionRecord = {
        id: deriveUuid("meta-transition", ownerMetaStateId, targetMetaStateId, transitionOrder),
        ownerMetaStateId,
        targetMetaStateId,
        transitionOrder,
      }
      data.metaTransitions.push(transitionRecord)

      Object.entries(conditions ?? {}).forEach(([fieldKey, condition], conditionOrder) => {
        data.metaTransitionConditions.push({
          id: deriveUuid("meta-transition-condition", transitionRecord.id, fieldKey, conditionOrder),
          ownerMetaTransitionId: transitionRecord.id,
          metaFieldId: requireMetaFieldId({ fieldIdByKey, stateIdByName, initialStateId: "" }, meta.id, fieldKey),
          conditionOrder,
          condition: structuredClone(condition),
        })
      })
    })
  })

  const initialStateId = data.metaStates.find((state) => state.ownerMetaId === meta.id && state.initial)?.id
  if (!initialStateId) {
    throw new Error(`Shared DB meta ${meta.id} has no initial state`)
  }

  const context: MetaContext = { fieldIdByKey, stateIdByName, initialStateId }
  appendMetaProcesses(data, meta, context)
  appendMetaReactions(data, meta, context)
  appendMetaMatter(data, meta.id, meta.matter, { nextMatterNodeOrder: 0 })

  return {
    rows: {
      meta: data.metas[0]!,
      fields: data.metaFields,
      states: data.metaStates,
      transitions: data.metaTransitions,
      transitionConditions: data.metaTransitionConditions,
      processes: data.metaProcesses,
      processReads: data.metaProcessReads,
      processWrites: data.metaProcessWrites,
      reactions: data.metaReactions,
      reactionStates: data.metaReactionStates,
      reactionReads: data.metaReactionReads,
      reactionWrites: data.metaReactionWrites,
      matterNodes: data.metaMatterNodes,
      matterEdges: data.metaMatterEdges,
    },
    context,
  }
}

const resolveSourceRoot = (
  field: WimpFieldWithOwner,
  fieldById: Map<string, WimpFieldWithOwner>,
): WimpFieldWithOwner => {
  let current = field
  const seen = new Set<string>()

  while (current.sourceWimpFieldId && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = fieldById.get(current.sourceWimpFieldId)
    if (!parent) break
    current = parent
  }

  return current
}

const createEntanglementId = (rootFieldId: string): string => deriveUuid("entanglement-family", rootFieldId)

const createEntanglementFieldId = (rootFieldId: string): string => deriveUuid("entanglement-family-field", rootFieldId)

const materializeEntanglementFamilyRows = (
  rootFieldId: string,
  representative: Pick<WimpFieldWithOwner | SavedFieldState, "id" | "key">,
  rawMembers: Array<WimpFieldWithOwner | SavedFieldState>,
  wimpOrderById: Map<string, number>,
): SharedDbEntanglementFamilyRows => {
  const members = Array.from(new Map(rawMembers.map((field) => [field.id, field] as const)).values()).sort(
    (left, right) =>
      (wimpOrderById.get(left.ownerWimpId) ?? Number.MAX_SAFE_INTEGER) -
        (wimpOrderById.get(right.ownerWimpId) ?? Number.MAX_SAFE_INTEGER) || left.fieldOrder - right.fieldOrder,
  )

  const distinctWimpIds = Array.from(new Set(members.map((member) => member.ownerWimpId)))
  const entanglementId = createEntanglementId(rootFieldId)
  const entanglementFieldId = createEntanglementFieldId(rootFieldId)

  return {
    entanglement: {
      id: entanglementId,
      membershipKey: distinctWimpIds.join(","),
      provenance: "wimp-field-source-family",
    },
    members: distinctWimpIds.map((wimpId, memberOrder) => ({
      id: deriveUuid("entanglement-member", entanglementId, wimpId, memberOrder),
      ownerEntanglementId: entanglementId,
      wimpId,
      memberOrder,
    })),
    field: {
      id: entanglementFieldId,
      ownerEntanglementId: entanglementId,
      fieldOrder: 0,
      semanticKey: representative.id,
      fieldName: representative.key,
      provenance: "wimp-field-source-family",
      representativeWimpFieldId: representative.id,
      payloadIds: members.map((member) => member.id).sort(),
      semanticKeys: Array.from(new Set(members.map((member) => member.metaFieldId))).sort(),
    },
    fieldMembers: members.map((member, memberOrder) => ({
      id: deriveUuid("entanglement-field-member", entanglementFieldId, member.id, memberOrder),
      ownerEntanglementFieldId: entanglementFieldId,
      ownerWimpId: member.ownerWimpId,
      wimpFieldId: member.id,
      memberOrder,
    })),
  }
}

const applyEntanglementFamilyRowsToData = (data: SharedDbData, rows: SharedDbEntanglementFamilyRows): void => {
  data.entanglements.push(structuredClone(rows.entanglement))
  data.entanglementMembers.push(...rows.members.map((row) => structuredClone(row)))
  data.entanglementFields.push(structuredClone(rows.field))
  data.entanglementFieldMembers.push(...rows.fieldMembers.map((row) => structuredClone(row)))
}

const appendEntanglements = (
  data: SharedDbData,
  orderedBundles: SharedDbWimpBundle[],
): void => {
  const wimpOrderById = new Map(orderedBundles.map((bundle, wimpOrder) => [bundle.id, wimpOrder] as const))
  const allFields = orderedBundles.flatMap((bundle) =>
    bundle.fields.map((field) => ({
      ...cloneWimpFieldBundle(field),
      ownerWimpId: bundle.id,
    })),
  )
  const fieldById = new Map(allFields.map((field) => [field.id, field] as const))
  const familyMembersByRootFieldId = new Map<string, WimpFieldWithOwner[]>()

  for (const field of allFields) {
    const rootField = resolveSourceRoot(field, fieldById)
    const family = familyMembersByRootFieldId.get(rootField.id)
    if (family) {
      family.push(field)
    } else {
      familyMembersByRootFieldId.set(rootField.id, [field])
    }
  }

  for (const [rootFieldId, rawMembers] of familyMembersByRootFieldId) {
    const representative = rawMembers.find((member) => member.id === rootFieldId) ?? rawMembers[0]
    if (!representative) continue

    applyEntanglementFamilyRowsToData(
      data,
      materializeEntanglementFamilyRows(rootFieldId, representative, rawMembers, wimpOrderById),
    )
  }
}

const materializeWimpRows = (
  bundle: SharedDbWimpBundle,
  wimpOrder: number,
  metaContext: MetaContext,
): SharedDbWimpRows => {
  const fields = bundle.fields
    .slice()
    .sort((left, right) => left.fieldOrder - right.fieldOrder)
    .map((field): SharedDbWimpFieldRecord => {
      const metaFieldId = metaContext.fieldIdByKey.get(field.key)
      if (metaFieldId !== field.metaFieldId) {
        throw new Error(
          `Shared DB wimp field ${field.id} does not match meta field mapping for key '${field.key}' in meta ${bundle.meta.id}`,
        )
      }

      return {
        id: field.id,
        ownerWimpId: bundle.id,
        metaFieldId: field.metaFieldId,
        fieldOrder: field.fieldOrder,
      }
    })

  return {
    wimp: {
      id: bundle.id,
      metaId: bundle.meta.id,
      wimpOrder,
      ...(bundle.massOverride !== undefined ? { massOverride: structuredClone(bundle.massOverride) } : {}),
    },
    fields,
    values: bundle.fields.map((field): SharedDbFieldValueRecord => ({
      id: deriveUuid("field-value", field.id),
      ownerWimpFieldId: field.id,
      value: structuredClone(field.value),
    })),
    sources: bundle.fields
      .filter((field) => field.sourceWimpFieldId !== undefined)
      .map((field): SharedDbFieldSourceRecord => ({
        id: deriveUuid("field-source", field.id, field.sourceWimpFieldId!),
        childWimpFieldId: field.id,
        parentWimpFieldId: field.sourceWimpFieldId!,
      })),
    state: {
      id: deriveUuid("wimp-state", bundle.id),
      ownerWimpId: bundle.id,
      metaStateId: metaContext.initialStateId,
    },
  }
}

const buildWimpEdges = (orderedBundles: SharedDbWimpBundle[]): SharedDbWimpEdgeRecord[] => {
  const childBundlesByParentId = new Map<string | null, SharedDbWimpBundle[]>()
  orderedBundles.forEach((bundle) => {
    const key = bundle.parentWimpId ?? null
    const children = childBundlesByParentId.get(key)
    if (children) children.push(bundle)
    else childBundlesByParentId.set(key, [bundle])
  })

  const edges: SharedDbWimpEdgeRecord[] = []
  for (const [parentWimpId, childBundles] of childBundlesByParentId) {
    childBundles.forEach((bundle, edgeOrder) => {
      edges.push({
        id: deriveUuid("wimp-edge", parentWimpId ?? "root", bundle.id),
        parentWimpId,
        childWimpId: bundle.id,
        edgeOrder,
      })
    })
  }

  return edges
}

const buildEntanglementFamilies = (orderedBundles: SharedDbWimpBundle[]): SharedDbEntanglementFamilyRows[] => {
  const wimpOrderById = new Map(orderedBundles.map((bundle, wimpOrder) => [bundle.id, wimpOrder] as const))
  const allFields = orderedBundles.flatMap((bundle) =>
    bundle.fields.map((field) => ({
      ...cloneWimpFieldBundle(field),
      ownerWimpId: bundle.id,
    })),
  )
  const fieldById = new Map(allFields.map((field) => [field.id, field] as const))
  const familyMembersByRootFieldId = new Map<string, WimpFieldWithOwner[]>()

  for (const field of allFields) {
    const rootField = resolveSourceRoot(field, fieldById)
    const family = familyMembersByRootFieldId.get(rootField.id)
    if (family) family.push(field)
    else familyMembersByRootFieldId.set(rootField.id, [field])
  }

  return Array.from(familyMembersByRootFieldId.entries()).map(([rootFieldId, rawMembers]) => {
    const representative = rawMembers.find((member) => member.id === rootFieldId) ?? rawMembers[0]
    if (!representative) {
      throw new Error(`Shared DB entanglement family ${rootFieldId} has no representative field`)
    }

    return materializeEntanglementFamilyRows(rootFieldId, representative, rawMembers, wimpOrderById)
  })
}

const applyMetaRowsToData = (data: SharedDbData, rows: SharedDbMetaRows): void => {
  data.metas.push(structuredClone(rows.meta))
  data.metaFields.push(...rows.fields.map((row) => structuredClone(row)))
  data.metaStates.push(...rows.states.map((row) => structuredClone(row)))
  data.metaTransitions.push(...rows.transitions.map((row) => structuredClone(row)))
  data.metaTransitionConditions.push(...rows.transitionConditions.map((row) => structuredClone(row)))
  data.metaProcesses.push(...rows.processes.map((row) => structuredClone(row)))
  data.metaProcessReads.push(...rows.processReads.map((row) => structuredClone(row)))
  data.metaProcessWrites.push(...rows.processWrites.map((row) => structuredClone(row)))
  data.metaReactions.push(...rows.reactions.map((row) => structuredClone(row)))
  data.metaReactionStates.push(...rows.reactionStates.map((row) => structuredClone(row)))
  data.metaReactionReads.push(...rows.reactionReads.map((row) => structuredClone(row)))
  data.metaReactionWrites.push(...rows.reactionWrites.map((row) => structuredClone(row)))
  data.metaMatterNodes.push(...rows.matterNodes.map((row) => structuredClone(row)))
  data.metaMatterEdges.push(...rows.matterEdges.map((row) => structuredClone(row)))
}

const applyWimpRowsToData = (data: SharedDbData, rows: SharedDbWimpRows): void => {
  data.wimps.push(structuredClone(rows.wimp))
  data.wimpFields.push(...rows.fields.map((row) => structuredClone(row)))
  data.fieldValues.push(...rows.values.map((row) => structuredClone(row)))
  data.fieldSources.push(...rows.sources.map((row) => structuredClone(row)))
  data.wimpStates.push(structuredClone(rows.state))
}

const createMetaSignature = (meta: SharedDbMetaBundle): string => JSON.stringify(cloneMetaBundle(meta))

const collectMetaRowsAndContexts = (orderedBundles: SharedDbWimpBundle[]): {
  metaRowsById: Map<string, SharedDbMetaRows>
  metaContextById: Map<string, MetaContext>
} => {
  const metaRowsById = new Map<string, SharedDbMetaRows>()
  const metaContextById = new Map<string, MetaContext>()

  orderedBundles.forEach((bundle) => {
    let metaContext = metaContextById.get(bundle.meta.id)
    if (!metaContext) {
      const { rows, context } = materializeMetaRows(bundle.meta)
      metaRowsById.set(bundle.meta.id, rows)
      metaContextById.set(bundle.meta.id, context)
      metaContext = context
    }
  })

  return { metaRowsById, metaContextById }
}

/**
 * Собирает канонический relational snapshot из fully-formed `Wimp` bundles.
 *
 * DB-shaped projection больше не считается persisted слоем; в snapshot попадают
 * только entity/relation tables с UUID identity.
 */
export const createSharedDbDataFromWimpBundles = (orderedBundles: SharedDbWimpBundle[]): SharedDbData => {
  const bundles = orderedBundles.map(cloneWimpBundle)
  const data = createEmptySharedDbData()
  const { metaRowsById, metaContextById } = collectMetaRowsAndContexts(bundles)

  metaRowsById.forEach((rows) => applyMetaRowsToData(data, rows))

  bundles.forEach((bundle, wimpOrder) => {
    const metaContext = metaContextById.get(bundle.meta.id)
    if (!metaContext) {
      throw new Error(`Shared DB meta context is missing for meta ${bundle.meta.id}`)
    }

    applyWimpRowsToData(data, materializeWimpRows(bundle, wimpOrder, metaContext))
  })

  data.wimpEdges = buildWimpEdges(bundles)
  buildEntanglementFamilies(bundles).forEach((rows) => applyEntanglementFamilyRowsToData(data, rows))
  return normalizeSharedDbData(data)
}

/**
 * Открывает writer для поэтапной materialization-записи fully-formed `Wimp`.
 *
 * Writer хранит только временный CPU-side набор bundles и обновляет canonical table rows
 * incrementally, без пересборки полного snapshot из исходного graph state.
 */
export const openSharedDbMaterializationWriter = (backend: SharedDbBackend): SharedDbMaterializationWriter => {
  const bundlesById = new Map<string, SharedDbWimpBundle>()
  const metaSignatureById = new Map<string, string>()
  const wimpOrderById = new Map<string, number>()
  const nextEdgeOrderByParentId = new Map<string | null, number>()
  const wimpEdgesByChildId = new Map<string, SharedDbWimpEdgeRecord>()
  const savedFieldIdsByWimpId = new Map<string, string[]>()
  const savedFieldsById = new Map<string, SavedFieldState>()
  const entanglementFamiliesByRootFieldId = new Map<string, EntanglementFamilyState>()

  const ensureWimpOrder = (wimpId: string): number => {
    const existing = wimpOrderById.get(wimpId)
    if (existing !== undefined) return existing

    const nextOrder = wimpOrderById.size
    wimpOrderById.set(wimpId, nextOrder)
    return nextOrder
  }

  const writeWimpEdge = (bundle: SharedDbWimpBundle): void => {
    const existing = wimpEdgesByChildId.get(bundle.id)
    if (existing) {
      backend.writeWimpEdge(existing)
      return
    }

    const parentWimpId = bundle.parentWimpId ?? null
    const parentKey = parentWimpId ?? null
    const nextOrder = nextEdgeOrderByParentId.get(parentKey) ?? 0
    const edge: SharedDbWimpEdgeRecord = {
      id: deriveUuid("wimp-edge", parentWimpId ?? "root", bundle.id),
      parentWimpId,
      childWimpId: bundle.id,
      edgeOrder: nextOrder,
    }

    nextEdgeOrderByParentId.set(parentKey, nextOrder + 1)
    wimpEdgesByChildId.set(bundle.id, edge)
    backend.writeWimpEdge(edge)
  }

  const syncEntanglementFamily = (rootFieldId: string): void => {
    const family = entanglementFamiliesByRootFieldId.get(rootFieldId)
    const entanglementId = createEntanglementId(rootFieldId)
    if (!family || family.members.length === 0) {
      backend.deleteEntanglementFamily(entanglementId)
      return
    }

    backend.writeEntanglementFamily(
      materializeEntanglementFamilyRows(rootFieldId, {
        id: family.representativeFieldId,
        key: family.representativeFieldName,
      }, family.members, wimpOrderById),
    )
  }

  const removeSavedField = (fieldId: string): string | undefined => {
    const field = savedFieldsById.get(fieldId)
    if (!field) return undefined

    savedFieldsById.delete(fieldId)
    const family = entanglementFamiliesByRootFieldId.get(field.rootFieldId)
    if (!family) return field.rootFieldId

    family.members = family.members.filter((member) => member.id !== field.id)
    if (family.members.length === 0) {
      entanglementFamiliesByRootFieldId.delete(field.rootFieldId)
    } else if (family.representativeFieldId === field.id) {
      const nextRepresentative = family.members.find((member) => member.id === field.rootFieldId) ?? family.members[0]
      if (nextRepresentative) {
        family.representativeFieldId = nextRepresentative.id
        family.representativeFieldName = nextRepresentative.key
      }
    }

    return field.rootFieldId
  }

  const addSavedField = (bundle: SharedDbWimpBundle, field: SharedDbWimpFieldBundle): string => {
    const parentField = field.sourceWimpFieldId ? savedFieldsById.get(field.sourceWimpFieldId) : undefined
    if (field.sourceWimpFieldId && !parentField) {
      throw new Error(`Shared DB entanglement source field ${field.sourceWimpFieldId} is not materialized yet`)
    }

    const rootFieldId = parentField?.rootFieldId ?? field.id
    const savedField: SavedFieldState = {
      id: field.id,
      ownerWimpId: bundle.id,
      metaFieldId: field.metaFieldId,
      key: field.key,
      fieldOrder: field.fieldOrder,
      rootFieldId,
      ...(field.sourceWimpFieldId !== undefined ? { sourceWimpFieldId: field.sourceWimpFieldId } : {}),
    }

    savedFieldsById.set(savedField.id, savedField)

    const family =
      entanglementFamiliesByRootFieldId.get(rootFieldId) ??
      {
        rootFieldId,
        representativeFieldId: rootFieldId,
        representativeFieldName: field.key,
        members: [],
      }

    family.members = family.members.filter((member) => member.id !== savedField.id)
    family.members.push(savedField)
    if (savedField.id === rootFieldId) {
      family.representativeFieldId = savedField.id
      family.representativeFieldName = savedField.key
    }

    entanglementFamiliesByRootFieldId.set(rootFieldId, family)
    return rootFieldId
  }

  const persistWimpBundle = (bundle: SharedDbWimpBundle, metaContext: MetaContext): void => {
    const affectedFamilyIds = new Set<string>()
    const previousFieldIds = savedFieldIdsByWimpId.get(bundle.id) ?? []

    previousFieldIds.forEach((fieldId) => {
      const familyId = removeSavedField(fieldId)
      if (familyId) affectedFamilyIds.add(familyId)
    })

    const orderedFields = bundle.fields.slice().sort((left, right) => left.fieldOrder - right.fieldOrder)
    savedFieldIdsByWimpId.set(bundle.id, orderedFields.map((field) => field.id))
    orderedFields.forEach((field) => {
      affectedFamilyIds.add(addSavedField(bundle, field))
    })

    const wimpOrder = ensureWimpOrder(bundle.id)
    backend.writeWimpRows(materializeWimpRows(bundle, wimpOrder, metaContext))
    if (!previousFieldIds.length) {
      writeWimpEdge(bundle)
    }

    affectedFamilyIds.forEach((familyId) => syncEntanglementFamily(familyId))
  }

  return {
    saveWimpBundle(bundle) {
      const savedBundle = cloneWimpBundle(bundle)
      bundlesById.set(bundle.id, savedBundle)
      bundlesById.forEach((candidate, candidateId) => {
        if (candidateId !== bundle.id && candidate.meta.id === bundle.meta.id) {
          candidate.meta = cloneMetaBundle(bundle.meta)
        }
      })
      const orderedBundles = Array.from(bundlesById.values())
      const { rows: metaRows, context: metaContext } = materializeMetaRows(bundle.meta)
      const nextMetaSignature = createMetaSignature(bundle.meta)
      const previousMetaSignature = metaSignatureById.get(bundle.meta.id)

      if (previousMetaSignature !== nextMetaSignature) {
        backend.writeMetaRows(metaRows)
        metaSignatureById.set(bundle.meta.id, nextMetaSignature)

        orderedBundles.forEach((candidate) => {
          if (candidate.meta.id !== bundle.meta.id) return

          persistWimpBundle(candidate, metaContext)
        })
      } else {
        persistWimpBundle(savedBundle, metaContext)
      }
    },
  }
}
