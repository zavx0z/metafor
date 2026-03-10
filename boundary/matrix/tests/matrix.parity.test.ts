import { describe, expect, test } from "bun:test"
import { CPUMatrixRuntime } from "../../matrix/cpu"
import { GPUMatrixRuntime } from "../../matrix/gpu"
import {
  createFieldUpdateFixture,
  createIsolatedStore,
  createLockedBraneFixture,
  createMultipleBranesFixture,
  createSimpleBraneFixture,
  normalizeChanges,
  setBraneFieldValue,
} from "./shared/fixtures"

async function createRuntimePair(fixture: ReturnType<typeof createSimpleBraneFixture>) {
  const device = await createExecutableDevice()
  if (!device) {
    return null
  }

  const cpuStore = createIsolatedStore(fixture)
  const gpuStore = createIsolatedStore(fixture)
  const cpuRuntime = new CPUMatrixRuntime(cpuStore)
  const gpuRuntime = await GPUMatrixRuntime.create(device, gpuStore)

  return { cpuRuntime, gpuRuntime, cpuStore, gpuStore }
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

    const { cpuRuntime, gpuRuntime, cpuStore, gpuStore } = pair
    try {
      cpuRuntime.step()
      gpuRuntime.step()
      expect(await cpuRuntime.readChanges()).toEqual([])
      expect(await gpuRuntime.readChanges()).toEqual([])

      setBraneFieldValue(cpuStore, 0, 0, 100)
      setBraneFieldValue(gpuStore, 0, 0, 100)
      gpuRuntime.heapUpdate([])

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
