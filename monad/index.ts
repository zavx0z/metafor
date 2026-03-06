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

export type { MonadConfig, Intention, Intentions, Update } from "./types"
export type {
  MonadId,
  FieldsStore,
  IntentionsStore,
  ProcessesStore,
  ParamsStore,
  SuperpositionsStore,
  StatesStore,
  UuidToIndexStore,
  IndexToUuidStore,
} from "./monad.t"
export { convertField } from "./field"
export type { Field, FieldType, BraneValue } from "@boundary/fields"
export type { FieldDefinition, FieldsDefinition } from "./field"
export type { MonadUpdate, BraneStateChange } from "./monad"
export type { ParsedProcessJson } from "../metafor/build/monadJson"
