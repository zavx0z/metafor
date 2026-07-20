import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import {open, type BoundaryDatabase} from "./sqlite.ts"

const ROOT = "test/state"
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary canonical State", () => {
  let boundary: BoundaryDatabase
  let atomId: number
  let PROCESS: number
  let OUTPUT: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    const declarations: ParticleInput[] = [
      {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "State"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "output", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "idle", position: 0}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 2, name: "ready", position: 1}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 3, name: "complete", position: 2}},
      {
        part: "inflaton",
        op: "add",
        path: "process",
        value: {
          wimp: ROOT, id: 1, key: "ready",
          type: "action",
          env: ["server"],
          action: {src: "./ready.ts", read: []},
          success: {src: "({update}) => update({output: 2})", read: [1], write: [1]},
        },
      },
    ]
    for (const part of declarations) await boundary.materialize(message(part))
    const atom = (await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT} ORDER BY id LIMIT 1
    `)[0]
    if (!atom) throw new Error("Root atom was not materialized")
    atomId = Number(atom.id)
    PROCESS = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM process WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
    OUTPUT = Number((await boundary.projection.sql<Array<{id: number}>>`SELECT id FROM field WHERE wimp = ${ROOT} AND local_id = ${1}`)[0]!.id)
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

  test("persists non-Process Photon and exposes the canonical State for domain birth", async () => {
    await boundary.materialize(message({part: "photon", op: "replace", path: atomId, value: "idle"}))
    expect(await stateName()).toBe("idle")

    const initial = await boundary.initialState()
    expect(initial.declarations.filter((item) => item.section === "states").map((item) => item.value.name)).toEqual([
      "idle",
      "ready",
      "complete",
    ])
    const idle = initial.declarations.find((item) => item.section === "states" && item.value.name === "idle")
    expect(initial.atoms[0]?.state).toBe(Number(idle?.value.id))

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
    const initial = await boundary.initialState()
    const ready = initial.declarations.find((item) => item.section === "states" && item.value.name === "ready")
    expect(initial.atoms[0]?.state).toBe(Number(ready?.value.id))
  })

  test("supersedes stale Process and delayed duplicate cannot restore its State", async () => {
    const processExecutionId = "state-stale"
    const processPhoton: ParticleInput = {
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
