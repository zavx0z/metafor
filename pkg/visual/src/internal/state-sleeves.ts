import type {
  BulkDarkParticle,
  BulkManifest,
  BulkOrbitalParticle,
  BulkTransitionChannel,
} from "@metafor/types/bulk/manifest"
import type {StateGraph} from "../StateGraph.ts"
import type {
  StateGraphLayoutSizing,
  StateGraphLayoutNode,
  StateGraphRootLayout,
} from "../StateGraphLayout.ts"
import {
  STATE_GRAPH_PRODUCTION_SIZING,
  buildStateGraphBranchLayoutFromIndex,
  buildStateGraphHermiteEdgePath,
  indexStateGraphLayout,
} from "../StateGraphLayout.ts"
import {visualTransitionMaterial} from "../VisualMaterialSpec.ts"
import {
  visualOwnerDarkParticleIdFromAtomId,
  type VisualStateEdgePlacement,
  type VisualStateOccurrenceIdentity,
  type VisualOwnerGraph,
} from "./layout.ts"

export type WorldTransform = Readonly<{
  scale: number
  x: number
  y: number
  z: number
}>

type StateNodeOffset = Readonly<{
  node: StateGraphLayoutNode
  radius: number
  x: number
  y: number
  z: number
}>

export type StateSleevePackingEnvelope = Readonly<{
  disks: readonly StateSleevePackingDisk[]
  inwardExtent: number
}>

export type StateSleevePackingDisk = Readonly<{
  radius: number
  x: number
  y: number
}>

export type StateSleevePacking = Readonly<{
  angles: readonly number[]
  halfAngles: readonly number[]
  orbitRadius: number
}>

export type PreparedStateLayout = StateSleevePackingEnvelope & Readonly<{
  layout: StateGraphRootLayout
  levelOffsets: ReadonlyMap<number, number>
  offsets: readonly StateNodeOffset[]
  root: StateGraphLayoutNode
}>

export type StatePlacement = Readonly<{
  angle: number
  orbitRadius: number
  prepared: PreparedStateLayout
}>

export type OwnerStateLayouts = Readonly<{
  ownerAtomId: number
  layouts: readonly StateGraphRootLayout[]
}>

export type StateSleeveTransitionIndex = Readonly<{
  channelCount: number
  channelsByExactKey: ReadonlyMap<string, readonly BulkTransitionChannel[]>
  endpointKeys: ReadonlySet<string>
}>

const transitionEndpointKey = (
  ownerDarkParticleId: number,
  transitionId: number,
  fromOrbitalParticleId: string,
  toOrbitalParticleId: string,
): string => [
  ownerDarkParticleId,
  transitionId,
  fromOrbitalParticleId.length,
  fromOrbitalParticleId,
  toOrbitalParticleId.length,
  toOrbitalParticleId,
].join(":")

const transitionExactKey = (
  endpointKey: string,
  conditionFieldIds: readonly number[],
): string => [
  endpointKey,
  conditionFieldIds.length,
  ...conditionFieldIds,
].join(":")

/** Builds the canonical Transition lookup once for a complete Visual scene. */
export const indexStateSleeveTransitions = (
  manifest: BulkManifest,
): StateSleeveTransitionIndex => {
  const channels = manifest.transitionChannels ?? []
  const mutable = new Map<string, BulkTransitionChannel[]>()
  const endpointKeys = new Set<string>()
  for (const channel of channels) {
    const endpointKey = transitionEndpointKey(
      channel.parentDarkParticleId,
      channel.sourceId,
      channel.fromOrbitalParticleId,
      channel.toOrbitalParticleId,
    )
    endpointKeys.add(endpointKey)
    const key = transitionExactKey(
      endpointKey,
      channel.conditionFieldIds,
    )
    const endpointChannels = mutable.get(key)
    if (endpointChannels) endpointChannels.push(channel)
    else mutable.set(key, [channel])
  }
  return Object.freeze({
    channelCount: channels.length,
    channelsByExactKey: new Map(
      [...mutable].map(([key, endpointChannels]) => [
        key,
        Object.freeze([...endpointChannels]),
      ]),
    ),
    endpointKeys,
  })
}

