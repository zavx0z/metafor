import type { MatrixChanges } from "../matrix.t.ts"

/**
 * Применяет изменение состояния браны и ставит lock-флаг в heap.
 *
 * Мутабельные параметры: nextStates$, heap$, changes$
 */
export function applyStateChange(
  nextStates$: Uint32Array,
  heap$: Uint32Array,
  blockPtr: number,
  braneIndex: number,
  nextState: number,
  changes$: MatrixChanges,
): void {
  nextStates$[braneIndex] = nextState
  heap$[blockPtr + 2] = 1
  changes$.push([braneIndex, nextState])
}
