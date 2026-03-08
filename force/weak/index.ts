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
export type { ProcessConfig } from "./load.t"

export { executeProcess } from "./execute"
export type { ExecuteParams } from "./execute.t"
