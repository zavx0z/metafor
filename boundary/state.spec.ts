import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {boundaryEntityId} from "./incremental.ts"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/state"
const PROCESS = boundaryEntityId(`${ROOT}/processes/1`)
const OUTPUT = boundaryEntityId(`${ROOT}/fields/1`)
const message = (part: Particle): ForceMessage => ({parts: [part]})

describe("Boundary canonical State", () => {
  let boundary: BoundaryDatabase
  let atomId: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    const declarations: Particle[] = [
      {part: "inflaton", op: "add", path: `${ROOT}/meta`, value: {name: "State"}},
      {part: "inflaton", op: "add", path: `${ROOT}/fields/1`, value: {key: "output", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/1`, value: {name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/2`, value: {name: "ready", position: 1}},
      {part: "inflaton", op: "add", path: `${ROOT}/states/3`, value: {name: "complete", position: 2}},
      {
        part: "inflaton",
        op: "add",
        path: `${ROOT}/processes/1`,
        value: {
          key: "ready",
          type: "action",
          env: ["server"],
          action: {src: "./ready.ts", read: []},
          success: {src: "({update}) => update({output: 2})", read: ["1"], write: ["1"]},
        },
      },
      {part: "inflaton", op: "test", path: ROOT},
    ]
    for (const part of declarations) await boundary.materialize(message(part))
    const atom = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!atom) throw new Error("Root atom was not materialized")
    atomId = Number(atom.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const stateName = async (): Promise<string | null> => {
    const row = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT state.name
        FROM atom_state
        JOIN state ON state.id = atom_state.metaState
       WHERE atom_state.atom = ${atomId}
    `)[0]
    return row?.name ?? null
  }

  test("persists non-Process Photon and rebuilds Matrix from the canonical State", async () => {
    await boundary.materialize(message({part: "photon", op: "replace", path: atomId, value: "idle"}))
    expect(await stateName()).toBe("idle")

    const snapshot = await boundary.matrixRuntime()
    expect(snapshot.data.stateNames).toEqual([["idle", "ready", "complete"]])
    expect(snapshot.data.branes[0]?.state).toBe(0)

    await expect(boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: atomId,
      value: "missing",
    }))).rejects.toThrow("Cannot commit State")
    expect(await stateName()).toBe("idle")
  })

  test("persists Process State atomically with execution identity", async () => {
    const processExecutionId = "state-execution"
    await boundary.materialize(message({
      part: "photon",
      op: "test",
      path: atomId,
      from: processExecutionId,
      value: "ready",
    }))

    expect(await stateName()).toBe("ready")
    const execution = (await boundary.projection.sql<Array<{
      atom: number
      process: number
      state: string
      status: string
    }>>`
      SELECT atom, process, state, status
        FROM boundary_process_execution
       WHERE execution_id = ${processExecutionId}
    `)[0]
    expect(execution).toEqual({atom: atomId, process: PROCESS, state: "ready", status: "pending"})
    expect((await boundary.matrixRuntime()).data.branes[0]?.state).toBe(1)
  })

  test("supersedes stale Process and delayed duplicate cannot restore its State", async () => {
    const processExecutionId = "state-stale"
    const processPhoton: Particle = {
      part: "photon",
      op: "test",
      path: atomId,
      from: processExecutionId,
      value: "ready",
    }
    await boundary.materialize(message(processPhoton))
    await boundary.materialize(message({part: "photon", op: "replace", path: atomId, value: "complete"}))

    expect(await stateName()).toBe("complete")
    expect((await boundary.projection.sql<Array<{status: string}>>`
      SELECT status FROM boundary_process_execution WHERE execution_id = ${processExecutionId}
    `)[0]?.status).toBe("superseded")

    await boundary.materialize(message(processPhoton))
    expect(await stateName()).toBe("complete")

    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: atomId,
      from: "energy-stale",
      value: {
        processExecutionId,
        processId: PROCESS,
        fields: {[String(OUTPUT)]: 2},
      },
    }))).rejects.toThrow("already superseded")
  })
})
