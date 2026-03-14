/**
 * `@dark` — публичный API скрытого graph/domain слоя.
 */

export { matter, resetDark, restoreDark, snapshotDark, setMeta, getMeta } from "./dark"
export { dark$ } from "./store"
export type { Address } from "./dark.t"
export type { DarkStore, DarkStoreSnapshot } from "./store.t"
