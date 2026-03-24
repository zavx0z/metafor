import type { FieldKey, MetaAST } from "@metafor/ast"
import { createSharedDbProjection } from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"
import type {
  SharedDbEntanglementSeedBlockMemberRecord,
  SharedDbEntanglementSeedBlockRecord,
  SharedDbEntanglementSeedFieldMemberRecord,
  SharedDbEntanglementSeedFieldRecord,
  SharedDbFieldRecord,
  SharedDbFieldSchemaRecord,
  SharedDbFieldSourceRecord,
  SharedDbFieldValueRecord,
  SharedDbProjection,
  SharedDbRuntimeSeedData,
  SharedDbStateSeedConditionRecord,
  SharedDbStateSeedStateRecord,
  SharedDbStateSeedTransitionRecord,
} from "./db.t.ts"

/**
 * Flat DB-shaped trace instance-поля одного materialized `Wimp`.
 *
 * Это ещё не backend-таблицы, а промежуточный shared/db-след,
 * который можно агрегировать в проекцию или писать поэтапно.
 */
export interface SharedDbWimpFieldTrace {
  /** Идентификатор исходного instance-field из `Dark`. */
  darkFieldId: string
  /** Локальный ключ поля внутри `Wimp`. */
  key: FieldKey
  /** Flat-снимок схемы поля. */
  schema: SharedDbFieldSchemaRecord
  /** Текущее значение поля. */
  value: unknown
  /** Идентификатор прямого `source` поля, если он есть. */
  sourceDarkFieldId?: string
}

/**
 * Flat DB-shaped trace одного fully-formed `Wimp`.
 */
export interface SharedDbWimpTrace {
  /** Идентификатор `Dark Wimp`. */
  darkWimpId: string
  /** SRC меты. */
  src: string
  /** Имя меты, если оно уже materialized. */
  name?: string
  /** Flat DB-shaped след instance-полей. */
  fields: SharedDbWimpFieldTrace[]
  /** Upstream superposition для state seed materialization. */
  superposition?: MetaAST["superposition"]
}

/**
 * Унифицированный shared/db writer для поэтапной materialization-записи `Wimp`.
 *
 * ORM не знает про backend-детали и передаёт только свой текущий DB-shaped trace.
 */
export interface SharedDbMaterializationWriter {
  /** Сохраняет текущий DB-shaped trace одного fully-formed `Wimp`. */
  saveWimpTrace(trace: SharedDbWimpTrace): void
}

type TraceFieldWithOwner = SharedDbWimpFieldTrace & { ownerDarkWimpId: string }
type NamedSuperposition = NonNullable<SharedDbWimpTrace["superposition"]>

const isTopologyFieldType = (type: string): boolean => type.startsWith("enum<") || type.startsWith("array<")

const cloneFieldSchema = (schema: SharedDbFieldSchemaRecord): SharedDbFieldSchemaRecord => ({
  type: schema.type,
  required: schema.required,
  topology: schema.topology,
  ...(schema.label !== undefined ? { label: schema.label } : {}),
  ...(schema.values !== undefined ? { values: structuredClone(schema.values) } : {}),
})

const cloneWimpFieldTrace = (field: SharedDbWimpFieldTrace): SharedDbWimpFieldTrace => ({
  darkFieldId: field.darkFieldId,
  key: field.key,
  schema: cloneFieldSchema(field.schema),
  value: structuredClone(field.value),
  ...(field.sourceDarkFieldId !== undefined ? { sourceDarkFieldId: field.sourceDarkFieldId } : {}),
})

const cloneWimpTrace = (trace: SharedDbWimpTrace): SharedDbWimpTrace => ({
  darkWimpId: trace.darkWimpId,
  src: trace.src,
  ...(trace.name !== undefined ? { name: trace.name } : {}),
  fields: trace.fields.map(cloneWimpFieldTrace),
  ...(trace.superposition !== undefined ? { superposition: structuredClone(trace.superposition) } : {}),
})

const resolveSourceRoot = (
  field: TraceFieldWithOwner,
  fieldByDarkId: Map<string, TraceFieldWithOwner>,
): TraceFieldWithOwner => {
  let current = field
  const seen = new Set<string>()

  while (current.sourceDarkFieldId && !seen.has(current.darkFieldId)) {
    seen.add(current.darkFieldId)
    const parent = fieldByDarkId.get(current.sourceDarkFieldId)
    if (!parent) break
    current = parent
  }

  return current
}

const createDefaultSuperposition = (): NamedSuperposition => ({
  default: null,
})

const buildEntanglementSeeds = (
  traces: SharedDbWimpTrace[],
  braneIndexByDarkId: Map<string, number>,
): Pick<
  SharedDbRuntimeSeedData,
  "entanglementBlocks" | "entanglementBlockMembers" | "entanglementFields" | "entanglementFieldMembers"