export const buildStateSleeveEdges = (
  transitions: StateSleeveTransitionIndex,
  ownerDarkParticleId: number,
  layout: StateGraphRootLayout,
  occurrences: readonly VisualStateOccurrenceIdentity[],
): readonly VisualStateEdgePlacement[] => {
  const nodeById = new Map(layout.nodes.map((node) =>
    [node.id, node] as const
  ))
  const occurrenceByNodeId = new Map(occurrences.map((occurrence) =>
    [occurrence.nodeId, occurrence] as const
  ))
  const matchedChannelIds = new Set<string>()
  return Object.freeze(layout.edges.map((edge) => {
    const fromNode = nodeById.get(edge.fromNodeId)
    const toNode = nodeById.get(edge.toNodeId)
    const fromOccurrence = occurrenceByNodeId.get(edge.fromNodeId)
    const toOccurrence = occurrenceByNodeId.get(edge.toNodeId)
    if (!fromNode || !toNode || !fromOccurrence || !toOccurrence) {
      throw new Error(`Visual State edge ${edge.id} has no endpoint`)
    }
    const endpointKey = transitionEndpointKey(
      ownerDarkParticleId,
      edge.transitionId,
      fromOccurrence.orbitalParticleId,
      toOccurrence.orbitalParticleId,
    )
    const channels = transitions.channelsByExactKey.get(
      transitionExactKey(endpointKey, edge.conditionFieldIds),
    ) ?? []
    const channel = channels[0]
    if (transitions.channelCount > 0 &&
      transitions.endpointKeys.has(endpointKey) &&
      channels.length === 0) {
      throw new Error(
        `Visual State edge ${edge.id} has inconsistent condition Field proxy metadata`,
      )
    }
    if (
      transitions.channelCount > 0 &&
      (
        channels.length !== 1 ||
        channel === undefined ||
        matchedChannelIds.has(channel.transitionChannelId)
      )
    ) {
      throw new Error(
        `Visual State edge ${edge.id} does not match one canonical Transition`,
      )
    }
    if (channel) matchedChannelIds.add(channel.transitionChannelId)
    return Object.freeze({
      edgeId: edge.id,
      fromNodeId: edge.fromNodeId,
      material: visualTransitionMaterial(
        edge.returning,
        channel?.active ?? true,
      ),
      path: buildStateGraphHermiteEdgePath(edge, fromNode, toNode),
      returning: edge.returning,
      toNodeId: edge.toNodeId,
      transitionChannelId: channel?.transitionChannelId ?? null,
      transitionId: edge.transitionId,
    })
  }))
}

export type StateSleeveOccurrenceIndex = Readonly<{
  byOwnerAndRoot: ReadonlyMap<string, readonly BulkOrbitalParticle[]>
}>

const occurrenceOwnerRootKey = (
  ownerDarkParticleId: number,
  rootStateId: number,
): string => `${ownerDarkParticleId}:${rootStateId}`

/** Indexes manifested State occurrences once for every complete scene. */
export const indexStateSleeveOccurrences = (
  manifest: BulkManifest,
): StateSleeveOccurrenceIndex => {
  const mutable = new Map<string, BulkOrbitalParticle[]>()
  for (const particle of manifest.orbitalParticles ?? []) {
    if (
      particle.orbitalParticleKind !== "state" ||
      particle.sleeveRootStateId === null
    ) continue
    const key = occurrenceOwnerRootKey(
      particle.parentDarkParticleId,
      particle.sleeveRootStateId,
    )
    const occurrences = mutable.get(key)
    if (occurrences) occurrences.push(particle)
    else mutable.set(key, [particle])
  }
  return Object.freeze({
    byOwnerAndRoot: new Map(
      [...mutable].map(([key, occurrences]) =>
        [key, Object.freeze([...occurrences])] as const
      ),
    ),
  })
}

/**
 * Resolves the exact manifested State occurrence for every production layout
 * node. Consumers never need to parse the layout node id themselves.
 */
