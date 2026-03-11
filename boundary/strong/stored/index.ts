import type {
  BoundaryBraneRecord,
  BoundaryConditionRecord,
  BoundaryData,
  BoundaryFieldRecord,
  BoundaryFieldValueRecord,
  BoundaryScalarValue,
  BoundarySharedBlockRecord,
  BoundaryStateRecord,
  BoundaryTransitionRecord,
} from "../../store.t"
import type { Field } from "../../gravity/schema.t"
import { FieldType } from "../../gravity/schema.t"
import { OP } from "../../weak"
import type { FlattenedBoundaryInput } from "../../gravity/flattened.t"
import { materializeEntanglement } from "../entangled"
import { createStoredStringInterner } from "../string-table"
import { normalizeFieldValue } from "../normalize"

function normalizeFieldRecord(field: Field): BoundaryFieldRecord {
  return {
    type: field.type,
    ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
    ...(field.enum !== undefined ? { enum: field.enum } : {}),
  }
}

function normalizeConditionScalar(
  value: unknown,
  field: Field,
  op: number,
  stringInterner: { intern(value: string): number },
): BoundaryScalarValue {
  if (field.enum) {
    return normalizeFieldValue(value, field, stringInterner) as number
  }

  switch (field.type) {
    case FieldType.F32:
    case FieldType.U32:
      return Number(value)
    case FieldType.BOOL:
      return Boolean(value)
    case FieldType.STRING_PTR:
      return normalizeFieldValue(value, field, stringInterner) as number
    case FieldType.ARRAY_PTR:
      if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
        const elementField: Field = {
          type:
            field.elementType === "string"
              ? FieldType.STRING_PTR
              : field.elementType === "boolean"
                ? FieldType.BOOL
                : FieldType.F32,
        }
        return normalizeFieldValue(value, elementField, stringInterner) as BoundaryScalarValue
      }
      if (op === OP.IS_EMPTY) {
        return Boolean(value)
      }
      return Number(value)
    default:
      return Number(value)
  }
}

function normalizeTransitionConditions(
  conditions: FlattenedBoundaryInput["branes"][number]["transitions"][number][number]["conditions"],
  fields: Field[],
  stringInterner: { intern(value: string): number },
): BoundaryConditionRecord[] {
  const normalized: BoundaryConditionRecord[] = []

  for (const fieldChecks of conditions) {
    const field = fields[fieldChecks.fieldIndex]
    if (!field) {
      throw new Error(`Field ${fieldChecks.fieldIndex} not defined`)
    }

    for (const check of fieldChecks.checks) {
      normalized.push({
        fieldIndex: fieldChecks.fieldIndex,
        op: check.op,
        value: Array.isArray(check.val)
          ? check.val.map((item) => normalizeConditionScalar(item, field, check.op, stringInterner))
          : normalizeConditionScalar(check.val, field, check.op, stringInterner),
      })
    }
  }

  return normalized
}

interface BoundaryStateGraph {
  stateTable: BoundaryStateRecord[]
  transitions: BoundaryTransitionRecord[]
  conditions: BoundaryConditionRecord[]
}

function buildStateGraph(
  braneTransitions: FlattenedBoundaryInput["branes"][number]["transitions"],
  fields: Field[],
  stringInterner: { intern(value: string): number },
): BoundaryStateGraph {
  const stateTable: BoundaryStateRecord[] = []
  const transitions: BoundaryTransitionRecord[] = []
  const conditions: BoundaryConditionRecord[] = []

  for (const stateTransitions of braneTransitions) {
    const transitionOffset = transitions.length

    for (const transition of stateTransitions) {
      if (transition.targetState === null) {
        continue
      }

      const normalizedConditions = normalizeTransitionConditions(transition.conditions, fields, stringInterner)
      const conditionOffset = conditions.length
      conditions.push(...normalizedConditions)
      transitions.push({
        targetState: transition.targetState,
        conditionOffset,
        conditionCount: normalizedConditions.length,
      })
    }

    stateTable.push({
      transitionOffset,
      transitionCount: transitions.length - transitionOffset,
    })
  }

  return { stateTable, transitions, conditions }
}

