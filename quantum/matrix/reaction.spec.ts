import {describe, expect, test} from "bun:test"
import {
  REACTION_RELATION_KIND,
  REACTION_STATE_COMMIT_KIND,
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

const commit = (request: ReactionTriggerRequest, status: ReactionResultCommit["status"] = "committed"): ReactionResultCommit => ({
  reactionExecutionId: request.reactionExecutionId,
  relationKey: request.relationKey,
  reactionId: request.reactionId,
  energy: status === "superseded" ? null : "energy-test",
  status,
})

const currentWimp = (atomId: number): string | null =>
  atomId === 10 ? "source/meta" : atomId === 20 ? "target/meta" : atomId === 30 ? "other/meta" : null

describe("Matrix Reaction routing", () => {
  test("routes only confirmed matching source States while target is active", () => {
    const states = new Map([[10, 101], [20, 201]])
    const requests: ReactionTriggerRequest[] = []
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
      executionId: () => "execution-1",
    })

    router.hydrate([relation()], [[10, 101], [20, 201]])
    expect(requests).toEqual([])
    expect(router.confirmState(event("event-1"), 11)).toHaveLength(1)
    expect(requests).toEqual([{
      kind: "reaction-trigger",
      reactionExecutionId: "execution-1",
      relationKey: "701:20:10",
      reactionId: 701,
      eventId: "event-1",
      targetAtomId: 20,
      source: {atomId: 10, wimp: "source/meta", stateId: 101, state: "ready"},
      timestamp: 11,
    }])

    expect(router.confirmState(event("event-1"), 12)).toEqual([])
    states.set(10, 102)
    expect(router.confirmState(event("event-other", {stateId: 102, state: "idle"}), 13)).toEqual([])
  })

  test("does not replay an already current source State when target starts listening", () => {
    const states = new Map([[10, 101], [20, 202]])
    const requests: ReactionTriggerRequest[] = []
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
    })
    router.hydrate([relation()], [[10, 101], [20, 202]])

    states.set(20, 201)
    router.confirmState(event("target-entered", {
      atomId: 20,
      wimp: "target/meta",
      stateId: 201,
      state: "active",
    }), 1)
    expect(requests).toEqual([])

    router.confirmState(event("source-entered"), 2)
    expect(requests).toHaveLength(1)
  })

  test("serializes every source transition per target Atom", () => {
    const states = new Map([[10, 101], [20, 201]])
    const requests: ReactionTriggerRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([relation()], [[10, 101], [20, 201]])

    router.confirmState(event("event-1"), 1)
    router.confirmState(event("event-2"), 2)
    expect(requests.map((request) => request.eventId)).toEqual(["event-1"])
    expect(router.queued(20)).toBe(1)

    const next = router.settle(commit(requests[0]!))
    expect(next?.eventId).toBe("event-2")
    expect(requests.map((request) => request.eventId)).toEqual(["event-1", "event-2"])
    expect(router.queued(20)).toBe(0)
  })

  test("drops queued and pending work when target leaves every active State", () => {
    const states = new Map([[10, 101], [20, 201]])
    const requests: ReactionTriggerRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([relation()], [[10, 101], [20, 201]])
    router.confirmState(event("event-1"), 1)
    router.confirmState(event("event-2"), 2)

    states.set(20, 202)
    router.confirmState(event("target-left", {
      atomId: 20,
      wimp: "target/meta",
      stateId: 202,
      state: "stopped",
    }), 3)

    expect(router.pending(20)).toBeNull()
    expect(router.queued(20)).toBe(0)
    expect(router.settle(commit(requests[0]!, "superseded"))).toBeNull()
    router.confirmState(event("event-3"), 4)
    expect(requests).toHaveLength(1)
  })

  test("does not start the next queued Reaction after Matrix already computed target exit", () => {
    const states = new Map([[10, 101], [20, 201]])
    const requests: ReactionTriggerRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
      executionId: () => `execution-${++nextExecution}`,
    })
    router.hydrate([relation()], [[10, 101], [20, 201]])
    router.confirmState(event("event-1"), 1)
    router.confirmState(event("event-2"), 2)

    states.set(20, 202)
    expect(router.settle(commit(requests[0]!))).toBeNull()
    expect(requests).toHaveLength(1)
    expect(router.queued(20)).toBe(0)
  })

  test("allows different target Atom lanes to run in parallel", () => {
    const states = new Map([[10, 101], [20, 201], [30, 301]])
    const requests: ReactionTriggerRequest[] = []
    let nextExecution = 0
    const router = new MatrixReactionRouter({
      currentStateId: (atomId) => states.get(atomId) ?? null,
      currentWimp,
      emit: (request) => requests.push(request),
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

    router.confirmState(event("event-1"), 1)
    expect(requests.map((request) => request.targetAtomId)).toEqual([20, 30])
  })
})
