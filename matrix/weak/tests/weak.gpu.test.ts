/**
 * Тесты для GPU runtime weak.
 */
import { afterEach, describe, expect, test } from "bun:test"
import { GPUWeakRuntime } from "../gpu"
import {
  createSimpleBraneFixture,
  createEmptyFixture,
  createMultipleBranesFixture,
  createLockedBraneFixture,
  createFieldUpdateFixture,
  createStringFieldUpdateFixture,
  createArrayFieldUpdateFixture,
  createIsolatedStore,
  setBraneFieldValue,
} from "./shared/fixtures"
import { createExecutableDevice, flushRuntime, skipIfNoGpu } from "./shared/gpu"

async function createGpuRuntimeForFixture(fixture: ReturnType<typeof createSimpleBraneFixture>) {
  const device = await createExecutableDevice()
  if (!device) {
    throw new Error("GPU not available")
  }

  const store = createIsolatedStore(fixture)
  const runtime = await GPUWeakRuntime.create(device, store)
  return { runtime, store }
}

const runtimesToCleanup: Array<{ clear(): void }> = []

function trackRuntime<T extends { clear(): void }>(runtime: T): T {
  runtimesToCleanup.push(runtime)
  return runtime
}

afterEach(async () => {
  const runtimes = runtimesToCleanup.splice(0, runtimesToCleanup.length)
  for (const runtime of runtimes) {
    runtime.clear()
    await flushRuntime(runtime as { pending?: Promise<unknown> })
  }
})

describe("GPU runtime — specific tests", () => {
  test("initializes an empty Matrix store", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    device.pushErrorScope("validation")
    const store = createIsolatedStore(createEmptyFixture())
    const runtime = await GPUWeakRuntime.create(device, store)
    trackRuntime(runtime)
    await device.queue.onSubmittedWorkDone()
    const validationError = await device.popErrorScope()

    expect(runtime.statesSnapshot()).toEqual([])
    expect(validationError).toBeNull()
  })

  test("statesSnapshot returns canonical store snapshot", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)
    trackRuntime(runtime)

    expect(runtime.statesSnapshot()).toEqual([0])
  })

  test("heapUpdate accepts explicit canonical updates", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)
    trackRuntime(runtime)

    expect(() => runtime.heapUpdate([{ kind: "lock", braneIndex: 0, value: false }])).not.toThrow()
  })

  test("clear destroys GPU buffers", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)
    trackRuntime(runtime)

    expect(() => runtime.clear()).not.toThrow()
  })

  test("ошибка отложенной операции сохраняется и выходит на ожидаемой границе", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)
    trackRuntime(runtime)
    const internals = runtime as unknown as {
      schedule(task: () => Promise<void>): void
    }

    internals.schedule(async () => {
      throw new Error("контрольный сбой операции")
    })

    await expect(runtime.readChanges()).rejects.toThrow("контрольный сбой операции")
    expect(runtime.fault()).toContain("контрольный сбой операции")
  })

  test("ошибка проверки WebGPU не превращается в успешный пустой такт", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)
    trackRuntime(runtime)
    const internals = runtime as unknown as {
      schedule(task: () => void): void
    }

    internals.schedule(() => {
      device.createBuffer({size: 4, usage: 0})
    })

    await expect(runtime.readChanges()).rejects.toThrow("Ошибка WebGPU (validation)")
    expect(runtime.fault()).toContain("Ошибка WebGPU (validation)")
  })
})

