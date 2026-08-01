import {visualPreparationDigest} from "./internal/fingerprint.ts"
import type {VisualScenePayload} from "./ScenePayload.ts"
import type {VisualLayout, VisualLayoutInput, VisualLayoutSlug} from "./internal/layout.ts"
import {buildVisualScenePayload} from "./ScenePayload.ts"

/**
 * Server-prepared visual state.
 *
 * Everything a browser needs to put a complete scene on a canvas without
 * running a layout strategy: the already-placed payload, the declarative
 * reference to the strategy that produced it, the causal cut it describes, and
 * the keys that decide whether it is still valid. Nothing here touches Canvas,
 * GPU handles, `Renderer`, `Space` or `ViewPoint`, so the whole value survives
 * `JSON.stringify` and a network hop unchanged.
 */

/**
 * The causal cut one prepared state was taken at.
 *
 * `cutId` plus `acceptanceSequence` is the canonical pair: the acceptance
 * sequence is a monotonic ordinal assigned where a change is accepted, so two
 * frontiers of the same cut are totally ordered. An authored particle timestamp
 * is deliberately not part of this — it is a wall-clock stamp and orders
 * nothing.
 */
export type VisualCausalFrontier = Readonly<{
  acceptanceSequence: number
  cutId: string
}>

/**
 * What the prepared payload was actually derived from.
 *
 * `sourceRevision` identifies the upstream projection revision, `dependencies`
 * digests the exact identity set the strategy read, and `payload` digests the
 * produced geometry. A consumer holding a prepared state can decide whether a
 * newer one is a genuine change or a re-send of the same cut without comparing
 * megabytes of coordinates.
 */
export type VisualPreparationKeys = Readonly<{
  dependencies: string
  layoutSlug: VisualLayoutSlug
  payload: string
  sourceRevision: string
}>

export type VisualPreparedScene = Readonly<{
  /**
   * `null` only outside a causal session — a story fixture or an isolated lab.
   * Reconnect and catch-up require it, and refuse to run without it.
   */
  frontier: VisualCausalFrontier | null
  keys: VisualPreparationKeys
  kind: "visual-prepared-scene"
  /** Declarative reference to the strategy; a consumer resolves it by slug. */
  layoutSlug: VisualLayoutSlug
  payload: VisualScenePayload
}>

/** Identity set one payload depends on, in the order a digest consumes it. */
const payloadDependencyIdentities = (
  payload: VisualScenePayload,
): readonly string[] => [
  `root:${payload.stats.rootSrc}`,
  ...payload.tori.map((torus) =>
    `torus:${torus.darkParticleId}:${torus.parentDarkParticleId ?? "root"}`
  ),
  ...payload.fields.map((field) =>
    `field:${field.fieldParticleId}:${field.ownerDarkParticleId}`
  ),
  ...payload.fieldAliases.map((alias) =>
    `alias:${alias.sourceFieldParticleId}:${alias.visualFieldParticleId}`
  ),
  ...payload.orbitals.map((orbital) =>
    `orbital:${orbital.orbitalParticleId}:${orbital.ownerDarkParticleId}`
  ),
  ...payload.fieldProxies.map((proxy) =>
    `proxy:${proxy.fieldProxyId}:${proxy.ownerDarkParticleId}`
  ),
  ...payload.transitionBatches.map((batch) => `transition:${batch.batchId}`),
  ...payload.relationBatches.map((batch) => `relation:${batch.batchId}`),
]

/**
 * Content key of one payload.
 *
 * Line batches already carry a fingerprint over their exact sampled bytes, so
 * this mixes those digests rather than re-reading several hundred thousand
 * coordinates — the result still changes whenever any rendered value changes.
 */
