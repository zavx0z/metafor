import type { WeakMode } from "./store.t.ts"
import type { MaybeGpuNavigator, WeakBackendPreference } from "./device.t.ts"

function getNavigatorGpu(): MaybeGpuNavigator["gpu"] | undefined {
  const maybeNavigator = (globalThis as { navigator?: MaybeGpuNavigator }).navigator
  return maybeNavigator?.gpu
}

let bunWebGpuBootstrap: Promise<void> | null = null

async function ensureBunWebGpuGlobals(): Promise<void> {
  if (getNavigatorGpu()) return
  if (typeof Bun === "undefined") return

  if (!bunWebGpuBootstrap) {
    bunWebGpuBootstrap = (async () => {
      const module = await import("bun-webgpu")
      module.setupGlobals()
    })().catch((error) => {
      bunWebGpuBootstrap = null
      throw error
    })
  }

  await bunWebGpuBootstrap
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

  if (!getNavigatorGpu()) {
    try {
      await ensureBunWebGpuGlobals()
    } catch {
      return null
    }
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
  const maybeProcess = globalThis as { process?: { env?: Record<string, string | undefined> } }
  const configured = (maybeProcess.process?.env?.METAFOR_WEAK_BACKEND ?? "cpu").toLowerCase() as WeakBackendPreference

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
