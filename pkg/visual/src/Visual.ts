import {CenteredNested} from "./CenteredNested.ts"
import {OutsideIn} from "./OutsideIn.ts"
import type {VisualLayout} from "./internal/layout.ts"

/** Public catalog of complete Bulk scene snapshot layouts. */
export const Visual = Object.freeze([
  OutsideIn,
  CenteredNested,
]) satisfies readonly VisualLayout[]

/**
 * Slug resolution for a consumer that ships the whole catalog.
 *
 * The resolver lives with the strategy contract and answers from the strategies
 * that have actually been defined, so importing this module is exactly what
 * makes both of them resolvable. A consumer that ships only `centered-nested`
 * reaches the same function through its own entrypoint and resolves only what
 * it carries.
 */
export {visualLayoutForSlug} from "./internal/layout.ts"
