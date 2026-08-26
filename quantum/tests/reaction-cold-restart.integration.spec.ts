import {describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
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
import {open, type BoundaryDatabase} from "../boundary/sqlite.ts"
import {readBoundaryValue} from "../boundary/world.ts"
import {matterParticles} from "../dark/dark.ts"
import {EnergyMassCatalog} from "../energy/mass.ts"
import {executeReaction} from "../energy/reaction.ts"
import {MatrixReactionRouter} from "../matrix/reaction.ts"

const SOURCE = "audit/restart-source"
const TARGET = "audit/restart-target"

const message = (part: Omit<Particle, "ts"> & {ts?: number}): ForceMessage => ({
  parts: [{ts: 1, ...part}] as [Particle],
})

describe("Reaction cold restart", () => {
  test("keeps completed Mass writes and never repeats a previously claimed execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-reaction-restart-"))
    const database = join(directory, "boundary.sqlite")
    const massCatalog = new EnergyMassCatalog(join(directory, "mass"))
    let boundary: BoundaryDatabase | undefined
    try {
      const source = MetaFor("Restart source")
        .fields((field) => ({value: field.number.required(0)}))
        .superposition({idle: null, ready: null})
        .mass(() => ({}))
        .energy()
        .processes()
        .reactions()
        .matter()
        .bulk()
      const target = MetaFor("Restart target")
        .fields((field) => ({count: field.number.required(0)}))
        .superposition({idle: null})
        .mass((mass) => ({history: mass.json()}))
        .energy()
        .processes()
        .reactions((reaction) => [[
          ["idle"],
          reaction({
            key: "remember-ready",
            label: "Remember ready",
            mass: {read: ["history"], write: ["history"]},
          })
            .filter([{meta: SOURCE, states: ["ready"]}])
            .equal(async ({update, value, mass, observation}) => {
              const history = await mass.history.readJson() as string[]
              await mass.history.write([...history, observation.source.state])
              update({count: value.count + 1})
            }),
        ]])
        .matter(({html}) => html`<meta-for src="audit/restart-source" />`)
        .bulk()
      const declarations = new Map([[TARGET, target], [SOURCE, source]])

      boundary = await open(database)
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
      await boundary.materialize(message({
        part: "photon", op: "replace", path: sourceAtomId,
        from: "restart-source-idle", value: "idle",
      }))
      await boundary.materialize(message({
        part: "photon", op: "replace", path: targetAtomId,
        from: "restart-target-idle", value: "idle",
      }))

      const initial = await boundary.initialState()
      const relation = initial.reactionRelations[0]!
      const stateIds = new Map(initial.atoms.map((atom) => [atom.id, atom.state]))
      const wimps = new Map(initial.atoms.map((atom) => [atom.id, atom.wimp]))
      const outgoing: ReactionMatrixRequest[] = []
      let sequence = 0
      const router = new MatrixReactionRouter({
        currentStateId: (atomId) => stateIds.get(atomId) ?? null,
        currentWimp: (atomId) => wimps.get(atomId) ?? null,
        executionId: () => `restart-execution-${++sequence}`,
        emit: (request) => outgoing.push(request),
      })
      router.hydrate(relation ? [relation] : [], initial.atoms.map((atom) => [atom.id, atom.state] as const))

      const commitSource = async (state: "idle" | "ready", eventId: string) => {
        const stateId = Number((await boundary!.projection.sql<Array<{id: number}>>`
          SELECT id FROM state WHERE wimp = ${SOURCE} AND name = ${state}
        `)[0]?.id)
        stateIds.set(sourceAtomId, stateId)
        const committed = await boundary!.materialize(message({
          part: "photon", op: "replace", path: sourceAtomId, from: eventId, value: state,
        }))
        const event = committed?.messages.map((entry) => entry.parts[0]?.value).find(isReactionStateCommit)
        if (!event) throw new Error(`Source State ${state} was not confirmed`)
        return event
      }
      const enqueue = async (eventId: string): Promise<ReactionTriggerRequest> => {
        const event = await commitSource("ready", eventId)
        const request = router.confirmState(event, Date.now())[0]
        if (!request) throw new Error("Matrix did not enqueue Reaction")
        const registered = await boundary!.materialize(message({
          part: "photon", op: "test", path: targetAtomId,
          from: request.reactionExecutionId, value: request,
        }))
        const queue = registered?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit)
        if (!queue) throw new Error("Boundary did not commit Reaction queue entry")
        const start = router.confirmQueue(queue)
        if (start) {
          const promoted = await boundary!.materialize(message({
            part: "photon", op: "test", path: targetAtomId,
            from: start.reactionExecutionId, value: start,
          }))
          const pendingQueue = promoted?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit)
          if (!pendingQueue) throw new Error("Boundary did not promote first Reaction")
          router.confirmQueue(pendingQueue)
        }
        return request
      }

      const firstRequest = await enqueue("restart-ready-first")
      await commitSource("idle", "restart-idle-between")
      const secondRequest = await enqueue("restart-ready-second")
      expect(router.pending(targetAtomId)).toBe(firstRequest.reactionExecutionId)
      expect(router.queued(targetAtomId)).toBe(1)

      const firstSignalRow = (await boundary.projection.sql<Array<{signal: string}>>`
        SELECT signal_json AS signal FROM boundary_reaction_execution
         WHERE execution_id = ${firstRequest.reactionExecutionId}
      `)[0]
      const firstSignalValue: unknown = JSON.parse(firstSignalRow!.signal)
      if (!isReactionExecutionSignal(firstSignalValue)) throw new Error("First signal is invalid")
      await boundary.materialize(message({
        part: "z", op: "test", path: targetAtomId,
        value: {
          kind: REACTION_CLAIM_KIND,
          energy: "energy-before-restart",
          reactionExecutionId: firstSignalValue.reactionExecutionId,
        },
      }))

      const mass = (await boundary.projection.sql<Array<{
        id: number
        keyId: string
        format: "json" | "binary"
      }>>`
        SELECT declaration.id, membership.key AS keyId, declaration.format
          FROM mass_declaration AS declaration
          JOIN mass_membership AS membership ON membership.declaration = declaration.id
         WHERE membership.atom = ${targetAtomId} AND declaration.local_key = ${"history"}
      `)[0]!
      const massHandle = massCatalog.handle(mass)
      await massHandle.write([])
      const massStore = {get: () => ({history: massHandle}), bind: () => {}}
      await executeReaction(firstSignalValue, "energy-before-restart", massStore)
      expect(await massHandle.readJson<string[]>()).toEqual(["ready"])

      await boundary.close()
      boundary = await open(database)
      const restarted = await boundary.initialState()
      expect(restarted.unfinishedReactionExecutions.map(({queue, energy}) => [
        queue.request.reactionExecutionId,
        queue.status,
        energy,
      ])).toEqual([
        [firstRequest.reactionExecutionId, "pending", "energy-before-restart"],
        [secondRequest.reactionExecutionId, "queued", null],
      ])

      const recoveredOutgoing: ReactionMatrixRequest[] = []
      const recoveredRouter = new MatrixReactionRouter({
        currentStateId: (atomId) => restarted.atoms.find((atom) => atom.id === atomId)?.state ?? null,
        currentWimp: (atomId) => restarted.atoms.find((atom) => atom.id === atomId)?.wimp ?? null,
        emit: (request) => recoveredOutgoing.push(request),
      })
      recoveredRouter.hydrate(
        restarted.reactionRelations,
        restarted.atoms.map((atom) => [atom.id, atom.state] as const),
        restarted.unfinishedReactionExecutions,
      )
      const recovery = recoveredRouter.resumeColdStart()[0]
      if (!recovery || recovery.kind !== "reaction-recovery") throw new Error("Matrix did not recover pending Reaction")
      const abandoned = await boundary.materialize(message({
        part: "photon", op: "test", path: targetAtomId,
        from: recovery.reactionExecutionId, value: recovery,
      }))
      const abandonedTerminal = abandoned?.messages[0]?.parts[0]?.value
      if (!isReactionResultCommit(abandonedTerminal)) throw new Error("Claimed Reaction was not superseded")
      expect(abandonedTerminal.status).toBe("superseded")
      const start = recoveredRouter.settle(abandonedTerminal)
      if (!start) throw new Error("Matrix did not start recovered queue head")
      const promoted = await boundary.materialize(message({
        part: "photon", op: "test", path: targetAtomId,
        from: start.reactionExecutionId, value: start,
      }))
      const promotedQueue = promoted?.messages.map((entry) => entry.parts[0]?.value).find(isReactionQueueCommit)
      const secondSignal = promoted?.messages.map((entry) => entry.parts[0]?.value).find(isReactionExecutionSignal)
      if (!promotedQueue || !secondSignal) throw new Error("Recovered queue head was not offered")
      recoveredRouter.confirmQueue(promotedQueue)

      await boundary.materialize(message({
        part: "z", op: "test", path: targetAtomId,
        value: {
          kind: REACTION_CLAIM_KIND,
          energy: "energy-after-restart",
          reactionExecutionId: secondSignal.reactionExecutionId,
        },
      }))
      const result = await executeReaction(secondSignal, "energy-after-restart", massStore)
      const committed = await boundary.materialize(message({
        part: "w+", op: "replace", path: targetAtomId, from: "energy-after-restart",
        value: {
          reactionExecutionId: secondSignal.reactionExecutionId,
          relationKey: secondSignal.relationKey,
          reactionId: secondSignal.reactionId,
          fields: result.fields,
        } satisfies ReactionResultProposal,
      }))
      const terminal = committed?.messages.at(-1)?.parts[0]?.value
      if (!isReactionResultCommit(terminal)) throw new Error("Recovered Reaction was not committed")
      expect(recoveredRouter.settle(terminal)).toBeNull()
      expect(await massHandle.readJson<string[]>()).toEqual(["ready", "ready"])

      const field = (await boundary.projection.sql<Array<{value: number}>>`
        SELECT atom_value.value
          FROM atom_value
          JOIN field ON field.id = atom_value.field
         WHERE atom_value.atom = ${targetAtomId} AND field.key = ${"count"}
      `)[0]
      expect(await readBoundaryValue(boundary.projection.sql, Number(field?.value))).toBe(1)
    } finally {
      await boundary?.close()
      await rm(directory, {recursive: true, force: true})
    }
  })
})
