import type {
  BulkFieldProxy,
  BulkManifest,
  BulkOrbitalParticle,
  BulkRelationChannel,
} from "@metafor/types/bulk/manifest"
import {layoutFieldsInPseudoCircle} from "../FieldsLayout.ts"
import {
  STATE_GRAPH_PRODUCTION_SIZING,
  type StateGraphOrbitalContentSizing,
} from "../StateGraphLayout.ts"
import {
  TORUS_LAYOUT_BASELINE,
  resolveContentTorusForm,
  torusLevelScale,
  type TorusForm,
} from "../Torus.ts"

export type ProcessFieldProxyPlacement = Readonly<{
  fieldProxyId: string
  radius: number
  x: number
  y: number
  z: number
}>

export type ProcessTorusLayout = Readonly<{
  anchorStateOrbitalParticleId: string
  fieldProxies: readonly ProcessFieldProxyPlacement[]
  form: TorusForm
  orbitalParticleId: string
  orbitAngle: number
  ownerDarkParticleId: number
  stateId: number
}>

export type ProcessTorusLayoutIndex = Readonly<{
  byOrbitalParticleId: ReadonlyMap<string, ProcessTorusLayout>
  processOrbitalParticleIdByFieldProxyId: ReadonlyMap<string, string>
  stateOrbitalContentByOwner: ReadonlyMap<
    number,
    ReadonlyMap<number, StateGraphOrbitalContentSizing>
  >
}>

type UnpositionedProcessTorusLayout = Omit<
  ProcessTorusLayout,
  "orbitAngle"
>

const processTorusKind = (
  particle: BulkOrbitalParticle,
): boolean =>
  particle.orbitalParticleKind === "process" ||
  particle.orbitalParticleKind === "finally"

const processProxyEndpoint = (
  channel: BulkRelationChannel,
  processOrbitalParticleId: string,
): string | null => {
  if (
    channel.relationKind !== "process-read" &&
    channel.relationKind !== "process-write"
  ) return null
  if (
    channel.fromKind === "field-proxy" &&
    channel.toKind === "orbital" &&
    channel.toId === processOrbitalParticleId
  ) return channel.fromId
  if (
    channel.fromKind === "orbital" &&
    channel.fromId === processOrbitalParticleId &&
    channel.toKind === "field-proxy"
  ) return channel.toId
  return null
}

const processFieldRadius =
  STATE_GRAPH_PRODUCTION_SIZING.fieldRadius * torusLevelScale(1)
const processEmptyOuterRadius =
  STATE_GRAPH_PRODUCTION_SIZING.emptyOuterRadius * torusLevelScale(1)
const processContentGap =
  processFieldRadius * TORUS_LAYOUT_BASELINE.contentGapToFieldRadius
const processSurfaceGap = STATE_GRAPH_PRODUCTION_SIZING.surfaceGap

const stablePhase = (value: string): number => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const positionProcessGroup = (
  groupKey: string,
  layouts: readonly UnpositionedProcessTorusLayout[],
): Readonly<{
  orbitalContent: StateGraphOrbitalContentSizing
  layouts: readonly ProcessTorusLayout[]
}> => {
  if (layouts.length === 0) {
    return {
      orbitalContent: {minimumMajorRadius: 0, minimumTubeRadius: 0},
      layouts: [],
    }
  }
  const phase = stablePhase(groupKey)
  const angleStep = Math.PI * 2 / layouts.length
  const positioned = layouts.map((layout, index): ProcessTorusLayout =>
    Object.freeze({
      ...layout,
      orbitAngle: phase + angleStep * index,
    })
  )
  const minimumTubeRadius = Math.max(
    ...layouts.map((layout) => layout.form.outerRadius),
  ) + processContentGap
  const minimumMajorRadius = layouts.length < 2
    ? 0
    : Math.max(
        ...layouts.map((layout, index) => {
          const next = layouts[(index + 1) % layouts.length]!
          return (
            layout.form.outerRadius +
            next.form.outerRadius +
            processSurfaceGap
          ) / (2 * Math.sin(Math.PI / layouts.length))
        }),
      )
  return Object.freeze({
    orbitalContent: Object.freeze({
      minimumMajorRadius,
      minimumTubeRadius,
    }),
    layouts: Object.freeze(positioned),
  })
}

/**
 * Builds Process/Finally content in State-local production units. The whole
 * result later receives the owning Dark level transform together with State.
 */
