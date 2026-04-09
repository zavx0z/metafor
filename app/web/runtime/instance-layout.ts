import type {
  DbFieldOrbitSnapshot,
  DbFieldValueKind,
  DbParticleKind,
  DbParticleShellSnapshot,
  DbWorldSnapshot,
} from "../../../pkg/db/index.ts"
import {
  appWebLayoutConfig,
  normalizeAppWebLayoutSettings,
  type AppWebLayoutSettings,
} from "../settings.ts"
import { resolveAppWebLevelMetrics } from "../level.ts"

const snapshotLayoutConfig = appWebLayoutConfig.snapshot

/** Входной дескриптор ordinary field до shell-materialization в instance snapshot. */
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

interface LayoutFieldNode extends DbFieldOrbitSnapshot {
  extent: number
}

interface LayoutShellNode extends Omit<DbParticleShellSnapshot, "parentParticleId" | "depth" | "shellOrder"> {
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

const getLevelMetrics = (
  depthFromRoot: number,
  settings: AppWebLayoutSettings,
  options: { outerRadiusMm?: number; rootOuterDiameterMm?: number } = {},
) =>
  resolveAppWebLevelMetrics({
    depth: depthFromRoot,
    layoutSettings: settings,
    rootOuterDiameterMm: options.rootOuterDiameterMm ?? snapshotLayoutConfig.rootOuterDiameterMm,
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
  radius: number
}

const measurePlacedExtent = (rings: OrbitRing[]): number =>
  rings.reduce((max, ring) => Math.max(max, ring.radius + ring.maxExtent), 0)

const getMaxRingCapacity = (radius: number, maxExtent: number): number => {
  if (maxExtent <= 0 || radius <= 0) return 1

  const normalizedExtent = (maxExtent * snapshotLayoutConfig.orbitItemSpacingFactor) / radius
  if (normalizedExtent >= 1) return 1

  return Math.max(1, Math.floor(Math.PI / Math.asin(normalizedExtent)))
}

const getSingleRingRadius = (items: OrbitItem[], startBoundary: number): number => {
  if (items.length === 0) return startBoundary

  const maxExtent = Math.max(...items.map((item) => item.extent))
  const totalArcLength = items.reduce(
    (sum, item) => sum + item.extent * 2 * snapshotLayoutConfig.orbitItemSpacingFactor,
    0,
  )
  const circumferenceRadius = totalArcLength / (Math.PI * 2)
  const angularRadius =
    items.length <= 1
      ? startBoundary + maxExtent
      : (maxExtent * snapshotLayoutConfig.orbitItemSpacingFactor) / Math.max(Math.sin(Math.PI / items.length), 0.1)

  return Math.max(startBoundary + maxExtent, circumferenceRadius, angularRadius)
}

const buildOrbitRings = (
  items: OrbitItem[],
  options: {
    maxOuterBoundary?: number
    startInnerBoundary?: number
    startOuterBoundary?: number
  } = {},
): OrbitRing[] => {
  if (items.length === 0) return []

  const sorted = [...items].sort((left, right) => right.extent - left.extent)
  const startBoundary = options.startOuterBoundary ?? options.startInnerBoundary ?? 0
  const singleRingRadius = getSingleRingRadius(sorted, startBoundary)
  const singleRingMaxExtent = Math.max(...sorted.map((item) => item.extent))
  if (
    options.maxOuterBoundary !== undefined &&
    singleRingRadius + singleRingMaxExtent <= options.maxOuterBoundary + 1e-6
  ) {
    return [
      {
        items: sorted,
        maxExtent: singleRingMaxExtent,
        radius: singleRingRadius,
      },
    ]
  }

  const rings: OrbitRing[] = []
  let cursor = 0
  let previousOuterBoundary = startBoundary

  while (cursor < sorted.length) {
    const remainingItems = sorted.length - cursor
    const seedExtent = sorted[cursor]?.extent ?? 0
    const radius = previousOuterBoundary + seedExtent
    const capacity = Math.max(1, getMaxRingCapacity(radius, seedExtent))
    const ringItems = sorted.slice(cursor, cursor + Math.min(remainingItems, capacity))
    const maxExtent = Math.max(...ringItems.map((item) => item.extent))

    rings.push({
      items: ringItems,
      maxExtent,
      radius,
    })

    previousOuterBoundary = radius + maxExtent
    cursor += ringItems.length
  }

  return rings
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

const distributeOrbitRingsAcrossTube = (
  rings: OrbitRing[],
  innerBoundary: number,
  outerBoundary: number,
): void => {
  if (rings.length === 0) return

  const availableWidth = outerBoundary - innerBoundary
  const occupiedWidth = rings.reduce((sum, ring) => sum + ring.maxExtent * 2, 0)
  if (availableWidth <= occupiedWidth) return

  const gap = (availableWidth - occupiedWidth) / (rings.length + 1)
  let cursor = innerBoundary + gap

  for (const ring of rings) {
    ring.radius = cursor + ring.maxExtent
    cursor = ring.radius + ring.maxExtent + gap
  }
}

const placeOrbitItemsFromInnerBoundary = (
  items: OrbitItem[],
  options: {
    maxOuterBoundary?: number
    startInnerBoundary?: number
    startOuterBoundary?: number
  } = {},
): { innerBoundary: number; outerBoundary: number } => {
  const rings = buildOrbitRings(items, options)
  if (rings.length === 0) {
    const start = options.startOuterBoundary ?? 0
    return { innerBoundary: start, outerBoundary: start }
  }

  const [firstRing] = rings
  if (!firstRing) {
    const start = options.startOuterBoundary ?? 0
    return { innerBoundary: start, outerBoundary: start }
  }

  if (options.startInnerBoundary !== undefined && options.maxOuterBoundary !== undefined) {
    distributeOrbitRingsAcrossTube(rings, options.startInnerBoundary, options.maxOuterBoundary)
  }

  for (const ring of rings) {
    positionOrbitRing(ring)
  }

  return {
    innerBoundary: firstRing.radius - firstRing.maxExtent,
    outerBoundary: measurePlacedExtent(rings),
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
  settings: AppWebLayoutSettings,
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
        getLevelMetrics(child.depthFromRoot, settings).canonicalOuterRadiusMm,
    },
    extent:
      outerByDepth.get(child.depthFromRoot) ??
      getLevelMetrics(child.depthFromRoot, settings).canonicalOuterRadiusMm,
  }))

