/**
 * GPU Device — глобальное WebGPU устройство для boundary.
 *
 * @packageDocumentation
 *
 * **Инициализация:**
 * - Ленивая: при первом импорте модуля
 * - Автоматическая: `navigator.gpu.requestAdapter()`
 *
 * **Использование:**
 * ```typescript
 * import { GPU } from "./device"
 * const device = GPU.device  // Может выбросить Error если GPU недоступен
 * ```
 */

/**
 * Глобальное GPU-устройство (fp.md п.5).
 * Инициализируется лениво при загрузке модуля.
 */
let device: GPUDevice | null = null

if (navigator.gpu) {
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) throw new Error("No Adapter")
  device = await adapter.requestDevice()
}

/**
 * Глобальное GPU-устройство для boundary.
 * Устанавливается в тестах перед созданием экземпляров Boundary.
 */
export const GPU = {
  _device: device as unknown as GPUDevice,

  /**
   * Текущее GPU-устройство.
   * @throws {Error} Если устройство не установлено.
   */
  get device(): GPUDevice {
    if (!this._device) throw new Error("GPU-устройство не установлено.")
    return this._device
  },
}