describe("GPU runtime — scenario tests", () => {
  test("simpleTransition — 1 brane hp > 50", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createSimpleBraneFixture())
    trackRuntime(runtime)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("multipleBranes — 3 branes different conditions", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createMultipleBranesFixture())
    trackRuntime(runtime)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(2)
    expect(changes).toContainEqual([0, 1])
    expect(changes).toContainEqual([2, 1])
  })

  test("lockFlag — locked brane does not transition", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createLockedBraneFixture())
    trackRuntime(runtime)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(0)
  })

  test("fieldUpdate — update canonical field value and verify transition", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createFieldUpdateFixture())
    trackRuntime(runtime)

    runtime.step()
    let changes = await runtime.readChanges()
    expect(changes).toHaveLength(0)

    const heapBufferBefore = (runtime as any).context.buffers.heap
    setBraneFieldValue(store, 0, 0, 100)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    runtime.step()
    changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
    expect((runtime as any).context.buffers.heap).toBe(heapBufferBefore)
  })

  test("string table growth reuses existing string buffers when capacity is enough", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createStringFieldUpdateFixture())
    trackRuntime(runtime)
    const heapBufferBefore = (runtime as any).context.buffers.heap
    const bytecodeBufferBefore = (runtime as any).context.buffers.bytecode
    const statesBufferBefore = (runtime as any).context.buffers.states
    const stringRegistryBefore = (runtime as any).context.buffers.stringRegistry
    const stringHeapBefore = (runtime as any).context.buffers.stringHeap
    const pipelineBefore = (runtime as any).context.pipeline

    setBraneFieldValue(store, 0, 0, "mage" as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toEqual([[0, 1]])
    expect((runtime as any).context.buffers.heap).toBe(heapBufferBefore)
    expect((runtime as any).context.buffers.bytecode).toBe(bytecodeBufferBefore)
    expect((runtime as any).context.buffers.states).toBe(statesBufferBefore)
    expect((runtime as any).context.pipeline).toBe(pipelineBefore)
    expect((runtime as any).context.buffers.stringRegistry).toBe(stringRegistryBefore)
    expect((runtime as any).context.buffers.stringHeap).toBe(stringHeapBefore)
  })

  test("append-only string growth uses incremental string append path", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createStringFieldUpdateFixture())
    trackRuntime(runtime)
    const runtimeInternal = runtime as any
    const stringRegistryBefore = runtimeInternal.context.buffers.stringRegistry
    const stringHeapBefore = runtimeInternal.context.buffers.stringHeap
    const registryWordsBefore = runtimeInternal.context.stringRegistryWords
    const heapWordsBefore = runtimeInternal.context.stringHeapWords
    const registryCapacityBefore = runtimeInternal.context.stringRegistryCapacityWords
    const heapCapacityBefore = runtimeInternal.context.stringHeapCapacityWords

    expect(registryCapacityBefore).toBeGreaterThan(registryWordsBefore)
    expect(heapCapacityBefore).toBeGreaterThan(heapWordsBefore)

    expect(store.stringTable).not.toContain("wizard")

    setBraneFieldValue(store, 0, 0, "wizard" as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    await flushRuntime(runtimeInternal)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toEqual([])
    expect(runtimeInternal.context.buffers.stringRegistry).toBe(stringRegistryBefore)
    expect(runtimeInternal.context.buffers.stringHeap).toBe(stringHeapBefore)
    expect(runtimeInternal.context.stringRegistryWords).toBeGreaterThan(registryWordsBefore)
    expect(runtimeInternal.context.stringHeapWords).toBeGreaterThan(heapWordsBefore)
  })

  test("array growth reuses existing heap buffer when capacity is enough", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createArrayFieldUpdateFixture())
    trackRuntime(runtime)
    const runtimeInternal = runtime as any
    const heapBufferBefore = runtimeInternal.context.buffers.heap
    const braneBlockPtrsBefore = runtimeInternal.context.buffers.braneBlockPtrs
    const bytecodeBufferBefore = runtimeInternal.context.buffers.bytecode
    const statesBufferBefore = runtimeInternal.context.buffers.states
    const stringRegistryBefore = runtimeInternal.context.buffers.stringRegistry
    const pipelineBefore = runtimeInternal.context.pipeline
    const heapWordsBefore = runtimeInternal.context.heapWords
    const heapCapacityBefore = runtimeInternal.context.heapCapacityWords

    expect(heapCapacityBefore).toBeGreaterThan(heapWordsBefore)

    setBraneFieldValue(store, 0, 0, [1, 2] as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    await flushRuntime(runtimeInternal)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toEqual([[0, 1]])
    expect(runtimeInternal.context.buffers.heap).toBe(heapBufferBefore)
    expect(runtimeInternal.context.buffers.braneBlockPtrs).toBe(braneBlockPtrsBefore)
    expect(runtimeInternal.context.buffers.bytecode).toBe(bytecodeBufferBefore)
    expect(runtimeInternal.context.buffers.states).toBe(statesBufferBefore)
    expect(runtimeInternal.context.buffers.stringRegistry).toBe(stringRegistryBefore)
    expect(runtimeInternal.context.pipeline).toBe(pipelineBefore)
    expect(runtimeInternal.context.heapWords).toBeGreaterThan(heapWordsBefore)
  })

  test("array churn reuses freed heap slots via free-list", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createArrayFieldUpdateFixture())
    trackRuntime(runtime)
    const runtimeInternal = runtime as any
    const heapBufferBefore = runtimeInternal.context.buffers.heap
    const valueOffset = runtimeInternal.context.arraySlots.keys().next().value as number

    setBraneFieldValue(store, 0, 0, [1, 2, 3, 4] as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    await flushRuntime(runtimeInternal)
    const heapWordsAfterGrow = runtimeInternal.context.heapWords

    setBraneFieldValue(store, 0, 0, [] as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    await flushRuntime(runtimeInternal)
    expect(runtimeInternal.context.arrayFreeList.length).toBeGreaterThan(0)

    setBraneFieldValue(store, 0, 0, [2, 10] as any)
    runtime.heapUpdate([{ kind: "field", braneIndex: 0, fieldIndex: 0 }])
    await flushRuntime(runtimeInternal)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toEqual([[0, 1]])
    expect(runtimeInternal.context.buffers.heap).toBe(heapBufferBefore)
    expect(runtimeInternal.context.heapWords).toBe(heapWordsAfterGrow)
    const finalPtr = runtimeInternal.context.arraySlots.get(valueOffset)?.ptr
    expect(finalPtr).toBeDefined()
    expect(finalPtr).toBeLessThan(heapWordsAfterGrow)
  })

  test("dirtyFlagsAccuracy — only changed branes reported", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createMultipleBranesFixture())
    trackRuntime(runtime)
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(2)
    const indices = changes.map((change) => change[0])
    expect(indices).toContain(0)
    expect(indices).toContain(2)
    expect(indices).not.toContain(1)
  })

  test("determinism — multiple steps produce consistent results", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createSimpleBraneFixture())
    trackRuntime(runtime)

    runtime.step()
    const changes1 = await runtime.readChanges()

    runtime.step()
    const changes2 = await runtime.readChanges()

    expect(changes1).toHaveLength(1)
    expect(changes2).toHaveLength(0)
  })
})

