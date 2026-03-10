import { ensureGPUDevice, resolveMatrixMode } from "./device"
import type { MatrixRuntimeInitContext, MatrixRuntimeSelection } from "./matrix.t"

/**
 * Создаёт runtime матрицы (CPU/GPU) через динамический импорт.
 */
export async function createMatrixRuntime(context: MatrixRuntimeInitContext): Promise<MatrixRuntimeSelection> {
  const mode = await resolveMatrixMode()

  if (mode === "gpu") {
    const device = await ensureGPUDevice()
    if (!device) {
      throw new Error("GPU mode выбран, но GPU-устройство не инициализировано.")
    }
    const { GPUMatrixRuntime } = await import("./gpu")
    const runtime = await GPUMatrixRuntime.create(device, context.params, context.atlasExport)
    return { mode, runtime }
  }

  const { CPUMatrixRuntime } = await import("./cpu")
  const runtime = new CPUMatrixRuntime(
    {
      heap: context.params.heap,
      blockPtrs: context.params.blockPtrs,
      bytecode: context.params.bytecode,
      bytecodeOffsets: context.params.bytecodeOffsets,
    },
    context.params.states,
  )
  return { mode, runtime }
}
