import type { BulkDarkParticle, BulkDarkParticleActivity, BulkDarkParticleKind, BulkDarkParticleInput, BulkFieldParticle, BulkFieldParticleInput, BulkFieldParticleKind, BulkManifest } from "@metafor/types/bulk/manifest"
import type { DarkParticleInputNode, LayoutDarkParticleNode, LayoutFieldParticleNode, OrbitItem } from "@metafor/types/bulk/layout"
import type { BulkLayoutSettings } from "@metafor/types/bulk/settings"
import {
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
} from "./settings"

const snapshotLayoutConfig = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const cloneFieldParticleInput = (
  descriptor: BulkDarkParticleInput,
  fieldParticle: BulkFieldParticleInput,
  sphereRadius: number,
): LayoutFieldParticleNode => ({
  fieldParticleId: fieldParticle.fieldParticleId,
  fieldId: fieldParticle.fieldId,
  parentDarkParticleId: descriptor.darkParticleId,
  fieldKey: fieldParticle.fieldKey,
  fieldLabel: fieldParticle.fieldLabel,
  fieldParticleKind: fieldParticle.fieldParticleKind,
  valueText: fieldParticle.valueText,
  localX: 0,
  localY: 0,
  localZ: 0,
  sphereRadius,
  colorR: fieldParticle.colorR,
  colorG: fieldParticle.colorG,
  colorB: fieldParticle.colorB,
  extent: sphereRadius,
})

const hashAngle = (value: string | number): number => {
  const text = String(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2
}

const moveOrbitItem = (item: OrbitItem, radius: number, angle: number): void => {
  const x = Math.cos(angle) * radius
  const y = Math.sin(angle) * radius

  if (item.kind === "darkParticle") {
    item.darkParticle.localX = x
    item.darkParticle.localY = y
    item.darkParticle.localZ = 0
    return
  }

  item.fieldParticle.localX = x
  item.fieldParticle.localY = y
  item.fieldParticle.localZ = 0
}

const placeOrbitItemsByBands = (
  items: OrbitItem[],
  options: {
    phase?: number
    paddingMm?: number
    startOuterBoundary?: number
  } = {},
): { innerBoundary: number; outerBoundary: number } => {
  const start = Math.max(0, options.startOuterBoundary ?? 0)
  if (items.length === 0) return { innerBoundary: start, outerBoundary: start }

  let outerBoundary = start
  const paddingMm = Math.max(0, options.paddingMm ?? 0)
  const phase = options.phase ?? 0

  items.forEach((item, index) => {
    const orbitRadius = outerBoundary + paddingMm + item.extent
    moveOrbitItem(item, orbitRadius, phase + index * GOLDEN_ANGLE)
    outerBoundary = orbitRadius + item.extent
  })

  return {
    innerBoundary: start,
    outerBoundary: outerBoundary + paddingMm,
  }
}
const createDarkParticleInputNode = (
  descriptor: BulkDarkParticleInput,
  depthFromRoot: number,
): DarkParticleInputNode => ({
  descriptor,
  depthFromRoot,
  children: descriptor.children.map((child) => createDarkParticleInputNode(child, depthFromRoot + 1)),
})

const latticePoints = (count: number): Array<[number, number, number]> => {
  if (count <= 0) return []
  const points: Array<[number, number, number]> = [[0, 0, 0]]
  for (let shell = 1; points.length < count; shell += 1) {
    const shellPoints: Array<[number, number, number]> = []
    for (let z = -shell; z <= shell; z += 1) {
      for (let y = -shell; y <= shell; y += 1) {
        for (let x = -shell; x <= shell; x += 1) {
          if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== shell) continue
          shellPoints.push([x, y, z])
        }
      }
    }
    shellPoints.sort((left, right) =>
      Math.hypot(...left) - Math.hypot(...right) ||
      left[2] - right[2] || left[1] - right[1] || left[0] - right[0],
    )
    points.push(...shellPoints)
  }
  return points.slice(0, count)
}

