import {sameVisualQuantumMaterial} from "./internal/fingerprint.ts"
import type {
  VisualPayloadEdgeBatch,
  VisualPayloadField,
  VisualPayloadFieldProxy,
  VisualPayloadOrbital,
  VisualPayloadTorus,
  VisualScenePayload,
} from "./ScenePayload.ts"

/**
 * How much visual work one upstream change actually requires.
 *
 * The order is meaningful: `none` < `appearance` < `structure`. Correctness
 * always wins over locality — a scope is only narrowed when the narrower scope
 * is provably sufficient, and any unrecognized change escalates to `structure`.
 */
export type VisualInvalidationScope = "none" | "appearance" | "structure"

const SCOPE_RANK: Readonly<Record<VisualInvalidationScope, number>> = {
  none: 0,
  appearance: 1,
  structure: 2,
}

/** The wider of two scopes. */
export const widenVisualInvalidation = (
  left: VisualInvalidationScope,
  right: VisualInvalidationScope,
): VisualInvalidationScope =>
  SCOPE_RANK[left] >= SCOPE_RANK[right] ? left : right

/**
 * One upstream change already classified by the projection that applied it.
 *
 * `structural` means the change touched identity, ownership or declaration —
 * anything a layout strategy reads to place a shape. A non-structural change
 * that only rebinds an existing Field Value or moves the current State marker
 * cannot move geometry, because a layout's placement law never reads either.
 */
export type VisualUpstreamChange = Readonly<{
  changed: boolean
  structural: boolean
}>

/**
 * Classifies one applied upstream change.
 *
 * A Field Value edit (`gluon`) and a current-State move (`photon`) keep every
 * identity, ownership link and declaration intact, so the existing geometry
 * stays exact and only labels, colors and branch opacity can differ. Every
 * structural change — a new or removed Atom, a re-parent, a changed
 * declaration — can move shapes and therefore requires a full rebuild.
 */
export const classifyVisualInvalidation = (
  change: VisualUpstreamChange,
): VisualInvalidationScope => {
  if (!change.changed) return "none"
  return change.structural ? "structure" : "appearance"
}

export type VisualAppearancePatch = Readonly<{
  fieldProxies: readonly VisualPayloadFieldProxy[]
  fields: readonly VisualPayloadField[]
  kind: "visual-appearance-patch"
  orbitals: readonly VisualPayloadOrbital[]
  relationBatches: readonly VisualPayloadEdgeBatch[]
  tori: readonly VisualPayloadTorus[]
  transitionBatches: readonly VisualPayloadEdgeBatch[]
}>

export type VisualScenePatch =
  | Readonly<{kind: "visual-none-patch"}>
  | VisualAppearancePatch
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
 * When the identity sets match, only entities whose rendered values actually
 * moved are emitted, so an unchanged scene produces an empty patch and a
 * localized change produces a handful of entries. When identities differ the
 * result is an explicit full replacement — narrowing there would leave the
 * scene stale.
 */
export const reconcileVisualScenePayload = (
  current: VisualScenePayload | null,
  next: VisualScenePayload,
): VisualScenePatch => {
  if (current === null || !sameVisualPayloadIdentities(current, next)) {
    return Object.freeze({kind: "visual-replace-patch", payload: next})
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
