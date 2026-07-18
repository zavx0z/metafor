import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"
import {readBoundaryValue} from "./world.ts"

const ROOT = "test/external-input"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary canonical external Field input", () => {
  let boundary: BoundaryDatabase
  let atomId: number
  let INPUT: number
  let LINKS: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    for (const part of [
      {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "External Input"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "input", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 2, key: "links", type: "array", default: []}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "idle", position: 0}},
    ] as ParticleInput[]) await boundary.materialize(message(part))

    const fields = await boundary.projection.sql<Array<{id: number; localId: number}>>`
      SELECT id, local_id AS localId FROM field WHERE wimp = ${ROOT} ORDER BY local_id
    `
    INPUT = Number(fields[0]!.id)
    LINKS = Number(fields[1]!.id)

    const atom = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!atom) throw new Error("Root Atom was not materialized")
    atomId = Number(atom.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const stored = async (field: number): Promise<unknown> => {
    const row = (await boundary.projection.sql<Array<{value: number}>>`
      SELECT value FROM atom_value
       WHERE atom = ${atomId} AND field = ${field}
    `)[0]
    return row ? await readBoundaryValue(boundary.projection.sql, Number(row.value)) : undefined
  }

  test("commits an external Gluon before emitting its canonical consequence", async () => {
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: atomId,
      value: {fields: {[String(INPUT)]: 4}},
    }))

    expect(await stored(INPUT)).toBe(4)
    expect(commit?.messages).toHaveLength(1)
    expect(commit?.messages[0]?.parts[0]).toEqual({
      part: "gluon",
      op: "replace",
      path: atomId,
      ts: expect.any(Number),
      from: expect.stringMatching(/^boundary:/),
      value: {fields: {[String(INPUT)]: 4}},
    })
  })

  test("does not recommit an already canonical Field consequence", async () => {
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: atomId,
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
      path: atomId,
      value: {fields: {[String(INPUT)]: 3, [String(LINKS)]: [atomId]}},
    }))).rejects.toThrow("cannot write field")

    expect(await stored(INPUT)).toBe(0)
    expect(await stored(LINKS)).toEqual([])
  })

  test("removes a scalar override through the same canonical path", async () => {
    await boundary.materialize(message({
      part: "gluon",
      op: "replace",
      path: atomId,
      value: {fields: {[String(INPUT)]: 5}},
    }))
    const commit = await boundary.materialize(message({
      part: "gluon",
      op: "remove",
      path: atomId,
      value: {fields: {[String(INPUT)]: null}},
    }))

    expect(await stored(INPUT)).toBeUndefined()
    expect(commit?.messages[0]?.parts[0]).toMatchObject({
      part: "gluon",
      op: "remove",
      path: atomId,
      from: expect.stringMatching(/^boundary:/),
    })
  })
})
