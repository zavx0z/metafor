import type {
  BulkDarkParticleKind,
  BulkFieldParticleKind,
  BulkManifest,
} from "@metafor/types/bulk/manifest"
import {
  compileVisualComponents,
  type VisualCompiledComponents,
} from "./VisualComponents.ts"
import {DARK_TORUS_MESH_DETAIL, EMBEDDED_TORUS_MESH_DETAIL} from "./Torus.ts"
import {SPHERE_MESH_DETAIL} from "./MeshDetail.ts"
import type {
  VisualLineMaterial,
  VisualQuantumMaterial,
} from "./VisualMaterialSpec.ts"
import type {
  VisualFieldPlacement,
  VisualLayout,
  VisualLayoutInput,
  VisualLayoutSlug,
  VisualParticleForm,
  VisualScene,
  VisualTorusPlacement,
} from "./internal/layout.ts"
import {visualBatchFingerprint} from "./internal/fingerprint.ts"

/**
 * Serializable, deterministic rendering payload for one complete snapshot.
 *
 * This is the single hand-off shape between whoever runs a layout strategy and
 * whoever owns a canvas. It is produced by any named layout through one
 * contract, contains no Canvas, GPU handle, `Renderer`, `Space` or `ViewPoint`,
 * and survives `JSON.stringify` unchanged. Coordinates are already expressed in
 * the local frame of each entity's owner, so a thin renderer only needs to
 * create forms and attach them to their parent.
 */

export type VisualPayloadPoint = Readonly<{x: number; y: number; z: number}>

export type VisualPayloadTorusMeshDetail = Readonly<{
  radialSegments: number
  tubularSegments: number
}>

export type VisualPayloadSphereMeshDetail = Readonly<{
  widthSegments: number
  heightSegments: number
}>

/** One canonical Field occurrence represented by one synthetic render marker. */
export type VisualPayloadFieldAlias = Readonly<{
  sourceFieldId: number
  sourceFieldParticleId: string
  sourceParentDarkParticleId: number
  visualFieldParticleId: string
}>

export type VisualPayloadTorus = Readonly<{
  color: readonly [number, number, number]
  darkParticleId: number
  darkParticleKind: BulkDarkParticleKind
  depth: number
  label: string
  localX: number
  localY: number
  localZ: number
  material: VisualQuantumMaterial
  parentDarkParticleId: number | null
  radius: number
  src: string | null
  tube: number
}>

export type VisualPayloadField = Readonly<{
  color: readonly [number, number, number]
  fieldId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleId: string
  fieldParticleKind: BulkFieldParticleKind
  localX: number
  localY: number
  localZ: number
  material: VisualQuantumMaterial
  ownerDarkParticleId: number
  radius: number
  valueId: number | null
  valueText: string | null
}>

export type VisualPayloadOrbital = Readonly<{
  active: boolean
  anchorStateOrbitalParticleId: string | null
  color: readonly [number, number, number]
  current: boolean
  form: VisualParticleForm
  label: string
  localX: number
  localY: number
  localZ: number
  material: VisualQuantumMaterial
  orbitalParticleId: string
  orbitalParticleKind: "state" | "process" | "reaction" | "finally"
  ownerDarkParticleId: number
  sleeveRootStateId: number | null
  sourceId: number
}>

export type VisualPayloadFieldProxy = Readonly<{
  color: readonly [number, number, number]
  fieldId: number
  fieldProxyId: string
  form: VisualParticleForm
  localX: number
  localY: number
  localZ: number
  material: VisualQuantumMaterial
  ownerDarkParticleId: number
  stateOrbitalParticleId: string
  visualFieldParticleId: string
}>

/**
 * One sampled channel path as a flat `x, y, z` triple sequence.
 *
 * A renderer uploads line geometry as a contiguous buffer, so the payload
 * carries the coordinates in exactly that shape: no per-point object survives
 * transport, parsing allocates one array instead of one object per point, and
 * the encoded form is roughly a third of the size.
 */