> => {
  const traceFields = traces.flatMap((trace) =>
    trace.fields.map((field) => ({
      ...cloneWimpFieldTrace(field),
      ownerDarkWimpId: trace.darkWimpId,
    })),
  )
  const fieldByDarkId = new Map(traceFields.map((field) => [field.darkFieldId, field] as const))
  const familyMembersByRootDarkFieldId = new Map<string, TraceFieldWithOwner[]>()

  for (const field of traceFields) {
    const rootField = resolveSourceRoot(field, fieldByDarkId)
    const family = familyMembersByRootDarkFieldId.get(rootField.darkFieldId)
    if (family) {
      family.push(field)
    } else {
      familyMembersByRootDarkFieldId.set(rootField.darkFieldId, [field])
    }
  }

  const entanglementBlocks: SharedDbEntanglementSeedBlockRecord[] = []
  const entanglementBlockMembers: SharedDbEntanglementSeedBlockMemberRecord[] = []
  const entanglementFields: SharedDbEntanglementSeedFieldRecord[] = []
  const entanglementFieldMembers: SharedDbEntanglementSeedFieldMemberRecord[] = []
  const blockIndexByMembershipKey = new Map<string, number>()

  for (const [rootDarkFieldId, rawMembers] of familyMembersByRootDarkFieldId) {
    const members = Array.from(new Map(rawMembers.map((field) => [field.darkFieldId, field])).values())
      .map((field) => {
        const braneIndex = braneIndexByDarkId.get(field.ownerDarkWimpId)
        if (braneIndex === undefined) {
          throw new Error(`Shared DB entanglement seed references unknown brane for field ${field.darkFieldId}`)
        }
        return { field, braneIndex }
      })
      .sort((left, right) => left.braneIndex - right.braneIndex || left.field.key.localeCompare(right.field.key))

    const braneIndices = Array.from(new Set(members.map((member) => member.braneIndex))).sort((left, right) => left - right)
    if (braneIndices.length < 2 || members.length !== braneIndices.length) {
      continue
    }

    const representative = members.find((member) => member.field.darkFieldId === rootDarkFieldId) ?? members[0]
    if (!representative) continue

    const membershipKey = braneIndices.join(",")
    let blockIndex = blockIndexByMembershipKey.get(membershipKey)
    if (blockIndex === undefined) {
      blockIndex = entanglementBlocks.length
      blockIndexByMembershipKey.set(membershipKey, blockIndex)
      entanglementBlocks.push({
        index: blockIndex,
        key: `source-family:${membershipKey}`,
      })
      braneIndices.forEach((braneIndex, memberIndex) => {
        entanglementBlockMembers.push({
          index: entanglementBlockMembers.length,
          blockIndex,
          memberIndex,
          braneIndex,
        })
      })
    }

    const blockFieldIndex = entanglementFields.filter((field) => field.blockIndex === blockIndex).length
    const semanticKeys = Array.from(new Set([representative.field.key, ...members.map((member) => member.field.key)])).sort()
    const payloadIds = members.map((member) => member.field.darkFieldId).sort()

    entanglementFields.push({
      index: entanglementFields.length,
      blockIndex,
      blockFieldIndex,
      semanticKey: representative.field.darkFieldId,
      fieldName: representative.field.key,
      provenance: "dark-source-family",
      representativeDarkFieldId: representative.field.darkFieldId,
      representativeBraneIndex: representative.braneIndex,
      payloadIds,
      semanticKeys,
    })

    const entanglementFieldIndex = entanglementFields.length - 1
    members.forEach((member, memberIndex) => {
      entanglementFieldMembers.push({
        index: entanglementFieldMembers.length,
        entanglementFieldIndex,
        memberIndex,
        braneIndex: member.braneIndex,
        darkFieldId: member.field.darkFieldId,
      })
    })
  }

  return {
    entanglementBlocks,
    entanglementBlockMembers,
    entanglementFields,
    entanglementFieldMembers,
  }
}

