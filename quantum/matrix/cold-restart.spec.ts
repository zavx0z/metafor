import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import type {Particle, SourcedParticle} from "shared/protocol/force/particle"
import {
  REACTION_QUEUE_COMMIT_KIND,
  REACTION_RELATION_KIND,
  isReactionRecoveryRequest,
  isReactionStartRequest,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import {
  createForceTestFixture,
  type ForceTestClient,
  type ForceTestFixture,
} from "../dark/force/fixture.ts"
import {prepareMatrixBirth} from "./birth.ts"
import {weak$} from "./weak"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
type ParticleInput = Omit<SourcedParticle, "ts"> & {ts?: number}

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const initial = (): BoundaryInitialState => ({
  version: 3,
  reactionRelations: [],
  unfinishedReactionExecutions: [],
  pendingProcessExecutions: [{
    executionId: "execution-before-cold-birth",
    atom: 17,
    process: 501,
    state: "ready",
  }],
  atoms: [{
    id: 17,
    wimp: "owner/cold-restart",
    values: [{field: 101, valueId: 1001, value: "payload"}],
    state: 201,
  }],
  declarations: [
    {src: "owner/cold-restart", section: "fields", localId: "1", value: {id: 101, key: "input", type: "string", default: "", position: 0}},
    {src: "owner/cold-restart", section: "states", localId: "1", value: {id: 201, name: "ready", position: 0}},
    {src: "owner/cold-restart", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
  ],
})

const reactionInitial = (): BoundaryInitialState => {
  const first: ReactionTriggerRequest = {
    kind: "reaction-trigger",
    reactionExecutionId: "reaction-before-cold-birth",
    relationKey: "reaction:701:target:20:source:10",
    reactionId: 701,
    eventId: "reaction-event-before-cold-birth",
    targetAtomId: 20,
    source: {atomId: 10, wimp: "owner/source", stateId: 101, state: "ready"},
    timestamp: 1,
  }
  const second: ReactionTriggerRequest = {
    ...first,
    reactionExecutionId: "reaction-queued-before-cold-birth",
    eventId: "reaction-event-queued-before-cold-birth",
    timestamp: 2,
  }
  return {
    version: 3,
    pendingProcessExecutions: [],
    atoms: [
      {id: 10, wimp: "owner/source", values: [], state: 101},
      {id: 20, wimp: "owner/target", values: [], state: 201},
    ],
    declarations: [
      {src: "owner/source", section: "states", localId: "1", value: {id: 101, name: "ready", position: 0}},
      {src: "owner/target", section: "states", localId: "1", value: {id: 201, name: "listening", position: 0}},
    ],
    reactionRelations: [{
      kind: REACTION_RELATION_KIND,
      key: first.relationKey,
      reactionId: 701,
      reactionKey: "remember",
      target: {atomId: 20, wimp: "owner/target", stateIds: [201]},
      source: {atomId: 10, wimp: "owner/source", states: [{id: 101, name: "ready"}]},
    }],
    unfinishedReactionExecutions: [
      {
        queue: {kind: REACTION_QUEUE_COMMIT_KIND, queueOrder: 1, status: "pending", request: first},
        energy: "energy-before-cold-birth",
      },
      {
        queue: {kind: REACTION_QUEUE_COMMIT_KIND, queueOrder: 2, status: "queued", request: second},
        energy: null,
      },
    ],
  }
}

const send = (fixture: ForceTestFixture, client: ForceTestClient, particle: ParticleInput): void =>
  fixture.impulse(client, {parts: [{ts: 1, ...particle}] as [Particle]})

describe("Matrix cold execution replacement", () => {
  test("publishes a fresh execution and ignores the old claim", async () => {
    const fixture = createForceTestFixture()
    try {
      weak$.dispose()
      await prepareMatrixBirth(initial())
      const from = fixture.messages.length
      const waiting = fixture.nextClient("matrix")
      const runtime = await import(`./matrix.ts?cold-restart=${crypto.randomUUID()}`)
      const client = await waiting
      const ready = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "photon" && part.op === "test" && part.value === "ready"
      }, from)).message.parts[0]

      expect(ready.from).not.toBe("execution-before-cold-birth")
      expect(runtime.matrix$.branes[0]?.lock).toBe(true)

      const beforeOldClaim = fixture.messages.length
      send(fixture, client, {
        part: "z",
        op: "test",
        path: 17,
        by: "energy",
        value: {energy: "energy-cold", processExecutionId: "execution-before-cold-birth"},
      })
      await Bun.sleep(0)
      await Bun.sleep(0)
      expect(fixture.messages.slice(beforeOldClaim).filter((entry) => entry.client === client)).toEqual([])

      const processExecutionId = String(ready.from)
      const beforeNewClaim = fixture.messages.length
      send(fixture, client, {
        part: "z",
        op: "test",
        path: 17,
        by: "energy",
        value: {energy: "energy-cold", processExecutionId},
      })
      const grant = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "z" && part.op === "copy"
      }, beforeNewClaim)).message.parts[0]
      expect(grant.value).toEqual({processExecutionId, fields: {"101": "payload"}})
    } finally {
      fixture.close()
    }
  })

  test("recovers one durable Reaction lane and starts its queued head after terminal copy", async () => {
    const fixture = createForceTestFixture()
    try {
      weak$.dispose()
      await prepareMatrixBirth(reactionInitial())
      const from = fixture.messages.length
      const waiting = fixture.nextClient("matrix")
      await import(`./matrix.ts?reaction-cold-restart=${crypto.randomUUID()}`)
      const client = await waiting
      const recoveryPart = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "photon" && part.op === "test" &&
          isReactionRecoveryRequest(part.value)
      }, from)).message.parts[0]
      if (!isReactionRecoveryRequest(recoveryPart.value)) throw new Error("Matrix did not emit Reaction recovery")
      expect(recoveryPart.value.reactionExecutionId).toBe("reaction-before-cold-birth")

      const beforeTerminal = fixture.messages.length
      send(fixture, client, {
        part: "w-",
        op: "copy",
        path: 20,
        by: "boundary",
        from: recoveryPart.value.reactionExecutionId,
        value: {
          reactionExecutionId: recoveryPart.value.reactionExecutionId,
          relationKey: recoveryPart.value.relationKey,
          reactionId: recoveryPart.value.reactionId,
          energy: "energy-before-cold-birth",
          status: "superseded",
        },
      })
      const start = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "photon" && part.op === "test" &&
          isReactionStartRequest(part.value)
      }, beforeTerminal)).message.parts[0].value
      expect(start).toMatchObject({
        kind: "reaction-start",
        reactionExecutionId: "reaction-queued-before-cold-birth",
      })
    } finally {
      fixture.close()
    }
  })
})
