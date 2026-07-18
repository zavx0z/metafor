import {afterEach, describe, expect, test} from "bun:test"
import type {BoundaryDatabase} from "./sqlite.ts"
import {open} from "./sqlite.ts"

describe("Boundary relational declaration materialization", () => {
  let boundary: BoundaryDatabase | undefined

  afterEach(async () => {
    await boundary?.close()
    boundary = undefined
  })

  const apply = async (
    path: string,
    value: Record<string, unknown>,
    op: "add" | "replace" | "remove" = "add",
  ) => {
    const result = await boundary!.materialize({
      parts: [{part: "inflaton", op, path, value, by: "dark", ts: Date.now()}],
    })
    expect(result).not.toBeNull()
    return result!
  }

  test("stores WIMP entities and Atom state in normalized tables without declaration JSON", async () => {
    boundary = await open(":memory:")
    const tables = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT name FROM sqlite_master WHERE type = ${"table"} ORDER BY name
    `).map((row) => row.name)

    expect(tables).not.toContain("boundary_declaration_entity")
    expect(tables).not.toContain("boundary_atom_field")

    await apply("wimp", {src: "test/capsule", name: "Capsule", desc: null})
    await apply("field", {
      wimp: "test/capsule",
      id: 1,
      key: "title",
      type: "string",
      required: true,
      default: "Capsule",
    })
    await apply("state", {wimp: "test/capsule", id: 1, name: "idle", position: 0})

    expect(await boundary.projection.sql<Array<{src: string; name: string; desc: null}>>`SELECT src, name, desc FROM wimp`).toEqual([
      {src: "test/capsule", name: "Capsule", desc: null},
    ])
    expect(await boundary.projection.sql<Array<{wimp: string; local_id: number; key: string; type: string}>>`SELECT wimp, local_id, key, type FROM field`).toEqual([
      {wimp: "test/capsule", local_id: 1, key: "title", type: "string"},
    ])
    expect(await boundary.projection.sql<Array<{wimp: string; local_id: number; name: string; position: number}>>`SELECT wimp, local_id, name, position FROM state`).toEqual([
      {wimp: "test/capsule", local_id: 1, name: "idle", position: 0},
    ])
    expect(await boundary.projection.sql<Array<{wimp: string; parent_atom: null; parent_topology: null}>>`SELECT wimp, parent_atom, parent_topology FROM atom`).toEqual([
      {wimp: "test/capsule", parent_atom: null, parent_topology: null},
    ])
    expect(await boundary.projection.sql<Array<{key: string; text: string}>>`
      SELECT field.key, value_string.text
      FROM atom_value
      JOIN field ON field.id = atom_value.field
      JOIN value_string ON value_string.value = atom_value.value
    `).toEqual([{key: "title", text: "Capsule"}])
    const matrix = await boundary.matrixRuntime()
    expect(matrix.runtime.atomIdByBraneIndex).toHaveLength(1)
    expect(matrix.data.fields).toHaveLength(1)
    expect(matrix.data.branes[0]?.values[0]?.[1]).toBe("Capsule")
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })

  test("stores a child WIMP reference immediately and materializes the child when its SRC arrives", async () => {
    boundary = await open(":memory:")
    await apply("wimp", {src: "test/root", name: "Root", desc: null})
    await apply("matter", {
      wimp: "test/root",
      id: 1,
      parent: null,
      kind: "wimp",
      edgeSlot: "root",
      position: 0,
      src: "test/child",
    })

    expect(await boundary.projection.sql<Array<{wimp: string; local_id: number; src: string}>>`
      SELECT matter_particle.wimp, matter_particle.local_id, matter_particle_wimp.src
      FROM matter_particle
      JOIN matter_particle_wimp ON matter_particle_wimp.particle = matter_particle.id
    `).toEqual([{wimp: "test/root", local_id: 1, src: "test/child"}])
    expect(await boundary.projection.sql<Array<{wimp: string}>>`SELECT wimp FROM atom ORDER BY id`).toEqual([{wimp: "test/root"}])

    await apply("wimp", {src: "test/child", name: "Child", desc: null})
    expect(await boundary.projection.sql<Array<{wimp: string; parent: string}>>`
      SELECT child.wimp, parent.wimp AS parent
      FROM atom AS child
      JOIN atom AS parent ON parent.id = child.parent_atom
      WHERE child.wimp = ${"test/child"}
    `).toEqual([{wimp: "test/child", parent: "test/root"}])
    expect(await boundary.projection.sql<unknown[]>`PRAGMA foreign_key_check`).toEqual([])
  })
})
