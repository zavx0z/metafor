import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {STATE_UNDEFINED} from "@metafor/types/matrix/runtime"
import {boundaryEntityId} from "../incremental.ts"
import {open, type BoundaryDatabase} from "../sqlite.ts"

const ROOT = "owner/runtime"

describe("Boundary -> packed Matrix runtime", () => {
  let boundary: BoundaryDatabase

  beforeEach(async () => {
    boundary = await open(":memory:")
  })

  afterEach(async () => {
    await boundary.close()
  })

  const apply = async (particle: Particle): Promise<void> => {
    await boundary.materialize({parts: [particle]})
  }

  const declaration = async (section: string, localId: string, value: unknown): Promise<void> => {
    await apply({
      part: "inflaton",
      op: "add",
      path: `${ROOT}/${section}/${localId}`,
      value,
    })
  }

  test("derives one Weak-ready brane without creating a second world store", async () => {
    await apply({part: "inflaton", op: "add", path: `${ROOT}/meta`, value: {name: "Runtime"}})
    await declaration("fields", "1", {key: "input", type: "number", default: 0, position: 0})
    await declaration("states", "1", {key: "idle", position: 0})
    await declaration("states", "2", {key: "ready", position: 1})
    await declaration("transitions", "1", {from: "1", to: "2", position: 0})
    await declaration("conditions", "1", {transition: "1", field: "1", position: 0, predicate: {eq: 1}})
    await declaration("processes", "1", {
      key: "ready",
      type: "action",
      env: ["server"],
      action: {src: "./run.ts", read: ["1"]},
    })
    await apply({part: "inflaton", op: "test", path: ROOT})

    const snapshot = await boundary.matrixRuntime()
    const actorId = snapshot.runtime.actorIdByBraneIndex[0]!
    const fieldId = boundaryEntityId(`${ROOT}/fields/1`)

    expect(snapshot.ok).toBe(true)
    expect(snapshot.version).toBe(1)
    expect(snapshot.runtime.actorIdByBraneIndex).toHaveLength(1)
    expect(snapshot.runtime.wimpSrcByActorId).toEqual([[actorId, ROOT]])
    expect(snapshot.runtime.runtimeFieldIndexByActorFieldId).toEqual([[actorId, fieldId, 0]])
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

    expect((await boundary.projection.sql`SELECT COUNT(*) AS count FROM actor`).length).toBe(1)
    expect((await boundary.projection.sql`SELECT COUNT(*) AS count FROM boundary_declaration_entity`).length).toBe(1)
  })
})
