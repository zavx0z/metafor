/**
 * Weak Store — хранилище процессов.
 *
 * @packageDocumentation
 */

import type { WeakStoreState } from "./store.t"

/**
 * @module weak$ — локальное хранилище WEAK FORCE-домена (процессы).
 *
 * @property processes {@link WeakStoreState.processes|схемы процессов}
 * @see {@link WeakStoreState} — тип состояния
 */
export const weak$: WeakStoreState = {
  processes: new Map(),
}

/**
 * Сбрасывает состояние WEAK FORCE-домена.
 *
 * @param store$ - Стор для сброса.
 */
export function resetWeakStore(store$: WeakStoreState): void {
  store$.processes.clear()
}

/**
 * Восстанавливает состояние WEAK FORCE-домена.
 *
 * @param store$ - Стор для восстановления.
 * @param state - Состояние для восстановления.
 */
export function restoreWeakStore(store$: WeakStoreState, state: WeakStoreState): void {
  store$.processes = state.processes
}