export const buildProcessTorusLayoutIndex = (
  manifest: BulkManifest,
): ProcessTorusLayoutIndex => {
  const orbitalById = new Map(
    (manifest.orbitalParticles ?? []).map((particle) =>
      [particle.orbitalParticleId, particle] as const
    ),
  )
  const proxyById = new Map(
    (manifest.fieldProxies ?? []).map((proxy) =>
      [proxy.fieldProxyId, proxy] as const
    ),
  )
  const relationChannels = manifest.relationChannels ?? []
  const groups = new Map<string, UnpositionedProcessTorusLayout[]>()

  for (const particle of (manifest.orbitalParticles ?? [])
    .filter(processTorusKind)
    .sort((left, right) =>
      left.orbitalParticleId.localeCompare(right.orbitalParticleId)
    )) {
    const anchorId = particle.anchorStateOrbitalParticleId
    const anchor = anchorId === null ? undefined : orbitalById.get(anchorId)
    if (
      !anchor ||
      anchor.orbitalParticleKind !== "state" ||
      anchor.parentDarkParticleId !== particle.parentDarkParticleId
    ) {
      throw new Error(
        `Visual Process occurrence ${particle.orbitalParticleId} has no State anchor`,
      )
    }
    const proxyIds = [...new Set(
      relationChannels.flatMap((channel) => {
        const proxyId = processProxyEndpoint(
          channel,
          particle.orbitalParticleId,
        )
        return proxyId === null ? [] : [proxyId]
      }),
    )]
    const proxies = proxyIds.map((proxyId): BulkFieldProxy => {
      const proxy = proxyById.get(proxyId)
      if (
        !proxy ||
        proxy.parentDarkParticleId !== particle.parentDarkParticleId ||
        proxy.stateOrbitalParticleId !== anchorId
      ) {
        throw new Error(
          `Visual Process ${particle.orbitalParticleId} has unresolved Field proxy ${proxyId}`,
        )
      }
      return proxy
    }).sort((left, right) =>
      left.fieldId - right.fieldId ||
      left.fieldProxyId.localeCompare(right.fieldProxyId)
    )
    const fieldLayout = layoutFieldsInPseudoCircle(
      proxies.length,
      processFieldRadius,
    )
    const form = resolveContentTorusForm({
      coreExtent: fieldLayout.radius,
      emptyOuterRadius: processEmptyOuterRadius,
      gap: processContentGap,
    })
    const layout: UnpositionedProcessTorusLayout = Object.freeze({
      anchorStateOrbitalParticleId: anchor.orbitalParticleId,
      fieldProxies: Object.freeze(proxies.map((proxy, index) =>
        Object.freeze({
          fieldProxyId: proxy.fieldProxyId,
          radius: processFieldRadius,
          ...(fieldLayout.points[index] ?? {x: 0, y: 0, z: 0}),
        })
      )),
      form,
      orbitalParticleId: particle.orbitalParticleId,
      ownerDarkParticleId: particle.parentDarkParticleId,
      stateId: anchor.sourceId,
    })
    const groupKey =
      `${particle.parentDarkParticleId}:${anchor.orbitalParticleId}`
    const group = groups.get(groupKey)
    if (group) group.push(layout)
    else groups.set(groupKey, [layout])
  }

  const byOrbitalParticleId = new Map<string, ProcessTorusLayout>()
  const processOrbitalParticleIdByFieldProxyId = new Map<string, string>()
  const mutableStateContent = new Map<
    number,
    Map<number, StateGraphOrbitalContentSizing>
  >()
  for (const [groupKey, layouts] of groups) {
    const positioned = positionProcessGroup(groupKey, layouts)
    for (const layout of positioned.layouts) {
      byOrbitalParticleId.set(layout.orbitalParticleId, layout)
      const ownerContent =
        mutableStateContent.get(layout.ownerDarkParticleId) ??
        new Map<number, StateGraphOrbitalContentSizing>()
      const existing = ownerContent.get(layout.stateId)
      ownerContent.set(
        layout.stateId,
        Object.freeze({
          minimumMajorRadius: Math.max(
            existing?.minimumMajorRadius ?? 0,
            positioned.orbitalContent.minimumMajorRadius,
          ),
          minimumTubeRadius: Math.max(
            existing?.minimumTubeRadius ?? 0,
            positioned.orbitalContent.minimumTubeRadius,
          ),
        }),
      )
      mutableStateContent.set(layout.ownerDarkParticleId, ownerContent)
      for (const proxy of layout.fieldProxies) {
        const existing =
          processOrbitalParticleIdByFieldProxyId.get(proxy.fieldProxyId)
        if (existing && existing !== layout.orbitalParticleId) {
          throw new Error(
            `Visual Field proxy ${proxy.fieldProxyId} belongs to multiple Process occurrences`,
          )
        }
        processOrbitalParticleIdByFieldProxyId.set(
          proxy.fieldProxyId,
          layout.orbitalParticleId,
        )
      }
    }
  }

  return Object.freeze({
    byOrbitalParticleId,
    processOrbitalParticleIdByFieldProxyId,
    stateOrbitalContentByOwner: new Map(
      [...mutableStateContent].map(([ownerId, content]) =>
        [ownerId, new Map(content)] as const
      ),
    ),
  })
}
