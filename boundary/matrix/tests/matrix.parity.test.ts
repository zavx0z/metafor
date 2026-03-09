import { describe, expect, test } from "bun:test"
import { resetStringAtlas } from "@boundary/atlas"
import { findFieldOffset, floatToUint } from "../../fields"
import { ensureGPUDevice } from "../../matrix/device"
import { CPUMatrixRuntime } from "../../matrix/cpu"
import { GPUMatrixRuntime } from "../../matrix/gpu"
import {
  createFieldUpdateFixture,
  createCpuRuntimeContext,
  createLockedBraneFixture,
  createMatrixInitParams,
  createMultipleBranesFixture,
  createSimpleBraneFixture,
  normalizeChanges,
} from "./shared/fixtures"

async function createRuntimePair(fixture: ReturnType<typeof createSimpleBraneFixture>) {
  const device = await ensureGPUDevice()
  if (!device) {
    return null
  }

  const cpuRuntime = new CPUMatrixRuntime(createCpuRuntimeContext(fixture), fixture.initialStates)

  resetStringAtlas()
  const params = createMatrixInitParams(fixture)
  const atlasExport = { registry: new Uint32Array([0]), heap: new Uint32Array([0]), count: 0 }
  const gpuRuntime = await GPUMatrixRuntime.create(device, params, atlasExport)

  return { cpuRuntime, gpuRuntime }
}

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
      gpuRuntime.clear()
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
      gpuRuntime.clear()
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
      gpuRuntime.clear()
    }
  })

  test("field update parity", async () => {
    const fixture = createFieldUpdateFixture()
    const pair = await createRuntimePair(fixture)
    if (!pair) return

    const { cpuRuntime, gpuRuntime } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()
      expect(await cpuRuntime.readChanges()).toEqual([])
      expect(await gpuRuntime.readChanges()).toEqual([])

      const blockPtr = fixture.blockPtrs[0]!
      const fieldOffset = findFieldOffset(fixture.heap, blockPtr, 0)
      expect(fieldOffset).not.toBeNull()
      if (fieldOffset === null) return

      fixture.heap[fieldOffset] = floatToUint(100)
      gpuRuntime.heapUpdate([{ offset: fieldOffset, value1: floatToUint(100) }])

      cpuRuntime.step()
      gpuRuntime.step()

      const cpuChanges = await cpuRuntime.readChanges()
      const gpuChanges = await gpuRuntime.readChanges()
      expect(normalizeChanges(gpuChanges)).toEqual(normalizeChanges(cpuChanges))
    } finally {
      cpuRuntime.clear()
      gpuRuntime.clear()
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
        gpuRuntime.clear()
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
