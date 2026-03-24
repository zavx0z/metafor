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
import type { SharedDbBackend } from "./backend.t.ts"
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
      nodeOrder: data.metaMatterNodes.length,
      payload,
    })

    data.metaMatterEdges.push({
      id: deriveUuid("meta-matter-edge", ownerMetaId, parentNodeId ?? "root", nodeId, edgeOrder),
      ownerMetaId,
      parentNodeId,
      childNodeId: nodeId,
      edgeOrder,
    })

    if (Array.isArray(child) && child.length > 0) {
      appendMetaMatter(data, ownerMetaId, child, nodeId, nextPath)
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

const ensureMetaContext = (data: SharedDbData, meta: SharedDbMetaBundle, cache: Map<string, MetaContext>): MetaContext => {
  const existing = cache.get(meta.id)
  if (existing) return existing

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
  appendMetaMatter(data, meta.id, meta.matter)
  cache.set(meta.id, context)
  return context
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

/**
 * Собирает канонический relational snapshot из fully-formed `Wimp` bundles.
 *
 * DB-shaped projection больше не считается persisted слоем; в snapshot попадают
 * только entity/relation tables с UUID identity.
 */
export const createSharedDbDataFromWimpBundles = (orderedBundles: SharedDbWimpBundle[]): SharedDbData => {
  const bundles = orderedBundles.map(cloneWimpBundle)
  const data = createEmptySharedDbData()
  const metaContextById = new Map<string, MetaContext>()

  bundles.forEach((bundle, wimpOrder) => {
    const metaContext = ensureMetaContext(data, bundle.meta, metaContextById)

    data.wimps.push({
      id: bundle.id,
      metaId: bundle.meta.id,
      wimpOrder,
      ...(bundle.massOverride !== undefined ? { massOverride: structuredClone(bundle.massOverride) } : {}),
    })

    bundle.fields
      .slice()
      .sort((left, right) => left.fieldOrder - right.fieldOrder)
      .forEach((field) => {
        const metaFieldId = metaContext.fieldIdByKey.get(field.key)
        if (metaFieldId !== field.metaFieldId) {
          throw new Error(
            `Shared DB wimp field ${field.id} does not match meta field mapping for key '${field.key}' in meta ${bundle.meta.id}`,
          )
        }

        data.wimpFields.push({
          id: field.id,
          ownerWimpId: bundle.id,
          metaFieldId: field.metaFieldId,
          fieldOrder: field.fieldOrder,
        })

        data.fieldValues.push({
          id: deriveUuid("field-value", field.id),
          ownerWimpFieldId: field.id,
          value: structuredClone(field.value),
        })

        if (field.sourceWimpFieldId) {
          data.fieldSources.push({
            id: deriveUuid("field-source", field.id, field.sourceWimpFieldId),
            childWimpFieldId: field.id,
            parentWimpFieldId: field.sourceWimpFieldId,
          })
        }
      })

    data.wimpStates.push({
      id: deriveUuid("wimp-state", bundle.id),
      ownerWimpId: bundle.id,
      metaStateId: metaContext.initialStateId,
    })
  })

  const childBundlesByParentId = new Map<string | null, SharedDbWimpBundle[]>()
  bundles.forEach((bundle) => {
    const key = bundle.parentWimpId ?? null
    const children = childBundlesByParentId.get(key)
    if (children) {
      children.push(bundle)
    } else {
      childBundlesByParentId.set(key, [bundle])
    }
  })

  for (const [parentWimpId, childBundles] of childBundlesByParentId) {
    childBundles.forEach((bundle, edgeOrder) => {
      const edge: SharedDbWimpEdgeRecord = {
        id: deriveUuid("wimp-edge", parentWimpId ?? "root", bundle.id),
        parentWimpId,
        childWimpId: bundle.id,
        edgeOrder,
      }
      data.wimpEdges.push(edge)
    })
  }

  appendEntanglements(data, bundles)
  return normalizeSharedDbData(data)
}

/**
 * Открывает writer для поэтапной materialization-записи fully-formed `Wimp`.
 *
 * Writer хранит только временный CPU-side набор bundles и на каждом save
 * пере-перестраивает канонический relational snapshot, не сохраняя projection-таблицы.
 */
export const openSharedDbMaterializationWriter = (backend: SharedDbBackend): SharedDbMaterializationWriter => {
  const bundlesById = new Map<string, SharedDbWimpBundle>()

  return {
    saveWimpBundle(bundle) {
      bundlesById.set(bundle.id, cloneWimpBundle(bundle))
      backend.writeData(createSharedDbDataFromWimpBundles(Array.from(bundlesById.values())))
    },
  }
}
