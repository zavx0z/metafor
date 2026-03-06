
/**
 * Параметры инициализации GPU backend.
 * 
 * Содержит все данные необходимые для загрузки в GPU-буферы:
 * - `bytecode` — скомпилированные правила переходов (VM-код)
 * - `bytecodeOffsets` — смещения bytecode для каждой браны
 * - `states` — начальные состояния бран
 * - `braneDescriptors` — дескрипторы бран [block_ptr, bytecode_offset, ...]
 * - `heap` — данные кучи (поля, строки, массивы)
 */
export interface MatrixInitParams {
  /** Bytecode правила переходов */
  bytecode: Uint32Array
  /** Смещения bytecode для каждой браны */
  bytecodeOffsets: Uint32Array
  /** Начальные состояния бран */
  states: Uint32Array
  /** Дескрипторы бран: [block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...] */
  braneDescriptors: Uint32Array
  /** Данные кучи (поля, строки, массивы) */
  heap: Uint32Array
}

/**
 * Состояние Matrix для сериализации.
 */
export interface MatrixStateExport {
  heap: Uint32Array;
  braneBlockPtrs: number[];
  heapAllocOffset: number;
  arrayReserveSize: number;
  arrayDataInvalidated: boolean;
}
