import type { WeakStepMode } from "@metafor/types/matrix/weak"
import { StepMode } from "../constants"
import { createUniforms } from "./layout"

/**
 * Запускает compute shader для эволюции матрицы на GPU (оркестрация).
 *
 * Мутабельные буферы: dirtyFlagsBuffer, statesBuffer (обновляются in-place в shader)
 */
export function runGpuStep(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  dirtyFlagsBuffer: GPUBuffer,
  statesBuffer: GPUBuffer,
  uniformsBuffer: GPUBuffer,
  braneCount: number,
  mode: WeakStepMode = StepMode.Full,
): void {
  const cmd = device.createCommandEncoder()
  device.queue.writeBuffer(uniformsBuffer, 0, createUniforms(braneCount, mode))
  cmd.clearBuffer(dirtyFlagsBuffer, 0, dirtyFlagsBuffer.size)

  const pass = cmd.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  const count = statesBuffer.size / 4
  pass.dispatchWorkgroups(Math.ceil(count / 64))
  pass.end()

  device.queue.submit([cmd.finish()])
}
