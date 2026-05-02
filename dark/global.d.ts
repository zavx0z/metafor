import type {Store} from "../store/index.ts"

declare global {
  /**
   * Process-wide handle на store (БД). Устанавливается в `dark/server.ts` после `open()`,
   * либо в `dark/index.ts` (worker), либо в тестах через прямое присваивание перед matter()/loadMeta().
   */
  // eslint-disable-next-line no-var
  var store: Store
}

export {}