export const identifyStateLayoutOccurrences = (
  occurrenceIndex: StateSleeveOccurrenceIndex,
  ownerAtomId: number,
  ownerDarkParticleId: number,
  layout: StateGraphRootLayout,
): readonly VisualStateOccurrenceIdentity[] => {
  const manifested = occurrenceIndex.byOwnerAndRoot.get(
    occurrenceOwnerRootKey(
      ownerDarkParticleId,
      layout.rootStateId,
    ),
  ) ?? []
  const particleById = new Map(manifested.map((particle) =>
    [particle.orbitalParticleId, particle] as const
  ))
  const occurrences = layout.nodes.map((node) => {
    if (node.end === "missing-state") {
      throw new Error(
        `Visual State layout ${layout.rootStateId} contains unmanifested State ${node.stateId}`,
      )
    }
    const prefix = `root/${layout.rootStateId}/path/`
    const suffix = `/state/${node.stateId}`
    if (!node.id.startsWith(prefix) || !node.id.endsWith(suffix)) {
      throw new Error(
        `Visual State layout node ${node.id} has no occurrence identity`,
      )
    }
    const transitionPath = node.id.slice(
      prefix.length,
      node.id.length - suffix.length,
    )
    if (transitionPath.length === 0 || transitionPath.includes("/")) {
      throw new Error(
        `Visual State layout node ${node.id} has an invalid transition path`,
      )
    }
    const orbitalParticleId =
      `atom/${ownerAtomId}/sleeve/${layout.rootStateId}` +
      `/state/${node.stateId}/path/${transitionPath}`
    const particle = particleById.get(orbitalParticleId)
    if (!particle || particle.sourceId !== node.stateId) {
      throw new Error(
        `Visual State occurrence ${orbitalParticleId} is absent from manifest`,
      )
    }
    return {nodeId: node.id, orbitalParticleId}
  })
  const resolvedIds = new Set(occurrences.map((occurrence) =>
    occurrence.orbitalParticleId
  ))
  if (
    resolvedIds.size !== occurrences.length ||
    resolvedIds.size !== particleById.size
  ) {
    throw new Error(
      `Visual State sleeve ${ownerDarkParticleId}/${layout.rootStateId} does not match manifested occurrences`,
    )
  }
  return occurrences
}

