import {sameVisualQuantumMaterial} from "./internal/fingerprint.ts"
import type {
  VisualPayloadEdgeBatch,
  VisualPayloadField,
  VisualPayloadFieldProxy,
  VisualPayloadOrbital,
  VisualPayloadTorus,
  VisualPayloadTransitionBatch,
  VisualScenePayload,
} from "./ScenePayload.ts"
import type {VisualPlacementSensitivity} from "./internal/layout.ts"

/**
 * How much visual work one upstream change actually requires.
 *
 * The order is meaningful and monotone in the work each class implies:
 * `none` < `story-control` < `camera` < `effects` < `appearance` < `relations`
 * < `geometry` < `structure`. Correctness always wins over locality — a scope
 * is only narrowed when the narrower scope is provably sufficient, and any
 * unrecognized change escalates to `structure`.
 *
 * - `story-control` moves playback state only; nothing in the scene changes.
 * - `camera` moves the `ViewPoint`; no scene entity changes.
 * - `effects` changes animated or derived overlay state on existing entities.
 * - `appearance` changes color, material or label on existing placements.
 * - `relations` changes relation edges between unchanged placements.
 * - `geometry` moves placements while every identity survives.
 * - `structure` changes the identity set itself.
 */
export type VisualInvalidationScope =
  | "none"
  | "story-control"
  | "camera"
  | "effects"
  | "appearance"
  | "relations"
  | "geometry"
  | "structure"

const SCOPE_RANK: Readonly<Record<VisualInvalidationScope, number>> = {
  none: 0,
  "story-control": 1,
  camera: 2,
  effects: 3,
  appearance: 4,
  relations: 5,
  geometry: 6,
  structure: 7,
}

/** The wider of two scopes. */
export const widenVisualInvalidation = (
  left: VisualInvalidationScope,
  right: VisualInvalidationScope,
): VisualInvalidationScope =>
  SCOPE_RANK[left] >= SCOPE_RANK[right] ? left : right

/**
 * What an upstream change actually touched.
 *
 * A boolean `structural` flag is not enough to decide visual work, because two
 * changes that are equally non-structural upstream can require different visual
 * work depending on the strategy in use. The facet names the fact that moved so
 * a strategy can answer for itself whether its placement law reads it.
 */
export type VisualUpstreamFacet =
  | "appearance"
  | "camera"
  | "current-state"
  | "effect"
  | "field-value"
  | "none"
  | "relation"
  | "story-control"
  | "structure"

/**
 * One upstream change already classified by the projection that applied it.
 *
 * `structural` means the change touched identity, ownership or declaration.
 * `affectedAtomIds` is the upstream closure of Atoms the change reached; it is
 * carried through to the visual Store, which maps it onto visual identities —
 * dropping it is what forces a full rebuild for a one-Atom edit.
 */
export type VisualUpstreamChange = Readonly<{
  affectedAtomIds: readonly number[]
  changed: boolean
  facet: VisualUpstreamFacet
  structural: boolean
}>

/** What a strategy needs to know to classify a non-structural change. */
type VisualPlacementReader = Readonly<{
  placement: VisualPlacementSensitivity
}>

/**
 * Classifies one applied upstream change against the strategy in use.
 *
 * The strategy is required because placement sensitivity is strategy-specific.
 * Under `centered-nested` a Field Value rebinding regroups Fields by canonical
 * Value and relocates a shared group to the highest common owner, so it is a
 * geometry change; under `outside-in` the same rebinding only repaints. A
 * classification that ignored the strategy would leave `centered-nested`
 * rendering markers at coordinates the current Values no longer justify.
 */
