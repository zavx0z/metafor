import type {EnergyMassStore} from "@metafor/types/energy/mass"
import type {ReactionExecutionSignal} from "shared/protocol/force/reaction"

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && deepEqual(left[key], right[key]))
}

const lengthOf = (value: unknown): number | null =>
  typeof value === "string" || Array.isArray(value) ? value.length : isRecord(value) ? Object.keys(value).length : null

const includes = (actual: unknown, expected: unknown): boolean => {
  if (typeof actual === "string") return actual.includes(String(expected))
  if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, expected))
  return false
}

const matchesOperator = (actual: unknown, operator: string, expected: unknown): boolean => {
  switch (operator) {
    case "eq": return deepEqual(actual, expected)
    case "notEq":
    case "neq": return !deepEqual(actual, expected)
    case "gt": return Number(actual) > Number(expected)
    case "gte": return Number(actual) >= Number(expected)
    case "lt": return Number(actual) < Number(expected)
    case "lte": return Number(actual) <= Number(expected)
    case "notGt": return !(Number(actual) > Number(expected))
    case "notGte": return !(Number(actual) >= Number(expected))
    case "notLt": return !(Number(actual) < Number(expected))
    case "notLte": return !(Number(actual) <= Number(expected))
    case "startsWith": return typeof actual === "string" && actual.startsWith(String(expected))
    case "endsWith": return typeof actual === "string" && actual.endsWith(String(expected))
    case "notStartsWith": return typeof actual === "string" && !actual.startsWith(String(expected))
    case "notEndsWith": return typeof actual === "string" && !actual.endsWith(String(expected))
    case "include": return includes(actual, expected)
    case "notInclude": return !includes(actual, expected)
    case "pattern": return expected instanceof RegExp && typeof actual === "string" && expected.test(actual)
    case "in": return Array.isArray(expected) && expected.some((item) => deepEqual(item, actual))
    case "notIn": return Array.isArray(expected) && !expected.some((item) => deepEqual(item, actual))
    case "between": {
      if (!Array.isArray(expected) || expected.length !== 2) return false
      return (actual as never) >= (expected[0] as never) && (actual as never) <= (expected[1] as never)
    }
    case "length": {
      const length = lengthOf(actual)
      if (length === null) return false
      if (typeof expected === "number") return length === expected
      if (!isRecord(expected)) return false
      return (expected.min === undefined || length >= Number(expected.min)) &&
        (expected.max === undefined || length <= Number(expected.max))
    }
    case "isEmpty": {
      const length = lengthOf(actual)
      const empty = actual === null || actual === undefined || length === 0
      return empty === Boolean(expected)
    }
    case "null": return (actual === null) === Boolean(expected)
    case "every": return Array.isArray(actual) && actual.every((item) => matchesCondition(item, expected))
    case "some": return Array.isArray(actual) && actual.some((item) => matchesCondition(item, expected))
    default: return false
  }
}

export const matchesCondition = (actual: unknown, condition: unknown): boolean => {
  if (condition instanceof RegExp) return typeof actual === "string" && condition.test(actual)
  if (!isRecord(condition)) return deepEqual(actual, condition)

  const operators = Object.entries(condition)
  const known = new Set([
    "eq", "notEq", "neq", "gt", "gte", "lt", "lte", "notGt", "notGte", "notLt", "notLte",
    "startsWith", "endsWith", "notStartsWith", "notEndsWith", "include", "notInclude", "pattern",
    "in", "notIn", "between", "length", "isEmpty", "null", "every", "some",
  ])
  if (!operators.every(([operator]) => known.has(operator))) return deepEqual(actual, condition)
  return operators.every(([operator, expected]) => matchesOperator(actual, operator, expected))
}

const evaluateFilter = (signal: ReactionExecutionSignal): boolean => {
  const fn = (0, eval)(`(${signal.cond})`)
  if (typeof fn !== "function") throw new Error(`Reaction ${signal.reactionId} filter is not a function`)
  const conditions = fn({
    self: {
      atom: String(signal.target.atomId),
      meta: signal.target.wimp,
      path: String(signal.target.atomId),
    },
    value: structuredClone(signal.value),
  }) as unknown
  if (!isRecord(conditions)) throw new Error(`Reaction ${signal.reactionId} filter did not return conditions`)

  const actual: JsonRecord = {
    meta: signal.source.wimp,
    atom: String(signal.source.atomId),
    timestamp: signal.source.part.ts,
    op: signal.source.part.op,
    path: signal.source.part.path,
    value: signal.source.part.value,
  }
  return Object.entries(conditions).every(([key, condition]) => matchesCondition(actual[key], condition))
}

export type ReactionExecutionResult = {
  matched: boolean
  fields: Record<string, unknown>
}

export async function executeReaction(
  signal: ReactionExecutionSignal,
  energyId: string,
  massStore: EnergyMassStore,
): Promise<ReactionExecutionResult> {
  if (!evaluateFilter(signal)) return {matched: false, fields: {}}

  const fieldIdByKey = new Map(signal.writeFields.map(([fieldId, key]) => [key, String(fieldId)]))
  const fields: Record<string, unknown> = {}
  const update = (values: unknown): Record<string, unknown> => {
    if (!isRecord(values)) return fields
    for (const [key, value] of Object.entries(values)) {
      const fieldId = fieldIdByKey.get(key)
      if (fieldId !== undefined) fields[fieldId] = value
    }
    return fields
  }

  const mass = massStore.get({
    energyId,
    atomId: signal.target.atomId,
    wimp: signal.target.wimp,
    state: signal.target.state,
  })
  const fn = (0, eval)(`(${signal.update})`)
  if (typeof fn !== "function") throw new Error(`Reaction ${signal.reactionId} update is not a function`)
  await fn({
    update,
    value: structuredClone(signal.value),
    mass,
    meta: signal.source.wimp,
    atom: String(signal.source.atomId),
    timestamp: signal.source.part.ts,
    part: structuredClone(signal.source.part),
    state: signal.target.state,
    self: {
      atom: String(signal.target.atomId),
      meta: signal.target.wimp,
      path: String(signal.target.atomId),
    },
  })
  return {matched: true, fields}
}
