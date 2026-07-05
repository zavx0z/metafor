import type { GpuReadResult } from "@metafor/types/matrix"
import { GPU_STATE_NONE, GPU_STATE_UNDEFINED, STATE_NONE, STATE_UNDEFINED } from "../constants"

function decodeGpuState(state: number): number {
  if (state === GPU_STATE_UNDEFINED) return STATE_UNDEFINED
  if (state === GPU_STATE_NONE) return STATE_NONE
  return state
}

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
  const states = Array.from(data.slice(braneCount, braneCount * 2), decodeGpuState)

  const changes: Array<[number, number]> = []
  for (let i = 0; i < braneCount; i++) {
    if (dirtyFlags[i]) {
      changes.push([i, states[i]!])
    }
  }

  stagingBuffer.unmap()
  return { changes, states }
}
