import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldValueApplyRequest, MetaProcessExecutionReadRequest} from "shared/protocol/metafor/observation"
import type {ForceMessage} from "shared/protocol/force/message"
import type {Particle} from "shared/protocol/force/particle"
import type {ProcessExecutionGrant, ProcessResultProposal} from "shared/protocol/force/execution"
import {open, type BoundaryDatabase} from "./sqlite.ts"
import {BoundaryRuntimeRpcService} from "./runtime-rpc.ts"

const ROOT = parseMetaAddress("test/runtime-rpc")!
const locator = {root: ROOT, ref: "atom:1" as const, meta: ROOT}
type ParticleInput = Omit<Particle, "ts"> & {ts?: number}
const message = (part: ParticleInput): ForceMessage => ({parts: [{ts: 1, ...part}] as [Particle]})

describe("Boundary runtime RPC provider", () => {
  let boundary: BoundaryDatabase
  let service: BoundaryRuntimeRpcService
  let atom: number
  let inputField: number
  let outputField: number
  let process: number

  beforeEach(async () => {
    boundary = await open(":memory:")
    service = new BoundaryRuntimeRpcService(boundary)
    for (const part of [
      {part: "inflaton", op: "add", path: "wimp", value: {src: ROOT, name: "Runtime RPC"}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 1, key: "input", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 2, key: "output", type: "number", default: 0}},
      {part: "inflaton", op: "add", path: "field", value: {wimp: ROOT, id: 3, key: "items", type: "array", default: []}},
      {part: "inflaton", op: "add", path: "state", value: {wimp: ROOT, id: 1, name: "ready", position: 0}},
    ] as ParticleInput[]) await boundary.materialize(message(part))
    const fields = await boundary.projection.sql<Array<{id: number; key: string}>>`
      SELECT id, key FROM field WHERE wimp = ${ROOT}
    `
    inputField = Number(fields.find(({key}) => key === "input")!.id)
    outputField = Number(fields.find(({key}) => key === "output")!.id)
    await boundary.materialize(message({
      part: "inflaton",
      op: "add",
      path: "process",
      value: {
        wimp: ROOT,
        id: 1,
        key: "ready",
        type: "action",
        env: ["server"],
        action: {src: "./ready.ts", read: [inputField]},
        success: {src: "({update}) => update({output: 7})", read: [outputField], write: [outputField]},
      },
    }))
    atom = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM atom WHERE wimp = ${ROOT}
    `)[0]!.id)
    process = Number((await boundary.projection.sql<Array<{id: number}>>`
      SELECT id FROM process WHERE wimp = ${ROOT} AND key = ${"ready"}
    `)[0]!.id)
  })

  afterEach(async () => await boundary.close())

  const fieldRequest = (field: string, value: MetaFieldValueApplyRequest["value"]): MetaFieldValueApplyRequest => ({
    contractVersion: 1,
    atom: locator,
    field,
    value,
    expectedFrontier: {cutId: "runtime-cut", throughSequence: 4, retroactiveComplete: false},
  })

  test("plans one ordinary Gluon and rejects topology Fields", async () => {
    await expect(service.planFieldValue(fieldRequest("input", 4))).resolves.toEqual({parts: [{
      part: "gluon",
      op: "replace",
      path: atom,
      ts: expect.any(Number),
      value: {fields: {[String(inputField)]: 4}},
    }]})
    await expect(service.planFieldValue({
      ...fieldRequest("items", null),
      value: [2, 3],
    })).rejects.toThrow("ordinary scalar")
    await expect(service.planFieldValue(fieldRequest("items", null)))
      .rejects.toThrow("only by Process")
    await expect(service.planFieldValue(fieldRequest("input", "wrong"))).rejects.toThrow("number declaration")
    await expect(service.planFieldValue({...fieldRequest("input", 1), atom: {...locator, ref: "atom:999"}}))
      .rejects.toThrow("stale")
  })

  test("projects pending and committed Process outcomes with semantic Field keys", async () => {
    const execution = "runtime-execution"
    await boundary.materialize(message({part: "photon", op: "test", path: atom, from: execution, value: "ready"}))
    const request: MetaProcessExecutionReadRequest = {
      contractVersion: 1,
      atom: locator,
      process: "ready",
      execution,
    }
    await expect(service.projectProcessExecution(request)).resolves.toEqual({status: "pending", outcome: null})

    const grant: ProcessExecutionGrant = {processExecutionId: execution, fields: {[String(inputField)]: 4}}
    await boundary.materialize(message({part: "z", op: "copy", path: atom, from: "energy-runtime", value: grant}))
    const proposal: ProcessResultProposal = {
      processExecutionId: execution,
      processId: process,
      fields: {[String(outputField)]: 7},
    }
    await boundary.materialize(message({part: "w+", op: "replace", path: atom, from: "energy-runtime", value: proposal}))

    await expect(service.projectProcessExecution(request)).resolves.toEqual({
      status: "committed",
      outcome: {fields: {output: 7}},
    })
    await expect(service.projectProcessExecution({...request, process: "missing"})).rejects.toThrow("not uniquely declared")
  })

  test("projects a failed Process outcome without exposing internal Field identities", async () => {
    const execution = "runtime-execution-failed"
    await boundary.materialize(message({part: "photon", op: "test", path: atom, from: execution, value: "ready"}))
    const grant: ProcessExecutionGrant = {processExecutionId: execution, fields: {[String(inputField)]: 4}}
    await boundary.materialize(message({part: "z", op: "copy", path: atom, from: "energy-runtime", value: grant}))
    const proposal: ProcessResultProposal = {
      processExecutionId: execution,
      processId: process,
      error: "runtime failed",
      fields: {},
    }
    await boundary.materialize(message({part: "w-", op: "replace", path: atom, from: "energy-runtime", value: proposal}))

    await expect(service.projectProcessExecution({
      contractVersion: 1,
      atom: locator,
      process: "ready",
      execution,
    })).resolves.toEqual({
      status: "failed",
      outcome: {fields: {}, error: "runtime failed"},
    })
  })
})
