import type {Boundary} from "@metafor/boundary"

declare global {
  /**
   * Process-wide handle на boundary (БД). Устанавливается в `dark/server.ts` после `open()`,
   * либо в `dark/index.ts` (worker), либо в тестах через прямое присваивание перед matter()/loadMeta().
   */
  // eslint-disable-next-line no-var
  var boundary: Boundary
}

export {}