export type VisualPayloadEdgePath = Readonly<{
  channelId: string
  /** Flat `[x0, y0, z0, x1, y1, z1, …]`; length is always a multiple of 3. */
  points: readonly number[]
}>

/**
 * One homogeneous line batch. `fingerprint` lets a renderer skip rebuilding
 * untouched line geometry without comparing every sampled point.
 */
export type VisualPayloadEdgeBatch = Readonly<{
  batchId: string
  fingerprint: string
  material: VisualLineMaterial
  ownerDarkParticleId: number
  paths: readonly VisualPayloadEdgePath[]
}>

/**
 * A Transition batch is additionally homogeneous by direction, so the forward
 * or return sense belongs to the batch rather than to each path.
 */
export type VisualPayloadTransitionBatch = VisualPayloadEdgeBatch & Readonly<{
  returning: boolean
}>

/** Canonical counts carried for diagnostics without crossing full semantics. */
export type VisualPayloadStats = Readonly<{
  darkParticleCount: number
  fieldParticleCount: number
  orbitalParticleCount: number
  relationChannelCount: number
  rootSrc: string
  transitionChannelCount: number
}>

export type VisualScenePayload = Readonly<{
  darkTorusMeshDetail: VisualPayloadTorusMeshDetail
  embeddedTorusMeshDetail: VisualPayloadTorusMeshDetail
  fieldAliases: readonly VisualPayloadFieldAlias[]
  fieldProxies: readonly VisualPayloadFieldProxy[]
  fields: readonly VisualPayloadField[]
  kind: "visual-scene-payload"
  layoutSlug: VisualLayoutSlug
  orbitals: readonly VisualPayloadOrbital[]
  relationBatches: readonly VisualPayloadEdgeBatch[]
  sphereMeshDetail: VisualPayloadSphereMeshDetail
  stats: VisualPayloadStats
  tori: readonly VisualPayloadTorus[]
  transitionBatches: readonly VisualPayloadTransitionBatch[]
}>

const exactIndex = <Key, Value>(
  entries: readonly Value[],
  key: (value: Value) => Key,
  label: string,
): ReadonlyMap<Key, Value> => {
  const index = new Map<Key, Value>()
  for (const entry of entries) {
    const identity = key(entry)
    if (index.has(identity)) {
      throw new Error(`Visual payload ${label} ${String(identity)} is duplicated`)
    }
    index.set(identity, entry)
  }
  return index
}

const localPoint = (
  value: VisualPayloadPoint,
  origin: VisualPayloadPoint,
): VisualPayloadPoint => ({
  x: value.x - origin.x,
  y: value.y - origin.y,
  z: value.z - origin.z,
})

/**
 * Sampled world path as a flat local-frame `x, y, z` triple sequence.
 *
 * The coordinate array is deliberately not frozen: it is a dense numeric buffer
 * held by an already-frozen path object, and freezing hundreds of thousands of
 * coordinates costs more than the protection is worth on this path.
 */
const flattenLocalPath = (
  path: readonly VisualPayloadPoint[],
  origin: VisualPayloadPoint,
): readonly number[] => {
  const points = new Array<number>(path.length * 3)
  for (let index = 0; index < path.length; index++) {
    const point = path[index]!
    const offset = index * 3
    points[offset] = point.x - origin.x
    points[offset + 1] = point.y - origin.y
    points[offset + 2] = point.z - origin.z
  }
  return points
}

/**
 * Stable synthetic identity for one visual Field marker.
 *
 * A strategy may merge several source occurrences into a single marker — that is
 * what `centered-nested` does when Fields share a canonical Value. The identity
 * names one canonical member of that group, never the membership itself: a group
 * that loses a member is still the same marker on screen, and a renderer that
 * keyed on the whole set would see it disappear and a stranger take its place.
 *
 * Distinct markers cannot collide, because every source occurrence is claimed by
 * exactly one placement, so no two groups can nominate the same member.
 */
