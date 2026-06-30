import type {
  BulkDarkParticle,
  BulkDarkParticleActivity,
  BulkDarkParticleKind,
  BulkFieldParticle,
  BulkFieldParticleKind,
  BulkManifest,
} from "./world"
import { resolveLevelGeometry, type LevelGeometry } from "../level"
import type { BulkLayoutSettings } from "./settings.t"
import {
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"

const snapshotLayoutConfig = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Input descriptor for an ordinary field particle before Dark particle materialization. */
export interface BulkFieldParticleInput {
  fieldParticleId: number
  fieldId: number
  fieldKey: string
  fieldLabel: string
  fieldParticleKind: BulkFieldParticleKind
  valueText: string | null
  colorR: number
  colorG: number
  colorB: number
}

/** Input descriptor for a Dark particle tree before geometric layout. */
export interface BulkDarkParticleInput {
  darkParticleId: number
  darkParticleKind: BulkDarkParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  colorR: number
  colorG: number
  colorB: number
  activity?: BulkDarkParticleActivity
  fieldParticles: BulkFieldParticleInput[]
  children: BulkDarkParticleInput[]
}

interface LayoutFieldParticleNode extends BulkFieldParticle {
  extent: number
}

interface LayoutDarkParticleNode extends Omit<BulkDarkParticle, "parentDarkParticleId" | "depth" | "darkParticleOrder"> {
  children: LayoutDarkParticleNode[]
  fieldParticles: LayoutFieldParticleNode[]
  depthFromRoot: number
  innerRadius: number
  outerRadius: number
}

interface DarkParticleInputNode {
  descriptor: BulkDarkParticleInput
  children: DarkParticleInputNode[]
  depthFromRoot: number
}

type OrbitItem =
  | {
      extent: number
      fieldParticle: LayoutFieldParticleNode
      kind: "fieldParticle"
    }
  | {
      extent: number
      kind: "darkParticle"
      darkParticle: LayoutDarkParticleNode
    }

const getCanonicalLevelGeometry = (
  depthFromRoot: number,
  settings: BulkLayoutSettings,
  options: { rootOuterDiameterMm?: number } = {},
): LevelGeometry =>
  resolveLevelGeometry({
    depth: depthFromRoot,
    settings: toLevelGeometrySettings(
      settings,
      snapshotLayoutConfig,
      options.rootOuterDiameterMm ?? snapshotLayoutConfig.rootOuterDiameterMm,
    ),
  })

const getSurfaceLevelGeometry = (
  depthFromRoot: number,
  settings: BulkLayoutSettings,
  options: { outerRadiusMm?: number; rootOuterDiameterMm?: number } = {},
): LevelGeometry =>
  resolveLevelGeometry({
    depth: depthFromRoot,
    settings: toLevelGeometrySettings(
      settings,
      snapshotLayoutConfig,
      options.rootOuterDiameterMm ?? snapshotLayoutConfig.rootOuterDiameterMm,
    ),
    ...(options.outerRadiusMm !== undefined ? { outerRadiusMm: options.outerRadiusMm } : {}),
  })

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

const resolveContentAwareLevelGeometry = (
  depthFromRoot: number,
  settings: BulkLayoutSettings,
  orbitItems: OrbitItem[],
): LevelGeometry => {
  const canonicalMetrics = getCanonicalLevelGeometry(depthFromRoot, settings)
  if (orbitItems.length === 0) return canonicalMetrics

  const phase = hashAngle(orbitItems.map((item) => (
    item.kind === "darkParticle" ? item.darkParticle.darkParticleId : item.fieldParticle.fieldParticleId
  )).join("\0"))
  const orbitEdgeGapMm = settings.orbitEdgeGapMm
  const localEnvelope = placeOrbitItemsByBands(orbitItems, {
    paddingMm: orbitEdgeGapMm,
    phase,
  })
  const innerOuterRatio = canonicalMetrics.innerRadiusMm / Math.max(canonicalMetrics.outerRadiusMm, 1e-6)
  const outerRadius = Math.max(0.001, localEnvelope.outerBoundary / Math.max(1 - innerOuterRatio, 1e-6))
  const levelMetrics = getSurfaceLevelGeometry(depthFromRoot, settings, { outerRadiusMm: outerRadius })
  placeOrbitItemsByBands(orbitItems, {
    paddingMm: orbitEdgeGapMm,
    phase,
    startOuterBoundary: levelMetrics.innerRadiusMm,
  })

  return levelMetrics
}

const materializeCanonicalDarkParticleNode = (
  node: DarkParticleInputNode,
  settings: BulkLayoutSettings,
): LayoutDarkParticleNode => {
  const nestedChildren = node.children.map((child) => materializeCanonicalDarkParticleNode(child, settings))
  const depthFromRoot = node.depthFromRoot
  const descriptor = node.descriptor
  const canonicalMetrics = getCanonicalLevelGeometry(depthFromRoot, settings)
  const sphereRadius = canonicalMetrics.sphereRadiusMm
  const fieldParticles: LayoutFieldParticleNode[] = [...descriptor.fieldParticles]
    .sort((left, right) => left.fieldId - right.fieldId || left.fieldParticleId - right.fieldParticleId)
    .map((fieldParticle) => cloneFieldParticleInput(descriptor, fieldParticle, sphereRadius))

  const orbitItems: OrbitItem[] = [
    ...nestedChildren.map((darkParticle) => ({
      kind: "darkParticle" as const,
      darkParticle,
      extent: darkParticle.outerRadius,
    })),
    ...fieldParticles.map((fieldParticle) => ({
      kind: "fieldParticle" as const,
      fieldParticle,
      extent: fieldParticle.extent,
    })),
  ]

  const levelMetrics = resolveContentAwareLevelGeometry(depthFromRoot, settings, orbitItems)
  const outerRadius = levelMetrics.outerRadiusMm
  const innerRadius = levelMetrics.innerRadiusMm

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
    torusRadius: levelMetrics.shellRadiusMm,
    torusTube: levelMetrics.shellTubeMm,
    colorR: descriptor.colorR,
    colorG: descriptor.colorG,
    colorB: descriptor.colorB,
    activity: descriptor.activity ?? "neutral",
    children: nestedChildren,
    fieldParticles,
    depthFromRoot,
    innerRadius,
    outerRadius,
  }
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
 * Builds a planar Bulk manifest from a semantic Dark particle tree.
 *
 * Layout law:
 * - the scene stays `Z-up`;
 * - Dark particle torus geometry is sized bottom-up: children and field particles define parent torus minimum size;
 * - depth defines a canonical minimum, but does not prevent a Dark particle from expanding from its content;
 * - ordinary field particles materialize as peer-level sphere geometry and participate in orbit packing;
 * - orbit packing places nested Dark particles and field particles by rings inside parent torus geometry.
 */
export const createBulkManifestFromDarkParticleInputs = (
  rootSrc: string,
  roots: BulkDarkParticleInput[],
  settings: Partial<BulkLayoutSettings> = {},
): BulkManifest => {
  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const inputRoots = roots.map((root) => createDarkParticleInputNode(root, 0))
  const materializedRoots = inputRoots.map((root) => materializeCanonicalDarkParticleNode(root, resolvedSettings))
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
