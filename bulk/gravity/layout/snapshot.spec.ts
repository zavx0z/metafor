import { describe, expect, test } from "bun:test"
import {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
} from "./snapshot"
import { DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG } from "./settings"
import type { BulkDarkParticle, BulkDarkParticleInput, BulkFieldParticle, BulkManifest } from "@metafor/types/bulk/manifest"

const createFieldParticle = (fieldId: number) => ({
  fieldParticleId: `field:${fieldId}`,
  fieldId,
  fieldKey: String(fieldId),
  fieldLabel: String(fieldId),
  fieldParticleKind: "string" as const,
  valueText: String(fieldId),
  colorR: 1,
  colorG: 1,
  colorB: 1,
})

const createDarkParticle = (
  darkParticleId: number,
  children: BulkDarkParticleInput[] = [],
  fieldParticleIds: number[] = [],
): BulkDarkParticleInput => ({
  darkParticleId,
  darkParticleKind: "atom",
  src: String(darkParticleId),
  metaSrc: String(darkParticleId),
  label: String(darkParticleId),
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fieldParticles: fieldParticleIds.map(createFieldParticle),
  children,
})

const createTopologyParticle = (
  darkParticleId: number,
  kind: "fuzzy" | "macho",
  children: BulkDarkParticleInput[],
): BulkDarkParticleInput => ({
  darkParticleId,
  darkParticleKind: kind,
  src: String(darkParticleId),
  metaSrc: String(darkParticleId),
  label: kind,
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fieldParticles: [],
  children,
})

const getVisualOuterRadius = (darkParticle: BulkDarkParticle): number =>
  getOuterRadius(darkParticle) * darkParticle.torusScale

const getOuterRadius = (darkParticle: BulkDarkParticle): number =>
  darkParticle.torusRadius + darkParticle.torusTube

const getInnerRadius = (darkParticle: BulkDarkParticle): number =>
  darkParticle.torusRadius - darkParticle.torusTube

const getDarkParticle = (manifest: BulkManifest, darkParticleId: number): BulkDarkParticle => {
  const darkParticle = manifest.darkParticles.find((item) => item.darkParticleId === darkParticleId)
  expect(darkParticle).toBeDefined()
  return darkParticle!
}

const getFieldParticle = (manifest: BulkManifest, fieldParticleId: string): BulkFieldParticle => {
  const fieldParticle = manifest.fieldParticles.find((item) => item.fieldParticleId === fieldParticleId)
  expect(fieldParticle).toBeDefined()
  return fieldParticle!
}

type ManifestedDarkParticleGeometry = {
  center: [number, number, number]
  outerRadius: number
  scale: number
}

const manifestedDarkParticleGeometry = (
  manifest: BulkManifest,
  darkParticleId: number,
  cache = new Map<number, ManifestedDarkParticleGeometry>(),
): ManifestedDarkParticleGeometry => {
  const cached = cache.get(darkParticleId)
  if (cached) return cached
  const particle = getDarkParticle(manifest, darkParticleId)
  const parent = particle.parentDarkParticleId === null
    ? {center: [0, 0, 0] as [number, number, number], scale: 1}
    : manifestedDarkParticleGeometry(manifest, particle.parentDarkParticleId, cache)
  const scale = parent.scale * particle.torusScale
  const result = {
    center: [
      parent.center[0] + particle.localX * parent.scale,
      parent.center[1] + particle.localY * parent.scale,
      parent.center[2] + particle.localZ * parent.scale,
    ] as [number, number, number],
    outerRadius: getOuterRadius(particle) * scale,
    scale,
  }
  cache.set(darkParticleId, result)
  return result
}

const distance = (left: [number, number, number], right: [number, number, number]): number =>
  Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])

