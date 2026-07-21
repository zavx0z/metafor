import {SQL} from "bun"
import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
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
    expect(parseInflatonAddress("mass", {wimp: "owner/project", id: 17})).toBeNull()
  })

  test("drops the legacy WIMP Mass declaration table when opening an existing Boundary database", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-boundary-mass-migration-"))
    const filename = join(directory, "boundary.sqlite")
    await boundary.close()

    try {
      const legacy = new SQL(`sqlite://${filename}`)
      await legacy.unsafe("CREATE TABLE wimp_mass_value (id INTEGER PRIMARY KEY, value TEXT);")
      await legacy.close()

      boundary = await open(filename)
      expect(await boundary.projection.sql<Array<{name: string}>>`
        SELECT name FROM sqlite_master WHERE type = ${"table"} AND name = ${"wimp_mass_value"}
      `).toEqual([])
    } finally {
      await boundary.close()
      await rm(directory, {recursive: true, force: true})
      boundary = await open(":memory:")
    }
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

  test("removing a root WIMP clears its repository contour while preserving unrelated Boundary state", async () => {
    const internal = `${ROOT}/child`
    const originalRootId = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: internal,
    })
    await declareWimp(internal, "Internal")
    await declareWimp(PEER, "Peer")

    const commit = await boundary.materialize({parts: [{
      part: "inflaton",
      op: "remove",
      path: "wimp",
      by: "dark",
      ts: 2,
      value: {src: ROOT},
    }]})

    expect(await boundary.projection.sql<Array<{src: string}>>`SELECT src FROM wimp ORDER BY src`).toEqual([
      {src: PEER},
    ])
    expect(await boundary.projection.sql<Array<{wimp: string}>>`SELECT wimp FROM atom ORDER BY id`).toEqual([
      {wimp: PEER},
    ])
    expect(await boundary.projection.sql<Array<{declarationWimp: string}>>`
      SELECT declaration_wimp AS declarationWimp FROM boundary_runtime_origin
       WHERE declaration_wimp = ${ROOT}
          OR substr(declaration_wimp, 1, ${ROOT.length + 1}) = ${`${ROOT}/`}
    `).toEqual([])
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "remove",
      path: "wimp",
      ts: expect.any(Number),
      value: expect.objectContaining({src: ROOT}),
    }]})

    const recreatedRootId = await declareRoot()
    expect(recreatedRootId).not.toBe(originalRootId)
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${ROOT}, ${PEER}) ORDER BY id
    `).toEqual([
      {id: expect.any(Number), wimp: PEER},
      {id: recreatedRootId, wimp: ROOT},
    ])
  })

  test("materializes direct child Fields as canonical entanglement with the parent", async () => {
    const rootId = await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "operation", type: "string", default: "commit"})
    await apply("add", "field", {wimp: ROOT, id: 2, key: "args", type: "string", default: "--dry-run"})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: ["operation", "args"], expr: "{operation: _[0], args: _[1]}"},
      massBinding: {data: "/mass/cache", expr: "{cache: _[0]}"},
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "operation", type: "string"})
    const childReady = await apply("add", "field", {wimp: CHILD, id: 2, key: "args", type: "string"})

    const materialized = await boundary.projection.sql<Array<{atom: number; wimp: string; field: number; key: string; valueId: number; value: string}>>`
      SELECT atom.id AS atom, atom.wimp, field.id AS field, field.key,
             atom_value.value AS valueId, value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE atom.wimp IN (${ROOT}, ${CHILD})
       ORDER BY field.key, atom.id
    `
    expect(materialized.map(({wimp, key, value}) => ({wimp, key, value}))).toEqual([
      {wimp: ROOT, key: "args", value: "--dry-run"},
      {wimp: CHILD, key: "args", value: "--dry-run"},
      {wimp: ROOT, key: "operation", value: "commit"},
      {wimp: CHILD, key: "operation", value: "commit"},
    ])
    expect(new Set(materialized.filter((row) => row.key === "operation").map((row) => row.valueId)).size).toBe(1)
    expect(new Set(materialized.filter((row) => row.key === "args").map((row) => row.valueId)).size).toBe(1)

    const sources = await boundary.projection.sql<Array<{
      childAtom: number; childField: number; parentAtom: number; parentField: number
    }>>`
      SELECT child_atom AS childAtom, child_field AS childField,
             parent_atom AS parentAtom, parent_field AS parentField
        FROM atom_field_source
       ORDER BY child_field
    `
    const childRows = materialized.filter((row) => row.wimp === CHILD)
    const rootRows = new Map(materialized.filter((row) => row.wimp === ROOT).map((row) => [row.key, row]))
    expect(sources).toEqual(childRows.map((row) => ({
      childAtom: row.atom,
      childField: row.field,
      parentAtom: rootId,
      parentField: rootRows.get(row.key)!.field,
    })).sort((left, right) => left.childField - right.childField))
    const childAtom = childReady?.messages.find((message) => {
      const value = message.parts[0].value as {atom?: {wimp?: string; parentAtom?: number | null; parentTopology?: number | null}} | undefined
      return value?.atom?.wimp === CHILD && (value.atom.parentAtom !== null || value.atom.parentTopology !== null)
    })?.parts[0].value as Record<string, unknown> | undefined
    expect(childAtom?.continuation).toEqual({
      massBinding: {data: "/mass/cache", expr: "{cache: _[0]}"},
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })
    expect((await boundary.replay()).find((message) => {
      const value = message.parts[0].value as {atom?: {wimp?: string; parentAtom?: number | null; parentTopology?: number | null}} | undefined
      return value?.atom?.wimp === CHILD && (value.atom.parentAtom !== null || value.atom.parentTopology !== null)
    })?.parts[0].value).toEqual(childAtom)

    const childOperation = childRows.find((row) => row.key === "operation")!
    const updated = await boundary.materialize({parts: [{
      part: "gluon",
      op: "replace",
      path: childOperation.atom,
      ts: 2,
      value: {fields: {[String(childOperation.field)]: "push"}},
    }]})
    const linked = updated?.messages.filter((message) => message.parts[0].part === "gluon") ?? []
    expect(linked.map((message) => message.parts[0].path).sort()).toEqual([rootId, childOperation.atom].sort())
    expect(new Set(linked.map((message) => message.parts[0].ts)).size).toBe(1)
    expect(await boundary.projection.sql<Array<{wimp: string; value: string}>>`
      SELECT atom.wimp, value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE field.key = ${"operation"}
       ORDER BY atom.id
    `).toEqual([{wimp: ROOT, value: "push"}, {wimp: CHILD, value: "push"}])

    const childId = Number((childAtom?.atom as {id?: number} | undefined)?.id)
    const rebound = await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: ["operation", "args"], expr: "{operation: _[0], args: _[1]}"},
      massBinding: {data: "/mass"},
    })
    expect(rebound?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "replace",
      path: `atom/${childId}`,
      ts: expect.any(Number),
      value: expect.objectContaining({continuation: {massBinding: {data: "/mass"}}}),
    }]})
    expect((await boundary.projection.sql<Array<{mass: number | null; energy: number | null}>>`
      SELECT edge.mass_binding AS mass, edge.energy_binding AS energy
        FROM matter_particle_wimp AS edge
        JOIN matter_particle AS particle ON particle.id = edge.particle
       WHERE particle.wimp = ${ROOT} AND particle.local_id = ${1}
    `)[0]).toEqual({mass: expect.any(Number), energy: null})
    expect((await boundary.replay()).find((message) => message.parts[0].path === `atom/${childId}`)?.parts[0].value)
      .toEqual(expect.objectContaining({continuation: {massBinding: {data: "/mass"}}}))
  })

  test("keeps computed child Field values independent from their parent dependencies", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "source", type: "string", default: "capsule"})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "source", expr: '{copy: _[0] + ""}'},
    })
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "copy", type: "string"})

    const values = await boundary.projection.sql<Array<{wimp: string; valueId: number; value: string}>>`
      SELECT atom.wimp, atom_value.value AS valueId, value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE atom.wimp IN (${ROOT}, ${CHILD})
       ORDER BY atom.id
    `
    expect(values.map(({wimp, value}) => ({wimp, value}))).toEqual([
      {wimp: ROOT, value: "capsule"},
      {wimp: CHILD, value: "capsule"},
    ])
    expect(values[0]?.valueId).not.toBe(values[1]?.valueId)
    expect(await boundary.projection.sql<unknown[]>`SELECT * FROM atom_field_source`).toEqual([])
  })

  test("rebinds a materialized Matter Field direct to computed and back in place", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "source", type: "string", default: "capsule"})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "source", expr: "{copy: _[0]}"},
    })
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "copy", type: "string"})

    const computed = await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "source", expr: '{copy: _[0] + ""}'},
    })
    const computedAtom = computed?.messages.find((message) =>
      message.parts[0].part === "graviton" && /^atom\/\d+$/.test(String(message.parts[0].path)),
    )?.parts[0]
    expect(computedAtom).toMatchObject({part: "graviton", op: "replace", ts: expect.any(Number)})
    expect(computedAtom?.value).not.toHaveProperty("fieldSources")
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom_field_source
    `).toEqual([{count: 0}])
    const independent = await boundary.projection.sql<Array<{valueId: number}>>`
      SELECT atom_value.value AS valueId
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
       WHERE field.key IN (${"source"}, ${"copy"})
       ORDER BY atom.id
    `
    expect(new Set(independent.map((value) => value.valueId)).size).toBe(2)

    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "source", expr: "{copy: _[0]}"},
    })
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom_field_source
    `).toEqual([{count: 1}])
    const shared = await boundary.projection.sql<Array<{valueId: number}>>`
      SELECT atom_value.value AS valueId
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
       WHERE field.key IN (${"source"}, ${"copy"})
       ORDER BY atom.id
    `
    expect(new Set(shared.map((value) => value.valueId)).size).toBe(1)
  })

  test("propagates one direct Field value across a parent and sibling children in one time step", async () => {
    const rootId = await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "signal", type: "string", default: "idle"})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "signal", expr: "{signal: _[0]}"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: PEER,
      fieldsBinding: {data: "signal", expr: "{signal: _[0]}"},
    })
    await declareWimp(CHILD, "Child")
    await declareWimp(PEER, "Peer")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "signal", type: "string"})
    await apply("add", "field", {wimp: PEER, id: 1, key: "signal", type: "string"})

    const members = await boundary.projection.sql<Array<{
      atom: number; field: number; wimp: string; valueId: number; value: string
    }>>`
      SELECT atom.id AS atom, field.id AS field, atom.wimp,
             atom_value.value AS valueId, value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE field.key = ${"signal"}
       ORDER BY atom.id
    `
    expect(members.map(({wimp, value}) => ({wimp, value}))).toEqual([
      {wimp: ROOT, value: "idle"},
      {wimp: CHILD, value: "idle"},
      {wimp: PEER, value: "idle"},
    ])
    expect(new Set(members.map((member) => member.valueId)).size).toBe(1)

    const child = members.find((member) => member.wimp === CHILD)!
    const committed = await boundary.materialize({parts: [{
      part: "gluon",
      op: "replace",
      path: child.atom,
      ts: 2,
      value: {fields: {[String(child.field)]: "awake"}},
    }]})
    const gluons = committed?.messages.filter((message) => message.parts[0].part === "gluon") ?? []
    expect(gluons.map((message) => message.parts[0].path).sort()).toEqual(
      members.map((member) => member.atom).sort(),
    )
    expect(new Set(gluons.map((message) => message.parts[0].ts)).size).toBe(1)
    expect(gluons.find((message) => message.parts[0].path === rootId)).toBeDefined()
    expect(await boundary.projection.sql<Array<{value: string}>>`
      SELECT value_string.text AS value
        FROM atom_value
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE field.key = ${"signal"}
       ORDER BY atom_value.atom
    `).toEqual([{value: "awake"}, {value: "awake"}, {value: "awake"}])

    await apply("remove", "matter", {wimp: ROOT, id: 1})
    const survivors = await boundary.projection.sql<Array<{wimp: string; valueId: number; value: string}>>`
      SELECT atom.wimp, atom_value.value AS valueId, value_string.text AS value
        FROM atom_value
        JOIN atom ON atom.id = atom_value.atom
        JOIN field ON field.id = atom_value.field
        JOIN value_string ON value_string.value = atom_value.value
       WHERE field.key = ${"signal"}
       ORDER BY atom.id
    `
    expect(survivors.map(({wimp, value}) => ({wimp, value}))).toEqual([
      {wimp: ROOT, value: "awake"},
      {wimp: PEER, value: "awake"},
    ])
    expect(new Set(survivors.map((member) => member.valueId)).size).toBe(1)
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom_field_source
    `).toEqual([{count: 1}])
  })

  test("rejects direct entanglement when parent and child Field kinds differ", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "signal", type: "number", default: 1})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "signal", expr: "{signal: _[0]}"},
    })
    await declareWimp(CHILD, "Child")

    await expect(apply("add", "field", {
      wimp: CHILD, id: 1, key: "signal", type: "string",
    })).rejects.toThrow("requires the same Field type")
    expect(await boundary.projection.sql<unknown[]>`
      SELECT id FROM field WHERE wimp = ${CHILD} AND local_id = ${1}
    `).toEqual([])
  })

  test("rejects direct entanglement of topology Fields", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "items", type: "array", default: ["one"]})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      fieldsBinding: {data: "items", expr: "{items: _[0]}"},
    })
    await declareWimp(CHILD, "Child")

    await expect(apply("add", "field", {
      wimp: CHILD, id: 1, key: "items", type: "array",
    })).rejects.toThrow("cannot entangle topology Fields")
  })

  test("rejects cross-domain and executable Mass/Energy Matter bindings", async () => {
    await declareRoot()

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })).rejects.toThrow("matter.massBinding dependency must use /mass")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy/socket", expr: "() => _[0]"},
    })).rejects.toThrow("matter.energyBinding must not create executable resources")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 3, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0].close()}"},
    })).rejects.toThrow("matter.energyBinding must not create executable resources")

    expect(await boundary.projection.sql<unknown[]>`SELECT id FROM matter_particle WHERE wimp = ${ROOT}`).toEqual([])
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
    await apply("add", "bulk", {wimp: ROOT, id: 1, view: ".root {}"})

    const replay = await boundary.replay()
    const paths = new Set(replay.map((message) => message.parts[0].path))
    for (const path of [
      "wimp", "field", "state", "transition", "condition", "process", "reaction", "matter", "bulk",
    ]) expect(paths.has(path)).toBe(true)
    expect(paths.has("mass")).toBe(false)
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
