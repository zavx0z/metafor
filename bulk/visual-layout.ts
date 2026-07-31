import type {
  BulkManifest,
  BulkRelationChannel,
  BulkRenderDarkParticle,
  BulkRenderFieldParticle,
  BulkRenderFieldProxy,
  BulkRenderOrbitalParticle,
} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {
  BulkVisualDarkMaterial,
  BulkVisualFieldAlias,
  BulkVisualFieldMaterial,
  BulkVisualFieldProxyMaterial,
  BulkVisualFieldProxySphere,
  BulkVisualFieldProxyTorus,
  BulkVisualLineMaterial,
  BulkVisualOrbitalMaterial,
  BulkVisualOrbitalSphere,
  BulkVisualOrbitalTorus,
  BulkVisualRelationPath,
  BulkVisualRenderManifest,
  BulkVisualTransitionPath,
} from "@metafor/types/bulk/visual"
import {
  CenteredNested,
  DARK_TORUS_MESH_DETAIL,
  EMBEDDED_TORUS_MESH_DETAIL,
  SPHERE_MESH_DETAIL,
  buildStateGraph,
  compileVisualComponents,
  visualOwnerDarkParticleIdFromAtomId,
  type VisualCompiledComponents,
  type VisualFieldPlacement,
  type VisualTorusPlacement,
} from "@metafor/visual/layout/centered-nested"

export type {
  BulkVisualFieldAlias,
  BulkVisualFieldProxySphere,
  BulkVisualFieldProxyTorus,
  BulkVisualOrbitalSphere,
  BulkVisualOrbitalTorus,
  BulkVisualRenderManifest,
} from "@metafor/types/bulk/visual"

type Point = Readonly<{x: number; y: number; z: number}>
type TransitionPathWithoutFingerprint =
  Omit<BulkVisualTransitionPath, "batchFingerprint">
type RelationPathWithoutFingerprint =
  Omit<BulkVisualRelationPath, "batchFingerprint">
type FingerprintablePath = Readonly<{
  batchId: string
  material: BulkVisualLineMaterial
  ownerDarkParticleId: number
  path: readonly Point[]
}>

const subtract = (value: Point, origin: Point): Point => ({
  x: value.x - origin.x,
  y: value.y - origin.y,
  z: value.z - origin.z,
})

const exactIndex = <Key, Value>(
  entries: readonly Value[],
  key: (value: Value) => Key,
  label: string,
): ReadonlyMap<Key, Value> => {
  const index = new Map<Key, Value>()
  for (const entry of entries) {
    const identity = key(entry)
    if (index.has(identity)) {
      throw new Error(`Bulk Visual ${label} ${String(identity)} is duplicated`)
    }
    index.set(identity, entry)
  }
  return index
}

const FNV32_OFFSET = 0x811c9dc5
const FNV32_PRIME = 0x01000193
const SECOND_HASH_OFFSET = 0x9e3779b9
const SECOND_HASH_PRIME = 0x5bd1e995
const fingerprintNumberBuffer = new ArrayBuffer(8)
const fingerprintNumberView = new DataView(fingerprintNumberBuffer)
const fingerprintTextEncoder = new TextEncoder()

const visualBatchFingerprint = (
  batchId: string,
  paths: readonly FingerprintablePath[],
): string => {
  let leftHash = FNV32_OFFSET
  let rightHash = SECOND_HASH_OFFSET
  const mixByte = (value: number): void => {
    leftHash = Math.imul(leftHash ^ value, FNV32_PRIME)
    rightHash = Math.imul(rightHash ^ value, SECOND_HASH_PRIME)
  }
  const mixNumber = (value: number): void => {
    fingerprintNumberView.setFloat64(0, value, false)
    for (let index = 0; index < 8; index++) {
      mixByte(fingerprintNumberView.getUint8(index))
    }
  }
  const mixString = (value: string): void => {
    const bytes = fingerprintTextEncoder.encode(value)
    mixNumber(bytes.length)
    bytes.forEach(mixByte)
  }

  mixString(batchId)
  mixNumber(paths.length)
  for (const entry of paths) {
    mixNumber(entry.ownerDarkParticleId)
    mixString(entry.material.kind)
    mixString(entry.material.visibilityMode)
    entry.material.color.forEach(mixNumber)
    entry.material.glowColor.forEach(mixNumber)
    mixNumber(entry.material.glowIntensity)
    mixNumber(entry.material.opacity)
    mixNumber(entry.path.length)
    for (const point of entry.path) {
      mixNumber(point.x)
      mixNumber(point.y)
      mixNumber(point.z)
    }
  }
  return (
    (leftHash >>> 0).toString(16).padStart(8, "0") +
    (rightHash >>> 0).toString(16).padStart(8, "0")
  )
}

