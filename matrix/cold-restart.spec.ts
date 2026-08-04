import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import type {Particle, SourcedParticle} from "shared/protocol/force/particle"
import {
  createForceTestFixture,
  type ForceTestClient,
  type ForceTestFixture,
} from "../dark/force/fixture.ts"
import {prepareMatrixBirth} from "./birth.ts"
import {weak$} from "./weak"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
type ParticleInput = Omit<SourcedParticle, "ts"> & {ts?: number}

beforeAll(() => {
  Bun.env.METAFOR_WEAK_BACKEND = "cpu"
})

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
})

const initial = (): BoundaryInitialState => ({
  version: 1,
  pendingProcessExecutions: [{
    executionId: "execution-before-cold-birth",
    atom: 17,
    process: 501,
    state: "ready",
  }],
  atoms: [{
    id: 17,
    wimp: "owner/cold-restart",
    values: [{field: 101, valueId: 1001, value: "payload"}],
    state: 201,
  }],
  declarations: [
    {src: "owner/cold-restart", section: "fields", localId: "1", value: {id: 101, key: "input", type: "string", default: "", position: 0}},
    {src: "owner/cold-restart", section: "states", localId: "1", value: {id: 201, name: "ready", position: 0}},
    {src: "owner/cold-restart", section: "processes", localId: "1", value: {id: 501, key: "ready", state: "ready"}},
  ],
})

const send = (fixture: ForceTestFixture, client: ForceTestClient, particle: ParticleInput): void =>
  fixture.impulse(client, {parts: [{ts: 1, ...particle}] as [Particle]})

describe("Matrix cold Process replacement", () => {
  test("publishes a fresh execution and ignores the old claim", async () => {
    const fixture = createForceTestFixture()
    try {
      weak$.dispose()
      await prepareMatrixBirth(initial())
      const from = fixture.messages.length
      const waiting = fixture.nextClient("matrix")
      const runtime = await import(`./matrix.ts?cold-restart=${crypto.randomUUID()}`)
      const client = await waiting
      const ready = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "photon" && part.op === "test" && part.value === "ready"
      }, from)).message.parts[0]

      expect(ready.from).not.toBe("execution-before-cold-birth")
      expect(runtime.matrix$.branes[0]?.lock).toBe(true)

      const beforeOldClaim = fixture.messages.length
      send(fixture, client, {
        part: "z",
        op: "test",
        path: 17,
        by: "energy",
        value: {energy: "energy-cold", processExecutionId: "execution-before-cold-birth"},
      })
      await Bun.sleep(0)
      await Bun.sleep(0)
      expect(fixture.messages.slice(beforeOldClaim).filter((entry) => entry.client === client)).toEqual([])

      const processExecutionId = String(ready.from)
      const beforeNewClaim = fixture.messages.length
      send(fixture, client, {
        part: "z",
        op: "test",
        path: 17,
        by: "energy",
        value: {energy: "energy-cold", processExecutionId},
      })
      const grant = (await fixture.waitForMessage((entry) => {
        const part = entry.message.parts[0]
        return entry.client === client && part.part === "z" && part.op === "copy"
      }, beforeNewClaim)).message.parts[0]
      expect(grant.value).toEqual({processExecutionId, fields: {"101": "payload"}})
    } finally {
      fixture.close()
    }
  })
})
