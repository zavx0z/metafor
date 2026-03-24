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
import type { SharedDbBackend, SharedDbEntanglementRows, SharedDbMetaRows, SharedDbWimpRows } from "./backend.t.ts"
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

  const entanglementIdByMembershipKey = new Map<string, string>()

  for (const [rootFieldId, rawMembers] of familyMembersByRootFieldId) {
    const members = Array.from(new Map(rawMembers.map((field) => [field.id, field] as const)).values()).sort(
      (left, right) =>
        (wimpOrderById.get(left.ownerWimpId) ?? Number.MAX_SAFE_INTEGER) -
          (wimpOrderById.get(right.ownerWimpId) ?? Number.MAX_SAFE_INTEGER) || left.fieldOrder - right.fieldOrder,
    )

    const distinctWimpIds = Array.from(new Set(members.map((member) => member.ownerWimpId)))
    if (distinctWimpIds.length < 2 || members.length !== distinctWimpIds.length) {
      continue
    }

    const representative = members.find((member) => member.id === rootFieldId) ?? members[0]
    if (!representative) continue

    const membershipKey = distinctWimpIds.join(",")
    let entanglementId = entanglementIdByMembershipKey.get(membershipKey)

    if (!entanglementId) {
      entanglementId = deriveUuid("entanglement", membershipKey)
      entanglementIdByMembershipKey.set(membershipKey, entanglementId)
      data.entanglements.push({
        id: entanglementId,
        membershipKey,
        provenance: "wimp-field-source-family",
      })

      distinctWimpIds.forEach((wimpId, memberOrder) => {
        data.entanglementMembers.push({
          id: deriveUuid("entanglement-member", entanglementId, wimpId, memberOrder),
          ownerEntanglementId: entanglementId,
          wimpId,
          memberOrder,
        })
      })
    }

    const fieldOrder = data.entanglementFields.filter((field) => field.ownerEntanglementId === entanglementId).length
    const entanglementFieldId = deriveUuid("entanglement-field", entanglementId, rootFieldId)

    data.entanglementFields.push({
      id: entanglementFieldId,
      ownerEntanglementId: entanglementId,
      fieldOrder,
      semanticKey: representative.id,
      fieldName: representative.key,
      provenance: "wimp-field-source-family",
      representativeWimpFieldId: representative.id,
      payloadIds: members.map((member) => member.id).sort(),
      semanticKeys: Array.from(new Set(members.map((member) => member.metaFieldId))).sort(),
    })

    members.forEach((member, memberOrder) => {
      data.entanglementFieldMembers.push({
        id: deriveUuid("entanglement-field-member", entanglementFieldId, member.id, memberOrder),
        ownerEntanglementFieldId: entanglementFieldId,
        ownerWimpId: member.ownerWimpId,
        wimpFieldId: member.id,
        memberOrder,
      })
    })
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

const buildEntanglementRows = (orderedBundles: SharedDbWimpBundle[]): SharedDbEntanglementRows => {
  const data = createEmptySharedDbData()
  appendEntanglements(data, orderedBundles)

  return {
    entanglements: data.entanglements,
    members: data.entanglementMembers,
    fields: data.entanglementFields,
    fieldMembers: data.entanglementFieldMembers,
  }
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

const collectMetaWimpRows = (orderedBundles: SharedDbWimpBundle[]): {
  metaRowsById: Map<string, SharedDbMetaRows>
  metaContextById: Map<string, MetaContext>
  wimpRows: SharedDbWimpRows[]
} => {
  const metaRowsById = new Map<string, SharedDbMetaRows>()
  const metaContextById = new Map<string, MetaContext>()
  const wimpRows: SharedDbWimpRows[] = []

  orderedBundles.forEach((bundle, wimpOrder) => {
    let metaContext = metaContextById.get(bundle.meta.id)
    if (!metaContext) {
      const { rows, context } = materializeMetaRows(bundle.meta)
      metaRowsById.set(bundle.meta.id, rows)
      metaContextById.set(bundle.meta.id, context)
      metaContext = context
    }

    wimpRows.push(materializeWimpRows(bundle, wimpOrder, metaContext))
  })

  return { metaRowsById, metaContextById, wimpRows }
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
  const { metaRowsById, wimpRows } = collectMetaWimpRows(bundles)

  metaRowsById.forEach((rows) => applyMetaRowsToData(data, rows))
  wimpRows.forEach((rows) => applyWimpRowsToData(data, rows))
  data.wimpEdges = buildWimpEdges(bundles)

  const entanglementRows = buildEntanglementRows(bundles)
  data.entanglements = entanglementRows.entanglements
  data.entanglementMembers = entanglementRows.members
  data.entanglementFields = entanglementRows.fields
  data.entanglementFieldMembers = entanglementRows.fieldMembers
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

  return {
    saveWimpBundle(bundle) {
      bundlesById.set(bundle.id, cloneWimpBundle(bundle))
      bundlesById.forEach((candidate, candidateId) => {
        if (candidateId !== bundle.id && candidate.meta.id === bundle.meta.id) {
          candidate.meta = cloneMetaBundle(bundle.meta)
        }
      })
      const orderedBundles = Array.from(bundlesById.values())
      const { metaRowsById, metaContextById } = collectMetaWimpRows(orderedBundles)
      const nextMetaSignature = createMetaSignature(bundle.meta)
      const previousMetaSignature = metaSignatureById.get(bundle.meta.id)

      if (previousMetaSignature !== nextMetaSignature) {
        const metaRows = metaRowsById.get(bundle.meta.id)
        if (!metaRows) {
          throw new Error(`Shared DB meta rows are missing for meta ${bundle.meta.id}`)
        }

        backend.writeMetaRows(metaRows)
        metaSignatureById.set(bundle.meta.id, nextMetaSignature)

        orderedBundles.forEach((candidate, wimpOrder) => {
          if (candidate.meta.id !== bundle.meta.id) return

          const metaContext = metaContextById.get(candidate.meta.id)
          if (!metaContext) {
            throw new Error(`Shared DB meta context is missing for meta ${candidate.meta.id}`)
          }

          backend.writeWimpRows(materializeWimpRows(candidate, wimpOrder, metaContext))
        })
      } else {
        const wimpOrder = orderedBundles.findIndex((orderedBundle) => orderedBundle.id === bundle.id)
        const metaContext = metaContextById.get(bundle.meta.id)
        if (!metaContext) {
          throw new Error(`Shared DB meta context is missing for meta ${bundle.meta.id}`)
        }
        if (wimpOrder < 0) {
          throw new Error(`Shared DB writer cannot resolve saved wimp order for ${bundle.id}`)
        }

        backend.writeWimpRows(materializeWimpRows(bundle, wimpOrder, metaContext))
      }

      backend.replaceWimpEdges(buildWimpEdges(orderedBundles))
      backend.replaceEntanglementRows(buildEntanglementRows(orderedBundles))
    },
  }
}
