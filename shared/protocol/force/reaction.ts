/**
Closed Force protocol for confirmed-State Reaction routing.

Boundary publishes exact relations and confirmed State events. Matrix derives
activity, asks Boundary to durably enqueue every match, then separately starts
the exact FIFO head confirmed back by Boundary. Only the resulting registered
signal is claimable by Energy. Terminal copies release Matrix's per-target lane.

@packageDocumentation
*/

import {isParticleTimestamp} from "./particle.ts"

export const REACTION_RELATION_KIND = "reaction-relation" as const
export const REACTION_RELATION_PATH = "reaction-link" as const
export const REACTION_STATE_COMMIT_KIND = "state-commit" as const
export const REACTION_TRIGGER_KIND = "reaction-trigger" as const
export const REACTION_QUEUE_COMMIT_KIND = "reaction-queue" as const
export const REACTION_START_KIND = "reaction-start" as const
export const REACTION_RECOVERY_KIND = "reaction-recovery" as const
export const REACTION_SIGNAL_KIND = "reaction" as const
export const REACTION_CLAIM_KIND = "reaction-claim" as const

export type ReactionStateIdentity = {
  id: number
  name: string
}

/**
One Boundary-resolved potential relation.

It persists while target State changes. Matrix alone derives current activity
from `target.stateIds`; adding the relation never replays source current State.
*/
export type ReactionRelation = {
  kind: typeof REACTION_RELATION_KIND
  key: string
  reactionId: number
  reactionKey: string
  target: {
    atomId: number
    wimp: string
    stateIds: number[]
  }
  source: {
    atomId: number
    wimp: string
    states: ReactionStateIdentity[]
  }
}

/**
Boundary confirmation of one actual new State.

`eventId` is replay-safe. Previous State is intentionally absent, and a
same-State Process retrigger does not create this message.
*/
export type ReactionStateCommit = {
  kind: typeof REACTION_STATE_COMMIT_KIND
  eventId: string
  atomId: number
  wimp: string
  stateId: number
  state: string
}

/**
Matrix request for Boundary to durably enqueue one matched Reaction.

This request is not Energy-ready and never snapshots dependencies. Boundary
validates the relation and event, persists an exact FIFO position and confirms
it back to Matrix before a later {@link ReactionStartRequest} may promote it.
*/
export type ReactionTriggerRequest = {
  kind: typeof REACTION_TRIGGER_KIND
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  eventId: string
  targetAtomId: number
  source: {
    atomId: number
    wimp: string
    stateId: number
    state: string
  }
  timestamp: number
}

/**
Boundary confirmation that one Matrix match is durably ordered for its target.

`queued` carries no Field snapshot or resolved Mass access set. Boundary creates
them only when the exact head becomes `pending`, after every earlier terminal
result. Mass content itself remains lazy in Energy.
*/
export type ReactionQueueCommit = {
  kind: typeof REACTION_QUEUE_COMMIT_KIND
  queueOrder: number
  status: "queued" | "pending"
  request: ReactionTriggerRequest
}

/** Matrix instruction to start the exact durable FIFO head. */
export type ReactionStartRequest = {
  kind: typeof REACTION_START_KIND
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  targetAtomId: number
}

/**
Cold-start instruction for one Boundary-persisted pending execution.

Boundary reoffers an unclaimed signal with the same identity. A previously
claimed execution is instead superseded because its old action may already have
written Mass.
*/
export type ReactionRecoveryRequest = {
  kind: typeof REACTION_RECOVERY_KIND
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  targetAtomId: number
}

export type ReactionMatrixRequest =
  | ReactionTriggerRequest
  | ReactionStartRequest
  | ReactionRecoveryRequest

/** Boundary-validated execution offered to Energy after durable registration. */
export type ReactionExecutionSignal = {
  kind: typeof REACTION_SIGNAL_KIND
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  reactionKey: string
  eventId: string
  target: {
    atomId: number
    wimp: string
    stateId: number
    state: string
  }
  source: {
    atomId: number
    wimp: string
    stateId: number
    state: string
  }
  timestamp: number
  /** Snapshot of exactly the target Fields declared by Reaction read. */
  readFields: Array<[fieldId: number, key: string, value: unknown]>
  writeFields: Array<[fieldId: number, key: string]>
  massRead: string[]
  massWrite: string[]
  updateSource: string
}

