import { describe, expect, test } from "bun:test"
import {
  createBulkManifestFromDarkParticleInputs,
  scaleBulkManifestToRootOuterDiameter,
  type BulkDarkParticleInput,
} from "./snapshot"
import { DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG } from "./settings"
import type { BulkDarkParticle, BulkFieldParticle, BulkManifest } from "./world"

const createFieldParticle = (fieldParticleId: number) => ({
  fieldParticleId,
  fieldId: fieldParticleId,
  fieldKey: String(fieldParticleId),
  fieldLabel: String(fieldParticleId),
  fieldParticleKind: "string" as const,
  valueText: String(fieldParticleId),
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
  darkParticleKind: "wimp",
  src: String(darkParticleId),
  metaSrc: String(darkParticleId),
  label: String(darkParticleId),
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fieldParticles: fieldParticleIds.map(createFieldParticle),
  children,
})

const getOuterRadius = (darkParticle: BulkDarkParticle): number =>
  darkParticle.torusRadius + darkParticle.torusTube

const getInnerRadius = (darkParticle: BulkDarkParticle): number =>
  darkParticle.torusRadius - darkParticle.torusTube

const getDarkParticle = (manifest: BulkManifest, darkParticleId: number): BulkDarkParticle => {
  const darkParticle = manifest.darkParticles.find((item) => item.darkParticleId === darkParticleId)
  expect(darkParticle).toBeDefined()
  return darkParticle!
}

const getFieldParticle = (manifest: BulkManifest, fieldParticleId: number): BulkFieldParticle => {
  const fieldParticle = manifest.fieldParticles.find((item) => item.fieldParticleId === fieldParticleId)
  expect(fieldParticle).toBeDefined()
  return fieldParticle!
}

const expectManifestContentInsideParents = (manifest: BulkManifest): void => {
  const darkParticlesById = new Map(manifest.darkParticles.map((darkParticle) => [darkParticle.darkParticleId, darkParticle]))

  for (const darkParticle of manifest.darkParticles) {
    if (darkParticle.parentDarkParticleId === null) continue
    const parent = darkParticlesById.get(darkParticle.parentDarkParticleId)
    expect(parent).toBeDefined()
    expect(Math.hypot(darkParticle.localX, darkParticle.localY) - getOuterRadius(darkParticle)).toBeGreaterThanOrEqual(
      getInnerRadius(parent!) - 0.001,
    )
    expect(Math.hypot(darkParticle.localX, darkParticle.localY) + getOuterRadius(darkParticle)).toBeLessThanOrEqual(
      getOuterRadius(parent!) + 0.001,
    )
  }

  for (const fieldParticle of manifest.fieldParticles) {
    const parent = darkParticlesById.get(fieldParticle.parentDarkParticleId)
    expect(parent).toBeDefined()
    expect(Math.hypot(fieldParticle.localX, fieldParticle.localY) - fieldParticle.sphereRadius).toBeGreaterThanOrEqual(
      getInnerRadius(parent!) - 0.001,
    )
    expect(Math.hypot(fieldParticle.localX, fieldParticle.localY) + fieldParticle.sphereRadius).toBeLessThanOrEqual(
      getOuterRadius(parent!) + 0.001,
    )
  }
}

const expectManifestNoSiblingIntersections = (manifest: BulkManifest): void => {
  const itemsByParent = new Map<
    number,
    Array<{ id: number; localX: number; localY: number; radius: number }>
  >()

  for (const darkParticle of manifest.darkParticles) {
    if (darkParticle.parentDarkParticleId === null) continue
    const items = itemsByParent.get(darkParticle.parentDarkParticleId) ?? []
    items.push({
      id: darkParticle.darkParticleId,
      localX: darkParticle.localX,
      localY: darkParticle.localY,
      radius: getOuterRadius(darkParticle),
    })
    itemsByParent.set(darkParticle.parentDarkParticleId, items)
  }

  for (const fieldParticle of manifest.fieldParticles) {
    const items = itemsByParent.get(fieldParticle.parentDarkParticleId) ?? []
    items.push({
      id: fieldParticle.fieldParticleId,
      localX: fieldParticle.localX,
      localY: fieldParticle.localY,
      radius: fieldParticle.sphereRadius,
    })
    itemsByParent.set(fieldParticle.parentDarkParticleId, items)
  }

  for (const items of itemsByParent.values()) {
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex]!
        const right = items[rightIndex]!
        const distance = Math.hypot(left.localX - right.localX, left.localY - right.localY)
        expect(distance).toBeGreaterThanOrEqual(left.radius + right.radius - 0.001)
      }
    }
  }
}

