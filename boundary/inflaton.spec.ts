import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {join} from "node:path"
import {rmSync} from "node:fs"
import type {ForceMessage} from "@metafor/types/force/message"
import {declarationId} from "./inflaton.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/root"
const CHILD = "owner/child"

const section = (path: string, key: string, value: unknown) => ({
  part: "inflaton" as const,
  op: "replace" as const,
  path,
  value: {[key]: value},
})

const declaration = (): ForceMessage => ({
  parts: [
    section(ROOT, "meta", {name: "Root", desc: "world"}),
    section(ROOT, "fields", {
      "1": {key: "title", type: "string", required: true, default: "root"},
      "2": {key: "mode", type: "enum", required: true, default: "child"},
      "3": {key: "items", type: "array", required: true, default: ["one", "two"]},
    }),
    section(ROOT, "variants", {"1": {field: "2", position: 0, value: "child"}}),
    section(ROOT, "states", {"1": {name: "idle", position: 0}, "2": {name: "ready", position: 1}}),
    section(ROOT, "transitions", {"1": {from: "1", to: "2", position: 0}}),
    section(ROOT, "conditions", {"1": {transition: "1", field: "1", position: 0, predicate: {eq: "root"}}}),
    section(ROOT, "processes", {
      "1": {
        key: "ready",
        type: "action",
        label: "Ready",
        env: ["server"],
        action: {src: "async () => 'ok'", read: ["1"]},
        success: {src: "() => {}", read: ["1"], write: ["1"]},
        error: {src: "() => {}", write: ["1"]},
      },
      "2": {
        key: "idle",
        type: "finally",
        env: ["server"],
        before: {src: "async ({ mass }) => { mass.ready = true }", read: ["1"]},
      },
    }),
    section(ROOT, "reactions", {
      "1": {key: "external", label: "External", cond: "() => true", src: "() => {}", read: ["1"], write: ["1"], states: ["1"]},
    }),
    section(ROOT, "matter", {
      "1": {parent: null, edgeSlot: "root", position: 0, kind: "macho", collectionBinding: {data: "items"}},
      "2": {parent: "1", edgeSlot: "child", position: 0, kind: "wimp", src: CHILD, fieldsBinding: "{ label: item }"},
      "3": {parent: null, edgeSlot: "root", position: 1, kind: "fuzzy", fuzzyKind: "dynamic-meta", predicateBinding: {data: "mode", expr: "owner/${_[0]}"}},
      "4": {parent: "3", edgeSlot: "branch", position: 0, kind: "wimp", src: CHILD},
    }),
    section(ROOT, "mass", {cache: {ready: true}}),
    section(ROOT, "bulk", {view: ".root {}"}),
    section(CHILD, "meta", {name: "Child"}),
    section(CHILD, "fields", {"1": {key: "label", type: "string", required: true, default: "child"}}),
    section(CHILD, "variants", {}),
    section(CHILD, "states", {}),
    section(CHILD, "transitions", {}),
    section(CHILD, "conditions", {}),
    section(CHILD, "processes", {}),
    section(CHILD, "reactions", {}),
    section(CHILD, "matter", {}),
    section(CHILD, "mass", null),
    section(CHILD, "bulk", null),
  ],
})

const declarationSection = (message: ForceMessage, src: string, key: string): ForceMessage["parts"][number] => {
  const part = message.parts.find((candidate) => (
    candidate.path === src &&
    typeof candidate.value === "object" &&
    candidate.value !== null &&
    !Array.isArray(candidate.value) &&
    Object.prototype.hasOwnProperty.call(candidate.value, key)
  ))
  if (!part) throw new Error(`Missing ${src}.${key} declaration section`)
  return part
}

