import type { BoundaryStore } from "../../store.t"
import type { MatrixChanges, MatrixHeapUpdate, MatrixRuntime } from "../matrix.t"
import type { CpuRuntimeContext, CpuRuntimeState } from "./index.t.ts"
import { executeCpuStep } from "./step"
import { createCpuRuntimeState, setCpuStepResult, takeBufferedChanges } from "./state"

export class CPUMatrixRuntime implements MatrixRuntime {
  private readonly store: BoundaryStore
  private readonly context: CpuRuntimeContext
  private readonly state: CpuRuntimeState

  constructor(store: BoundaryStore) {
    this.store = store
    this.context = {
      heap: store.heap,
      blockPtrs: store.blockPtrs,
      bytecode: store.bytecode,
      bytecodeOffsets: store.bytecodeOffsets,
    }
    this.state = createCpuRuntimeState(store.states)
    this.store.states = this.state.states
  }

  get states(): Uint32Array {
    return this.state.states
  }

  step(): void {
    const result = executeCpuStep(this.context, this.state.states)
    setCpuStepResult(this.state, result.nextStates, result.changes)
    this.store.states = this.state.states
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
    this.store.states = this.state.states
  }
}
