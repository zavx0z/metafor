/**
 * Поддерживаемые значения переменной окружения выбора среды weak.
 */
export type WeakBackendPreference = "cpu" | "gpu" | "auto"
/**
 * GPU Device — определение и загрузка WebGPU устройства для boundary/weak.
 *
 * @packageDocumentation
 *
 * Модуль не должен падать в окружениях без `navigator.gpu` (например, server/runtime).
 * Поэтому инициализация выполняется только по запросу через `ensureGPUDevice()`.
 */
export type MaybeGpuNavigator = {
  gpu?: {
    requestAdapter: () => Promise<GPUAdapter | null>
  }
}
