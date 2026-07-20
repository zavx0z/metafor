import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {DeclarationPath} from "shared/protocol/force/declaration"
import type {Particle} from "shared/protocol/force/particle"
import {gravitonDeclarationPath, parseInflatonAddress} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/root"
const CHILD = "owner/child"
const PEER = "owner/peer"

describe("Boundary incremental relational projection", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (op: "add" | "replace" | "remove", path: DeclarationPath, value: Record<string, unknown>) =>
    await boundary.materialize({parts: [{part: "inflaton", op, path, value, by: "dark", ts: 1}]})

  const declareWimp = async (src: string, name = src) => await apply("add", "wimp", {src, name, desc: null})

  const declareRoot = async (): Promise<number> => {
    await declareWimp(ROOT, "Root")
    return Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} AND parent_atom IS NULL
    `)[0]!.id)
  }

  test("parses categorical identity while preserving slash-bearing WIMP SRC", () => {
    const field = parseInflatonAddress("field", {wimp: "owner/project", id: 17})
    expect(field).toEqual({path: "field", src: "owner/project", localId: 17})
    expect(gravitonDeclarationPath(field!)).toBe("field")
    expect(parseInflatonAddress("owner/project/field/17", {wimp: "owner/project", id: 17})).toBeNull()
  })

  test("applies one Field transaction and keeps the relational identity on replace", async () => {
    await declareRoot()
    const added = await apply("add", "field", {
      wimp: ROOT, id: 1, key: "title", type: "string", required: false, label: "Before",
    })
    const databaseId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const replaced = await apply("replace", "field", {
      wimp: ROOT, id: 1, key: "title", type: "string", required: false, label: "After",
    })

    expect(added?.messages).toContainEqual({parts: [{
      part: "graviton", op: "add", path: "field", ts: expect.any(Number),
      value: {wimp: ROOT, localId: 1, id: databaseId, key: "title", type: "string", required: false, label: "Before"},
    }]})
    expect(replaced?.messages).toContainEqual({parts: [{
      part: "graviton", op: "replace", path: "field", ts: expect.any(Number),
      value: {wimp: ROOT, localId: 1, id: databaseId, key: "title", type: "string", required: false, label: "After"},
    }]})
    expect(await boundary.projection.sql<Array<{id: number; label: string}>>`
      SELECT id, label FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `).toEqual([{id: databaseId, label: "After"}])
  })

  test("materializes an unreferenced trusted WIMP immediately as a root Atom", async () => {
    await declareRoot()
    const commit = await declareWimp("capsule", "Capsule")
    const atom = (await boundary.projection.sql<Array<{id: number; wimp: string; name: string}>>`
      SELECT atom.id, atom.wimp, wimp.name FROM atom JOIN wimp ON wimp.src = atom.wimp
       WHERE atom.wimp = ${"capsule"} AND atom.parent_atom IS NULL AND atom.parent_topology IS NULL
    `)[0]
    expect(atom).toEqual({id: expect.any(Number), wimp: "capsule", name: "Capsule"})
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "add", path: `atom/${atom!.id}`, ts: expect.any(Number),
      value: expect.objectContaining({atom: expect.objectContaining({id: atom!.id, wimp: "capsule"})}),
    }]})
  })

  test("removing one Matter relation preserves the root, sibling and their identities", async () => {
    const rootId = await declareRoot()
    await apply("add", "matter", {wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD})
    await apply("add", "matter", {wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: PEER})
    await declareWimp(CHILD, "Child")
    await declareWimp(PEER, "Peer")
    const before = await boundary.projection.sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM atom ORDER BY id`
    const childId = Number(before.find((atom) => atom.wimp === CHILD)!.id)
    const peerId = Number(before.find((atom) => atom.wimp === PEER)!.id)

    const removed = await apply("remove", "matter", {wimp: ROOT, id: 1})
    expect(removed?.messages).toContainEqual({parts: [{part: "graviton", op: "remove", path: `atom/${childId}`, ts: expect.any(Number)}]})
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM atom ORDER BY id`).toEqual([
      {id: rootId, wimp: ROOT},
      {id: peerId, wimp: PEER},
    ])
  })

  test("materializes child Fields from the parent Matter binding", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "operation", type: "string", default: "commit"})
    await apply("add", "field", {wimp: ROOT, id: 2, key: "args", type: "string", default: "--dry-run"})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: ["operation", "args"], expr: "{operation: _[0], args: _[1]}"},
    })
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "operation", type: "string"})
    await apply("add", "field", {wimp: CHILD, id: 2, key: "args", type: "string"})

    expect(await boundary.projection.sql<Array<{value: string}>>`
      SELECT value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE atom.wimp = ${CHILD}
       ORDER BY field.local_id
    `).toEqual([{value: "commit"}, {value: "--dry-run"}])
  })

  test("stores Macho topology and rebuilds only its repeated children on Higgs", async () => {
    const rootId = await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "items", type: "array", required: true, default: ["a", "b"]})
    const field = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
    await apply("add", "matter", {wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "macho", collectionBinding: {data: "items"}})
    await apply("add", "matter", {wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0, kind: "wimp", src: CHILD})
    await apply("add", "matter", {wimp: ROOT, id: 3, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: PEER})
    await declareWimp(CHILD, "Child")
    await declareWimp(PEER, "Peer")
    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id)
    const peerId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`)[0]!.id)
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(2)

    await boundary.materialize({parts: [{part: "higgs", op: "replace", path: rootId, value: {fields: {[String(field)]: ["one"]}}, by: "matrix", ts: 2}]})
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id).toBe(topologyId)
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(1)
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`)[0]!.id).toBe(peerId)
  })

  test("reconciles only the selected State-driven Axion branch", async () => {
    const rootId = await declareRoot()
    await apply("add", "state", {wimp: ROOT, id: 1, name: "idle", position: 0})
    await apply("add", "state", {wimp: ROOT, id: 2, name: "ready", position: 1})
    await apply("add", "matter", {wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "axion", predicateBinding: {data: "/state", expr: "_[0] === 'ready'"}})
    await apply("add", "matter", {wimp: ROOT, id: 2, parent: 1, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD})
    await apply("add", "matter", {wimp: ROOT, id: 3, parent: 1, edgeSlot: "else", position: 1, kind: "wimp", src: PEER})
    await declareWimp(CHILD, "Ready child")
    await declareWimp(PEER, "Fallback child")
    expect(await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${CHILD}`).toEqual([])
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${PEER}`).length).toBe(1)

    const commit = await boundary.materialize({parts: [{part: "photon", op: "replace", path: rootId, value: "ready", by: "matrix", ts: 2}]})
    expect(await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`).toEqual([])
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(1)
    expect(commit).not.toBeUndefined()
  })

  test("canonical Process resolves relational Field identities for Energy", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "command", type: "string"})
    const field = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
    const commit = await apply("add", "process", {
      wimp: ROOT, id: 1, key: "ready", type: "action", env: ["server"],
      action: {src: "./run.ts", importSpecifier: "run", read: [1]},
      success: {src: "({update}) => update({})", read: [1], write: [1]}, error: null,
    })
    const process = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM process WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "add", path: "process", ts: expect.any(Number),
      value: expect.objectContaining({
        id: process, wimp: ROOT, localId: 1, state: "ready",
        descriptor: expect.objectContaining({
          action: expect.objectContaining({readFields: [[field, "command"]]}),
          success: expect.objectContaining({readFields: [[field, "command"]], writeFields: [[field, "command"]]}),
        }),
      }),
    }]})
  })

  test("replay is an ordinary one-entity stream reconstructed from relations", async () => {
    const rootId = await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "title", type: "string", default: "hello"})
    const replay = await boundary.replay()
    expect(replay.every((message) => message.parts.length === 1)).toBe(true)
    expect(replay.some((message) => message.parts[0].path === "wimp")).toBe(true)
    expect(replay.some((message) => message.parts[0].path === "field")).toBe(true)
    expect(replay.some((message) => message.parts[0].path === `atom/${rootId}`)).toBe(true)
  })

  test("replay reconstructs declarations and runtime topology only from normalized relations", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "mode", type: "string", default: "idle"})
    await apply("add", "field", {wimp: ROOT, id: 2, key: "items", type: "array", default: ["one"]})
    await apply("add", "state", {wimp: ROOT, id: 1, name: "idle", position: 0})
    await apply("add", "state", {wimp: ROOT, id: 2, name: "ready", position: 1})
    await apply("add", "transition", {wimp: ROOT, id: 1, from: 1, to: 2, position: 0})
    await apply("add", "condition", {
      wimp: ROOT, id: 1, transition: 1, field: 1, position: 0, predicate: {eq: "ready"},
    })
    await apply("add", "process", {
      wimp: ROOT, id: 1, key: "ready", type: "action", env: ["server"],
      action: {src: "./run.ts", read: [1]},
      success: {src: "({update}) => update({})", read: [1], write: [1]},
      error: null,
    })
    await apply("add", "reaction", {
      wimp: ROOT, id: 1, key: "refresh", label: "Refresh", cond: "() => true",
      src: "({update}) => update({mode: 'ready'})", read: [1], write: [1], states: [1],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")
    await apply("add", "mass", {wimp: ROOT, id: 1, value: {cache: true}})
    await apply("add", "bulk", {wimp: ROOT, id: 1, view: ".root {}"})

    const replay = await boundary.replay()
    const paths = new Set(replay.map((message) => message.parts[0].path))
    for (const path of [
      "wimp", "field", "state", "transition", "condition", "process", "reaction", "matter", "mass", "bulk",
    ]) expect(paths.has(path)).toBe(true)
    expect([...paths].some((path) => typeof path === "string" && path.startsWith("topology/"))).toBe(true)
    expect([...paths].some((path) => typeof path === "string" && path.startsWith("atom/"))).toBe(true)
    const process = replay.find((message) => message.parts[0].path === "process")?.parts[0].value
    expect(process).toEqual(expect.objectContaining({
      wimp: ROOT,
      localId: 1,
      descriptor: expect.objectContaining({
        action: expect.objectContaining({readFields: [[1, "mode"]]}),
      }),
    }))
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("a failed relation transaction leaves no declaration residue", async () => {
    await declareRoot()
    await expect(apply("add", "field", {wimp: ROOT, id: 1, key: "broken", type: "object"})).rejects.toThrow()
    expect(await boundary.projection.sql<unknown[]>`SELECT id FROM field WHERE wimp = ${ROOT}`).toEqual([])
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })
})
