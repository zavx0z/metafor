import type { MatrixChanges } from "../matrix.t.ts"
import { evaluateBraneNextState } from "./transition"
import { applyStateChange } from "./change"

/**
 * Выполняет шаг эволюции на CPU (оркестрация).
 *
 * Мутабельные параметры: heap$, states$
 * Возвращаемые значения: nextStates (новая копия), changes (новый массив)
 */
export function executeCpuStep(
  heap$: Uint32Array,
  blockPtrs: number[],
  bytecode: Uint32Array,
  bytecodeOffsets: Uint32Array,
  states$: Uint32Array,
): { nextStates: Uint32Array; changes: MatrixChanges } {
  const nextStates = states$.slice()
  const changes: MatrixChanges = []

  for (let braneIndex = 0; braneIndex < blockPtrs.length; braneIndex++) {
    const blockPtr = blockPtrs[braneIndex]
    if (blockPtr === undefined) {
      continue
    }

    if ((heap$[blockPtr + 2] ?? 0) === 1) {
      continue
    }

    const currentState = states$[braneIndex] ?? 0
    const nextState = evaluateBraneNextState(
      heap$,
      bytecode,
      bytecodeOffsets[braneIndex] ?? 0,
      blockPtr,
      currentState,
    )

    if (nextState === currentState) {
      continue
    }

    applyStateChange(nextStates, heap$, blockPtr, braneIndex, nextState, changes)
  }

  return { nextStates, changes }
}
