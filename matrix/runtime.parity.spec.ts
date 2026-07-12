import {afterAll, describe, expect, test} from "bun:test"
import type {Particle} from "@metafor/types/force/particle"
import {
  MATRIX_RUNTIME_PATH,
  STATE_UNDEFINED,
  type MatrixRuntimeSnapshot,
} from "@metafor/types/matrix/runtime"
import {
  createForceTestFixture,
  type ForceTestClient,
  type ForceTestFixture,
} from "force/fixture"
import {GPU, ensureGPUDevice} from "./weak/device.ts"
import {weak$} from "./weak"

const previousBackend = Bun.env.METAFOR_WEAK_BACKEND
const previousDevice = GPU._device

const runtimeSnapshot = (): MatrixRuntimeSnapshot => ({
  ok: true,
  version: 1,
  runtime: {
    actorIdByBraneIndex: [17],
    braneIndexByActorId: [[17, 0]],
    wimpSrcByActorId: [[17, "owner/parity"]],
    actorIdsByWimpSrc: [["owner/parity", [17]]],
    runtimeFieldIndexByActorFieldId: [
      [17, 101, 0],
      [17, 102, 1],
    ],
  },
  data: {
    fields: [{type: 0}, {type: 0}],
    branes: [{
      values: [[0, 0], [1, 0]],
      state: STATE_UNDEFINED,
      collapses: [
        [[1, {0: {eq: 1}}]],
        [[2, {1: {eq: 2}}]],
        [],
      ],
    }],
    stateNames: [["idle", "ready", "complete"]],
  },
  strong: {
    runtimeFieldIndexByWimpFieldId: [[17_101, 0], [17_102, 1]],
    wimpFieldIdsByRuntimeFieldIndex: [[17_101], [17_102]],
    braneIndexByWimpFieldId: [[17_101, 0], [17_102, 0]],
    topologyWimpFieldIds: [],
    topologyActorFieldIds: [],
  },
  weak: {
    stateMetaStateIdsByBraneIndex: [[201, 202, 203]],
    stateHasProcessByBraneIndex: [[false, true, false]],
  },
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

const send = (
  fixture: ForceTestFixture,
  client: ForceTestClient,
  particle: Particle,
): void => fixture.impulse(client, {parts: [particle]})

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

    let from = fixture.messages.length
    send(fixture, client, {
      part: "graviton",
      op: "replace",
      path: MATRIX_RUNTIME_PATH,
      value: runtimeSnapshot(),
    })
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
      value: {fields: {"101": 1}},
    })
    const ready = await waitForPart(
      fixture,
      client,
      (part) => part.part === "photon" && part.value === "ready",
      from,
    )
    photons.push(`${ready.op}:${String(ready.value)}`)
    recordRuntime()

    from = fixture.messages.length
    send(fixture, client, {
      part: "z",
      op: "test",
      path: 17,
      value: {energy: "energy-parity"},
    })
    const copy = await waitForPart(
      fixture,
      client,
      (part) => part.part === "z" && part.op === "copy",
      from,
    )
    const frozenFields = structuredClone(
      (copy.value as {fields?: Record<string, unknown>} | undefined)?.fields ?? {},
    )

    from = fixture.messages.length
    send(fixture, client, {
      part: "w+",
      op: "replace",
      path: 17,
      value: {fields: {"102": 2}},
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
    if (!device) {
      const message = "WebGPU adapter is unavailable; CPU reference trace passed but GPU parity was not executed"
      if (Bun.env.METAFOR_REQUIRE_GPU === "1") throw new Error(message)
      console.warn(`[matrix:parity] ${message}`)
      return
    }

    console.log(`[matrix:parity] WebGPU features=${[...device.features].sort().join(",") || "none"}`)
    const gpu = await runScenario("gpu")

    expect(gpu.mode).toBe("gpu")
    expect(gpu.photons).toEqual(cpu.photons)
    expect(gpu.locks).toEqual(cpu.locks)
    expect(gpu.states).toEqual(cpu.states)
    expect(gpu.frozenFields).toEqual(cpu.frozenFields)
  }, 30_000)
})
