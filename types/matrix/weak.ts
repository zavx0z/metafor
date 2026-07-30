import type { MatrixStore } from "./store.ts"

export type WeakBackendPreference = "cpu" | "gpu" | "auto"
export type WeakMode = "cpu" | "gpu"

/**
 * Режим одного шага Weak.
 *
 * `1` проверяет обычные Transitions. `2` обрабатывает только
 * `STATE_UNDEFINED` и используется при рождении либо добавлении Atom.
 */
export type WeakStepMode = 1 | 2

export type WeakHeapUpdate =
  | {
      kind: "field"
      braneIndex: number
      fieldIndex: number
    }
  | {
      kind: "lock"
      braneIndex: number
      value: boolean
    }

export type WeakStructuralUpdate = {
  braneIndexes: number[]
  sharedBlockIndexes: number[]
  graphBraneIndexes: number[]
}

export interface WeakChanges extends Array<[number, number]> {}

export interface WeakRuntime {
  /** Ставит один вычислительный шаг в очередь выбранного исполнителя. */
  step(mode?: WeakStepMode): void
  /** Завершает поставленный шаг и возвращает только изменившиеся Branes. */
  readChanges(): Promise<WeakChanges>
  /** Синхронизирует изменённые Fields и lock с исполнителем. */
  heapUpdate(updates: WeakHeapUpdate[]): void
  /** Синхронизирует локально изменённые структурные области. */
  structuralUpdate(update: WeakStructuralUpdate): void
  /** Освобождает принадлежащие исполнителю ресурсы и снимок States. */
  clear(): void
  /** Возвращает последний полностью прочитанный снимок States. */
  statesSnapshot(): number[]
  /**
   * Первая сохранённая причина отказа; `null`, пока исполнитель исправен.
   *
   * WebGPU сохраняет ошибку операции либо потерю устройства. CPU не имеет
   * асинхронного отказа и возвращает `null`.
   */
  fault(): string | null
}

export interface WeakRuntimeSelection {
  mode: WeakMode
  runtime: WeakRuntime
}

export interface WeakStore {
  runtime: WeakRuntime | null
  operationMutex: Promise<void> | null
  initialized: boolean
  mode: WeakMode
  matrix$: MatrixStore | null
  stateMetaStateIdsByBraneIndex: number[][]
  stateHasProcessByBraneIndex: boolean[][]
  dispose(): void
}

export interface WeakStateExport {
  heap: Uint32Array
  blockPtrs: number[]
  heapAllocOffset: number
  arrayReserveSize: number
  arrayDataInvalidated: boolean
}