const expectSubtreesInsideParents = (manifest: BulkManifest): void => {
  const childrenByParent = new Map<number, number[]>()
  for (const particle of manifest.darkParticles) {
    if (particle.parentDarkParticleId === null) continue
    const children = childrenByParent.get(particle.parentDarkParticleId)
    if (children) children.push(particle.darkParticleId)
    else childrenByParent.set(particle.parentDarkParticleId, [particle.darkParticleId])
  }
  const cache = new Map<number, ManifestedDarkParticleGeometry>()

  for (const child of manifest.darkParticles.filter((particle) => particle.parentDarkParticleId !== null)) {
    const parent = manifestedDarkParticleGeometry(manifest, child.parentDarkParticleId!, cache)
    const subtreeIds = new Set<number>()
    const queue = [child.darkParticleId]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (subtreeIds.has(current)) continue
      subtreeIds.add(current)
      queue.push(...(childrenByParent.get(current) ?? []))
    }

    for (const descendantId of subtreeIds) {
      const descendant = manifestedDarkParticleGeometry(manifest, descendantId, cache)
      expect(distance(parent.center, descendant.center) + descendant.outerRadius).toBeLessThanOrEqual(
        parent.outerRadius + 0.001,
      )
    }
    for (const field of manifest.fieldParticles.filter((particle) => subtreeIds.has(particle.parentDarkParticleId))) {
      const fieldParent = manifestedDarkParticleGeometry(manifest, field.parentDarkParticleId, cache)
      const fieldCenter: [number, number, number] = [
        fieldParent.center[0] + field.localX * fieldParent.scale,
        fieldParent.center[1] + field.localY * fieldParent.scale,
        fieldParent.center[2] + field.localZ * fieldParent.scale,
      ]
      expect(distance(parent.center, fieldCenter) + field.sphereRadius * fieldParent.scale).toBeLessThanOrEqual(
        parent.outerRadius + 0.001,
      )
    }
  }
}

const expectFieldNucleiInsideParents = (manifest: BulkManifest): void => {
  const darkParticlesById = new Map(manifest.darkParticles.map((darkParticle) => [darkParticle.darkParticleId, darkParticle]))
  for (const fieldParticle of manifest.fieldParticles) {
    const parent = darkParticlesById.get(fieldParticle.parentDarkParticleId)
    expect(parent).toBeDefined()
    expect(
      Math.hypot(fieldParticle.localX, fieldParticle.localY, fieldParticle.localZ) + fieldParticle.sphereRadius,
    ).toBeLessThanOrEqual(
      getInnerRadius(parent!) + 0.001,
    )
  }
}

const expectFieldNucleiHaveNoIntersections = (manifest: BulkManifest): void => {
  const cache = new Map<number, ManifestedDarkParticleGeometry>()
  for (let leftIndex = 0; leftIndex < manifest.fieldParticles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < manifest.fieldParticles.length; rightIndex += 1) {
      const left = manifest.fieldParticles[leftIndex]!
      const right = manifest.fieldParticles[rightIndex]!
      const leftParent = manifestedDarkParticleGeometry(manifest, left.parentDarkParticleId, cache)
      const rightParent = manifestedDarkParticleGeometry(manifest, right.parentDarkParticleId, cache)
      const leftCenter: [number, number, number] = [
        leftParent.center[0] + left.localX * leftParent.scale,
        leftParent.center[1] + left.localY * leftParent.scale,
        leftParent.center[2] + left.localZ * leftParent.scale,
      ]
      const rightCenter: [number, number, number] = [
        rightParent.center[0] + right.localX * rightParent.scale,
        rightParent.center[1] + right.localY * rightParent.scale,
        rightParent.center[2] + right.localZ * rightParent.scale,
      ]
      const distance = Math.hypot(
        leftCenter[0] - rightCenter[0],
        leftCenter[1] - rightCenter[1],
        leftCenter[2] - rightCenter[2],
      )
      expect(distance).toBeGreaterThanOrEqual(
        left.sphereRadius * leftParent.scale + right.sphereRadius * rightParent.scale - 0.001,
      )
    }
  }
}

