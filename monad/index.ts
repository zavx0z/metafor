/**
 * Monad — минимальный конечный автомат (модуль).
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
} from "./monad"

export type { MonadConfig, Intention, Intentions, Brane, Update } from "./types"
export type {
  MonadId,
  FieldsStore,
  IntentionsStore,
  ProcessesStore,
  ProcessKey,
  ParamsStore,
  SuperpositionsStore,
  StatesStore,
  UuidToIndexStore,
  IndexToUuidStore,
} from "./monad.t"
export { convertField } from "./field"
export type { Field, FieldType, BraneParamValue } from "@boundary/fields"
export type { FieldDefinition, FieldsDefinition } from "./field"
export type { MonadUpdate, BraneStateChange } from "./monad"
export type { ParsedProcessJson } from "../dsl/build/monadJson"