const placeFieldNucleus = (
  fields: LayoutFieldParticleNode[],
  padding: number,
): number => {
  const points = latticePoints(fields.length)
  const requestedRadius = fields[0]?.sphereRadius ?? 0
  const spacing = requestedRadius * 2 + Math.min(padding, requestedRadius * 0.2)
  let outerRadius = 0
  fields.forEach((field, index) => {
    const point = points[index] ?? [0, 0, 0]
    field.localX = point[0] * spacing
    field.localY = point[1] * spacing
    field.localZ = point[2] * spacing
    outerRadius = Math.max(outerRadius, Math.hypot(field.localX, field.localY, field.localZ) + field.sphereRadius)
  })
  return outerRadius
}

const targetWimpExtent = (particle: LayoutDarkParticleNode, baseRadius: number): number =>
  baseRadius * 2.2 * Math.max(0.95, Math.min(1.65, 0.86 + Math.log2(1 + particle.contentWeight) * 0.12))

const placeChildrenOnTopologyOrbit = (
  topologyId: number,
  children: LayoutDarkParticleNode[],
  baseRadius: number,
  padding: number,
): {radius: number; tube: number} => {
  if (children.length === 0) {
    return {radius: baseRadius * 1.6, tube: baseRadius * 0.55}
  }
  const sorted = [...children].sort((left, right) =>
    left.contentWeight - right.contentWeight || left.darkParticleId - right.darkParticleId,
  )
  const extents = sorted.map((child) => {
    const target = targetWimpExtent(child, baseRadius)
    child.torusScale = target / Math.max(1, child.outerRadius)
    return target
  })
  const maxExtent = Math.max(...extents)
  const circumferenceRadius = extents.reduce((sum, extent) => sum + extent * 2 + padding, 0) / (Math.PI * 2)
  const collisionRadius = sorted.length <= 1
    ? baseRadius * 2.2 + maxExtent
    : maxExtent / Math.max(0.08, Math.sin(Math.PI / sorted.length)) + padding
  const firstOrbitRadius = Math.max(baseRadius * 2.2 + maxExtent, circumferenceRadius, collisionRadius)
  const radialSpread = sorted.length <= 1 ? 0 : maxExtent + padding
  const phase = hashAngle(`${topologyId}:${sorted.map((child) => child.darkParticleId).join(":")}`)
  sorted.forEach((child, index) => {
    const angle = phase + (Math.PI * 2 * index) / sorted.length
    const radius = firstOrbitRadius + radialSpread * index / Math.max(1, sorted.length - 1)
    child.localX = Math.cos(angle) * radius
    child.localY = Math.sin(angle) * radius
    child.localZ = 0
  })
  const innerBoundary = Math.min(...sorted.map((child, index) =>
    Math.hypot(child.localX, child.localY) - extents[index]! - padding,
  ))
  const outerBoundary = Math.max(...sorted.map((child, index) =>
    Math.hypot(child.localX, child.localY) + extents[index]! + padding,
  ))
  return {
    radius: (innerBoundary + outerBoundary) / 2,
    tube: (outerBoundary - innerBoundary) / 2,
  }
}

