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
  execute,
} from "./monad"

export type { Brane, Action, Update, Actions, MonadConfig } from "./types"
