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
  orbitalComplexity?: BulkDarkParticleInput["orbitalComplexity"],
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
  ...(orbitalComplexity === undefined ? {} : {orbitalComplexity}),
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
  for (let leftIndex = 0; leftIndex < manifest.fieldParticles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < manifest.fieldParticles.length; rightIndex += 1) {
      const left = manifest.fieldParticles[leftIndex]!
      const right = manifest.fieldParticles[rightIndex]!
      const distance = Math.hypot(
        left.localX - right.localX,
        left.localY - right.localY,
        left.localZ - right.localZ,
      )
      expect(distance).toBeGreaterThanOrEqual(left.sphereRadius + right.sphereRadius - 0.001)
    }
  }
}

describe("bulk/gravity/layout manifest", () => {
  test("строит Z-up torus layout и держит Fields в компактных трехмерных ядрах", () => {
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
    const rootField = getFieldParticle(manifest, "field:101")
    const childField = getFieldParticle(manifest, "field:102")
    const leafField = getFieldParticle(manifest, "field:103")

    expect(rootField.fieldId).toBe(101)
    expect(childField.fieldId).toBe(102)
    expect(leafField.fieldId).toBe(103)
    expect(getOuterRadius(root)).toBeGreaterThan(0)
    expect(getOuterRadius(child)).toBeGreaterThan(0)
    expect(getOuterRadius(leaf)).toBeGreaterThan(0)
    expect(rootField.sphereRadius).toBe(childField.sphereRadius)
    expect(childField.sphereRadius).toBe(leafField.sphereRadius)
    expect(manifest.darkParticles.every((darkParticle) => darkParticle.localZ === 0)).toBe(true)
    expect(rootField.localX).toBe(0)
    expect(rootField.localY).toBe(0)
    expect(rootField.localZ).toBe(0)
    expect(getInnerRadius(child)).toBeGreaterThan(getInnerRadius(root))
    expect(getInnerRadius(leaf)).toBeGreaterThan(getInnerRadius(child))
    expect(getOuterRadius(leaf)).toBeLessThan(getOuterRadius(child))
    expect(getOuterRadius(child)).toBeLessThan(getOuterRadius(root))
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("топологический тор расширяется от числа вложенных WIMP и не превращает их в Fields", () => {
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

    expect(getVisualOuterRadius(getDarkParticle(expanded, 20))).toBeGreaterThan(
      getVisualOuterRadius(getDarkParticle(compact, 20)),
    )
    expect(expanded.darkParticles).toHaveLength(14)
    expect(expanded.fieldParticles).toHaveLength(12)
    expect(expanded.darkParticles.filter((particle) => particle.parentDarkParticleId === 20)).toHaveLength(12)
    expectFieldNucleiInsideParents(expanded)
    expectFieldNucleiHaveNoIntersections(expanded)
  })

  test("Fuzzy и MACHO занимают собственные полосы в объеме root-тора и сохраняют общий центр", () => {
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

    expect(fuzzy.localX).toBe(0)
    expect(fuzzy.localY).toBe(0)
    expect(macho.localX).toBe(0)
    expect(macho.localY).toBe(0)
    expect(getInnerRadius(fuzzy)).toBeGreaterThan(getInnerRadius(root))
    expect(getInnerRadius(macho)).toBeGreaterThan(getOuterRadius(fuzzy))
    expect(getOuterRadius(macho)).toBeLessThan(getOuterRadius(root))
    expectFieldNucleiInsideParents(manifest)
    expectFieldNucleiHaveNoIntersections(manifest)
  })

  test("содержательно более крупный WIMP получает больший visual extent независимо от depth", () => {
    const manifest = createBulkManifestFromDarkParticleInputs("root", [
      createDarkParticle(1, [createTopologyParticle(20, "macho", [
        createDarkParticle(2, [createDarkParticle(4, [], [101])]),
        createDarkParticle(3, [], [102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113], {
          states: 18,
          transitions: 36,
          processes: 4,
          reactions: 2,
        }),
      ])]),
    ])

    const childA = getDarkParticle(manifest, 2)
    const childB = getDarkParticle(manifest, 3)

    expect(childA.depth).toBe(childB.depth)
    expect(getVisualOuterRadius(childB)).toBeGreaterThan(getVisualOuterRadius(childA))
    expect(childA.localX).toBe(0)
    expect(childA.localY).toBe(0)
    expect(childB.localX).toBe(0)
    expect(childB.localY).toBe(0)
    expect(getInnerRadius(childB)).toBeGreaterThan(getInnerRadius(childA))
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

    expect(spacedDistance).toBeGreaterThan(compactDistance)
    expectFieldNucleiInsideParents(spaced)
    expectFieldNucleiHaveNoIntersections(spaced)
  })

  test("Field-ядро определяет общий внутренний диаметр и не оставляет вокруг себя фиксированную пустоту", () => {
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
    const nucleusOuterRadius = manifest.fieldParticles.reduce((max, field) => Math.max(
      max,
      Math.hypot(field.localX, field.localY, field.localZ) + field.sphereRadius,
    ), 0)
    expect(getInnerRadius(root)).toBeCloseTo(nucleusOuterRadius + 50 * 0.18, 6)
    expect(getInnerRadius(root)).toBeLessThan(900)
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