const materializeContentAwareDarkParticleNode = (
  node: DarkParticleInputNode,
  settings: BulkLayoutSettings,
): LayoutDarkParticleNode => {
  const nestedChildren = node.children.map((child) => materializeContentAwareDarkParticleNode(child, settings))
  const depthFromRoot = node.depthFromRoot
  const descriptor = node.descriptor
  const sphereRadius = settings.rootSphereRadiusMm
  const padding = Math.max(settings.orbitEdgeGapMm, sphereRadius * 0.18)
  const fieldParticles: LayoutFieldParticleNode[] = [...descriptor.fieldParticles]
    .sort((left, right) => left.fieldId - right.fieldId || left.fieldParticleId.localeCompare(right.fieldParticleId))
    .map((fieldParticle) => cloneFieldParticleInput(descriptor, fieldParticle, sphereRadius))

  const nucleusRadius = placeFieldNucleus(fieldParticles, padding)
  const childWeight = nestedChildren.reduce((sum, child) => sum + child.contentWeight * 0.28, 0)
  const ownComplexity = descriptor.orbitalComplexity
  const orbitalWeight = ownComplexity
    ? ownComplexity.states + ownComplexity.transitions * 0.7 + ownComplexity.processes * 1.35 + ownComplexity.reactions * 1.6
    : 0
  const contentWeight = Math.max(1, fieldParticles.length + orbitalWeight + childWeight)

  let torusRadius: number
  let torusTube: number
  let innerRadius: number
  let outerRadius: number

  if (descriptor.darkParticleKind === "axion") {
    const orbit = placeChildrenOnTopologyOrbit(
      descriptor.darkParticleId,
      nestedChildren.filter((child) => child.darkParticleKind === "wimp"),
      sphereRadius * 0.72,
      padding,
    )
    torusRadius = orbit.radius
    torusTube = Math.max(sphereRadius * 0.55, orbit.tube)
    innerRadius = torusRadius - torusTube
    outerRadius = torusRadius + torusTube
  } else {
    innerRadius = nucleusRadius > 0
      ? nucleusRadius + padding
      : depthFromRoot === 0
        ? settings.rootInnerDiameterMm / 2
        : sphereRadius * 2.3
    const orbitalTube = sphereRadius * Math.max(2.15, Math.sqrt(Math.max(1, orbitalWeight)) * 0.72)
    outerRadius = innerRadius + Math.max(sphereRadius * 2.4, orbitalTube * 2)
    torusRadius = (innerRadius + outerRadius) / 2
    torusTube = (outerRadius - innerRadius) / 2
  }

  return {
    darkParticleId: descriptor.darkParticleId,
    darkParticleKind: descriptor.darkParticleKind,
    src: descriptor.src,
    metaSrc: descriptor.metaSrc,
    label: descriptor.label,
    localX: 0,
    localY: 0,
    localZ: 0,
    torusScale: 1,
    torusRadius,
    torusTube,
    colorR: descriptor.colorR,
    colorG: descriptor.colorG,
    colorB: descriptor.colorB,
    activity: descriptor.activity ?? "neutral",
    children: nestedChildren,
    contentWeight,
    fieldParticles,
    depthFromRoot,
    innerRadius,
    outerRadius,
  }
}

const sharedCenterChildren = (node: LayoutDarkParticleNode): LayoutDarkParticleNode[] =>
  node.children
    .filter((child) => child.darkParticleKind !== "axion")
    .sort((left, right) => left.contentWeight - right.contentWeight || left.darkParticleId - right.darkParticleId)

const sharedCenterBandDemand = (
  node: LayoutDarkParticleNode,
  sphereRadius: number,
  padding: number,
): number => {
  const children = sharedCenterChildren(node)
  const ownMinimum = Math.max(sphereRadius * 2.4, node.outerRadius - node.innerRadius)
  const childrenMinimum = children.length === 0
    ? 0
    : children.reduce((sum, child) => sum + sharedCenterBandDemand(child, sphereRadius, padding), 0) +
      padding * Math.max(0, children.length - 1)
  return Math.max(ownMinimum, childrenMinimum) + sphereRadius * 2.4
}

const placeSharedCenterBands = (
  node: LayoutDarkParticleNode,
  innerRadius: number,
  outerRadius: number,
  sphereRadius: number,
  padding: number,
): void => {
  node.localX = 0
  node.localY = 0
  node.localZ = 0
  node.torusScale = 1
  node.innerRadius = innerRadius
  node.outerRadius = outerRadius
  node.torusRadius = (innerRadius + outerRadius) / 2
  node.torusTube = (outerRadius - innerRadius) / 2

  const children = sharedCenterChildren(node)
  if (children.length > 0) {
    const demands = children.map((child) => sharedCenterBandDemand(child, sphereRadius, padding))
    const totalDemand = demands.reduce((sum, demand) => sum + demand, 0)
    const edgeInset = Math.min(sphereRadius * 1.2, (outerRadius - innerRadius) * 0.18)
    const usableWidth = Math.max(1, outerRadius - innerRadius - edgeInset * 2 - padding * Math.max(0, children.length - 1))
    const scale = Math.min(1, usableWidth / Math.max(1, totalDemand))
    let cursor = innerRadius + edgeInset
    children.forEach((child, index) => {
      const width = demands[index]! * scale
      placeSharedCenterBands(child, cursor, cursor + width, sphereRadius, padding)
      cursor += width + padding
    })
  }

  const axions = node.children.filter((child) => child.darkParticleKind === "axion")
  const axionOrbit = innerRadius + (outerRadius - innerRadius) * 0.34
  axions.forEach((child, index) => {
    const angle = hashAngle(`${node.darkParticleId}:axion:${child.darkParticleId}`)
    child.torusScale = 1
    child.localX = Math.cos(angle) * axionOrbit
    child.localY = Math.sin(angle) * axionOrbit
    child.localZ = (index % 2 === 0 ? 1 : -1) * (outerRadius - innerRadius) * 0.12
  })
}

