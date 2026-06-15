import { describe, expect, test } from "bun:test"
import {
  createDbWorldRowsFromParticleDescriptors,
  scaleDbWorldRowsToRootOuterDiameter,
  type DbWorldParticleDescriptor,
} from "./snapshot"
import { DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG } from "./settings"
import type { DbFieldOrbitRow, DbParticleShellRow, DbWorldRows } from "./world"

const createField = (id: string) => ({
  id,
  fieldKey: id,
  fieldLabel: id,
  fieldValueKind: "text" as const,
  valueText: id,
  colorR: 1,
  colorG: 1,
  colorB: 1,
})

const createParticle = (
  particleId: string,
  children: DbWorldParticleDescriptor[] = [],
  fieldIds: string[] = [],
): DbWorldParticleDescriptor => ({
  particleId,
  kind: "wimp",
  src: particleId,
  metaSrc: particleId,
  label: particleId,
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
  fields: fieldIds.map(createField),
  children,
})

const getOuterRadius = (particle: DbParticleShellRow): number =>
  particle.shellRadius + particle.shellTube

const getInnerRadius = (particle: DbParticleShellRow): number =>
  particle.shellRadius - particle.shellTube

const getParticle = (snapshot: DbWorldRows, particleId: string): DbParticleShellRow => {
  const particle = snapshot.particles.find((row) => row.particleId === particleId)
  expect(particle).toBeDefined()
  return particle!
}

const getField = (snapshot: DbWorldRows, id: string): DbFieldOrbitRow => {
  const field = snapshot.fields.find((row) => row.id === id)
  expect(field).toBeDefined()
  return field!
}

const expectSnapshotContentInsideParents = (snapshot: DbWorldRows): void => {
  const particlesById = new Map(snapshot.particles.map((particle) => [particle.particleId, particle]))

  for (const particle of snapshot.particles) {
    if (particle.parentParticleId === null) continue
    const parent = particlesById.get(particle.parentParticleId)
    expect(parent).toBeDefined()
    expect(Math.hypot(particle.localX, particle.localY) - getOuterRadius(particle)).toBeGreaterThanOrEqual(
      getInnerRadius(parent!) - 0.001,
    )
    expect(Math.hypot(particle.localX, particle.localY) + getOuterRadius(particle)).toBeLessThanOrEqual(
      getOuterRadius(parent!) + 0.001,
    )
  }

  for (const field of snapshot.fields) {
    const parent = particlesById.get(field.particleId)
    expect(parent).toBeDefined()
    expect(Math.hypot(field.localX, field.localY) - field.sphereRadius).toBeGreaterThanOrEqual(
      getInnerRadius(parent!) - 0.001,
    )
    expect(Math.hypot(field.localX, field.localY) + field.sphereRadius).toBeLessThanOrEqual(
      getOuterRadius(parent!) + 0.001,
    )
  }
}

