export type NodeTreeProjectionRequest<TContext> = Readonly<{
  /** Stable consumer-owned identity for one renderer/theme/viewport context. */
  cacheKey: string
  context: TContext
}>

export type PriorNodeTreeProjection<TProjection> = Readonly<{
  revision: number
  topologyRevision: number
  projection: TProjection
}>

export type NodeTreeProjectionInput<TGeneration, TSnapshot, TContext, TProjection> = Readonly<{
  /** Immutable topology view captured for the exact source revision. */
  tree: TGeneration
  snapshot: TSnapshot
  context: TContext
  /** Last completed projection for the same projector and cache key. */
  previous?: PriorNodeTreeProjection<TProjection>
}>

/**
 * Injected view adapter. The root runtime owns scheduling and caching while the
 * adapter owns concrete measurement, layout and render-plan formats.
 */
export type NodeTreeProjector<TGeneration, TSnapshot, TContext, TProjection> = Readonly<{
  project: (
    input: NodeTreeProjectionInput<TGeneration, TSnapshot, TContext, TProjection>,
  ) => TProjection | Promise<TProjection>
}>