function appendStateGraph(
  source: BoundaryStateGraph,
  targetStateTable: BoundaryStateRecord[],
  targetTransitions: BoundaryTransitionRecord[],
  targetConditions: BoundaryConditionRecord[],
): { stateOffset: number; stateCount: number } {
  const stateOffset = targetStateTable.length
  const transitionOffsetBase = targetTransitions.length
  const conditionOffsetBase = targetConditions.length

  targetConditions.push(...source.conditions)
  targetTransitions.push(
    ...source.transitions.map((transition) => ({
      ...transition,
      conditionOffset: conditionOffsetBase + transition.conditionOffset,
    })),
  )
  targetStateTable.push(
    ...source.stateTable.map((state) => ({
      ...state,
      transitionOffset: transitionOffsetBase + state.transitionOffset,
    })),
  )

  return { stateOffset, stateCount: source.stateTable.length }
}

function createStateGraphKey(graph: BoundaryStateGraph): string {
  return JSON.stringify(graph)
}

export function assembleStoredBoundaryData(flattened: FlattenedBoundaryInput): BoundaryData {
  const stringInterner = createStoredStringInterner()
  const entanglement = materializeEntanglement(
    flattened.branes.map((brane) => brane.values),
    flattened.entanglement,
  )

  const sharedBlocks: BoundarySharedBlockRecord[] = []
  const sharedValues: BoundaryFieldValueRecord[] = []
  for (const fields of entanglement.entangledFields.values()) {
    const valueOffset = sharedValues.length
    sharedValues.push(
      ...fields.map(([fieldIndex, value]) => ({
        fieldIndex,
        value: normalizeFieldValue(value, flattened.fields[fieldIndex], stringInterner),
      })),
    )
    sharedBlocks.push({
      valueOffset,
      valueCount: sharedValues.length - valueOffset,
    })
  }

  const branes: BoundaryBraneRecord[] = []
  const braneValues: BoundaryFieldValueRecord[] = []
  const braneSharedBlockRefs: number[] = []
  const stateTable: BoundaryStateRecord[] = []
  const transitions: BoundaryTransitionRecord[] = []
  const conditions: BoundaryConditionRecord[] = []
  const stateGraphCache = new Map<string, { stateOffset: number; stateCount: number }>()

  flattened.branes.forEach((brane, braneIndex) => {
    const localValueOffset = braneValues.length
    braneValues.push(
      ...entanglement.localFields[braneIndex]!.map(([fieldIndex, value]) => ({
        fieldIndex,
        value: normalizeFieldValue(value, flattened.fields[fieldIndex], stringInterner),
      })),
    )

    const sharedBlockRefOffset = braneSharedBlockRefs.length
    braneSharedBlockRefs.push(...(entanglement.braneEntangledMap[braneIndex] ?? []))

    const graph = buildStateGraph(brane.transitions, flattened.fields, stringInterner)
    const graphKey = createStateGraphKey(graph)
    const cachedGraph = stateGraphCache.get(graphKey)
    const { stateOffset, stateCount } =
      cachedGraph ??
      appendStateGraph(graph, stateTable, transitions, conditions)

    if (!cachedGraph) {
      stateGraphCache.set(graphKey, { stateOffset, stateCount })
    }

    branes.push({
      localValueOffset,
      localValueCount: braneValues.length - localValueOffset,
      sharedBlockRefOffset,
      sharedBlockRefCount: braneSharedBlockRefs.length - sharedBlockRefOffset,
      stateOffset,
      stateCount,
      lock: false,
    })
  })

  return {
    fields: flattened.fields.map(normalizeFieldRecord),
    stringTable: stringInterner.table,
    sharedBlocks,
    sharedValues,
    branes,
    braneValues,
    braneSharedBlockRefs,
    stateTable,
    transitions,
    conditions,
    states: flattened.branes.map((brane) => brane.state),
  }
}
