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
} from "./monad"

export type { MonadConfig } from "./types"
export type { Brane, Action, Update, Actions } from "./types"
export type {
  MonadId,
  FieldsStore,
  ActionsStore,
  ParamsStore,
  SuperpositionsStore,
  StatesStore,
  UuidToIndexStore,
  IndexToUuidStore,
} from "./monad.t"
export { convertField } from "./field"
export type { Field, FieldType, BraneParamValue } from "@boundary/fields"
export type { FieldDefinition, FieldsDefinition } from "./field"
export type { MonadUpdate } from "./monad"