export const visualPayloadFieldParticleId = (
  layoutSlug: VisualLayoutSlug,
  anchorFieldParticleId: string,
): string => `visual:${layoutSlug}:field:${anchorFieldParticleId}`

const projectTori = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly VisualPayloadTorus[] => {
  const sourceById = exactIndex(
    manifest.darkParticles,
    (particle) => particle.darkParticleId,
    "source Dark particle",
  )
  if (
    torusById.size !== sourceById.size ||
    [...sourceById.keys()].some((id) => !torusById.has(id))
  ) {
    throw new Error("Visual payload Torus identities do not match the manifest")
  }
  return Object.freeze(manifest.darkParticles.map((particle) => {
    const visual = torusById.get(particle.darkParticleId)!
    const parent = particle.parentDarkParticleId === null
      ? null
      : torusById.get(particle.parentDarkParticleId)
    if (particle.parentDarkParticleId !== null && !parent) {
      throw new Error(
        `Visual payload Torus parent ${particle.parentDarkParticleId} is absent`,
      )
    }
    const local = parent
      ? localPoint(visual, parent)
      : {x: visual.x, y: visual.y, z: visual.z}
    return Object.freeze({
      color: visual.color,
      darkParticleId: particle.darkParticleId,
      darkParticleKind: particle.darkParticleKind,
      depth: particle.depth,
      label: particle.label,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      material: visual.material,
      parentDarkParticleId: particle.parentDarkParticleId,
      radius: visual.radius,
      src: particle.src,
      tube: visual.tube,
    })
  }))
}

const projectFields = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
  layoutSlug: VisualLayoutSlug,
): Readonly<{
  aliases: readonly VisualPayloadFieldAlias[]
  fields: readonly VisualPayloadField[]
}> => {
  const sourceById = exactIndex(
    manifest.fieldParticles,
    (field) => field.fieldParticleId,
    "Field occurrence",
  )
  const consumed = new Set<string>()
  const aliases: VisualPayloadFieldAlias[] = []
  const depthByOwner = new Map(
    manifest.darkParticles.map((particle) =>
      [particle.darkParticleId, particle.depth] as const
    ),
  )
  /**
   * The shallowest source occurrence names the marker. A merged group hangs at
   * the highest common owner, so its shallowest member is the one whose fate the
   * marker already shares: anything that removes it removes the whole subtree the
   * group was drawn for. Deeper members can come and go without renaming it.
   */
  const anchorOf = (fieldParticleIds: readonly string[]): string =>
    fieldParticleIds.toSorted((left, right) => {
      const leftDepth = depthByOwner.get(
        sourceById.get(left)?.parentDarkParticleId ?? -1,
      ) ?? Number.MAX_SAFE_INTEGER
      const rightDepth = depthByOwner.get(
        sourceById.get(right)?.parentDarkParticleId ?? -1,
      ) ?? Number.MAX_SAFE_INTEGER
      return leftDepth - rightDepth || (left < right ? -1 : left > right ? 1 : 0)
    })[0]!
  const fields = scene.fields.map((placement: VisualFieldPlacement) => {
    if (placement.fieldParticleIds.length === 0) {
      throw new Error("Visual payload Field placement has no source occurrence")
    }
    const sources = placement.fieldParticleIds.map((id) => {
      const field = sourceById.get(id)
      if (!field || consumed.has(id)) {
        throw new Error(
          `Visual payload Field occurrence ${id} is absent or repeated`,
        )
      }
      consumed.add(id)
      return field
    })
    const owner = torusById.get(placement.ownerDarkParticleId)
    if (!owner) {
      throw new Error(
        `Visual payload Field owner ${placement.ownerDarkParticleId} is absent`,
      )
    }
    const visualFieldParticleId = visualPayloadFieldParticleId(
      layoutSlug,
      anchorOf(placement.fieldParticleIds),
    )
    for (const source of sources) {
      aliases.push(Object.freeze({
        sourceFieldId: source.fieldId,
        sourceFieldParticleId: source.fieldParticleId,
        sourceParentDarkParticleId: source.parentDarkParticleId,
        visualFieldParticleId,
      }))
    }
    const local = localPoint(placement, owner)
    const labels = [...new Set(sources.map((field) => field.fieldLabel))]
    return Object.freeze({
      color: placement.color,
      fieldId: Math.min(...placement.fieldIds),
      fieldKey: placement.fieldKeys.join(" ∩ "),
      fieldLabel: labels.join(" · "),
      fieldParticleId: visualFieldParticleId,
      fieldParticleKind: placement.fieldParticleKind,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      material: placement.material,
      ownerDarkParticleId: placement.ownerDarkParticleId,
      radius: placement.radius,
      valueId: placement.valueId,
      valueText: placement.valueText,
    })
  })
  if (consumed.size !== sourceById.size) {
    const missing = [...sourceById.keys()].find((id) => !consumed.has(id))
    throw new Error(
      `Visual payload Field occurrence ${missing} has no placement`,
    )
  }
  return {aliases: Object.freeze(aliases), fields: Object.freeze(fields)}
}

