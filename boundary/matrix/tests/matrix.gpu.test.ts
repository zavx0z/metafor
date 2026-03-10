/**
 * Тесты для GPU runtime матрицы.
 */
import { describe, expect, test } from "bun:test"
import { GPUMatrixRuntime } from "../../matrix/gpu"
import {
  createSimpleBraneFixture,
  createMultipleBranesFixture,
  createLockedBraneFixture,
  createFieldUpdateFixture,
  createIsolatedStore,
  setBraneFieldValue,
} from "./shared/fixtures"

async function skipIfNoGpu(): Promise<GPUDevice | null> {
  return await createExecutableDevice()
}

async function createGpuRuntimeForFixture(fixture: ReturnType<typeof createSimpleBraneFixture>) {
  const device = await createExecutableDevice()
  if (!device) {
    throw new Error("GPU not available")
  }

  const store = createIsolatedStore(fixture)
  const runtime = await GPUMatrixRuntime.create(device, store)
  return { runtime, store }
}

let executableDevicePromise: Promise<GPUDevice | null> | null = null

async function createExecutableDevice(): Promise<GPUDevice | null> {
  if (executableDevicePromise) {
    return await executableDevicePromise
  }

  executableDevicePromise = (async () => {
    const device = await createIsolatedDevice()
    if (!device) {
      return null
    }
    return (await canExecuteCompute(device)) ? device : null
  })()

  return await executableDevicePromise
}

async function createIsolatedDevice(): Promise<GPUDevice | null> {
  if (!navigator.gpu) {
    return null
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    return null
  }

  return await adapter.requestDevice()
}

async function canExecuteCompute(device: GPUDevice): Promise<boolean> {
  const shader = `
struct Uniforms { braneCount: u32, _pad0: u32, _pad1: u32, _pad2: u32 }
@group(0) @binding(0) var<storage, read_write> states: array<u32>;
@group(0) @binding(1) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var<storage, read_write> dirty: array<atomic<u32>>;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= uniforms.braneCount) { return; }
  states[id.x] = 1u;
  atomicStore(&dirty[id.x], 1u);
}`

  const module = device.createShaderModule({ code: shader })
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  })

  const states = createU32Buffer(device, new Uint32Array([0]), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
  const dirty = createU32Buffer(device, new Uint32Array([0]), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
  const uniforms = createU32Buffer(device, new Uint32Array([1, 0, 0, 0]), GPUBufferUsage.UNIFORM)
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: states } },
      { binding: 1, resource: { buffer: uniforms } },
      { binding: 2, resource: { buffer: dirty } },
    ],
  })

  const cmd = device.createCommandEncoder()
  cmd.clearBuffer(dirty, 0, dirty.size)
  const pass = cmd.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(1)
  pass.end()
  device.queue.submit([cmd.finish()])
  await device.queue.onSubmittedWorkDone()

  const staging = device.createBuffer({
    size: states.size + dirty.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const readCmd = device.createCommandEncoder()
  readCmd.copyBufferToBuffer(dirty, 0, staging, 0, dirty.size)
  readCmd.copyBufferToBuffer(states, 0, staging, dirty.size, states.size)
  device.queue.submit([readCmd.finish()])
  await device.queue.onSubmittedWorkDone()
  await staging.mapAsync(GPUMapMode.READ)
  const data = new Uint32Array(staging.getMappedRange().slice(0))
  const ok = data[0] === 1 && data[1] === 1
  staging.unmap()

  states.destroy()
  dirty.destroy()
  uniforms.destroy()
  staging.destroy()

  return ok
}

function createU32Buffer(device: GPUDevice, data: Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  new Uint32Array(buffer.getMappedRange()).set(data)
  buffer.unmap()
  return buffer
}

describe("GPU runtime — specific tests", () => {
  test("statesSnapshot returns canonical store snapshot", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)

    expect(runtime.statesSnapshot()).toEqual([0])
  })

  test("heapUpdate rebuilds GPU derived buffers from canonical store", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)

    expect(() => runtime.heapUpdate([])).not.toThrow()
  })

  test("clear destroys GPU buffers", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const fixture = createSimpleBraneFixture()
    const { runtime } = await createGpuRuntimeForFixture(fixture)

    expect(() => runtime.clear()).not.toThrow()
  })
})

describe("GPU runtime — scenario tests", () => {
  test("simpleTransition — 1 brane hp > 50", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createSimpleBraneFixture())
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("multipleBranes — 3 branes different conditions", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createMultipleBranesFixture())
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
    runtime.step()
    const changes = await runtime.readChanges()

    expect(changes).toHaveLength(0)
  })

  test("fieldUpdate — update canonical field value and verify transition", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime, store } = await createGpuRuntimeForFixture(createFieldUpdateFixture())

    runtime.step()
    let changes = await runtime.readChanges()
    expect(changes).toHaveLength(0)

    setBraneFieldValue(store, 0, 0, 100)
    runtime.heapUpdate([])
    runtime.step()
    changes = await runtime.readChanges()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([0, 1])
  })

  test("dirtyFlagsAccuracy — only changed branes reported", async () => {
    const device = await skipIfNoGpu()
    if (!device) return

    const { runtime } = await createGpuRuntimeForFixture(createMultipleBranesFixture())
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
    const { CPUMatrixRuntime } = await import("../../matrix/cpu")
    const cpuRuntime = new CPUMatrixRuntime(cpuStore)
    const gpuRuntime = await GPUMatrixRuntime.create(device, gpuStore)

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
    const { CPUMatrixRuntime } = await import("../../matrix/cpu")
    const cpuRuntime = new CPUMatrixRuntime(cpuStore)
    const gpuRuntime = await GPUMatrixRuntime.create(device, gpuStore)

    cpuRuntime.step()
    gpuRuntime.step()

    const cpuChanges = await cpuRuntime.readChanges()
    const gpuChanges = await gpuRuntime.readChanges()
    const normalize = (changes: Array<[number, number]>) => [...changes].sort((a, b) => a[0] - b[0])

    expect(normalize(gpuChanges)).toEqual(normalize(cpuChanges))
  })
})
