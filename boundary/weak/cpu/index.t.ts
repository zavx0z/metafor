import type { BoundaryStore } from "../../store.t"
import type { WeakChanges } from "../runtime.t"

export interface CpuRuntimeState {
  bufferedChanges: WeakChanges
}

export interface CpuRuntimeContext {
  store$: BoundaryStore
}
