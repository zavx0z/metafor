import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/input"
const SCALAR = boundaryEntityId(`${ROOT}/fields/1`)
const TOPOLOGY = boundaryEntityId(`${ROOT}/fields/2`)
const message = (part: Particle): ForceMessage => ({parts: [part]})

describe("Boundary canonical external Input", () => {
  let boundary: BoundaryDatabase
  let actorId: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    const declarations: Particle[] = [
      {part: "inflaton", op: "add", path: `${ROOT}/meta`, value: {name: "Input"}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/1`, value: {key: "value", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/2`, value: {key: "items", type: "array", default: []}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/1`, value: {name: "idle", position: 0}},
      {part: "inflaton", op: "test", path: ROOT},
    ]
    for (const part of declarations) await boundary.materialize(message(part))
    const actor = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!actor) throw new Error("Input actor was not materialized")
    actorId = Number(actor.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const value = async (field: number): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{valueJson: string}>>`
      SELECT value_json AS valueJson
        FROM boundary_actor_field
       WHERE actor = ${actorId} AND field = ${field}
    `)[0]
    return row ? JSON.parse(row.valueJson) as unknown : undefined
  }

  test("commits scalar Gluon once and emits only the materialized consequence", async () => {
    const inputId = "input:scalar-1"
    const proposal = message({
      part: "gluon",
      op: "test",
      path: actorId,
      from: inputId,
      value: {fields: {[String(SCALAR)]: 3}},
    })

    const commit = await boundary.materialize(proposal)
    expect(await value(SCALAR)).toBe(3)
    expect(commit?.messages).toEqual([message({
      part: "gluon",
      op: "replace",
      path: actorId,
      from: inputId,
      value: {fields: {[String(SCALAR)]: 3}},
    })])
    expect((await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM boundary_input_execution WHERE input_id = ${inputId}
    `)[0]?.count).toBe(1)

    expect(await boundary.materialize(proposal)).toBeNull()
    expect(await value(SCALAR)).toBe(3)

    await expect(boundary.materialize(message({
      part: "gluon",
      op: "test",
      path: actorId,
      from: inputId,
      value: {fields: {[String(SCALAR)]: 4}},
    }))).rejects.toThrow("already used")
    expect(await value(SCALAR)).toBe(3)
  })

  test("commits topology Field only through Higgs", async () => {
    const inputId = "input:topology-1"
    const commit = await boundary.materialize(message({
      part: "higgs",
      op: "test",
      path: actorId,
      from: inputId,
      value: {fields: {[String(TOPOLOGY)]: ["a", "b"]}},
    }))

    expect(await value(TOPOLOGY)).toEqual(["a", "b"])
    expect(commit?.messages).toEqual([message({
      part: "higgs",
      op: "replace",
      path: actorId,
      from: inputId,
      value: {fields: {[String(TOPOLOGY)]: ["a", "b"]}},
    })])

    await expect(boundary.materialize(message({
      part: "higgs",
      op: "test",
      path: actorId,
      from: "input:wrong-kind",
      value: {fields: {[String(SCALAR)]: 9}},
    }))).rejects.toThrow("cannot write field")
    expect(await value(SCALAR)).toBe(0)
  })

  test("rejects malformed and missing-actor proposals without a partial commit", async () => {
    await expect(boundary.materialize(message({
      part: "gluon",
      op: "test",
      path: actorId,
      value: {fields: {[String(SCALAR)]: 5}},
    }))).rejects.toThrow("input:* identity")

    await expect(boundary.materialize(message({
      part: "gluon",
      op: "test",
      path: 999_999,
      from: "input:missing-actor",
      value: {fields: {[String(SCALAR)]: 5}},
    }))).rejects.toThrow("missing actor")

    expect(await value(SCALAR)).toBe(0)
    expect((await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM boundary_input_execution
    `)[0]?.count).toBe(0)
  })
})
