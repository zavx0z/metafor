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

const confirm = (router: MatrixReactionRouter, value: ReactionStateCommit, timestamp: number) => {
  router.publishState(value)
  return router.confirmState(value, timestamp)
}

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

    const emitted = confirm(router, event("event-1"), 11)
    expect(emitted.map((request) => request.targetAtomId)).toEqual([20, 30])
    expect(triggers(messages)).toEqual(emitted)
    expect(confirm(router, event("event-1"), 12)).toEqual([])
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

    expect(() => confirm(router, event("retry-event"), 1)).toThrow("enqueue interrupted")
    failSecond = false
    expect(confirm(router, event("retry-event"), 1)).toHaveLength(2)
    expect(triggers(messages).map((request) => request.targetAtomId)).toEqual([20, 30, 20, 30])
    expect(confirm(router, event("retry-event"), 1)).toEqual([])
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
    confirm(router, event("target-entered", {
      atomId: 20,
      wimp: "target/meta",
      stateId: 201,
      state: "active",
    }), 1)
    expect(messages).toEqual([])

    confirm(router, event("source-entered"), 2)
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

    const first = confirm(router, event("event-1"), 1)[0]!
    const second = confirm(router, event("event-2"), 2)[0]!
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
    const first = confirm(router, event("event-1"), 1)[0]!
    const second = confirm(router, event("event-2"), 2)[0]!
    router.confirmQueue(queue(first, "pending", 1))
    router.confirmQueue(queue(second, "queued", 2))

    states.set(20, 202)
    confirm(router, event("target-left", {
      atomId: 20, wimp: "target/meta", stateId: 202, state: "stopped",
    }), 3)
    expect(router.pending(20)).toBeNull()
    expect(router.queued(20)).toBe(0)
    expect(router.settle(commit(first, "superseded"))).toBeNull()
    expect(router.settle(commit(second, "superseded"))).toBeNull()
    confirm(router, event("event-3"), 4)
    expect(triggers(messages)).toHaveLength(2)
  })
})

test("published source events survive speculative advancement; target eligibility and exact confirmation identity remain strict", () => {
  const states = new Map([[10, 101], [20, 201]])
  const messages: ReactionMatrixRequest[] = []
  const router = new MatrixReactionRouter({currentStateId: id => states.get(id) ?? null, currentWimp, emit: request => messages.push(request)})
  router.hydrate([relation({source: {atomId: 10, wimp: "source/meta", states: [{id: 101, name: "ready"}, {id: 102, name: "done"}]}})], [[10, 100], [20, 201]])
  const first = event("first")
  router.publishState(first)
  states.set(10, 102)
  const second = event("second", {stateId: 102, state: "done"})
  router.publishState(second)
  expect(() => router.confirmState(second, 1)).toThrow("publication order")
  expect(() => router.confirmState({...first, state: "foreign"}, 1)).toThrow("exact published event")
  expect(() => router.confirmState(event("unpublished", {stateId: 102, state: "done"}), 1)).toThrow("exact published event")
  expect(router.confirmState(first, 1)).toHaveLength(1)
  expect(router.confirmState(second, 2)).toHaveLength(1)
  expect(router.confirmState(first, 3)).toEqual([])
  expect(() => router.confirmState({...first, atomId: 20}, 4)).toThrow("exact published event")
  states.set(20, 202)
  const third = event("third", {stateId: 102, state: "done"})
  router.publishState(third)
  expect(router.confirmState(third, 5)).toEqual([])
  expect(triggers(messages)).toHaveLength(2)
})

test("removal and cold hydration discard old publication proofs before an Atom identity is reused", () => {
  const router = new MatrixReactionRouter({currentStateId: () => 101, currentWimp, emit() {}})
  const old = event("old-life")
  router.publishState(old)
  router.removeAtom(10)
  expect(() => router.confirmState(old, 1)).toThrow("exact published event")
  const fresh = event("new-life")
  router.publishState(fresh)
  expect(router.confirmState(fresh, 2)).toEqual([])
  router.hydrate([], [[10, 101]])
  expect(() => router.confirmState(fresh, 3)).toThrow("exact published event")
  router.publishState(event("after-hydration"))
  expect(router.confirmState(event("after-hydration"), 4)).toEqual([])
})

