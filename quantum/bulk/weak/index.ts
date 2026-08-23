/**
 * `@bulk/weak` — исполнение процессов и intention-реестр Bulk.
 *
 * @packageDocumentation
 */

export {
  registerProcesses,
  getProcessSchema,
} from "./process"

export { weak$, resetWeakStore, restoreWeakStore } from "./store"

export { loadAction } from "./load"

export { executeProcess } from "./execute"
