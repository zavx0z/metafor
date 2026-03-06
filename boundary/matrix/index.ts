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
 * - `_initMatrix()` — инициализация GPU
 * - `_stepMatrix()` — выполнение шага
 * - `_readMatrixChanges()` — чтение изменений
 * - `_updateMatrixHeap()` — обновление heap на GPU
 *
 * ## Состояние
 *
 * Хранит только необходимое для координации с GPU:
 * - `backend` — GPU-ресурсы
 * - `heap` — для поиска смещений полей
 * - `braneBlockPtrs` — для update()
 * - `heapAllocOffset`, `arrayReserveSize`, `arrayDataInvalidated` — tracking ARRAY
 *
 * ## Чего НЕ делает
 *
 * - НЕ содержит `write()`/`update()` — это оркестрация в `@boundary/fields`
 * - НЕ зависит от `@boundary/fields`
 * - НЕ содержит бизнес-логику
 *
 * @example
 * ```typescript
 * import { GPUBackend, GPU, _initMatrix, _stepMatrix } from "@boundary/matrix"
 *
 * // Инициализация GPU
 * await _initMatrix({ ... }, atlasExport, blockPtrs, reserveSize)
 *
 * // Выполнение шага
 * _stepMatrix()
 * const changes = await _readMatrixChanges()
 * ```
 */

export {GPU} from "./device"
export {matrixInit, matrixStateReset, matrixStateGet, matrixHeapUpdate, matrixReadChanges, matrixStep} from "./matrix"