const projectOrbitals = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly VisualPayloadOrbital[] => {
  const sourceOrbitals = manifest.orbitalParticles ?? []
  const sourceById = exactIndex(
    sourceOrbitals,
    (particle) => particle.orbitalParticleId,
    "orbital occurrence",
  )
  const placementById = exactIndex(
    scene.orbitals,
    (placement) => placement.orbitalParticleId,
    "orbital placement",
  )
  if (
    sourceById.size !== placementById.size ||
    [...sourceById.keys()].some((id) => !placementById.has(id))
  ) {
    throw new Error(
      "Visual payload orbital placements do not match the manifest",
    )
  }
  return Object.freeze(sourceOrbitals.map((particle) => {
    const placement = placementById.get(particle.orbitalParticleId)!
    const owner = torusById.get(particle.parentDarkParticleId)
    if (
      !owner ||
      placement.ownerDarkParticleId !== particle.parentDarkParticleId
    ) {
      throw new Error(
        `Visual payload orbital ${particle.orbitalParticleId} has an invalid owner`,
      )
    }
    const toroidal =
      particle.orbitalParticleKind === "state" ||
      particle.orbitalParticleKind === "process" ||
      particle.orbitalParticleKind === "finally"
    if (
      (toroidal && placement.form.kind !== "torus") ||
      (!toroidal && placement.form.kind !== "sphere")
    ) {
      throw new Error(
        `Visual payload orbital ${particle.orbitalParticleId} has an invalid form`,
      )
    }
    if (particle.orbitalParticleKind === "axion") {
      throw new Error(
        `Visual payload orbital ${particle.orbitalParticleId} has no visual surface`,
      )
    }
    const local = localPoint(placement, owner)
    return Object.freeze({
      active: particle.active,
      anchorStateOrbitalParticleId: particle.anchorStateOrbitalParticleId,
      color: placement.color,
      current: particle.current,
      form: placement.form,
      label: particle.label,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      material: placement.material,
      orbitalParticleId: particle.orbitalParticleId,
      orbitalParticleKind: particle.orbitalParticleKind,
      ownerDarkParticleId: placement.ownerDarkParticleId,
      sleeveRootStateId: particle.sleeveRootStateId,
      sourceId: particle.sourceId,
    })
  }))
}

