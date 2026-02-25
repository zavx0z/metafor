/**
 * Monad — минимальный конечный автомат (модуль).
 *
 * @packageDocumentation
 */

export {
  createMonad,
  deleteMonad,
  updateMonad,
  updateBoundary,
  onStateChange,
  getGlobalFields,
  getParams,
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
export type { Field } from "@metafor/boundary"
