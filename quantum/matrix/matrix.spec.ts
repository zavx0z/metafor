import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
import type {ProcessResultCommit, ProcessResultProposal} from "shared/protocol/force/execution"
import type {Particle, SourcedParticle} from "shared/protocol/force/particle"
import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import {
  createForceTestFixture,
  type ForceTestClient,
  type ForceTestFixture,
} from "../dark/force/fixture.ts"
import {prepareMatrixBirth} from "./birth.ts"
import {weak$} from "./weak"

let fixture: ForceTestFixture
const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
type ParticleInput = Omit<SourcedParticle, "ts"> & {ts?: number}

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
  fixture = createForceTestFixture()
})

afterAll(() => {
  fixture.close()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const send = (client: ForceTestClient, particle: ParticleInput): void =>
  fixture.impulse(client, {parts: [{ts: 1, ...particle}] as [Particle]})

const waitForPart = async (
  client: ForceTestClient,
  predicate: (part: Particle) => boolean,
  from = 0,
): Promise<Particle> => {
  const entry = await fixture.waitForMessage(
    (message) => message.client === client && predicate(message.message.parts[0]),
    from,
  )
  return entry.message.parts[0]
}

const runtimeInitialState = (): BoundaryInitialState => ({
  version: 2,
  reactionRelations: [],
  pendingProcessExecutions: [],
  atoms: [{
    id: 17,
    wimp: "owner/process",
    values: [{field: 101, valueId: 1001, value: 0}, {field: 102, valueId: 1002, value: ""}],
    state: null,
  }],
  declarations: [
    {src: "owner/process", section: "fields", localId: "1", value: {id: 101, key: "input", type: "number", default: 0, position: 0}},
    {src: "owner/process", section: "fields", localId: "2", value: {id: 102, key: "command", type: "string", default: "", position: 1}},
    {src: "owner/process", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
    {src: "owner/process", section: "states", localId: "2", value: {id: 202, name: "ready", position: 1}},
    {src: "owner/process", section: "states", localId: "3", value: {id: 203, name: "done", position: 2}},
    {src: "owner/process", section: "transitions", localId: "1", value: {id: 301, fromState: 201, toState: 202, position: 0}},
    {src: "owner/process", section: "transitions", localId: "2", value: {id: 302, fromState: 202, toState: 203, position: 1}},
    {src: "owner/process", section: "conditions", localId: "1", value: {id: 401, transition: 301, field: 101, position: 0, predicate: {gt: 10}}},
    {src: "owner/process", section: "conditions", localId: "2", value: {id: 402, transition: 302, field: 101, position: 1, predicate: {gt: 11}}},
    {src: "owner/process", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
  ],
})

describe("Matrix packed Force runtime", () => {
  test("waits for Boundary commit before applying Energy W result", async () => {
    await prepareMatrixBirth(runtimeInitialState())
    const fromBootstrap = fixture.messages.length
    const waiting = fixture.nextClient("matrix")
    const runtime = await import(`./matrix.ts?packed-force-test=${crypto.randomUUID()}`)
    const client = await waiting
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "idle", fromBootstrap)).toEqual({
      part: "photon", op: "replace", path: 17, by: "matrix", ts: expect.any(Number),
      from: expect.any(String), value: "idle",
    })
    expect(runtime.listMatrixRuntimeAtomIds()).toEqual([17])
    expect(weak$.mode).toBe("cpu")

    const fromField = fixture.messages.length
    send(client, {
      part: "gluon",
      op: "replace",
      path: 17,
      by: "boundary",
      value: {fields: {"101": 11, "102": "git commit --dry-run -m capsule"}},
    })
    const ready = await waitForPart(client, (part) => part.part === "photon" && part.op === "test", fromField)
    expect(ready).toMatchObject({part: "photon", op: "test", path: 17, value: "ready"})
    expect(typeof ready.from).toBe("string")
    let processExecutionId = String(ready.from)
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const beforeStructural = fixture.messages.length
    send(client, {
      part: "graviton",
      op: "add",
      path: "atom/18",
      by: "boundary",
      value: {
        atom: {id: 18, parentAtom: 17, parentTopology: null, wimp: "owner/process", position: 0},
        values: [
          {atom: 18, field: 101, value: 1003},
          {atom: 18, field: 102, value: 1004},
        ],
        valueRecords: [
          {id: 1003, kind: "number", number: 0},
          {id: 1004, kind: "string", text: ""},
        ],
        valueItems: [],
        state: {atom: 18, metaState: null},
      },
    })
    expect(await waitForPart(
      client,
      (part) => part.part === "photon" && part.path === 18 && part.value === "idle",
      beforeStructural,
    )).toMatchObject({part: "photon", op: "replace", path: 18, value: "idle"})
    await settle()
    expect(fixture.messages.slice(beforeStructural).some((entry) => {
      const part = entry.message.parts[0]
      return entry.client === client && part.part === "photon" && part.path === 17
    })).toBe(false)
    expect(runtime.matrix$.branes[runtime.gravity$.getBraneIndexByAtomId(17)!]?.lock).toBe(true)

    const previousProcessExecutionId = processExecutionId
    const beforeWimpRebuild = fixture.messages.length
    send(client, {
      part: "graviton",
      op: "replace",
      path: "matter",
      by: "boundary",
      value: {wimp: "owner/process", localId: 1, id: 41, kind: "wimp", src: "owner/child"},
    })
    const rebuilt = await waitForPart(
      client,
      (part) => part.part === "photon" && part.op === "test" && part.path === 17,
      beforeWimpRebuild,
    )
    expect(rebuilt).toMatchObject({part: "photon", op: "test", path: 17, value: "ready"})
    expect(rebuilt.from).not.toBe(previousProcessExecutionId)
    processExecutionId = String(rebuilt.from)

    const fromStaleClaim = fixture.messages.length
    send(client, {
      part: "z",
      op: "test",
      path: 17,
      by: "energy",
      value: {energy: "energy-local", processExecutionId: previousProcessExecutionId},
    })
    await settle()
    expect(fixture.messages.slice(fromStaleClaim).filter((entry) => entry.client === client)).toEqual([])

    const fromClaim = fixture.messages.length
    send(client, {
      part: "z",
      op: "test",
      path: 17,
      by: "energy",
      value: {energy: "energy-local", processExecutionId},
    })
    expect(await waitForPart(client, (part) => part.part === "z" && part.op === "copy", fromClaim)).toEqual({
      part: "z",
      op: "copy",
      path: 17,
      by: "matrix",
      ts: expect.any(Number),
      from: "energy-local",
      value: {
        processExecutionId,
        fields: {"101": 11, "102": "git commit --dry-run -m capsule"},
      },
    })

    const proposal: ProcessResultProposal = {
      processExecutionId,
      processId: 501,
      fields: {"101": 12},
    }
    const beforeProposal = fixture.messages.length
    send(client, {
      part: "w+",
      op: "replace",
      path: 17,
      by: "energy",
      from: "energy-local",
      value: proposal,
    })
    await settle()
    expect(fixture.messages.slice(beforeProposal).filter((entry) => entry.client === client)).toEqual([])
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(11)
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const beforeConsequence = fixture.messages.length
    send(client, {
      part: "gluon",
      op: "replace",
      path: 17,
      by: "boundary",
      from: processExecutionId,
      value: {fields: {"101": 12}},
    })
    await settle()
    expect(fixture.messages.slice(beforeConsequence).filter((entry) => entry.client === client)).toEqual([])
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(12)
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const commit: ProcessResultCommit = {
      processExecutionId,
      processId: 501,
      energy: "energy-local",
    }
    const fromCommit = fixture.messages.length
    send(client, {
      part: "w+",
      op: "copy",
      path: 17,
      by: "boundary",
      from: processExecutionId,
      value: commit,
    })
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "done", fromCommit)).toEqual({
      part: "photon", op: "replace", path: 17, by: "matrix", ts: expect.any(Number),
      from: expect.any(String), value: "done",
    })
    expect(runtime.matrix$.branes[0]?.lock).toBe(false)
  })

  test("contains no projection evaluator beside packed Weak", async () => {
    const source = await Bun.file(join(import.meta.dir, "matrix.ts")).text()
    expect(source).not.toContain("MatrixProjectionStore")
    expect(source).not.toContain("comparePredicate")
    expect(source).not.toContain("evaluateIncrementalAtom")
    expect(source).toContain("weakRunStep")
    expect(source).not.toContain("MATRIX_RUNTIME_PATH")
    expect(source).not.toContain("loadMatrixRuntimeSnapshot")
    expect(source).toContain("consumePreparedMatrixBirth")
    expect(source).toContain("applyIncrementalMatrixProjection")
    expect(source).not.toContain("reprepareMatrixRuntime")
  })
})