const projectFieldProxies = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
  aliasBySourceFieldParticleId: ReadonlyMap<string, VisualPayloadFieldAlias>,
): readonly VisualPayloadFieldProxy[] => {
  const sourceProxies = manifest.fieldProxies ?? []
  const sourceById = exactIndex(
    sourceProxies,
    (proxy) => proxy.fieldProxyId,
    "Field proxy",
  )
  const placementById = exactIndex(
    scene.fieldProxies,
    (placement) => placement.fieldProxyId,
    "Field proxy placement",
  )
  if (
    sourceById.size !== placementById.size ||
    [...sourceById.keys()].some((id) => !placementById.has(id))
  ) {
    throw new Error(
      "Visual payload Field proxy placements do not match the manifest",
    )
  }
  const stateById = exactIndex(
    (manifest.orbitalParticles ?? []).filter((particle) =>
      particle.orbitalParticleKind === "state"
    ),
    (particle) => particle.orbitalParticleId,
    "State occurrence",
  )
  return Object.freeze(sourceProxies.map((proxy) => {
    const placement = placementById.get(proxy.fieldProxyId)!
    const state = stateById.get(proxy.stateOrbitalParticleId)
    const owner = torusById.get(proxy.parentDarkParticleId)
    const alias = aliasBySourceFieldParticleId.get(proxy.fieldParticleId)
    if (
      !state ||
      state.parentDarkParticleId !== proxy.parentDarkParticleId ||
      !owner ||
      placement.ownerDarkParticleId !== proxy.parentDarkParticleId ||
      !alias ||
      alias.sourceFieldId !== proxy.fieldId ||
      alias.sourceParentDarkParticleId !== proxy.parentDarkParticleId
    ) {
      throw new Error(
        `Visual payload Field proxy ${proxy.fieldProxyId} has unresolved identity`,
      )
    }
    const local = localPoint(placement, owner)
    return Object.freeze({
      color: placement.color,
      fieldId: proxy.fieldId,
      fieldProxyId: proxy.fieldProxyId,
      form: placement.form,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      material: placement.material,
      ownerDarkParticleId: placement.ownerDarkParticleId,
      stateOrbitalParticleId: proxy.stateOrbitalParticleId,
      visualFieldParticleId: alias.visualFieldParticleId,
    })
  }))
}

const projectTransitionBatches = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly VisualPayloadTransitionBatch[] => {
  const sourceChannels = manifest.transitionChannels ?? []
  const sourceById = exactIndex(
    sourceChannels,
    (channel) => channel.transitionChannelId,
    "Transition channel",
  )
  const matched = new Set<string>()
  const batches = scene.stateEdgeBatches.map((batch) => {
    const owner = torusById.get(batch.ownerDarkParticleId)
    if (!owner) {
      throw new Error(
        `Visual payload State owner ${batch.ownerDarkParticleId} is absent`,
      )
    }
    // Each path is flattened once and the fingerprint reads that same result.
    const flattened = batch.edges.map((edge) => {
      if (
        edge.transitionChannelId === null ||
        !sourceById.has(edge.transitionChannelId) ||
        matched.has(edge.transitionChannelId)
      ) {
        throw new Error(
          `Visual payload State edge ${edge.edgeId} does not match one canonical Transition`,
        )
      }
      matched.add(edge.transitionChannelId)
      return {
        channelId: edge.transitionChannelId,
        material: edge.material,
        points: flattenLocalPath(edge.path, owner),
      }
    })
    return Object.freeze({
      batchId: batch.batchId,
      fingerprint: visualBatchFingerprint(
        batch.batchId,
        flattened.map((entry) => ({
          material: entry.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
          points: entry.points,
        })),
      ),
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(flattened.map((entry) =>
        Object.freeze({channelId: entry.channelId, points: entry.points})
      )),
      returning: batch.returning,
    })
  })
  if (
    matched.size !== sourceChannels.length ||
    sourceChannels.some((channel) => !matched.has(channel.transitionChannelId))
  ) {
    throw new Error(
      "Visual payload State edges do not match source Transition channels",
    )
  }
  return Object.freeze(batches)
}

