import type { MetaForFn } from "../metafor.t.ts"

declare global {
  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export {}
