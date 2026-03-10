import type { BoundaryStore } from "../../store.t"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
import type { CpuRuntimeContext, CpuRuntimeState } from "./index.t.ts"
import { executeCpuStep } from "./step"

export class CPUMatrixRuntime implements MatrixRuntime {
  private readonly context: CpuRuntimeContext
  private readonly state: CpuRuntimeState

  constructor(store: BoundaryStore) {
    this.context = { store }
    this.state = { bufferedChanges: [] }
  }

  step(): void {
    this.state.bufferedChanges = executeCpuStep(this.context)
  }

  async readChanges(): Promise<MatrixChanges> {
    const changes = this.state.bufferedChanges
    this.state.bufferedChanges = []
    return changes
  }

  statesSnapshot(): number[] {
    return [...this.context.store.states]
  }

  heapUpdate(_updates: MatrixHeapUpdate[]): void {
    // CPU runtime читает canonical Boundary store напрямую.
  }

  clear(): void {
    this.context.store.states = []
    this.state.bufferedChanges = []
  }
}
