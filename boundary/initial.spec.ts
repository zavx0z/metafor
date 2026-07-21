import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "shared/protocol/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "owner/runtime"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

describe("Boundary canonical initial state", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: ParticleInput): Promise<void> => {
    await boundary.materialize({parts: [{ts: 1, ...particle}] as [Particle]})
  }

  const declaration = async (path: "field" | "state" | "transition" | "condition" | "process", localId: number, value: Record<string, unknown>): Promise<void> => {
    await apply({
      part: "inflaton",
      op: "add",
      path,
      value: {wimp: ROOT, id: localId, ...value},
    })
  }

  test("returns normalized source rows without preparing a Matrix Store", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})
    await declaration("field", 1, {key: "input", type: "number", default: 0, position: 0})
    await declaration("state", 1, {name: "idle", position: 0})
    await declaration("state", 2, {name: "ready", position: 1})
    await declaration("transition", 1, {from: 1, to: 2, position: 0})
    await declaration("condition", 1, {transition: 1, field: 1, position: 0, predicate: {eq: 1}})
    await declaration("process", 1, {
      key: "ready",
      type: "action",
      env: ["server"],
      action: {src: "./run.ts", read: [1]},
    })

    const initial = await boundary.initialState()
    const atomId = initial.atoms[0]!.id
    const fieldId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)

    expect(initial.version).toBe(1)
    expect(initial.atoms).toEqual([{
      id: atomId,
      wimp: ROOT,
      values: [{field: fieldId, value: 0}],
      state: null,
    }])
    expect(initial.declarations.find((item) => item.section === "fields")?.value).toMatchObject({
      id: fieldId,
      wimp: ROOT,
      key: "input",
      type: "number",
      default: 0,
    })
    expect(initial.declarations.filter((item) => item.section === "states").map((item) => item.value.name)).toEqual([
      "idle",
      "ready",
    ])
    expect(initial.declarations.find((item) => item.section === "conditions")?.value.predicate).toEqual({eq: 1})
    expect(initial.declarations.find((item) => item.section === "processes")?.value.state).toBe("ready")

    const atomCount = (await boundary.projection.sql<Array<{count: number}>>`
      SELECT COUNT(*) AS count FROM atom
    `)[0]!.count
    const declarationCount = (await boundary.projection.sql<Array<{count: number}>>`
      SELECT
        (SELECT COUNT(*) FROM wimp) +
        (SELECT COUNT(*) FROM field) +
        (SELECT COUNT(*) FROM state) +
        (SELECT COUNT(*) FROM transition) +
        (SELECT COUNT(*) FROM condition) +
        (SELECT COUNT(*) FROM process) AS count
    `)[0]!.count
    expect(Number(atomCount)).toBe(1)
    expect(Number(declarationCount)).toBe(7)
  })

  test("returns the complete current projection as timestamp-free service data", async () => {
    await apply({part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime"}})
    await declaration("field", 1, {key: "input", type: "number", default: 0, position: 0})

    const initial = await boundary.initialProjection()

    expect(initial.version).toBe(1)
    expect(initial.entries.some((entry) => entry.path === "wimp")).toBe(true)
    expect(initial.entries.some((entry) => entry.path === "field")).toBe(true)
    expect(initial.entries.some((entry) => typeof entry.path === "string" && entry.path.startsWith("atom/"))).toBe(true)
    expect(initial.entries.every((entry) => !("ts" in entry) && !("by" in entry))).toBe(true)
  })
})
