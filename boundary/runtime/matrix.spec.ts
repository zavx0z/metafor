import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {STATE_UNDEFINED} from "@metafor/types/matrix/runtime"
import {open, type BoundaryDatabase} from "../sqlite.ts"

const ROOT = "owner/runtime"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}

describe("Boundary -> packed Matrix runtime", () => {
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

  test("derives one Weak-ready brane without creating a second world store", async () => {
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

    const snapshot = await boundary.matrixRuntime()
    const atomId = snapshot.runtime.atomIdByBraneIndex[0]!
    const fieldId = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)

    expect(snapshot.ok).toBe(true)
    expect(snapshot.version).toBe(1)
    expect(snapshot.runtime.atomIdByBraneIndex).toHaveLength(1)
    expect(snapshot.runtime.wimpSrcByAtomId).toEqual([[atomId, ROOT]])
    expect(snapshot.runtime.runtimeFieldIndexByAtomFieldId).toEqual([[atomId, fieldId, 0]])
    expect(snapshot.strong.runtimeFieldIndexByWimpFieldId).toEqual([[1, 0]])
    expect(snapshot.strong.wimpFieldIdsByRuntimeFieldIndex).toEqual([[1]])
    expect(snapshot.strong.braneIndexByWimpFieldId).toEqual([[1, 0]])
    expect(snapshot.data.fields).toEqual([{type: 0}])
    expect(snapshot.data.branes).toHaveLength(1)
    expect(snapshot.data.branes[0]!.values).toEqual([[0, 0]])
    expect(snapshot.data.branes[0]!.state).toBe(STATE_UNDEFINED)
    expect(snapshot.data.stateNames).toEqual([["idle", "ready"]])
    expect(snapshot.data.branes[0]!.collapses).toEqual([
      [[1, {0: {eq: 1}}]],
      [],
    ])
    expect(snapshot.weak.stateHasProcessByBraneIndex).toEqual([[false, true]])

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
})