export const classifyVisualInvalidation = (
  change: VisualUpstreamChange,
  layout: VisualPlacementReader,
): VisualInvalidationScope => {
  if (!change.changed) return "none"
  if (change.structural) return "structure"
  switch (change.facet) {
    // Nothing semantic moved. Only a caller that already knows this — story
    // playback advancing virtual time, for instance — reports it, and it is
    // exactly the statement "the scene is still current".
    case "none":
      return "none"
    case "story-control":
      return "story-control"
    case "camera":
      return "camera"
    case "effect":
      return "effects"
    case "relation":
      return "relations"
    // Paint on placements nobody moved: a label, a colour, a material.
    case "appearance":
      return "appearance"
    case "field-value":
      return layout.placement.fieldValue ? "geometry" : "appearance"
    case "current-state":
      return layout.placement.currentState ? "geometry" : "appearance"
    // A change nobody named cannot be proven local, so it rebuilds.
    default:
      return "structure"
  }
}

/** Whether a scope can be served without running a strategy's placement law. */
export const visualScopeKeepsPlacements = (
  scope: VisualInvalidationScope,
): boolean => SCOPE_RANK[scope] < SCOPE_RANK.geometry

export type VisualAppearancePatch = Readonly<{
  fieldProxies: readonly VisualPayloadFieldProxy[]
  fields: readonly VisualPayloadField[]
  kind: "visual-appearance-patch"
  orbitals: readonly VisualPayloadOrbital[]
  relationBatches: readonly VisualPayloadEdgeBatch[]
  tori: readonly VisualPayloadTorus[]
  transitionBatches: readonly VisualPayloadEdgeBatch[]
}>

/**
 * One entity class as explicit renderer operations.
 *
 * `removed` carries identities rather than values, because that is all a
 * renderer needs to release the GPU resources it holds for them, and the values
 * themselves are already gone from the payload.
 */
export type VisualEntityDelta<Value> = Readonly<{
  added: readonly Value[]
  removed: readonly string[]
  updated: readonly Value[]
}>

/**
 * An exact structural patch.
 *
 * Emitted when the identity sets differ but both payloads came from the same
 * strategy, so every difference is expressible as an add, an update or a
 * remove. This is what lets a renderer keep the Mesh, geometry buffers,
 * materials and line buffers of every entity the change did not name, instead
 * of tearing the scene down because one Atom appeared.
 */
export type VisualDeltaPatch = Readonly<{
  fieldProxies: VisualEntityDelta<VisualPayloadFieldProxy>
  fields: VisualEntityDelta<VisualPayloadField>
  kind: "visual-delta-patch"
  orbitals: VisualEntityDelta<VisualPayloadOrbital>
  relationBatches: VisualEntityDelta<VisualPayloadEdgeBatch>
  tori: VisualEntityDelta<VisualPayloadTorus>
  transitionBatches: VisualEntityDelta<VisualPayloadTransitionBatch>
}>

export type VisualScenePatch =
  | Readonly<{kind: "visual-none-patch"}>
  | VisualAppearancePatch
  | VisualDeltaPatch
  | Readonly<{kind: "visual-replace-patch"; payload: VisualScenePayload}>

/** Counts of what a patch actually asks a renderer to touch. */
export type VisualPatchSummary = Readonly<{
  fieldProxies: number
  fields: number
  kind: VisualScenePatch["kind"]
  orbitals: number
  relationBatches: number
  tori: number
  total: number
  transitionBatches: number
}>

const samePoint = (
  left: Readonly<{localX: number; localY: number; localZ: number}>,
  right: Readonly<{localX: number; localY: number; localZ: number}>,
): boolean =>
  left.localX === right.localX &&
  left.localY === right.localY &&
  left.localZ === right.localZ

const sameTorus = (
  left: VisualPayloadTorus,
  right: VisualPayloadTorus,
): boolean =>
  samePoint(left, right) &&
  left.radius === right.radius &&
  left.tube === right.tube &&
  left.label === right.label &&
  left.parentDarkParticleId === right.parentDarkParticleId &&
  sameVisualQuantumMaterial(left.material, right.material)

const sameField = (
  left: VisualPayloadField,
  right: VisualPayloadField,
): boolean =>
  samePoint(left, right) &&
  left.radius === right.radius &&
  left.fieldLabel === right.fieldLabel &&
  left.valueId === right.valueId &&
  left.valueText === right.valueText &&
  left.ownerDarkParticleId === right.ownerDarkParticleId &&
  sameVisualQuantumMaterial(left.material, right.material)

