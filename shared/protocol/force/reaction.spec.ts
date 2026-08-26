import {describe, expect, test} from "bun:test"
import {
  REACTION_RELATION_KIND,
  REACTION_QUEUE_COMMIT_KIND,
  REACTION_RECOVERY_KIND,
  REACTION_SIGNAL_KIND,
  REACTION_START_KIND,
  REACTION_STATE_COMMIT_KIND,
  REACTION_TRIGGER_KIND,
  isReactionExecutionSignal,
  isReactionQueueCommit,
  isReactionRecoveryRequest,
  isReactionRelation,
  isReactionStartRequest,
  isReactionStateCommit,
  isReactionTriggerRequest,
} from "./reaction.ts"

const trigger = () => ({
  kind: REACTION_TRIGGER_KIND,
  reactionExecutionId: "execution-1",
  relationKey: "701:20:10",
  reactionId: 701,
  eventId: "event-1",
  targetAtomId: 20,
  source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"},
  timestamp: 100,
} as const)

describe("Reaction Force protocol", () => {
  test("validates one exact potential relation", () => {
    expect(isReactionRelation({
      kind: REACTION_RELATION_KIND,
      key: "701:20:10",
      reactionId: 701,
      reactionKey: "remember",
      target: {atomId: 20, wimp: "target/meta", stateIds: [201]},
      source: {atomId: 10, wimp: "source/meta", states: [{id: 101, name: "ready"}]},
    })).toBe(true)
  })

  test("accepts only confirmed new State without previous State", () => {
    const current = {
      kind: REACTION_STATE_COMMIT_KIND,
      eventId: "event-1",
      atomId: 10,
      wimp: "source/meta",
      stateId: 101,
      state: "ready",
    }
    expect(isReactionStateCommit(current)).toBe(true)
    expect(isReactionStateCommit({...current, previous: "idle"})).toBe(false)
  })

  test("keeps Matrix trigger separate from Boundary execution signal", () => {
    expect(isReactionTriggerRequest(trigger())).toBe(true)

    const signal = {
      kind: REACTION_SIGNAL_KIND,
      reactionExecutionId: "execution-1",
      relationKey: "701:20:10",
      reactionId: 701,
      reactionKey: "remember",
      eventId: "event-1",
      target: {atomId: 20, wimp: "target/meta", stateId: 201, state: "idle"},
      source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"},
      timestamp: 100,
      readFields: [[201, "count", 1]],
      writeFields: [[202, "result"]],
      massRead: ["history"],
      massWrite: ["history"],
      updateSource: "({update}) => update({result: 1})",
    }
    expect(isReactionExecutionSignal(signal)).toBe(true)
    expect(isReactionExecutionSignal({...signal, part: {op: "replace"}})).toBe(false)
    expect(isReactionExecutionSignal({...signal, energy: {}})).toBe(false)
  })

  test("closes durable queue commits and Matrix control requests", () => {
    const queue = {
      kind: REACTION_QUEUE_COMMIT_KIND,
      queueOrder: 2,
      status: "queued",
      request: trigger(),
    }
    expect(isReactionQueueCommit(queue)).toBe(true)
    expect(isReactionQueueCommit({...queue, queueOrder: 0})).toBe(false)
    expect(isReactionQueueCommit({...queue, signal: {}})).toBe(false)

    const control = {
      reactionExecutionId: "execution-1",
      relationKey: "701:20:10",
      reactionId: 701,
      targetAtomId: 20,
    }
    expect(isReactionStartRequest({kind: REACTION_START_KIND, ...control})).toBe(true)
    expect(isReactionRecoveryRequest({kind: REACTION_RECOVERY_KIND, ...control})).toBe(true)
    expect(isReactionStartRequest({kind: REACTION_START_KIND, ...control, eventId: "event-1"})).toBe(false)
  })
})