describe("bulk/gravity/layout manifest", () => {
  test("строит bottom-up torus layout в Z-up и размещает field particles по orbit bands", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [
        createDarkParticle(2, [
          createDarkParticle(3, [], [103]),
        ], [102]),
      ], [101]),
    ])

    const root = getDarkParticle(manifest, 1)
    const child = getDarkParticle(manifest, 2)
    const leaf = getDarkParticle(manifest, 3)
    const rootField = getFieldParticle(manifest, 101)
    const childField = getFieldParticle(manifest, 102)
    const leafField = getFieldParticle(manifest, 103)

    expect(rootField.fieldId).toBe(101)
    expect(childField.fieldId).toBe(102)
    expect(leafField.fieldId).toBe(103)
    expect(getOuterRadius(root)).toBeGreaterThan(getOuterRadius(child))
    expect(getOuterRadius(child)).toBeGreaterThan(getOuterRadius(leaf))
    expect(rootField.sphereRadius).toBeGreaterThan(childField.sphereRadius)
    expect(childField.sphereRadius).toBeGreaterThan(leafField.sphereRadius)
    expect(manifest.fieldParticles.every((fieldParticle) => fieldParticle.localZ === 0)).toBe(true)
    expect(manifest.darkParticles.every((darkParticle) => darkParticle.localZ === 0)).toBe(true)
    expect(Math.hypot(rootField.localX, rootField.localY)).toBeGreaterThan(0)
    expectManifestContentInsideParents(manifest)
    expectManifestNoSiblingIntersections(manifest)
  })

  test("parent torus expands from dense nested content", () => {
    const compact = createBulkManifestFromDarkParticleInputs("compact", [
      createDarkParticle(1, [createDarkParticle(2, [], [101])]),
    ])
    const expanded = createBulkManifestFromDarkParticleInputs("expanded", [
      createDarkParticle(1, [
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
      ]),
    ])

    expect(getOuterRadius(getDarkParticle(expanded, 1))).toBeGreaterThan(
      getOuterRadius(getDarkParticle(compact, 1)),
    )
    expectManifestContentInsideParents(expanded)
    expectManifestNoSiblingIntersections(expanded)
  })

  test("Dark particles на одном depth могут иметь разные torus sizes из-за разного содержимого", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [
        createDarkParticle(2, [createDarkParticle(4, [], [101])]),
        createDarkParticle(3, [], [102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113]),
      ]),
    ])

    const childA = getDarkParticle(manifest, 2)
    const childB = getDarkParticle(manifest, 3)

    expect(childA.depth).toBe(childB.depth)
    expect(Math.abs(getOuterRadius(childA) - getOuterRadius(childB))).toBeGreaterThan(1)
    expectManifestContentInsideParents(manifest)
    expectManifestNoSiblingIntersections(manifest)
  })

  test("плотные field particles раскладываются на несколько orbit bands внутри parent torus", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [], Array.from({ length: 40 }, (_, index) => 100 + index)),
    ], { rootSphereRadiusMm: 280 })

    const ringKeys = new Set(
      manifest.fieldParticles.map((fieldParticle) => Math.hypot(fieldParticle.localX, fieldParticle.localY).toFixed(6)),
    )

    expect(ringKeys.size).toBeGreaterThan(1)
    expectManifestContentInsideParents(manifest)
    expectManifestNoSiblingIntersections(manifest)
  })

  test("orbitEdgeGapMm задает зазор от внутренней кромки тора до первого объекта", () => {
    const manifest = createBulkManifestFromDarkParticleInputs(
      "root",
      [createDarkParticle(1, [], [101, 102, 103])],
      {
        orbitEdgeGapMm: 24,
        rootInnerDiameterMm: 1000,
        rootSphereRadiusMm: 200,
      },
    )
    const root = getDarkParticle(manifest, 1)
    const innerRadius = getInnerRadius(root)
    const minInnerGap = Math.min(
      ...manifest.fieldParticles.map((fieldParticle) => Math.hypot(fieldParticle.localX, fieldParticle.localY) - fieldParticle.sphereRadius - innerRadius),
    )

    expect(minInnerGap).toBeCloseTo(24, 6)
    expectManifestContentInsideParents(manifest)
    expectManifestNoSiblingIntersections(manifest)
  })

  test("root inner ratio переносится на фактические размеры Dark particle torus geometry", () => {
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
    const expectedRatio = 1800 / DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm

    for (const darkParticle of manifest.darkParticles) {
      expect(getInnerRadius(darkParticle) / getOuterRadius(darkParticle)).toBeCloseTo(expectedRatio, 6)
    }
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
    const normalizedField = getFieldParticle(normalized, 100)

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
    expectManifestContentInsideParents(normalized)
    expectManifestNoSiblingIntersections(normalized)
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