const attachBatchFingerprints = <
  Path extends FingerprintablePath,
>(
  paths: readonly Path[],
): readonly Readonly<Path & {batchFingerprint: string}>[] => {
  const pathsByBatchId = Map.groupBy(paths, (path) => path.batchId)
  const fingerprintByBatchId = new Map(
    [...pathsByBatchId].map(([batchId, batch]) =>
      [batchId, visualBatchFingerprint(batchId, batch)] as const
    ),
  )
  return Object.freeze(paths.map((path) => Object.freeze({
    ...path,
    batchFingerprint: fingerprintByBatchId.get(path.batchId)!,
  })))
}

/**
 * Bulk policy for the deferred Axion slice. Semantic Axion occurrences remain
 * in the canonical manifestation, but neither they nor geometry used only by
 * them are passed to a Visual strategy.
 */
const renderableManifest = (source: BulkManifest): BulkManifest => {
  const excludedDarkParticleIds = new Set(
    source.darkParticles
      .filter((particle) => particle.darkParticleKind === "axion")
      .map((particle) => particle.darkParticleId),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const particle of source.darkParticles) {
      if (
        particle.parentDarkParticleId !== null &&
        excludedDarkParticleIds.has(particle.parentDarkParticleId) &&
        !excludedDarkParticleIds.has(particle.darkParticleId)
      ) {
        excludedDarkParticleIds.add(particle.darkParticleId)
        changed = true
      }
    }
  }
  const retainedOwner = (ownerId: number): boolean =>
    !excludedDarkParticleIds.has(ownerId)
  const darkParticles = source.darkParticles.filter((particle) =>
    retainedOwner(particle.darkParticleId)
  )
  if (darkParticles.length === 0) {
    throw new Error("Bulk Visual has no renderable Dark root")
  }

  const fieldParticles = source.fieldParticles.filter((field) =>
    retainedOwner(field.parentDarkParticleId)
  )
  const orbitalParticles = (source.orbitalParticles ?? []).filter((particle) =>
    retainedOwner(particle.parentDarkParticleId) &&
    particle.orbitalParticleKind !== "axion"
  )
  const transitionChannels = (source.transitionChannels ?? []).filter(
    (channel) => retainedOwner(channel.parentDarkParticleId),
  )

  const ownerFieldProxyCandidates = (source.fieldProxies ?? []).filter(
    (proxy) => retainedOwner(proxy.parentDarkParticleId),
  )
  const proxyByStateAndField = exactIndex(
    ownerFieldProxyCandidates,
    (proxy) => `${proxy.stateOrbitalParticleId}\0${proxy.fieldId}`,
    "source State/Field proxy",
  )
  const retainedProxyIds = new Set<string>()
  for (const channel of transitionChannels) {
    for (const fieldId of channel.conditionFieldIds) {
      const proxy = proxyByStateAndField.get(
        `${channel.fromOrbitalParticleId}\0${fieldId}`,
      )
      if (proxy) retainedProxyIds.add(proxy.fieldProxyId)
    }
  }

  const nonAxionRelations = (source.relationChannels ?? []).filter(
    (channel) =>
      retainedOwner(channel.parentDarkParticleId) &&
      channel.relationKind !== "axion-read" &&
      channel.relationKind !== "field-entanglement",
  )
  for (const channel of nonAxionRelations) {
    if (channel.relationKind === "field-projection") continue
    if (channel.fromKind === "field-proxy") retainedProxyIds.add(channel.fromId)
    if (channel.toKind === "field-proxy") retainedProxyIds.add(channel.toId)
  }
  const fieldProxies = ownerFieldProxyCandidates.filter((proxy) =>
    retainedProxyIds.has(proxy.fieldProxyId)
  )
  const retainedFieldProxyIds = new Set(fieldProxies.map((proxy) =>
    proxy.fieldProxyId
  ))
  const relationChannels = nonAxionRelations.filter((channel) => {
    if (channel.relationKind !== "field-projection") return true
    const proxyId = channel.fromKind === "field-proxy"
      ? channel.fromId
      : channel.toKind === "field-proxy"
        ? channel.toId
        : null
    return proxyId !== null && retainedFieldProxyIds.has(proxyId)
  })

  return {
    rootSrc: source.rootSrc,
    darkParticles,
    fieldParticles,
    orbitalParticles,
    transitionChannels,
    fieldProxies,
    relationChannels,
  }
}

