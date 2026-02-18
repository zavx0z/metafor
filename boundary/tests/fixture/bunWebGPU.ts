import { setupGlobals } from "bun-webgpu"

setupGlobals()

/**
 * GPU-устройство для тестов bun-webgpu.
 * Инициализируется один раз и переиспользуется во всех тестах.
 */
let _device: GPUDevice | null = null

/**
 * Инициализирует GPU-устройство для тестирования.
 * Должен быть вызван перед любым тестом, использующим WebGPU.
 */
export async function setupDevice(): Promise<GPUDevice> {
  if (_device) return _device

  if (!navigator.gpu) {
    throw new Error("WebGPU не поддерживается!")
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error("Не удалось получить GPU-адаптер!")
  }

  _device = await adapter.requestDevice()
  return _device
}

/**
 * Возвращает инициализированное GPU-устройство.
 * Выбрасывает ошибку, если устройство не инициализировано.
 */
export function getDevice(): GPUDevice {
  if (!_device) {
    throw new Error("Устройство не инициализировано. Сначала вызовите setupDevice().")
  }
  return _device
}
