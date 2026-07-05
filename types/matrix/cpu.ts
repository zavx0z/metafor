import type { MatrixStore } from "./store.ts"
import type { WeakChanges } from "./weak.ts"

export interface CpuRuntimeState {
  bufferedChanges: WeakChanges
}

export interface CpuRuntimeContext {
  store$: MatrixStore
}