export const visualPayloadKey = (payload: VisualScenePayload): string =>
  visualPreparationDigest([
    payload.layoutSlug,
    `dark:${payload.stats.darkParticleCount}`,
    `field:${payload.stats.fieldParticleCount}`,
    `orbital:${payload.stats.orbitalParticleCount}`,
    `transition:${payload.stats.transitionChannelCount}`,
    `relation:${payload.stats.relationChannelCount}`,
    `torusMesh:${payload.darkTorusMeshDetail.radialSegments}x${payload.darkTorusMeshDetail.tubularSegments}`,
    `embeddedMesh:${payload.embeddedTorusMeshDetail.radialSegments}x${payload.embeddedTorusMeshDetail.tubularSegments}`,
    `sphereMesh:${payload.sphereMeshDetail.widthSegments}x${payload.sphereMeshDetail.heightSegments}`,
    ...payload.tori.map((torus) =>
      `t:${torus.darkParticleId}:${torus.localX}:${torus.localY}:${torus.localZ}:${torus.radius}:${torus.tube}:${torus.label}:${torus.material.opacity}:${torus.material.glowIntensity}:${torus.color.join(",")}`
    ),
    ...payload.fields.map((field) =>
      `f:${field.fieldParticleId}:${field.localX}:${field.localY}:${field.localZ}:${field.radius}:${field.valueId ?? "none"}:${field.valueText ?? ""}:${field.material.opacity}:${field.color.join(",")}`
    ),
    ...payload.orbitals.map((orbital) =>
      `o:${orbital.orbitalParticleId}:${orbital.localX}:${orbital.localY}:${orbital.localZ}:${orbital.active ? 1 : 0}:${orbital.current ? 1 : 0}:${orbital.material.opacity}:${orbital.color.join(",")}`
    ),
    ...payload.fieldProxies.map((proxy) =>
      `p:${proxy.fieldProxyId}:${proxy.localX}:${proxy.localY}:${proxy.localZ}:${proxy.material.opacity}:${proxy.color.join(",")}`
    ),
    ...payload.transitionBatches.map((batch) =>
      `tb:${batch.batchId}:${batch.fingerprint}`
    ),
    ...payload.relationBatches.map((batch) =>
      `rb:${batch.batchId}:${batch.fingerprint}`
    ),
  ])

/** Digest of the exact identity set one payload was built from. */
export const visualDependencyKey = (payload: VisualScenePayload): string =>
  visualPreparationDigest(payloadDependencyIdentities(payload))

/**
 * Wraps an already-built payload as prepared state.
 *
 * Separate from `prepareVisualScene` because a caller that already holds a
 * payload — a store that just reconciled, a replayed story frame — must be able
 * to describe it without running a strategy again.
 */
export const describeVisualPreparedScene = (
  payload: VisualScenePayload,
  input: Readonly<{
    frontier: VisualCausalFrontier | null
    sourceRevision: string
  }>,
): VisualPreparedScene =>
  Object.freeze({
    frontier: input.frontier === null ? null : Object.freeze({
      acceptanceSequence: input.frontier.acceptanceSequence,
      cutId: input.frontier.cutId,
    }),
    keys: Object.freeze({
      dependencies: visualDependencyKey(payload),
      layoutSlug: payload.layoutSlug,
      payload: visualPayloadKey(payload),
      sourceRevision: input.sourceRevision,
    }),
    kind: "visual-prepared-scene",
    layoutSlug: payload.layoutSlug,
    payload,
  })

/**
 * Runs one named strategy and describes the result as prepared state. This is
 * the server-side entrypoint; a browser calls `hydrate`, never this.
 */
export const prepareVisualScene = (
  layout: VisualLayout,
  layoutInput: VisualLayoutInput,
  input: Readonly<{
    frontier: VisualCausalFrontier | null
    sourceRevision: string
  }>,
): VisualPreparedScene =>
  describeVisualPreparedScene(
    buildVisualScenePayload(layout, layoutInput),
    input,
  )

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isFrontier = (value: unknown): value is VisualCausalFrontier =>
  isRecord(value) &&
  typeof value.cutId === "string" &&
  value.cutId.length > 0 &&
  Number.isSafeInteger(value.acceptanceSequence) &&
  (value.acceptanceSequence as number) >= 0

/**
 * Whether a transported value is prepared state a consumer may hydrate.
 *
 * Deliberately structural rather than exhaustive: the payload itself is
 * validated by the strategy contract that produced it and again by the renderer
 * boundary, so this guards the envelope a transport can corrupt.
 */
export const isVisualPreparedScene = (
  value: unknown,
): value is VisualPreparedScene => {
  if (!isRecord(value) || value.kind !== "visual-prepared-scene") return false
  if (value.frontier !== null && !isFrontier(value.frontier)) return false
  if (!isRecord(value.keys) || !isRecord(value.payload)) return false
  const keys = value.keys
  return (
    typeof keys.dependencies === "string" &&
    typeof keys.payload === "string" &&
    typeof keys.sourceRevision === "string" &&
    keys.layoutSlug === value.layoutSlug &&
    value.payload.kind === "visual-scene-payload" &&
    value.payload.layoutSlug === value.layoutSlug
  )
}

/** Whether `next` describes a strictly later cut of the same causal line. */
export const isLaterVisualFrontier = (
  current: VisualCausalFrontier,
  next: VisualCausalFrontier,
): boolean =>
  current.cutId === next.cutId &&
  next.acceptanceSequence > current.acceptanceSequence
