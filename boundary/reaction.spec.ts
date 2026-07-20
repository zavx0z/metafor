import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  type ReactionExecutionClaim,
  type ReactionExecutionSignal,
  type ReactionResultProposal,
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
  let TARGET_RESULT: number
  let TARGET_REACTION: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    const declarations: ParticleInput[] = [
      {part: "inflaton", op: "add", path: "wimp", value: {src: SOURCE, name: "Source"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: SOURCE, id: 1, key: "value", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: SOURCE, id: 1, name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: "wimp", value: {src: TARGET, name: "Target"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: TARGET, id: 1, key: "result", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: TARGET, id: 1, name: "idle", position: 0}},
      {
        part: "inflaton",
        op: "add",
        path: "reaction",
        value: {
          wimp: TARGET,
          id: 1,
          key: "source-change",
          label: "Source changed",
          cond: "() => ({meta: 'test/reaction-source', op: 'replace', path: '/context'})",
          src: "({update}) => update({result: 2})",
          read: [1],
          write: [1],
          states: [1],
        },
      },
    ]
    for (const part of declarations) await boundary.materialize(message(part))

    TARGET_RESULT = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${TARGET} AND local_id = 1
    `)[0]?.id)
    TARGET_REACTION = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM reaction WHERE wimp = ${TARGET} AND local_id = 1
    `)[0]?.id)

    const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${SOURCE}, ${TARGET}) ORDER BY id
    `
    sourceAtomId = Number(atoms.find((atom) => atom.wimp === SOURCE)?.id)
    targetAtomId = Number(atoms.find((atom) => atom.wimp === TARGET)?.id)
    if (!sourceAtomId || !targetAtomId) throw new Error("Reaction atoms were not materialized")

    await boundary.materialize(message({part: "photon", op: "replace", path: sourceAtomId, value: "idle"}))
    await boundary.materialize(message({part: "photon", op: "replace", path: targetAtomId, value: "idle"}))
  })

  afterEach(async () => {
    await boundary.close()
  })

  const targetValue = async (): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{value: number}>>`
      SELECT value
        FROM atom_value
       WHERE atom = ${targetAtomId} AND field = ${TARGET_RESULT}
    `)[0]
    return row ? await readBoundaryValue(boundary.projection.sql, Number(row.value)) : undefined
  }

  const schedule = async (): Promise<ReactionExecutionSignal> => {
    const signals = await boundary.reaction.derive([message({
      part: "gluon",
      op: "replace",
      path: sourceAtomId,
      from: "source-commit",
      value: {fields: {"1": 1}},
    })])
    expect(signals).toHaveLength(1)
    const signalPart = signals[0]!.parts[0]!
    expect(signalPart.part).toBe("photon")
    expect(signalPart.op).toBe("test")
    expect(signalPart.path).toBe(targetAtomId)
    return signalPart.value as ReactionExecutionSignal
  }

  test("selects one Energy and commits declared Reaction writes", async () => {
    const signal = await schedule()
    expect(signal.reactionId).toBe(TARGET_REACTION)
    expect(signal.target).toEqual({atomId: targetAtomId, wimp: TARGET, state: "idle"})
    expect(signal.source.atomId).toBe(sourceAtomId)
    expect(signal.source.part.ts).toBe(1)
    expect(signal.writeFields).toEqual([[TARGET_RESULT, "result"]])

    const claim: ReactionExecutionClaim = {
      kind: "reaction-claim",
      energy: "energy-reaction",
      reactionExecutionId: signal.reactionExecutionId,
    }
    const grant = await boundary.materialize(message({part: "z", op: "test", path: targetAtomId, value: claim}))
    expect(grant?.messages).toEqual([message({
      part: "z",
      op: "copy",
      path: targetAtomId,
      ts: expect.any(Number),
      from: "energy-reaction",
      value: signal,
    })])

    const losingClaim = await boundary.materialize(message({
      part: "z",
      op: "test",
      path: targetAtomId,
      value: {...claim, energy: "energy-other"},
    }))
    expect(losingClaim).toBeNull()

    const proposal: ReactionResultProposal = {
      reactionExecutionId: signal.reactionExecutionId,
      reactionId: signal.reactionId,
      matched: true,
      fields: {[String(TARGET_RESULT)]: 2},
    }
    const commit = await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: proposal,
    }))

    expect(await targetValue()).toBe(2)
    expect(commit?.messages[0]?.parts[0]).toEqual({
      part: "gluon",
      op: "replace",
      path: targetAtomId,
      ts: expect.any(Number),
      from: `reaction:${signal.reactionExecutionId}`,
      value: {fields: {[String(TARGET_RESULT)]: 2}},
    })
    expect(commit?.messages[1]?.parts[0]).toEqual({
      part: "w+",
      op: "copy",
      path: targetAtomId,
      ts: expect.any(Number),
      from: signal.reactionExecutionId,
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        reactionId: signal.reactionId,
        energy: "energy-reaction",
        status: "committed",
      },
    })

    expect(await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: proposal,
    }))).toBeNull()
  })

  test("records skipped filter without mutating the world", async () => {
    const signal = await schedule()
    const claim: ReactionExecutionClaim = {
      kind: "reaction-claim",
      energy: "energy-reaction",
      reactionExecutionId: signal.reactionExecutionId,
    }
    await boundary.materialize(message({part: "z", op: "test", path: targetAtomId, value: claim}))
    const commit = await boundary.materialize(message({
      part: "w-",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        reactionId: signal.reactionId,
        matched: false,
        fields: {},
      } satisfies ReactionResultProposal,
    }))
    expect(await targetValue()).toBe(0)
    expect(commit?.messages).toEqual([message({
      part: "w-",
      op: "copy",
      path: targetAtomId,
      ts: expect.any(Number),
      from: signal.reactionExecutionId,
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        reactionId: signal.reactionId,
        energy: "energy-reaction",
        status: "skipped",
      },
    })])
  })

  test("rejects undeclared writes and stale State", async () => {
    const signal = await schedule()
    const claim: ReactionExecutionClaim = {
      kind: "reaction-claim",
      energy: "energy-reaction",
      reactionExecutionId: signal.reactionExecutionId,
    }
    await boundary.materialize(message({part: "z", op: "test", path: targetAtomId, value: claim}))

    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: {
        reactionExecutionId: signal.reactionExecutionId,
        reactionId: signal.reactionId,
        matched: true,
        fields: {"999": 3},
      } satisfies ReactionResultProposal,
    }))).rejects.toThrow("cannot write field")
    expect(await targetValue()).toBe(0)

    await boundary.materialize(message({part: "photon", op: "replace", path: targetAtomId, value: "idle"}))
    const status = (await boundary.projection.sql<Array<{status: string}>>`
      SELECT status FROM boundary_reaction_execution WHERE execution_id = ${signal.reactionExecutionId}
    `)[0]?.status
    expect(status).toBe("superseded")
  })
})