const expectSnapshotNoSiblingIntersections = (snapshot: DbWorldRows): void => {
  const itemsByParent = new Map<
    string,
    Array<{ id: string; localX: number; localY: number; radius: number }>
  >()

  for (const particle of snapshot.particles) {
    if (particle.parentParticleId === null) continue
    const items = itemsByParent.get(particle.parentParticleId) ?? []
    items.push({
      id: particle.particleId,
      localX: particle.localX,
      localY: particle.localY,
      radius: getOuterRadius(particle),
    })
    itemsByParent.set(particle.parentParticleId, items)
  }

  for (const field of snapshot.fields) {
    const items = itemsByParent.get(field.particleId) ?? []
    items.push({
      id: field.id,
      localX: field.localX,
      localY: field.localY,
      radius: field.sphereRadius,
    })
    itemsByParent.set(field.particleId, items)
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

describe("bulk/gravity/layout snapshot", () => {
  test("строит bottom-up tor layout в Z-up и размещает поля на орбитах", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors("root", [
      createParticle("root", [
        createParticle("child", [
          createParticle("leaf", [], ["leaf-field"]),
        ], ["child-field"]),
      ], ["root-field"]),
    ])

    const root = getParticle(snapshot, "root")
    const child = getParticle(snapshot, "child")
    const leaf = getParticle(snapshot, "leaf")
    const rootField = getField(snapshot, "root-field")
    const childField = getField(snapshot, "child-field")
    const leafField = getField(snapshot, "leaf-field")

    expect(getOuterRadius(root)).toBeGreaterThan(getOuterRadius(child))
    expect(getOuterRadius(child)).toBeGreaterThan(getOuterRadius(leaf))
    expect(rootField.sphereRadius).toBeGreaterThan(childField.sphereRadius)
    expect(childField.sphereRadius).toBeGreaterThan(leafField.sphereRadius)
    expect(snapshot.fields.every((field) => field.localZ === 0)).toBe(true)
    expect(snapshot.particles.every((particle) => particle.localZ === 0)).toBe(true)
    expect(Math.hypot(rootField.localX, rootField.localY)).toBeGreaterThan(0)
    expectSnapshotContentInsideParents(snapshot)
    expectSnapshotNoSiblingIntersections(snapshot)
  })

  test("родительский тор расширяется от плотности вложенного содержимого", () => {
    const compact = createDbWorldRowsFromParticleDescriptors("compact", [
      createParticle("root", [createParticle("child-a", [], ["leaf-a"])]),
    ])
    const expanded = createDbWorldRowsFromParticleDescriptors("expanded", [
      createParticle("root", [
        createParticle("child-a", [], ["leaf-a"]),
        createParticle("child-b", [], ["leaf-b"]),
        createParticle("child-c", [], ["leaf-c"]),
        createParticle("child-d", [], ["leaf-d"]),
        createParticle("child-e", [], ["leaf-e"]),
        createParticle("child-f", [], ["leaf-f"]),
        createParticle("child-g", [], ["leaf-g"]),
        createParticle("child-h", [], ["leaf-h"]),
        createParticle("child-i", [], ["leaf-i"]),
        createParticle("child-j", [], ["leaf-j"]),
        createParticle("child-k", [], ["leaf-k"]),
        createParticle("child-l", [], ["leaf-l"]),
      ]),
    ])

    expect(getOuterRadius(getParticle(expanded, "root"))).toBeGreaterThan(
      getOuterRadius(getParticle(compact, "root")),
    )
    expectSnapshotContentInsideParents(expanded)
    expectSnapshotNoSiblingIntersections(expanded)
  })

  test("shell-ы одного depth могут иметь разные размеры из-за разного содержимого", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors("root", [
      createParticle("root", [
        createParticle("child-a", [createParticle("grand-a", [], ["leaf-a"])]),
        createParticle("child-b", [], ["b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m"]),
      ]),
    ])

    const childA = getParticle(snapshot, "child-a")
    const childB = getParticle(snapshot, "child-b")

    expect(childA.depth).toBe(childB.depth)
    expect(Math.abs(getOuterRadius(childA) - getOuterRadius(childB))).toBeGreaterThan(1)
    expectSnapshotContentInsideParents(snapshot)
    expectSnapshotNoSiblingIntersections(snapshot)
  })

  test("плотные поля раскладываются на несколько орбит внутри parent-тора", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors("root", [
      createParticle("root", [], Array.from({ length: 40 }, (_, index) => `field-${index}`)),
    ], { rootSphereRadiusMm: 280 })

    const ringKeys = new Set(
      snapshot.fields.map((field) => Math.hypot(field.localX, field.localY).toFixed(6)),
    )

    expect(ringKeys.size).toBeGreaterThan(1)
    expectSnapshotContentInsideParents(snapshot)
    expectSnapshotNoSiblingIntersections(snapshot)
  })

  test("orbitEdgeGapMm задает зазор от внутренней кромки тора до первого объекта", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors(
      "root",
      [createParticle("root", [], ["field-a", "field-b", "field-c"])],
      {
        orbitEdgeGapMm: 24,
        rootInnerDiameterMm: 1000,
        rootSphereRadiusMm: 200,
      },
    )
    const root = getParticle(snapshot, "root")
    const innerRadius = getInnerRadius(root)
    const minInnerGap = Math.min(
      ...snapshot.fields.map((field) => Math.hypot(field.localX, field.localY) - field.sphereRadius - innerRadius),
    )

    expect(minInnerGap).toBeCloseTo(24, 6)
    expectSnapshotContentInsideParents(snapshot)
    expectSnapshotNoSiblingIntersections(snapshot)
  })

  test("root inner ratio переносится на фактические размеры shell-ов", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors(
      "root",
      [
        createParticle("root", [
          createParticle("child-a", [createParticle("grand-a", [], ["leaf-a"])]),
          createParticle("child-b", [], ["b", "c", "d", "e", "f", "g"]),
        ], ["root-field"]),
      ],
      { rootInnerDiameterMm: 1800 },
    )
    const expectedRatio = 1800 / DEFAULT_BULK_LAYOUT_SNAPSHOT_CONFIG.rootOuterDiameterMm

    for (const particle of snapshot.particles) {
      expect(getInnerRadius(particle) / getOuterRadius(particle)).toBeCloseTo(expectedRatio, 6)
    }
  })

  test("нормализация делает только глобальный scale к root outer diameter", () => {
    const raw = createDbWorldRowsFromParticleDescriptors("root", [
      createParticle("root", [
        createParticle("child-a", [createParticle("grand-a", [], ["leaf-a"])]),
        createParticle("child-b", [], ["b", "c", "d", "e", "f", "g", "h", "i"]),
      ], ["root-field"]),
    ])
    const normalized = scaleDbWorldRowsToRootOuterDiameter(raw)
    const rawRoot = getParticle(raw, "root")
    const normalizedRoot = getParticle(normalized, "root")
    const rawChild = getParticle(raw, "child-a")
    const normalizedChild = getParticle(normalized, "child-a")

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
    expectSnapshotContentInsideParents(normalized)
    expectSnapshotNoSiblingIntersections(normalized)
  })

  test("первый root-shell остается в центре, остальные root-shell-ы уходят на внешнюю орбиту", () => {
    const snapshot = createDbWorldRowsFromParticleDescriptors("multi-root", [
      createParticle("root-a", [createParticle("child-a")], ["field-a"]),
      createParticle("root-b", [createParticle("child-b")], ["field-b"]),
    ])

    const rootA = getParticle(snapshot, "root-a")
    const rootB = getParticle(snapshot, "root-b")

    expect(rootA.parentParticleId).toBeNull()
    expect(rootB.parentParticleId).toBeNull()
    expect(rootA.localX).toBe(0)
    expect(rootA.localY).toBe(0)
    expect(Math.hypot(rootB.localX, rootB.localY)).toBeGreaterThan(getOuterRadius(rootA))
  })
})