export const indexOwnerStateLayouts = (
  manifest: BulkManifest,
  owners: readonly VisualOwnerGraph[],
  requireComplete: boolean,
  orbitalContentByOwner: ReadonlyMap<
    number,
    NonNullable<StateGraphLayoutSizing["orbitalContentByStateId"]>
  > = new Map(),
): ReadonlyMap<number, OwnerStateLayouts> => {
  const particlesById = new Map(
    manifest.darkParticles.map((particle) =>
      [particle.darkParticleId, particle] as const
    ),
  )
  const layoutsByOwner = new Map<
    number,
    OwnerStateLayouts
  >()
  const stateParticlesByOwner = Map.groupBy(
    (manifest.orbitalParticles ?? []).filter((particle) =>
      particle.orbitalParticleKind === "state"
    ),
    (particle) => particle.parentDarkParticleId,
  )
  for (const owner of owners) {
    if (layoutsByOwner.has(owner.ownerDarkParticleId)) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} is duplicated`,
      )
    }
    const particle = particlesById.get(owner.ownerDarkParticleId)
    if (!particle) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} is absent from manifest`,
      )
    }
    const expectedOwnerDarkParticleId =
      visualOwnerDarkParticleIdFromAtomId(owner.graph.atomId)
    if (
      particle.darkParticleKind !== "atom" ||
      owner.ownerDarkParticleId !== expectedOwnerDarkParticleId
    ) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} does not match Atom ${owner.graph.atomId}`,
      )
    }
    if (particle.src === null || particle.src !== owner.graph.src) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} source does not match graph`,
      )
    }
    const manifestedStates = stateParticlesByOwner.get(
      owner.ownerDarkParticleId,
    ) ?? []
    const manifestedStateIds = [...new Set(
      manifestedStates.map((state) => state.sourceId),
    )].sort((left, right) => left - right)
    const graphStateIds = [...new Set(
      owner.graph.states.map((state) => state.id),
    )].sort((left, right) => left - right)
    if (
      manifestedStateIds.length !== graphStateIds.length ||
      manifestedStateIds.some((id, index) => id !== graphStateIds[index])
    ) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} State identities do not match graph`,
      )
    }
    const manifestedCurrentIds = [...new Set(
      manifestedStates
        .filter((state) => state.current)
        .map((state) => state.sourceId),
    )]
    if (manifestedCurrentIds.length > 1) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} has multiple current manifested States`,
      )
    }
    const graphCurrentIds = [...new Set(
      owner.graph.states
        .filter((state) => state.current)
        .map((state) => state.id),
    )]
    if (
      graphCurrentIds.length > 1 ||
      (graphCurrentIds[0] ?? null) !== owner.graph.currentStateId
    ) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} has inconsistent graph current State`,
      )
    }
    const manifestedCurrentStateId = manifestedCurrentIds[0] ?? null
    if (manifestedCurrentStateId !== owner.graph.currentStateId) {
      throw new Error(
        `Visual owner ${owner.ownerDarkParticleId} current State does not match graph`,
      )
    }
    const graphIndex = indexStateGraphLayout(owner.graph)
    const orbitalContentByStateId =
      orbitalContentByOwner.get(owner.ownerDarkParticleId)
    const sizing = orbitalContentByStateId
      ? {
          ...STATE_GRAPH_PRODUCTION_SIZING,
          orbitalContentByStateId,
        }
      : STATE_GRAPH_PRODUCTION_SIZING
    layoutsByOwner.set(
      owner.ownerDarkParticleId,
      {
        ownerAtomId: owner.graph.atomId,
        layouts: owner.graph.states.map((state) =>
          buildStateGraphBranchLayoutFromIndex(
            graphIndex,
            state.id,
            sizing,
          )
        ),
      },
    )
  }
  if (requireComplete) {
    for (const ownerDarkParticleId of stateParticlesByOwner.keys()) {
      if (!layoutsByOwner.has(ownerDarkParticleId)) {
        throw new Error(
          `Visual State owner ${ownerDarkParticleId} is missing a graph binding`,
        )
      }
    }
  }
  return layoutsByOwner
}

const finiteExtent = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const STATE_NODE_GAP_TO_FIELD_RADIUS = 2

export const stateNodeSurfaceGap = (fieldRadius: number): number =>
  fieldRadius * STATE_NODE_GAP_TO_FIELD_RADIUS

export const packStateSleeves = (
  sleeves: readonly StateSleevePackingEnvelope[],
  minimumOrbitRadius: number,
  gap: number,
  phase: number,
): StateSleevePacking => {
  if (sleeves.length === 0) {
    return {angles: [], halfAngles: [], orbitRadius: 0}
  }
  const safeMinimumOrbit = finiteExtent(minimumOrbitRadius)
  if (sleeves.length === 1) {
    return {
      angles: [Number.isFinite(phase) ? phase : 0],
      halfAngles: [Math.PI],
      orbitRadius: safeMinimumOrbit,
    }
  }

  const safeGap = finiteExtent(gap)
  let baselineOrbitRadius = safeMinimumOrbit
  for (const sleeve of sleeves) {
    baselineOrbitRadius = Math.max(
      baselineOrbitRadius,
      finiteExtent(sleeve.inwardExtent) + safeGap * 0.5 + 1e-6,
    )
  }

  const angularDemandsAt = (
    orbitRadius: number,
  ): Readonly<{demands: readonly number[]; sum: number}> => {
    const demands = new Array<number>(sleeves.length)
    let sum = 0
    for (let index = 0; index < sleeves.length; index += 1) {
      let demand = 0
      for (const disk of sleeves[index]!.disks) {
        const inflatedRadius = finiteExtent(disk.radius) + safeGap * 0.5
        const x = Number.isFinite(disk.x) ? disk.x : 0
        const y = Number.isFinite(disk.y) ? disk.y : 0
        const centerX = orbitRadius + x
        const centerDistance = Math.hypot(centerX, y)
        demand = Math.max(
          demand,
          Math.abs(Math.atan2(y, centerX)) +
            Math.asin(Math.min(1, inflatedRadius / centerDistance)),
        )
      }
      demands[index] = Math.max(demand, 1e-6)
      sum += demands[index]!
    }
    return {demands, sum}
  }

  const baselineDemands = angularDemandsAt(baselineOrbitRadius)
  let halfAngles = baselineDemands.demands.map((demand) =>
    baselineDemands.sum <= Math.PI
      ? demand + (Math.PI - baselineDemands.sum) / sleeves.length
      : demand * Math.PI / baselineDemands.sum
  )
  let orbitRadius = baselineOrbitRadius
  if (baselineDemands.sum > Math.PI) {
    for (let index = 0; index < sleeves.length; index += 1) {
      const sine = Math.sin(halfAngles[index]!)
      const cosine = Math.cos(halfAngles[index]!)
      for (const disk of sleeves[index]!.disks) {
        const inflatedRadius = finiteExtent(disk.radius) + safeGap * 0.5
        orbitRadius = Math.max(
          orbitRadius,
          (
            inflatedRadius +
            Math.abs(Number.isFinite(disk.y) ? disk.y : 0) * cosine
          ) / sine -
            (Number.isFinite(disk.x) ? disk.x : 0),
        )
      }
    }
    const candidateOrbitRadius = (baselineOrbitRadius + orbitRadius) * 0.5
    const candidateDemands = angularDemandsAt(candidateOrbitRadius)
    if (candidateDemands.sum <= Math.PI) {
      orbitRadius = candidateOrbitRadius
      halfAngles = candidateDemands.demands.map((demand) =>
        demand + (Math.PI - candidateDemands.sum) / sleeves.length
      )
    }
  }

  const startAngle = Number.isFinite(phase) ? phase : 0
  const angles = new Array<number>(sleeves.length)
  angles[0] = startAngle
  for (let index = 1; index < sleeves.length; index += 1) {
    angles[index] =
      angles[index - 1]! +
      halfAngles[index - 1]! +
      halfAngles[index]!
  }
  return {angles, halfAngles, orbitRadius}
}

export const mergeStateSleeves = (
  layouts: readonly StateGraphRootLayout[],
): StateGraphRootLayout => ({
  rootStateId: layouts[0]?.rootStateId ?? 0,
  levels: layouts.flatMap((layout) => layout.levels),
  nodes: layouts.flatMap((layout) => layout.nodes),
  edges: layouts.flatMap((layout) => layout.edges),
})

export const stateSleevePhase = (
  particle: BulkDarkParticle,
  layouts: readonly PreparedStateLayout[],
): number => {
  const firstRootStateId = layouts[0]?.layout.rootStateId
  if (firstRootStateId === undefined) return 0
  const identity =
    `${particle.darkParticleId}:${firstRootStateId}:${layouts.length}`
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

export const prepareStateLayout = (
  layout: StateGraphRootLayout,
): PreparedStateLayout | null => {
  const root = layout.nodes.find(
    (node) => node.stateId === layout.rootStateId,
  )
  if (!root) return null
  const offsets = layout.nodes.map((node) => ({
    node,
    radius: node.radius,
    x: node.x - root.x,
    y: node.y - root.y,
    z: node.z - root.z,
  }))
  return {
    disks: offsets,
    inwardExtent: Math.max(
      root.radius,
      ...offsets.map((offset) => offset.node.radius - offset.x),
    ),
    layout,
    levelOffsets: new Map(layout.levels.map((level) => [
      level.step,
      level.x - root.x,
    ])),
    offsets,
    root,
  }
}

export const stateInnerOrbitRadius = (
  layouts: readonly PreparedStateLayout[],
  innerBoundary: number,
  gap: number,
): number => Math.max(
  innerBoundary + gap,
  ...layouts.flatMap((layout) =>
    layout.offsets.map((offset) => {
      const requiredInnerEdge =
        innerBoundary + gap + offset.node.radius
      if (Math.abs(offset.y) >= requiredInnerEdge) return 0
      return Math.sqrt(
        requiredInnerEdge ** 2 - offset.y ** 2,
      ) - offset.x
    })
  ),
)

export const worldPoint = (
  transform: WorldTransform,
  x: number,
  y: number,
  z: number,
): Readonly<{x: number; y: number; z: number}> => ({
  x: transform.x + x * transform.scale,
  y: transform.y + y * transform.scale,
  z: transform.z + z * transform.scale,
})

export const placeStateLayout = (
  placement: StatePlacement,
  transform: WorldTransform,
): StateGraphRootLayout => {
  const radialX = Math.cos(placement.angle)
  const radialY = Math.sin(placement.angle)
  const tangentX = -radialY
  const tangentY = radialX
  const localPoint = (
    x: number,
    y: number,
    z: number,
  ): Readonly<{x: number; y: number; z: number}> => worldPoint(
    transform,
    radialX * (placement.orbitRadius + x) + tangentX * y,
    radialY * (placement.orbitRadius + x) + tangentY * y,
    z,
  )
  const offsets = new Map(
    placement.prepared.offsets.map((offset) => [
      offset.node.id,
      offset,
    ] as const),
  )

  return {
    ...placement.prepared.layout,
    nodes: placement.prepared.layout.nodes.map((node) => {
      const offset = offsets.get(node.id) ?? {x: 0, y: 0, z: 0}
      return {
        ...node,
        ...localPoint(offset.x, offset.y, offset.z),
        fieldRadius: node.fieldRadius * transform.scale,
        innerRadius: node.innerRadius * transform.scale,
        radius: node.radius * transform.scale,
      }
    }),
    levels: placement.prepared.layout.levels.map((level) => {
      const x = placement.prepared.levelOffsets.get(level.step) ?? 0
      return {
        ...level,
        x: localPoint(x, 0, 0).x,
      }
    }),
  }
}
