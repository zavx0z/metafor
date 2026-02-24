/**
 * Глобальное GPU-устройство для boundary.
 * Устанавливается в тестах перед созданием экземпляров Boundary.
 */
export const GPU = {
  _device: null as unknown as GPUDevice,

  /**
   * Текущее GPU-устройство.
   * @throws {Error} Если устройство не установлено.
   */
  get device(): GPUDevice {
    if (!this._device) {
      throw new Error("GPU-устройство не установлено.")
    }
    return this._device
  },
}
