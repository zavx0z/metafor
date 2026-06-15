import type {Boundary} from "boundary"
import type { MetaForFn } from "../metafor.t.ts"

declare global {
  var boundary: Boundary

  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export {}
