import type { MetaForFn } from "@metafor/types/metafor/schema"

declare global {
  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export {}
