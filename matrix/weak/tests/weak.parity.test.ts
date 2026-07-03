import { afterEach, describe, expect, test } from "bun:test"
import { CPUWeakRuntime } from "../cpu"
import { GPUWeakRuntime } from "../gpu"
import { STATE_NONE, StepMode } from "../constants"
import type { MatrixStore } from "../../store.t"
import {
  createAlreadyDefinedStateFixture,
  createBranchingFixture,
  createFieldUpdateFixture,
  createIsolatedStore,
  createLockedBraneFixture,
  createMultipleBranesFixture,
  createNoStateGraphFixture,
  createNullableStringPresenceFixture,
  createSimpleBraneFixture,
  createUndefinedStateFixture,
  normalizeChanges,
  setBraneFieldValue,
} from "./shared/fixtures"
import { createExecutableDevice, flushRuntime } from "./shared/gpu"

async function createRuntimePair(fixture: { store: MatrixStore }) {
  const device = await createExecutableDevice()
  if (!device) {
    return null
  }

  const cpuStore = createIsolatedStore(fixture)
  const gpuStore = createIsolatedStore(fixture)
  const cpuRuntime = new CPUWeakRuntime(cpuStore)
  const gpuRuntime = await GPUWeakRuntime.create(device, gpuStore)
  gpuRuntimesToCleanup.push(gpuRuntime)

  return { cpuRuntime, gpuRuntime, cpuStore, gpuStore }
}

const gpuRuntimesToCleanup: Array<{ clear(): void }> = []

afterEach(async () => {
  const runtimes = gpuRuntimesToCleanup.splice(0, gpuRuntimesToCleanup.length)
  for (const runtime of runtimes) {
    runtime.clear()
    await flushRuntime(runtime as { pending?: Promise<unknown> })
  }
})

describe("CPU/GPU parity — canonical cases", () => {
  test("simple case parity", async () => {
    const pair = await createRuntimePair(createSimpleBraneFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
    } finally {
      cpuRuntime.clear()
    }
  })

  test("multiple branes parity", async () => {
    const pair = await createRuntimePair(createMultipleBranesFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
    } finally {
      cpuRuntime.clear()
    }
  })

  test("lock flag parity", async () => {
    const pair = await createRuntimePair(createLockedBraneFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
    } finally {
      cpuRuntime.clear()
    }
  })

  test("field update parity", async () => {
    const fixture = createFieldUpdateFixture()
    const pair = await createRuntimePair(fixture)
    if (!pair) return

    const { cpuRuntime, gpuRuntime, cpuStore, gpuStore } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()
      expect(await cpuRuntime.readChanges()).toEqual([])
      expect(await gpuRuntime.readChanges()).toEqual([])

      setBraneFieldValue(cpuStore, 0, 0, 100)
      setBraneFieldValue(gpuStore, 0, 0, 100)
      gpuRuntime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])

      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
    } finally {
      cpuRuntime.clear()
    }
  })

  test("null=false string transition parity", async () => {
    const fixture = createNullableStringPresenceFixture()
    const pair = await createRuntimePair(fixture)
    if (!pair) return

    const { cpuRuntime, gpuRuntime, cpuStore, gpuStore } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()
      expect(await cpuRuntime.readChanges()).toEqual([])
      expect(await gpuRuntime.readChanges()).toEqual([])

      setBraneFieldValue(cpuStore, 0, 0, "hi")
      setBraneFieldValue(gpuStore, 0, 0, "hi")
      gpuRuntime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])

      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
      expect(cpuChanges).toEqual([[0, 1]])
    } finally {
      cpuRuntime.clear()
    }
  })

  test("undefined state enters first declared state in UndefinedOnly mode", async () => {
    const pair = await createRuntimePair(createUndefinedStateFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime, cpuStore, gpuStore } = pair
    try {
      cpuRuntime.step(StepMode.UndefinedOnly)
      gpuRuntime.step(StepMode.UndefinedOnly)

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
      expect(cpuChanges).toEqual([[0, 0]])
      expect(cpuRuntime.statesSnapshot()).toEqual([0])
      expect(gpuRuntime.statesSnapshot()).toEqual([0])
      expect(cpuStore.getStateName(0, 0)).toBe("born")
      expect(gpuStore.getStateName(0, 0)).toBe("born")
    } finally {
      cpuRuntime.clear()
    }
  })

  test("no state graph keeps fields addressable and emits no weak changes", async () => {
    const pair = await createRuntimePair(createNoStateGraphFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime, cpuStore, gpuStore } = pair
    try {
      setBraneFieldValue(cpuStore, 0, 0, 22)
      setBraneFieldValue(gpuStore, 0, 0, 22)
      gpuRuntime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])

      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
      expect(cpuChanges).toEqual([])
      expect(cpuStore.getFieldValue(0, 0)).toBe(22)
      expect(gpuStore.getFieldValue(0, 0)).toBe(22)
      expect(cpuRuntime.statesSnapshot()).toEqual([STATE_NONE])
      expect(gpuRuntime.statesSnapshot()).toEqual([STATE_NONE])
    } finally {
      cpuRuntime.clear()
    }
  })

  test("UndefinedOnly ignores already defined states and Full starts from the current index", async () => {
    const pair = await createRuntimePair(createAlreadyDefinedStateFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step(StepMode.UndefinedOnly)
      gpuRuntime.step(StepMode.UndefinedOnly)
      expect(await cpuRuntime.readChanges()).toEqual([])
      expect(await gpuRuntime.readChanges()).toEqual([])
      expect(cpuRuntime.statesSnapshot()).toEqual([1])
      expect(gpuRuntime.statesSnapshot()).toEqual([1])

      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
      expect(cpuChanges).toEqual([[0, 2]])
      expect(cpuChanges).not.toContainEqual([0, 0])
    } finally {
      cpuRuntime.clear()
    }
  })

  test("branching parity keeps first matching transition semantics", async () => {
    const pair = await createRuntimePair(createBranchingFixture())
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
      expect(cpuChanges).toEqual([[0, 1]])
    } finally {
      cpuRuntime.clear()
    }
  })

  test("determinism parity with fresh setup", async () => {
    const runOnce = async () => {
      const pair = await createRuntimePair(createSimpleBraneFixture())
      if (!pair) return null

      const { cpuRuntime, gpuRuntime } = pair
      try {
        cpuRuntime.step()
        gpuRuntime.step()
        const cpuFirst = normalizeChanges(await cpuRuntime.readChanges())
        const gpuFirst = normalizeChanges(await gpuRuntime.readChanges())

        cpuRuntime.step()
        gpuRuntime.step()
        const cpuSecond = normalizeChanges(await cpuRuntime.readChanges())
        const gpuSecond = normalizeChanges(await gpuRuntime.readChanges())

        return { cpuFirst, gpuFirst, cpuSecond, gpuSecond }
      } finally {
        cpuRuntime.clear()
      }
    }

    const runA = await runOnce()
    if (!runA) return
    const runB = await runOnce()
    if (!runB) return

    expect(runA.gpuFirst).toEqual(runA.cpuFirst)
    expect(runA.gpuSecond).toEqual(runA.cpuSecond)
    expect(runB.gpuFirst).toEqual(runB.cpuFirst)
    expect(runB.gpuSecond).toEqual(runB.cpuSecond)
    expect(runA).toEqual(runB)
  })
})
