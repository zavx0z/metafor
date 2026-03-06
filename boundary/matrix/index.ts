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
 * - `matrixInit()` — инициализация GPU (принимает `boundaryStore$`)
 * - `matrixStep()` — выполнение шага
 * - `matrixReadChanges()` — чтение изменений
 * - `matrixHeapUpdate()` — обновление heap на GPU
 *
 * ## Состояние
 *
 * Хранит только GPU-специфичные данные:
 * - `backend` — GPU-ресурсы (buffers, device)
 *
 * Общие данные (heap, braneBlockPtrs) передаются через `boundaryStore$` в `matrixInit()`.
 *
 * ## Чего НЕ делает
 *
 * - НЕ содержит `write()`/`update()` — это оркестрация в `@boundary/fields`
 * - НЕ хранит heap/braneBlockPtrs — передаются через `boundaryStore$`
 * - НЕ содержит бизнес-логику
 *
 * @example
 * ```typescript
 * import { GPUBackend, GPU, matrixInit, matrixStep } from "@boundary/matrix"
 * import { store as boundaryStore } from "@boundary/store"
 *
 * // Инициализация GPU с инъекцией store$
 * await matrixInit(store$, { ... }, atlasExport, blockPtrs, reserveSize)
 *
 * // Выполнение шага
 * matrixStep()
 * const changes = await matrixReadChanges()
 * ```
 */

export { GPU } from "./device"
export { matrixInit, matrixHeapUpdate, matrixReadChanges, matrixStep } from "./matrix"
export { matrixStoreReset } from "./store.ts"
export type { BoundaryStore } from "@boundary/store"
