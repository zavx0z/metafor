import {CenteredNested} from "./CenteredNested.ts"
import {OutsideIn} from "./OutsideIn.ts"
import type {VisualLayout} from "./internal/layout.ts"

/** Public catalog of complete Monad snapshot layouts. */
export const Visual = Object.freeze([
  OutsideIn,
  CenteredNested,
]) satisfies readonly VisualLayout[]

export const visualLayoutForSlug = (
  slug: string,
): VisualLayout | undefined =>
  Visual.find((layout) => layout.slug === slug)
