import type { MatrixChanges } from "../matrix.t.ts"
import type { CpuRuntimeContext } from "./index.t.ts"
import { evaluateBraneNextState } from "./transition"
import { applyStateChange } from "./change"

/**
 * Выполняет шаг эволюции на CPU (оркестрация).
 *
 * Мутабельные параметры: context.heap, states
 * Возвращаемые значения: nextStates (новая копия), changes (новый массив)
 */
export function executeCpuStep(
  context: CpuRuntimeContext,
  states: Uint32Array,
): { nextStates: Uint32Array; changes: MatrixChanges } {
  const nextStates = states.slice()
  const changes: MatrixChanges = []

  for (let braneIndex = 0; braneIndex < context.blockPtrs.length; braneIndex++) {
    const blockPtr = context.blockPtrs[braneIndex]
    if (blockPtr === undefined) {
      continue
    }

    if ((context.heap[blockPtr + 2] ?? 0) === 1) {
      continue
    }

    const currentState = states[braneIndex] ?? 0
    const nextState = evaluateBraneNextState(
      context.heap,
      context.bytecode,
      context.bytecodeOffsets[braneIndex] ?? 0,
      blockPtr,
      currentState,
    )

    if (nextState === currentState) {
      continue
    }

    applyStateChange(nextStates, context.heap, blockPtr, braneIndex, nextState, changes)
  }

  return { nextStates, changes }
}
