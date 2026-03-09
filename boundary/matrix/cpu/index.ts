import type { BoundaryStore } from "../../store"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
import type { CpuRuntimeState } from "./index.t.ts"
import { executeCpuStep } from "./step"
import { createCpuRuntimeState, setCpuStepResult, takeBufferedChanges } from "./state"

export class CPUMatrixRuntime implements MatrixRuntime {
  private readonly store$: BoundaryStore
  private readonly state: CpuRuntimeState

  constructor(store$: BoundaryStore, initialStates: Uint32Array) {
    this.store$ = store$
    this.state = createCpuRuntimeState(initialStates)
  }

  get states(): Uint32Array {
    return this.state.states
  }

  step(): void {
    const result = executeCpuStep(
      this.store$.heap,
      this.store$.braneBlockPtrs,
      this.store$.bytecode,
      this.store$.bytecodeOffsets,
      this.state.states,
    )
    setCpuStepResult(this.state, result.nextStates, result.changes)
  }

  async readChanges(): Promise<MatrixChanges> {
    return takeBufferedChanges(this.state)
  }

  statesSnapshot(): Uint32Array {
    return this.state.states
  }

  heapUpdate(_updates: MatrixHeapUpdate[]): void {
    // CPU runtime использует общий heap из boundary store напрямую.
  }

  clear(): void {
    setCpuStepResult(this.state, new Uint32Array(0), [])
  }
}
