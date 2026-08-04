import {describe, expect, test} from "bun:test"
import {parseMetaAddress} from "@metafor/types/metafor/graph"
import type {MetaFieldValueApplyRequest, MetaProcessExecutionReadRequest} from "@metafor/types/metafor/observation"
import {
  DARK_FORCE_PARTICLE_SCHEMA,
  type DarkForceHistoryParticle,
  type DarkForceHistoryQuery,
} from "../force/history.ts"
import {MetaRuntimeRpcService} from "./runtime.ts"
import {
  BOUNDARY_FIELD_VALUE_PLAN_METHOD,
  BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
} from "../../boundary/runtime-rpc.ts"

const ROOT = parseMetaAddress("test/runtime")!
const locator = {root: ROOT, pointer: "/runtime/roots/0" as const, meta: ROOT}

const entry = (
  sequence: number,
  particle: DarkForceHistoryParticle["particle"],
): DarkForceHistoryParticle => ({
  schema: DARK_FORCE_PARTICLE_SCHEMA,
  id: `runtime-cut:${sequence}`,
  sequence,
  acceptedAt: `2026-08-04T12:00:${String(sequence).padStart(2, "0")}.000Z`,
  particle,
})

describe("Dark runtime RPC", () => {
  test("accepts one Boundary-planned Field Particle only at the expected frontier", async () => {
    let sequence = 4
    const calls: unknown[] = []
    const service = new MetaRuntimeRpcService({
      read() { return [] },
      status() {
        return {path: "history", cutId: "runtime-cut", startedAt: "2026-08-04T12:00:00.000Z", sequence, segments: 1, retroactiveComplete: false}
      },
    }, {
      async acceptAgentParticleAtFrontier(plan, expected) {
        calls.push({plan: structuredClone(plan), expected: structuredClone(expected)})
        if (expected.throughSequence !== sequence) {
          return {ok: false as const, reason: "frontier_mismatch" as const, error: "frontier differs"}
        }
        sequence++
        return {
          ok: true as const,
          delivered: ["boundary" as const],
          particle: {...plan.parts[0]!, by: "agent" as const},
          acceptance: {cutId: "runtime-cut", sequence, id: `runtime-cut:${sequence}`},
        }
      },
    }, {
      async call(target: string, method: string, request: unknown) {
        calls.push({target, method, request: structuredClone(request)})
        return {parts: [{part: "gluon", op: "replace", path: 41, ts: 7, value: {fields: {9: 3}}}]}
      },
    } as never)
    const request: MetaFieldValueApplyRequest = {
      contractVersion: 1,
      atom: locator,
      field: "input",
      value: 3,
      expectedFrontier: {cutId: "runtime-cut", throughSequence: 4, retroactiveComplete: false},
    }

    await expect(service.applyFieldValue(request)).resolves.toEqual({
      contractVersion: 1,
      resolution: "exact",
      atom: locator,
      field: "input",
      acceptance: {cutId: "runtime-cut", sequence: 5, id: "runtime-cut:5"},
      frontier: {cutId: "runtime-cut", throughSequence: 5, retroactiveComplete: false},
    })
    expect(calls).toEqual([
      {target: "boundary", method: BOUNDARY_FIELD_VALUE_PLAN_METHOD, request},
      {
        plan: {parts: [{part: "gluon", op: "replace", path: 41, ts: 7, value: {fields: {9: 3}}}]},
        expected: request.expectedFrontier,
      },
    ])
    await expect(service.applyFieldValue(request)).rejects.toThrow("frontier differs")
  })

  test("joins canonical Process status to existing registration and settlement history", async () => {
    const execution = "execution-public"
    const registration = entry(6, {
      part: "photon", op: "test", path: 41, from: execution, by: "matrix", ts: 6, value: "ready",
    })
    const settlement = entry(9, {
      part: "w+", op: "copy", path: 41, from: execution, by: "boundary", ts: 9,
      value: {processExecutionId: execution, processId: 8, energy: "energy-local"},
    })
    const service = new MetaRuntimeRpcService({
      read(query: DarkForceHistoryQuery = {}) {
        return [registration, settlement].filter((item) =>
          (query.part === undefined || item.particle.part === query.part) &&
          (query.op === undefined || item.particle.op === query.op) &&
          (query.from === undefined || item.particle.from === query.from)
        )
      },
      status() {
        return {path: "history", cutId: "runtime-cut", startedAt: "2026-08-04T12:00:00.000Z", sequence: 9, segments: 1, retroactiveComplete: false}
      },
    }, {} as never, {
      async call(target: string, method: string, request: unknown) {
        expect({target, method, request}).toEqual({
          target: "boundary",
          method: BOUNDARY_PROCESS_EXECUTION_PROJECT_METHOD,
          request: {contractVersion: 1, atom: locator, process: "ready", execution},
        })
        return {status: "committed", outcome: {fields: {output: 7}}}
      },
    } as never)
    const request: MetaProcessExecutionReadRequest = {
      contractVersion: 1,
      atom: locator,
      process: "ready",
      execution,
    }

    await expect(service.readProcessExecution(request)).resolves.toEqual({
      contractVersion: 1,
      resolution: "exact",
      atom: locator,
      process: "ready",
      execution,
      status: "committed",
      acceptance: {cutId: "runtime-cut", sequence: 6, id: "runtime-cut:6"},
      settlement: {cutId: "runtime-cut", sequence: 9, id: "runtime-cut:9"},
      outcome: {fields: {output: 7}},
      frontier: {cutId: "runtime-cut", throughSequence: 9, retroactiveComplete: false},
    })
  })

  test("joins a failed Process outcome to its existing w- settlement", async () => {
    const execution = "execution-failed"
    const registration = entry(3, {
      part: "photon", op: "test", path: 41, from: execution, by: "matrix", ts: 3, value: "ready",
    })
    const settlement = entry(7, {
      part: "w-", op: "copy", path: 41, from: execution, by: "boundary", ts: 7,
      value: {processExecutionId: execution, processId: 8, energy: "energy-local"},
    })
    const service = new MetaRuntimeRpcService({
      read(query: DarkForceHistoryQuery = {}) {
        return [registration, settlement].filter((item) =>
          (query.part === undefined || item.particle.part === query.part) &&
          (query.op === undefined || item.particle.op === query.op) &&
          (query.from === undefined || item.particle.from === query.from)
        )
      },
      status() {
        return {path: "history", cutId: "runtime-cut", startedAt: "2026-08-04T12:00:00.000Z", sequence: 7, segments: 1, retroactiveComplete: false}
      },
    }, {} as never, {
      async call() {
        return {status: "failed", outcome: {fields: {}, error: "runtime failed"}}
      },
    } as never)

    await expect(service.readProcessExecution({
      contractVersion: 1,
      atom: locator,
      process: "ready",
      execution,
    })).resolves.toMatchObject({
      status: "failed",
      acceptance: {cutId: "runtime-cut", sequence: 3, id: "runtime-cut:3"},
      settlement: {cutId: "runtime-cut", sequence: 7, id: "runtime-cut:7"},
      outcome: {fields: {}, error: "runtime failed"},
    })
  })
})
