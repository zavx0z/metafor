import type {
  DbFieldOrbitRow,
  DbFieldValueKind,
  DbParticleKind,
  DbParticleShellRow,
  DbWorldRows,
} from "@store/actor"
import { resolveLevelGeometry, type LevelGeometry } from "../level"
import type { BulkLayoutSettings } from "./settings.t"
import {
  DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG,
  normalizeBulkLayoutSettings,
  toLevelGeometrySettings,
} from "./settings"

const snapshotLayoutConfig = DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG

/** Входной дескриптор ordinary field до shell-materialization в actor rows. */
export interface DbWorldFieldDescriptor {
  id: string
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
  particleId: string
  kind: DbParticleKind
  src: string | null
  metaSrc: string | null
  label: string
  colorR: number
  colorG: number
  colorB: number
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

interface OrbitRing {
  items: OrbitItem[]
  maxExtent: number
  minRadius: number
  radius: number
}

const getRingMinRadius = (items: OrbitItem[], paddingMm: number): number => {
  if (items.length === 0) return 0

  const maxExtent = Math.max(...items.map((item) => item.extent))
  if (items.length === 1) return maxExtent

  const totalArcLength =
    items.reduce((sum, item) => sum + item.extent * 2, 0) + items.length * paddingMm
  const circumferenceRadius = totalArcLength / (Math.PI * 2)
  const angularRadius =
    (maxExtent * 2 + paddingMm) / (2 * Math.max(Math.sin(Math.PI / items.length), 1e-6))

  return Math.max(maxExtent, circumferenceRadius, angularRadius)
}

const createOrbitRingsForCount = (
  items: OrbitItem[],
  orbitCount: number,
  paddingMm: number,
): OrbitRing[] => {
  const buckets = Array.from({ length: orbitCount }, () => [] as OrbitItem[])

  items.forEach((item, index) => {
    buckets[index % orbitCount]!.push(item)
  })

  return buckets
    .filter((bucket) => bucket.length > 0)
    .map((bucket) => ({
      items: bucket,
      maxExtent: Math.max(...bucket.map((item) => item.extent)),
      minRadius: getRingMinRadius(bucket, paddingMm),
      radius: 0,
    }))
}

const resolveOrbitRingBoundaries = (
  rings: OrbitRing[],
  innerBoundary: number,
  paddingMm: number,
): number => {
  let previousOuterBoundary = innerBoundary + paddingMm

  for (const ring of rings) {
    ring.radius = Math.max(previousOuterBoundary + ring.maxExtent, ring.minRadius)
    previousOuterBoundary = ring.radius + ring.maxExtent + paddingMm
  }

  return previousOuterBoundary
}

const distributeOrbitSlack = (
  rings: OrbitRing[],
  maxOuterBoundary: number,
  paddingMm: number,
): void => {
  if (rings.length === 0) return

  const lastRing = rings[rings.length - 1]
  if (!lastRing) return

  const usedOuterBoundary = lastRing.radius + lastRing.maxExtent + paddingMm
  const slack = maxOuterBoundary - usedOuterBoundary
  if (slack <= 1e-6) return

  const extraGap = slack / (rings.length + 1)
  rings.forEach((ring, index) => {
    ring.radius += extraGap * (index + 1)
  })
}

const buildOrbitRings = (
  items: OrbitItem[],
  options: {
    maxOuterBoundary?: number
    paddingMm?: number
    startInnerBoundary?: number
    startOuterBoundary?: number
  } = {},
): OrbitRing[] => {
  if (items.length === 0) return []

  const sorted = [...items].sort((left, right) => right.extent - left.extent)
  const paddingMm = Math.max(0, options.paddingMm ?? 0)
  const startBoundary = options.startInnerBoundary ?? options.startOuterBoundary ?? 0

  if (options.maxOuterBoundary === undefined) {
    const singleOrbit = createOrbitRingsForCount(sorted, 1, paddingMm)
    resolveOrbitRingBoundaries(singleOrbit, startBoundary, paddingMm)
    return singleOrbit
  }

  let fallback: OrbitRing[] = []
  for (let orbitCount = 1; orbitCount <= sorted.length; orbitCount += 1) {
    const rings = createOrbitRingsForCount(sorted, orbitCount, paddingMm)
    const requiredOuterBoundary = resolveOrbitRingBoundaries(rings, startBoundary, paddingMm)
    fallback = rings

    if (requiredOuterBoundary <= options.maxOuterBoundary + 1e-6) {
      distributeOrbitSlack(rings, options.maxOuterBoundary, paddingMm)
      return rings
    }
  }

  return fallback
}

const positionOrbitRing = (ring: OrbitRing): void => {
  if (ring.items.length === 0) return

  const angleOffset = ring.items.length === 2 ? Math.PI : -Math.PI / 2
  ring.items.forEach((item, index) => {
    const angle = angleOffset + (index * Math.PI * 2) / ring.items.length
    const x = Math.cos(angle) * ring.radius
    const y = Math.sin(angle) * ring.radius

    if (item.kind === "shell") {
      item.shell.localX = x
      item.shell.localY = y
      item.shell.localZ = 0
      return
    }

    item.field.localX = x
    item.field.localY = y
    item.field.localZ = 0
  })
}

const placeOrbitItemsFromInnerBoundary = (
  items: OrbitItem[],
  options: {
    maxOuterBoundary?: number
    paddingMm?: number
    startInnerBoundary?: number
    startOuterBoundary?: number
  } = {},
): { innerBoundary: number; outerBoundary: number } => {
  const rings = buildOrbitRings(items, options)
  if (rings.length === 0) {
    const start = options.startOuterBoundary ?? options.startInnerBoundary ?? 0
    return { innerBoundary: start, outerBoundary: start }
  }

  const [firstRing] = rings
  if (!firstRing) {
    const start = options.startOuterBoundary ?? options.startInnerBoundary ?? 0
    return { innerBoundary: start, outerBoundary: start }
  }

  const paddingMm = Math.max(0, options.paddingMm ?? 0)
  const lastRing = rings[rings.length - 1]

  for (const ring of rings) {
    positionOrbitRing(ring)
  }

  return {
    innerBoundary: firstRing.radius - firstRing.maxExtent - paddingMm,
    outerBoundary:
      lastRing !== undefined
        ? lastRing.radius + lastRing.maxExtent + paddingMm
        : firstRing.radius + firstRing.maxExtent + paddingMm,
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

const collectNodesByDepth = (
  node: ShellDescriptorNode,
  nodesByDepth: Map<number, ShellDescriptorNode[]>,
): void => {
  const nodes = nodesByDepth.get(node.depthFromRoot) ?? []
  nodes.push(node)
  nodesByDepth.set(node.depthFromRoot, nodes)
  for (const child of node.children) {
    collectNodesByDepth(child, nodesByDepth)
  }
}

const createOuterRequirementOrbitItems = (
  node: ShellDescriptorNode,
  settings: BulkLayoutSettings,
  outerRadiusMm: number,
  outerByDepth: Map<number, number>,
): OrbitItem[] => {
  const childOrbitItems: OrbitItem[] = node.children.map((child) => ({
    kind: "shell",
    shell: {
      particleId: child.descriptor.particleId,
      kind: child.descriptor.kind,
      src: child.descriptor.src,
      metaSrc: child.descriptor.metaSrc,
      label: child.descriptor.label,
      localX: 0,
      localY: 0,
      localZ: 0,
      shellScale: 1,
      shellRadius: 0,
      shellTube: 0,
      colorR: child.descriptor.colorR,
      colorG: child.descriptor.colorG,
      colorB: child.descriptor.colorB,
      children: [],
      fields: [],
      depthFromRoot: child.depthFromRoot,
      innerRadius: 0,
      outerRadius:
        outerByDepth.get(child.depthFromRoot) ??
        getCanonicalLevelGeometry(child.depthFromRoot, settings).outerRadiusMm,
    },
    extent:
      outerByDepth.get(child.depthFromRoot) ??
      getCanonicalLevelGeometry(child.depthFromRoot, settings).outerRadiusMm,
  }))

  const fieldRadius = getSurfaceLevelGeometry(node.depthFromRoot, settings, { outerRadiusMm }).sphereRadiusMm
  const fieldOrbitItems: OrbitItem[] = node.descriptor.fields.map((field) => ({
    kind: "field",
    field: cloneDescriptorField(node.descriptor, field, fieldRadius),
    extent: fieldRadius,
  }))

  return [...childOrbitItems, ...fieldOrbitItems]
}

const resolveOuterRadiusByDepth = (
  roots: ShellDescriptorNode[],
  settings: BulkLayoutSettings,
): Map<number, number> => {
  const nodesByDepth = new Map<number, ShellDescriptorNode[]>()
  for (const root of roots) {
    collectNodesByDepth(root, nodesByDepth)
  }

  const depths = [...nodesByDepth.keys()].sort((left, right) => right - left)
  const outerByDepth = new Map<number, number>()

  for (const depth of depths) {
    const nodes = nodesByDepth.get(depth) ?? []
    let resolvedOuter = getCanonicalLevelGeometry(depth, settings).outerRadiusMm

    for (let iteration = 0; iteration < 32; iteration += 1) {
      let nextOuter = resolvedOuter
      const levelMetrics = getSurfaceLevelGeometry(depth, settings, { outerRadiusMm: resolvedOuter })
      const innerRadius = levelMetrics.innerRadiusMm

      for (const node of nodes) {
        const orbitItems = createOuterRequirementOrbitItems(node, settings, resolvedOuter, outerByDepth)
        if (orbitItems.length === 0) continue

        const packed = placeOrbitItemsFromInnerBoundary(orbitItems, {
          maxOuterBoundary: resolvedOuter,
          paddingMm: levelMetrics.paddingMm,
          startInnerBoundary: innerRadius,
        })
        nextOuter = Math.max(nextOuter, packed.outerBoundary)
      }

      if (nextOuter <= resolvedOuter + 1e-6) break
      resolvedOuter = nextOuter
    }

    outerByDepth.set(depth, resolvedOuter)
  }

  return outerByDepth
}

const materializeCanonicalShellNode = (
  node: ShellDescriptorNode,
  settings: BulkLayoutSettings,
  outerByDepth: Map<number, number>,
): LayoutShellNode => {
  const nestedChildren = node.children.map((child) =>
    materializeCanonicalShellNode(child, settings, outerByDepth),
  )
  const depthFromRoot = node.depthFromRoot
  const descriptor = node.descriptor
  const levelMetrics = getSurfaceLevelGeometry(depthFromRoot, settings, {
    outerRadiusMm:
      outerByDepth.get(depthFromRoot) ??
      getCanonicalLevelGeometry(depthFromRoot, settings).outerRadiusMm,
  })
  const sphereRadius = levelMetrics.sphereRadiusMm
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

  const outerRadius = levelMetrics.outerRadiusMm
  const innerRadius = levelMetrics.innerRadiusMm

  if (orbitItems.length > 0) {
    placeOrbitItemsFromInnerBoundary(orbitItems, {
      maxOuterBoundary: outerRadius,
      paddingMm: levelMetrics.paddingMm,
      startInnerBoundary: innerRadius,
    })
  }

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
    children: nestedChildren,
    fields,
    depthFromRoot,
    innerRadius,
    outerRadius,
  }
}

const flattenShellNode = (
  node: LayoutShellNode,
  parentParticleId: string | null,
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
 * Top-down закон раскладки теперь полностью разрешается в
 * {@link createDbWorldRowsFromParticleDescriptors} и
 * {@link scaleDbWorldRowsToRootOuterDiameter}. Локальный post-scale по поддереву
 * здесь больше не выполняется, потому что он ломает одинаковый размер shell-ов на одном depth.
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
 * - размеры shell-ов задаются сверху вниз от root-уровня вглубь
 * - все shell-ы на одном depth имеют одинаковый внешний размер
 * - ordinary fields materialize-ятся как сферы peer-level размера
 * - orbit packing сначала пытается уложить всё в один ring, затем делит на несколько равномерно распределённых ring-ов
 */
export const createDbWorldRowsFromParticleDescriptors = (
  rootSrc: string,
  roots: DbWorldParticleDescriptor[],
  settings: Partial<BulkLayoutSettings> = {},
): DbWorldRows => {
  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const descriptorRoots = roots.map((root) => createShellDescriptorNode(root, 0))
  const outerByDepth = resolveOuterRadiusByDepth(descriptorRoots, resolvedSettings)
  const materializedRoots = descriptorRoots.map((root) =>
    materializeCanonicalShellNode(root, resolvedSettings, outerByDepth),
  )
  const [mainRoot, ...otherRoots] = materializedRoots
  if (mainRoot) {
    mainRoot.localX = 0
    mainRoot.localY = 0
    mainRoot.localZ = 0
  }
  placeOrbitItemsFromInnerBoundary(
    otherRoots.map((shell) => ({
      kind: "shell" as const,
      shell,
      extent: shell.outerRadius,
    })),
    {
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
 * Масштаб применяется глобально ко всему snapshot-у. Локальные subtree-коррекции не выполняются,
 * поэтому одинаковый размер shell-ов на одном depth сохраняется.
 */
export const scaleDbWorldRowsToRootOuterDiameter = (
  snapshot: DbWorldRows,
  targetOuterDiameter: number = snapshotLayoutConfig.rootOuterDiameterMm,
  settings: Partial<BulkLayoutSettings> = {},
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

  const scaledSnapshot: DbWorldRows = {
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

  const resolvedSettings = normalizeBulkLayoutSettings(settings)
  const getParticleOuterRadius = (particle: DbParticleShellRow): number =>
    particle.shellRadius + particle.shellTube
  const shouldAdjustShellSizes = settings.levelSizeMultiplier !== undefined

  const particlesById = new Map(
    scaledSnapshot.particles.map((particle) => [particle.particleId, particle]),
  )
  const childrenByParentId = new Map<string, DbParticleShellRow[]>()
  const fieldsByParticleId = new Map<string, DbFieldOrbitRow[]>()

  for (const particle of scaledSnapshot.particles) {
    if (!particle.parentParticleId) continue
    const children = childrenByParentId.get(particle.parentParticleId) ?? []
    children.push(particle)
    childrenByParentId.set(particle.parentParticleId, children)
  }

  const currentOuterByDepth = scaledSnapshot.particles.reduce((acc, particle) => {
    acc.set(particle.depth, Math.max(acc.get(particle.depth) ?? 0, getParticleOuterRadius(particle)))
    return acc
  }, new Map<number, number>())

  const targetOuterByDepth = new Map<number, number>()
  for (const [depth, currentOuterRadius] of currentOuterByDepth.entries()) {
    targetOuterByDepth.set(depth, currentOuterRadius)
  }

  const canFitChildOuterRadius = (
    parentDepth: number,
    parentOuterRadius: number,
    childCount: number,
    fieldCount: number,
    childOuterRadius: number,
  ): boolean => {
    const parentMetrics = getSurfaceLevelGeometry(parentDepth, resolvedSettings, {
      outerRadiusMm: parentOuterRadius,
      rootOuterDiameterMm: targetOuterDiameter,
    })
    const orbitItems: OrbitItem[] = [
      ...Array.from({ length: childCount }, (_, index) => ({
        kind: "shell" as const,
        shell: {
          particleId: `fit-shell-${parentDepth}-${index}`,
          kind: "wimp",
          src: null,
          metaSrc: null,
          label: "",
          localX: 0,
          localY: 0,
          localZ: 0,
          shellScale: 1,
          shellRadius: childOuterRadius / 2,
          shellTube: childOuterRadius / 2,
          colorR: 0,
          colorG: 0,
          colorB: 0,
          children: [],
          fields: [],
          depthFromRoot: parentDepth + 1,
          innerRadius: 0,
          outerRadius: childOuterRadius,
        } satisfies LayoutShellNode,
        extent: childOuterRadius,
      })),
      ...Array.from({ length: fieldCount }, (_, index) => ({
        kind: "field" as const,
        field: {
          id: `fit-field-${parentDepth}-${index}`,
          particleId: `fit-parent-${parentDepth}`,
          fieldKey: "",
          fieldLabel: "",
          fieldOrder: index,
          fieldValueKind: "other" as const,
          valueText: null,
          localX: 0,
          localY: 0,
          localZ: 0,
          sphereRadius: parentMetrics.sphereRadiusMm,
          colorR: 0,
          colorG: 0,
          colorB: 0,
          extent: parentMetrics.sphereRadiusMm,
        } satisfies LayoutFieldNode,
        extent: parentMetrics.sphereRadiusMm,
      })),
    ]

    const packed = placeOrbitItemsFromInnerBoundary(orbitItems, {
      maxOuterBoundary: parentOuterRadius,
      paddingMm: parentMetrics.paddingMm,
      startInnerBoundary: parentMetrics.innerRadiusMm,
    })
    return packed.outerBoundary <= parentOuterRadius + 1e-6
  }

  const resolveFittingChildOuterRadius = (
    parentDepth: number,
    parentOuterRadius: number,
    childCount: number,
    fieldCount: number,
    minOuterRadius: number,
    targetOuterRadius: number,
  ): number => {
    if (childCount === 0 || targetOuterRadius <= minOuterRadius) return minOuterRadius
    if (canFitChildOuterRadius(parentDepth, parentOuterRadius, childCount, fieldCount, targetOuterRadius)) {
      return targetOuterRadius
    }

    let low = minOuterRadius
    let high = targetOuterRadius
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) / 2
      if (canFitChildOuterRadius(parentDepth, parentOuterRadius, childCount, fieldCount, middle)) low = middle
      else high = middle
    }

    return low
  }

  const depths = [...targetOuterByDepth.keys()].sort((left, right) => left - right)
  if (shouldAdjustShellSizes) {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      let changed = false

      for (const depth of depths) {
        const childDepth = depth + 1
        const currentChildOuterRadius = currentOuterByDepth.get(childDepth)
        if (currentChildOuterRadius === undefined) continue

        const parentOuterRadius = targetOuterByDepth.get(depth) ?? currentOuterByDepth.get(depth) ?? 0
        if (parentOuterRadius <= 0) continue

        const parentMetrics = getSurfaceLevelGeometry(depth, resolvedSettings, {
          outerRadiusMm: parentOuterRadius,
          rootOuterDiameterMm: targetOuterDiameter,
        })
        const canonicalChildOuterRadius = getCanonicalLevelGeometry(childDepth, resolvedSettings, {
          rootOuterDiameterMm: targetOuterDiameter,
        }).outerRadiusMm
        const desiredChildOuterRadius = Math.max(
          currentChildOuterRadius,
          Math.min(
            canonicalChildOuterRadius,
            parentMetrics.workingThicknessMm / (2 * resolvedSettings.levelSizeMultiplier),
          ),
        )

        let cappedOuterRadius = desiredChildOuterRadius
        for (const parent of scaledSnapshot.particles.filter((particle) => particle.depth === depth)) {
          const childParticles = childrenByParentId.get(parent.particleId) ?? []
          if (childParticles.length === 0) continue

          const childFields = fieldsByParticleId.get(parent.particleId) ?? []
          cappedOuterRadius = Math.min(
            cappedOuterRadius,
            resolveFittingChildOuterRadius(
              depth,
              parentOuterRadius,
              childParticles.length,
              childFields.length,
              currentChildOuterRadius,
              cappedOuterRadius,
            ),
          )
        }

        const previousOuterRadius = targetOuterByDepth.get(childDepth) ?? currentChildOuterRadius
        if (Math.abs(previousOuterRadius - cappedOuterRadius) > 1e-6) {
          targetOuterByDepth.set(childDepth, Math.max(currentChildOuterRadius, cappedOuterRadius))
          changed = true
        }
      }

      if (!changed) break
    }

    for (const particle of scaledSnapshot.particles) {
      const targetOuterRadius = targetOuterByDepth.get(particle.depth)
      if (targetOuterRadius === undefined) continue
      const levelMetrics = getSurfaceLevelGeometry(particle.depth, resolvedSettings, {
        outerRadiusMm: targetOuterRadius,
        rootOuterDiameterMm: targetOuterDiameter,
      })
      particle.shellRadius = levelMetrics.shellRadiusMm
      particle.shellTube = levelMetrics.shellTubeMm
    }
  }

  fieldsByParticleId.clear()

  for (const field of scaledSnapshot.fields) {
    const parent = particlesById.get(field.particleId)
    if (!parent) continue
    const parentOuterRadius = getParticleOuterRadius(parent)
    field.sphereRadius = getSurfaceLevelGeometry(parent.depth, resolvedSettings, {
      outerRadiusMm: parentOuterRadius,
      rootOuterDiameterMm: targetOuterDiameter,
    }).sphereRadiusMm
    const fields = fieldsByParticleId.get(field.particleId) ?? []
    fields.push(field)
    fieldsByParticleId.set(field.particleId, fields)
  }

  const reflowShell = (particle: DbParticleShellRow): void => {
    const outerRadius = particle.shellRadius + particle.shellTube
    const levelMetrics = getSurfaceLevelGeometry(particle.depth, resolvedSettings, {
      outerRadiusMm: outerRadius,
      rootOuterDiameterMm: targetOuterDiameter,
    })
    const innerRadius = levelMetrics.innerRadiusMm
    const childParticles = childrenByParentId.get(particle.particleId) ?? []
    const childFields = fieldsByParticleId.get(particle.particleId) ?? []

    const shellRefs = childParticles.map((child) => ({
      source: child,
      shell: {
        particleId: child.particleId,
        kind: child.kind,
        src: child.src,
        metaSrc: child.metaSrc,
        label: child.label,
        localX: child.localX,
        localY: child.localY,
        localZ: child.localZ,
        shellScale: child.shellScale,
        shellRadius: child.shellRadius,
        shellTube: child.shellTube,
        colorR: child.colorR,
        colorG: child.colorG,
        colorB: child.colorB,
        children: [],
        fields: [],
        depthFromRoot: child.depth,
        innerRadius: child.shellRadius - child.shellTube,
        outerRadius: child.shellRadius + child.shellTube,
      } satisfies LayoutShellNode,
    }))
    const fieldRefs = childFields.map((field) => ({
      source: field,
      field: {
        ...field,
        extent: field.sphereRadius,
      } satisfies LayoutFieldNode,
    }))

    const orbitItems: OrbitItem[] = [
      ...shellRefs.map(({ shell }) => ({
        kind: "shell" as const,
        shell,
        extent: shell.outerRadius,
      })),
      ...fieldRefs.map(({ field }) => ({
        kind: "field" as const,
        field,
        extent: field.extent,
      })),
    ]

    if (orbitItems.length > 0) {
      placeOrbitItemsFromInnerBoundary(orbitItems, {
        maxOuterBoundary: outerRadius,
        paddingMm: levelMetrics.paddingMm,
        startInnerBoundary: innerRadius,
      })
    }

    for (const { source, shell } of shellRefs) {
      source.localX = shell.localX
      source.localY = shell.localY
      source.localZ = shell.localZ
    }

    for (const { source, field } of fieldRefs) {
      source.localX = field.localX
      source.localY = field.localY
      source.localZ = field.localZ
      source.sphereRadius = field.sphereRadius
    }

    for (const child of childParticles) {
      reflowShell(child)
    }
  }

  for (const root of scaledSnapshot.particles.filter((particle) => particle.parentParticleId === null)) {
    reflowShell(root)
  }

  return scaledSnapshot
}