const buildVisualOwners = (
  manifest: BulkManifest,
  projection: BulkRuntimeProjection,
) => {
  const atomByDarkParticleId = exactIndex(
    projection.atoms,
    (atom) => visualOwnerDarkParticleIdFromAtomId(atom.id),
    "projection Atom owner",
  )
  return manifest.darkParticles
    .filter((particle) => particle.darkParticleKind === "atom")
    .map((particle) => {
      const atom = atomByDarkParticleId.get(particle.darkParticleId)
      if (!atom) {
        throw new Error(
          `Bulk Visual Atom owner ${particle.darkParticleId} is absent from projection`,
        )
      }
      return {
        graph: buildStateGraph(projection, atom.id),
        ownerDarkParticleId: particle.darkParticleId,
      }
    })
}

const visualFieldParticleId = (
  placement: VisualFieldPlacement,
): string => {
  const identity = placement.fieldParticleIds
    .map((id) => `${id.length}:${id}`)
    .join("")
  return `visual:${CenteredNested.slug}:field:${identity}`
}

const projectTori = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
): readonly BulkRenderDarkParticle[] => {
  const visualById = exactIndex(
    scene.tori,
    (torus) => torus.darkParticleId,
    "Torus",
  )
  const sourceById = exactIndex(
    source.darkParticles,
    (particle) => particle.darkParticleId,
    "source Dark particle",
  )
  if (
    visualById.size !== sourceById.size ||
    [...sourceById.keys()].some((id) => !visualById.has(id))
  ) {
    throw new Error("Bulk Visual Torus identities do not match manifestation")
  }
  return source.darkParticles.map((particle) => {
    const visual = visualById.get(particle.darkParticleId)!
    const parent = particle.parentDarkParticleId === null
      ? null
      : visualById.get(particle.parentDarkParticleId)
    if (particle.parentDarkParticleId !== null && !parent) {
      throw new Error(
        `Bulk Visual Torus parent ${particle.parentDarkParticleId} is absent`,
      )
    }
    const local = parent
      ? subtract(visual, parent)
      : {x: visual.x, y: visual.y, z: visual.z}
    return {
      ...particle,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      torusRadius: visual.radius,
      torusTube: visual.tube,
      colorR: visual.color[0],
      colorG: visual.color[1],
      colorB: visual.color[2],
    }
  })
}

