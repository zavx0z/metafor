import { gravity$ } from "./gravity/store"

export { GravityStore, between, gravity$ } from "./gravity/store"
export type { Atom, AtomInput, OrderKey, Store } from "./gravity/store"

/**
 * Верхнеуровневый Dark store хранит atom metadata (`path`, `meta`, `address`)
 * и связь с meta-schema store. В текущем срезе это прямой alias gravity-layer.
 */
export const dark$ = gravity$
