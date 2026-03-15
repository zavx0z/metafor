/**
 * @dark — production API домена.
 *
 * Экспортирует только основной runtime-функционал.
 * Test-only функции (reset, restore, snapshot) находятся в tests/fixtures.
 */

export { dark$ } from "./store.ts"
export { gravity$ } from "./gravity/store.ts"
export { strong$ } from "./strong/store.ts"

export { matter } from "./dark.ts"
