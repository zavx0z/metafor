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

export type NodeTreeProjectionInput<TTree, TSnapshot, TContext, TProjection> = Readonly<{
  tree: TTree
  snapshot: TSnapshot
  context: TContext
  /** Last completed projection for the same projector and cache key. */
  previous?: PriorNodeTreeProjection<TProjection>
}>

/**
 * Injected view adapter. The root runtime owns scheduling and caching while the
 * adapter owns concrete measurement, layout and render-plan formats.
 */
export type NodeTreeProjector<TTree, TSnapshot, TContext, TProjection> = Readonly<{
  project(
    input: NodeTreeProjectionInput<TTree, TSnapshot, TContext, TProjection>,
  ): TProjection | Promise<TProjection>
}>
