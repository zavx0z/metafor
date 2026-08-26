import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {
  ReactionExecutionClaim,
  ReactionExecutionSignal,
  ReactionRelation,
  ReactionResultProposal,
  ReactionStateCommit,
  ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import {open, type BoundaryDatabase} from "./sqlite.ts"
import {readBoundaryValue} from "./world.ts"

const SOURCE = "test/reaction-source"
const TARGET = "test/reaction-target"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary Reaction lifecycle", () => {
  let boundary: BoundaryDatabase
  let sourceAtomId: number
  let targetAtomId: number
  let targetResult: number
  let targetReaction: number
  let relation: ReactionRelation

  beforeEach(async () => {
    boundary = await open(":memory:")
    const declarations: ParticleInput[] = [
      {part: "inflaton", op: "add", path: "wimp", value: {src: SOURCE, name: "Source"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: SOURCE, id: 1, key: "value", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: SOURCE, id: 1, name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: SOURCE, id: 2, name: "ready", position: 1}},
      {part: "inflaton", op: "add", path: "wimp", value: {src: TARGET, name: "Target"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: TARGET, id: 1, key: "result", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: TARGET, id: 1, name: "listening", position: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: TARGET, id: 2, name: "also-listening", position: 1}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: TARGET, id: 3, name: "paused", position: 2}},
      {part: "inflaton", op: "add", path: "mass", value: {wimp: TARGET, id: 1, key: "history", format: "json"}},
      {
        part: "inflaton",
        op: "add",
        path: "reaction",
        value: {
          wimp: TARGET,
          id: 1,
          key: "source-ready",
          label: "Source ready",
          sources: [{meta: SOURCE, states: ["ready"]}],
          src: "({update, value}) => update({result: value.result + 1})",
          read: [1],
          write: [1],
          massRead: ["history"],
          massWrite: ["history"],
          states: [1, 2],
        },
      },
    ]
    for (const part of declarations) await boundary.materialize(message(part))

    targetResult = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${TARGET} AND local_id = 1
    `)[0]?.id)
    targetReaction = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM reaction WHERE wimp = ${TARGET} AND local_id = 1
    `)[0]?.id)
    const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${SOURCE}, ${TARGET}) ORDER BY id
    `
    sourceAtomId = Number(atoms.find((atom) => atom.wimp === SOURCE)?.id)
    targetAtomId = Number(atoms.find((atom) => atom.wimp === TARGET)?.id)
    if (!sourceAtomId || !targetAtomId) throw new Error("Reaction atoms were not materialized")

    await boundary.materialize(message({
      part: "photon", op: "replace", path: sourceAtomId, from: "source-idle", value: "idle",
    }))
    await boundary.materialize(message({
      part: "photon", op: "replace", path: targetAtomId, from: "target-listening", value: "listening",
    }))
    relation = (await boundary.initialState()).reactionRelations[0]!
  })

  afterEach(async () => {
    await boundary.close()
  })

  const targetValue = async (): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{value: number}>>`
      SELECT value FROM atom_value WHERE atom = ${targetAtomId} AND field = ${targetResult}
    `)[0]
    return row ? await readBoundaryValue(boundary.projection.sql, Number(row.value)) : undefined
  }

  const confirmedReady = async (eventId = crypto.randomUUID()): Promise<ReactionStateCommit> => {
    const commit = await boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: sourceAtomId,
      from: eventId,
      value: "ready",
    }))
    const confirmation = commit?.messages
      .map((entry) => entry.parts[0])
      .find((part) => part.part === "photon" && part.op === "copy")?.value
    return confirmation as ReactionStateCommit
  }

  const schedule = async (): Promise<ReactionExecutionSignal> => {
    const event = await confirmedReady()
    const request: ReactionTriggerRequest = {
      kind: "reaction-trigger",
      reactionExecutionId: crypto.randomUUID(),
      relationKey: relation.key,
      reactionId: relation.reactionId,
      eventId: event.eventId,
      targetAtomId: targetAtomId,
      source: {
        atomId: event.atomId,
        wimp: event.wimp,
        stateId: event.stateId,
        state: event.state,
      },
      timestamp: 1,
    }
    const registered = await boundary.materialize(message({
      part: "photon",
      op: "test",
      path: targetAtomId,
      from: request.reactionExecutionId,
      value: request,
    }))
    return registered?.messages[0]?.parts[0].value as ReactionExecutionSignal
  }

  const claim = async (signal: ReactionExecutionSignal): Promise<void> => {
    const value: ReactionExecutionClaim = {
      kind: "reaction-claim",
      energy: "energy-reaction",
      reactionExecutionId: signal.reactionExecutionId,
    }
    const grant = await boundary.materialize(message({
      part: "z", op: "test", path: targetAtomId, value,
    }))
    expect(grant?.messages[0]?.parts[0]).toMatchObject({
      part: "z",
      op: "copy",
      path: targetAtomId,
      from: "energy-reaction",
      value: signal,
    })
  }

  test("registers one confirmed source State and commits declared ordinary Fields", async () => {
    const signal = await schedule()
    expect(signal).toMatchObject({
      relationKey: relation.key,
      reactionId: targetReaction,
      target: {atomId: targetAtomId, wimp: TARGET, state: "listening"},
      source: {atomId: sourceAtomId, wimp: SOURCE, state: "ready"},
      readFields: [[targetResult, "result", 0]],
      writeFields: [[targetResult, "result"]],
      massRead: ["history"],
      massWrite: ["history"],
    })
    expect(Object.hasOwn(signal.source, "previousState")).toBe(false)
    await claim(signal)

    const proposal: ReactionResultProposal = {
      reactionExecutionId: signal.reactionExecutionId,
      relationKey: signal.relationKey,
      reactionId: signal.reactionId,
      fields: {[String(targetResult)]: 1},
    }
    const commit = await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: proposal,
    }))
    expect(await targetValue()).toBe(1)
    expect(commit?.messages.at(-1)?.parts[0]).toMatchObject({
      part: "w+",
      op: "copy",
      from: signal.reactionExecutionId,
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        relationKey: relation.key,
        reactionId: targetReaction,
        energy: "energy-reaction",
        status: "committed",
      },
    })
  })

  test("keeps a running Reaction when target moves between two active States", async () => {
    const signal = await schedule()
    await claim(signal)
    const stateCommit = await boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: targetAtomId,
      from: "target-also-listening",
      value: "also-listening",
    }))
    expect(stateCommit?.messages.some((entry) => entry.parts[0].part === "w-")).toBe(false)
    const commit = await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        relationKey: signal.relationKey,
        reactionId: signal.reactionId,
        fields: {[String(targetResult)]: 1},
      } satisfies ReactionResultProposal,
    }))
    expect(commit?.messages.at(-1)?.parts[0].value).toMatchObject({status: "committed"})
  })

  test("supersedes a running Reaction when target leaves every active State", async () => {
    const signal = await schedule()
    await claim(signal)
    const stateCommit = await boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: targetAtomId,
      from: "target-paused",
      value: "paused",
    }))
    expect(stateCommit?.messages.at(-1)?.parts[0]).toMatchObject({
      part: "w-",
      op: "copy",
      from: signal.reactionExecutionId,
      value: {status: "superseded", relationKey: relation.key},
    })
    expect(await targetValue()).toBe(0)
  })

  test("fails instead of registering when a declared Field is unavailable", async () => {
    await boundary.projection.sql`
      DELETE FROM atom_value WHERE atom = ${targetAtomId} AND field = ${targetResult}
    `
    await expect(schedule()).rejects.toThrow("declared Field result is unavailable")
  })

  test("rejects removal of declared Field, Mass and active State dependencies", async () => {
    await expect(boundary.materialize(message({
      part: "inflaton", op: "remove", path: "field", value: {wimp: TARGET, id: 1},
    }))).rejects.toThrow("Reaction dependency Field")
    await expect(boundary.materialize(message({
      part: "inflaton", op: "remove", path: "mass", value: {wimp: TARGET, id: 1},
    }))).rejects.toThrow("Reaction dependency Mass")
    await expect(boundary.materialize(message({
      part: "inflaton", op: "remove", path: "state", value: {wimp: TARGET, id: 1},
    }))).rejects.toThrow("Reaction active State")
  })

  test("rejects changing a Reaction write dependency into a topology Field", async () => {
    await expect(boundary.materialize(message({
      part: "inflaton",
      op: "replace",
      path: "field",
      value: {wimp: TARGET, id: 1, key: "result", type: "array", default: []},
    }))).rejects.toThrow("cannot write topology Field result")
    expect((await boundary.projection.sql<Array<{type: string}>>`
      SELECT type FROM field WHERE wimp = ${TARGET} AND local_id = 1
    `)[0]?.type).toBe("number")
  })
})