const projectRelationBatches = (
  manifest: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly VisualPayloadEdgeBatch[] => {
  const sourceChannels = manifest.relationChannels ?? []
  const sourceById = exactIndex(
    sourceChannels,
    (channel) => channel.relationChannelId,
    "relation channel",
  )
  const matched = new Set<string>()
  const batches = scene.relationEdgeBatches.map((batch) => {
    const owner = torusById.get(batch.ownerDarkParticleId)
    if (!owner) {
      throw new Error(
        `Visual payload relation owner ${batch.ownerDarkParticleId} is absent`,
      )
    }
    const flattened = batch.edges.map((edge) => {
      if (
        !sourceById.has(edge.relationChannelId) ||
        matched.has(edge.relationChannelId)
      ) {
        throw new Error(
          `Visual payload relation ${edge.relationChannelId} does not match one canonical channel`,
        )
      }
      matched.add(edge.relationChannelId)
      return {
        channelId: edge.relationChannelId,
        material: edge.material,
        points: flattenLocalPath(edge.path, owner),
      }
    })
    return Object.freeze({
      batchId: batch.batchId,
      fingerprint: visualBatchFingerprint(
        batch.batchId,
        flattened.map((entry) => ({
          material: entry.material,
          ownerDarkParticleId: batch.ownerDarkParticleId,
          points: entry.points,
        })),
      ),
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      paths: Object.freeze(flattened.map((entry) =>
        Object.freeze({channelId: entry.channelId, points: entry.points})
      )),
    })
  })
  if (
    matched.size !== sourceChannels.length ||
    sourceChannels.some((channel) => !matched.has(channel.relationChannelId))
  ) {
    throw new Error(
      "Visual payload relation edges do not match source relation channels",
    )
  }
  return Object.freeze(batches)
}

/**
 * Projects one already-built scene into the serializable payload. Identity
 * coverage against the manifest is exhaustive in both directions: an entity
 * without a placement, or a placement without an entity, is an error rather
 * than a silently dropped shape.
 */
export const projectVisualScenePayload = (
  scene: VisualScene,
  manifest: BulkManifest,
): VisualScenePayload => {
  const components = compileVisualComponents(scene.components)
  const torusById = exactIndex(
    components.tori,
    (torus) => torus.darkParticleId,
    "scene Torus",
  )
  const tori = projectTori(manifest, components, torusById)
  const projectedFields = projectFields(
    manifest,
    components,
    torusById,
    scene.layoutSlug,
  )
  const aliasBySourceFieldParticleId = exactIndex(
    projectedFields.aliases,
    (alias) => alias.sourceFieldParticleId,
    "Field alias",
  )
  return Object.freeze({
    darkTorusMeshDetail: DARK_TORUS_MESH_DETAIL,
    embeddedTorusMeshDetail: EMBEDDED_TORUS_MESH_DETAIL,
    fieldAliases: projectedFields.aliases,
    fieldProxies: projectFieldProxies(
      manifest,
      components,
      torusById,
      aliasBySourceFieldParticleId,
    ),
    fields: projectedFields.fields,
    kind: "visual-scene-payload",
    layoutSlug: scene.layoutSlug,
    orbitals: projectOrbitals(manifest, components, torusById),
    relationBatches: projectRelationBatches(manifest, components, torusById),
    sphereMeshDetail: SPHERE_MESH_DETAIL,
    stats: Object.freeze({
      darkParticleCount: manifest.darkParticles.length,
      fieldParticleCount: manifest.fieldParticles.length,
      orbitalParticleCount: manifest.orbitalParticles?.length ?? 0,
      relationChannelCount: manifest.relationChannels?.length ?? 0,
      rootSrc: manifest.rootSrc,
      transitionChannelCount: manifest.transitionChannels?.length ?? 0,
    }),
    tori,
    transitionBatches: projectTransitionBatches(
      manifest,
      components,
      torusById,
    ),
  })
}

/**
 * Runs one named layout and projects its scene into the serializable payload.
 * Every named strategy reaches a renderer through exactly this contract, so
 * `centered-nested` and `outside-in` differ only in geometry.
 */
export const buildVisualScenePayload = (
  layout: VisualLayout,
  input: VisualLayoutInput,
): VisualScenePayload =>
  projectVisualScenePayload(layout.buildScene(input), input.manifest)
