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
): void {
  const cmd = device.createCommandEncoder()
  cmd.clearBuffer(dirtyFlagsBuffer, 0, dirtyFlagsBuffer.size)

  const pass = cmd.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  const count = statesBuffer.size / 4
  pass.dispatchWorkgroups(Math.ceil(count / 64))
  pass.end()

  device.queue.submit([cmd.finish()])
}