const sameForm = (
  left: VisualPayloadOrbital["form"],
  right: VisualPayloadOrbital["form"],
): boolean => {
  if (left.kind !== right.kind) return false
  if (left.kind === "sphere" && right.kind === "sphere") {
    return left.radius === right.radius
  }
  if (left.kind === "torus" && right.kind === "torus") {
    return left.radius === right.radius && left.tube === right.tube
  }
  return false
}

const sameOrbital = (
  left: VisualPayloadOrbital,
  right: VisualPayloadOrbital,
): boolean =>
  samePoint(left, right) &&
  sameForm(left.form, right.form) &&
  left.active === right.active &&
  left.current === right.current &&
  left.label === right.label &&
  left.ownerDarkParticleId === right.ownerDarkParticleId &&
  sameVisualQuantumMaterial(left.material, right.material)

const sameFieldProxy = (
  left: VisualPayloadFieldProxy,
  right: VisualPayloadFieldProxy,
): boolean =>
  samePoint(left, right) &&
  sameForm(left.form, right.form) &&
  left.visualFieldParticleId === right.visualFieldParticleId &&
  left.ownerDarkParticleId === right.ownerDarkParticleId &&
  sameVisualQuantumMaterial(left.material, right.material)

const changedEntries = <Value>(
  current: readonly Value[],
  next: readonly Value[],
  identity: (value: Value) => string,
  same: (left: Value, right: Value) => boolean,
): readonly Value[] => {
  const currentById = new Map(current.map((value) => [identity(value), value]))
  return Object.freeze(next.filter((value) => {
    const previous = currentById.get(identity(value))
    return previous === undefined || !same(previous, value)
  }))
}

/**
 * Line batches whose fingerprint moved. An unchanged fingerprint proves the
 * batch is byte-identical, so its GPU buffer can be kept.
 */
const changedBatches = (
  current: readonly VisualPayloadEdgeBatch[],
  next: readonly VisualPayloadEdgeBatch[],
): readonly VisualPayloadEdgeBatch[] => {
  const currentById = new Map(
    current.map((batch) => [batch.batchId, batch] as const),
  )
  return Object.freeze(next.filter((batch) =>
    currentById.get(batch.batchId)?.fingerprint !== batch.fingerprint
  ))
}

const sameIdentitySet = <Value>(
  current: readonly Value[],
  next: readonly Value[],
  identity: (value: Value) => string,
): boolean => {
  if (current.length !== next.length) return false
  const currentIds = new Set(current.map(identity))
  return next.every((value) => currentIds.has(identity(value)))
}

const torusId = (torus: VisualPayloadTorus): string =>
  String(torus.darkParticleId)
const fieldId = (field: VisualPayloadField): string => field.fieldParticleId
const orbitalId = (orbital: VisualPayloadOrbital): string =>
  orbital.orbitalParticleId
const fieldProxyId = (proxy: VisualPayloadFieldProxy): string =>
  proxy.fieldProxyId
const batchId = (batch: VisualPayloadEdgeBatch): string => batch.batchId

/** Explicit add / update / remove for one entity class. */
const entityDelta = <Value>(
  current: readonly Value[],
  next: readonly Value[],
  identity: (value: Value) => string,
  same: (left: Value, right: Value) => boolean,
): VisualEntityDelta<Value> => {
  const currentById = new Map(current.map((value) => [identity(value), value]))
  const added: Value[] = []
  const updated: Value[] = []
  const nextIds = new Set<string>()
  for (const value of next) {
    const id = identity(value)
    nextIds.add(id)
    const previous = currentById.get(id)
    if (previous === undefined) added.push(value)
    else if (!same(previous, value)) updated.push(value)
  }
  const removed = [...currentById.keys()].filter((id) => !nextIds.has(id))
  return Object.freeze({
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    updated: Object.freeze(updated),
  })
}

/**
 * A batch changes exactly when its fingerprint changes, so batch deltas compare
 * the digest instead of several hundred thousand sampled coordinates.
 */
const sameBatch = (
  left: VisualPayloadEdgeBatch,
  right: VisualPayloadEdgeBatch,
): boolean => left.fingerprint === right.fingerprint

