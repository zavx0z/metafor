import type {EnergyMassStore} from "@energy/types/mass"
import type {ReactionExecutionSignal} from "shared/protocol/force/reaction"

type JsonRecord = Record<string, unknown>

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Missing Boundary-declared runtime dependency is a system invariant failure. */
export class ReactionInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ReactionInvariantError"
  }
}

const requireMassDependencies = (
  signal: ReactionExecutionSignal,
  mass: Record<string, unknown>,
): Record<string, unknown> => {
  const read = new Set(signal.massRead)
  const write = new Set(signal.massWrite)
  const result: Record<string, unknown> = {}
  for (const key of new Set([...read, ...write])) {
    const handle = mass[key]
    if (!isRecord(handle)) {
      throw new ReactionInvariantError(`Reaction ${signal.reactionId} declared Mass "${key}" is unavailable`)
    }
    if (read.has(key) && (typeof handle.readBytes !== "function" ||
        typeof handle.readText !== "function" || typeof handle.readJson !== "function")) {
      throw new ReactionInvariantError(`Reaction ${signal.reactionId} declared Mass read "${key}" is unavailable`)
    }
    if (write.has(key) && typeof handle.write !== "function") {
      throw new ReactionInvariantError(`Reaction ${signal.reactionId} declared Mass write "${key}" is unavailable`)
    }
    result[key] = {
      ...(read.has(key) ? {
        readBytes: (...args: unknown[]) => Reflect.apply(handle.readBytes as Function, handle, args),
        readText: (...args: unknown[]) => Reflect.apply(handle.readText as Function, handle, args),
        readJson: (...args: unknown[]) => Reflect.apply(handle.readJson as Function, handle, args),
      } : {}),
      ...(write.has(key) ? {
        write: (...args: unknown[]) => Reflect.apply(handle.write as Function, handle, args),
      } : {}),
    }
  }
  return result
}

const requireReadFields = (signal: ReactionExecutionSignal): Record<string, unknown> => {
  const value: Record<string, unknown> = {}
  const fieldIds = new Set<number>()
  for (const [fieldId, key, current] of signal.readFields) {
    if (fieldIds.has(fieldId) || key.trim().length === 0 || Object.hasOwn(value, key)) {
      throw new ReactionInvariantError(`Reaction ${signal.reactionId} read Field snapshot is invalid`)
    }
    fieldIds.add(fieldId)
    value[key] = structuredClone(current)
  }
  return value
}

export type ReactionExecutionResult = {
  fields: Record<string, unknown>
}

/** Executes one already resolved State observation beside the target Atom Mass. */
export async function executeReaction(
  signal: ReactionExecutionSignal,
  energyId: string,
  massStore: EnergyMassStore,
): Promise<ReactionExecutionResult> {
  const fieldIdByKey = new Map(signal.writeFields.map(([fieldId, key]) => [key, String(fieldId)]))
  if (fieldIdByKey.size !== signal.writeFields.length) {
    throw new ReactionInvariantError(`Reaction ${signal.reactionId} write Field set is ambiguous`)
  }
  const value = requireReadFields(signal)
  const fields: Record<string, unknown> = {}
  const update = (values: unknown): Record<string, unknown> => {
    if (!isRecord(values)) return fields
    for (const [key, next] of Object.entries(values)) {
      const fieldId = fieldIdByKey.get(key)
      if (fieldId === undefined) {
        throw new Error(`Reaction ${signal.reactionId} cannot update undeclared Field "${key}"`)
      }
      fields[fieldId] = next
    }
    return fields
  }

  const availableMass = massStore.get({
    energyId,
    atomId: signal.target.atomId,
    wimp: signal.target.wimp,
    state: signal.target.state,
  })
  const mass = requireMassDependencies(signal, availableMass)
  const fn = (0, eval)(`(${signal.updateSource})`)
  if (typeof fn !== "function") throw new Error(`Reaction ${signal.reactionId} source is not a function`)
  await fn({
    observation: {
      id: signal.eventId,
      source: {
        atom: `atom:${signal.source.atomId}`,
        meta: signal.source.wimp,
        state: signal.source.state,
      },
      timestamp: signal.timestamp,
    },
    update,
    value,
    mass,
    state: signal.target.state,
    self: {
      atom: String(signal.target.atomId),
      meta: signal.target.wimp,
      path: String(signal.target.atomId),
    },
  })
  return {fields}
}
