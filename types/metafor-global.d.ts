import type {Boundary} from "boundary"
import type {ForceDomain} from "@metafor/types/force/channel"
import type { MetaForFn } from "@metafor/types/metafor/schema"

declare global {
  var boundary: Boundary

  var force: ForceDomain

  var MetaFor: MetaForFn

  interface Window {
    MetaFor: MetaForFn
  }
}

export {}