describe("CPU/GPU parity", () => {
  test("results match — CPU and GPU produce identical changes", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const cpuStore = createIsolatedStore(fixture)
    const gpuStore = createIsolatedStore(fixture)
    const { CPUWeakRuntime } = await import("../cpu")
    const cpuRuntime = new CPUWeakRuntime(cpuStore)
    const gpuRuntime = trackRuntime(await GPUWeakRuntime.create(device, gpuStore))

    cpuRuntime.step()
    gpuRuntime.step()

    const cpuChanges = await cpuRuntime.readChanges()
    const gpuChanges = await gpuRuntime.readChanges()
    const normalize = (changes: Array<[number, number]>) => [...changes].sort((a, b) => a[0] - b[0])

    expect(normalize(gpuChanges)).toEqual(normalize(cpuChanges))

    cpuRuntime.clear()
    gpuRuntime.clear()
  })

  test("multipleBranes parity — CPU and GPU produce identical changes", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createMultipleBranesFixture()
    const cpuStore = createIsolatedStore(fixture)
    const gpuStore = createIsolatedStore(fixture)
    const { CPUWeakRuntime } = await import("../cpu")
    const cpuRuntime = new CPUWeakRuntime(cpuStore)
    const gpuRuntime = trackRuntime(await GPUWeakRuntime.create(device, gpuStore))

    cpuRuntime.step()
    gpuRuntime.step()

    const cpuChanges = await cpuRuntime.readChanges()
    const gpuChanges = await gpuRuntime.readChanges()
    const normalize = (changes: Array<[number, number]>) => [...changes].sort((a, b) => a[0] - b[0])

    expect(normalize(gpuChanges)).toEqual(normalize(cpuChanges))
  })
})
