
/**
 * Параметры инициализации GPU-бэкенда.
 * @internal
 */
export interface BackendInitParams {
  braneCount: number
  bytecode: Uint32Array
  bytecodeOffsets: Uint32Array
  states: Uint32Array
  /** Формат: `[block_ptr0, bytecode_offset0, block_ptr1, bytecode_offset1, ...]` */
  braneDescriptors: Uint32Array
  heap: Uint32Array
}
