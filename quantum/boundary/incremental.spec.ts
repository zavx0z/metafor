import {SQL} from "bun"
import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {mkdir, mkdtemp, rm, unlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import type {DeclarationPath} from "shared/protocol/force/declaration"
import type {Particle} from "shared/protocol/force/particle"
import {GRAPH_SCHEMA, parseMetaAddress, type Graph} from "@metafor/types/metafor/graph"
import {prepareBulkGraphCut} from "../bulk/graph/projection.ts"
import {massFileName} from "../../shared/mass.ts"
import {readBoundaryGraphProjection} from "./graph/runtime.ts"
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

  const transfer = async (
    op: "move" | "copy",
    path: DeclarationPath,
    from: string | number,
    value: Record<string, unknown>,
  ) => await boundary.materialize({parts: [{part: "inflaton", op, path, from, value, by: "dark", ts: 1}]})

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
    expect(parseInflatonAddress("mass", {wimp: "owner/project", id: 17}))
      .toEqual({path: "mass", src: "owner/project", localId: 17})
  })

  test("materializes one State composition and one Mass declaration from accepted entity patches", async () => {
    const rootAtom = await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "status", type: "string", required: false, variants: [],
    })
    const state = await apply("add", "state", {
      wimp: ROOT,
      id: 1,
      name: "ready",
      position: 0,
      transitions: [{
        id: 1,
        position: 0,
        to: 1,
        conditions: [{id: 1, position: 0, field: 1, predicate: {eq: "ok"}}],
      }],
    })
    expect(state?.messages.map((message) => message.parts[0].path)).toEqual([
      "state", "transition", "condition",
    ])
    expect(await boundary.projection.sql<Array<{fromLocal: number; toLocal: number; predicate: string}>>`
      SELECT source.local_id AS fromLocal, target.local_id AS toLocal,
             condition_predicate.value_text AS predicate
        FROM transition
        JOIN state AS source ON source.id = transition.from_state
        JOIN state AS target ON target.id = transition.to_state
        JOIN condition ON condition.transition = transition.id
        JOIN condition_predicate ON condition_predicate.condition = condition.id
    `).toEqual([{fromLocal: 1, toLocal: 1, predicate: "ok"}])

    const replaced = await apply("replace", "state", {
      wimp: ROOT, id: 1, name: "idle", position: 0, transitions: [],
    })
    expect(replaced?.messages.map((message) => [message.parts[0].op, message.parts[0].path]))
      .toEqual([["remove", "condition"], ["remove", "transition"], ["replace", "state"]])
    expect(await boundary.projection.sql<Array<{count: number}>>`SELECT COUNT(*) AS count FROM transition`)
      .toEqual([{count: 0}])

    const mass = await apply("add", "mass", {
      wimp: ROOT, id: 1, key: "memory", format: "json", label: "Memory", description: null,
    })
    expect(mass?.messages.map((message) => message.parts[0].path)).toEqual(["mass", `atom/${rootAtom}`])
    expect((mass?.messages[1]?.parts[0].value as {mass: Array<{localId: number; key: string}>}).mass)
      .toEqual([expect.objectContaining({localId: 1, key: "memory"})])
    const removed = await apply("remove", "mass", {wimp: ROOT, id: 1})
    expect(removed?.messages.map((message) => message.parts[0].path)).toEqual(["mass", `atom/${rootAtom}`])
    expect((removed?.messages[1]?.parts[0].value as {mass: unknown[]}).mass).toEqual([])
  })

  test("reconciles Mass only from persisted direct mappings and repoints selected keys", async () => {
    await apply("add", "wimp", {
      src: ROOT, name: "Root", mass: [
        {key: "source", format: "json"},
        {key: "cache", format: "json"},
      ],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
    })
    await apply("add", "wimp", {
      src: CHILD, name: "Child", mass: [
        {key: "cache", format: "json"},
        {key: "target", format: "json"},
      ],
    })

    const atoms = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${ROOT}, ${CHILD}) ORDER BY id
    `
    const parent = Number(atoms.find((atom) => atom.wimp === ROOT)!.id)
    const child = Number(atoms.find((atom) => atom.wimp === CHILD)!.id)
    const membership = async (atom: number, key: string) => (await boundary.projection.sql<Array<{keyId: string; source: number | null}>>`
      SELECT membership.key AS keyId, relation.parent_atom AS source
        FROM mass_membership AS membership
        JOIN mass_declaration AS declaration ON declaration.id = membership.declaration
        LEFT JOIN mass_key_source AS relation
          ON relation.child_atom = membership.atom AND relation.child_declaration = membership.declaration
       WHERE membership.atom = ${atom} AND declaration.local_key = ${key}
    `)[0]!

    expect((await membership(child, "cache")).source).toBe(parent)
    expect((await membership(child, "target")).source).toBeNull()

    const parentCache = await membership(parent, "cache")
    await mkdir(boundary.projection.mass.catalog.root, {recursive: true})
    await writeFile(join(boundary.projection.mass.catalog.root, massFileName(parentCache.keyId, "json")), "cache")
    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {
        data: "/mass/source", expr: "{ target: _[0] }",
        directMass: {kind: "keys", entries: [{target: "target", source: "source"}]},
      },
    })

    const parentSource = await membership(parent, "source")
    const childTarget = await membership(child, "target")
    const detachedCache = await membership(child, "cache")
    expect(childTarget).toEqual({keyId: parentSource.keyId, source: parent})
    expect((await membership(child, "cache")).source).toBeNull()

    const target = (await boundary.projection.sql<Array<{declaration: number}>>`
      SELECT membership.declaration FROM mass_membership AS membership
      JOIN mass_declaration AS declaration ON declaration.id = membership.declaration
      WHERE membership.atom = ${child} AND declaration.local_key = ${"target"}
    `)[0]!
    const exact = {atom: child, declaration: Number(target.declaration), key: parentSource.keyId}
    const fences: typeof exact[] = []
    const releases: typeof exact[] = []
    boundary.projection.setMassFence(async (request) => { fences.push(request) })
    boundary.projection.setMassRelease(async (request) => { releases.push(request) })

    await expect(apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })).rejects.toThrow()
    expect(fences).toEqual([exact])
    expect(releases).toEqual([exact])
    expect(await membership(child, "target")).toEqual(childTarget)

    const keysBefore = await boundary.projection.sql<Array<{count: number}>>`SELECT COUNT(*) AS count FROM mass_key`
    await mkdir(boundary.projection.mass.catalog.root, {recursive: true})
    await writeFile(join(boundary.projection.mass.catalog.root, massFileName(parentSource.keyId, "json")), "source")
    fences.length = 0
    releases.length = 0
    try {
      await expect(apply("replace", "matter", {
        wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp",
      })).rejects.toThrow("matter.src")
      expect(fences).toEqual([exact])
      expect(releases).toEqual([exact])
      expect(await membership(child, "target")).toEqual(childTarget)
      expect(await boundary.projection.sql<Array<{count: number}>>`SELECT COUNT(*) AS count FROM mass_key`).toEqual(keysBefore)
    } finally {
      await unlink(join(boundary.projection.mass.catalog.root, massFileName(parentSource.keyId, "json"))).catch(() => undefined)
      await unlink(join(boundary.projection.mass.catalog.root, massFileName(parentCache.keyId, "json"))).catch(() => undefined)
      await unlink(join(boundary.projection.mass.catalog.root, massFileName(detachedCache.keyId, "json"))).catch(() => undefined)
    }
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

  test("adds stable local identities to existing Mass declarations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-boundary-mass-identity-migration-"))
    const filename = join(directory, "boundary.sqlite")
    await boundary.close()

    try {
      boundary = await open(filename)
      await declareRoot()
      await apply("add", "mass", {wimp: ROOT, id: 1, key: "memory", format: "json"})
      await boundary.close()

      const legacy = new SQL(`sqlite://${filename}`)
      await legacy.unsafe("PRAGMA foreign_keys = OFF")
      await legacy.unsafe(`
        CREATE TABLE mass_declaration_legacy (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wimp TEXT NOT NULL,
          local_key TEXT NOT NULL,
          format TEXT NOT NULL,
          label TEXT,
          description TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          UNIQUE (wimp, local_key)
        );
        INSERT INTO mass_declaration_legacy (id, wimp, local_key, format, label, description, active)
          SELECT id, wimp, local_key, format, label, description, active FROM mass_declaration;
        DROP TABLE mass_declaration;
        ALTER TABLE mass_declaration_legacy RENAME TO mass_declaration;
      `)
      await legacy.close()

      boundary = await open(filename)
      expect(await boundary.projection.sql<Array<{localId: number; key: string}>>`
        SELECT local_id AS localId, local_key AS key FROM mass_declaration WHERE wimp = ${ROOT}
      `).toEqual([{localId: 1, key: "memory"}])
    } finally {
      await boundary.close()
      await rm(directory, {recursive: true, force: true})
      boundary = await open(":memory:")
    }
  })

  test("migrates nested runtime scopes atomically across WIMP boundaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "metafor-boundary-scope-migration-"))
    const filename = join(directory, "boundary.sqlite")
    await boundary.close()

    try {
      boundary = await open(filename)
      const rootId = await declareRoot()
      await apply("add", "matter", {
        wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      })
      await declareWimp(CHILD, "Child")
      await apply("add", "matter", {
        wimp: CHILD, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
      })
      await declareWimp(PEER, "Peer")
      const childId = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM atom WHERE parent_atom = ${rootId} AND wimp = ${CHILD}
      `)[0]!.id)
      const peerId = Number((await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM atom WHERE parent_atom = ${childId} AND wimp = ${PEER}
      `)[0]!.id)
      await boundary.close()

      const legacy = new SQL(`sqlite://${filename}`)
      await legacy.unsafe(`
        CREATE TABLE boundary_runtime_origin_legacy (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          kind TEXT NOT NULL,
          runtime_id INTEGER NOT NULL,
          declaration_kind TEXT NOT NULL,
          declaration_wimp TEXT NOT NULL,
          declaration_local_id INTEGER NOT NULL,
          parent_kind TEXT NOT NULL,
          parent_runtime_id INTEGER NOT NULL,
          owner_atom INTEGER NOT NULL,
          ordinal INTEGER NOT NULL DEFAULT 0,
          UNIQUE (kind, runtime_id),
          UNIQUE (
            kind, declaration_kind, declaration_wimp, declaration_local_id,
            parent_kind, parent_runtime_id, ordinal
          )
        );
        INSERT INTO boundary_runtime_origin_legacy (
          sequence, kind, runtime_id, declaration_kind, declaration_wimp,
          declaration_local_id, parent_kind, parent_runtime_id, owner_atom, ordinal
        )
        SELECT sequence, kind, runtime_id, declaration_kind, declaration_wimp,
               declaration_local_id, parent_kind, parent_runtime_id, owner_atom, ordinal
          FROM boundary_runtime_origin;
        DROP TABLE boundary_runtime_origin;
        ALTER TABLE boundary_runtime_origin_legacy RENAME TO boundary_runtime_origin;
      `)
      await legacy.close()

      boundary = await open(filename)
      expect(await boundary.projection.sql<Array<{runtimeId: number; declarationWimp: string; scopeAtom: number}>>`
        SELECT runtime_id AS runtimeId, declaration_wimp AS declarationWimp, scope_atom AS scopeAtom
          FROM boundary_runtime_origin
         WHERE declaration_kind = ${"matter"}
         ORDER BY sequence
      `).toEqual([
        {runtimeId: childId, declarationWimp: ROOT, scopeAtom: rootId},
        {runtimeId: peerId, declarationWimp: CHILD, scopeAtom: childId},
      ])
      await apply("replace", "matter", {
        wimp: CHILD, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
        energyBinding: {data: "/energy"},
      })
      expect(await boundary.projection.sql<Array<{id: number}>>`
        SELECT id FROM atom WHERE parent_atom = ${childId} AND wimp = ${PEER}
      `).toEqual([{id: peerId}])
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

  test("projects enum variants from one accepted Field Inflaton", async () => {
    await declareRoot()
    const added = await apply("add", "field", {
      wimp: ROOT,
      id: 1,
      key: "mode",
      type: "enum",
      required: false,
      default: "idle",
      variants: [
        {id: 1, position: 0, value: "idle"},
        {id: 2, position: 1, value: "ready"},
      ],
    })
    const field = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const before = await boundary.projection.sql<Array<{
      id: number; wimp: string; localId: number; position: number; itemValue: string
    }>>`
      SELECT id, wimp, local_id AS localId, position, item_value AS itemValue
        FROM field_enum_variant WHERE field = ${field} ORDER BY position
    `
    expect(before).toEqual([
      {id: expect.any(Number), wimp: ROOT, localId: 1, position: 0, itemValue: "idle"},
      {id: expect.any(Number), wimp: ROOT, localId: 2, position: 1, itemValue: "ready"},
    ])
    const addedParts = added?.messages.map((message) => message.parts[0]) ?? []
    expect(addedParts).toHaveLength(4)
    expect(addedParts[2]).toMatchObject({
      part: "graviton", op: "add", path: "field",
      value: {id: field, default: {kind: "enum", variant: before[0]!.id}},
    })
    expect(addedParts[0]).toMatchObject({part: "graviton", op: "add", path: "variant", value: before[0]})
    expect(addedParts[1]).toMatchObject({part: "graviton", op: "add", path: "variant", value: before[1]})
    expect(addedParts[3]).toMatchObject({part: "gluon", op: "add"})

    const replaced = await apply("replace", "field", {
      wimp: ROOT,
      id: 1,
      key: "mode",
      type: "enum",
      required: false,
      default: "paused",
      variants: [
        {id: 1, position: 0, value: "idle"},
        {id: 2, position: 1, value: "ready"},
        {id: 3, position: 2, value: "paused"},
      ],
    })
    const after = await boundary.projection.sql<Array<{
      id: number; wimp: string; localId: number; position: number; itemValue: string
    }>>`
      SELECT id, wimp, local_id AS localId, position, item_value AS itemValue
        FROM field_enum_variant WHERE field = ${field} ORDER BY position
    `
    expect(after).toEqual([
      {id: before[0]!.id, wimp: ROOT, localId: 1, position: 0, itemValue: "idle"},
      {id: before[1]!.id, wimp: ROOT, localId: 2, position: 1, itemValue: "ready"},
      {id: expect.any(Number), wimp: ROOT, localId: 3, position: 2, itemValue: "paused"},
    ])
    const replacedParts = replaced?.messages.map((message) => message.parts[0]) ?? []
    expect(replacedParts).toHaveLength(2)
    expect(replacedParts[0]).toMatchObject({part: "graviton", op: "add", path: "variant", value: after[2]})
    expect(replacedParts[1]).toMatchObject({part: "graviton", op: "replace", path: "field", value: {id: field, wimp: ROOT, localId: 1, key: "mode", type: "enum", required: false, label: null, default: {kind: "enum", variant: after[2]!.id}}})
  })

  test("moves one Field with its enum variants between Meta addresses in place", async () => {
    await declareRoot()
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {
      wimp: ROOT,
      id: 1,
      key: "mode",
      type: "enum",
      required: false,
      variants: [
        {id: 1, position: 0, value: "idle"},
        {id: 2, position: 1, value: "ready"},
      ],
    })
    const field = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const variants = await boundary.projection.sql<Array<{id: number; itemValue: string}>>`
      SELECT id, item_value AS itemValue FROM field_enum_variant WHERE field = ${field} ORDER BY position
    `

    const moved = await transfer("move", "field", `${ROOT}#1`, {
      wimp: CHILD,
      id: 1,
      key: "mode",
      type: "enum",
      required: false,
      variants: [
        {id: 1, position: 0, value: "idle"},
        {id: 2, position: 1, value: "ready"},
      ],
    })
    expect(await boundary.projection.sql<Array<{id: number; wimp: string; localId: number}>>`
      SELECT id, wimp, local_id AS localId FROM field WHERE id = ${field}
    `).toEqual([{id: field, wimp: CHILD, localId: 1}])
    expect(await boundary.projection.sql<Array<{id: number; wimp: string; localId: number; itemValue: string}>>`
      SELECT id, wimp, local_id AS localId, item_value AS itemValue
        FROM field_enum_variant WHERE field = ${field} ORDER BY position
    `).toEqual([
      {id: variants[0]!.id, wimp: CHILD, localId: 1, itemValue: "idle"},
      {id: variants[1]!.id, wimp: CHILD, localId: 2, itemValue: "ready"},
    ])
    const movedParts = moved?.messages.map((message) => message.parts[0]) ?? []
    expect(movedParts.slice(0, 3)).toHaveLength(3)
    expect(movedParts[0]).toMatchObject({part: "graviton", op: "move", path: "variant", from: variants[0]!.id})
    expect(movedParts[1]).toMatchObject({part: "graviton", op: "move", path: "variant", from: variants[1]!.id})
    expect(movedParts[2]).toMatchObject({part: "graviton", op: "move", path: "field", from: field, value: {id: field, wimp: CHILD, localId: 1}})
  })

  test("copies every persisted declaration table from its canonical row id", async () => {
    await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "mode", type: "enum", required: false,
    })
    await apply("add", "field", {
      wimp: ROOT, id: 2, key: "count", type: "number", required: false, default: 1,
    })
    await apply("add", "variant", {wimp: ROOT, id: 1, field: 1, position: 0, value: "idle"})
    await apply("add", "state", {wimp: ROOT, id: 1, name: "idle", position: 0})
    await apply("add", "state", {wimp: ROOT, id: 2, name: "ready", position: 1})
    await apply("add", "transition", {wimp: ROOT, id: 1, from: 1, to: 2, position: 0})
    await apply("add", "transition", {wimp: ROOT, id: 2, from: 2, to: 1, position: 0})
    await apply("add", "condition", {
      wimp: ROOT, id: 1, transition: 1, field: 2, position: 0, predicate: {gt: 0},
    })
    await apply("add", "process", {
      wimp: ROOT, id: 1, key: "idle", type: "action", label: "Act", env: ["server"],
      action: {src: "return 1", read: [2]},
      success: {src: "return value", read: [2], write: [2]},
    })
    await apply("add", "reaction", {
      wimp: ROOT, id: 1, key: "react", label: "React",
      sources: [{meta: ROOT, states: ["idle"]}], src: "return {}",
      read: [2], write: [2], massRead: [], massWrite: [], states: [1],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: true,
    })

    const rows = Object.fromEntries(await Promise.all([
      ["field", "field"],
      ["variant", "field_enum_variant"],
      ["state", "state"],
      ["transition", "transition"],
      ["condition", "condition"],
      ["process", "process"],
      ["reaction", "reaction"],
      ["matter", "matter_particle"],
    ].map(async ([path, table]) => {
      const id = Number((await boundary.projection.sql.unsafe<Array<{id: number}>>(
        `SELECT id FROM ${table} WHERE wimp = ? AND local_id = 1`, [ROOT],
      ))[0]!.id)
      return [path, id]
    }))) as Record<string, number>
    const field = rows.field!
    const countField = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${2}
    `)[0]!.id)
    const idle = rows.state!
    const ready = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM state WHERE wimp = ${ROOT} AND local_id = ${2}
    `)[0]!.id)
    const reverseTransition = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM transition WHERE wimp = ${ROOT} AND local_id = ${2}
    `)[0]!.id)

    const requests: Array<{
      path: DeclarationPath; from: number; value: Record<string, unknown>;
    }> = [
      {path: "field", from: field, value: {wimp: ROOT, localId: 3, key: "modeCopy"}},
      {path: "variant", from: rows.variant!, value: {
        wimp: ROOT, localId: 2, field, position: 1, itemValue: "ready",
      }},
      {path: "state", from: idle, value: {
        wimp: ROOT, localId: 3, name: "copied", position: 2,
      }},
      {path: "transition", from: rows.transition!, value: {
        wimp: ROOT, localId: 3, fromState: idle, toState: ready, position: 1,
      }},
      {path: "condition", from: rows.condition!, value: {
        wimp: ROOT, localId: 2, transition: reverseTransition, field: countField, position: 0,
      }},
      {path: "process", from: rows.process!, value: {
        wimp: ROOT, localId: 2, descriptor: {key: "copied-process"},
      }},
      {path: "reaction", from: rows.reaction!, value: {
        wimp: ROOT, localId: 2, key: "copied-reaction",
      }},
      {path: "matter", from: rows.matter!, value: {
        wimp: ROOT, localId: 2, parentParticle: null, particleOrder: 1,
      }},
    ]

    for (const request of requests) {
      const commit = await transfer("copy", request.path, request.from, request.value)
      const declaration = commit?.messages.map((message) => message.parts[0]).find((part) =>
        part.part === "graviton" && part.op === "copy" && part.path === request.path)
      expect(declaration).toMatchObject({from: request.from, value: {
        wimp: ROOT,
        localId: request.value.localId,
        id: expect.any(Number),
      }})
      expect(Number((declaration!.value as Record<string, unknown>).id)).not.toBe(request.from)
    }

    const copiedTransition = (await boundary.projection.sql<Array<{
      fromState: number; toState: number
    }>>`
      SELECT from_state AS fromState, to_state AS toState
        FROM transition WHERE wimp = ${ROOT} AND local_id = ${3}
    `)[0]!
    expect(copiedTransition).toEqual({fromState: idle, toState: ready})
    const copiedCondition = (await boundary.projection.sql<Array<{
      transition: number; field: number
    }>>`
      SELECT transition, field FROM condition WHERE wimp = ${ROOT} AND local_id = ${2}
    `)[0]!
    expect(copiedCondition).toEqual({transition: reverseTransition, field: countField})
  })

  test("moves canonical rows in place and preserves numeric foreign-key relations", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "mode", type: "enum"})
    await apply("add", "variant", {wimp: ROOT, id: 1, field: 1, position: 0, value: "idle"})
    await apply("add", "state", {wimp: ROOT, id: 1, name: "idle", position: 0})
    await apply("add", "state", {wimp: ROOT, id: 2, name: "ready", position: 1})
    await apply("add", "transition", {wimp: ROOT, id: 1, from: 1, to: 2, position: 0})

    const field = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const variant = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const state = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM state WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const transition = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM transition WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)

    const fieldMove = await transfer("move", "field", field, {
      wimp: ROOT, localId: 3, key: "mode", type: "enum",
    })
    expect(fieldMove?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton", op: "move", path: "field", from: field,
      value: {id: field, wimp: ROOT, localId: 3},
    })
    expect(await boundary.projection.sql<Array<{field: number}>>`
      SELECT field FROM field_enum_variant WHERE id = ${variant}
    `).toEqual([{field}])

    const stateMove = await transfer("move", "state", state, {
      wimp: ROOT, localId: 3, name: "idle", position: 0,
    })
    expect(stateMove?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton", op: "move", path: "state", from: state,
      value: {id: state, wimp: ROOT, localId: 3},
    })
    expect(await boundary.projection.sql<Array<{fromState: number}>>`
      SELECT from_state AS fromState FROM transition WHERE id = ${transition}
    `).toEqual([{fromState: state}])
  })

  test("moves inert root Matter by source identity and preserves the runtime Atom", async () => {
    const rootAtom = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: CHILD,
    })
    await declareWimp(PEER)
    await declareWimp(CHILD)

    const peerAtom = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${PEER}
    `)[0]!.id)
    const childBefore = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `)[0]!.id)
    const declarationBefore = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM matter_particle WHERE wimp = ${ROOT} AND local_id = ${2}
    `)[0]!.id)

    const moved = await transfer("move", "matter", `${ROOT}#2`, {
      wimp: PEER,
      localId: 1,
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: CHILD,
    })

    expect(moved?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton",
      op: "move",
      path: "matter",
      from: declarationBefore,
      value: {id: declarationBefore, wimp: PEER, localId: 1, src: CHILD},
    })
    expect(await boundary.projection.sql<Array<{id: number; parentAtom: number | null}>>`
      SELECT id, parent_atom AS parentAtom FROM atom WHERE wimp = ${CHILD}
    `).toEqual([{id: childBefore, parentAtom: peerAtom}])
    expect(await boundary.projection.sql<Array<{id: number; wimp: string; localId: number}>>`
      SELECT id, wimp, local_id AS localId FROM matter_particle WHERE id = ${declarationBefore}
    `).toEqual([{id: declarationBefore, wimp: PEER, localId: 1}])
    expect(rootAtom).not.toBe(peerAtom)
  })

  test("applies a full authored Matter tree and preserves nested identities across Meta", async () => {
    const rootAtom = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
    })
    await declareWimp(PEER)

    const peer = {wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER}
    const axion = {wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "axion", predicateBinding: "true"}
    const child = {wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD}
    const added = await apply("add", "matter", {
      ...axion,
      treePatch: {
        before: [{wimp: ROOT, entries: [peer]}],
        after: [{wimp: ROOT, entries: [
          {...peer, before: {wimp: ROOT, id: 1}},
          axion,
          child,
        ]}],
      },
    })
    expect(added?.messages.filter((message) => message.parts[0].path === "matter")
      .map((message) => message.parts[0].op)).toEqual(["add", "add"])

    await declareWimp(CHILD)
    const declaration = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM matter_particle WHERE wimp = ${ROOT} AND local_id = ${3}
    `)[0]!.id)
    const runtime = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `)[0]!.id)
    const peerAtom = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${PEER}
    `)[0]!.id)

    const moved = await transfer("move", "matter", `${ROOT}#3`, {
      wimp: PEER,
      id: 1,
      parent: null,
      edgeSlot: "root",
      position: 0,
      kind: "wimp",
      src: CHILD,
      before: {wimp: ROOT, id: 3},
      treePatch: {
        before: [
          {wimp: ROOT, entries: [peer, axion, child]},
          {wimp: PEER, entries: []},
        ],
        after: [
          {wimp: ROOT, entries: [
            {...peer, before: {wimp: ROOT, id: 1}},
            {...axion, before: {wimp: ROOT, id: 2}},
          ]},
          {wimp: PEER, entries: [{
            wimp: PEER,
            id: 1,
            parent: null,
            edgeSlot: "root",
            position: 0,
            kind: "wimp",
            src: CHILD,
            before: {wimp: ROOT, id: 3},
          }]},
        ],
      },
    })

    expect(moved?.messages.some((message) => message.parts[0].op === "move" &&
      message.parts[0].path === "matter")).toBe(true)
    expect(await boundary.projection.sql<Array<{id: number; wimp: string; localId: number}>>`
      SELECT id, wimp, local_id AS localId FROM matter_particle WHERE id = ${declaration}
    `).toEqual([{id: declaration, wimp: PEER, localId: 1}])
    expect(await boundary.projection.sql<Array<{id: number; parentAtom: number | null}>>`
      SELECT id, parent_atom AS parentAtom FROM atom WHERE wimp = ${CHILD}
    `).toEqual([{id: runtime, parentAtom: peerAtom}])
    expect(rootAtom).not.toBe(peerAtom)
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])

    const graph = await readBoundaryGraphProjection(boundary, {})
    const rootAddress = parseMetaAddress(ROOT)!
    const peerAddress = parseMetaAddress(PEER)!
    const childAddress = parseMetaAddress(CHILD)!
    const document: Graph = {
      schema: GRAPH_SCHEMA,
      root: rootAddress,
      template: {
        [rootAddress]: {
          name: "Root", fields: [], superposition: [], mass: [], processes: [],
          matter: [
            {kind: "wimp", src: peerAddress},
            {kind: "axion", predicateBinding: "true", children: []},
          ],
        },
        [peerAddress]: {
          name: PEER, fields: [], superposition: [], mass: [], processes: [],
          matter: [{kind: "wimp", src: childAddress}],
        },
        [childAddress]: {name: CHILD, fields: [], superposition: [], mass: [], processes: []},
      },
      runtime: graph.runtime,
    }
    const rootNode = document.runtime.roots[0]
    expect(rootNode?.kind).toBe("atom")
    if (rootNode?.kind !== "atom") throw new Error("Graph root Atom is absent")
    const peerNode = rootNode.children?.find((node) => node.kind === "atom" && node.meta === PEER)
    expect(peerNode?.children?.some((node) => node.kind === "atom" && node.meta === CHILD)).toBe(true)

    const bulk = prepareBulkGraphCut(document).projection.runtime.atoms
    const bulkPeer = bulk.find(({wimp}) => wimp === PEER)!
    const bulkChild = bulk.find(({wimp}) => wimp === CHILD)!
    expect(bulkChild.parentAtom).toBe(bulkPeer.id)
  })

  test("moves the Bulk singleton between Meta declarations without putting view_css in Bulk Store", async () => {
    await declareRoot()
    await declareWimp(PEER)
    await apply("add", "bulk", {wimp: ROOT, id: 1, view: ".root {}"})
    await expect(transfer("copy", "bulk", 1, {
      wimp: ROOT, localId: 2, view: ".copy {}",
    })).rejects.toThrow("supports move, not copy")
    const moved = await transfer("move", "bulk", `${ROOT}#1`, {
      wimp: PEER, id: 1, view: ".root {}",
    })
    expect(moved?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton", op: "move", path: "bulk", from: `${ROOT}#1`,
      value: {wimp: PEER, localId: 1, view: ".root {}"},
    })
    expect(await boundary.projection.sql<Array<{src: string; view: string | null}>>`
      SELECT src, view_css AS view FROM wimp WHERE src IN (${ROOT}, ${PEER}) ORDER BY src
    `).toEqual([{src: PEER, view: ".root {}"}, {src: ROOT, view: null}])
  })

  test("resolves Reaction dependencies inside the target Meta on authored move", async () => {
    await declareRoot()
    await declareWimp(PEER)
    await apply("add", "field", {wimp: ROOT, id: 1, key: "root", type: "string", required: false, variants: []})
    await apply("add", "state", {wimp: ROOT, id: 1, name: "root", position: 0, transitions: []})
    await apply("add", "field", {wimp: PEER, id: 1, key: "peer", type: "string", required: false, variants: []})
    await apply("add", "state", {wimp: PEER, id: 1, name: "peer", position: 0, transitions: []})
    await apply("add", "reaction", {
      wimp: ROOT, id: 1, key: "remember", label: "Remember", desc: null,
      sources: [{meta: ROOT, states: ["root"]}], src: "() => undefined",
      read: [1], write: [1], massRead: [], massWrite: [], states: [1],
    })

    await transfer("move", "reaction", `${ROOT}#1`, {
      wimp: PEER, id: 1, key: "remember", label: "Remember", desc: null,
      sources: [{meta: ROOT, states: ["root"]}], src: "() => undefined",
      read: [1], write: [1], massRead: [], massWrite: [], states: [1],
    })
    expect(await boundary.projection.sql<Array<{wimp: string; fieldWimp: string; stateWimp: string}>>`
      SELECT reaction.wimp, field.wimp AS fieldWimp, state.wimp AS stateWimp
        FROM reaction
        JOIN reaction_read ON reaction_read.reaction = reaction.id
        JOIN field ON field.id = reaction_read.field
        JOIN reaction_state ON reaction_state.reaction = reaction.id
        JOIN state ON state.id = reaction_state.state
       WHERE reaction.local_id = 1
    `).toEqual([{wimp: PEER, fieldWimp: PEER, stateWimp: PEER}])
  })

  test("copies and moves WIMP by canonical src while preserving runtime Atom ids", async () => {
    const rootAtom = await declareRoot()
    const copied = await transfer("copy", "wimp", ROOT, {
      src: PEER,
      name: "Peer copy",
      desc: null,
    })
    expect(copied?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton",
      op: "copy",
      path: "wimp",
      from: ROOT,
      value: {src: PEER, name: "Peer copy"},
    })
    const copiedAtom = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${PEER} ORDER BY id LIMIT 1
    `)[0]!.id)
    expect(copiedAtom).not.toBe(rootAtom)

    const moved = await transfer("move", "wimp", PEER, {
      src: CHILD,
      name: "Child moved",
      desc: null,
    })
    expect(moved?.messages[0]?.parts[0]).toMatchObject({
      part: "graviton",
      op: "move",
      path: "wimp",
      from: PEER,
      value: {src: CHILD, name: "Child moved"},
    })
    expect(await boundary.projection.sql<Array<{src: string}>>`
      SELECT src FROM wimp WHERE src IN (${PEER}, ${CHILD}) ORDER BY src
    `).toEqual([{src: CHILD}])
    expect(await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD}
    `).toEqual([{id: copiedAtom}])
    expect(moved?.messages.map((message) => message.parts[0])).toContainEqual(
      expect.objectContaining({
        part: "graviton",
        op: "replace",
        path: `atom/${copiedAtom}`,
        value: expect.objectContaining({atom: expect.objectContaining({id: copiedAtom, wimp: CHILD})}),
      }),
    )
  })

  test("publishes an enum default only after its Variant is committed", async () => {
    await declareRoot()
    const fieldCommit = await apply("add", "field", {
      wimp: ROOT, id: 1, key: "mode", type: "enum", default: "old",
    })
    const fieldId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const pendingField = fieldCommit?.messages
      .map((message) => message.parts[0])
      .find((part) => part.path === "field")
    expect(pendingField?.value).not.toHaveProperty("default")
    expect((await boundary.initialState()).declarations.find((item) => item.section === "fields")?.value)
      .not.toHaveProperty("default")

    const variantCommit = await apply("add", "variant", {
      wimp: ROOT, id: 1, field: 1, position: 0, value: "old",
    })
    const variantId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field_enum_variant WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    const ref = {kind: "enum", variant: variantId}
    const particles = variantCommit?.messages.map((message) => message.parts[0]) ?? []
    expect(particles).toContainEqual(expect.objectContaining({
      part: "graviton",
      op: "replace",
      path: "field",
      value: expect.objectContaining({id: fieldId, default: ref}),
    }))
    expect(particles).toContainEqual(expect.objectContaining({
      part: "gluon",
      op: "add",
      value: {fields: {[String(fieldId)]: {
        valueId: expect.any(Number),
        value: ref,
      }}},
    }))
    const initial = await boundary.initialState()
    expect(initial.declarations.find((item) => item.section === "fields")?.value.default).toEqual(ref)
    expect(initial.atoms[0]?.values[0]?.value).toEqual(ref)
  })

  test("rejects moving a Variant identity to another Field", async () => {
    await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "left", type: "enum"})
    await apply("add", "field", {wimp: ROOT, id: 2, key: "right", type: "enum"})
    await apply("add", "variant", {wimp: ROOT, id: 1, field: 1, position: 0, value: "old"})

    await expect(apply("replace", "variant", {
      wimp: ROOT, id: 1, field: 2, position: 0, value: "old",
    })).rejects.toThrow("Cannot move Variant")
    const field = Number((await boundary.projection.sql<Array<{field: number}>>`
      SELECT field FROM field_enum_variant WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.field)
    const left = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}
    `)[0]!.id)
    expect(field).toBe(left)
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

  test("replaces a parent Matter in place without deleting its unchanged branch", async () => {
    await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "items", type: "array", required: true, default: ["one"],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")

    const beforeMatter = await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `
    const beforeRuntime = await boundary.projection.sql<Array<{
      sequence: number; kind: string; runtimeId: number; localId: number
    }>>`
      SELECT sequence, kind, runtime_id AS runtimeId, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"} AND declaration_wimp = ${ROOT}
       ORDER BY sequence
    `
    const oldCollectionBinding = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT edge.collection_binding AS id
        FROM matter_particle_macho AS edge
        JOIN matter_particle AS particle ON particle.id = edge.particle
       WHERE particle.wimp = ${ROOT} AND particle.local_id = ${1}
    `)[0]!.id)

    const replaced = await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items", expr: "_[0]"},
    })

    expect(beforeMatter).toHaveLength(3)
    expect(beforeMatter[1]?.parent).toBe(beforeMatter[0]?.id)
    expect(beforeMatter[2]?.parent).toBe(beforeMatter[1]?.id)
    expect(await boundary.projection.sql<Array<{id: number; localId: number; parent: number | null}>>`
      SELECT id, local_id AS localId, parent_particle AS parent
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `).toEqual(beforeMatter)
    expect(await boundary.projection.sql<Array<{
      sequence: number; kind: string; runtimeId: number; localId: number
    }>>`
      SELECT sequence, kind, runtime_id AS runtimeId, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"} AND declaration_wimp = ${ROOT}
       ORDER BY sequence
    `).toEqual(beforeRuntime)
    expect(replaced?.messages).toContainEqual({parts: [{
      part: "graviton", op: "replace", path: "matter", ts: expect.any(Number),
      value: expect.objectContaining({id: beforeMatter[0]!.id, localId: 1}),
    }]})
    expect((await boundary.replay()).filter((message) => message.parts[0].path === "matter")
      .map((message) => (message.parts[0].value as {localId: number}).localId)).toEqual([1, 2, 3])
    expect(await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM matter_binding WHERE id = ${oldCollectionBinding}
    `).toEqual([])
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM matter_binding WHERE wimp = ${ROOT}
    `).toEqual([{count: 2}])
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("rebinds every materialized instance when one WIMP Matter changes", async () => {
    await declareRoot()
    await declareWimp(PEER, "Host")
    await apply("add", "matter", {
      wimp: PEER, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: ROOT,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
    })
    await declareWimp(CHILD, "Child")

    const before = await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD} ORDER BY id
    `
    expect(before).toHaveLength(2)

    const commit = await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy"},
    })
    const rebuiltAtomIds = (commit?.messages ?? [])
      .map((entry) => entry.parts[0])
      .filter((part) => part.part === "graviton" && typeof part.path === "string" && part.path.startsWith("atom/"))
      .map((part) => Number(String(part.path).slice("atom/".length)))
      .sort((left, right) => left - right)

    expect(rebuiltAtomIds).toEqual(before.map((row) => Number(row.id)))
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "replace",
      path: "matter",
      ts: expect.any(Number),
      value: expect.objectContaining({wimp: ROOT, localId: 1}),
    }]})
  })

  test("reparents an unmaterialized Matter branch without changing declaration identities", async () => {
    await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 1, edgeSlot: "then", position: 0,
      kind: "wimp", src: "missing/target",
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 4, parent: 3, edgeSlot: "child", position: 0,
      kind: "wimp", src: "missing/leaf",
    })
    const before = await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `

    await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0,
      kind: "wimp", src: "missing/target",
    })

    const after = await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `
    expect(after.map((matter) => matter.id)).toEqual(before.map((matter) => matter.id))
    expect(after[2]?.parent).toBe(after[1]?.id)
    expect(after[3]?.parent).toBe(after[2]?.id)
    expect(await boundary.projection.sql<unknown[]>`
      SELECT runtime_id FROM boundary_runtime_origin
       WHERE declaration_kind = ${"matter"} AND declaration_wimp = ${ROOT}
         AND declaration_local_id IN (${3}, ${4})
    `).toEqual([])
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("reparents one live Matter placement without recreating its Atom", async () => {
    const rootId = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 1, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")

    const topologies = await boundary.projection.sql<Array<{id: number; position: number}>>`
      SELECT id, position FROM topology WHERE parent_atom = ${rootId} ORDER BY position
    `
    const before = (await boundary.projection.sql<Array<{id: number; parent: number}>>`
      SELECT id, parent_topology AS parent FROM atom
       WHERE wimp = ${CHILD} AND parent_topology IS NOT NULL
    `)[0]!

    const commit = await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    })
    const after = await boundary.projection.sql<Array<{id: number; parent: number}>>`
      SELECT id, parent_topology AS parent FROM atom
       WHERE wimp = ${CHILD} AND parent_topology IS NOT NULL
    `

    expect(after).toEqual([{id: before.id, parent: topologies[1]!.id}])
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "replace", path: `atom/${before.id}`, ts: expect.any(Number),
      value: expect.objectContaining({atom: expect.objectContaining({id: before.id, parentTopology: topologies[1]!.id})}),
    }]})
  })

  test("keeps live Matter children declared below a WIMP Matter placement", async () => {
    await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0, kind: "wimp", src: PEER,
    })
    await declareWimp(CHILD, "Child")
    await declareWimp(PEER, "Peer")
    const before = await boundary.projection.sql<Array<{id: number; wimp: string; parent: number | null}>>`
      SELECT id, wimp, parent_atom AS parent FROM atom WHERE wimp IN (${CHILD}, ${PEER}) ORDER BY id
    `
    const child = before.find((atom) => atom.wimp === CHILD)!
    const peer = before.find((atom) => atom.wimp === PEER)!
    expect(peer.parent).toBe(child.id)

    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy"},
    })

    expect(await boundary.projection.sql<Array<{id: number; wimp: string; parent: number | null}>>`
      SELECT id, wimp, parent_atom AS parent FROM atom WHERE wimp IN (${CHILD}, ${PEER}) ORDER BY id
    `).toEqual(before)
  })

  test("rebinds a live child to its new parent without changing the child Atom", async () => {
    await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 1, edgeSlot: "child", position: 0, kind: "wimp", src: PEER,
      fieldsBinding: {data: "title", expr: "{title: _[0]}"},
    })
    await declareWimp(CHILD, "Parent")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "title", type: "string", default: "unset"})
    const parents = await boundary.projection.sql<Array<{atom: number; localId: number}>>`
      SELECT runtime_id AS atom, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_wimp = ${ROOT}
         AND declaration_local_id IN (${1}, ${2})
       ORDER BY declaration_local_id
    `
    const parentField = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${CHILD} AND local_id = ${1}
    `)[0]!.id)
    for (const [index, parent] of parents.entries()) {
      await boundary.projection.apply({parts: [{
        part: "higgs", op: "replace", path: parent.atom,
        value: {fields: {[String(parentField)]: index === 0 ? "A" : "B"}}, by: "matrix", ts: 2,
      }]})
    }
    await declareWimp(PEER, "Leaf")
    await apply("add", "field", {wimp: PEER, id: 1, key: "title", type: "string"})
    const leaf = (await boundary.projection.sql<Array<{id: number; value: string}>>`
      SELECT atom.id, value_string.text AS value
        FROM atom
        JOIN atom_value ON atom_value.atom = atom.id
        JOIN value_string ON value_string.value = atom_value.value
       WHERE atom.parent_atom = ${parents[0]!.atom} AND atom.wimp = ${PEER}
    `)[0]!
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, status)
      VALUES (${"reparented"}, ${leaf.id}, ${1}, ${"ready"}, ${"pending"})
    `

    await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "child", position: 0, kind: "wimp", src: PEER,
      fieldsBinding: {data: "title", expr: "{title: _[0]}"},
    })

    expect(await boundary.projection.sql<Array<{id: number; parent: number; value: string; status: string}>>`
      SELECT atom.id, atom.parent_atom AS parent, value_string.text AS value,
             boundary_process_execution.status
        FROM atom
        JOIN atom_value ON atom_value.atom = atom.id
        JOIN value_string ON value_string.value = atom_value.value
        JOIN boundary_process_execution ON boundary_process_execution.atom = atom.id
       WHERE atom.id = ${leaf.id}
    `).toEqual([{id: leaf.id, parent: parents[1]!.atom, value: "B", status: "superseded"}])
  })

  test("rebinds an unchanged child when its parent Topology moves to another owner Atom", async () => {
    await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 1, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 4, parent: 3, edgeSlot: "then", position: 0, kind: "wimp", src: PEER,
      fieldsBinding: {data: "title", expr: "{title: _[0]}"},
    })
    await declareWimp(CHILD, "Parent")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "title", type: "string", default: "unset"})
    const parents = await boundary.projection.sql<Array<{atom: number; localId: number}>>`
      SELECT runtime_id AS atom, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_wimp = ${ROOT}
         AND declaration_local_id IN (${1}, ${2})
       ORDER BY declaration_local_id
    `
    const parentField = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${CHILD} AND local_id = ${1}
    `)[0]!.id)
    for (const [index, parent] of parents.entries()) {
      await boundary.projection.apply({parts: [{
        part: "higgs", op: "replace", path: parent.atom,
        value: {fields: {[String(parentField)]: index === 0 ? "A" : "B"}}, by: "matrix", ts: 2,
      }]})
    }
    await declareWimp(PEER, "Leaf")
    await apply("add", "field", {wimp: PEER, id: 1, key: "title", type: "string"})
    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE parent_atom = ${parents[0]!.atom}
    `)[0]!.id)
    const leaf = (await boundary.projection.sql<Array<{id: number; value: string; source: number}>>`
      SELECT atom.id, value_string.text AS value, atom_field_source.parent_atom AS source
        FROM atom
        JOIN atom_value ON atom_value.atom = atom.id
        JOIN value_string ON value_string.value = atom_value.value
        JOIN atom_field_source ON atom_field_source.child_atom = atom.id
       WHERE atom.parent_topology = ${topologyId} AND atom.wimp = ${PEER}
    `)[0]!
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, status)
      VALUES (${"topology-reparented"}, ${leaf.id}, ${1}, ${"ready"}, ${"pending"})
    `

    const commit = await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })

    expect(await boundary.projection.sql<Array<{
      id: number; topology: number; owner: number; value: string; source: number; status: string
    }>>`
      SELECT atom.id, atom.parent_topology AS topology, topology.parent_atom AS owner,
             value_string.text AS value, atom_field_source.parent_atom AS source,
             boundary_process_execution.status
        FROM atom
        JOIN topology ON topology.id = atom.parent_topology
        JOIN atom_value ON atom_value.atom = atom.id
        JOIN value_string ON value_string.value = atom_value.value
        JOIN atom_field_source ON atom_field_source.child_atom = atom.id
        JOIN boundary_process_execution ON boundary_process_execution.atom = atom.id
       WHERE atom.id = ${leaf.id}
    `).toEqual([{
      id: leaf.id,
      topology: topologyId,
      owner: parents[1]!.atom,
      value: "B",
      source: parents[1]!.atom,
      status: "superseded",
    }])
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "replace", path: `atom/${leaf.id}`, ts: expect.any(Number),
      value: expect.objectContaining({atom: expect.objectContaining({id: leaf.id})}),
    }]})
  })

  test("restarts a child runtime binding when its parent Topology changes owner", async () => {
    await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 1, kind: "wimp", src: CHILD,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 1, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 4, parent: 3, edgeSlot: "then", position: 0, kind: "wimp", src: PEER,
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })
    await declareWimp(CHILD, "Parent")
    await declareWimp(PEER, "Leaf")
    const parents = await boundary.projection.sql<Array<{atom: number; localId: number}>>`
      SELECT runtime_id AS atom, declaration_local_id AS localId
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_wimp = ${ROOT}
         AND declaration_local_id IN (${1}, ${2})
       ORDER BY declaration_local_id
    `
    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE parent_atom = ${parents[0]!.atom}
    `)[0]!.id)
    const leafId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_topology = ${topologyId} AND wimp = ${PEER}
    `)[0]!.id)
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, status)
      VALUES (${"runtime-reparented"}, ${leafId}, ${1}, ${"ready"}, ${"pending"})
    `

    const commit = await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })

    expect(await boundary.projection.sql<Array<{id: number; owner: number; status: string}>>`
      SELECT atom.id, topology.parent_atom AS owner, boundary_process_execution.status
        FROM atom
        JOIN topology ON topology.id = atom.parent_topology
        JOIN boundary_process_execution ON boundary_process_execution.atom = atom.id
       WHERE atom.id = ${leafId}
    `).toEqual([{id: leafId, owner: parents[1]!.atom, status: "superseded"}])
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "replace", path: `atom/${leafId}`, ts: expect.any(Number),
      value: expect.objectContaining({
        atom: expect.objectContaining({id: leafId}),
        continuation: {
          massBinding: {data: "/mass", directMass: {kind: "whole"}},
          energyBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
        },
      }),
    }]})
  })

  test("retargets one live Matter Atom in place and preserves compatible value, State and execution fence", async () => {
    const rootId = await declareRoot()
    await declareWimp(CHILD, "Child")
    await apply("add", "field", {wimp: CHILD, id: 1, key: "title", type: "string", default: "child"})
    await apply("add", "state", {wimp: CHILD, id: 1, name: "ready", position: 0})
    await declareWimp(PEER, "Peer")
    await apply("add", "field", {wimp: PEER, id: 1, key: "title", type: "string", default: "peer"})
    await apply("add", "state", {wimp: PEER, id: 1, name: "ready", position: 0})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    const atomId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_atom = ${rootId} AND wimp = ${CHILD}
    `)[0]!.id)
    const childField = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM field WHERE wimp = ${CHILD} AND local_id = ${1}
    `)[0]!.id)
    await boundary.projection.apply({parts: [{
      part: "higgs", op: "replace", path: atomId,
      value: {fields: {[String(childField)]: "kept"}}, by: "matrix", ts: 2,
    }]})
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, status)
      VALUES (${"retargeted"}, ${atomId}, ${1}, ${"ready"}, ${"pending"})
    `

    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
    })

    expect(await boundary.projection.sql<Array<{
      id: number; wimp: string; value: string; state: string; status: string
    }>>`
      SELECT atom.id, atom.wimp, value_string.text AS value, state.name AS state,
             boundary_process_execution.status
        FROM atom
        JOIN atom_value ON atom_value.atom = atom.id
        JOIN value_string ON value_string.value = atom_value.value
        JOIN atom_state ON atom_state.atom = atom.id
        JOIN state ON state.id = atom_state.metaState
        JOIN boundary_process_execution ON boundary_process_execution.atom = atom.id
       WHERE atom.id = ${atomId}
    `).toEqual([{id: atomId, wimp: PEER, value: "kept", state: "ready", status: "superseded"}])
  })

  test("keeps a retargeted Atom identity while the new WIMP declaration is still arriving", async () => {
    const rootId = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")
    const atomId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_atom = ${rootId}
    `)[0]!.id)
    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
    })
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE parent_atom = ${rootId}
    `).toEqual([{id: atomId, wimp: CHILD}])

    await declareWimp(PEER, "Peer")
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE parent_atom = ${rootId}
    `).toEqual([{id: atomId, wimp: PEER}])
  })

  test("changes a live controller subtype without recreating its Topology or child", async () => {
    const rootId = await declareRoot()
    await apply("add", "field", {wimp: ROOT, id: 1, key: "items", type: "array", default: ["one"]})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")
    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE parent_atom = ${rootId}
    `)[0]!.id)
    const childId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_topology = ${topologyId}
    `)[0]!.id)

    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })

    expect(await boundary.projection.sql<Array<{id: number; kind: string}>>`
      SELECT id, kind FROM topology WHERE parent_atom = ${rootId}
    `).toEqual([{id: topologyId, kind: "macho"}])
    expect(await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_topology = ${topologyId}
    `).toEqual([{id: childId}])
  })

  test("replaces runtime identity only when a Matter changes between Atom and Topology", async () => {
    const rootId = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")
    const atomId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE parent_atom = ${rootId}
    `)[0]!.id)
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, energy, status)
      VALUES (${"removed-atom"}, ${atomId}, ${1}, ${"ready"}, ${"energy/test"}, ${"superseded"})
    `

    await apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: true,
    })
    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE parent_atom = ${rootId}
    `)[0]!.id)

    expect(await boundary.projection.sql<unknown[]>`SELECT id FROM atom WHERE id = ${atomId}`).toEqual([])
    expect(await boundary.projection.sql<Array<{kind: string; runtimeId: number}>>`
      SELECT kind, runtime_id AS runtimeId FROM boundary_runtime_origin
       WHERE declaration_wimp = ${ROOT} AND declaration_local_id = ${1}
    `).toEqual([{kind: "topology", runtimeId: topologyId}])
    expect(await boundary.materialize({parts: [{
      part: "z", op: "copy", path: atomId, from: "energy/test", ts: 3,
      value: {processExecutionId: "removed-atom", fields: {}},
    }]})).toBeNull()
    expect(await boundary.materialize({parts: [{
      part: "w+", op: "replace", path: atomId, from: "energy/test", ts: 4,
      value: {processExecutionId: "removed-atom", processId: 1, fields: {}},
    }]})).toBeNull()
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("rejects a Matter parent cycle without changing the stored branch", async () => {
    await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "items", type: "array", required: true, default: ["one"],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })
    const before = await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null; kind: string
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent, particle_kind AS kind
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `

    await expect(apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: 2, edgeSlot: "child", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })).rejects.toThrow("cannot be its own ancestor")

    expect(await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null; kind: string
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent, particle_kind AS kind
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `).toEqual(before)
    expect(await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM matter_binding WHERE wimp = ${ROOT}
    `).toEqual([{count: 2}])
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("rolls back a failed Matter subtype rewrite with its child and binding intact", async () => {
    await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "items", type: "array", required: true, default: ["one"],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0, kind: "wimp", src: CHILD,
    })
    const beforeMatter = await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null; kind: string
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent, particle_kind AS kind
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `
    const beforeBinding = await boundary.projection.sql<Array<{id: number}>>`
      SELECT collection_binding AS id FROM matter_particle_macho
       WHERE particle = ${beforeMatter[0]!.id}
    `

    await expect(apply("replace", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "axion",
    })).rejects.toThrow("Axion predicateBinding is required")

    expect(await boundary.projection.sql<Array<{
      id: number; localId: number; parent: number | null; kind: string
    }>>`
      SELECT id, local_id AS localId, parent_particle AS parent, particle_kind AS kind
        FROM matter_particle
       WHERE wimp = ${ROOT}
       ORDER BY local_id
    `).toEqual(beforeMatter)
    expect(await boundary.projection.sql<Array<{id: number}>>`
      SELECT collection_binding AS id FROM matter_particle_macho
       WHERE particle = ${beforeMatter[0]!.id}
    `).toEqual(beforeBinding)
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("removing a root WIMP clears its repository contour while preserving unrelated Boundary state", async () => {
    const unrelated = "other/unrelated"
    const originalRootId = await declareRoot()
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "External child")
    await apply("add", "matter", {
      wimp: CHILD, id: 1, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: PEER,
    })
    await declareWimp(PEER, "External leaf")
    await apply("add", "field", {wimp: PEER, id: 1, key: "title", type: "string", default: "leaf"})
    await declareWimp(unrelated, "Unrelated")
    const branch = await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${CHILD}, ${PEER}) ORDER BY id
    `
    const childId = Number(branch.find((atom) => atom.wimp === CHILD)!.id)
    const leafId = Number(branch.find((atom) => atom.wimp === PEER)!.id)
    const leafValueId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT atom_value.value AS id FROM atom_value WHERE atom = ${leafId}
    `)[0]!.id)
    await boundary.projection.sql`
      INSERT INTO boundary_process_execution (execution_id, atom, process, state, energy, status)
      VALUES (${"removed-external-leaf"}, ${leafId}, ${1}, ${"ready"}, ${"energy/test"}, ${"superseded"})
    `

    const commit = await boundary.materialize({parts: [{
      part: "inflaton",
      op: "remove",
      path: "wimp",
      by: "dark",
      ts: 2,
      value: {src: ROOT},
    }]})

    expect(await boundary.projection.sql<Array<{src: string}>>`SELECT src FROM wimp ORDER BY src`).toEqual([
      {src: unrelated},
      {src: CHILD},
      {src: PEER},
    ])
    expect(await boundary.projection.sql<Array<{wimp: string}>>`SELECT wimp FROM atom ORDER BY id`).toEqual([
      {wimp: unrelated},
    ])
    expect(await boundary.projection.sql<unknown[]>`
      SELECT runtime_id FROM boundary_runtime_origin WHERE runtime_id IN (${childId}, ${leafId})
    `).toEqual([])
    expect(await boundary.projection.sql<unknown[]>`SELECT id FROM value WHERE id = ${leafValueId}`).toEqual([])
    expect(await boundary.projection.sql<Array<{atom: number}>>`
      SELECT atom FROM boundary_retired_process_execution
       WHERE execution_id = ${"removed-external-leaf"}
    `).toEqual([{atom: leafId}])
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "remove", path: `atom/${childId}`, ts: expect.any(Number),
      value: expect.objectContaining({atom: expect.objectContaining({id: childId})}),
    }]})
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton", op: "remove", path: `atom/${leafId}`, ts: expect.any(Number),
      value: expect.objectContaining({atom: expect.objectContaining({id: leafId})}),
    }]})
    expect(commit?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "remove",
      path: "wimp",
      ts: expect.any(Number),
      value: expect.objectContaining({src: ROOT}),
    }]})
    expect(await boundary.materialize({parts: [{
      part: "photon", op: "replace", path: leafId, from: "matrix", ts: 3, value: "ready",
    }]})).toBeNull()
    expect(await boundary.materialize({parts: [{
      part: "photon", op: "test", path: leafId, from: "never-registered", ts: 3, value: "ready",
    }]})).toBeNull()
    expect(await boundary.materialize({parts: [{
      part: "z", op: "copy", path: leafId, from: "energy/test", ts: 3,
      value: {processExecutionId: "removed-external-leaf", fields: {}},
    }]})).toBeNull()
    expect(await boundary.materialize({parts: [{
      part: "w+", op: "replace", path: leafId, from: "energy/test", ts: 4,
      value: {processExecutionId: "removed-external-leaf", processId: 1, fields: {}},
    }]})).toBeNull()

    const recreatedRootId = await declareRoot()
    expect(recreatedRootId).not.toBe(originalRootId)
    expect(await boundary.projection.sql<Array<{id: number; wimp: string}>>`
      SELECT id, wimp FROM atom WHERE wimp IN (${ROOT}, ${unrelated}) ORDER BY id
    `).toEqual([
      {id: expect.any(Number), wimp: unrelated},
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
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
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
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
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
      massBinding: {data: "/mass", directMass: {kind: "whole"}},
    })
    expect(rebound?.messages).toContainEqual({parts: [{
      part: "graviton",
      op: "replace",
      path: `atom/${childId}`,
      ts: expect.any(Number),
      value: expect.objectContaining({
        continuation: {massBinding: {data: "/mass", directMass: {kind: "whole"}}},
      }),
    }]})
    expect((await boundary.projection.sql<Array<{mass: number | null; energy: number | null}>>`
      SELECT edge.mass_binding AS mass, edge.energy_binding AS energy
        FROM matter_particle_wimp AS edge
        JOIN matter_particle AS particle ON particle.id = edge.particle
       WHERE particle.wimp = ${ROOT} AND particle.local_id = ${1}
    `)[0]).toEqual({mass: expect.any(Number), energy: null})
    expect((await boundary.replay()).find((message) => message.parts[0].path === `atom/${childId}`)?.parts[0].value)
      .toEqual(expect.objectContaining({
        continuation: {massBinding: {data: "/mass", directMass: {kind: "whole"}}},
      }))
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
    for (const member of members) {
      expect(gluons.find((message) => message.parts[0].path === member.atom)?.parts[0].value)
        .toEqual({fields: {[String(member.field)]: {
          valueId: child.valueId,
          value: "awake",
        }}})
    }
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
      massBinding: {data: "/mass"},
    })).rejects.toThrow("matter.massBinding must include normalized directMass metadata")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 2, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: "{cache: 'value'}",
    })).rejects.toThrow("matter.massBinding must include normalized directMass metadata")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 3, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      massBinding: {data: "/energy/socket", expr: "{socket: _[0]}"},
    })).rejects.toThrow("matter.massBinding dependency must use /mass")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 4, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy/socket", expr: "() => _[0]"},
    })).rejects.toThrow("matter.energyBinding must not create executable resources")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 5, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy/socket", expr: "{socket: _[0].close()}"},
    })).rejects.toThrow("matter.energyBinding must not create executable resources")

    await expect(apply("add", "matter", {
      wimp: ROOT, id: 6, parent: null, edgeSlot: "root", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy", directMass: {kind: "whole"}},
    })).rejects.toThrow("matter.energyBinding must not declare directMass metadata")

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
    const childIds = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD} ORDER BY position
    `).map((atom) => Number(atom.id))
    expect(childIds).toHaveLength(2)

    await boundary.projection.apply({parts: [{part: "higgs", op: "replace", path: rootId, value: {fields: {[String(field)]: ["one"]}}, by: "boundary", ts: 2}]})
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM topology WHERE kind = ${"macho"}`)[0]!.id).toBe(topologyId)
    expect(await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${CHILD} ORDER BY position
    `).toEqual([{id: childIds[0]!}])
    expect((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`)[0]!.id).toBe(peerId)
  })

  test("keeps identical descendants of different nested Macho repetitions distinct", async () => {
    await declareRoot()
    await apply("add", "field", {
      wimp: ROOT, id: 1, key: "items", type: "array", required: true, default: ["a", "b"],
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "macho", collectionBinding: {data: "items"},
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 2, parent: 1, edgeSlot: "child", position: 0,
      kind: "axion", predicateBinding: true,
    })
    await apply("add", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
    })
    await declareWimp(CHILD, "Child")
    const before = await boundary.projection.sql<Array<{id: number; occurrenceKey: string}>>`
      SELECT origin.runtime_id AS id, origin.occurrence_key AS occurrenceKey
        FROM boundary_runtime_origin AS origin
        JOIN atom ON atom.id = origin.runtime_id
       WHERE origin.declaration_wimp = ${ROOT}
         AND origin.declaration_local_id = ${3}
       ORDER BY origin.occurrence_key
    `

    expect(before).toEqual([
      {id: expect.any(Number), occurrenceKey: "/0"},
      {id: expect.any(Number), occurrenceKey: "/1"},
    ])
    await apply("replace", "matter", {
      wimp: ROOT, id: 3, parent: 2, edgeSlot: "then", position: 0, kind: "wimp", src: CHILD,
      energyBinding: {data: "/energy"},
    })
    expect(await boundary.projection.sql<Array<{id: number; occurrenceKey: string}>>`
      SELECT runtime_id AS id, occurrence_key AS occurrenceKey
        FROM boundary_runtime_origin
       WHERE kind = ${"atom"} AND declaration_wimp = ${ROOT}
         AND declaration_local_id = ${3}
       ORDER BY occurrence_key
    `).toEqual(before)
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

    const commit = await boundary.materialize({parts: [{
      part: "photon", op: "replace", path: rootId, from: "state-ready-one",
      value: "ready", by: "matrix", ts: 2,
    }]})
    expect(await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM atom WHERE wimp = ${PEER}`).toEqual([])
    expect((await boundary.projection.sql`SELECT id FROM atom WHERE wimp = ${CHILD}`).length).toBe(1)
    expect(commit).not.toBeUndefined()
  })

  test("materializes every Atom in the selected multi-node Axion branch", async () => {
    const thenOne = "owner/then-one"
    const thenTwo = "owner/then-two"
    const elseOne = "owner/else-one"
    const elseTwo = "owner/else-two"
    const rootId = await declareRoot()
    await apply("add", "state", {wimp: ROOT, id: 1, name: "idle", position: 0})
    await apply("add", "state", {wimp: ROOT, id: 2, name: "ready", position: 1})
    await apply("add", "matter", {
      wimp: ROOT, id: 1, parent: null, edgeSlot: "root", position: 0,
      kind: "axion", predicateBinding: {data: "/state", expr: "_[0] === 'ready'"},
    })
    await apply("add", "matter", {wimp: ROOT, id: 2, parent: 1, edgeSlot: "then", position: 0, kind: "wimp", src: thenOne})
    await apply("add", "matter", {wimp: ROOT, id: 3, parent: 1, edgeSlot: "then", position: 1, kind: "wimp", src: thenTwo})
    await apply("add", "matter", {wimp: ROOT, id: 4, parent: 1, edgeSlot: "else", position: 2, kind: "wimp", src: elseOne})
    await apply("add", "matter", {wimp: ROOT, id: 5, parent: 1, edgeSlot: "else", position: 3, kind: "wimp", src: elseTwo})
    await declareWimp(thenOne, "Then one")
    await declareWimp(thenTwo, "Then two")
    await declareWimp(elseOne, "Else one")
    await declareWimp(elseTwo, "Else two")

    const topologyId = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM topology WHERE kind = ${"axion"}
    `)[0]!.id)
    const materialized = async () => await boundary.projection.sql<Array<{wimp: string; position: number}>>`
      SELECT wimp, position FROM atom WHERE parent_topology = ${topologyId} ORDER BY position
    `

    expect(await materialized()).toEqual([
      {wimp: elseOne, position: 0},
      {wimp: elseTwo, position: 1},
    ])

    await boundary.materialize({parts: [{
      part: "photon", op: "replace", path: rootId, from: "state-ready-two",
      value: "ready", by: "matrix", ts: 2,
    }]})
    expect(await materialized()).toEqual([
      {wimp: thenOne, position: 0},
      {wimp: thenTwo, position: 1},
    ])
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
      wimp: ROOT, id: 1, key: "refresh", label: "Refresh",
      sources: [{meta: ROOT, states: ["idle"]}],
      src: "({update}) => update({mode: 'ready'})", read: [1], write: [1],
      massRead: [], massWrite: [], states: [1],
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
