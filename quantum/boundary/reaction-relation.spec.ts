import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/relation-root"
const CHILD = "test/relation-child"
const LEAF = "test/relation-leaf"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary exact Reaction relations", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (part: ParticleInput): Promise<void> => {
    await boundary.materialize(message(part))
  }

  test("resolves parent, child, descendant, Meta and exact Atom selectors without duplicates", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Root"}})
    await apply({part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "root", position: 0}})
    await apply({
      part: "inflaton", op: "add", path: "matter",
      value: {wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD},
    })
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: CHILD, name: "Child"}})
    await apply({part: "inflaton", op: "add", path: "state", value: {wimp: CHILD, id: 1, name: "child", position: 0}})
    await apply({
      part: "inflaton", op: "add", path: "matter",
      value: {wimp: CHILD, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: LEAF},
    })
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: LEAF, name: "Leaf"}})
    await apply({part: "inflaton", op: "add", path: "state", value: {wimp: LEAF, id: 1, name: "leaf", position: 0}})

    const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${ROOT}, ${CHILD}, ${LEAF}) ORDER BY id
    `
    const root = Number(atoms.find((atom) => atom.wimp === ROOT)?.id)
    const child = Number(atoms.find((atom) => atom.wimp === CHILD)?.id)
    const leaf = Number(atoms.find((atom) => atom.wimp === LEAF)?.id)
    expect([root, child, leaf].every((id) => id > 0)).toBe(true)

    await apply({
      part: "inflaton",
      op: "add",
      path: "reaction",
      value: {
        wimp: ROOT,
        id: 1,
        key: "children-and-leaves",
        label: "Children and leaves",
        sources: [
          {relation: "child", meta: CHILD, states: ["child"]},
          {relation: "descendant", meta: LEAF, states: ["leaf"]},
          {meta: ROOT, states: ["root"]},
        ],
        src: "() => undefined",
        read: [],
        write: [],
        massRead: [],
        massWrite: [],
        states: [1],
      },
    })
    await apply({
      part: "inflaton",
      op: "add",
      path: "reaction",
      value: {
        wimp: CHILD,
        id: 1,
        key: "parent",
        label: "Parent",
        sources: [{relation: "parent", meta: ROOT, states: ["root"]}],
        src: "() => undefined",
        read: [],
        write: [],
        massRead: [],
        massWrite: [],
        states: [1],
      },
    })
    await apply({
      part: "inflaton",
      op: "add",
      path: "reaction",
      value: {
        wimp: ROOT,
        id: 2,
        key: "exact-leaf",
        label: "Exact leaf",
        sources: [
          {atom: `atom:${leaf}`, states: ["leaf"]},
          {relation: "descendant", meta: LEAF, states: ["leaf"]},
        ],
        src: "() => undefined",
        read: [],
        write: [],
        massRead: [],
        massWrite: [],
        states: [1],
      },
    })

    const relations = (await boundary.initialState()).reactionRelations
    const endpoints = relations.map((relation) => ({
      key: relation.reactionKey,
      source: relation.source.atomId,
      target: relation.target.atomId,
      states: relation.source.states.map(({name}) => name),
    }))
    expect(endpoints).toEqual([
      {key: "children-and-leaves", source: child, target: root, states: ["child"]},
      {key: "children-and-leaves", source: leaf, target: root, states: ["leaf"]},
      {key: "parent", source: root, target: child, states: ["root"]},
      {key: "exact-leaf", source: leaf, target: root, states: ["leaf"]},
    ])
    expect(relations.some((relation) => relation.source.atomId === relation.target.atomId)).toBe(false)

    const removal = await boundary.materialize(message({
      part: "inflaton",
      op: "remove",
      path: "matter",
      value: {wimp: CHILD, id: 1},
    }))
    expect(removal?.messages.map(({parts}) => parts[0]).some((part) =>
      part.part === "graviton" && part.op === "remove" && part.path === "reaction-link" &&
      (part.value as {reactionKey?: string})?.reactionKey === "children-and-leaves",
    )).toBe(true)
    expect((await boundary.initialState()).reactionRelations.some((current) =>
      current.reactionKey === "children-and-leaves" && current.source.atomId === leaf,
    )).toBe(false)
  })
})
