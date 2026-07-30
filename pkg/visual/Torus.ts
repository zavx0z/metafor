const MIN_RADIUS = 0.001

/**
 * One code-owned Torus cross-section used by fixed-proportion forms such as
 * State. Content-bounded Dark particle forms use the same form with derived
 * inner/outer bounds rather than a second implementation.
 */
export const TORUS_FORM_RATIOS = Object.freeze({
  innerRadius: 0.1112,
})

/**
 * Empty root form from the approved Torus study:
 * radius 27.78 mm + tube 22.22 mm = outer radius 50 mm,
 * radius 27.78 mm - tube 22.22 mm = inner radius 5.56 mm.
 */
export const TORUS_LAYOUT_BASELINE = Object.freeze({
  rootOuterRadius: 50,
  rootFieldRadius: 11,
  levelScale: 0.5,
  contentGapToFieldRadius: 0.75,
})

export type TorusMeshDetail = Readonly<{
  radialSegments: number
  tubularSegments: number
}>

/**
 * Large structural Dark shells need a denser cross-section at full-screen
 * scale. This is a fixed component-role law, not camera-dependent LOD.
 */
export const DARK_TORUS_MESH_DETAIL: TorusMeshDetail = Object.freeze({
  radialSegments: 64,
  tubularSegments: 192,
})

/**
 * State and Field-proxy Tori remain compact. Keeping their fixed cross-section
 * avoids multiplying geometry cost across hundreds of embedded forms.
 */
export const EMBEDDED_TORUS_MESH_DETAIL: TorusMeshDetail = Object.freeze({
  radialSegments: 32,
  tubularSegments: 192,
})

export type TorusForm = Readonly<{
  innerRadius: number
  outerRadius: number
  radius: number
  tube: number
}>

export type TorusPlacement<TPayload, TCore> = Readonly<{
  scale: number
  torus: TorusComposition<TPayload, TCore>
  x: number
  y: number
  z: number
}>

/**
 * Internal recursive construction record used while a named layout resolves
 * form bounds. The public production component is VisualTorusComponent; this
 * record does not model the renderer boundary.
 */
export type TorusComposition<TPayload, TCore> = Readonly<{
  children: readonly TorusPlacement<TPayload, TCore>[]
  core: readonly TCore[]
  form: TorusForm
  id: string
  payload: TPayload
  role: string
}>

export const resolveTorusForm = (
  innerRadius: number,
  outerRadius: number,
): TorusForm => {
  const safeInnerRadius = Math.max(
    0,
    Number.isFinite(innerRadius) ? innerRadius : 0,
  )
  const safeOuterRadius = Math.max(
    safeInnerRadius + MIN_RADIUS,
    Number.isFinite(outerRadius) ? outerRadius : 0,
  )
  return Object.freeze({
    innerRadius: safeInnerRadius,
    outerRadius: safeOuterRadius,
    radius: (safeInnerRadius + safeOuterRadius) / 2,
    tube: (safeOuterRadius - safeInnerRadius) / 2,
  })
}

export const resolveSelfSimilarTorusForm = (
  outerRadius: number,
): TorusForm => {
  const safeOuterRadius = Math.max(
    MIN_RADIUS,
    Number.isFinite(outerRadius) ? outerRadius : 0,
  )
  return resolveTorusForm(
    safeOuterRadius * TORUS_FORM_RATIOS.innerRadius,
    safeOuterRadius,
  )
}

export const torusLevelScale = (level: number): number => {
  const safeLevel = Number.isFinite(level)
    ? Math.max(0, Math.floor(level))
    : 0
  return TORUS_LAYOUT_BASELINE.levelScale ** safeLevel
}

export const torusFieldRadiusAtLevel = (level: number): number =>
  TORUS_LAYOUT_BASELINE.rootFieldRadius * torusLevelScale(level)

export const resolveEmptyTorusForm = (level: number): TorusForm =>
  resolveSelfSimilarTorusForm(
    TORUS_LAYOUT_BASELINE.rootOuterRadius * torusLevelScale(level),
  )

/**
 * Grows a Torus around real content without scaling that content down.
 * The empty form supplies the minimum hole, outer radius and radial thickness.
 */
export const resolveContentTorusForm = (
  input: Readonly<{
    coreExtent?: number
    emptyOuterRadius: number
    gap?: number
    occupiedOuterExtent?: number
  }>,
): TorusForm => {
  const empty = resolveSelfSimilarTorusForm(input.emptyOuterRadius)
  const coreExtent = Number.isFinite(input.coreExtent)
    ? Math.max(0, input.coreExtent ?? 0)
    : 0
  const occupiedOuterExtent = Number.isFinite(input.occupiedOuterExtent)
    ? Math.max(0, input.occupiedOuterExtent ?? 0)
    : 0
  const gap = Number.isFinite(input.gap)
    ? Math.max(0, input.gap ?? 0)
    : 0
  const innerRadius = Math.max(
    empty.innerRadius,
    coreExtent > 0 ? coreExtent + gap : 0,
  )
  const emptyRadialThickness = empty.outerRadius - empty.innerRadius
  const outerRadius = Math.max(
    empty.outerRadius,
    innerRadius + emptyRadialThickness,
    occupiedOuterExtent > 0 ? occupiedOuterExtent + gap : 0,
  )
  return resolveTorusForm(innerRadius, outerRadius)
}

export const defineTorusComposition = <TPayload, TCore>(
  input: Readonly<{
    children?: readonly TorusPlacement<TPayload, TCore>[]
    core?: readonly TCore[]
    id: string
    innerRadius: number
    outerRadius: number
    payload: TPayload
    role: string
  }>,
): TorusComposition<TPayload, TCore> => Object.freeze({
  children: Object.freeze([...(input.children ?? [])]),
  core: Object.freeze([...(input.core ?? [])]),
  form: resolveTorusForm(input.innerRadius, input.outerRadius),
  id: input.id,
  payload: input.payload,
  role: input.role,
})