describe("Boundary inflaton materialization", () => {
  let filename: string
  let boundary: BoundaryDatabase
  let sql: SQL

  beforeEach(async () => {
    filename = join(import.meta.dir, "tmp", `inflaton-${crypto.randomUUID()}.sqlite`)
    boundary = await open(filename)
    sql = new SQL(`sqlite://${filename}`)
  })

  afterEach(async () => {
    await sql.close()
    await boundary.close()
    rmSync(filename, {force: true})
    rmSync(`${filename}-shm`, {force: true})
    rmSync(`${filename}-wal`, {force: true})
  })

  test("stores the complete declaration catalog and materializes macho multiplicity", async () => {
    const commit = await boundary.materialize(declaration())
    expect(commit?.rootSrc).toBe(ROOT)
    expect(commit?.graviton.parts.filter((part) => (
      part.part === "graviton" && part.op === "add" && part.path === "actor"
    ))).toHaveLength(4)
    expect(commit?.graviton.parts.some((part) => (
      part.part === "graviton" && part.op === "add" && part.path === "macho"
    ))).toBe(true)

    const rootField = (await sql<Array<{id: number; local_id: number}>>`
        SELECT id, local_id FROM field WHERE wimp = ${ROOT} AND key = ${"title"}
      `)[0]
    expect(rootField).toEqual({id: declarationId(ROOT, "1"), local_id: 1})
    expect((await sql`SELECT id FROM state WHERE wimp = ${ROOT}`).length).toBe(2)
    expect((await sql`SELECT id FROM transition WHERE wimp = ${ROOT}`).length).toBe(1)
    expect((await sql`SELECT id FROM condition WHERE wimp = ${ROOT}`).length).toBe(1)
    expect((await sql`SELECT id FROM condition_predicate`).length).toBe(1)
    expect((await sql`SELECT id FROM process WHERE wimp = ${ROOT}`).length).toBe(2)
    expect((await sql`SELECT process FROM process_action_read`).length).toBe(2)
    expect((await sql`SELECT process FROM process_action_write`).length).toBe(2)
    expect((await sql`SELECT process FROM process_finally_read`).length).toBe(1)
    expect((await sql`SELECT id FROM reaction WHERE wimp = ${ROOT}`).length).toBe(1)
    expect((await sql`SELECT id FROM matter_particle WHERE wimp = ${ROOT}`).length).toBe(4)
    expect((await sql`SELECT id FROM wimp_mass_value WHERE wimp = ${ROOT}`).length).toBeGreaterThan(1)
    expect((await sql<Array<{view: string}>>`
      SELECT view_css AS view FROM wimp WHERE src = ${ROOT}
    `)[0]?.view).toBe(".root {}")

    const actors = await sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM actor ORDER BY id`
    expect(actors.filter((actor) => actor.wimp === ROOT)).toHaveLength(1)
    expect(actors.filter((actor) => actor.wimp === CHILD)).toHaveLength(3)
    expect((await sql<Array<{text: string}>>`
      SELECT value_string.text
      FROM actor
      JOIN field ON field.wimp = actor.wimp AND field.key = ${"label"}
      JOIN actor_value ON actor_value.actor = actor.id AND actor_value.field = field.id
      JOIN value_string ON value_string.value = actor_value.value
      WHERE actor.wimp = ${CHILD}
      ORDER BY actor.id
    `).map((value) => value.text)).toEqual(["one", "two", "child"])
    expect((await sql`SELECT id FROM topology WHERE kind = ${"macho"}`).length).toBe(1)
    expect((await sql`SELECT topology FROM topology_fuzzy_state WHERE selected_actor IS NOT NULL`).length).toBe(1)
    expect(commit?.matrix.data.branes).toHaveLength(4)
    expect(commit?.bulk.actors).toHaveLength(4)
    expect(commit?.energy.actors).toHaveLength(4)
    expect(commit?.energy.processes.find((process) => process.state === "idle")?.descriptor).toEqual({
      type: "finally",
      key: "idle",
      env: ["server"],
      before: {src: "async ({ mass }) => { mass.ready = true }", readFields: [[declarationId(ROOT, "1"), "title"]]},
    })
  })

  test("keeps declaration IDs deterministic despite unrelated autoincrement history", async () => {
    await boundary.wimp.create("noise/one", {fields: [{key: "noise", type: "string"}]})
    await boundary.materialize(declaration())
    const first = (await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = 1`)[0]?.id

    await boundary.materialize(declaration())
    const second = (await sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = 1`)[0]?.id
    expect(first).toBe(declarationId(ROOT, "1"))
    expect(second).toBe(first)
    expect((await sql`SELECT id FROM actor`).length).toBe(4)
  })

  test("empty replacement sections remove stale declaration rows", async () => {
    await boundary.materialize(declaration())
    const empty: ForceMessage = {parts: [
      section(ROOT, "meta", {name: "Root"}),
      section(ROOT, "fields", {}),
      section(ROOT, "variants", {}),
      section(ROOT, "states", {}),
      section(ROOT, "transitions", {}),
      section(ROOT, "conditions", {}),
      section(ROOT, "processes", {}),
      section(ROOT, "reactions", {}),
      section(ROOT, "matter", {}),
      section(ROOT, "mass", null),
      section(ROOT, "bulk", null),
    ]}
    await boundary.materialize(empty)
    expect((await sql`SELECT id FROM field WHERE wimp = ${ROOT}`).length).toBe(0)
    expect((await sql`SELECT id FROM process WHERE wimp = ${ROOT}`).length).toBe(0)
    expect((await sql`SELECT id FROM reaction WHERE wimp = ${ROOT}`).length).toBe(0)
    expect((await sql`SELECT id FROM matter_particle WHERE wimp = ${ROOT}`).length).toBe(0)
    expect((await sql`SELECT id FROM actor`).length).toBe(1)
  })

  test("meta-only replacement preserves the other declaration sections", async () => {
    await boundary.materialize(declaration())
    const commit = await boundary.materialize({parts: [section(ROOT, "meta", {name: "Renamed root", desc: "updated"})]})

    expect(commit?.rootSrc).toBe(ROOT)
    expect((await sql<Array<{name: string; desc: string; view: string}>>`
      SELECT name, desc, view_css AS view FROM wimp WHERE src = ${ROOT}
    `)[0]).toEqual({name: "Renamed root", desc: "updated", view: ".root {}"})
    expect((await sql`SELECT id FROM field WHERE wimp = ${ROOT}`).length).toBe(3)
    expect((await sql`SELECT id FROM process WHERE wimp = ${ROOT}`).length).toBe(2)
    expect((await sql`SELECT id FROM matter_particle WHERE wimp = ${ROOT}`).length).toBe(4)
  })

  test("a partial child declaration patch rematerializes the existing root", async () => {
    await boundary.materialize(declaration())
    const commit = await boundary.materialize({parts: [section(CHILD, "meta", {name: "Renamed child"})]})

    expect(commit?.rootSrc).toBe(ROOT)
    expect((await sql<Array<{wimp: string}>>`
      SELECT wimp FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL
    `)[0]?.wimp).toBe(ROOT)
    expect((await sql<Array<{name: string}>>`SELECT name FROM wimp WHERE src = ${CHILD}`)[0]?.name).toBe("Renamed child")
    expect((await sql`SELECT id FROM field WHERE wimp = ${CHILD}`).length).toBe(1)
  })

  test("independent dependency section replacements preserve canonical links", async () => {
    const message = declaration()
    await boundary.materialize(message)

    const expectLinks = async (): Promise<void> => {
      expect((await sql`SELECT process FROM process_action_read`).length).toBe(2)
      expect((await sql`SELECT process FROM process_action_write`).length).toBe(2)
      expect((await sql`SELECT process FROM process_finally_read`).length).toBe(1)
      expect((await sql`SELECT reaction FROM reaction_read`).length).toBe(1)
      expect((await sql`SELECT reaction FROM reaction_write`).length).toBe(1)
      expect((await sql`SELECT reaction FROM reaction_state`).length).toBe(1)
      expect((await sql`SELECT id FROM transition WHERE wimp = ${ROOT}`).length).toBe(1)
      expect((await sql`SELECT id FROM condition WHERE wimp = ${ROOT}`).length).toBe(1)
      expect((await sql`SELECT id FROM condition_predicate`).length).toBe(1)
      expect((await sql`SELECT field FROM field_enum_default`).length).toBe(1)
    }

    await boundary.materialize({parts: [declarationSection(message, ROOT, "fields")]})
    await expectLinks()
    await boundary.materialize({parts: [declarationSection(message, ROOT, "states")]})
    await expectLinks()
    await boundary.materialize({parts: [declarationSection(message, ROOT, "transitions")]})
    await expectLinks()
    await boundary.materialize({parts: [declarationSection(message, ROOT, "variants")]})
    await expectLinks()

    const fields = (declarationSection(message, ROOT, "fields").value as {
      fields: Record<string, unknown>
    }).fields
    await boundary.materialize({parts: [
      section(ROOT, "fields", {"1": fields["1"]}),
      section(ROOT, "fields", {"2": fields["2"], "3": fields["3"]}),
    ]})
    expect((await sql`SELECT id FROM field WHERE wimp = ${ROOT}`).length).toBe(3)
    await expectLinks()
  })

  test("rolls back declaration and current world together on invalid inflaton", async () => {
    await boundary.materialize(declaration())
    const actorsBefore = await sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM actor ORDER BY id`

    await expect(boundary.materialize({parts: [
      section(ROOT, "meta", {name: "Broken"}),
      section(ROOT, "fields", {"1": {key: "broken", type: "object"}}),
    ]})).rejects.toThrow(`${ROOT}.fields.1.type is not supported`)

    expect(await sql<Array<{id: number; wimp: string}>>`SELECT id, wimp FROM actor ORDER BY id`).toEqual(actorsBefore)
    expect((await sql<Array<{name: string}>>`SELECT name FROM wimp WHERE src = ${ROOT}`)[0]?.name).toBe("Root")
  })
})
