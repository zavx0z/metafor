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
const createDarkParticleInputNode = (descriptor: BulkDarkParticleInput): DarkParticleInputNode => ({
  descriptor,
  children: descriptor.children.map(createDarkParticleInputNode),
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

const fieldNucleusOuterRadius = (count: number, sphereRadius: number, padding: number): number => {
  const spacing = sphereRadius * 2 + Math.min(padding, sphereRadius * 0.2)
  return latticePoints(count).reduce(
    (outer, point) => Math.max(outer, Math.hypot(...point) * spacing + sphereRadius),
    0,
  )
}

const fitFieldSphereRadius = (
  count: number,
  requestedRadius: number,
  availableRadius: number,
  padding: number,
): number => {
  if (count <= 0) return requestedRadius
  const limit = Math.max(0.001, availableRadius)
  let low = 0.001
  let high = Math.max(low, requestedRadius)
  if (fieldNucleusOuterRadius(count, high, padding) <= limit) return high
  for (let iteration = 0; iteration < 48; iteration += 1) {
    const middle = (low + high) / 2
    if (fieldNucleusOuterRadius(count, middle, padding) <= limit) low = middle
    else high = middle
  }
  return low
}

const placeFieldNucleus = (fields: LayoutFieldParticleNode[], padding: number): void => {
  const points = latticePoints(fields.length)
  const sphereRadius = fields[0]?.sphereRadius ?? 0
  const spacing = sphereRadius * 2 + Math.min(padding, sphereRadius * 0.2)
  fields.forEach((field, index) => {
    const point = points[index] ?? [0, 0, 0]
    field.localX = point[0] * spacing
    field.localY = point[1] * spacing
    field.localZ = point[2] * spacing
  })
}

const placeChildrenOnLocalOrbit = (node: LayoutDarkParticleNode, padding: number): void => {
  const children = [...node.children]
  if (children.length === 0) return
  const density = Math.max(1, snapshotLayoutConfig.packingDensityCoefficient)
  const levelExtent = node.outerRadius * snapshotLayoutConfig.nestingCoefficient
  const edgePadding = Math.min(Math.max(0, padding), node.torusTube * 0.25)
  const availableRadius = Math.max(0.001, node.innerRadius - edgePadding)
  const separationSin = children.length === 1 ? 1 : Math.sin(Math.PI / children.length)
  const separationExtent = availableRadius * separationSin / (density + separationSin)
  const childOuterExtent = Math.max(0.001, Math.min(levelExtent, availableRadius, separationExtent))
  const orbitRadius = availableRadius - childOuterExtent * density
  const phase = hashAngle(`${node.darkParticleId}:${children.map((child) => child.darkParticleId).join(":")}`)

  children.forEach((child, index) => {
    // Only immediate Matter children occupy this owning Atom's planar orbit.
    // A nested child becomes the origin of its own orbit, so no descendant is
    // flattened into a root-authored row, sphere or global allocation.
    const angle = phase + index * Math.PI * 2 / children.length
    child.localX = Math.cos(angle) * orbitRadius
    child.localY = Math.sin(angle) * orbitRadius
    child.localZ = 0
    child.torusScale = childOuterExtent / Math.max(0.001, child.outerRadius)
  })
}

const materializeFractalDarkParticleNode = (
  node: DarkParticleInputNode,
  settings: BulkLayoutSettings,
): LayoutDarkParticleNode => {
  const descriptor = node.descriptor
  const outerRadius = snapshotLayoutConfig.rootOuterDiameterMm / 2
  const innerRadius = Math.min(outerRadius * 0.9, Math.max(0.001, settings.rootInnerDiameterMm / 2))
  const torusRadius = (innerRadius + outerRadius) / 2
  const torusTube = (outerRadius - innerRadius) / 2
  const padding = Math.max(0, settings.orbitEdgeGapMm)
  const sortedFields = [...descriptor.fieldParticles]
    .sort((left, right) => left.fieldId - right.fieldId || left.fieldParticleId.localeCompare(right.fieldParticleId))
  const sphereRadius = fitFieldSphereRadius(
    sortedFields.length,
    settings.rootSphereRadiusMm,
    Math.max(0.001, innerRadius - Math.min(padding, innerRadius * 0.1)),
    padding,
  )
  const fieldParticles = sortedFields.map((fieldParticle) =>
    cloneFieldParticleInput(descriptor, fieldParticle, sphereRadius))
  placeFieldNucleus(fieldParticles, padding)

  const children = node.children.map((child) => materializeFractalDarkParticleNode(child, settings))
  const materialized: LayoutDarkParticleNode = {
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
    children,
    fieldParticles,
    innerRadius,
    outerRadius,
  }
  placeChildrenOnLocalOrbit(materialized, padding)
  return materialized
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
 * - Monad-supplied sibling order is preserved on one immediate parent-local planar orbit;
 * - a child uniform transform scales its torus, label anchor, Fields and complete subtree;
 * - descendant frames compose recursively and never collapse into a root row or sphere;
 * - direct descendants stay inside a fixed parent envelope and never resize it;
 * - topology-owned WIMPs retain the real Boundary relation and never become fake nucleus Fields;
 * - State/Process/Reaction geometry is added later from the real Boundary declarations.
 */
export const createBulkManifestFromDarkParticleInputs = (
  rootSrc: string,
  roots: BulkDarkParticleInput[],
  settings: Partial<BulkLayoutSettings> = {},
): BulkManifest => {
  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const inputRoots = roots.map(createDarkParticleInputNode)
  const materializedRoots = inputRoots.map((root) => materializeFractalDarkParticleNode(root, resolvedSettings))
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
 * The scale changes only the physical unit of the already top-down manifestation. Recursive local
 * transforms remain unchanged, so the same one-level Atom law continues fractally at every depth.
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