/** Facts a delta cannot express, because they re-specify every mesh at once. */
const sameGlobalPayloadShape = (
  current: VisualScenePayload,
  next: VisualScenePayload,
): boolean =>
  current.layoutSlug === next.layoutSlug &&
  current.stats.rootSrc === next.stats.rootSrc &&
  current.darkTorusMeshDetail.radialSegments ===
    next.darkTorusMeshDetail.radialSegments &&
  current.darkTorusMeshDetail.tubularSegments ===
    next.darkTorusMeshDetail.tubularSegments &&
  current.embeddedTorusMeshDetail.radialSegments ===
    next.embeddedTorusMeshDetail.radialSegments &&
  current.embeddedTorusMeshDetail.tubularSegments ===
    next.embeddedTorusMeshDetail.tubularSegments &&
  current.sphereMeshDetail.widthSegments ===
    next.sphereMeshDetail.widthSegments &&
  current.sphereMeshDetail.heightSegments ===
    next.sphereMeshDetail.heightSegments

/**
 * Reconciles two payloads of the same strategy into explicit operations.
 *
 * Identity membership decides the operation, not the patch kind: an entity the
 * next payload does not carry is removed by identity, a new identity is added
 * with its full value, and a surviving identity whose rendered values moved is
 * updated. Everything else is absent from the patch, which is exactly the
 * statement "keep what you already have on the GPU".
 */
export const diffVisualScenePayload = (
  current: VisualScenePayload,
  next: VisualScenePayload,
): VisualDeltaPatch => Object.freeze({
  fieldProxies: entityDelta(
    current.fieldProxies,
    next.fieldProxies,
    fieldProxyId,
    sameFieldProxy,
  ),
  fields: entityDelta(current.fields, next.fields, fieldId, sameField),
  kind: "visual-delta-patch",
  orbitals: entityDelta(current.orbitals, next.orbitals, orbitalId, sameOrbital),
  relationBatches: entityDelta(
    current.relationBatches,
    next.relationBatches,
    batchId,
    sameBatch,
  ),
  tori: entityDelta(current.tori, next.tori, torusId, sameTorus),
  transitionBatches: entityDelta(
    current.transitionBatches,
    next.transitionBatches,
    batchId,
    sameBatch,
  ),
})

/** How many operations one delta patch actually asks for. */
export const visualDeltaPatchOperations = (
  patch: VisualDeltaPatch,
): Readonly<{added: number; removed: number; updated: number}> => {
  const classes = [
    patch.tori,
    patch.fields,
    patch.orbitals,
    patch.fieldProxies,
    patch.transitionBatches,
    patch.relationBatches,
  ] as const
  return Object.freeze({
    added: classes.reduce((total, entry) => total + entry.added.length, 0),
    removed: classes.reduce((total, entry) => total + entry.removed.length, 0),
    updated: classes.reduce((total, entry) => total + entry.updated.length, 0),
  })
}

/**
 * Whether two payloads describe the same set of visual entities. Identity
 * membership — not position — decides whether a narrow patch is even legal: a
 * renderer can update a shape it already owns, but it cannot infer that a shape
 * was added or removed from a list of changed values.
 */
export const sameVisualPayloadIdentities = (
  current: VisualScenePayload,
  next: VisualScenePayload,
): boolean =>
  current.layoutSlug === next.layoutSlug &&
  sameIdentitySet(current.tori, next.tori, torusId) &&
  sameIdentitySet(current.fields, next.fields, fieldId) &&
  sameIdentitySet(current.orbitals, next.orbitals, orbitalId) &&
  sameIdentitySet(current.fieldProxies, next.fieldProxies, fieldProxyId) &&
  sameIdentitySet(
    current.transitionBatches,
    next.transitionBatches,
    batchId,
  ) &&
  sameIdentitySet(current.relationBatches, next.relationBatches, batchId)

