import type { BoundaryStore } from "../../store.t"
import type { WeakChanges } from "../weak.t"

export interface CpuRuntimeState {
  bufferedChanges: WeakChanges
}

export interface CpuRuntimeContext {
  store$: BoundaryStore
}
