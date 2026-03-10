import { ensureGPUDevice, resolveMatrixMode } from "./device"
import type { MatrixRuntimeSelection } from "./matrix.t"
import type { BoundaryStore } from "../store.t"

/**
 * Создаёт runtime матрицы (CPU/GPU) через динамический импорт.
 */
export async function createMatrixRuntime(store$: BoundaryStore): Promise<MatrixRuntimeSelection> {
  const mode = await resolveMatrixMode()

  if (mode === "gpu") {
    const device = await ensureGPUDevice()
    if (!device) {
      throw new Error("GPU mode выбран, но GPU-устройство не инициализировано.")
    }
    const { GPUMatrixRuntime } = await import("./gpu")
    const runtime = await GPUMatrixRuntime.create(device, store$)
    return { mode, runtime }
  }

  const { CPUMatrixRuntime } = await import("./cpu")
  const runtime = new CPUMatrixRuntime(store$)
  return { mode, runtime }
}