const buildStateSeeds = (
  traces: SharedDbWimpTrace[],
  braneIndexByDarkId: Map<string, number>,
): Pick<SharedDbRuntimeSeedData, "stateSeedStates" | "stateSeedTransitions" | "stateSeedConditions"> => {
  const stateSeedStates: SharedDbStateSeedStateRecord[] = []
  const stateSeedTransitions: SharedDbStateSeedTransitionRecord[] = []
  const stateSeedConditions: SharedDbStateSeedConditionRecord[] = []

  for (const trace of traces) {
    const ownerBraneIndex = braneIndexByDarkId.get(trace.darkWimpId)
    if (ownerBraneIndex === undefined) {
      throw new Error(`Shared DB state seed references unknown brane for Wimp ${trace.darkWimpId}`)
    }

    const namedSuperposition =
      trace.superposition && Object.keys(trace.superposition).length > 0
        ? (structuredClone(trace.superposition) as NamedSuperposition)
        : createDefaultSuperposition()

    const stateNames = Object.keys(namedSuperposition)
    const stateIndexByName = new Map<string, number>()
    const fieldByKey = new Map(trace.fields.map((field) => [field.key, field] as const))

    stateNames.forEach((stateName, stateIndex) => {
      stateIndexByName.set(stateName, stateIndex)
      stateSeedStates.push({
        index: stateSeedStates.length,
        ownerBraneIndex,
        stateIndex,
        name: stateName,
        initial: stateIndex === 0,
      })
    })

    stateNames.forEach((stateName, fromStateIndex) => {
      const transitions = namedSuperposition[stateName]
      if (transitions === null) {
        stateSeedTransitions.push({
          index: stateSeedTransitions.length,
          ownerBraneIndex,
          fromStateIndex,
          transitionIndex: 0,
          targetStateIndex: null,
        })
        return
      }

      Object.entries(transitions).forEach(([targetStateName, conditions], transitionIndex) => {
        const targetStateIndex = stateIndexByName.get(targetStateName)
        if (targetStateIndex === undefined) {
          throw new Error(`Unknown state '${targetStateName}' in superposition of Wimp ${trace.darkWimpId}`)
        }

        stateSeedTransitions.push({
          index: stateSeedTransitions.length,
          ownerBraneIndex,
          fromStateIndex,
          transitionIndex,
          targetStateIndex,
        })

        if (conditions === null) {
          return
        }

        Object.entries(conditions).forEach(([fieldKey, condition], conditionIndex) => {
          const field = fieldByKey.get(fieldKey)
          if (!field) {
            throw new Error(`State seed field '${fieldKey}' not found in Wimp ${trace.darkWimpId}`)
          }

          stateSeedConditions.push({
            index: stateSeedConditions.length,
            transitionSeedIndex: stateSeedTransitions.length - 1,
            conditionIndex,
            darkFieldId: field.darkFieldId,
            condition: structuredClone(condition),
          })
        })
      })
    })
  }

  return {
    stateSeedStates,
    stateSeedTransitions,
    stateSeedConditions,
  }
}

/**
 * Собирает каноническую shared/db projection из ordered Wimp traces.
 *
 * Порядок traces задаёт индексное пространство brane/field записей для текущего materialization-пути.
 */
export const createSharedDbProjectionFromWimpTraces = (orderedTraces: SharedDbWimpTrace[]): SharedDbProjection => {
  const traces = orderedTraces.map(cloneWimpTrace)
  const branes: SharedDbProjection["branes"] = []
  const fields: SharedDbFieldRecord[] = []
  const fieldValues: SharedDbFieldValueRecord[] = []
  const fieldSources: SharedDbFieldSourceRecord[] = []
  const braneIndexByDarkId = new Map<string, number>()
  const fieldIndexByDarkId = new Map<string, number>()
  const fieldIndexByBraneAndKey = new Map<number, Map<FieldKey, number>>()
  const fieldSourceByChildFieldIndex: Array<SharedDbFieldSourceRecord | undefined> = []
  const dependentFieldIndexesByParentFieldIndex = new Map<number, number[]>()

  for (const trace of traces) {
    const braneIndex = branes.length
    const fieldOffset = fields.length
    const fieldLookup = new Map<FieldKey, number>()
    braneIndexByDarkId.set(trace.darkWimpId, braneIndex)

    for (const field of trace.fields) {
      const fieldIndex = fields.length
      fields.push({
        index: fieldIndex,
        darkFieldId: field.darkFieldId,
        ownerBraneIndex: braneIndex,
        key: field.key,
        schema: cloneFieldSchema(field.schema),
      })
      fieldValues.push({
        fieldIndex,
        value: structuredClone(field.value),
      })
      fieldIndexByDarkId.set(field.darkFieldId, fieldIndex)
      fieldLookup.set(field.key, fieldIndex)
    }

    branes.push({
      index: braneIndex,
      darkWimpId: trace.darkWimpId,
      src: trace.src,
      ...(trace.name !== undefined ? { name: trace.name } : {}),
      fieldOffset,
      fieldCount: fields.length - fieldOffset,
    })
    fieldIndexByBraneAndKey.set(braneIndex, fieldLookup)
  }

  for (const trace of traces) {
    for (const field of trace.fields) {
      if (!field.sourceDarkFieldId) continue

      const childFieldIndex = fieldIndexByDarkId.get(field.darkFieldId)
      const parentFieldIndex = fieldIndexByDarkId.get(field.sourceDarkFieldId)
      const parentField = parentFieldIndex !== undefined ? fields[parentFieldIndex] : undefined
      if (
        childFieldIndex === undefined ||
        parentFieldIndex === undefined ||
        !parentField ||
        isTopologyFieldType(field.schema.type) ||
        isTopologyFieldType(parentField.schema.type)
      ) {
        continue
      }

      const sourceRecord: SharedDbFieldSourceRecord = {
        childFieldIndex,
        parentFieldIndex,
      }
      fieldSources.push(sourceRecord)
      fieldSourceByChildFieldIndex[childFieldIndex] = sourceRecord

      const dependents = dependentFieldIndexesByParentFieldIndex.get(parentFieldIndex)
      if (dependents) {
        dependents.push(childFieldIndex)
      } else {
        dependentFieldIndexesByParentFieldIndex.set(parentFieldIndex, [childFieldIndex])
      }
    }
  }

  const entanglementSeeds = buildEntanglementSeeds(traces, braneIndexByDarkId)
  const stateSeeds = buildStateSeeds(traces, braneIndexByDarkId)

  return createSharedDbProjection({
    rootBraneIndex: traces.length > 0 ? 0 : 0,
    branes,
    fields,
    fieldValues,
    fieldSources,
    ...entanglementSeeds,
    ...stateSeeds,
  })
}

