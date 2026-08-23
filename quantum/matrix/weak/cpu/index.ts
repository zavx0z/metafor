import type { CpuRuntimeContext, CpuRuntimeState } from "@matrix/types/cpu"
import type { MatrixStore } from "@matrix/types/store"
import type { WeakChanges, WeakHeapUpdate, WeakRuntime, WeakStepMode, WeakStructuralUpdate } from "@matrix/types/weak"
import { executeCpuStep } from "./step"
import { StepMode } from "../constants"

/**
 * Эталонный последовательный исполнитель Weak.
 *
 * Он читает Matrix Store напрямую и задаёт наблюдаемую семантику, с которой
 * сравнивается WebGPU: особые начальные States, lock, первый подходящий
 * Transition и список изменившихся Branes.
 */
export class CPUWeakRuntime implements WeakRuntime {
  private readonly context: CpuRuntimeContext
  private readonly state: CpuRuntimeState

  constructor(store$: MatrixStore) {
    this.context = { store$ }
    this.state = { bufferedChanges: [] }
  }

  step(mode: WeakStepMode = StepMode.Full): void {
    this.state.bufferedChanges = executeCpuStep(this.context, mode)
  }

  async readChanges(): Promise<WeakChanges> {
    const changes = this.state.bufferedChanges
    this.state.bufferedChanges = []
    return changes
  }

  statesSnapshot(): number[] {
    return [...this.context.store$.states]
  }

  fault(): string | null { return null }
  heapUpdate(_updates: WeakHeapUpdate[]): void {}
  structuralUpdate(_update: WeakStructuralUpdate): void {}
  clear(): void {
    this.context.store$.states = []
    this.state.bufferedChanges = []
  }
}
