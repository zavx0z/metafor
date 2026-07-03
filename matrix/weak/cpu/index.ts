import type { MatrixStore } from "../../store.t"
import type { WeakChanges, WeakHeapUpdate, WeakRuntime } from "../weak.t.ts"
import type { CpuRuntimeContext, CpuRuntimeState } from "./index.t.ts"
import { executeCpuStep } from "./step"
import { StepMode, type StepMode as WeakStepMode } from "../constants"

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
    // CPU runtime читает canonical Matrix store напрямую.
  }

  clear(): void {
    this.context.store$.states = []
    this.state.bufferedChanges = []
  }
}
