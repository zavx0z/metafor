/**
 * @boundary/boundary/store — общее хранилище данных для координации между пакетами.
 *
 * @packageDocumentation
 *
 * Хранит данные, которые используют несколько пакетов внутри `@metafor/boundary`.
 *
 * @see {@link BoundaryStore} — тип состояния с документацией полей
 */

export type { BoundaryStore, BoundaryData } from "./store.t.ts"
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
export const boundary$: BoundaryStore = {
  bytecode: null as unknown as Uint32Array,
  bytecodeOffsets: null as unknown as Uint32Array,
  initialStates: null as unknown as Uint32Array,
  heap: null as unknown as Uint32Array,
  braneBlockPtrs: [],
  stringTable: { values: [""] },

  reset() {
    this.bytecode = null as unknown as Uint32Array
    this.bytecodeOffsets = null as unknown as Uint32Array
    this.initialStates = null as unknown as Uint32Array
    this.heap = null as unknown as Uint32Array
    this.braneBlockPtrs = []
    this.stringTable = { values: [""] }
  },

  restore(state: BoundaryStore) {
    this.bytecode = state.bytecode
    this.bytecodeOffsets = state.bytecodeOffsets
    this.initialStates = state.initialStates
    this.heap = state.heap
    this.braneBlockPtrs = state.braneBlockPtrs
    this.stringTable = state.stringTable
  },
}
