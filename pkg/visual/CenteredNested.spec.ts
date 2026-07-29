import {describe, expect, test} from "bun:test"
import type {
  BulkDarkParticle,
  BulkFieldParticle,
  BulkManifest,
} from "@metafor/types/bulk/manifest"
import {
  buildCenteredNestedVisualScene,
  layoutCenteredNestedFields,
} from "./CenteredNested.ts"

const darkParticle = (
  darkParticleId: number,
  parentDarkParticleId: number | null,
  depth: number,
): BulkDarkParticle => ({
  darkParticleId,
  parentDarkParticleId,
  darkParticleKind: "atom",
  src: `owner/${darkParticleId}`,
  metaSrc: `owner/${darkParticleId}`,
  label: `Atom ${darkParticleId}`,
  depth,
  darkParticleOrder: 0,
  localX: depth === 0 ? 17 : 100 + depth,
  localY: depth === 0 ? -9 : 200 + depth,
  localZ: depth === 0 ? 3 : 300 + depth,
  torusScale: 0.5 ** depth,
  torusRadius: 20,
  torusTube: 5,
  colorR: 0.4,
  colorG: 0.45,
  colorB: 0.98,
})

const field = (
  fieldParticleId: string,
  fieldId: number,
  valueId: number,
  parentDarkParticleId: number,
  valueText: string,
): BulkFieldParticle => ({
  fieldParticleId,
  fieldId,
  valueId,
  parentDarkParticleId,
  fieldKey: fieldParticleId,
  fieldLabel: fieldParticleId,
  fieldParticleKind: "string",
  valueText,
  localX: 999,
  localY: 999,
  localZ: 999,
  sphereRadius: 0.1,
  colorR: 1,
  colorG: 0.08,
  colorB: 0.58,
})

const manifest = (): BulkManifest => ({
  rootSrc: "owner/1",
  darkParticles: [
    darkParticle(1, null, 0),
    darkParticle(2, 1, 1),
    darkParticle(3, 2, 2),
  ],
  fieldParticles: [
    field("root-private", 1, 101, 1, "same payload"),
    field("root-shared", 2, 102, 1, "root name"),
    field("child-shared-up", 3, 102, 2, "different child name"),
    field("child-private", 4, 103, 2, "same payload"),
    field("child-shared-down", 5, 104, 2, "child value"),
    field("grandchild-shared", 6, 104, 3, "grandchild value"),
    field("grandchild-private", 7, 105, 3, "private"),
  ],
})

const radialBounds = (
  placements: ReturnType<typeof layoutCenteredNestedFields>,
  band: number,
): Readonly<{inner: number; outer: number}> => {
  const entries = placements.filter((placement) => placement.band === band)
  return {
    inner: Math.min(...entries.map((placement) =>
      Math.hypot(placement.x - 17, placement.y + 9, placement.z - 3) -
        placement.radius
    )),
    outer: Math.max(...entries.map((placement) =>
      Math.hypot(placement.x - 17, placement.y + 9, placement.z - 3) +
        placement.radius
    )),
  }
}

describe("centered-nested Visual layout", () => {
  test("derives recursive Field bands from canonical shared Value identity", () => {
    const placements = layoutCenteredNestedFields(manifest())
    const byId = new Map(placements.map((placement) => [
      placement.field.fieldParticleId,
      placement,
    ] as const))

    expect(byId.get("root-private")).toMatchObject({
      band: 0,
      bandKind: "root-private",
      radius: 11,
    })
    expect(byId.get("root-shared")).toMatchObject({
      band: 1,
      bandKind: "shared",
      radius: 11,
    })
    expect(byId.get("child-shared-up")).toMatchObject({
      band: 1,
      bandKind: "shared",
      radius: 5.5,
    })
    expect(byId.get("child-private")).toMatchObject({
      band: 2,
      bandKind: "inner-private",
      radius: 5.5,
    })
    expect(byId.get("child-shared-down")).toMatchObject({
      band: 3,
      bandKind: "shared",
      radius: 5.5,
    })
    expect(byId.get("grandchild-shared")).toMatchObject({
      band: 3,
      bandKind: "shared",
      radius: 2.75,
    })
    expect(byId.get("grandchild-private")).toMatchObject({
      band: 4,
      bandKind: "inner-private",
      radius: 2.75,
    })

    expect(byId.get("root-private")?.field.valueText)
      .toBe(byId.get("child-private")?.field.valueText)
    expect(byId.get("root-private")?.band)
      .not.toBe(byId.get("child-private")?.band)
  })

  test("keeps one Field-diameter surface gap before every next orbit", () => {
    const placements = layoutCenteredNestedFields(manifest())
    const bounds = [0, 1, 2, 3, 4].map((band) =>
      radialBounds(placements, band)
    )

    expect(bounds[1]!.inner - bounds[0]!.outer)
      .toBeGreaterThanOrEqual(22 - 1e-9)
    expect(bounds[2]!.inner - bounds[1]!.outer)
      .toBeGreaterThanOrEqual(11 - 1e-9)
    expect(bounds[3]!.inner - bounds[2]!.outer)
      .toBeGreaterThanOrEqual(11 - 1e-9)
    expect(bounds[4]!.inner - bounds[3]!.outer)
      .toBeGreaterThanOrEqual(5.5 - 1e-9)

    for (let left = 0; left < placements.length; left += 1) {
      for (let right = left + 1; right < placements.length; right += 1) {
        const from = placements[left]!
        const to = placements[right]!
        expect(
          Math.hypot(
            from.x - to.x,
            from.y - to.y,
            from.z - to.z,
          ) - from.radius - to.radius,
        ).toBeGreaterThanOrEqual(-1e-9)
      }
    }
  })

  test("gives the complete recursive Torus chain one world center", () => {
    const scene = buildCenteredNestedVisualScene(manifest(), [])

    expect(scene.context.tori).toHaveLength(3)
    expect(scene.context.tori.map(({x, y, z}) => [x, y, z])).toEqual([
      [17, -9, 3],
      [17, -9, 3],
      [17, -9, 3],
    ])
    const outerRadii = scene.context.tori.map((torus) =>
      torus.radius + torus.tube
    )
    expect(outerRadii[0]).toBeGreaterThan(outerRadii[1]!)
    expect(outerRadii[1]).toBeGreaterThan(outerRadii[2]!)
    expect(scene.context.fields).toHaveLength(7)
  })
})
