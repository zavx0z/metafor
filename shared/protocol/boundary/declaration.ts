/** Canonical declaration read without source paths, runtime values or Mass bytes. @packageDocumentation */
import type {MetaAddress} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"

export const BOUNDARY_META_READ_METHOD = "boundary.meta.read" as const

/** One Boundary-owned snapshot of the declarations reachable from an installed root. */
export interface BoundaryMetaReadReceipt {
  root: MetaAddress
  declarations: Array<{address: MetaAddress; meta: MetaDSL}>
}