/**
 * Reconciles two payloads into the narrowest correct patch.
 *
 * Three outcomes, in order of locality. Matching identity sets give an
 * appearance patch carrying only entities whose rendered values moved.
 * Differing identity sets under one strategy and one mesh specification give an
 * explicit delta — add, update and remove by identity — because that is enough
 * to bring the scene up to date without touching anything else. Only a change
 * that re-specifies the whole scene (another strategy, another Monad root,
 * another mesh detail law) falls back to a replacement, since there every shape
 * genuinely has to be rebuilt.
 */
export const reconcileVisualScenePayload = (
  current: VisualScenePayload | null,
  next: VisualScenePayload,
): VisualScenePatch => {
  if (current === null || !sameGlobalPayloadShape(current, next)) {
    return Object.freeze({kind: "visual-replace-patch", payload: next})
  }
  if (!sameVisualPayloadIdentities(current, next)) {
    return diffVisualScenePayload(current, next)
  }
  const patch = Object.freeze({
    fieldProxies: changedEntries(
      current.fieldProxies,
      next.fieldProxies,
      fieldProxyId,
      sameFieldProxy,
    ),
    fields: changedEntries(current.fields, next.fields, fieldId, sameField),
    kind: "visual-appearance-patch",
    orbitals: changedEntries(
      current.orbitals,
      next.orbitals,
      orbitalId,
      sameOrbital,
    ),
    relationBatches: changedBatches(
      current.relationBatches,
      next.relationBatches,
    ),
    tori: changedEntries(current.tori, next.tori, torusId, sameTorus),
    transitionBatches: changedBatches(
      current.transitionBatches,
      next.transitionBatches,
    ),
  } as const satisfies VisualAppearancePatch)
  return summarizeVisualScenePatch(patch).total === 0
    ? Object.freeze({kind: "visual-none-patch"})
    : patch
}

/** Counts what one patch touches, for diagnostics and tests. */
export const summarizeVisualScenePatch = (
  patch: VisualScenePatch,
): VisualPatchSummary => {
  if (patch.kind === "visual-none-patch") {
    return Object.freeze({
      fieldProxies: 0,
      fields: 0,
      kind: patch.kind,
      orbitals: 0,
      relationBatches: 0,
      tori: 0,
      total: 0,
      transitionBatches: 0,
    })
  }
  if (patch.kind === "visual-replace-patch") {
    const payload = patch.payload
    const total = payload.tori.length +
      payload.fields.length +
      payload.orbitals.length +
      payload.fieldProxies.length +
      payload.transitionBatches.length +
      payload.relationBatches.length
    return Object.freeze({
      fieldProxies: payload.fieldProxies.length,
      fields: payload.fields.length,
      kind: patch.kind,
      orbitals: payload.orbitals.length,
      relationBatches: payload.relationBatches.length,
      tori: payload.tori.length,
      total,
      transitionBatches: payload.transitionBatches.length,
    })
  }
  if (patch.kind === "visual-delta-patch") {
    // A delta counts operations, not entities: one removal is one thing the
    // renderer must do, exactly like one add or one update.
    const size = <Value>(delta: VisualEntityDelta<Value>): number =>
      delta.added.length + delta.updated.length + delta.removed.length
    const total = size(patch.tori) +
      size(patch.fields) +
      size(patch.orbitals) +
      size(patch.fieldProxies) +
      size(patch.transitionBatches) +
      size(patch.relationBatches)
    return Object.freeze({
      fieldProxies: size(patch.fieldProxies),
      fields: size(patch.fields),
      kind: patch.kind,
      orbitals: size(patch.orbitals),
      relationBatches: size(patch.relationBatches),
      tori: size(patch.tori),
      total,
      transitionBatches: size(patch.transitionBatches),
    })
  }
  const total = patch.tori.length +
    patch.fields.length +
    patch.orbitals.length +
    patch.fieldProxies.length +
    patch.transitionBatches.length +
    patch.relationBatches.length
  return Object.freeze({
    fieldProxies: patch.fieldProxies.length,
    fields: patch.fields.length,
    kind: patch.kind,
    orbitals: patch.orbitals.length,
    relationBatches: patch.relationBatches.length,
    tori: patch.tori.length,
    total,
    transitionBatches: patch.transitionBatches.length,
  })
}
