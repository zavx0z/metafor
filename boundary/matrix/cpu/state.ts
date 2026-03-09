import type { CpuRuntimeState } from "./index.t.ts"
import type { MatrixChanges } from "../matrix.t.ts"

export function createCpuRuntimeState(initialStates: Uint32Array): CpuRuntimeState {
  return {
    states: initialStates.slice(),
    bufferedChanges: [],
  }
}

/**
 * Устанавливает результат шага (мутирует state$).
 */
export function setCpuStepResult(state$: CpuRuntimeState, nextStates: Uint32Array, changes: MatrixChanges): void {
  state$.states = nextStates
  state$.bufferedChanges = changes
}

/**
 * Забирает буферизованные изменения и очищает буфер (мутирует state$).
 */
export function takeBufferedChanges(state$: CpuRuntimeState): MatrixChanges {
  const changes = state$.bufferedChanges
  state$.bufferedChanges = []
  return changes
}
