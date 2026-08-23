import type {
  BulkManifest,
  BulkRelationChannel,
  BulkRenderDarkParticle,
  BulkRenderFieldParticle,
  BulkRenderFieldProxy,
  BulkRenderOrbitalParticle,
} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@bulk/types/projection"
import type {
  BulkVisualDarkMaterial,
  BulkVisualFieldMaterial,
  BulkVisualFieldProxyMaterial,
  BulkVisualFieldProxySphere,
  BulkVisualFieldProxyTorus,
  BulkVisualLayoutSlug,
  BulkVisualOrbitalMaterial,
  BulkVisualOrbitalSphere,
  BulkVisualOrbitalTorus,
  BulkVisualRelationPath,
  BulkReadyRenderDarkParticle,
  BulkReadyRenderFieldParticle,
  BulkReadyRenderFieldProxy,
  BulkReadyRenderOrbitalParticle,
  BulkReadyVisualRenderManifest,
  BulkVisualRenderManifest,
  BulkVisualRenderPatch,
  BulkVisualTransitionPath,
} from "@bulk/types/visual"
import {
  CenteredNested,
  buildStateGraph,
  buildVisualScenePayload,
  visualLayoutForSlug,
  visualRelationHasSceneGeometry,
  visualRegisteredLayoutSlugs,
  visualOwnerDarkParticleIdFromAtomId,
  type VisualDeltaPatch,
  type VisualLayout,
  type VisualLayoutInput,
  type VisualLayoutSlug,
  type VisualScenePayload,
} from "@metafor/visual/layout/centered-nested"

export type {
  BulkVisualFieldAlias,
  BulkVisualFieldProxySphere,
  BulkVisualFieldProxyTorus,
  BulkVisualOrbitalSphere,
  BulkVisualOrbitalTorus,
  BulkVisualRenderManifest,
  BulkVisualRenderPatch,
} from "@bulk/types/visual"

/**
 * Bulk's visual boundary.
 *
 * `pkg/visual` owns every coordinate, form, material and compact curve. Bulk
 * contributes exactly two things: the deferred-Axion policy that decides what
 * may reach a strategy, and the binding of each manifested Atom to its owner
 * graph. Everything after that is the platform's serializable payload, adapted
 * into the render shape the viewport already consumes.
 */

/** The renderer slug union and the visual catalog must not drift apart. */
type AssertSlugParity = BulkVisualLayoutSlug extends VisualLayoutSlug
  ? VisualLayoutSlug extends BulkVisualLayoutSlug ? true : never
  : never
const _slugParity: AssertSlugParity = true
void _slugParity

/**
 * Bulk's default strategy when an initial input names none.
 *
 * `centered-nested` stays the default. Any other strategy is reached by slug
 * through {@link resolveBulkVisualLayout}, never by a geometry switch here:
 * Bulk selects a strategy, it does not know what one places.
 */
export const DEFAULT_BULK_VISUAL_LAYOUT: VisualLayout = CenteredNested

export const DEFAULT_BULK_VISUAL_LAYOUT_SLUG: BulkVisualLayoutSlug =
  CenteredNested.slug

/**
 * Resolves one declarative strategy reference.
 *
 * This is the single production selection point. A caller — the server building
 * initial state, a browser hydrating it, the playground comparing strategies —
 * passes the slug it was configured with and gets back the one contract every
 * strategy implements. An unknown slug fails here rather than silently falling
 * back to the default, because a scene laid out by the wrong strategy is not a
 * degraded scene, it is a different one.
 *
 * Resolution answers from the strategies this bundle actually ships. Bulk never
 * imports the catalog, so its browser build carries only the ready strategy and
 * says so plainly when asked for one it does not have.
 */
export const resolveBulkVisualLayout = (
  slug: BulkVisualLayoutSlug,
): VisualLayout => {
  const layout = visualLayoutForSlug(slug)
  if (!layout) {
    throw new Error(
      `Bulk Visual layout ${slug} is not shipped by this build (has ${
        visualRegisteredLayoutSlugs().join(", ") || "no strategy"
      })`,
    )
  }
  return layout
}

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

