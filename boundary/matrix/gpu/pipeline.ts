import type { GpuBufferMap } from "./index.t.ts"

export function createComputePipeline(device: GPUDevice, shaderSource: string): GPUComputePipeline {
  const module = device.createShaderModule({ code: shaderSource })
  return device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  })
}

export function createBindGroup(device: GPUDevice, pipeline: GPUComputePipeline, buffers: GpuBufferMap): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.braneDescriptors } },
      { binding: 1, resource: { buffer: buffers.heap } },
      { binding: 2, resource: { buffer: buffers.states } },
      { binding: 3, resource: { buffer: buffers.bytecode } },
      { binding: 4, resource: { buffer: buffers.uniforms } },
      { binding: 5, resource: { buffer: buffers.bytecodeOffsets } },
      { binding: 6, resource: { buffer: buffers.stringRegistry } },
      { binding: 7, resource: { buffer: buffers.stringHeap } },
      { binding: 8, resource: { buffer: buffers.dirtyFlags } },
    ],
  })
}
