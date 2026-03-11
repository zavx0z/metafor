import type { WeakMode } from "./runtime/store.t.ts"
import type { WeakBackendPreference } from "./device.t.ts"

/**
 * GPU Device — определение и загрузка WebGPU устройства для boundary/weak.
 *
 * @packageDocumentation
 *
 * Модуль не должен падать в окружениях без `navigator.gpu` (например, server/runtime).
 * Поэтому инициализация выполняется только по запросу через `ensureGPUDevice()`.
 */

type MaybeGpuNavigator = {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>
  }
}

function getNavigatorGpu(): MaybeGpuNavigator["gpu"] | undefined {
  const maybeNavigator = (globalThis as { navigator?: MaybeGpuNavigator }).navigator
  return maybeNavigator?.gpu
}

/**
 * Глобальное GPU-устройство для boundary.
 * В тестах может устанавливаться напрямую: `GPU._device = ...`.
 */
export const GPU = {
  _device: null as GPUDevice | null,

  /**
   * Текущее GPU-устройство.
   * @throws {Error} Если устройство не установлено.
   */
  get device(): GPUDevice {
    if (!this._device) throw new Error("GPU-устройство не установлено.")
    return this._device
  },
}

/**
 * Пытается получить GPU-устройство из текущей среды.
 * Возвращает `null`, если WebGPU недоступен или инициализация не удалась.
 */
export async function ensureGPUDevice(): Promise<GPUDevice | null> {
  if (GPU._device) {
    return GPU._device
  }

  const gpu = getNavigatorGpu()
  if (!gpu) {
    return null
  }

  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) {
      return null
    }
    GPU._device = await adapter.requestDevice()
    return GPU._device
  } catch {
    return null
  }
}

/**
 * Определяет режим слабой силы по конфигурации и доступности среды.
 */
export async function resolveWeakMode(): Promise<WeakMode> {
  const configured = (process.env.METAFOR_WEAK_BACKEND ?? "cpu").toLowerCase() as WeakBackendPreference

  if (configured === "gpu") {
    const device = await ensureGPUDevice()
    if (!device) {
      throw new Error("METAFOR_WEAK_BACKEND=gpu, но GPU-устройство недоступно в текущей среде.")
    }
    return "gpu"
  }

  if (configured === "auto") {
    const device = await ensureGPUDevice()
    return device ? "gpu" : "cpu"
  }

  return "cpu"
}