  const fieldRadius = getLevelMetrics(node.depthFromRoot, settings).fieldSphereRadiusMm
  const fieldOrbitItems: OrbitItem[] = node.descriptor.fields.map((field) => ({
    kind: "field",
    field: cloneDescriptorField(node.descriptor, field, fieldRadius),
    extent: fieldRadius,
  }))

  return [...childOrbitItems, ...fieldOrbitItems]
}

const resolveOuterRadiusByDepth = (
  roots: ShellDescriptorNode[],
  settings: AppWebLayoutSettings,
): Map<number, number> => {
  const nodesByDepth = new Map<number, ShellDescriptorNode[]>()
  for (const root of roots) {
    collectNodesByDepth(root, nodesByDepth)
  }

  const depths = [...nodesByDepth.keys()].sort((left, right) => right - left)
  const outerByDepth = new Map<number, number>()

  for (const depth of depths) {
    const nodes = nodesByDepth.get(depth) ?? []
    let resolvedOuter = getLevelMetrics(depth, settings).canonicalOuterRadiusMm

    for (let iteration = 0; iteration < 32; iteration += 1) {
      let nextOuter = resolvedOuter
      const innerRadius = getLevelMetrics(depth, settings, { outerRadiusMm: resolvedOuter }).innerRadiusMm

      for (const node of nodes) {
        const orbitItems = createOuterRequirementOrbitItems(node, settings, outerByDepth)
        if (orbitItems.length === 0) continue

        const packed = placeOrbitItemsFromInnerBoundary(orbitItems, {
          maxOuterBoundary: resolvedOuter,
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
  settings: AppWebLayoutSettings,
  outerByDepth: Map<number, number>,
): LayoutShellNode => {
  const nestedChildren = node.children.map((child) =>
    materializeCanonicalShellNode(child, settings, outerByDepth),
  )
  const depthFromRoot = node.depthFromRoot
  const descriptor = node.descriptor
  const sphereRadius = getLevelMetrics(depthFromRoot, settings).fieldSphereRadiusMm
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

  const levelMetrics = getLevelMetrics(depthFromRoot, settings, {
    outerRadiusMm:
      outerByDepth.get(depthFromRoot) ?? getLevelMetrics(depthFromRoot, settings).canonicalOuterRadiusMm,
  })
  const outerRadius = levelMetrics.outerRadiusMm
  const innerRadius = levelMetrics.innerRadiusMm

  if (orbitItems.length > 0) {
    placeOrbitItemsFromInnerBoundary(orbitItems, {
      maxOuterBoundary: outerRadius,
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
  particles: DbParticleShellSnapshot[],
  fields: DbFieldOrbitSnapshot[],
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
 * {@link createDbWorldSnapshotFromParticleDescriptors} и
 * {@link scaleDbWorldSnapshotToRootOuterDiameter}. Локальный post-scale по поддереву
 * здесь больше не выполняется, потому что он ломает одинаковый размер shell-ов на одном depth.
 */
export const enforceRootShellLayoutSettings = (
  snapshot: DbWorldSnapshot,
  _settings: Partial<AppWebLayoutSettings> = {},
): DbWorldSnapshot => {
  return {
    rootSrc: snapshot.rootSrc,
    particles: snapshot.particles.map((particle) => ({ ...particle })),
    fields: snapshot.fields.map((field) => ({ ...field })),
  }
}

/**
 * Строит planar `pkg/db` world snapshot из семантического particle-дерева.
 *
 * Закон раскладки:
 * - сцена остаётся в `Z-up`
 * - размеры shell-ов задаются сверху вниз от root-уровня вглубь
 * - все shell-ы на одном depth имеют одинаковый внешний размер
 * - ordinary fields materialize-ятся как сферы peer-level размера
 * - orbit packing сначала пытается уложить всё в один ring, затем делит на несколько равномерно распределённых ring-ов
 */
export const createDbWorldSnapshotFromParticleDescriptors = (
  rootSrc: string,
  roots: DbWorldParticleDescriptor[],
  settings: Partial<AppWebLayoutSettings> = {},
): DbWorldSnapshot => {
  const resolvedSettings = normalizeAppWebLayoutSettings(settings)
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

  const particles: DbParticleShellSnapshot[] = []
  const fields: DbFieldOrbitSnapshot[] = []

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
export const scaleDbWorldSnapshotToRootOuterDiameter = (
  snapshot: DbWorldSnapshot,
  targetOuterDiameter: number = snapshotLayoutConfig.rootOuterDiameterMm,
  settings: Partial<AppWebLayoutSettings> = {},
): DbWorldSnapshot => {
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

  const scaledSnapshot: DbWorldSnapshot = {
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

  const resolvedSettings = normalizeAppWebLayoutSettings(settings)
  const particlesById = new Map(
    scaledSnapshot.particles.map((particle) => [particle.particleId, particle]),
  )
  const childrenByParentId = new Map<string, DbParticleShellSnapshot[]>()
  const fieldsByParticleId = new Map<string, DbFieldOrbitSnapshot[]>()

  for (const particle of scaledSnapshot.particles) {
    if (!particle.parentParticleId) continue
    const children = childrenByParentId.get(particle.parentParticleId) ?? []
    children.push(particle)
    childrenByParentId.set(particle.parentParticleId, children)
  }

  for (const field of scaledSnapshot.fields) {
    const parent = particlesById.get(field.particleId)
    if (!parent) continue
    field.sphereRadius = getLevelMetrics(parent.depth, resolvedSettings, {
      rootOuterDiameterMm: targetOuterDiameter,
    }).fieldSphereRadiusMm
    const fields = fieldsByParticleId.get(field.particleId) ?? []
    fields.push(field)
    fieldsByParticleId.set(field.particleId, fields)
  }

  const reflowShell = (particle: DbParticleShellSnapshot): void => {
    const outerRadius = particle.shellRadius + particle.shellTube
    const innerRadius = getLevelMetrics(particle.depth, resolvedSettings, {
      outerRadiusMm: outerRadius,
      rootOuterDiameterMm: targetOuterDiameter,
    }).innerRadiusMm
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
