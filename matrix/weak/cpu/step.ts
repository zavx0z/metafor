import type { CpuRuntimeContext, WeakChanges, WeakStepMode } from "@metafor/types/matrix"
import { evaluateBraneNextState } from "./transition"
import { STATE_NONE, STATE_UNDEFINED, StepMode } from "../constants"

export function executeCpuStep(context: CpuRuntimeContext, mode: WeakStepMode = StepMode.Full): WeakChanges {
  const { store$ } = context
  const nextStates = [...store$.states]
  const changes: WeakChanges = []

  for (let braneIndex = 0; braneIndex < store$.branes.length; braneIndex++) {
    const brane = store$.branes[braneIndex]
    if (!brane || brane.lock) {
      continue
    }

    const currentState = store$.states[braneIndex] ?? STATE_NONE
    if (currentState === STATE_NONE) {
      continue
    }

    if (mode === StepMode.UndefinedOnly && currentState !== STATE_UNDEFINED) {
      continue
    }

    if (currentState === STATE_UNDEFINED) {
      nextStates[braneIndex] = 0
      brane.lock = true
      changes.push([braneIndex, 0])
      continue
    }

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
