/**
 * @boundary/store — общее хранилище данных для конечного исполнителя @boundary/matrix.
 *
 * @packageDocumentation
 *
 * ## Ответственность
 *
 * Хранит только данные, необходимые для выполнения операций matrix:
 * - `fields` — определения полей из write()
 * - `bytecode` — скомпилированный bytecode правил переходов
 * - `bytecodeOffsets` — смещения bytecode для каждой браны
 * - `initialStates` — начальные состояния бран
 *
 * ## Принцип работы
 *
 * - Заполняется во время `write()` в @boundary/fields
 * - Используется в `update()` для кодирования значений и поиска полей
 * - Сбрасывается при каждом вызове `write()`
 *
 * ## Ограничения
 *
 * - НЕ содержит данные StringAtlas (интернирование строк)
 * - НЕ содержит GPU-ресурсы (backend, buffers)
 * - НЕ содержит служебные флаги (mutex, invalidated)
 */

import type { Field } from "@boundary/fields"

/**
 * Глобальное состояние для координации между packages.
 *
 * Заполняется в @boundary/fields, используется в @boundary/matrix.
 */
export const store = {
  /** Определения полей из write(). */
  fields: [] as Field[],
  /** Bytecode правила переходов. */
  bytecode: null as Uint32Array | null,
  /** Смещения bytecode для каждой браны. */
  bytecodeOffsets: null as Uint32Array | null,
  /** Начальные состояния бран. */
  initialStates: null as Uint32Array | null,
}

/**
 * Сбрасывает состояние store (для write() и тестов).
 *
 * @internal
 */
export function storeReset(): void {
  store.fields = []
  store.bytecode = null
  store.bytecodeOffsets = null
  store.initialStates = null
}

/**
 * Получает текущее состояние store для сериализации.
 *
 * @returns Текущее состояние для serializeMatrix()
 */
export function storeGet(): StoreStateExport {
  return {
    fields: store.fields,
    bytecode: store.bytecode!,
    bytecodeOffsets: store.bytecodeOffsets!,
    initialStates: store.initialStates!,
  }
}

/**
 * Восстанавливает состояние store из сериализованных данных.
 *
 * @param state - Состояние для восстановления
 * @internal
 */
export function storeRestore(state: StoreStateExport): void {
  store.fields = state.fields
  store.bytecode = state.bytecode
  store.bytecodeOffsets = state.bytecodeOffsets
  store.initialStates = state.initialStates
}

/**
 * Состояние store для экспорта.
 */
export interface StoreStateExport {
  /** Определения полей. */
  fields: Field[]
  /** Bytecode правила переходов. */
  bytecode: Uint32Array
  /** Смещения bytecode для каждой браны. */
  bytecodeOffsets: Uint32Array
  /** Начальные состояния бран. */
  initialStates: Uint32Array
}
