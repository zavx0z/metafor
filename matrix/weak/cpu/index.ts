import type { CpuRuntimeContext, CpuRuntimeState } from "@metafor/types/matrix/cpu"
import type { MatrixStore } from "@metafor/types/matrix/store"
import type { WeakChanges, WeakHeapUpdate, WeakRuntime, WeakStepMode } from "@metafor/types/matrix/weak"
import { executeCpuStep } from "./step"
import { StepMode } from "../constants"

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

  heapUpdate(_updates: WeakHeapUpdate[]): void {
    // CPU runtime reads the canonical Matrix store directly.
  }

  reconfigure(): void {
    // The canonical store object is stable; structural edits are already visible.
  }

  clear(): void {
    this.context.store$.states = []
    this.state.bufferedChanges = []
  }
}
