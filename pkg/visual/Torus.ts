const MIN_RADIUS = 0.001

/**
 * One code-owned Torus cross-section used by fixed-proportion forms such as
 * State. Content-bounded Dark particle forms use the same component with derived
 * inner/outer bounds rather than a second implementation.
 */
export const TORUS_FORM_RATIOS = Object.freeze({
  innerRadius: 0.1112,
})

/** Shared immutable mesh detail for every Torus role in named layouts. */
export const TORUS_MESH_DETAIL = Object.freeze({
  radialSegments: 22,
  tubularSegments: 44,
})

export type TorusForm = Readonly<{
  innerRadius: number
  outerRadius: number
  radius: number
  tube: number
}>

export type TorusPlacement<TPayload, TCore> = Readonly<{
  scale: number
  torus: TorusComponent<TPayload, TCore>
  x: number
  y: number
  z: number
}>

/**
 * Semantic data is payload; self-similarity belongs to this recursive visual
 * component. Atom, State, Fuzzy, Axion and MACHO may own it without becoming
 * form classes.
 */
export type TorusComponent<TPayload, TCore> = Readonly<{
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

export const defineTorusComponent = <TPayload, TCore>(
  input: Readonly<{
    children?: readonly TorusPlacement<TPayload, TCore>[]
    core?: readonly TCore[]
    id: string
    innerRadius: number
    outerRadius: number
    payload: TPayload
    role: string
  }>,
): TorusComponent<TPayload, TCore> => Object.freeze({
  children: Object.freeze([...(input.children ?? [])]),
  core: Object.freeze([...(input.core ?? [])]),
  form: resolveTorusForm(input.innerRadius, input.outerRadius),
  id: input.id,
  payload: input.payload,
  role: input.role,
})
