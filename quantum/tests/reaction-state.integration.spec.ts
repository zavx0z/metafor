import {describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  REACTION_CLAIM_KIND,
  isReactionExecutionSignal,
  isReactionQueueCommit,
  isReactionResultCommit,
  isReactionStateCommit,
  type ReactionMatrixRequest,
  type ReactionResultProposal,
  type ReactionTriggerRequest,
} from "shared/protocol/force/reaction"
import {MetaFor} from "../../create-metafor/dsl/metafor.ts"
import {open} from "../boundary/sqlite.ts"
import {readBoundaryValue} from "../boundary/world.ts"
import {matterParticles} from "../dark/dark.ts"
import {executeReaction} from "../energy/reaction.ts"
import {MatrixReactionRouter} from "../matrix/reaction.ts"

const SOURCE = "audit/state-source"
const TARGET = "audit/state-target"

const message = (part: Omit<Particle, "ts"> & {ts?: number}): ForceMessage => ({
  parts: [{ts: 1, ...part}] as [Particle],
})

describe("Reaction confirmed State lifecycle", () => {
  test("routes one exact relation through Matrix and commits only target ordinary Fields", async () => {
    const source = MetaFor("State source")
      .fields((field) => ({value: field.number.required(0)}))
      .superposition({idle: null, ready: null})
      .mass(() => ({}))
      .energy()
      .processes()
      .reactions()
      .matter()
      .bulk()
    const target = MetaFor("State target")
      .fields((field) => ({count: field.number.required(0)}))
      .superposition({idle: null, monitoring: null})
      .mass((mass) => ({history: mass.json()}))
      .energy()
      .processes()
      .reactions((reaction) => [[
        ["idle", "monitoring"],
        reaction({
          key: "count-ready",
          label: "Count ready",
          mass: {read: ["history"], write: ["history"]},
        })
          .filter([{meta: SOURCE, states: ["ready"]}])
          .equal(async ({update, value, mass, observation}) => {
            if (observation.source.state !== "ready") throw new Error("unexpected State")
            const history = await mass.history.readJson() as string[]
            await mass.history.write([...history, observation.source.state])
            update({count: value.count + 1})
          }),
      ]])
      .matter(({html}) => html`<meta-for src="audit/state-source" />`)
      .bulk()

    const declarations = new Map([[TARGET, target], [SOURCE, source]])
    const boundary = await open(":memory:")
    try {
      for await (const part of matterParticles(TARGET, async (src: string) => {
        const declaration = declarations.get(src)
        if (!declaration) throw new Error(`Missing test declaration ${src}`)
        return declaration
      })) await boundary.materialize({parts: [part]})

      const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
        SELECT id, wimp FROM atom WHERE wimp IN (${SOURCE}, ${TARGET}) ORDER BY id
      `
      const sourceAtomId = Number(atoms.find((atom) => atom.wimp === SOURCE)?.id)
      const targetAtomId = Number(atoms.find((atom) => atom.wimp === TARGET)?.id)
      expect(sourceAtomId).toBeGreaterThan(0)
      expect(targetAtomId).toBeGreaterThan(0)

      await boundary.materialize(message({
        part: "photon", op: "replace", path: sourceAtomId,
        from: "source-idle-event", value: "idle",
      }))
      await boundary.materialize(message({
        part: "photon", op: "replace", path: targetAtomId,
        from: "target-idle-event", value: "idle",
      }))
      const initial = await boundary.initialState()
      expect(initial.version).toBe(3)
      expect(initial.reactionRelations).toHaveLength(1)
      const relation = initial.reactionRelations[0]!

      const localStateIds = new Map(initial.atoms.map((atom) => [atom.id, atom.state]))
      const wimps = new Map(initial.atoms.map((atom) => [atom.id, atom.wimp]))
      const requests: ReactionMatrixRequest[] = []
      let reactionSequence = 0
      const router = new MatrixReactionRouter({
        currentStateId: (atomId) => localStateIds.get(atomId) ?? null,
        currentWimp: (atomId) => wimps.get(atomId) ?? null,
        executionId: () => `reaction-execution-${++reactionSequence}`,
        emit: (request) => requests.push(request),
      })
      router.hydrate(
        initial.reactionRelations,
        initial.atoms.map((atom) => [atom.id, atom.state] as const),
        initial.unfinishedReactionExecutions,
      )

      const readyState = relation.source.states.find((state) => state.name === "ready")!
      localStateIds.set(sourceAtomId, readyState.id)
      const sourceCommit = await boundary.materialize(message({
        part: "photon", op: "replace", path: sourceAtomId,
        from: "source-ready-event", value: "ready",
      }))
      const confirmed = sourceCommit?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionStateCommit)
      if (!confirmed) throw new Error("Boundary did not confirm source State")
      const firstTrigger = router.confirmState(confirmed, 2)[0]
      if (!firstTrigger) throw new Error("Matrix did not enqueue first Reaction")

      const registration = await boundary.materialize(message({
        part: "photon",
        op: "test",
        path: targetAtomId,
        from: firstTrigger.reactionExecutionId,
        value: firstTrigger,
      }))
      const firstQueue = registration?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionQueueCommit)
      if (!firstQueue) throw new Error("Boundary did not confirm first Reaction queue entry")
      const firstStart = router.confirmQueue(firstQueue)
      if (!firstStart) throw new Error("Matrix did not start first Reaction queue entry")
      const firstStarted = await boundary.materialize(message({
        part: "photon", op: "test", path: targetAtomId,
        from: firstStart.reactionExecutionId, value: firstStart,
      }))
      const firstPendingQueue = firstStarted?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionQueueCommit)
      if (!firstPendingQueue) throw new Error("Boundary did not promote first Reaction queue entry")
      router.confirmQueue(firstPendingQueue)
      const signal = firstStarted?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionExecutionSignal)
      if (!signal) throw new Error("Boundary did not register Reaction execution")
      expect(signal.source).toEqual({
        atomId: sourceAtomId,
        wimp: SOURCE,
        stateId: readyState.id,
        state: "ready",
      })
      expect(signal.massRead).toEqual(["history"])
      expect(signal.massWrite).toEqual(["history"])

      await boundary.materialize(message({
        part: "z",
        op: "test",
        path: targetAtomId,
        value: {
          kind: REACTION_CLAIM_KIND,
          energy: "energy-reaction",
          reactionExecutionId: signal.reactionExecutionId,
        },
      }))
      const monitoringStateId = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM state WHERE wimp = ${TARGET} AND name = ${"monitoring"}
      `)[0]?.id)
      localStateIds.set(targetAtomId, monitoringStateId)
      const targetStateCommit = await boundary.materialize(message({
        part: "photon", op: "replace", path: targetAtomId,
        from: "target-monitoring-event", value: "monitoring",
      }))
      const targetConfirmed = targetStateCommit?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionStateCommit)
      if (!targetConfirmed) throw new Error("Boundary did not confirm target State")
      router.confirmState(targetConfirmed, 3)
      expect(router.pending(targetAtomId)).toBe(signal.reactionExecutionId)

      const idleStateId = Number(initial.atoms.find((atom) => atom.id === sourceAtomId)?.state)
      localStateIds.set(sourceAtomId, idleStateId)
      const secondIdle = await boundary.materialize(message({
        part: "photon", op: "replace", path: sourceAtomId,
        from: "source-idle-second", value: "idle",
      }))
      const secondIdleConfirmed = secondIdle?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionStateCommit)
      if (!secondIdleConfirmed) throw new Error("Boundary did not confirm second idle State")
      router.confirmState(secondIdleConfirmed, 4)

      localStateIds.set(sourceAtomId, readyState.id)
      const secondReady = await boundary.materialize(message({
        part: "photon", op: "replace", path: sourceAtomId,
        from: "source-ready-second", value: "ready",
      }))
      const secondReadyConfirmed = secondReady?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionStateCommit)
      if (!secondReadyConfirmed) throw new Error("Boundary did not confirm second ready State")
      const secondTrigger = router.confirmState(secondReadyConfirmed, 5)[0]
      if (!secondTrigger) throw new Error("Matrix did not enqueue second Reaction")
      const secondQueued = await boundary.materialize(message({
        part: "photon", op: "test", path: targetAtomId,
        from: secondTrigger.reactionExecutionId, value: secondTrigger,
      }))
      const secondQueue = secondQueued?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionQueueCommit)
      if (!secondQueue) throw new Error("Boundary did not confirm second Reaction queue entry")
      router.confirmQueue(secondQueue)
      expect(secondQueue.status).toBe("queued")
      expect(router.queued(targetAtomId)).toBe(1)

      let history: string[] = []
      const massHandle = {
        readBytes: async () => new Uint8Array(),
        readText: async () => JSON.stringify(history),
        readJson: async () => [...history],
        write: async (value: unknown) => { history = [...value as string[]] },
      }
      const result = await executeReaction(signal, "energy-reaction", {
        get: () => ({history: massHandle}),
        bind: () => {},
      })
      expect(history).toEqual(["ready"])
      const proposal: ReactionResultProposal = {
        reactionExecutionId: signal.reactionExecutionId,
        relationKey: signal.relationKey,
        reactionId: signal.reactionId,
        fields: result.fields,
      }
      const committed = await boundary.materialize(message({
        part: "w+",
        op: "replace",
        path: targetAtomId,
        from: "energy-reaction",
        value: proposal,
      }))
      const terminal = committed?.messages.at(-1)?.parts[0]
      expect(terminal?.op).toBe("copy")
      expect(terminal?.value).toMatchObject({status: "committed", relationKey: relation.key})
      if (!isReactionResultCommit(terminal?.value)) throw new Error("Boundary did not acknowledge Reaction execution")
      const secondStart = router.settle(terminal.value)
      if (!secondStart) throw new Error("Matrix did not start the second durable Reaction")

      const secondRegistration = await boundary.materialize(message({
        part: "photon",
        op: "test",
        path: targetAtomId,
        from: secondStart.reactionExecutionId,
        value: secondStart,
      }))
      const secondPendingQueue = secondRegistration?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionQueueCommit)
      if (!secondPendingQueue) throw new Error("Boundary did not promote second Reaction queue entry")
      router.confirmQueue(secondPendingQueue)
      const secondSignal = secondRegistration?.messages
        .map(({parts}) => parts[0]?.value)
        .find(isReactionExecutionSignal)
      if (!secondSignal) throw new Error("Boundary did not register second Reaction execution")
      expect(router.pending(targetAtomId)).toBe(secondSignal.reactionExecutionId)
      expect(secondSignal.readFields[0]?.[2]).toBe(1)
      await boundary.materialize(message({
        part: "z",
        op: "test",
        path: targetAtomId,
        value: {
          kind: REACTION_CLAIM_KIND,
          energy: "energy-reaction",
          reactionExecutionId: secondSignal.reactionExecutionId,
        },
      }))
      const secondResult = await executeReaction(secondSignal, "energy-reaction", {
        get: () => ({history: massHandle}),
        bind: () => {},
      })
      const secondCommit = await boundary.materialize(message({
        part: "w+",
        op: "replace",
        path: targetAtomId,
        from: "energy-reaction",
        value: {
          reactionExecutionId: secondSignal.reactionExecutionId,
          relationKey: secondSignal.relationKey,
          reactionId: secondSignal.reactionId,
          fields: secondResult.fields,
        } satisfies ReactionResultProposal,
      }))
      const secondTerminal = secondCommit?.messages.at(-1)?.parts[0]?.value
      if (!isReactionResultCommit(secondTerminal)) throw new Error("Second Reaction was not acknowledged")
      expect(router.settle(secondTerminal)).toBeNull()
      expect(router.pending(targetAtomId)).toBeNull()
      expect(history).toEqual(["ready", "ready"])

      const field = (await boundary.projection.sql<Array<{value: number}>>`
        SELECT atom_value.value
          FROM atom_value
          JOIN field ON field.id = atom_value.field
         WHERE atom_value.atom = ${targetAtomId} AND field.key = ${"count"}
      `)[0]
      expect(await readBoundaryValue(boundary.projection.sql, Number(field?.value))).toBe(2)
    } finally {
      await boundary.close()
    }
  })
})