const placeSharedFieldNucleusAndTori = (
  root: LayoutDarkParticleNode,
  settings: BulkLayoutSettings,
): void => {
  const sphereRadius = settings.rootSphereRadiusMm
  const padding = Math.max(settings.orbitEdgeGapMm, sphereRadius * 0.18)
  const fields: LayoutFieldParticleNode[] = []
  const collect = (node: LayoutDarkParticleNode): void => {
    fields.push(...node.fieldParticles)
    sharedCenterChildren(node).forEach(collect)
  }
  collect(root)
  fields.sort((left, right) =>
    left.parentDarkParticleId - right.parentDarkParticleId ||
    left.fieldId - right.fieldId ||
    left.fieldParticleId.localeCompare(right.fieldParticleId),
  )

  const nucleusRadius = placeFieldNucleus(fields, padding)
  const innerRadius = nucleusRadius > 0 ? nucleusRadius + padding : settings.rootInnerDiameterMm / 2
  const outerRadius = innerRadius + Math.max(
    sphereRadius * 8,
    sharedCenterBandDemand(root, sphereRadius, padding),
    sphereRadius * Math.sqrt(root.contentWeight) * 1.8,
  )
  placeSharedCenterBands(root, innerRadius, outerRadius, sphereRadius, padding)
}
const flattenDarkParticleNode = (
  node: LayoutDarkParticleNode,
  parentDarkParticleId: number | null,
  depth: number,
  darkParticleOrder: number,
  darkParticles: BulkDarkParticle[],
  fieldParticles: BulkFieldParticle[],
): void => {
  darkParticles.push({
    darkParticleId: node.darkParticleId,
    parentDarkParticleId,
    darkParticleKind: node.darkParticleKind,
    src: node.src,
    metaSrc: node.metaSrc,
    label: node.label,
    depth,
    darkParticleOrder,
    localX: node.localX,
    localY: node.localY,
    localZ: node.localZ,
    torusScale: node.torusScale,
    torusRadius: node.torusRadius,
    torusTube: node.torusTube,
    colorR: node.colorR,
    colorG: node.colorG,
    colorB: node.colorB,
    activity: node.activity ?? "neutral",
  })

  node.fieldParticles.forEach((fieldParticle) => {
    fieldParticles.push({
      fieldParticleId: fieldParticle.fieldParticleId,
      fieldId: fieldParticle.fieldId,
      parentDarkParticleId: node.darkParticleId,
      fieldKey: fieldParticle.fieldKey,
      fieldLabel: fieldParticle.fieldLabel,
      fieldParticleKind: fieldParticle.fieldParticleKind,
      valueText: fieldParticle.valueText,
      localX: fieldParticle.localX,
      localY: fieldParticle.localY,
      localZ: fieldParticle.localZ,
      sphereRadius: fieldParticle.sphereRadius,
      colorR: fieldParticle.colorR,
      colorG: fieldParticle.colorG,
      colorB: fieldParticle.colorB,
    })
  })

  node.children.forEach((child, childOrder) => {
    flattenDarkParticleNode(child, node.darkParticleId, depth + 1, childOrder, darkParticles, fieldParticles)
  })
}