export type ReactionExecutionClaim = {
  kind: typeof REACTION_CLAIM_KIND
  energy: string
  reactionExecutionId: string
}

export type ReactionResultProposal = {
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  fields: Record<string, unknown>
  error?: string
}

export type ReactionResultCommit = {
  reactionExecutionId: string
  relationKey: string
  reactionId: number
  energy: string | null
  status: "committed" | "failed" | "superseded"
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Reflect.ownKeys(value)
  return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key))
}

const isStateIdentity = (value: unknown): value is ReactionStateIdentity =>
  isRecord(value) && exactKeys(value, ["id", "name"]) && positiveId(value.id) && nonEmptyString(value.name)

export const isReactionExecutionId = (value: unknown): value is string => nonEmptyString(value)

export const isReactionRelation = (value: unknown): value is ReactionRelation => {
  if (!isRecord(value) || !exactKeys(value, ["kind", "key", "reactionId", "reactionKey", "target", "source"])) return false
  if (value.kind !== REACTION_RELATION_KIND || !nonEmptyString(value.key) || !positiveId(value.reactionId) || !nonEmptyString(value.reactionKey)) return false
  if (!isRecord(value.target) || !exactKeys(value.target, ["atomId", "wimp", "stateIds"]) ||
      !positiveId(value.target.atomId) || !nonEmptyString(value.target.wimp) ||
      !Array.isArray(value.target.stateIds) || value.target.stateIds.length === 0 ||
      !value.target.stateIds.every(positiveId) || new Set(value.target.stateIds).size !== value.target.stateIds.length) return false
  if (!isRecord(value.source) || !exactKeys(value.source, ["atomId", "wimp", "states"]) ||
      !positiveId(value.source.atomId) || !nonEmptyString(value.source.wimp) ||
      value.source.atomId === value.target.atomId || !Array.isArray(value.source.states) ||
      value.source.states.length === 0 || !value.source.states.every(isStateIdentity)) return false
  const sourceStateIds = value.source.states.map((state) => state.id)
  if (new Set(sourceStateIds).size !== sourceStateIds.length) return false
  return true
}

export const isReactionStateCommit = (value: unknown): value is ReactionStateCommit =>
  isRecord(value) && exactKeys(value, ["kind", "eventId", "atomId", "wimp", "stateId", "state"]) &&
  value.kind === REACTION_STATE_COMMIT_KIND && nonEmptyString(value.eventId) && positiveId(value.atomId) &&
  nonEmptyString(value.wimp) && positiveId(value.stateId) && nonEmptyString(value.state)

export const isReactionTriggerRequest = (value: unknown): value is ReactionTriggerRequest =>
  isRecord(value) && exactKeys(value, [
    "kind", "reactionExecutionId", "relationKey", "reactionId", "eventId", "targetAtomId", "source", "timestamp",
  ]) && value.kind === REACTION_TRIGGER_KIND && isReactionExecutionId(value.reactionExecutionId) &&
  nonEmptyString(value.relationKey) && positiveId(value.reactionId) && nonEmptyString(value.eventId) &&
  positiveId(value.targetAtomId) && isParticleTimestamp(value.timestamp) && isRecord(value.source) &&
  exactKeys(value.source, ["atomId", "wimp", "stateId", "state"]) && positiveId(value.source.atomId) &&
  nonEmptyString(value.source.wimp) && positiveId(value.source.stateId) && nonEmptyString(value.source.state)

export const isReactionQueueCommit = (value: unknown): value is ReactionQueueCommit =>
  isRecord(value) && exactKeys(value, ["kind", "queueOrder", "status", "request"]) &&
  value.kind === REACTION_QUEUE_COMMIT_KIND && positiveId(value.queueOrder) &&
  (value.status === "queued" || value.status === "pending") && isReactionTriggerRequest(value.request)

