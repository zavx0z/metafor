const executableDevicePromiseKey = Symbol.for("@matrix/weak/tests/executable-gpu-device")

export async function skipIfNoGpu(): Promise<GPUDevice | null> {
  return await createExecutableDevice()
}

export async function createExecutableDevice(): Promise<GPUDevice | null> {
  const global = globalThis as typeof globalThis & {
    [executableDevicePromiseKey]?: Promise<GPUDevice | null>
  }
  global[executableDevicePromiseKey] ??= (async () => {
    const device = await createDevice()
    if (!device) {
      return null
    }
    return (await canExecuteCompute(device)) ? device : null
  })()

  return await global[executableDevicePromiseKey]
}

export async function flushRuntime(runtime: { pending?: Promise<unknown> }): Promise<void> {
  const pending = runtime.pending
  if (pending) {
    await pending.catch(() => undefined)
  }
}

async function createDevice(): Promise<GPUDevice | null> {
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
struct Uniforms { braneCount: u32, stepMode: u32, _pad1: u32, _pad2: u32 }
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
