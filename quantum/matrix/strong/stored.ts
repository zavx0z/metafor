import type { MatrixBraneRecord, MatrixData, MatrixFieldValueRecord, MatrixScalarValue, MatrixSharedBlockRecord, MatrixStateRecord, MatrixTransitionRecord } from "@metafor/types/matrix/store"
import type {
  MatrixConditionOperand,
  MatrixConditionRecord,
  MatrixParsedCheck,
  MatrixQuantifierValue,
} from "@metafor/types/matrix/condition"
import type { MatrixFieldRecord, FlattenedMatrixInput } from "@metafor/types/matrix/data"
import type { MatrixStateGraph } from "@metafor/types/matrix/strong"
import { FieldType } from "../gravity/schema"
import { OP } from "../weak"
import { materializeEntanglement } from "./entangled"
import { createStoredStringInterner } from "./string-table"
import { normalizeFieldValue, normalizeF32, normalizeU32 } from "./normalize"

function normalizeFieldRecord(field: MatrixFieldRecord): MatrixFieldRecord {
  return {
    type: field.type,
    ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
    ...(field.enum !== undefined ? { enum: field.enum } : {}),
  }
}

function elementField(field: MatrixFieldRecord): MatrixFieldRecord {
  return {
    type:
      field.elementType === "string"
        ? FieldType.STRING_PTR
        : field.elementType === "boolean"
          ? FieldType.BOOL
          : FieldType.F32,
  }
}

function normalizeLength(value: unknown): number {
  return normalizeU32(value)
}

function normalizeConditionScalar(
  value: unknown,
  field: MatrixFieldRecord,
  stringInterner: { intern(value: string): number },
): MatrixScalarValue {
  const normalized = normalizeFieldValue(value, field, stringInterner)
  if (normalized === null || Array.isArray(normalized)) {
    throw new Error("Matrix scalar condition requires a present scalar operand")
  }
  return normalized
}

function normalizeItemCheck(
  check: MatrixParsedCheck,
): MatrixParsedCheck {
  return {
    op: check.op,
    val: normalizeF32(check.val),
  }
}

function normalizeConditionOperand(
  value: MatrixConditionOperand,
  field: MatrixFieldRecord,
  op: number,
  stringInterner: { intern(value: string): number },
): MatrixConditionOperand {
  if (op === OP.IS_NULL || op === OP.IS_NOT_NULL || op === OP.RESOLVED) {
    return normalizeU32(value)
  }

  if (op === OP.PATTERN) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("source" in value) ||
      !("flags" in value)
    ) {
      throw new Error("Matrix pattern condition requires a RegExp descriptor")
    }
    const source = String(value.source)
    const flags = String(value.flags)
    new RegExp(source, flags)
    return {source, flags}
  }

  if (op === OP.EVERY || op === OP.SOME) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("checks" in value) ||
      !Array.isArray(value.checks)
    ) {
      throw new Error("Matrix array quantifier requires item checks")
    }
    return {
      checks: value.checks.map(normalizeItemCheck),
    } satisfies MatrixQuantifierValue
  }

  if (
    op === OP.LENGTH ||
    op === OP.LENGTH_GT ||
    op === OP.LENGTH_GTE ||
    op === OP.LENGTH_LT ||
    op === OP.LENGTH_LTE
  ) {
    return normalizeLength(value)
  }

  if (op === OP.IS_EMPTY) {
    if (typeof value !== "boolean") throw new Error("Matrix isEmpty condition requires a boolean")
    return value
  }

  if (op === OP.ARRAY_EQ) {
    if (!Array.isArray(value)) throw new Error("Matrix array equality requires an array")
    const itemField = elementField(field)
    return value.map((item) => normalizeConditionScalar(item, itemField, stringInterner))
  }

  if (op === OP.INCLUDE || op === OP.NOT_INCLUDE) {
    return normalizeConditionScalar(value, elementField(field), stringInterner)
  }

  if (op === OP.STRING_BETWEEN) {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error("Matrix string between requires two bounds")
    }
    return value.map((item) =>
      normalizeConditionScalar(item, {type: FieldType.STRING_PTR}, stringInterner))
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeConditionScalar(item, field, stringInterner))
  }

  return normalizeConditionScalar(value, field, stringInterner)
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
      try {
        normalized.push({
          fieldIndex: fieldChecks.fieldIndex,
          op: check.op,
          value: normalizeConditionOperand(check.val, field, check.op, stringInterner),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Matrix Field ${fieldChecks.fieldIndex} condition op ${check.op} is invalid: ${message}`,
        )
      }
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
