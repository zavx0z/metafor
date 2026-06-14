import type { GpuReadResult } from "./index.t.ts"

export async function readGpuChanges(
  device: GPUDevice,
  dirtyFlagsBuffer: GPUBuffer,
  statesBuffer: GPUBuffer,
  stagingBuffer: GPUBuffer,
  braneCount: number,
): Promise<GpuReadResult> {
  if (braneCount === 0) {
    return { changes: [], states: [] }
  }

  const cmd = device.createCommandEncoder()

  cmd.copyBufferToBuffer(dirtyFlagsBuffer, 0, stagingBuffer, 0, braneCount * 4)
  cmd.copyBufferToBuffer(statesBuffer, 0, stagingBuffer, braneCount * 4, braneCount * 4)
  device.queue.submit([cmd.finish()])
  await device.queue.onSubmittedWorkDone()

  await stagingBuffer.mapAsync(GPUMapMode.READ)
  const data = new Uint32Array(stagingBuffer.getMappedRange().slice(0))
  const dirtyFlags = data.slice(0, braneCount)
  const states = Array.from(data.slice(braneCount, braneCount * 2))

  const changes: Array<[number, number]> = []
  for (let i = 0; i < braneCount; i++) {
    if (dirtyFlags[i]) {
      changes.push([i, states[i]!])
    }
  }

  stagingBuffer.unmap()
  return { changes, states }
}