test("unconfirmed publication storage fails closed at capacity and removal releases the whole Atom lane", () => {
  const router = new MatrixReactionRouter({currentStateId: () => 101, currentWimp, emit() {}})
  let count = 0
  for (; count < 10_000; count++) {
    try {router.publishState(event(`pending-${count}`))} catch (error) {expect(String(error)).toContain("capacity exceeded"); break}
  }
  expect(count).toBeLessThan(10_000)
  expect(() => router.confirmState(event("pending-0", {state: "changed"}), 1)).toThrow("exact published event")
  router.removeAtom(10)
  for (let index = 0; index < count; index++) router.publishState(event(`new-lane-${index}`))
  expect(router.confirmState(event("new-lane-0"), 2)).toEqual([])
})

test("cold event replay preserves the newer confirmed target baseline and deterministic Reaction identities", () => {
  const states = new Map([[10, 102], [20, 201]])
  const relations = [relation({source: {atomId: 10, wimp: "source/meta", states: [{id: 101, name: "ready"}, {id: 102, name: "done"}]}}),
    relation({key: "702:10:20", reactionId: 702, target: {atomId: 10, wimp: "source/meta", stateIds: [102]}, source: {atomId: 20, wimp: "target/meta", states: [{id: 201, name: "active"}]}})]
  const create = () => {
    const router = new MatrixReactionRouter({currentStateId: id => states.get(id) ?? null, currentWimp, emit() {}})
    router.hydrate(relations, [[10, 102], [20, 201]])
    return router
  }
  const first = create(), second = create()
  const old = event("old-before-birth")
  first.restoreStatePublication(old)
  const original = first.confirmState(old, 1)
  const observer = event("observer-after-birth", {atomId: 20, wimp: "target/meta", stateId: 201, state: "active"})
  first.publishState(observer)
  expect(first.confirmState(observer, 2)).toHaveLength(1)
  second.restoreStatePublication(old)
  expect(second.confirmState(old, 1)).toEqual(original)
  expect(original[0]?.reactionExecutionId).toMatch(/^reaction-[a-f0-9]{64}$/)
})

test("a late canonical State retires only redundant leading same-State publications, preserving later genuine changes", () => {
  const states = new Map([[10, 101], [20, 201]])
  const messages: ReactionMatrixRequest[] = []
  const router = new MatrixReactionRouter({currentStateId: id => states.get(id) ?? null, currentWimp, emit: request => messages.push(request)})
  router.hydrate([relation()], [[10, 100], [20, 201]])
  const speculative = event("new-noop")
  router.publishState(speculative)
  const old = event("accepted-before-crash")
  router.restoreStatePublication(old, false)
  expect(router.confirmState(old, 1)).toHaveLength(1)
  expect(router.hasPendingStatePublication(10)).toBeFalse()
  expect(router.confirmState(speculative, 2)).toEqual([])
  states.set(10, 102)
  const next = event("later-genuine-change", {stateId: 102, state: "done"})
  router.publishState(next)
  expect(router.confirmState(next, 3)).toEqual([])
  expect(triggers(messages)).toHaveLength(1)
})

test("historical State11 does not retire a genuine new State11 proposed from the already born State12", () => {
  const states = new Map([[10, 101], [20, 201]])
  const router = new MatrixReactionRouter({currentStateId: id => states.get(id) ?? null, currentWimp, emit() {}})
  router.hydrate([relation()], [[10, 102], [20, 201]])
  const fresh = event("new-12-to-11")
  router.publishState(fresh)
  const old = event("old-11-before-born-12")
  router.restoreStatePublication(old, true)
  expect(router.confirmState(old, 1)).toHaveLength(1)
  expect(router.hasPendingStatePublication(10)).toBeTrue()
  expect(router.confirmState(fresh, 2)).toHaveLength(1)
})