const cloneRuntimeSeedData = (projection: SharedDbProjection): SharedDbRuntimeSeedData => ({
  entanglementBlocks: projection.entanglementBlocks.map((block) => structuredClone(block)),
  entanglementBlockMembers: projection.entanglementBlockMembers.map((member) => structuredClone(member)),
  entanglementFields: projection.entanglementFields.map((field) => structuredClone(field)),
  entanglementFieldMembers: projection.entanglementFieldMembers.map((member) => structuredClone(member)),
  stateSeedStates: projection.stateSeedStates.map((state) => structuredClone(state)),
  stateSeedTransitions: projection.stateSeedTransitions.map((transition) => structuredClone(transition)),
  stateSeedConditions: projection.stateSeedConditions.map((condition) => structuredClone(condition)),
})

/**
 * Открывает shared/db materialization writer поверх backend.
 *
 * Writer пишет в существующую schema по мере завершения `Wimp`,
 * но backend-детали остаются внутри shared/db.
 */
export const openSharedDbMaterializationWriter = (backend: SharedDbBackend): SharedDbMaterializationWriter => {
  const traceOrder: string[] = []
  const traceByDarkWimpId = new Map<string, SharedDbWimpTrace>()

  return {
    saveWimpTrace(trace) {
      const nextTrace = cloneWimpTrace(trace)

      if (!traceByDarkWimpId.has(nextTrace.darkWimpId)) {
        traceOrder.push(nextTrace.darkWimpId)
      }
      traceByDarkWimpId.set(nextTrace.darkWimpId, nextTrace)

      const projection = createSharedDbProjectionFromWimpTraces(
        traceOrder.map((darkWimpId) => traceByDarkWimpId.get(darkWimpId)!),
      )

      backend.setRootBraneIndex(projection.rootBraneIndex)

      const braneIndex = projection.braneIndexByDarkId.get(nextTrace.darkWimpId)
      if (braneIndex === undefined) {
        throw new Error(`Shared DB materialization cannot resolve brane for Wimp ${nextTrace.darkWimpId}`)
      }

      const brane = projection.branes[braneIndex]
      if (!brane) {
        throw new Error(`Shared DB materialization cannot read brane row ${braneIndex}`)
      }

      backend.upsertBrane(brane)

      for (const fieldTrace of nextTrace.fields) {
        const fieldIndex = projection.fieldIndexByDarkId.get(fieldTrace.darkFieldId)
        if (fieldIndex === undefined) {
          throw new Error(`Shared DB materialization cannot resolve field ${fieldTrace.darkFieldId}`)
        }

        const fieldRecord = projection.fields[fieldIndex]
        const fieldValue = projection.fieldValues[fieldIndex]
        if (!fieldRecord || !fieldValue) {
          throw new Error(`Shared DB materialization cannot read field row ${fieldIndex}`)
        }

        backend.upsertField(fieldRecord)
        backend.setFieldValue(fieldIndex, fieldValue.value)

        const sourceRecord = projection.fieldSourceByChildFieldIndex[fieldIndex]
        backend.setFieldSource(fieldIndex, sourceRecord ? sourceRecord.parentFieldIndex : null)
      }

      backend.replaceRuntimeSeedData(cloneRuntimeSeedData(projection))
    },
  }
}
