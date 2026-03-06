/**
 * @boundary/matrix — GPU runtime для эволюции суперпозиций.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * Низкоуровневый GPU-драйвер:
 * - `GPUBackend` — класс для управления GPU-ресурсами
 * - `GPU` — глобальное GPU-устройство
 * - `matrixInit()` — инициализация GPU
 * - `matrixStep()` — выполнение шага
 * - `matrixReadChanges()` — чтение изменений
 * - `matrixHeapUpdate()` — обновление heap на GPU
 *
 * ## Состояние
 *
 * Хранит только GPU-специфичные данные:
 * - `backend` — GPU-ресурсы (buffers, device)
 *
 * Общие данные (heap, braneBlockPtrs) вынесены в @boundary/store.
 *
 * ## Чего НЕ делает
 *
 * - НЕ содержит `write()`/`update()` — это оркестрация в `@boundary/fields`
 * - НЕ хранит heap/braneBlockPtrs — это в @boundary/store
 * - НЕ содержит бизнес-логику
 *
 * @example
 * ```typescript
 * import { GPUBackend, GPU, matrixInit, matrixStep } from "@boundary/matrix"
 *
 * // Инициализация GPU
 * await matrixInit({ ... }, atlasExport, blockPtrs, reserveSize)
 *
 * // Выполнение шага
 * matrixStep()
 * const changes = await matrixReadChanges()
 * ```
 */

export { GPU } from "./device"
export { matrixInit, matrixHeapUpdate, matrixReadChanges, matrixStep } from "./matrix"
export { matrixStoreReset } from "./store.ts"
export { storeGet as matrixStoreGet, storeReset } from "@boundary/store"
