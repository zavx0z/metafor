import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {
  ReactionExecutionClaim,
  ReactionExecutionSignal,
  ReactionQueueCommit,
  ReactionRecoveryRequest,
  ReactionRelation,
  ReactionResultProposal,
  ReactionStartRequest,
  ReactionStateCommit,
  ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import {
  isReactionExecutionSignal,
  isReactionQueueCommit,
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

  const confirmedSource = async (
    state: "idle" | "ready",
    eventId: string = crypto.randomUUID(),
  ): Promise<ReactionStateCommit> => {
    const commit = await boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: sourceAtomId,
      from: eventId,
      value: state,
    }))
    const confirmation = commit?.messages
      .map((entry) => entry.parts[0])
      .find((part) => part.part === "photon" && part.op === "copy")?.value
    if (!confirmation) throw new Error(`Boundary did not confirm source State ${state}`)
    return confirmation as ReactionStateCommit
  }

  const requestFor = (
    event: ReactionStateCommit,
    reactionExecutionId: string = crypto.randomUUID(),
  ): ReactionTriggerRequest => ({
      kind: "reaction-trigger",
      reactionExecutionId,
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
    })

  const register = async (request: ReactionTriggerRequest) => await boundary.materialize(message({
    part: "photon",
    op: "test",
    path: targetAtomId,
    from: request.reactionExecutionId,
    value: request,
  }))

  const schedule = async (): Promise<ReactionExecutionSignal> => {
    const event = await confirmedSource("ready")
    const request = requestFor(event)
    const registered = await register(request)
    const queue = registered?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionQueueCommit)
    if (!queue || queue.status !== "queued") throw new Error("Boundary did not durably enqueue Reaction")
    const start: ReactionStartRequest = {
      kind: "reaction-start",
      reactionExecutionId: queue.request.reactionExecutionId,
      relationKey: queue.request.relationKey,
      reactionId: queue.request.reactionId,
      targetAtomId: queue.request.targetAtomId,
    }
    const started = await boundary.materialize(message({
      part: "photon", op: "test", path: targetAtomId,
      from: start.reactionExecutionId, value: start,
    }))
    const signal = started?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionExecutionSignal)
    if (!signal) throw new Error("Boundary did not offer a Reaction execution")
    return signal
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

  test("deduplicates a retried event and relation after partial Matrix enqueue failure", async () => {
    const event = await confirmedSource("ready", "retry-source-ready")
    const first = requestFor(event, "retry-first-identity")
    const retry = requestFor(event, "retry-second-identity")
    const firstCommit = await register(first)
    const retryCommit = await register(retry)
    const firstQueue = firstCommit?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit)
    const retryQueue = retryCommit?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit)
    expect(firstQueue?.request.reactionExecutionId).toBe(first.reactionExecutionId)
    expect(retryQueue).toEqual(firstQueue)
    expect(Number((await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM boundary_reaction_execution
       WHERE event_id = ${event.eventId} AND relation_key = ${relation.key}
    `)[0]?.count)).toBe(1)
  })

  test("persists every match and snapshots queued Fields only when its FIFO turn starts", async () => {
    const firstEvent = await confirmedSource("ready", "source-ready-first")
    const firstRequest = requestFor(firstEvent, "reaction-first")
    const firstRegistration = await register(firstRequest)
    const firstQueue = firstRegistration?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionQueueCommit)
    expect(firstQueue).toMatchObject({status: "queued", queueOrder: 1})
    expect(firstRegistration?.messages.some((entry) => isReactionExecutionSignal(entry.parts[0]?.value))).toBe(false)
    const firstStart: ReactionStartRequest = {
      kind: "reaction-start",
      reactionExecutionId: firstRequest.reactionExecutionId,
      relationKey: firstRequest.relationKey,
      reactionId: firstRequest.reactionId,
      targetAtomId,
    }
    const firstStarted = await boundary.materialize(message({
      part: "photon", op: "test", path: targetAtomId,
      from: firstStart.reactionExecutionId, value: firstStart,
    }))
    const firstSignal = firstStarted?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionExecutionSignal)
    if (!firstSignal) throw new Error("First Reaction was not offered")

    await confirmedSource("idle", "source-idle-between")
    const secondEvent = await confirmedSource("ready", "source-ready-second")
    const secondRequest = requestFor(secondEvent, "reaction-second")
    const secondRegistration = await register(secondRequest)
    const secondQueue = secondRegistration?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionQueueCommit)
    expect(secondQueue).toMatchObject({status: "queued", queueOrder: 2, request: secondRequest})
    expect(secondRegistration?.messages.some((entry) => isReactionExecutionSignal(entry.parts[0]?.value))).toBe(false)
    expect((await boundary.projection.sql<Array<{signal: string | null}>>`
      SELECT signal_json AS signal FROM boundary_reaction_execution
       WHERE execution_id = ${secondRequest.reactionExecutionId}
    `)[0]?.signal).toBeNull()
    expect((await boundary.initialState()).unfinishedReactionExecutions.map(({queue}) => [
      queue.request.reactionExecutionId,
      queue.status,
      queue.queueOrder,
    ])).toEqual([
      ["reaction-first", "pending", 1],
      ["reaction-second", "queued", 2],
    ])

    await claim(firstSignal)
    await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: {
        reactionExecutionId: firstSignal.reactionExecutionId,
        relationKey: firstSignal.relationKey,
        reactionId: firstSignal.reactionId,
        fields: {[String(targetResult)]: 1},
      } satisfies ReactionResultProposal,
    }))

    const start: ReactionStartRequest = {
      kind: "reaction-start",
      reactionExecutionId: secondRequest.reactionExecutionId,
      relationKey: secondRequest.relationKey,
      reactionId: secondRequest.reactionId,
      targetAtomId,
    }
    const started = await boundary.materialize(message({
      part: "photon", op: "test", path: targetAtomId,
      from: start.reactionExecutionId, value: start,
    }))
    const secondSignal = started?.messages
      .map((entry) => entry.parts[0]?.value)
      .find(isReactionExecutionSignal)
    if (!secondSignal) throw new Error("Second Reaction was not offered")
    expect(secondSignal.readFields).toContainEqual([targetResult, "result", 1])
    await claim(secondSignal)
    await boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: targetAtomId,
      from: "energy-reaction",
      value: {
        reactionExecutionId: secondSignal.reactionExecutionId,
        relationKey: secondSignal.relationKey,
        reactionId: secondSignal.reactionId,
        fields: {[String(targetResult)]: 2},
      } satisfies ReactionResultProposal,
    }))
    expect(await targetValue()).toBe(2)
  })

  test("reoffers only an unclaimed pending execution after cold birth", async () => {
    const signal = await schedule()
    const recovery: ReactionRecoveryRequest = {
      kind: "reaction-recovery",
      reactionExecutionId: signal.reactionExecutionId,
      relationKey: signal.relationKey,
      reactionId: signal.reactionId,
      targetAtomId,
    }
    const recovered = await boundary.materialize(message({
      part: "photon", op: "test", path: targetAtomId,
      from: recovery.reactionExecutionId, value: recovery,
    }))
    expect(recovered?.messages.map((entry) => entry.parts[0]?.value).find(isReactionExecutionSignal)).toEqual(signal)
  })

  test("supersedes a previously claimed execution instead of repeating possible Mass writes", async () => {
    const signal = await schedule()
    await claim(signal)
    const recovery: ReactionRecoveryRequest = {
      kind: "reaction-recovery",
      reactionExecutionId: signal.reactionExecutionId,
      relationKey: signal.relationKey,
      reactionId: signal.reactionId,
      targetAtomId,
    }
    const recovered = await boundary.materialize(message({
      part: "photon", op: "test", path: targetAtomId,
      from: recovery.reactionExecutionId, value: recovery,
    }))
    expect(recovered?.messages).toHaveLength(1)
    expect(recovered?.messages[0]?.parts[0]).toMatchObject({
      part: "w-",
      op: "copy",
      from: signal.reactionExecutionId,
      value: {status: "superseded", energy: "energy-reaction"},
    })
    expect((await boundary.initialState()).unfinishedReactionExecutions).toEqual([])
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

  test("supersedes pending and queued Reactions when target leaves every active State", async () => {
    const signal = await schedule()
    await claim(signal)
    await confirmedSource("idle", "source-idle-before-pause")
    const queuedEvent = await confirmedSource("ready", "source-ready-before-pause")
    const queuedRequest = requestFor(queuedEvent, "reaction-queued-before-pause")
    const queued = await register(queuedRequest)
    expect(queued?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit))
      .toMatchObject({status: "queued"})
    const stateCommit = await boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: targetAtomId,
      from: "target-paused",
      value: "paused",
    }))
    const terminals = stateCommit?.messages.filter((entry) => entry.parts[0].part === "w-") ?? []
    expect(terminals.map((entry) => entry.parts[0].from)).toEqual([
      signal.reactionExecutionId,
      queuedRequest.reactionExecutionId,
    ])
    expect(terminals.every((entry) => (entry.parts[0].value as {status?: string}).status === "superseded")).toBe(true)
    expect(await targetValue()).toBe(0)
  })

  test("supersedes queued work when its exact relation changes", async () => {
    const event = await confirmedSource("ready", "relation-change-ready")
    const request = requestFor(event, "queued-before-relation-change")
    const registered = await register(request)
    expect(registered?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit))
      .toMatchObject({status: "queued"})

    const changed = await boundary.materialize(message({
      part: "inflaton",
      op: "replace",
      path: "reaction",
      value: {
        wimp: TARGET,
        id: 1,
        key: "source-ready",
        label: "Source ready",
        sources: [{meta: SOURCE, states: ["idle"]}],
        src: "({update, value}) => update({result: value.result + 1})",
        read: [1],
        write: [1],
        massRead: ["history"],
        massWrite: ["history"],
        states: [1, 2],
      },
    }))
    expect(changed?.messages.map((entry) => entry.parts[0]).find((part) => part.part === "w-")).toMatchObject({
      from: request.reactionExecutionId,
      value: {status: "superseded"},
    })
    expect((await boundary.initialState()).unfinishedReactionExecutions).toEqual([])
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

  test("migrates the pre-queue execution table without losing pending identity", async () => {
    const event = await confirmedSource("ready", "migration-ready-event")
    const request = requestFor(event, "migration-pending-execution")
    const targetState = Number((await boundary.projection.sql<Array<{state: number}>>`
      SELECT metaState AS state FROM atom_state WHERE atom = ${targetAtomId}
    `)[0]?.state)
    const targetStateName = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT name FROM state WHERE id = ${targetState}
    `)[0]?.name ?? "listening"
    await boundary.projection.sql.unsafe("DROP TABLE boundary_reaction_execution")
    await boundary.projection.sql.unsafe(`
      CREATE TABLE boundary_reaction_execution (
        execution_id TEXT PRIMARY KEY,
        relation_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        target_atom INTEGER NOT NULL,
        target_state INTEGER NOT NULL,
        target_state_name TEXT NOT NULL,
        source_atom INTEGER NOT NULL,
        source_state INTEGER NOT NULL,
        reaction INTEGER NOT NULL,
        energy TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'committed', 'failed', 'superseded')),
        request_json TEXT NOT NULL,
        signal_json TEXT,
        result_part TEXT CHECK (result_part IN ('w+', 'w-')),
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        committed_at INTEGER,
        UNIQUE (event_id, relation_key)
      )
    `)
    await boundary.projection.sql`
      INSERT INTO boundary_reaction_execution (
        execution_id, relation_key, event_id, target_atom, target_state,
        target_state_name, source_atom, source_state, reaction, status,
        request_json, signal_json
      ) VALUES (
        ${request.reactionExecutionId}, ${request.relationKey}, ${request.eventId},
        ${targetAtomId}, ${targetState}, ${targetStateName}, ${request.source.atomId},
        ${request.source.stateId}, ${request.reactionId}, ${"pending"},
        ${JSON.stringify(request)}, ${JSON.stringify({})}
      )
    `

    await boundary.reaction.init()
    expect((await boundary.projection.sql<Array<{queueOrder: number; status: string}>>`
      SELECT queue_order AS queueOrder, status FROM boundary_reaction_execution
       WHERE execution_id = ${request.reactionExecutionId}
    `)[0]).toEqual({queueOrder: 1, status: "pending"})
    await boundary.projection.sql`
      INSERT INTO boundary_reaction_execution (
        execution_id, relation_key, event_id, target_atom, target_state,
        target_state_name, source_atom, source_state, reaction, queue_order,
        status, request_json
      ) VALUES (
        ${"migration-queued"}, ${request.relationKey}, ${"migration-queued-event"},
        ${targetAtomId}, ${targetState}, ${targetStateName}, ${request.source.atomId},
        ${request.source.stateId}, ${request.reactionId}, ${2}, ${"queued"},
        ${JSON.stringify({...request, reactionExecutionId: "migration-queued", eventId: "migration-queued-event"})}
      )
    `
    expect((await boundary.projection.sql<Array<{status: string}>>`
      SELECT status FROM boundary_reaction_execution WHERE execution_id = ${"migration-queued"}
    `)[0]?.status).toBe("queued")
  })
})
