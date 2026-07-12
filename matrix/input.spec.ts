import {afterAll, beforeAll, describe, expect, test} from "bun:test"
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
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const settle = async (): Promise<void> => {
  await Bun.sleep(0)
  await Bun.sleep(0)
}

const send = (client: ForceTestClient, particle: Particle): void =>
  fixture.impulse(client, {parts: [particle]})

const waitForPart = async (
  client: ForceTestClient,
  predicate: (part: Particle) => boolean,
  from: number,
): Promise<Particle> => {
  const entry = await fixture.waitForMessage(
    (message) => message.client === client && predicate(message.message.parts[0]!),
    from,
  )
  return entry.message.parts[0]!
}

const snapshot = (): MatrixRuntimeSnapshot => ({
  ok: true,
  version: 1,
  runtime: {
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "owner/input"]],
    actorIdsByWimpSrc: [["owner/input", [17]]],
    runtimeFieldIndexByActorFieldId: [[17, 101, 0]],
  },
  data: {
    fields: [{type: 0}],
    branes: [{
      values: [[0, 0]],
      state: STATE_UNDEFINED,
      collapses: [
        [[1, {0: {eq: 1}}]],
        [[2, {0: {eq: 2}}]],
        [],
      ],
    }],
    stateNames: [["idle", "ready", "done"]],
  },
  strong: {
    runtimeFieldIndexByWimpFieldId: [[1, 0]],
    wimpFieldIdsByRuntimeFieldIndex: [[1]],
    braneIndexByWimpFieldId: [[1, 0]],
    topologyWimpFieldIds: [],
    topologyActorFieldIds: [],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[201, 202, 203]],
    stateHasProcessByBraneIndex: [[false, true, false]],
  },
})

describe("Matrix canonical Input boundary", () => {
  test("ignores proposal and applies Boundary consequence with a non-Process origin", async () => {
    const waiting = fixture.nextClient("matrix")
    const runtime = await import(`./matrix.ts?input-test=${crypto.randomUUID()}`)
    const client = await waiting
    await settle()

    let from = fixture.messages.length
    send(client, {part: "graviton", op: "replace", path: MATRIX_RUNTIME_PATH, value: snapshot()})
    await waitForPart(client, (part) => part.part === "photon" && part.value === "idle", from)

    const inputId = "input:matrix-1"
    const beforeProposal = fixture.messages.length
    send(client, {part: "gluon", op: "test", path: 17, from: inputId, value: {fields: {"101": 1}}})
    await settle()
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(0)
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("idle")
    expect(fixture.messages.slice(beforeProposal).filter((entry) => entry.client === client)).toEqual([])

    from = fixture.messages.length
    send(client, {part: "gluon", op: "replace", path: 17, from: inputId, value: {fields: {"101": 1}}})
    const ready = await waitForPart(client, (part) => part.part === "photon" && part.value === "ready", from)
    expect(ready.op).toBe("test")
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(1)
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const beforeLockedInput = fixture.messages.length
    send(client, {
      part: "gluon",
      op: "replace",
      path: 17,
      from: "input:matrix-2",
      value: {fields: {"101": 2}},
    })
    await settle()
    expect(runtime.matrix$.getFieldValue(0, 0)).toBe(2)
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)
    expect(fixture.messages.slice(beforeLockedInput).filter((entry) => entry.client === client)).toEqual([])
  })
})
