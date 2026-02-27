let device: GPUDevice | null = null

if (navigator.gpu) {
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error("No Adapter")
    device = await adapter.requestDevice()
  } catch (e) {
    console.error("GPU-адаптер не найден:", e)
  }
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
