import type { WeakChanges } from "../runtime.t"
import type { CpuRuntimeContext } from "./index.t.ts"
import { evaluateBraneNextState } from "./transition"

export function executeCpuStep(context: CpuRuntimeContext): WeakChanges {
  const { store$ } = context
  const nextStates = [...store$.states]
  const changes: WeakChanges = []

  for (let braneIndex = 0; braneIndex < store$.branes.length; braneIndex++) {
    const brane = store$.branes[braneIndex]
    if (!brane || brane.lock) {
      continue
    }

    const currentState = store$.states[braneIndex] ?? 0
    const nextState = evaluateBraneNextState(store$, braneIndex)
    if (nextState === currentState) {
      continue
    }

    nextStates[braneIndex] = nextState
    brane.lock = true
    changes.push([braneIndex, nextState])
  }

  store$.states = nextStates
  return changes
}