const projectFields = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): Readonly<{
  aliases: readonly BulkVisualFieldAlias[]
  fields: readonly BulkRenderFieldParticle[]
}> => {
  const sourceById = exactIndex(
    source.fieldParticles,
    (field) => field.fieldParticleId,
    "Field occurrence",
  )
  const consumed = new Set<string>()
  const aliases: BulkVisualFieldAlias[] = []
  const fields = scene.fields.map((placement) => {
    if (placement.fieldParticleIds.length === 0) {
      throw new Error("Bulk Visual Field placement has no source occurrence")
    }
    const sources = placement.fieldParticleIds.map((id) => {
      const field = sourceById.get(id)
      if (!field || consumed.has(id)) {
        throw new Error(
          `Bulk Visual Field occurrence ${id} is absent or repeated`,
        )
      }
      consumed.add(id)
      return field
    })
    const owner = torusById.get(placement.ownerDarkParticleId)
    if (!owner) {
      throw new Error(
        `Bulk Visual Field owner ${placement.ownerDarkParticleId} is absent`,
      )
    }
    const id = visualFieldParticleId(placement)
    for (const sourceField of sources) {
      aliases.push({
        sourceFieldId: sourceField.fieldId,
        sourceFieldParticleId: sourceField.fieldParticleId,
        sourceParentDarkParticleId: sourceField.parentDarkParticleId,
        visualFieldParticleId: id,
      })
    }
    const local = subtract(placement, owner)
    const labels = [...new Set(sources.map((field) => field.fieldLabel))]
    return {
      fieldParticleId: id,
      fieldId: Math.min(...placement.fieldIds),
      valueId: placement.valueId,
      parentDarkParticleId: placement.ownerDarkParticleId,
      fieldKey: placement.fieldKeys.join(" ∩ "),
      fieldLabel: labels.join(" · "),
      fieldParticleKind: placement.fieldParticleKind,
      valueText: placement.valueText,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      sphereRadius: placement.radius,
      colorR: placement.color[0],
      colorG: placement.color[1],
      colorB: placement.color[2],
    }
  })
  if (consumed.size !== sourceById.size) {
    const missing = [...sourceById.keys()].find((id) => !consumed.has(id))
    throw new Error(`Bulk Visual Field occurrence ${missing} has no placement`)
  }
  return {aliases, fields}
}

const validateTransitionProjection = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly TransitionPathWithoutFingerprint[] => {
  const sourceChannels = source.transitionChannels ?? []
  const sourceById = exactIndex(
    sourceChannels,
    (channel) => channel.transitionChannelId,
    "Transition channel",
  )
  const matched = new Set<string>()
  const paths: TransitionPathWithoutFingerprint[] = []
  const batchByTransitionChannelId = new Map(
    scene.stateEdgeBatches.flatMap((batch) =>
      batch.edges.map((edge) =>
        [edge.transitionChannelId, batch] as const
      )
    ),
  )
  for (const sleeve of scene.stateSleeves) {
    const owner = torusById.get(sleeve.ownerDarkParticleId)
    if (!owner) {
      throw new Error(
        `Bulk Visual State owner ${sleeve.ownerDarkParticleId} is absent`,
      )
    }
    for (const edge of sleeve.edges) {
      const sourceChannel = edge.transitionChannelId === null
        ? undefined
        : sourceById.get(edge.transitionChannelId)
      if (
        edge.transitionChannelId === null ||
        sourceChannel === undefined ||
        matched.has(edge.transitionChannelId)
      ) {
        throw new Error(
          `Bulk Visual State edge ${edge.edgeId} does not match one canonical Transition`,
        )
      }
      matched.add(edge.transitionChannelId)
      if (edge.path.length !== 65) {
        throw new Error(
          `Bulk Visual State edge ${edge.edgeId} has no production Hermite path`,
        )
      }
      const batch = batchByTransitionChannelId.get(
        edge.transitionChannelId,
      )
      if (!batch || batch.ownerDarkParticleId !== sleeve.ownerDarkParticleId) {
        throw new Error(
          `Bulk Visual State edge ${edge.edgeId} has no component batch`,
        )
      }
      paths.push({
        batchId: batch.batchId,
        material: edge.material,
        ownerDarkParticleId: sleeve.ownerDarkParticleId,
        path: edge.path.map((point) => subtract(point, owner)),
        returning: edge.returning,
        transitionChannelId: edge.transitionChannelId,
      })
    }
  }
  if (
    matched.size !== sourceChannels.length ||
    sourceChannels.some((channel) => !matched.has(channel.transitionChannelId))
  ) {
    throw new Error(
      "Bulk Visual State edges do not match source Transition channels",
    )
  }
  return Object.freeze(paths)
}

