import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
import type {ProcessResultCommit, ProcessResultProposal} from "@metafor/types/force/execution"
import type {Particle} from "@metafor/types/force/particle"
import {
  MATRIX_RUNTIME_PATH,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@metafor/types/matrix/runtime"
import {createForceTestFixture, type ForceTestClient, type ForceTestFixture} from "force/fixture"
import {weak$} from "./weak"

let fixture: ForceTestFixture
const previousBackend = Bun.env.METAFOR_WEAK_BACKEND

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

const send = (client: ForceTestClient, particle: Particle): void =>
  fixture.impulse(client, {parts: [particle]})

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

const runtimeSnapshot = (): MatrixRuntimeSnapshot => ({
  ok: true,
  version: 1,
  runtime: {
    atomIdByBraneIndex: [17],
    braneIndexByAtomId: [[17, 0]],
    wimpSrcByAtomId: [[17, "owner/process"]],
    atomIdsByWimpSrc: [["owner/process", [17]]],
    runtimeFieldIndexByAtomFieldId: [[17, 101, 0], [17, 102, 1]],
  },
  data: {
    fields: [{type: 0}, {type: 3}],
    branes: [{
      values: [[0, 0], [1, ""]],
      state: STATE_UNDEFINED,
      collapses: [
        [[1, {0: {gt: 10}}]],
        [[2, {0: {gt: 11}}]],
        [],
      ],
    }],
    stateNames: [["idle", "ready", "done"]],
  },
  strong: {
    runtimeFieldIndexByWimpFieldId: [[1, 0], [2, 1]],
    wimpFieldIdsByRuntimeFieldIndex: [[1], [2]],
    braneIndexByWimpFieldId: [[1, 0], [2, 0]],
    topologyWimpFieldIds: [],
    topologyAtomFieldIds: [],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[201, 202, 203]],
    stateHasProcessByBraneIndex: [[false, true, false]],
  },
})

const emptyRuntimeSnapshot = (): MatrixRuntimeSnapshot => ({
  ok: true,
  version: 1,
  runtime: {
    atomIdByBraneIndex: [],
    braneIndexByAtomId: [],
    wimpSrcByAtomId: [],
    atomIdsByWimpSrc: [],
    runtimeFieldIndexByAtomFieldId: [],
  },
  data: {fields: [], branes: [], stateNames: []},
  strong: {
    runtimeFieldIndexByWimpFieldId: [],
    wimpFieldIdsByRuntimeFieldIndex: [],
    braneIndexByWimpFieldId: [],
    topologyWimpFieldIds: [],
    topologyAtomFieldIds: [],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [],
    stateHasProcessByBraneIndex: [],
  },
})

describe("Matrix packed Force runtime", () => {
  test("waits for Boundary commit before applying Energy W result", async () => {
    const waiting = fixture.nextClient("matrix")
    const runtime = await import(`./matrix.ts?packed-force-test=${crypto.randomUUID()}`)
    const client = await waiting
    await settle()

    send(client, {
      part: "graviton",
      op: "replace",
      path: MATRIX_RUNTIME_PATH,
      value: emptyRuntimeSnapshot(),
    })
    await settle()
    expect(runtime.listMatrixRuntimeAtomIds()).toEqual([])
    expect(weak$.initialized).toBe(true)
    expect(weak$.mode).toBe("cpu")

    const fromBootstrap = fixture.messages.length
    send(client, {
      part: "graviton",
      op: "replace",
      path: MATRIX_RUNTIME_PATH,
      value: runtimeSnapshot(),
    })
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "idle", fromBootstrap)).toEqual({
      part: "photon", op: "replace", path: 17, value: "idle",
    })
    expect(runtime.listMatrixRuntimeAtomIds()).toEqual([17])
    expect(weak$.mode).toBe("cpu")

    const fromField = fixture.messages.length
    send(client, {
      part: "gluon",
      op: "replace",
      path: 17,
      value: {fields: {"101": 11, "102": "git commit --dry-run -m capsule"}},
    })
    const ready = await waitForPart(client, (part) => part.part === "photon" && part.op === "test", fromField)
    expect(ready).toMatchObject({part: "photon", op: "test", path: 17, value: "ready"})
    expect(typeof ready.from).toBe("string")
    const processExecutionId = String(ready.from)
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const fromClaim = fixture.messages.length
    send(client, {
      part: "z",
      op: "test",
      path: 17,
      value: {energy: "energy-local", processExecutionId},
    })
    expect(await waitForPart(client, (part) => part.part === "z" && part.op === "copy", fromClaim)).toEqual({
      part: "z",
      op: "copy",
      path: 17,
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
      from: processExecutionId,
      value: commit,
    })
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "done", fromCommit)).toEqual({
      part: "photon", op: "replace", path: 17, value: "done",
    })
    expect(runtime.matrix$.branes[0]?.lock).toBe(false)
  })

  test("contains no projection evaluator beside packed Weak", async () => {
    const source = await Bun.file(join(import.meta.dir, "matrix.ts")).text()
    expect(source).not.toContain("MatrixProjectionStore")
    expect(source).not.toContain("comparePredicate")
    expect(source).not.toContain("evaluateIncrementalAtom")
    expect(source).toContain("weakRunStep")
    expect(source).toContain("MATRIX_RUNTIME_PATH")
  })
})
