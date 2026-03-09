import type { MatrixChanges } from "../matrix.t.ts"
import type { BoundaryStore } from "../../store.t.ts"
import { evaluateBraneNextState } from "./transition"
import { applyStateChange } from "./change"

/**
 * Выполняет шаг эволюции на CPU (оркестрация).
 *
 * Мутабельные параметры: store$.heap, states
 * Возвращаемые значения: nextStates (новая копия), changes (новый массив)
 */
export function executeCpuStep(
  store$: BoundaryStore,
  states: Uint32Array,
): { nextStates: Uint32Array; changes: MatrixChanges } {
  const nextStates = states.slice()
  const changes: MatrixChanges = []

  for (let braneIndex = 0; braneIndex < store$.braneBlockPtrs.length; braneIndex++) {
    const blockPtr = store$.braneBlockPtrs[braneIndex]
    if (blockPtr === undefined) {
      continue
    }

    if ((store$.heap[blockPtr + 2] ?? 0) === 1) {
      continue
    }

    const currentState = states[braneIndex] ?? 0
    const nextState = evaluateBraneNextState(
      store$.heap,
      store$.bytecode,
      store$.bytecodeOffsets[braneIndex] ?? 0,
      blockPtr,
      currentState,
    )

    if (nextState === currentState) {
      continue
    }

    applyStateChange(nextStates, store$.heap, blockPtr, braneIndex, nextState, changes)
  }

  return { nextStates, changes }
}