const isReactionControlRequest = (
  value: unknown,
  kind: typeof REACTION_START_KIND | typeof REACTION_RECOVERY_KIND,
): value is ReactionStartRequest | ReactionRecoveryRequest =>
  isRecord(value) && exactKeys(value, [
    "kind", "reactionExecutionId", "relationKey", "reactionId", "targetAtomId",
  ]) && value.kind === kind && isReactionExecutionId(value.reactionExecutionId) &&
  nonEmptyString(value.relationKey) && positiveId(value.reactionId) && positiveId(value.targetAtomId)

export const isReactionStartRequest = (value: unknown): value is ReactionStartRequest =>
  isReactionControlRequest(value, REACTION_START_KIND)

export const isReactionRecoveryRequest = (value: unknown): value is ReactionRecoveryRequest =>
  isReactionControlRequest(value, REACTION_RECOVERY_KIND)

export const isReactionExecutionSignal = (value: unknown): value is ReactionExecutionSignal => {
  if (!isRecord(value) || !exactKeys(value, [
    "kind", "reactionExecutionId", "relationKey", "reactionId", "reactionKey", "eventId", "target", "source",
    "timestamp", "readFields", "writeFields", "massRead", "massWrite", "updateSource",
  ])) return false
  if (value.kind !== REACTION_SIGNAL_KIND || !isReactionExecutionId(value.reactionExecutionId) ||
      !nonEmptyString(value.relationKey) || !positiveId(value.reactionId) || !nonEmptyString(value.reactionKey) ||
      !nonEmptyString(value.eventId) || !isParticleTimestamp(value.timestamp) || !Array.isArray(value.readFields) ||
      !Array.isArray(value.writeFields) || !Array.isArray(value.massRead) || !Array.isArray(value.massWrite) ||
      !nonEmptyString(value.updateSource)) return false
  if (!isRecord(value.target) || !exactKeys(value.target, ["atomId", "wimp", "stateId", "state"]) ||
      !positiveId(value.target.atomId) || !nonEmptyString(value.target.wimp) ||
      !positiveId(value.target.stateId) || !nonEmptyString(value.target.state)) return false
  if (!isRecord(value.source) || !exactKeys(value.source, ["atomId", "wimp", "stateId", "state"]) ||
      !positiveId(value.source.atomId) || !nonEmptyString(value.source.wimp) ||
      !positiveId(value.source.stateId) || !nonEmptyString(value.source.state)) return false
  if (!value.readFields.every((item) => Array.isArray(item) && item.length === 3 && positiveId(item[0]) && nonEmptyString(item[1]))) return false
  if (!value.writeFields.every((item) => Array.isArray(item) && item.length === 2 && positiveId(item[0]) && nonEmptyString(item[1]))) return false
  return value.massRead.every(nonEmptyString) && value.massWrite.every(nonEmptyString)
}

export const isReactionExecutionClaim = (value: unknown): value is ReactionExecutionClaim =>
  isRecord(value) && exactKeys(value, ["kind", "energy", "reactionExecutionId"]) &&
  value.kind === REACTION_CLAIM_KIND && nonEmptyString(value.energy) && isReactionExecutionId(value.reactionExecutionId)

export const isReactionResultProposal = (value: unknown): value is ReactionResultProposal =>
  isRecord(value) && exactKeys(value, value.error === undefined
    ? ["reactionExecutionId", "relationKey", "reactionId", "fields"]
    : ["reactionExecutionId", "relationKey", "reactionId", "fields", "error"]) &&
  isReactionExecutionId(value.reactionExecutionId) && nonEmptyString(value.relationKey) && positiveId(value.reactionId) &&
  isRecord(value.fields) && (value.error === undefined || typeof value.error === "string")

export const isReactionResultCommit = (value: unknown): value is ReactionResultCommit =>
  isRecord(value) && exactKeys(value, ["reactionExecutionId", "relationKey", "reactionId", "energy", "status"]) &&
  isReactionExecutionId(value.reactionExecutionId) && nonEmptyString(value.relationKey) && positiveId(value.reactionId) &&
  (value.energy === null || nonEmptyString(value.energy)) &&
  (value.status === "committed" || value.status === "failed" || value.status === "superseded")