/**
 * Bulk policy for the deferred Axion slice. Semantic Axion occurrences remain
 * in the canonical manifestation, but neither they nor geometry used only by
 * them are passed to a Visual strategy.
 *
 * Exported because every consumer that calls a named strategy directly — Bulk
 * itself, and the playground's story stand — must apply the same policy first;
 * a strategy rejects a manifest that still carries deferred geometry.
 */
export const renderableManifest = (source: BulkManifest): BulkManifest => {
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
  const retainedFieldParticleIds = new Set(fieldParticles.map((field) =>
    field.fieldParticleId
  ))
  const retainedFieldEndpoint = (
    kind: BulkRelationChannel["fromKind"],
    id: string,
  ): boolean => kind !== "field" || retainedFieldParticleIds.has(id)
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
      retainedFieldEndpoint(channel.fromKind, channel.fromId) &&
      retainedFieldEndpoint(channel.toKind, channel.toId),
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

/**
 * Bulk-owned adaptation from semantic state to one pure Visual calculation.
 *
 * The layout receives only the renderable manifestation and owner-local
 * State graphs required for this calculation. It neither receives nor keeps
 * the persistent Bulk projection.
 */
export const buildBulkVisualLayoutInput = (
  semanticManifest: BulkManifest,
  projection: BulkRuntimeProjection,
): VisualLayoutInput => {
  const manifest = renderableManifest(semanticManifest)
  return {
    manifest,
    owners: buildVisualOwners(manifest, projection),
  }
}

const rewriteRelationEndpoint = (
  kind: BulkRelationChannel["fromKind"],
  id: string,
  fieldAliasById: ReadonlyMap<string, string>,
): string => kind === "field" ? fieldAliasById.get(id) ?? id : id

/**
 * Adapts one platform payload into the render shape.
 *
 * Semantic attributes the payload does not carry — `metaSrc`, ordering,
 * activity, related State ids — are read back from the canonical manifest by
 * identity, so the renderer keeps the picking and navigation surface it already
 * relies on without the payload duplicating semantics.
 */
const adaptRenderManifest = (
  semanticManifest: BulkManifest,
  visualSource: BulkManifest,
  payload: VisualScenePayload,
): BulkVisualRenderManifest => {
  const payloadTorusById = exactIndex(
    payload.tori,
    (torus) => torus.darkParticleId,
    "payload Torus",
  )
  const payloadOrbitalById = exactIndex(
    payload.orbitals,
    (orbital) => orbital.orbitalParticleId,
    "payload orbital",
  )
  const payloadProxyById = exactIndex(
    payload.fieldProxies,
    (proxy) => proxy.fieldProxyId,
    "payload Field proxy",
  )

  const darkParticles: BulkRenderDarkParticle[] = visualSource.darkParticles
    .map((particle) => {
      const visual = payloadTorusById.get(particle.darkParticleId)
      if (!visual) {
        throw new Error(
          `Bulk Visual Torus ${particle.darkParticleId} has no placement`,
        )
      }
      return {
        ...particle,
        localX: visual.localX,
        localY: visual.localY,
        localZ: visual.localZ,
        torusRadius: visual.radius,
        torusTube: visual.tube,
        colorR: visual.color[0],
        colorG: visual.color[1],
        colorB: visual.color[2],
      }
    })

  const fieldParticles: BulkRenderFieldParticle[] = payload.fields.map(
    (field) => ({
      fieldParticleId: field.fieldParticleId,
      fieldId: field.fieldId,
      valueId: field.valueId,
      parentDarkParticleId: field.ownerDarkParticleId,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldParticleKind: field.fieldParticleKind,
      valueText: field.valueText,
      localX: field.localX,
      localY: field.localY,
      localZ: field.localZ,
      sphereRadius: field.radius,
      colorR: field.color[0],
      colorG: field.color[1],
      colorB: field.color[2],
    }),
  )

  const orbitalSpheres: BulkVisualOrbitalSphere[] = []
  const orbitalTori: BulkVisualOrbitalTorus[] = []
  const orbitalParticles: BulkRenderOrbitalParticle[] =
    (visualSource.orbitalParticles ?? []).map((particle) => {
      const visual = payloadOrbitalById.get(particle.orbitalParticleId)
      if (!visual) {
        throw new Error(
          `Bulk Visual orbital ${particle.orbitalParticleId} has no placement`,
        )
      }
      if (visual.form.kind === "torus") {
        orbitalTori.push({
          orbitalParticleId: particle.orbitalParticleId,
          radius: visual.form.radius,
          tube: visual.form.tube,
        })
      } else {
        orbitalSpheres.push({
          orbitalParticleId: particle.orbitalParticleId,
          radius: visual.form.radius,
        })
      }
      return {
        ...particle,
        relatedStateIds: [...particle.relatedStateIds],
        localX: visual.localX,
        localY: visual.localY,
        localZ: visual.localZ,
        colorR: visual.color[0],
        colorG: visual.color[1],
        colorB: visual.color[2],
      }
    })

  const fieldProxySpheres: BulkVisualFieldProxySphere[] = []
  const fieldProxyTori: BulkVisualFieldProxyTorus[] = []
  const fieldProxies: BulkRenderFieldProxy[] =
    (visualSource.fieldProxies ?? []).map((proxy) => {
      const visual = payloadProxyById.get(proxy.fieldProxyId)
      if (!visual) {
        throw new Error(
          `Bulk Visual Field proxy ${proxy.fieldProxyId} has no placement`,
        )
      }
      if (visual.form.kind === "sphere") {
        fieldProxySpheres.push({
          fieldProxyId: proxy.fieldProxyId,
          radius: visual.form.radius,
        })
      } else {
        fieldProxyTori.push({
          fieldProxyId: proxy.fieldProxyId,
          radius: visual.form.radius,
          tube: visual.form.tube,
        })
      }
      return {
        ...proxy,
        fieldParticleId: visual.visualFieldParticleId,
        localX: visual.localX,
        localY: visual.localY,
        localZ: visual.localZ,
        colorR: visual.color[0],
        colorG: visual.color[1],
        colorB: visual.color[2],
      }
    })

    // Paths are emitted in canonical source-channel order, not batch order:
  // batches group by material, and material depends on branch activity, so
  // batch order would make the render sequence shift when only activity moves.
  const transitionBatchByChannelId = new Map(
    payload.transitionBatches.flatMap((batch) =>
      batch.paths.map((entry) => [entry.channelId, {batch, entry}] as const)
    ),
  )
  const transitionPaths: BulkVisualTransitionPath[] =
    (visualSource.transitionChannels ?? []).map((channel) => {
      const found = transitionBatchByChannelId.get(channel.transitionChannelId)
      if (!found) {
        throw new Error(
          `Bulk Visual Transition ${channel.transitionChannelId} has no compact path`,
        )
      }
      return {
        batchId: found.batch.batchId,
        batchFingerprint: found.batch.fingerprint,
        material: found.batch.material,
        ownerDarkParticleId: found.batch.ownerDarkParticleId,
        curves: found.entry.curves,
        returning: found.batch.returning,
        transitionChannelId: channel.transitionChannelId,
      }
    })

  const relationBatchByChannelId = new Map(
    payload.relationBatches.flatMap((batch) =>
      batch.paths.map((entry) => [entry.channelId, {batch, entry}] as const)
    ),
  )
  const renderedRelationChannels = (visualSource.relationChannels ?? []).filter(
    (channel) => {
      if (relationBatchByChannelId.has(channel.relationChannelId)) return true
      if (!visualRelationHasSceneGeometry(channel)) return false
      if (
        payload.layoutSlug === "centered-nested" &&
        channel.relationKind === "field-entanglement"
      ) return false
      throw new Error(
        `Bulk Visual relation ${channel.relationChannelId} has no compact path`,
      )
    },
  )
  const relationPaths: BulkVisualRelationPath[] =
    renderedRelationChannels.map((channel) => {
      const found = relationBatchByChannelId.get(channel.relationChannelId)
      if (!found) throw new Error("Bulk Visual rendered relation is unresolved")
      return {
        batchId: found.batch.batchId,
        batchFingerprint: found.batch.fingerprint,
        material: found.batch.material,
        ownerDarkParticleId: found.batch.ownerDarkParticleId,
        curves: found.entry.curves,
        relationChannelId: channel.relationChannelId,
      }
    })

  const transitionPathById = exactIndex(
    transitionPaths,
    (path) => path.transitionChannelId,
    "Transition package path",
  )
  const relationPathById = exactIndex(
    relationPaths,
    (path) => path.relationChannelId,
    "relation package path",
  )
  const aliasTargetBySourceId = new Map(
    payload.fieldAliases.map((alias) =>
      [alias.sourceFieldParticleId, alias.visualFieldParticleId] as const
    ),
  )

  const transitionChannels = (visualSource.transitionChannels ?? []).map(
    (channel) => {
      const path = transitionPathById.get(channel.transitionChannelId)
      if (!path) {
        throw new Error(
          `Bulk Visual Transition ${channel.transitionChannelId} has no compact path`,
        )
      }
      const color = path.material.color
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

  const relationChannels = renderedRelationChannels.map(
    (channel) => {
      const path = relationPathById.get(channel.relationChannelId)
      if (!path) {
        throw new Error(
          `Bulk Visual relation ${channel.relationChannelId} has no compact path`,
        )
      }
      const color = path.material.color
      return {
        ...channel,
        fromId: rewriteRelationEndpoint(
          channel.fromKind,
          channel.fromId,
          aliasTargetBySourceId,
        ),
        toId: rewriteRelationEndpoint(
          channel.toKind,
          channel.toId,
          aliasTargetBySourceId,
        ),
        colorR: color[0],
        colorG: color[1],
        colorB: color[2],
      }
    },
  )

  const darkMaterials: BulkVisualDarkMaterial[] = payload.tori.map((torus) => ({
    darkParticleId: torus.darkParticleId,
    material: torus.material,
  }))
  const fieldMaterials: BulkVisualFieldMaterial[] = payload.fields.map(
    (field) => ({
      fieldParticleId: field.fieldParticleId,
      material: field.material,
    }),
  )
  const orbitalMaterials: BulkVisualOrbitalMaterial[] = payload.orbitals.map(
    (orbital) => ({
      orbitalParticleId: orbital.orbitalParticleId,
      material: orbital.material,
    }),
  )
  const fieldProxyMaterials: BulkVisualFieldProxyMaterial[] = payload
    .fieldProxies
    .map((proxy) => ({
      fieldProxyId: proxy.fieldProxyId,
      material: proxy.material,
    }))

  return {
    curveLaw: payload.curveLaw,
    layoutSlug: payload.layoutSlug,
    darkTorusMeshDetail: payload.darkTorusMeshDetail,
    embeddedTorusMeshDetail: payload.embeddedTorusMeshDetail,
    sourceStats: {
      rootSrc: semanticManifest.rootSrc,
      darkParticleCount: semanticManifest.darkParticles.length,
      fieldParticleCount: semanticManifest.fieldParticles.length,
      orbitalParticleCount: semanticManifest.orbitalParticles?.length ?? 0,
      transitionChannelCount: semanticManifest.transitionChannels?.length ?? 0,
    },
    darkMaterials,
    fieldAliases: payload.fieldAliases,
    fieldMaterials,
    fieldProxyMaterials,
    fieldProxySpheres,
    fieldProxyTori,
    orbitalMaterials,
    orbitalSpheres,
    orbitalTori,
    relationPaths,
    sphereMeshDetail: payload.sphereMeshDetail,
    transitionPaths,
    manifest: {
      rootSrc: visualSource.rootSrc,
      darkParticles,
      fieldParticles,
      orbitalParticles,
      transitionChannels,
      fieldProxies,
      relationChannels,
    },
  }
}

/** The serializable payload for one canonical manifestation under one strategy. */
export const buildBulkVisualScenePayload = (
  semanticManifest: BulkManifest,
  projection: BulkRuntimeProjection,
  layout: VisualLayout = DEFAULT_BULK_VISUAL_LAYOUT,
): VisualScenePayload => {
  return buildVisualScenePayload(
    layout,
    buildBulkVisualLayoutInput(semanticManifest, projection),
  )
}

/**
 * Adapts a payload prepared elsewhere — including on a server — into the render
 * shape, without re-running any layout work.
 */
export const adaptBulkVisualRenderManifest = (
  semanticManifest: BulkManifest,
  payload: VisualScenePayload,
): BulkVisualRenderManifest =>
  adaptRenderManifest(
    semanticManifest,
    renderableManifest(semanticManifest),
    payload,
  )

/**
 * Adapts one complete Visual payload directly into the browser renderer shape.
 *
 * Unlike {@link adaptBulkVisualRenderManifest}, this boundary reads no semantic
 * manifestation. Every value it emits is already a renderer fact in the
 * server-prepared payload; the expansion only restores the renderer's existing
 * entity arrays and homogeneous path records before CPU Hermite sampling.
 */
export const adaptBulkReadyVisualRenderManifest = (
  payload: VisualScenePayload,
): BulkReadyVisualRenderManifest => {
  const siblingOrder = new Map<number | null, number>()
  const darkParticles: BulkReadyRenderDarkParticle[] = payload.tori.map((torus) => {
    if (torus.darkParticleKind === "axion") {
      throw new Error(`Bulk Visual ready Torus ${torus.darkParticleId} is deferred Axion geometry`)
    }
    const order = siblingOrder.get(torus.parentDarkParticleId) ?? 0
    siblingOrder.set(torus.parentDarkParticleId, order + 1)
    return {
      darkParticleId: torus.darkParticleId,
      parentDarkParticleId: torus.parentDarkParticleId,
      darkParticleKind: torus.darkParticleKind,
      label: torus.label,
      depth: torus.depth,
      darkParticleOrder: order,
      localX: torus.localX,
      localY: torus.localY,
      localZ: torus.localZ,
      torusRadius: torus.radius,
      torusTube: torus.tube,
      colorR: torus.color[0],
      colorG: torus.color[1],
      colorB: torus.color[2],
    }
  })
  const fieldParticles: BulkReadyRenderFieldParticle[] = payload.fields.map(
    (field) => ({
      fieldParticleId: field.fieldParticleId,
      fieldId: field.fieldId,
      parentDarkParticleId: field.ownerDarkParticleId,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldParticleKind: field.fieldParticleKind,
      localX: field.localX,
      localY: field.localY,
      localZ: field.localZ,
      sphereRadius: field.radius,
      colorR: field.color[0],
      colorG: field.color[1],
      colorB: field.color[2],
    }),
  )
  const orbitalSpheres: BulkVisualOrbitalSphere[] = []
  const orbitalTori: BulkVisualOrbitalTorus[] = []
  const orbitalParticles: BulkReadyRenderOrbitalParticle[] = payload.orbitals.map(
    (orbital) => {
      if (orbital.form.kind === "torus") {
        orbitalTori.push({
          orbitalParticleId: orbital.orbitalParticleId,
          radius: orbital.form.radius,
          tube: orbital.form.tube,
        })
      } else {
        orbitalSpheres.push({
          orbitalParticleId: orbital.orbitalParticleId,
          radius: orbital.form.radius,
        })
      }
      return {
        orbitalParticleId: orbital.orbitalParticleId,
        sourceId: orbital.sourceId,
        parentDarkParticleId: orbital.ownerDarkParticleId,
        orbitalParticleKind: orbital.orbitalParticleKind,
        label: orbital.label,
        localX: orbital.localX,
        localY: orbital.localY,
        localZ: orbital.localZ,
        colorR: orbital.color[0],
        colorG: orbital.color[1],
        colorB: orbital.color[2],
      }
    },
  )
  const fieldProxySpheres: BulkVisualFieldProxySphere[] = []
  const fieldProxyTori: BulkVisualFieldProxyTorus[] = []
  const fieldProxies: BulkReadyRenderFieldProxy[] = payload.fieldProxies.map(
    (proxy) => {
      if (proxy.form.kind === "torus") {
        fieldProxyTori.push({
          fieldProxyId: proxy.fieldProxyId,
          radius: proxy.form.radius,
          tube: proxy.form.tube,
        })
      } else {
        fieldProxySpheres.push({
          fieldProxyId: proxy.fieldProxyId,
          radius: proxy.form.radius,
        })
      }
      return {
        fieldProxyId: proxy.fieldProxyId,
        fieldParticleId: proxy.visualFieldParticleId,
        fieldId: proxy.fieldId,
        parentDarkParticleId: proxy.ownerDarkParticleId,
        stateOrbitalParticleId: proxy.stateOrbitalParticleId,
        localX: proxy.localX,
        localY: proxy.localY,
        localZ: proxy.localZ,
        colorR: proxy.color[0],
        colorG: proxy.color[1],
        colorB: proxy.color[2],
      }
    },
  )
  const transitionPaths: BulkVisualTransitionPath[] = payload.transitionBatches
    .flatMap((batch) => batch.paths.map((path) => ({
      batchId: batch.batchId,
      batchFingerprint: batch.fingerprint,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      curves: path.curves,
      returning: batch.returning,
      transitionChannelId: path.channelId,
    })))
  const relationPaths: BulkVisualRelationPath[] = payload.relationBatches
    .flatMap((batch) => batch.paths.map((path) => ({
      batchId: batch.batchId,
      batchFingerprint: batch.fingerprint,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      curves: path.curves,
      relationChannelId: path.channelId,
    })))

  return {
    curveLaw: payload.curveLaw,
    layoutSlug: payload.layoutSlug,
    darkTorusMeshDetail: payload.darkTorusMeshDetail,
    embeddedTorusMeshDetail: payload.embeddedTorusMeshDetail,
    sourceStats: payload.stats,
    darkMaterials: payload.tori.map((torus) => ({
      darkParticleId: torus.darkParticleId,
      material: torus.material,
    })),
    fieldAliases: payload.fieldAliases,
    fieldMaterials: payload.fields.map((field) => ({
      fieldParticleId: field.fieldParticleId,
      material: field.material,
    })),
    fieldProxyMaterials: payload.fieldProxies.map((proxy) => ({
      fieldProxyId: proxy.fieldProxyId,
      material: proxy.material,
    })),
    fieldProxySpheres,
    fieldProxyTori,
    orbitalMaterials: payload.orbitals.map((orbital) => ({
      orbitalParticleId: orbital.orbitalParticleId,
      material: orbital.material,
    })),
    orbitalSpheres,
    orbitalTori,
    relationPaths,
    sphereMeshDetail: payload.sphereMeshDetail,
    transitionPaths,
    manifest: {
      rootSrc: payload.stats.rootSrc,
      darkParticles,
      fieldParticles,
      orbitalParticles,
      transitionChannels: transitionPaths.map((path) => ({
        transitionChannelId: path.transitionChannelId,
        parentDarkParticleId: path.ownerDarkParticleId,
        colorR: path.material.color[0],
        colorG: path.material.color[1],
        colorB: path.material.color[2],
      })),
      fieldProxies,
      relationChannels: relationPaths.map((path) => ({
        relationChannelId: path.relationChannelId,
        parentDarkParticleId: path.ownerDarkParticleId,
        colorR: path.material.color[0],
        colorG: path.material.color[1],
        colorB: path.material.color[2],
      })),
    },
  }
}

/**
 * Narrows a visual delta into the render operations a viewport can apply.
 *
 * Every decision was already taken: `pkg/visual` named the entities the change
 * reached and the strategy priced the change. This only translates — it never
 * compares two scenes, and it never consults a placement law. An entity absent
 * from `patch` is absent here too, which is the statement the renderer needs in
 * order to keep the GPU resources it already holds.
 *
 * The semantic source is read for the fields a render record carries but a
 * visual payload does not — kind, key, parentage, labels — for the named
 * entities only.
 */
export const adaptBulkVisualRenderPatch = (
  semanticManifest: BulkManifest,
  payload: VisualScenePayload,
  patch: VisualDeltaPatch,
): BulkVisualRenderPatch => {
  const visualSource = renderableManifest(semanticManifest)
  const sourceDarkById = new Map(
    visualSource.darkParticles.map((particle) =>
      [particle.darkParticleId, particle] as const
    ),
  )
  const sourceOrbitalById = new Map(
    (visualSource.orbitalParticles ?? []).map((particle) =>
      [particle.orbitalParticleId, particle] as const
    ),
  )
  const sourceProxyById = new Map(
    (visualSource.fieldProxies ?? []).map((proxy) =>
      [proxy.fieldProxyId, proxy] as const
    ),
  )

  const darkParticles: BulkRenderDarkParticle[] = []
  const darkMaterials: BulkVisualDarkMaterial[] = []
  for (const torus of [...patch.tori.added, ...patch.tori.updated]) {
    const particle = sourceDarkById.get(torus.darkParticleId)
    if (!particle) {
      throw new Error(
        `Bulk Visual Torus ${torus.darkParticleId} has no manifested Dark particle`,
      )
    }
    darkParticles.push({
      ...particle,
      localX: torus.localX,
      localY: torus.localY,
      localZ: torus.localZ,
      torusRadius: torus.radius,
      torusTube: torus.tube,
      colorR: torus.color[0],
      colorG: torus.color[1],
      colorB: torus.color[2],
    })
    darkMaterials.push({
      darkParticleId: torus.darkParticleId,
      material: torus.material,
    })
  }

  const fieldParticles: BulkRenderFieldParticle[] = []
  const fieldMaterials: BulkVisualFieldMaterial[] = []
  for (const field of [...patch.fields.added, ...patch.fields.updated]) {
    fieldParticles.push({
      fieldParticleId: field.fieldParticleId,
      fieldId: field.fieldId,
      valueId: field.valueId,
      parentDarkParticleId: field.ownerDarkParticleId,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldParticleKind: field.fieldParticleKind,
      valueText: field.valueText,
      localX: field.localX,
      localY: field.localY,
      localZ: field.localZ,
      sphereRadius: field.radius,
      colorR: field.color[0],
      colorG: field.color[1],
      colorB: field.color[2],
    })
    fieldMaterials.push({
      fieldParticleId: field.fieldParticleId,
      material: field.material,
    })
  }

  const orbitalParticles: BulkRenderOrbitalParticle[] = []
  const orbitalMaterials: BulkVisualOrbitalMaterial[] = []
  const orbitalSpheres: BulkVisualOrbitalSphere[] = []
  const orbitalTori: BulkVisualOrbitalTorus[] = []
  for (const orbital of [...patch.orbitals.added, ...patch.orbitals.updated]) {
    const particle = sourceOrbitalById.get(orbital.orbitalParticleId)
    if (!particle) {
      throw new Error(
        `Bulk Visual orbital ${orbital.orbitalParticleId} has no manifested particle`,
      )
    }
    if (orbital.form.kind === "torus") {
      orbitalTori.push({
        orbitalParticleId: orbital.orbitalParticleId,
        radius: orbital.form.radius,
        tube: orbital.form.tube,
      })
    } else {
      orbitalSpheres.push({
        orbitalParticleId: orbital.orbitalParticleId,
        radius: orbital.form.radius,
      })
    }
    orbitalParticles.push({
      ...particle,
      relatedStateIds: [...particle.relatedStateIds],
      localX: orbital.localX,
      localY: orbital.localY,
      localZ: orbital.localZ,
      colorR: orbital.color[0],
      colorG: orbital.color[1],
      colorB: orbital.color[2],
    })
    orbitalMaterials.push({
      orbitalParticleId: orbital.orbitalParticleId,
      material: orbital.material,
    })
  }

  const fieldProxies: BulkRenderFieldProxy[] = []
  const fieldProxyMaterials: BulkVisualFieldProxyMaterial[] = []
  const fieldProxySpheres: BulkVisualFieldProxySphere[] = []
  const fieldProxyTori: BulkVisualFieldProxyTorus[] = []
  for (
    const proxy of [...patch.fieldProxies.added, ...patch.fieldProxies.updated]
  ) {
    const source = sourceProxyById.get(proxy.fieldProxyId)
    if (!source) {
      throw new Error(
        `Bulk Visual Field proxy ${proxy.fieldProxyId} has no manifested proxy`,
      )
    }
    if (proxy.form.kind === "sphere") {
      fieldProxySpheres.push({
        fieldProxyId: proxy.fieldProxyId,
        radius: proxy.form.radius,
      })
    } else {
      fieldProxyTori.push({
        fieldProxyId: proxy.fieldProxyId,
        radius: proxy.form.radius,
        tube: proxy.form.tube,
      })
    }
    fieldProxies.push({
      ...source,
      fieldParticleId: proxy.visualFieldParticleId,
      localX: proxy.localX,
      localY: proxy.localY,
      localZ: proxy.localZ,
      colorR: proxy.color[0],
      colorG: proxy.color[1],
      colorB: proxy.color[2],
    })
    fieldProxyMaterials.push({
      fieldProxyId: proxy.fieldProxyId,
      material: proxy.material,
    })
  }

  const transitionPaths: BulkVisualTransitionPath[] = []
  for (
    const batch of [
      ...patch.transitionBatches.added,
      ...patch.transitionBatches.updated,
    ]
  ) {
    for (const entry of batch.paths) {
      transitionPaths.push({
        batchId: batch.batchId,
        batchFingerprint: batch.fingerprint,
        material: batch.material,
        ownerDarkParticleId: batch.ownerDarkParticleId,
        curves: entry.curves,
        returning: batch.returning,
        transitionChannelId: entry.channelId,
      })
    }
  }

  const relationPaths: BulkVisualRelationPath[] = []
  for (
    const batch of [
      ...patch.relationBatches.added,
      ...patch.relationBatches.updated,
    ]
  ) {
    for (const entry of batch.paths) {
      relationPaths.push({
        batchId: batch.batchId,
        batchFingerprint: batch.fingerprint,
        material: batch.material,
        ownerDarkParticleId: batch.ownerDarkParticleId,
        curves: entry.curves,
        relationChannelId: entry.channelId,
      })
    }
  }

  return {
    curveLaw: payload.curveLaw,
    darkMaterials,
    darkParticles,
    darkTorusMeshDetail: payload.darkTorusMeshDetail,
    embeddedTorusMeshDetail: payload.embeddedTorusMeshDetail,
    fieldAliases: payload.fieldAliases,
    fieldMaterials,
    fieldParticles,
    fieldProxies,
    fieldProxyMaterials,
    fieldProxySpheres,
    fieldProxyTori,
    kind: "bulk-visual-render-patch",
    layoutSlug: payload.layoutSlug,
    orbitalMaterials,
    orbitalParticles,
    orbitalSpheres,
    orbitalTori,
    relationPaths,
    removedDarkParticleIds: patch.tori.removed.map((id) => Number(id)),
    removedFieldParticleIds: patch.fields.removed,
    removedFieldProxyIds: patch.fieldProxies.removed,
    removedOrbitalParticleIds: patch.orbitals.removed,
    removedRelationBatchIds: patch.relationBatches.removed,
    removedTransitionBatchIds: patch.transitionBatches.removed,
    sourceStats: {
      rootSrc: semanticManifest.rootSrc,
      darkParticleCount: semanticManifest.darkParticles.length,
      fieldParticleCount: semanticManifest.fieldParticles.length,
      orbitalParticleCount: semanticManifest.orbitalParticles?.length ?? 0,
      transitionChannelCount: semanticManifest.transitionChannels?.length ?? 0,
    },
    sphereMeshDetail: payload.sphereMeshDetail,
    transitionPaths,
  }
}

/** Runs one named strategy and returns the render projection for a viewport. */
export const buildBulkVisualRenderManifest = (
  semanticManifest: BulkManifest,
  projection: BulkRuntimeProjection,
  layout: VisualLayout = DEFAULT_BULK_VISUAL_LAYOUT,
): BulkVisualRenderManifest => {
  const input = buildBulkVisualLayoutInput(semanticManifest, projection)
  const payload = buildVisualScenePayload(layout, input)
  const visualSource = input.manifest
  return adaptRenderManifest(semanticManifest, visualSource, payload)
}