describe("bulk/gravity/layout manifest", () => {
  test("пустой Atom получает классический тор 2:1 без избыточной центральной пустоты", () => {
    const manifest = scaleBulkManifestToRootOuterDiameter(
      createBulkManifestFromDarkParticleInputs("empty", [createDarkParticle(1)]),
    )
    const root = getDarkParticle(manifest, 1)

    expect(manifest.fieldParticles).toHaveLength(0)
    expect(getOuterRadius(root) * 2).toBeCloseTo(100, 6)
    expect(root.torusRadius / root.torusTube).toBeCloseTo(2, 6)
    expect(getInnerRadius(root) * 2).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm / 3,
      6,
    )
  })

  test("строит рекурсивный Z-up layout с меньшим manifested extent на каждом уровне", () => {
    const manifest = scaleBulkManifestToRootOuterDiameter(createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [createDarkParticle(2, [createDarkParticle(3, [], [103])], [102])], [101]),
    ]))

    const root = getDarkParticle(manifest, 1)
    const child = getDarkParticle(manifest, 2)
    const leaf = getDarkParticle(manifest, 3)
    const rootField = getFieldParticle(manifest, "field:101")
    const childField = getFieldParticle(manifest, "field:102")
    const leafField = getFieldParticle(manifest, "field:103")

    expect(rootField.fieldId).toBe(101)
    expect(childField.fieldId).toBe(102)
    expect(leafField.fieldId).toBe(103)
    expect(getOuterRadius(root)).toBeGreaterThan(0)
    expect(getOuterRadius(child)).toBeGreaterThan(0)
    expect(getOuterRadius(leaf)).toBeGreaterThan(0)
    expect(getOuterRadius(child)).toBeCloseTo(getOuterRadius(root), 6)
    expect(getOuterRadius(leaf)).toBeCloseTo(getOuterRadius(root), 6)
    expect(child.torusRadius).toBeCloseTo(root.torusRadius, 6)
    expect(leaf.torusRadius).toBeCloseTo(root.torusRadius, 6)
    expect(child.torusTube).toBeCloseTo(root.torusTube, 6)
    expect(leaf.torusTube).toBeCloseTo(root.torusTube, 6)
    expect(rootField.sphereRadius).toBe(childField.sphereRadius)
    expect(childField.sphereRadius).toBe(leafField.sphereRadius)
    expect(manifest.darkParticles.every((darkParticle) => darkParticle.localZ === 0)).toBe(true)
    expect(rootField.localX).toBe(0)
    expect(rootField.localY).toBe(0)
    expect(rootField.localZ).toBe(0)
    expect(manifestedDarkParticleGeometry(manifest, child.darkParticleId).outerRadius).toBeLessThan(
      manifestedDarkParticleGeometry(manifest, root.darkParticleId).outerRadius,
    )
    expect(manifestedDarkParticleGeometry(manifest, leaf.darkParticleId).outerRadius).toBeLessThan(
      manifestedDarkParticleGeometry(manifest, child.darkParticleId).outerRadius,
    )
    expect(child.torusScale).toBeLessThan(1)
    expect(leaf.torusScale).toBeLessThan(1)
    expectSubtreesInsideParents(manifest)
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("потомки не расширяют внешний envelope родителя и не превращаются в Fields", () => {
    const compact = createBulkManifestFromDarkParticleInputs("compact", [
      createDarkParticle(1, [createTopologyParticle(20, "fuzzy", [createDarkParticle(2, [], [101])])]),
    ])
    const expanded = createBulkManifestFromDarkParticleInputs("expanded", [
      createDarkParticle(1, [createTopologyParticle(20, "fuzzy", [
        createDarkParticle(2, [], [101]),
        createDarkParticle(3, [], [102]),
        createDarkParticle(4, [], [103]),
        createDarkParticle(5, [], [104]),
        createDarkParticle(6, [], [105]),
        createDarkParticle(7, [], [106]),
        createDarkParticle(8, [], [107]),
        createDarkParticle(9, [], [108]),
        createDarkParticle(10, [], [109]),
        createDarkParticle(11, [], [110]),
        createDarkParticle(12, [], [111]),
        createDarkParticle(13, [], [112]),
      ])]),
    ])

    expect(getDarkParticle(expanded, 20)).toMatchObject({
      torusRadius: getDarkParticle(compact, 20).torusRadius,
      torusTube: getDarkParticle(compact, 20).torusTube,
      torusScale: getDarkParticle(compact, 20).torusScale,
    })
    expect(expanded.darkParticles).toHaveLength(14)
    expect(expanded.fieldParticles).toHaveLength(12)
    expect(expanded.darkParticles.filter((particle) => particle.parentDarkParticleId === 20)).toHaveLength(12)
    expectSubtreesInsideParents(expanded)
    expectFieldNucleiInsideParents(expanded)
    expectFieldNucleiHaveNoIntersections(expanded)
  })

  test("Fuzzy и MACHO детерминированно упакованы внутри root вместо общего плоского центра", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [
        createTopologyParticle(20, "fuzzy", [createDarkParticle(2, [], [102])]),
        createTopologyParticle(30, "macho", [
          createDarkParticle(3, [], [103]),
          createDarkParticle(4, [], [104, 105, 106]),
        ]),
      ], [101]),
    ])

    const root = getDarkParticle(manifest, 1)
    const fuzzy = getDarkParticle(manifest, 20)
    const macho = getDarkParticle(manifest, 30)

    expect(Math.hypot(fuzzy.localX, fuzzy.localY, fuzzy.localZ)).toBeGreaterThan(0)
    expect(Math.hypot(macho.localX, macho.localY, macho.localZ)).toBeGreaterThan(0)
    expect([fuzzy.localX, fuzzy.localY, fuzzy.localZ]).not.toEqual([macho.localX, macho.localY, macho.localZ])
    expect(fuzzy.torusScale).toBeLessThan(1)
    expect(macho.torusScale).toBeLessThan(1)
    expectSubtreesInsideParents(manifest)
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("каждый sibling повторяет тот же фрактальный закон Atom в одном parent allocation", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [createTopologyParticle(20, "macho", [
        createDarkParticle(2, [createDarkParticle(4, [], [101])]),
        createDarkParticle(3, [], [102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113]),
      ])]),
    ])

    const childA = getDarkParticle(manifest, 2)
    const childB = getDarkParticle(manifest, 3)

    expect(childA.depth).toBe(childB.depth)
    expect(getVisualOuterRadius(childB)).toBeCloseTo(getVisualOuterRadius(childA), 6)
    expect(childB.torusScale).toBeCloseTo(childA.torusScale, 6)
    expect(childB.torusRadius).toBeCloseTo(childA.torusRadius, 6)
    expect(childB.torusTube).toBeCloseTo(childA.torusTube, 6)
    expect([childA.localX, childA.localY, childA.localZ]).not.toEqual([childB.localX, childB.localY, childB.localZ])
    expectSubtreesInsideParents(manifest)
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("плотное ядро Fields использует несколько трехмерных lattice shells", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [], Array.from({ length: 40 }, (_, index) => 100 + index)),
    ], { rootSphereRadiusMm: 280 })

    const shellKeys = new Set(
      manifest.fieldParticles.map((fieldParticle) =>
        Math.hypot(fieldParticle.localX, fieldParticle.localY, fieldParticle.localZ).toFixed(6),
      ),
    )

    expect(shellKeys.size).toBeGreaterThan(1)
    expect(manifest.fieldParticles.some((fieldParticle) => fieldParticle.localZ !== 0)).toBe(true)
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("orbitEdgeGapMm задает дополнительный зазор между частицами ядра", () => {
    const compact = createBulkManifestFromDarkParticleInputs(
      "root",
      [createDarkParticle(1, [], [101, 102, 103])],
      {
        orbitEdgeGapMm: 0,
        rootInnerDiameterMm: 1000,
        rootSphereRadiusMm: 200,
      },
    )
    const spaced = createBulkManifestFromDarkParticleInputs(
      "root",
      [createDarkParticle(1, [], [101, 102, 103])],
      {
        orbitEdgeGapMm: 80,
        rootInnerDiameterMm: 1000,
        rootSphereRadiusMm: 200,
      },
    )
    const compactDistance = Math.hypot(
      compact.fieldParticles[0]!.localX - compact.fieldParticles[1]!.localX,
      compact.fieldParticles[0]!.localY - compact.fieldParticles[1]!.localY,
      compact.fieldParticles[0]!.localZ - compact.fieldParticles[1]!.localZ,
    )
    const spacedDistance = Math.hypot(
      spaced.fieldParticles[0]!.localX - spaced.fieldParticles[1]!.localX,
      spaced.fieldParticles[0]!.localY - spaced.fieldParticles[1]!.localY,
      spaced.fieldParticles[0]!.localZ - spaced.fieldParticles[1]!.localZ,
    )

    const compactEdgeGap = compactDistance - compact.fieldParticles[0]!.sphereRadius - compact.fieldParticles[1]!.sphereRadius
    const spacedEdgeGap = spacedDistance - spaced.fieldParticles[0]!.sphereRadius - spaced.fieldParticles[1]!.sphereRadius
    expect(spacedEdgeGap).toBeGreaterThan(compactEdgeGap)
    expectFieldNucleiInsideParents(spaced)
    expectFieldNucleiHaveNoIntersections(spaced)
  })

  test("Field-ядро уплотняется внутри фиксированного Atom envelope", () => {
    const manifest = createBulkManifestFromDarkParticleInputs(
      "root",
      [
        createDarkParticle(1, [
          createDarkParticle(2, [createDarkParticle(4, [], [101])]),
          createDarkParticle(3, [], [102, 103, 104, 105, 106, 107]),
        ], [100]),
      ],
      { rootInnerDiameterMm: 1800 },
    )
    const root = getDarkParticle(manifest, 1)
    const sparse = createBulkManifestFromDarkParticleInputs("root", [createDarkParticle(1, [], [100])], {
      rootInnerDiameterMm: 1800,
    })
    expect(root.torusRadius).toBeCloseTo(getDarkParticle(sparse, 1).torusRadius, 6)
    expect(root.torusTube).toBeCloseTo(getDarkParticle(sparse, 1).torusTube, 6)
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
    expect(getInnerRadius(getDarkParticle(manifest, 2))).toBeGreaterThan(0)
    expect(getInnerRadius(getDarkParticle(manifest, 3))).toBeGreaterThan(0)
  })

  test("нормализация делает только глобальный scale к root outer diameter", () => {
    const raw = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [
        createDarkParticle(2, [createDarkParticle(4, [], [101])]),
        createDarkParticle(3, [], [102, 103, 104, 105, 106, 107, 108, 109]),
      ], [100]),
    ])
    const normalized = scaleBulkManifestToRootOuterDiameter(raw)
    const rawRoot = getDarkParticle(raw, 1)
    const normalizedRoot = getDarkParticle(normalized, 1)
    const rawChild = getDarkParticle(raw, 2)
    const normalizedChild = getDarkParticle(normalized, 2)
    const normalizedField = getFieldParticle(normalized, "field:100")

    expect(normalizedField.fieldId).toBe(100)
    expect(getOuterRadius(normalizedRoot) * 2).toBeCloseTo(
      DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm,
      6,
    )
    expect(getOuterRadius(normalizedChild) / getOuterRadius(normalizedRoot)).toBeCloseTo(
      getOuterRadius(rawChild) / getOuterRadius(rawRoot),
      6,
    )
    expect(Math.hypot(normalizedChild.localX, normalizedChild.localY) / getOuterRadius(normalizedRoot)).toBeCloseTo(
      Math.hypot(rawChild.localX, rawChild.localY) / getOuterRadius(rawRoot),
      6,
    )
    expectFieldNucleiInsideParents(normalized)
    expectFieldNucleiHaveNoIntersections(normalized)
  })

  test("одинаковый materialized tree всегда даёт ту же рекурсивную геометрию", () => {
    const input = createDarkParticle(1, [
      createDarkParticle(2, [createDarkParticle(4, [], [104])], [102]),
      createDarkParticle(3, [], [103]),
    ], [101])

    const first = scaleBulkManifestToRootOuterDiameter(createBulkManifestFromDarkParticleInputs("root", [input]))
    const second = scaleBulkManifestToRootOuterDiameter(createBulkManifestFromDarkParticleInputs("root", [input]))

    expect(second).toEqual(first)
    expect(getOuterRadius(getDarkParticle(first, 1)) * 2).toBeCloseTo(100, 6)
    expectSubtreesInsideParents(first)
  })

  test("первый root Dark particle остается в центре, остальные root Dark particles уходят на внешнюю orbit band", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("multi-root", [
      createDarkParticle(1, [createDarkParticle(2)], [101]),
      createDarkParticle(3, [createDarkParticle(4)], [102]),
    ])

    const rootA = getDarkParticle(manifest, 1)
    const rootB = getDarkParticle(manifest, 3)

    expect(rootA.parentDarkParticleId).toBeNull()
    expect(rootB.parentDarkParticleId).toBeNull()
    expect(rootA.localX).toBe(0)
    expect(rootA.localY).toBe(0)
    expect(Math.hypot(rootB.localX, rootB.localY)).toBeGreaterThan(getOuterRadius(rootA))
  })
})
