/**
 * @boundary/store — общее хранилище данных для координации между packages.
 *
 * @packageDocumentation
 *
 * Хранит данные, которые используют несколько пакетов внутри `@metafor/boundary`.
 *
 * @see {@link BoundaryStore} — тип состояния с документацией полей
 */

export type { BoundaryStore } from "./store.t.ts"
import type { BoundaryStore } from "./store.t.ts"

/**
 * Глобальное состояние для координации между пакетами.
 *
 * @property bytecode {@link BoundaryStore.bytecode|скомпилированные правила переходов FSM}
 * @property bytecodeOffsets {@link BoundaryStore.bytecodeOffsets|смещения bytecode для каждой браны}
 * @property initialStates {@link BoundaryStore.initialStates|начальные состояния бран}
 * @property heap {@link BoundaryStore.heap|данные кучи (heap) для GPU}
 * @property braneBlockPtrs {@link BoundaryStore.braneBlockPtrs|смещения блоков бран в heap}
 *
 * @see {@link BoundaryStore} — тип состояния с документацией полей
 */
export const store: BoundaryStore = {
  bytecode: null as unknown as Uint32Array,
  bytecodeOffsets: null as unknown as Uint32Array,
  initialStates: null as unknown as Uint32Array,
  heap: null as unknown as Uint32Array,
  braneBlockPtrs: [],
}

/**
 * Сбрасывает состояние store (для write() и тестов).
 */
export function storeReset(): void {
  store.bytecode = null as unknown as Uint32Array
  store.bytecodeOffsets = null as unknown as Uint32Array
  store.initialStates = null as unknown as Uint32Array
  store.heap = null as unknown as Uint32Array
  store.braneBlockPtrs = []
}

/**
 * Получает текущее состояние store для сериализации.
 *
 * @returns Текущее состояние для serializeMatrix()
 */
export function storeGet(): BoundaryStore {
  return {
    bytecode: store.bytecode,
    bytecodeOffsets: store.bytecodeOffsets,
    initialStates: store.initialStates,
    heap: store.heap,
    braneBlockPtrs: store.braneBlockPtrs,
  }
}

/**
 * Восстанавливает состояние store из сериализованных данных.
 *
 * @param state - Состояние для восстановления
 */
export function storeRestore(state: BoundaryStore): void {
  store.bytecode = state.bytecode
  store.bytecodeOffsets = state.bytecodeOffsets
  store.initialStates = state.initialStates
  store.heap = state.heap
  store.braneBlockPtrs = state.braneBlockPtrs
}
