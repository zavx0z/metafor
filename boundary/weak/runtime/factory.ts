import { ensureGPUDevice, resolveWeakMode } from "../device"
import type { WeakRuntimeSelection } from "../runtime.t"
import type { BoundaryStore } from "../../store.t"

/**
 * Создаёт слабый runtime через выбор CPU/GPU backend-адаптера.
 */
export async function createWeakRuntime(store$: BoundaryStore): Promise<WeakRuntimeSelection> {
  const mode = await resolveWeakMode()

  if (mode === "gpu") {
    const device = await ensureGPUDevice()
    if (!device) {
      throw new Error("GPU mode выбран, но GPU-устройство не инициализировано.")
    }
    const { GPUWeakRuntime } = await import("../gpu")
    const runtime = await GPUWeakRuntime.create(device, store$)
    return { mode, runtime }
  }

  const { CPUWeakRuntime } = await import("../cpu")
  const runtime = new CPUWeakRuntime(store$)
  return { mode, runtime }
}
