import type {
  DbFieldOrbitRow,
  DbFieldValueKind,
  DbParticleActivity,
  DbParticleKind,
  DbParticleShellRow,
  DbWorldRows,
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

/** Входной дескриптор ordinary field до shell-materialization в actor rows. */
export interface DbWorldFieldDescriptor {
  id: number
  fieldKey: string
  fieldLabel: string
  fieldValueKind: DbFieldValueKind
  valueText: string | null
  colorR: number
  colorG: number
  colorB: number
}

/** Входной дескриптор particle-дерева до геометрической раскладки shell/orbit. */
export interface DbWorldParticleDescriptor {
  particleId: number
  kind: DbParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  colorR: number
  colorG: number
  colorB: number
  activity?: DbParticleActivity
  fields: DbWorldFieldDescriptor[]
  children: DbWorldParticleDescriptor[]
}

interface LayoutFieldNode extends DbFieldOrbitRow {
  extent: number
}

interface LayoutShellNode extends Omit<DbParticleShellRow, "parentParticleId" | "depth" | "shellOrder"> {
  children: LayoutShellNode[]
  fields: LayoutFieldNode[]
  depthFromRoot: number
  innerRadius: number
  outerRadius: number
}

interface ShellDescriptorNode {
  descriptor: DbWorldParticleDescriptor
  children: ShellDescriptorNode[]
  depthFromRoot: number
}

type OrbitItem =
  | {
      extent: number
      field: LayoutFieldNode
      kind: "field"
    }
  | {
      extent: number
      kind: "shell"
      shell: LayoutShellNode
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

const cloneDescriptorField = (
  descriptor: DbWorldParticleDescriptor,
  field: DbWorldFieldDescriptor,
  sphereRadius: number,
): LayoutFieldNode => ({
  id: field.id,
  particleId: descriptor.particleId,
  fieldKey: field.fieldKey,
  fieldLabel: field.fieldLabel,
  fieldOrder: 0,
  fieldValueKind: field.fieldValueKind,
  valueText: field.valueText,
  localX: 0,
  localY: 0,
  localZ: 0,
  sphereRadius,
  colorR: field.colorR,
  colorG: field.colorG,
  colorB: field.colorB,
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

  if (item.kind === "shell") {
    item.shell.localX = x
    item.shell.localY = y
    item.shell.localZ = 0
    return
  }

  item.field.localX = x
  item.field.localY = y
  item.field.localZ = 0
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

const createShellDescriptorNode = (
  descriptor: DbWorldParticleDescriptor,
  depthFromRoot: number,
): ShellDescriptorNode => ({
  descriptor,
  depthFromRoot,
  children: descriptor.children.map((child) => createShellDescriptorNode(child, depthFromRoot + 1)),
})

const resolveContentAwareLevelGeometry = (
  depthFromRoot: number,
  settings: BulkLayoutSettings,
  orbitItems: OrbitItem[],
): LevelGeometry => {
  const canonicalMetrics = getCanonicalLevelGeometry(depthFromRoot, settings)
  if (orbitItems.length === 0) return canonicalMetrics

  const phase = hashAngle(orbitItems.map((item) => (item.kind === "shell" ? item.shell.particleId : item.field.id)).join("\0"))
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

const materializeCanonicalShellNode = (
  node: ShellDescriptorNode,
  settings: BulkLayoutSettings,
): LayoutShellNode => {
  const nestedChildren = node.children.map((child) => materializeCanonicalShellNode(child, settings))
  const depthFromRoot = node.depthFromRoot
  const descriptor = node.descriptor
  const canonicalMetrics = getCanonicalLevelGeometry(depthFromRoot, settings)
  const sphereRadius = canonicalMetrics.sphereRadiusMm
  const fields: LayoutFieldNode[] = descriptor.fields.map((field) =>
    cloneDescriptorField(descriptor, field, sphereRadius),
  )

  const orbitItems: OrbitItem[] = [
    ...nestedChildren.map((shell) => ({
      kind: "shell" as const,
      shell,
      extent: shell.outerRadius,
    })),
    ...fields.map((field) => ({
      kind: "field" as const,
      field,
      extent: field.extent,
    })),
  ]

  const levelMetrics = resolveContentAwareLevelGeometry(depthFromRoot, settings, orbitItems)
  const outerRadius = levelMetrics.outerRadiusMm
  const innerRadius = levelMetrics.innerRadiusMm

  return {
    particleId: descriptor.particleId,
    kind: descriptor.kind,
    src: descriptor.src,
    metaSrc: descriptor.metaSrc,
    label: descriptor.label,
    localX: 0,
    localY: 0,
    localZ: 0,
    shellScale: 1,
    shellRadius: levelMetrics.shellRadiusMm,
    shellTube: levelMetrics.shellTubeMm,
    colorR: descriptor.colorR,
    colorG: descriptor.colorG,
    colorB: descriptor.colorB,
    activity: descriptor.activity ?? "neutral",
    children: nestedChildren,
    fields,
    depthFromRoot,
    innerRadius,
    outerRadius,
  }
}

const flattenShellNode = (
  node: LayoutShellNode,
  parentParticleId: number | null,
  depth: number,
  shellOrder: number,
  particles: DbParticleShellRow[],
  fields: DbFieldOrbitRow[],
): void => {
  particles.push({
    particleId: node.particleId,
    parentParticleId,
    kind: node.kind,
    src: node.src,
    metaSrc: node.metaSrc,
    label: node.label,
    depth,
    shellOrder,
    localX: node.localX,
    localY: node.localY,
    localZ: node.localZ,
    shellScale: node.shellScale,
    shellRadius: node.shellRadius,
    shellTube: node.shellTube,
    colorR: node.colorR,
    colorG: node.colorG,
    colorB: node.colorB,
    activity: node.activity ?? "neutral",
  })

  node.fields.forEach((field, fieldOrder) => {
    fields.push({
      id: field.id,
      particleId: node.particleId,
      fieldKey: field.fieldKey,
      fieldLabel: field.fieldLabel,
      fieldOrder,
      fieldValueKind: field.fieldValueKind,
      valueText: field.valueText,
      localX: field.localX,
      localY: field.localY,
      localZ: field.localZ,
      sphereRadius: field.sphereRadius,
      colorR: field.colorR,
      colorG: field.colorG,
      colorB: field.colorB,
    })
  })

  node.children.forEach((child, childOrder) => {
    flattenShellNode(child, node.particleId, depth + 1, childOrder, particles, fields)
  })
}

/**
 * Совместимый shim для старых вызовов.
 *
 * Bottom-up закон раскладки теперь полностью разрешается в
 * {@link createDbWorldRowsFromParticleDescriptors} и
 * {@link scaleDbWorldRowsToRootOuterDiameter}. Локальный post-scale по поддереву
 * здесь больше не выполняется, потому что он ломает фрактальный размер shell-ов.
 */
export const enforceRootShellLayoutSettings = (
  snapshot: DbWorldRows,
  _settings: Partial<BulkLayoutSettings> = {},
): DbWorldRows => {
  return {
    rootSrc: snapshot.rootSrc,
    particles: snapshot.particles.map((particle) => ({ ...particle })),
    fields: snapshot.fields.map((field) => ({ ...field })),
  }
}

/**
 * Строит planar `store/db` world snapshot из семантического particle-дерева.
 *
 * Закон раскладки:
 * - сцена остаётся в `Z-up`
 * - размеры shell-ов считаются снизу вверх: дети и поля задают минимальный размер parent-тора
 * - depth задаёт canonical minimum, но не запрещает shell-у расшириться от содержимого
 * - ordinary fields materialize-ятся как сферы peer-level размера и участвуют в orbit packing
 * - orbit packing раскладывает внутренние торы и сферы по ring-ам внутри parent-тора
 */
export const createDbWorldRowsFromParticleDescriptors = (
  rootSrc: string,
  roots: DbWorldParticleDescriptor[],
  settings: Partial<BulkLayoutSettings> = {},
): DbWorldRows => {
  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const descriptorRoots = roots.map((root) => createShellDescriptorNode(root, 0))
  const materializedRoots = descriptorRoots.map((root) => materializeCanonicalShellNode(root, resolvedSettings))
  const [mainRoot, ...otherRoots] = materializedRoots
  if (mainRoot) {
    mainRoot.localX = 0
    mainRoot.localY = 0
    mainRoot.localZ = 0
  }
  placeOrbitItemsByBands(
    otherRoots.map((shell) => ({
      kind: "shell" as const,
      shell,
      extent: shell.outerRadius,
    })),
    {
      paddingMm: resolvedSettings.orbitEdgeGapMm,
      phase: mainRoot ? hashAngle(mainRoot.particleId) : 0,
      startOuterBoundary: mainRoot?.outerRadius ?? 0,
    },
  )

  const particles: DbParticleShellRow[] = []
  const fields: DbFieldOrbitRow[] = []

  materializedRoots.forEach((root, rootOrder) => {
    flattenShellNode(root, null, 0, rootOrder, particles, fields)
  })

  return {
    rootSrc,
    particles,
    fields,
  }
}

/**
 * Равномерно масштабирует snapshot так, чтобы главный root-shell сохранял фиксированный внешний диаметр.
 *
 * Масштаб применяется глобально ко всему snapshot-у. Локальные subtree-коррекции не выполняются:
 * bottom-up топология уже рассчитана в materialize-проходе, а повторный reflow сломал бы договор
 * "дети задают размер родителя".
 */
export const scaleDbWorldRowsToRootOuterDiameter = (
  snapshot: DbWorldRows,
  targetOuterDiameter: number = snapshotLayoutConfig.rootOuterDiameterMm,
  _settings: Partial<BulkLayoutSettings> = {},
): DbWorldRows => {
  const rootOuterRadius = snapshot.particles
    .filter((particle) => particle.parentParticleId === null)
    .reduce((max, particle) => Math.max(max, particle.shellRadius + particle.shellTube), 0)

  if (rootOuterRadius <= 0 || targetOuterDiameter <= 0) {
    return snapshot
  }

  const scale = targetOuterDiameter / (rootOuterRadius * 2)
  if (!Number.isFinite(scale) || scale <= 0) {
    return snapshot
  }

  return {
    rootSrc: snapshot.rootSrc,
    particles: snapshot.particles.map((particle) => ({
      ...particle,
      localX: particle.localX * scale,
      localY: particle.localY * scale,
      localZ: particle.localZ * scale,
      shellRadius: particle.shellRadius * scale,
      shellTube: particle.shellTube * scale,
    })),
    fields: snapshot.fields.map((field) => ({
      ...field,
      localX: field.localX * scale,
      localY: field.localY * scale,
      localZ: field.localZ * scale,
      sphereRadius: field.sphereRadius * scale,
    })),
  }
}
