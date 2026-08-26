import {describe, expect, test} from "bun:test"
import {
  REACTION_QUEUE_COMMIT_KIND,
  REACTION_RELATION_KIND,
  REACTION_STATE_COMMIT_KIND,
  isReactionRecoveryRequest,
  isReactionStartRequest,
  isReactionTriggerRequest,
  type ReactionMatrixRequest,
  type ReactionQueueCommit,
  type ReactionRelation,
  type ReactionResultCommit,
  type ReactionStateCommit,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import {MatrixReactionRouter} from "./reaction.ts"

const relation = (overrides: Partial<ReactionRelation> = {}): ReactionRelation => ({
  kind: REACTION_RELATION_KIND,
  key: "701:20:10",
  reactionId: 701,
  reactionKey: "remember",
  target: {atomId: 20, wimp: "target/meta", stateIds: [201]},
  source: {atomId: 10, wimp: "source/meta", states: [{id: 101, name: "ready"}]},
  ...overrides,
})

const event = (id: string, overrides: Partial<ReactionStateCommit> = {}): ReactionStateCommit => ({
  kind: REACTION_STATE_COMMIT_KIND,
  eventId: id,
  atomId: 10,
  wimp: "source/meta",
  stateId: 101,
  state: "ready",
  ...overrides,
})

const queue = (
  request: ReactionTriggerRequest,
  status: ReactionQueueCommit["status"],
  queueOrder: number,
): ReactionQueueCommit => ({kind: REACTION_QUEUE_COMMIT_KIND, request, status, queueOrder})

const commit = (
  request: ReactionTriggerRequest,
  status: ReactionResultCommit["status"] = "committed",
): ReactionResultCommit => ({
  reactionExecutionId: request.reactionExecutionId,
  relationKey: request.relationKey,
  reactionId: request.reactionId,
  energy: status === "superseded" ? null : "energy-test",
  status,
})

const currentWimp = (atomId: number): string | null =>
  atomId === 10 ? "source/meta" : atomId === 20 ? "target/meta" : atomId === 30 ? "other/meta" : null

const triggers = (messages: readonly ReactionMatrixRequest[]): ReactionTriggerRequest[] =>
  messages.filter(isReactionTriggerRequest)

describe("Matrix durable Reaction routing", () => {
  test("emits every matching enqueue before confirmed State handling returns", () => {
    const states = new Map([[10, 101], [20, 201], [30, 301]])
    const messages: ReactionMatrixRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([
      relation(),
      relation({
        key: "702:30:10",
        reactionId: 702,
        reactionKey: "mirror",
        target: {atomId: 30, wimp: "other/meta", stateIds: [301]},
      }),
    ], [[10, 101], [20, 201], [30, 301]])

    const emitted = router.confirmState(event("event-1"), 11)
    expect(emitted.map((request) => request.targetAtomId)).toEqual([20, 30])
    expect(triggers(messages)).toEqual(emitted)
    expect(router.confirmState(event("event-1"), 12)).toEqual([])
  })

  test("re-emits the complete match set when one enqueue callback fails", () => {
    const states = new Map([[10, 101], [20, 201], [30, 301]])
    const messages: ReactionMatrixRequest[] = []
    let nextExecution = 0
    let failSecond = true
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      executionId: () => `retry-${++nextExecution}`,
      emit: (request) => {
        messages.push(request)
        if (failSecond && triggers(messages).length === 2) throw new Error("enqueue interrupted")
      },
    })
    router.hydrate([
      relation(),
      relation({
        key: "702:30:10",
        reactionId: 702,
        target: {atomId: 30, wimp: "other/meta", stateIds: [301]},
      }),
    ], [[10, 101], [20, 201], [30, 301]])

    expect(() => router.confirmState(event("retry-event"), 1)).toThrow("enqueue interrupted")
    failSecond = false
    expect(router.confirmState(event("retry-event"), 1)).toHaveLength(2)
    expect(triggers(messages).map((request) => request.targetAtomId)).toEqual([20, 30, 20, 30])
    expect(router.confirmState(event("retry-event"), 1)).toEqual([])
  })

  test("does not replay an already current source State when target starts listening", () => {
    const states = new Map([[10, 101], [20, 202]])
    const messages: ReactionMatrixRequest[] = []
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
    })
    router.hydrate([relation()], [[10, 101], [20, 202]])

    states.set(20, 201)
    router.confirmState(event("target-entered", {
      atomId: 20,
      wimp: "target/meta",
      stateId: 201,
      state: "active",
    }), 1)
    expect(messages).toEqual([])

    router.confirmState(event("source-entered"), 2)
    expect(triggers(messages)).toHaveLength(1)
  })

  test("keeps exact FIFO while every later event is already durable", () => {
    const states = new Map([[10, 101], [20, 201]])
    const messages: ReactionMatrixRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([relation()], [[10, 101], [20, 201]])

    const first = router.confirmState(event("event-1"), 1)[0]!
    const second = router.confirmState(event("event-2"), 2)[0]!
    expect(triggers(messages).map((request) => request.eventId)).toEqual(["event-1", "event-2"])

    expect(router.confirmQueue(queue(first, "pending", 1))).toBeNull()
    expect(router.confirmQueue(queue(second, "queued", 2))).toBeNull()
    expect(router.pending(20)).toBe(first.reactionExecutionId)
    expect(router.queued(20)).toBe(1)

    const start = router.settle(commit(first))
    if (!start) throw new Error("Matrix did not start queued Reaction")
    expect(start).toMatchObject({kind: "reaction-start", reactionExecutionId: second.reactionExecutionId})
    expect(messages.filter(isReactionStartRequest)).toEqual([start])
    router.confirmQueue(queue(second, "pending", 2))
    expect(router.pending(20)).toBe(second.reactionExecutionId)
    expect(router.queued(20)).toBe(0)
  })

  test("learns an accepted-before-crash enqueue from a late Boundary queue commit", () => {
    const states = new Map([[10, 101], [20, 201]])
    const messages: ReactionMatrixRequest[] = []
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
    })
    router.hydrate([relation()], [[10, 101], [20, 201]], [])
    const request: ReactionTriggerRequest = {
      kind: "reaction-trigger",
      reactionExecutionId: "late-execution",
      relationKey: relation().key,
      reactionId: relation().reactionId,
      eventId: "accepted-before-crash",
      targetAtomId: 20,
      source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"},
      timestamp: 5,
    }

    const start = router.confirmQueue(queue(request, "queued", 7))
    expect(start).toMatchObject({kind: "reaction-start", reactionExecutionId: "late-execution"})
    expect(router.queued(20)).toBe(1)
  })

  test("hydrates pending and queued work without replaying source State", () => {
    const states = new Map([[10, 101], [20, 201]])
    const messages: ReactionMatrixRequest[] = []
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
    })
    const first: ReactionTriggerRequest = {
      kind: "reaction-trigger", reactionExecutionId: "old-pending",
      relationKey: relation().key, reactionId: 701, eventId: "old-event-1", targetAtomId: 20,
      source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"}, timestamp: 1,
    }
    const second: ReactionTriggerRequest = {
      ...first, reactionExecutionId: "old-queued", eventId: "old-event-2", timestamp: 2,
    }
    router.hydrate([relation()], [[10, 101], [20, 201]], [
      {queue: queue(first, "pending", 1), energy: "old-energy"},
      {queue: queue(second, "queued", 2), energy: null},
    ])
    expect(messages).toEqual([])
    expect(router.resumeColdStart().filter(isReactionRecoveryRequest)).toEqual([{
      kind: "reaction-recovery",
      reactionExecutionId: "old-pending",
      relationKey: first.relationKey,
      reactionId: first.reactionId,
      targetAtomId: 20,
    }])
    const start = router.settle(commit(first, "superseded"))
    expect(start).toMatchObject({kind: "reaction-start", reactionExecutionId: "old-queued"})
  })

  test("drops durable local work when target leaves every active State", () => {
    const states = new Map([[10, 101], [20, 201]])
    const messages: ReactionMatrixRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => messages.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([relation()], [[10, 101], [20, 201]])
    const first = router.confirmState(event("event-1"), 1)[0]!
    const second = router.confirmState(event("event-2"), 2)[0]!
    router.confirmQueue(queue(first, "pending", 1))
    router.confirmQueue(queue(second, "queued", 2))

    states.set(20, 202)
    router.confirmState(event("target-left", {
      atomId: 20, wimp: "target/meta", stateId: 202, state: "stopped",
    }), 3)
    expect(router.pending(20)).toBeNull()
    expect(router.queued(20)).toBe(0)
    expect(router.settle(commit(first, "superseded"))).toBeNull()
    expect(router.settle(commit(second, "superseded"))).toBeNull()
    router.confirmState(event("event-3"), 4)
    expect(triggers(messages)).toHaveLength(2)
  })
})
