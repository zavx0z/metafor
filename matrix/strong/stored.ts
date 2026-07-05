import type { MatrixBraneRecord, MatrixData, MatrixFieldValueRecord, MatrixScalarValue, MatrixSharedBlockRecord, MatrixStateRecord, MatrixTransitionRecord } from "@metafor/types/matrix/store"
import type { MatrixConditionRecord } from "@metafor/types/matrix/condition"
import type { MatrixFieldRecord, FlattenedMatrixInput } from "@metafor/types/matrix/data"
import type { MatrixStateGraph } from "@metafor/types/matrix/strong"
import { FieldType } from "../gravity/schema"
import { OP } from "../weak"
import { materializeEntanglement } from "./entangled"
import { createStoredStringInterner } from "./string-table"
import { normalizeFieldValue } from "./normalize"

function normalizeFieldRecord(field: MatrixFieldRecord): MatrixFieldRecord {
  return {
    type: field.type,
    ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
    ...(field.enum !== undefined ? { enum: field.enum } : {}),
  }
}

function normalizeConditionScalar(
  value: unknown,
  field: MatrixFieldRecord,
  op: number,
  stringInterner: { intern(value: string): number },
): MatrixScalarValue {
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
        const elementField: MatrixFieldRecord = {
          type:
            field.elementType === "string"
              ? FieldType.STRING_PTR
              : field.elementType === "boolean"
                ? FieldType.BOOL
                : FieldType.F32,
        }
        return normalizeFieldValue(value, elementField, stringInterner) as MatrixScalarValue
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
  conditions: FlattenedMatrixInput["branes"][number]["transitions"][number][number]["conditions"],
  fields: MatrixFieldRecord[],
  stringInterner: { intern(value: string): number },
): MatrixConditionRecord[] {
  const normalized: MatrixConditionRecord[] = []

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

function buildStateGraph(
  braneTransitions: FlattenedMatrixInput["branes"][number]["transitions"],
  fields: MatrixFieldRecord[],
  stringInterner: { intern(value: string): number },
): MatrixStateGraph {
  const stateTable: MatrixStateRecord[] = []
  const transitions: MatrixTransitionRecord[] = []
  const conditions: MatrixConditionRecord[] = []

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
  source: MatrixStateGraph,
  targetStateTable: MatrixStateRecord[],
  targetTransitions: MatrixTransitionRecord[],
  targetConditions: MatrixConditionRecord[],
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

function createStateGraphKey(graph: MatrixStateGraph): string {
  return JSON.stringify(graph)
}

export function assembleStoredMatrixData(flattened: FlattenedMatrixInput): MatrixData {
  const stringInterner = createStoredStringInterner()
  const entanglement = materializeEntanglement(
    flattened.branes.map((brane) => brane.values),
    flattened.entanglement,
  )

  const sharedBlocks: MatrixSharedBlockRecord[] = []
  const sharedValues: MatrixFieldValueRecord[] = []
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

  const branes: MatrixBraneRecord[] = []
  const braneValues: MatrixFieldValueRecord[] = []
  const braneSharedBlockRefs: number[] = []
  const stateTable: MatrixStateRecord[] = []
  const transitions: MatrixTransitionRecord[] = []
  const conditions: MatrixConditionRecord[] = []
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
    stateNames: flattened.branes.map((brane) => brane.stateNames),
  }
}