const projectOrbitals = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): Readonly<{
  orbitalParticles: readonly BulkRenderOrbitalParticle[]
  orbitalSpheres: readonly BulkVisualOrbitalSphere[]
  orbitalTori: readonly BulkVisualOrbitalTorus[]
}> => {
  const sourceOrbitals = source.orbitalParticles ?? []
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
      "Bulk Visual orbital placements do not match source manifestation",
    )
  }
  const orbitalSpheres: BulkVisualOrbitalSphere[] = []
  const orbitalTori: BulkVisualOrbitalTorus[] = []
  const orbitalParticles = sourceOrbitals.map((particle) => {
    const placement = placementById.get(particle.orbitalParticleId)!
    const owner = torusById.get(particle.parentDarkParticleId)
    if (
      !owner ||
      placement.ownerDarkParticleId !== particle.parentDarkParticleId
    ) {
      throw new Error(
        `Bulk Visual orbital ${particle.orbitalParticleId} has an invalid owner`,
      )
    }
    const toroidal =
      particle.orbitalParticleKind === "state" ||
      particle.orbitalParticleKind === "process" ||
      particle.orbitalParticleKind === "finally"
    if (
      (toroidal &&
        placement.form.kind !== "torus") ||
      (!toroidal &&
        placement.form.kind !== "sphere")
    ) {
      throw new Error(
        `Bulk Visual orbital ${particle.orbitalParticleId} has an invalid form`,
      )
    }
    if (placement.form.kind === "torus") {
      orbitalTori.push({
        orbitalParticleId: particle.orbitalParticleId,
        radius: placement.form.radius,
        tube: placement.form.tube,
      })
    } else {
      orbitalSpheres.push({
        orbitalParticleId: particle.orbitalParticleId,
        radius: placement.form.radius,
      })
    }
    const local = subtract(placement, owner)
    return {
      ...particle,
      relatedStateIds: [...particle.relatedStateIds],
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      colorR: placement.color[0],
      colorG: placement.color[1],
      colorB: placement.color[2],
    }
  })
  return {orbitalParticles, orbitalSpheres, orbitalTori}
}

const projectFieldProxies = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
  fieldAliasById: ReadonlyMap<string, BulkVisualFieldAlias>,
): Readonly<{
  fieldProxies: readonly BulkRenderFieldProxy[]
  fieldProxySpheres: readonly BulkVisualFieldProxySphere[]
  fieldProxyTori: readonly BulkVisualFieldProxyTorus[]
}> => {
  const sourceProxies = source.fieldProxies ?? []
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
      "Bulk Visual Field proxy placements do not match source manifestation",
    )
  }
  const stateById = exactIndex(
    (source.orbitalParticles ?? []).filter((particle) =>
      particle.orbitalParticleKind === "state"
    ),
    (particle) => particle.orbitalParticleId,
    "State occurrence",
  )
  const fieldProxySpheres: BulkVisualFieldProxySphere[] = []
  const fieldProxyTori: BulkVisualFieldProxyTorus[] = []
  const fieldProxies = sourceProxies.map((proxy) => {
    const placement = placementById.get(proxy.fieldProxyId)!
    const state = stateById.get(proxy.stateOrbitalParticleId)
    const owner = torusById.get(proxy.parentDarkParticleId)
    const alias = fieldAliasById.get(proxy.fieldParticleId)
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
        `Bulk Visual Field proxy ${proxy.fieldProxyId} has unresolved identity`,
      )
    }
    if (placement.form.kind === "sphere") {
      fieldProxySpheres.push({
        fieldProxyId: proxy.fieldProxyId,
        radius: placement.form.radius,
      })
    } else {
      fieldProxyTori.push({
        fieldProxyId: proxy.fieldProxyId,
        radius: placement.form.radius,
        tube: placement.form.tube,
      })
    }
    const local = subtract(placement, owner)
    return {
      ...proxy,
      fieldParticleId: alias.visualFieldParticleId,
      localX: local.x,
      localY: local.y,
      localZ: local.z,
      colorR: placement.color[0],
      colorG: placement.color[1],
      colorB: placement.color[2],
    }
  })
  return {fieldProxies, fieldProxySpheres, fieldProxyTori}
}

