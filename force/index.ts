/**
 * Force — домен бизнес-логики (монады, состояния, намерения).
 *
 * @packageDocumentation
 */

export {
  createMonad,
  deleteMonad,
  updateMonads,
  updateBoundary,
  onStateChange,
  registerProcesses,
  getProcessSchema,
  releaseLock,
  _resetState,
} from "./force"

export { convertField } from "./field"
export type { FieldDefinition, FieldsDefinition, BraneStateChange, MonadUpdate } from "./index.t"
