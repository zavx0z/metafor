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
} from "./src/monad"

export type { MonadConfig } from "./src/types"
export type { Brane, Action, Update, Actions } from "./src/types"
export type {
  MonadId,
  FieldsStore,
  ActionsStore,
  ParamsStore,
  SuperpositionsStore,
  StatesStore,
  UuidToIndexStore,
  IndexToUuidStore,
} from "./src/monad.t"
export { convertField } from "./src/field"
export type { Field } from "@metafor/boundary"