const rewriteRelationEndpoint = (
  kind: BulkRelationChannel["fromKind"],
  id: string,
  fieldAliasById: ReadonlyMap<string, string>,
): string => kind === "field"
  ? fieldAliasById.get(id) ?? id
  : id

const projectRelationPaths = (
  source: BulkManifest,
  scene: VisualCompiledComponents,
  torusById: ReadonlyMap<number, VisualTorusPlacement>,
): readonly RelationPathWithoutFingerprint[] => {
  const sourceChannels = source.relationChannels ?? []
  const sourceById = exactIndex(
    sourceChannels,
    (channel) => channel.relationChannelId,
    "relation channel",
  )
  const edgeById = exactIndex(
    scene.relationEdges,
    (edge) => edge.relationChannelId,
    "relation sampled edge",
  )
  const batchByRelationChannelId = new Map(
    scene.relationEdgeBatches.flatMap((batch) =>
      batch.edges.map((edge) =>
        [edge.relationChannelId, batch] as const
      )
    ),
  )
  if (
    sourceById.size !== edgeById.size ||
    [...sourceById.keys()].some((id) => !edgeById.has(id))
  ) {
    throw new Error(
      "Bulk Visual relation edges do not match source relation channels",
    )
  }
  return Object.freeze(sourceChannels.map((channel) => {
    const edge = edgeById.get(channel.relationChannelId)!
    const owner = torusById.get(edge.ownerDarkParticleId)
    const batch = batchByRelationChannelId.get(edge.relationChannelId)
    if (
      !owner ||
      !batch ||
      batch.ownerDarkParticleId !== edge.ownerDarkParticleId
    ) {
      throw new Error(
        `Bulk Visual relation ${channel.relationChannelId} has no Torus owner`,
      )
    }
    return Object.freeze({
      batchId: batch.batchId,
      material: edge.material,
      ownerDarkParticleId: edge.ownerDarkParticleId,
      path: edge.path.map((point) => subtract(point, owner)),
      relationChannelId: edge.relationChannelId,
    })
  }))
}

const visualRelationChannel = (
  channel: BulkRelationChannel,
  fieldAliasById: ReadonlyMap<string, string>,
  path: BulkVisualRelationPath,
) => {
  const color = path.material.color
  return {
    ...channel,
    fromId: rewriteRelationEndpoint(
      channel.fromKind,
      channel.fromId,
      fieldAliasById,
    ),
    toId: rewriteRelationEndpoint(
      channel.toKind,
      channel.toId,
      fieldAliasById,
    ),
    colorR: color[0],
    colorG: color[1],
    colorB: color[2],
  }
}

