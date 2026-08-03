import {describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {
  REACTION_CLAIM_KIND,
  isReactionExecutionSignal,
  type ReactionResultProposal,
} from "shared/protocol/force/reaction"
import {open} from "./boundary/sqlite.ts"
import {readBoundaryValue} from "./boundary/world.ts"
import {matterParticles} from "./dark/dark.ts"
import {executeReaction} from "./energy/reaction.ts"
import {MetaFor} from "./metafor.ts"

const SOURCE = "audit/reaction-source"
const TARGET = "audit/reaction-target"

const message = (part: Omit<Particle, "ts"> & {ts?: number}): ForceMessage => ({
  parts: [{ts: 1, ...part}] as [Particle],
})

describe("Reaction multi-Field result", () => {
  test("preserves every declared read and write from DSL through Boundary commit", async () => {
    const source = MetaFor("Reaction source")
      .fields((field) => ({trigger: field.number.required(0)}))
      .superposition({idle: null})
      .mass(() => ({}))
      .energy()
      .processes()
      .reactions()
      .matter()
      .bulk()
    const target = MetaFor("Reaction target")
      .fields((field) => ({
        a: field.number.required(1),
        b: field.number.required(2),
      }))
      .superposition({idle: null})
      .mass(() => ({}))
      .energy()
      .processes()
      .reactions((reaction) => [[
        ["idle"],
        reaction({label: "Update both Fields"})
          .filter(() => ({meta: "audit/reaction-source", op: "replace", path: "/context"}))
          .equal(({update, value}) => {
            const {a, b} = value
            update({a: a + 1, b: b + 2})
          }),
      ]])
      .matter(({html}) => html`<meta-for src="audit/reaction-source" />`)
      .bulk()

    expect(target.reactions?.[0]).toMatchObject({read: ["a", "b"], write: ["a", "b"]})

    const declarations = new Map([[TARGET, target], [SOURCE, source]])
    const boundary = await open(":memory:")
    try {
      for await (const part of matterParticles(TARGET, async (src) => {
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

      await boundary.materialize(message({part: "photon", op: "replace", path: sourceAtomId, value: "idle"}))
      await boundary.materialize(message({part: "photon", op: "replace", path: targetAtomId, value: "idle"}))

      const sourceFieldId = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM field WHERE wimp = ${SOURCE} AND key = ${"trigger"}
      `)[0]?.id)
      const sourceCommit = await boundary.materialize(message({
        part: "gluon",
        op: "replace",
        path: sourceAtomId,
        value: {fields: {[String(sourceFieldId)]: 1}},
      }))
      const signalPart = sourceCommit?.messages.find(({parts}) => isReactionExecutionSignal(parts[0]?.value))?.parts[0]
      if (!signalPart || !isReactionExecutionSignal(signalPart.value)) throw new Error("Reaction was not scheduled")
      const signal = signalPart.value
      expect(signal.writeFields.map(([, key]) => key)).toEqual(["a", "b"])

      await boundary.materialize(message({
        part: "z",
        op: "test",
        path: targetAtomId,
        value: {
          kind: REACTION_CLAIM_KIND,
          energy: "energy-aud-001",
          reactionExecutionId: signal.reactionExecutionId,
        },
      }))
      const result = await executeReaction(signal, "energy-aud-001", {get: () => ({}), bind: () => {}})
      expect(Object.keys(result.fields)).toHaveLength(2)

      const proposal: ReactionResultProposal = {
        reactionExecutionId: signal.reactionExecutionId,
        reactionId: signal.reactionId,
        matched: result.matched,
        fields: result.fields,
      }
      await boundary.materialize(message({
        part: "w+",
        op: "replace",
        path: targetAtomId,
        from: "energy-aud-001",
        value: proposal,
      }))

      const stored: Record<string, unknown> = {}
      for (const row of await boundary.projection.sql<Array<{key: string; valueId: number}>>`
        SELECT field.key AS key, atom_value.value AS valueId
          FROM atom_value JOIN field ON field.id = atom_value.field
         WHERE atom_value.atom = ${targetAtomId} AND field.wimp = ${TARGET}
         ORDER BY field.local_id
      `) stored[row.key] = await readBoundaryValue(boundary.projection.sql, Number(row.valueId))
      expect(stored).toEqual({a: 2, b: 4})
    } finally {
      await boundary.close()
    }
  })
})
