import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {ForceMessage} from "@metafor/types/force/message"
import type {Particle} from "@metafor/types/force/particle"
import {createForceTestFixture, type ForceTestClient, type ForceTestFixture} from "force/fixture"
import {weak$} from "./weak"
import {strong$} from "./strong"

let fixture: ForceTestFixture

beforeAll(() => {
  fixture = createForceTestFixture()
})

afterAll(() => fixture.close())

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const send = (client: ForceTestClient, particle: Particle): void => fixture.impulse(client, {parts: [particle]})

const waitForPart = async (client: ForceTestClient, predicate: (part: Particle) => boolean, from = 0): Promise<Particle> => {
  const entry = await fixture.waitForMessage((message) => message.client === client && predicate(message.message.parts[0]), from)
  return entry.message.parts[0]
}

const startMatrixRuntime = async () => {
  const waiting = fixture.nextClient("matrix")
  const runtime = await import(`./matrix.ts?incremental-test=${crypto.randomUUID()}`)
  const client = await waiting
  await settle()
  return {client, runtime}
}

const startMatrix = async (): Promise<ForceTestClient> => (await startMatrixRuntime()).client

const declaration = (path: string, value: unknown): Particle => ({part: "graviton", op: "add", path, value})

const seedRuntime = (client: ForceTestClient): void => {
  const src = "owner/process"
  for (const particle of [
    declaration(`declaration/${src}/fields/1`, {id: 101, wimp: src, key: "count", type: "number"}),
    declaration(`declaration/${src}/states/1`, {id: 201, wimp: src, name: "idle", position: 0}),
    declaration(`declaration/${src}/states/2`, {id: 202, wimp: src, name: "ready", position: 1}),
    declaration(`declaration/${src}/states/3`, {id: 203, wimp: src, name: "done", position: 2}),
    declaration(`declaration/${src}/transitions/1`, {id: 301, wimp: src, fromState: 201, toState: 202, position: 0}),
    declaration(`declaration/${src}/transitions/2`, {id: 302, wimp: src, fromState: 202, toState: 203, position: 0}),
    declaration(`declaration/${src}/conditions/1`, {id: 401, wimp: src, transition: 301, field: 101, position: 0, predicate: {gt: 10}}),
    declaration(`declaration/${src}/conditions/2`, {id: 402, wimp: src, transition: 302, field: 101, position: 0, predicate: {gt: 11}}),
    declaration(`declaration/${src}/processes/1`, {
      id: 501,
      wimp: src,
      state: "ready",
      descriptor: {type: "action", key: "ready", env: ["server"], action: {src: "./action.ts", readFields: [[101, "count"]]}},
    }),
    declaration("actor/17", {
      actor: {id: 17, parentActor: null, parentTopology: null, wimp: src, position: 0},
      values: [], valueRecords: [], valueItems: [], state: null,
    }),
  ]) send(client, particle)
}

describe("Matrix incremental Force runtime", () => {
  test("builds an actor one entity at a time and executes process handshake", async () => {
    const client = await startMatrix()
    const fromSeed = fixture.messages.length
    seedRuntime(client)
    expect(await waitForPart(client, (part) => part.part === "photon" && part.value === "idle", fromSeed)).toEqual({
      part: "photon", op: "replace", path: 17, value: "idle",
    })

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

  test("ignores replay marker instead of replacing local state", async () => {
    const client = await startMatrix()
    const from = fixture.messages.length
    const replay: ForceMessage = {parts: [{part: "z", op: "test", path: "force/replay/matrix/test"}]}
    fixture.impulse(client, replay)
    await settle()
    expect(fixture.messages.slice(from).filter((entry) => entry.client === client)).toEqual([])
  })

  test("live particle path never disposes the packed backend or clears its projection", async () => {
    let backendDisposals = 0
    const originalDispose = weak$.dispose
    weak$.dispose = () => { backendDisposals++ }
    try {
      const {client, runtime} = await startMatrixRuntime()
      send(client, declaration("actor/71", {
        actor: {id: 71, parentActor: null, parentTopology: null, wimp: "owner/live", position: 0},
        values: [], valueRecords: [], valueItems: [], state: null,
      }))
      await settle()
      const identity = runtime.matrixProjection$.actors.get(71)
      send(client, {part: "z", op: "test", path: "force/replay/matrix/check"})
      await settle()

      expect(backendDisposals).toBe(0)
      expect(runtime.matrixProjection$.actors.get(71)).toBe(identity)
    } finally {
      weak$.dispose = originalDispose
    }
  })
})