export const buildCenteredNestedBulkVisualManifest = (
  semanticManifest: BulkManifest,
  projection: BulkRuntimeProjection,
): BulkVisualRenderManifest => {
  const visualSource = renderableManifest(semanticManifest)
  const scene = CenteredNested.buildScene({
    manifest: visualSource,
    owners: buildVisualOwners(visualSource, projection),
  })
  const components = compileVisualComponents(scene.components)
  const torusById = exactIndex(
    components.tori,
    (torus) => torus.darkParticleId,
    "scene Torus",
  )
  const darkParticles = projectTori(visualSource, components)
  const projectedFields = projectFields(
    visualSource,
    components,
    torusById,
  )
  const fieldAliasById = exactIndex(
    projectedFields.aliases,
    (alias) => alias.sourceFieldParticleId,
    "Field alias",
  )
  const aliasTargetBySourceId = new Map(
    [...fieldAliasById].map(([sourceId, alias]) =>
      [sourceId, alias.visualFieldParticleId] as const
    ),
  )
  const transitionPaths = attachBatchFingerprints(
    validateTransitionProjection(
      visualSource,
      components,
      torusById,
    ),
  )
  const projectedOrbitals = projectOrbitals(
    visualSource,
    components,
    torusById,
  )
  const projectedProxies = projectFieldProxies(
    visualSource,
    components,
    torusById,
    fieldAliasById,
  )
  const relationPaths = attachBatchFingerprints(
    projectRelationPaths(
      visualSource,
      components,
      torusById,
    ),
  )
  const relationPathById = exactIndex(
    relationPaths,
    (path) => path.relationChannelId,
    "relation package path",
  )
  const relationChannels = (visualSource.relationChannels ?? []).map(
    (channel) => visualRelationChannel(
      channel,
      aliasTargetBySourceId,
      relationPathById.get(channel.relationChannelId)!,
    ),
  )
  const transitionPathById = exactIndex(
    transitionPaths,
    (path) => path.transitionChannelId,
    "Transition package path",
  )
  const transitionChannels = (visualSource.transitionChannels ?? []).map(
    (channel) => {
      const color = transitionPathById.get(
        channel.transitionChannelId,
      )!.material.color
      return {
        ...channel,
        conditionIds: [...channel.conditionIds],
        conditionFieldIds: [...channel.conditionFieldIds],
        colorR: color[0],
        colorG: color[1],
        colorB: color[2],
      }
    },
  )
  const darkMaterials: BulkVisualDarkMaterial[] =
    components.tori.map((torus) => ({
    darkParticleId: torus.darkParticleId,
    material: torus.material,
  }))
  const fieldMaterials: BulkVisualFieldMaterial[] = components.fields.map(
    (field) => ({
      fieldParticleId: visualFieldParticleId(field),
      material: field.material,
    }),
  )
  const orbitalMaterials: BulkVisualOrbitalMaterial[] =
    components.orbitals.map(
    (orbital) => ({
      orbitalParticleId: orbital.orbitalParticleId,
      material: orbital.material,
    }),
  )
  const fieldProxyMaterials: BulkVisualFieldProxyMaterial[] =
    components.fieldProxies.map((proxy) => ({
      fieldProxyId: proxy.fieldProxyId,
      material: proxy.material,
    }))

  return {
    layoutSlug: "centered-nested",
    darkTorusMeshDetail: DARK_TORUS_MESH_DETAIL,
    embeddedTorusMeshDetail: EMBEDDED_TORUS_MESH_DETAIL,
    sourceStats: {
      rootSrc: semanticManifest.rootSrc,
      darkParticleCount: semanticManifest.darkParticles.length,
      fieldParticleCount: semanticManifest.fieldParticles.length,
      orbitalParticleCount: semanticManifest.orbitalParticles?.length ?? 0,
      transitionChannelCount:
        semanticManifest.transitionChannels?.length ?? 0,
    },
    darkMaterials,
    fieldAliases: projectedFields.aliases,
    fieldMaterials,
    fieldProxyMaterials,
    fieldProxySpheres: projectedProxies.fieldProxySpheres,
    fieldProxyTori: projectedProxies.fieldProxyTori,
    orbitalMaterials,
    orbitalSpheres: projectedOrbitals.orbitalSpheres,
    orbitalTori: projectedOrbitals.orbitalTori,
    relationPaths,
    sphereMeshDetail: SPHERE_MESH_DETAIL,
    transitionPaths,
    manifest: {
      rootSrc: visualSource.rootSrc,
      darkParticles: [...darkParticles],
      fieldParticles: [...projectedFields.fields],
      orbitalParticles: [...projectedOrbitals.orbitalParticles],
      transitionChannels,
      fieldProxies: [...projectedProxies.fieldProxies],
      relationChannels,
    },
  }
}
