import {afterAll, describe, expect, test} from "bun:test"
import type {
  ProcessExecutionClaim,
  ProcessExecutionGrant,
  ProcessResultCommit,
  ProcessResultProposal,
} from "shared/protocol/force/execution"
import type {Particle, SourcedParticle} from "shared/protocol/force/particle"
import type {BoundaryInitialState} from "@metafor/types/boundary/initial"
import {
  createForceTestFixture,
  type ForceTestClient,
  type ForceTestFixture,
} from "force/fixture"
import {GPU, ensureGPUDevice} from "./weak/device.ts"
import {weak$} from "./weak"
import {prepareMatrixBirth} from "./birth.ts"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
const previousDevice = GPU._device
const PROCESS_ID = 501
const ENERGY_ID = "energy-parity"
type ParticleInput = Omit<SourcedParticle, "ts"> & {ts?: number}

const runtimeInitialState = (): BoundaryInitialState => ({
  version: 1,
  atoms: [{
    id: 17,
    wimp: "owner/parity",
    values: [{field: 101, valueId: 1001, value: 0}, {field: 102, valueId: 1002, value: 0}],
    state: null,
  }],
  declarations: [
    {src: "owner/parity", section: "fields", localId: "1", value: {id: 101, key: "input", type: "number", default: 0, position: 0}},
    {src: "owner/parity", section: "fields", localId: "2", value: {id: 102, key: "output", type: "number", default: 0, position: 1}},
    {src: "owner/parity", section: "states", localId: "1", value: {id: 201, name: "idle", position: 0}},
    {src: "owner/parity", section: "states", localId: "2", value: {id: 202, name: "ready", position: 1}},
    {src: "owner/parity", section: "states", localId: "3", value: {id: 203, name: "complete", position: 2}},
    {src: "owner/parity", section: "transitions", localId: "1", value: {id: 301, fromState: 201, toState: 202, position: 0}},
    {src: "owner/parity", section: "transitions", localId: "2", value: {id: 302, fromState: 202, toState: 203, position: 1}},
    {src: "owner/parity", section: "conditions", localId: "1", value: {id: 401, transition: 301, field: 101, position: 0, predicate: {eq: 1}}},
    {src: "owner/parity", section: "conditions", localId: "2", value: {id: 402, transition: 302, field: 102, position: 1, predicate: {eq: 2}}},
    {src: "owner/parity", section: "processes", localId: "1", value: {id: PROCESS_ID, key: "ready", state: "ready"}},
  ],
})

type RuntimeTrace = {
  mode: "cpu" | "gpu"
  photons: string[]
  locks: boolean[]
  states: string[]
  frozenFields: Record<string, unknown>
}

type MatrixRuntimeModule = typeof import("./matrix.ts")

const settle = async (): Promise<void> => {
  await Bun.sleep(0)
  await Bun.sleep(0)
}

const waitForRuntime = async (predicate: () => boolean, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for Matrix runtime state")
    await Bun.sleep(1)
  }
}

const send = (
  fixture: ForceTestFixture,
  client: ForceTestClient,
  particle: ParticleInput,
): void => fixture.impulse(client, {parts: [{ts: 1, ...particle}] as [Particle]})

const waitForPart = async (
  fixture: ForceTestFixture,
  client: ForceTestClient,
  predicate: (part: Particle) => boolean,
  from: number,
): Promise<Particle> => {
  const entry = await fixture.waitForMessage(
    (message) => message.client === client && predicate(message.message.parts[0]!),
    from,
    10_000,
  )
  return entry.message.parts[0]!
}

