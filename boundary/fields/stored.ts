import type {
  BoundaryBraneRecord,
  BoundaryConditionRecord,
  BoundaryData,
  BoundaryFieldRecord,
  BoundaryScalarValue,
  BoundarySharedBlockRecord,
  BoundaryTransitionRecord,
} from "../store.t"
import type { Field } from "./index.t"
import { FieldType } from "./index.t"
import { OP } from "./opcodes"
import type { FlattenedBoundaryInput } from "./stored.t"
import { materializeEntanglement } from "./entangled"
import { createStoredStringInterner } from "./string-table"
import { normalizeFieldValue } from "./values"

function normalizeFieldRecord(field: Field): BoundaryFieldRecord {
  return {
    type: field.type,
    ...(field.elementType !== undefined ? { elementType: field.elementType } : {}),
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

export function assembleStoredBoundaryData(flattened: FlattenedBoundaryInput): BoundaryData {
  const stringInterner = createStoredStringInterner()
  const entanglement = materializeEntanglement(
    flattened.branes.map((brane) => brane.values),
    flattened.entanglement,
  )

  const sharedBlocks: BoundarySharedBlockRecord[] = Array.from(entanglement.entangledFields.values()).map((fields) => ({
    fields: fields.map(([fieldIndex, value]) => ({
      fieldIndex,
      value: normalizeFieldValue(value, flattened.fields[fieldIndex], stringInterner),
    })),
  }))

  const branes: BoundaryBraneRecord[] = flattened.branes.map((brane, braneIndex) => ({
    localFields: entanglement.localFields[braneIndex]!.map(([fieldIndex, value]) => ({
      fieldIndex,
      value: normalizeFieldValue(value, flattened.fields[fieldIndex], stringInterner),
    })),
    sharedBlockIds: [...entanglement.braneEntangledMap[braneIndex]!],
    transitions: brane.transitions.map((stateTransitions) =>
      stateTransitions.map((transition): BoundaryTransitionRecord => ({
        targetState: transition.targetState,
        conditions: normalizeTransitionConditions(transition.conditions, flattened.fields, stringInterner),
      })),
    ),
    lock: false,
  }))

  return {
    fields: flattened.fields.map(normalizeFieldRecord),
    stringTable: stringInterner.table,
    sharedBlocks,
    branes,
    states: flattened.branes.map((brane) => brane.state),
  }
}
