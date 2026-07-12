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
  let actorId: number

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
    const actor = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM actor WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!actor) throw new Error("Root actor was not materialized")
    actorId = Number(actor.id)
  })

  afterEach(async () => {
    await boundary.close()
  })

  const stateName = async (): Promise<string | null> => {
    const row = (await boundary.projection.sql<Array<{name: string}>>`
      SELECT state.name
        FROM actor_state
        JOIN state ON state.id = actor_state.metaState
       WHERE actor_state.actor = ${actorId}
    `)[0]
    return row?.name ?? null
  }

  test("persists non-Process Photon and rebuilds Matrix from the canonical State", async () => {
    await boundary.materialize(message({part: "photon", op: "replace", path: actorId, value: "idle"}))
    expect(await stateName()).toBe("idle")

    const snapshot = await boundary.matrixRuntime()
    expect(snapshot.data.stateNames).toEqual([["idle", "ready", "complete"]])
    expect(snapshot.data.branes[0]?.state).toBe(0)

    await expect(boundary.materialize(message({
      part: "photon",
      op: "replace",
      path: actorId,
      value: "missing",
    }))).rejects.toThrow("Cannot commit State")
    expect(await stateName()).toBe("idle")
  })

  test("persists Process State atomically with execution identity", async () => {
    const processExecutionId = "state-execution"
    await boundary.materialize(message({
      part: "photon",
      op: "test",
      path: actorId,
      from: processExecutionId,
      value: "ready",
    }))

    expect(await stateName()).toBe("ready")
    const execution = (await boundary.projection.sql<Array<{
      actor: number
      process: number
      state: string
      status: string
    }>>`
      SELECT actor, process, state, status
        FROM boundary_process_execution
       WHERE execution_id = ${processExecutionId}
    `)[0]
    expect(execution).toEqual({actor: actorId, process: PROCESS, state: "ready", status: "pending"})
    expect((await boundary.matrixRuntime()).data.branes[0]?.state).toBe(1)
  })

  test("supersedes stale Process and delayed duplicate cannot restore its State", async () => {
    const processExecutionId = "state-stale"
    const processPhoton: Particle = {
      part: "photon",
      op: "test",
      path: actorId,
      from: processExecutionId,
      value: "ready",
    }
    await boundary.materialize(message(processPhoton))
    await boundary.materialize(message({part: "photon", op: "replace", path: actorId, value: "complete"}))

    expect(await stateName()).toBe("complete")
    expect((await boundary.projection.sql<Array<{status: string}>>`
      SELECT status FROM boundary_process_execution WHERE execution_id = ${processExecutionId}
    `)[0]?.status).toBe("superseded")

    await boundary.materialize(message(processPhoton))
    expect(await stateName()).toBe("complete")

    await expect(boundary.materialize(message({
      part: "w+",
      op: "replace",
      path: actorId,
      from: "energy-stale",
      value: {
        processExecutionId,
        processId: PROCESS,
        fields: {[String(OUTPUT)]: 2},
      },
    }))).rejects.toThrow("already superseded")
  })
})
