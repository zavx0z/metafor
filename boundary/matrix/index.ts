/**
 * @boundary/matrix — слой matrix с CPU/GPU адаптерами для boundary runtime.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * - `GPU` — глобальное GPU-устройство
 * - `matrixInit()` — инициализация matrix c выбором среды
 * - `matrixStep()/matrixReadChanges()` — шаг + чтение изменений
 * - `matrixHeapUpdate()` — синхронизация heap с активным адаптером
 *
 * ## Состояние
 *
 * Хранит runtime-состояние:
 * - `mode` — выбранная среда (`cpu`/`gpu`)
 * - `runtime` — выбранная реализация среды
 *
 * Matrix получает canonical `BoundaryStore` целиком и локально выводит из него
 * CPU/GPU execution details.
 *
 * ## Чего НЕ делает
 *
 * - НЕ содержит `write()`/`update()` — это оркестрация в `@boundary/fields`
 * - НЕ хранит canonical stored data отдельно от `boundaryStore$`
 * - НЕ содержит бизнес-логику
 * - НЕ является источником истины для текущего minimal runtime
 *
 * @example
 * ```typescript
 * import { GPU, matrixInit, matrixStep } from "@boundary/matrix"
 * import { boundary$ } from "@boundary/boundary"
 *
 * // Инициализация Matrix из canonical store
 * await matrixInit(boundary$)
 *
 * // Выполнение шага
 * matrixStep()
 * const changes = await matrixReadChanges()
 * ```
 */

export { GPU } from "./device"
export { matrixInit, matrixHeapUpdate, matrixReadChanges, matrixStep, matrixRunStep } from "./matrix"
export { matrixStoreReset } from "./store.ts"
export type { BoundaryStore } from "../store"
