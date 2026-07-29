import {OutsideIn} from "./OutsideIn.ts"
import type {VisualLayout} from "./internal/layout.ts"

/** Public catalog of complete Monad snapshot layouts. */
export const Visual = Object.freeze([
  OutsideIn,
]) satisfies readonly VisualLayout[]

export const visualLayoutForSlug = (
  slug: string,
): VisualLayout => Visual.find((layout) => layout.slug === slug) ?? OutsideIn