const runScenario = async (backend: "cpu" | "gpu"): Promise<RuntimeTrace> => {
  Bun.env.METAFOR_WEAK_BACKEND = backend
  const fixture = createForceTestFixture()

  try {
    await prepareMatrixBirth(runtimeInitialState())
    let from = fixture.messages.length
    const waiting = fixture.nextClient("matrix", 10_000)
    const runtime = await import(`./matrix.ts?runtime-parity=${backend}-${crypto.randomUUID()}`) as MatrixRuntimeModule
    const client = await waiting
    await settle()

    const photons: string[] = []
    const locks: boolean[] = []
    const states: string[] = []
    const recordRuntime = (): void => {
      locks.push(runtime.matrix$.branes[0]?.lock === true)
      const stateIndex = runtime.matrix$.states[0]
      states.push(stateIndex === undefined ? "missing" : runtime.matrix$.getStateName(0, stateIndex) ?? "missing")
    }

    const idle = await waitForPart(
      fixture,
      client,
      (part) => part.part === "photon" && part.value === "idle",
      from,
    )
    photons.push(`${idle.op}:${String(idle.value)}`)
    recordRuntime()

    from = fixture.messages.length
    send(fixture, client, {
      part: "gluon",
      op: "replace",
      path: 17,
      by: "boundary",
      value: {fields: {"101": 1}},
    })
    const ready = await waitForPart(
      fixture,
      client,
      (part) => part.part === "photon" && part.value === "ready",
      from,
    )
    expect(typeof ready.from).toBe("string")
    const processExecutionId = String(ready.from)
    photons.push(`${ready.op}:${String(ready.value)}`)
    recordRuntime()

    const claim: ProcessExecutionClaim = {energy: ENERGY_ID, processExecutionId}
    from = fixture.messages.length
    send(fixture, client, {
      part: "z",
      op: "test",
      path: 17,
      by: "energy",
      value: claim,
    })
    const copy = await waitForPart(
      fixture,
      client,
      (part) => part.part === "z" && part.op === "copy",
      from,
    )
    const grant = copy.value as ProcessExecutionGrant
    expect(copy.from).toBe(ENERGY_ID)
    expect(grant.processExecutionId).toBe(processExecutionId)
    const frozenFields = structuredClone(grant.fields)

    const proposal: ProcessResultProposal = {
      processExecutionId,
      processId: PROCESS_ID,
      fields: {"102": 2},
    }
    send(fixture, client, {
      part: "w+",
      op: "replace",
      path: 17,
      by: "energy",
      from: ENERGY_ID,
      value: proposal,
    })
    await Bun.sleep(10)
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.getFieldValue(0, 1)).toBe(0)
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    send(fixture, client, {
      part: "gluon",
      op: "replace",
      path: 17,
      by: "boundary",
      from: processExecutionId,
      value: {fields: {"102": 2}},
    })
    await waitForRuntime(() => runtime.matrix$.getFieldValue(0, 1) === 2)
    expect(runtime.matrix$.getStateName(0, runtime.matrix$.states[0]!)).toBe("ready")
    expect(runtime.matrix$.branes[0]?.lock).toBe(true)

    const commit: ProcessResultCommit = {
      processExecutionId,
      processId: PROCESS_ID,
      energy: ENERGY_ID,
    }
    from = fixture.messages.length
    send(fixture, client, {
      part: "w+",
      op: "copy",
      path: 17,
      by: "boundary",
      from: processExecutionId,
      value: commit,
    })
    const complete = await waitForPart(
      fixture,
      client,
      (part) => part.part === "photon" && part.value === "complete",
      from,
    )
    photons.push(`${complete.op}:${String(complete.value)}`)
    recordRuntime()

    return {
      mode: weak$.mode,
      photons,
      locks,
      states,
      frozenFields,
    }
  } finally {
    fixture.close()
  }
}

afterAll(() => {
  weak$.dispose()
  if (previousBackend === undefined) delete Bun.env.METAFOR_WEAK_BACKEND
  else Bun.env.METAFOR_WEAK_BACKEND = previousBackend
  if (GPU._device !== previousDevice) GPU._device?.destroy()
  GPU._device = previousDevice
})

describe("Matrix CPU/WebGPU parity", () => {
  test("keeps State, process lock and Photon sequence identical", async () => {
    const cpu = await runScenario("cpu")
    expect(cpu).toEqual({
      mode: "cpu",
      photons: ["replace:idle", "test:ready", "replace:complete"],
      locks: [false, true, false],
      states: ["idle", "ready", "complete"],
      frozenFields: {"101": 1, "102": 0},
    })

    const device = await ensureGPUDevice()
    if (!device) throw new Error("WebGPU adapter is unavailable; strict GPU parity cannot run")

    console.log(`[matrix:parity] WebGPU features=${[...device.features].sort().join(",") || "none"}`)
    const gpu = await runScenario("gpu")

    expect(gpu.mode).toBe("gpu")
    expect(gpu.photons).toEqual(cpu.photons)
    expect(gpu.locks).toEqual(cpu.locks)
    expect(gpu.states).toEqual(cpu.states)
    expect(gpu.frozenFields).toEqual(cpu.frozenFields)
  }, 30_000)
})
