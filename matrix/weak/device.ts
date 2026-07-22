import type {MaybeGpuNavigator} from "@metafor/types/matrix/gpu"
import type {WeakBackendPreference, WeakMode} from "@metafor/types/matrix/weak"

function getNavigatorGpu(): MaybeGpuNavigator["gpu"] | undefined {
  const maybeNavigator = (globalThis as {navigator?: MaybeGpuNavigator}).navigator
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

/** Global WebGPU device used by Matrix and replaceable in tests. */
export const GPU = {
  _device: null as GPUDevice | null,

  get device(): GPUDevice {
    if (!this._device) throw new Error("GPU-устройство не установлено.")
    return this._device
  },
}

/** Returns a WebGPU device, or null when the current environment has no GPU. */
export async function ensureGPUDevice(): Promise<GPUDevice | null> {
  if (GPU._device) return GPU._device

  if (!getNavigatorGpu()) {
    try {
      await ensureBunWebGpuGlobals()
    } catch {
      return null
    }
  }

  const gpu = getNavigatorGpu()
  if (!gpu) return null

  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return null
    GPU._device = await adapter.requestDevice()
    return GPU._device
  } catch {
    return null
  }
}

/**
 * `auto` is the production default: it prefers WebGPU and falls back to CPU.
 * `gpu` explicitly requires WebGPU and fails when it cannot be initialized.
 * `cpu` explicitly selects the fallback/reference backend.
 */
export async function resolveWeakMode(): Promise<WeakMode> {
  const maybeProcess = globalThis as {process?: {env?: Record<string, string | undefined>}}
  return await resolveWeakModeFor(maybeProcess.process?.env?.METAFOR_WEAK_BACKEND, ensureGPUDevice)
}

export async function resolveWeakModeFor(
  preference: string | undefined,
  acquireDevice: () => Promise<GPUDevice | null>,
): Promise<WeakMode> {
  const raw = (preference ?? "auto").trim().toLowerCase()
  const configured: WeakBackendPreference = raw === "gpu" || raw === "cpu" || raw === "auto" ? raw : "auto"

  if (configured === "gpu") {
    const device = await acquireDevice()
    if (!device) {
      throw new Error("METAFOR_WEAK_BACKEND=gpu, но GPU-устройство недоступно в текущей среде.")
    }
    return "gpu"
  }

  if (configured === "auto") {
    const device = await acquireDevice()
    return device ? "gpu" : "cpu"
  }

  return "cpu"
}
