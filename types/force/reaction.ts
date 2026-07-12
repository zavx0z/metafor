import type {ParticleOperation} from "./particle.ts"

export const REACTION_SIGNAL_KIND = "reaction" as const
export const REACTION_CLAIM_KIND = "reaction-claim" as const

export type ReactionEventPart = {
  op: ParticleOperation
  path: string
  value?: unknown
  from?: string | number
}

export type ReactionExecutionSignal = {
  kind: typeof REACTION_SIGNAL_KIND
  reactionExecutionId: string
  reactionId: number
  target: {
    actorId: number
    wimp: string
    state: string
  }
  source: {
    actorId: number
    wimp: string
    timestamp: number
    part: ReactionEventPart
  }
  value: Record<string, unknown>
  writeFields: Array<[fieldId: number, key: string]>
  cond: string
  update: string
}

export type ReactionExecutionClaim = {
  kind: typeof REACTION_CLAIM_KIND
  energy: string
  reactionExecutionId: string
}

export type ReactionResultProposal = {
  reactionExecutionId: string
  reactionId: number
  fields: Record<string, unknown>
  error?: string
}

export type ReactionResultCommit = {
  reactionExecutionId: string
  reactionId: number
  energy: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

export const isReactionExecutionId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

export const isReactionExecutionSignal = (value: unknown): value is ReactionExecutionSignal => {
  if (!isRecord(value) || value.kind !== REACTION_SIGNAL_KIND) return false
  if (!isReactionExecutionId(value.reactionExecutionId) || !positiveId(value.reactionId)) return false
  if (!isRecord(value.target) || !positiveId(value.target.actorId) || typeof value.target.wimp !== "string" || typeof value.target.state !== "string") return false
  if (!isRecord(value.source) || !positiveId(value.source.actorId) || typeof value.source.wimp !== "string" || typeof value.source.timestamp !== "number" || !isRecord(value.source.part)) return false
  if (!isRecord(value.value) || !Array.isArray(value.writeFields) || typeof value.cond !== "string" || typeof value.update !== "string") return false
  return value.writeFields.every((item) =>
    Array.isArray(item) && item.length === 2 && positiveId(item[0]) && typeof item[1] === "string",
  )
}

export const isReactionExecutionClaim = (value: unknown): value is ReactionExecutionClaim =>
  isRecord(value) && value.kind === REACTION_CLAIM_KIND &&
  typeof value.energy === "string" && value.energy.trim().length > 0 &&
  isReactionExecutionId(value.reactionExecutionId)

export const isReactionResultProposal = (value: unknown): value is ReactionResultProposal =>
  isRecord(value) && isReactionExecutionId(value.reactionExecutionId) &&
  positiveId(value.reactionId) && isRecord(value.fields) &&
  (value.error === undefined || typeof value.error === "string")
