/**
 * Weak Force — домен исполнения процессов.
 *
 * @packageDocumentation
 */

export {
  registerProcesses,
  getProcessSchema,
} from "./process"

export { weak$, resetWeakStore, restoreWeakStore } from "./store"
export type { WeakStoreState } from "./store.t"

export { loadAction } from "./load"
export type { LoadConfig } from "./load.t"

export { executeProcess } from "./execute"
export type { ExecutionResult, ProcessParams } from "./execute.t"