/**
 * Builds a recursive Bulk manifest from a semantic Dark particle tree.
 *
 * Layout law:
 * - the scene stays `Z-up`;
 * - all Fields of one static WIMP/Fuzzy/MACHO subtree form one compact three-dimensional nucleus;
 * - enum/array topology is present in that nucleus through its real Field sphere;
 * - static WIMP, Fuzzy and MACHO tori share the root center and occupy nested radial bands inside the parent torus volume;
 * - topology-owned WIMPs stay inside those bands and never become fake nucleus Fields;
 * - State/Process/Reaction geometry is added later from the real Boundary declarations.
 */
export const createBulkManifestFromDarkParticleInputs = (
  rootSrc: string,
  roots: BulkDarkParticleInput[],
  settings: Partial<BulkLayoutSettings> = {},
): BulkManifest => {
  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const inputRoots = roots.map((root) => createDarkParticleInputNode(root, 0))
  const materializedRoots = inputRoots.map((root) => materializeContentAwareDarkParticleNode(root, resolvedSettings))
  materializedRoots.forEach((root) => placeSharedFieldNucleusAndTori(root, resolvedSettings))
  const [mainRoot, ...otherRoots] = materializedRoots
  if (mainRoot) {
    mainRoot.localX = 0
    mainRoot.localY = 0
    mainRoot.localZ = 0
  }
  placeOrbitItemsByBands(
    otherRoots.map((darkParticle) => ({
      kind: "darkParticle" as const,
      darkParticle,
      extent: darkParticle.outerRadius,
    })),
    {
      paddingMm: resolvedSettings.orbitEdgeGapMm,
      phase: mainRoot ? hashAngle(mainRoot.darkParticleId) : 0,
      startOuterBoundary: mainRoot?.outerRadius ?? 0,
    },
  )

  const darkParticles: BulkDarkParticle[] = []
  const fieldParticles: BulkFieldParticle[] = []

  materializedRoots.forEach((root, rootOrder) => {
    flattenDarkParticleNode(root, null, 0, rootOrder, darkParticles, fieldParticles)
  })

  return {
    rootSrc,
    darkParticles,
    fieldParticles,
  }
}

/**
 * Uniformly scales a manifest so the main root Dark particle keeps the fixed outer torus diameter.
 *
 * The scale is applied globally to the whole manifest. Local subtree correction is intentionally not
 * performed: bottom-up topology has already been calculated during materialization, and reflowing
 * after scale would break the contract where children define parent size.
 */
export const scaleBulkManifestToRootOuterDiameter = (
  manifest: BulkManifest,
  targetOuterDiameter: number = snapshotLayoutConfig.rootOuterDiameterMm,
  _settings: Partial<BulkLayoutSettings> = {},
): BulkManifest => {
  const rootOuterRadius = manifest.darkParticles
    .filter((darkParticle) => darkParticle.parentDarkParticleId === null)
    .reduce((max, darkParticle) => Math.max(max, darkParticle.torusRadius + darkParticle.torusTube), 0)

  if (rootOuterRadius <= 0 || targetOuterDiameter <= 0) {
    return manifest
  }

  const scale = targetOuterDiameter / (rootOuterRadius * 2)
  if (!Number.isFinite(scale) || scale <= 0) {
    return manifest
  }

  return {
    rootSrc: manifest.rootSrc,
    darkParticles: manifest.darkParticles.map((darkParticle) => ({
      ...darkParticle,
      localX: darkParticle.localX * scale,
      localY: darkParticle.localY * scale,
      localZ: darkParticle.localZ * scale,
      torusRadius: darkParticle.torusRadius * scale,
      torusTube: darkParticle.torusTube * scale,
    })),
    fieldParticles: manifest.fieldParticles.map((fieldParticle) => ({
      ...fieldParticle,
      localX: fieldParticle.localX * scale,
      localY: fieldParticle.localY * scale,
      localZ: fieldParticle.localZ * scale,
      sphereRadius: fieldParticle.sphereRadius * scale,
    })),
  }
}
