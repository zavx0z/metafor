import type { BoundaryStore } from "../../store.t"
import type { MatrixChanges } from "../matrix.t"

export interface CpuRuntimeState {
  bufferedChanges: MatrixChanges
}

export interface CpuRuntimeContext {
  store$: BoundaryStore
}
