import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {join} from "node:path"
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
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "owner/process"]],
    actorIdsByWimpSrc: [["owner/process", [17]]],
    runtimeFieldIndexByActorFieldId: [[17, 101, 0]],
  },
  data: {
    fields: [{type: 0}],
    branes: [{
      values: [[0, 0]],
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
    runtimeFieldIndexByWimpFieldId: [[17_101, 0]],
    wimpFieldIdsByRuntimeFieldIndex: [[17_101]],
    braneIndexByWimpFieldId: [[17_101, 0]],
    topologyWimpFieldIds: [],
    topologyActorFieldIds: [],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[201, 202, 203]],
    stateHasProcessByBraneIndex: [[false, true, false]],
  },
})

describe("Matrix packed Force runtime", () => {
  test("loads Boundary bootstrap and executes the Weak process handshake", async () => {
    const waiting = fixture.nextClient("matrix")
    const runtime = await import(`./matrix.ts?packed-force-test=${crypto.randomUUID()}`)
    const client = await waiting
    await settle()

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
    expect(runtime.listMatrixRuntimeActorIds()).toEqual([17])
    expect(weak$.mode).toBe("cpu")

    const fromField = fixture.messages.length
    send(client, {part: "gluon", op: "replace", path: 17, value: {fields: {"101": 11}}})
    expect(await waitForPart(client, (part) => part.part === "photon" && part.op === "test", fromField)).toEqual({
      part: "photon", op: "test", path: 17, value: "ready",
    })

    const fromClaim = fixture.messages.length
    send(client, {part: "z", op: "test", path: 17, value: {energy: "energy-local"}})
    expect(await waitForPart(client, (part) => part.part === "z" && part.op === "copy", fromClaim)).toEqual({
      part: "z", op: "copy", path: 17, from: "energy-local", value: {fields: {"101": 11}},
    })

    const fromResult = fixture.messages.length
    send(client, {part: "w+", op: "replace", path: 17, value: {fields: {"101": 12}}})
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "done", fromResult)).toEqual({
      part: "photon", op: "replace", path: 17, value: "done",
    })
  })

  test("contains no projection evaluator beside packed Weak", async () => {
    const source = await Bun.file(join(import.meta.dir, "matrix.ts")).text()
    expect(source).not.toContain("MatrixProjectionStore")
    expect(source).not.toContain("comparePredicate")
    expect(source).not.toContain("evaluateIncrementalActor")
    expect(source).toContain("weakRunStep")
    expect(source).toContain("MATRIX_RUNTIME_PATH")
  })
})
