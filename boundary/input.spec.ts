import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/external-input"
const INPUT = boundaryEntityId(`${ROOT}/fields/1`)
const LINKS = boundaryEntityId(`${ROOT}/fields/2`)
const message = (part: Particle) => ({parts: [part]})

describe("Boundary canonical external Field input", () => {
  let boundary: BoundaryDatabase
  let actorId: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    for (const part of [
      {part: "inflaton", op: "add", path: `${ROOT}/meta`, value: {name: "External Input"}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/1`, value: {key: "input", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/2`, value: {key: "links", type: "array", default: []}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/1`, value: {name: "idle", position: 0}},
      {part: "inflaton", op: "test", path: ROOT},
    ] as Particle[]) await boundary.materialize(message(part))

    const actor = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!actor) throw new Error("Root Actor was not materialized")
    actorId = Number(actor.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const stored = async (field: number): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{valueJson: string}>>`
      SELECT value_json AS valueJson
        FROM boundary_actor_field
       WHERE actor = ${actorId} AND field = ${field}
    `)[0]
    return row ? JSON.parse(row.valueJson) as unknown : undefined
  }

  test("commits an external Gluon before emitting its canonical consequence", async () => {
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: actorId,
      value: {fields: {[String(INPUT)]: 4}},
    }))

    expect(await stored(INPUT)).toBe(4)
    expect(commit?.messages).toHaveLength(1)
    expect(commit?.messages[0]?.parts[0]).toEqual({
      part: "gluon",
      op: "replace",
      path: actorId,
      from: expect.stringMatching(/^boundary:/),
      value: {fields: {[String(INPUT)]: 4}},
    })
  })

  test("does not recommit an already canonical Field consequence", async () => {
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: actorId,
      from: "boundary:existing",
      value: {fields: {[String(INPUT)]: 9}},
    }))

    expect(commit).toBeNull()
    expect(await stored(INPUT)).toBe(0)
  })

  test("rejects topology Fields sent through Gluon without partial mutation", async () => {
    await expect(boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: actorId,
      value: {fields: {[String(INPUT)]: 3, [String(LINKS)]: [actorId]}},
    }))).rejects.toThrow("cannot write field")

    expect(await stored(INPUT)).toBe(0)
    expect(await stored(LINKS)).toEqual([])
  })

  test("removes a scalar override through the same canonical path", async () => {
    await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: actorId,
      value: {fields: {[String(INPUT)]: 5}},
    }))
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "remove",
      path: actorId,
      value: {fields: {[String(INPUT)]: null}},
    }))

    expect(await stored(INPUT)).toBeUndefined()
    expect(commit?.messages[0]?.parts[0]).toMatchObject({
      part: "gluon",
      op: "remove",
      path: actorId,
      from: expect.stringMatching(/^boundary:/),
    })
  })
})
