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
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"

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
    const byId = new Map(placements.flatMap((placement) =>
      placement.fieldParticleIds.map((fieldParticleId) => [
        fieldParticleId,
        placement,
      ] as const)
    ))

    expect(placements).toHaveLength(5)
    expect(byId.get("root-private")).toMatchObject({
      band: 0,
      bandKind: "root-private",
      fieldParticleIds: ["root-private"],
      orbitIndex: 0,
      ownerDarkParticleId: 1,
      radius: 11,
    })
    expect(byId.get("root-shared")).toMatchObject({
      band: 1,
      bandKind: "shared",
      fieldParticleIds: ["root-shared", "child-shared-up"],
      orbitIndex: 0,
      ownerDarkParticleId: 1,
      radius: 11,
    })
    expect(byId.get("child-shared-up")).toBe(byId.get("root-shared"))
    expect(byId.get("child-private")).toMatchObject({
      band: 2,
      bandKind: "inner-private",
      fieldParticleIds: ["child-private"],
      orbitIndex: 0,
      ownerDarkParticleId: 2,
      radius: 5.5,
    })
    expect(byId.get("child-shared-down")).toMatchObject({
      band: 3,
      bandKind: "shared",
      fieldParticleIds: [
        "child-shared-down",
        "grandchild-shared",
      ],
      orbitIndex: 0,
      ownerDarkParticleId: 2,
      radius: 5.5,
    })
    expect(byId.get("grandchild-shared"))
      .toBe(byId.get("child-shared-down"))
    expect(byId.get("grandchild-private")).toMatchObject({
      band: 4,
      bandKind: "inner-private",
      fieldParticleIds: ["grandchild-private"],
      orbitIndex: 0,
      ownerDarkParticleId: 3,
      radius: 2.75,
    })

    expect(byId.get("root-private")?.field.valueText)
      .toBe(byId.get("child-private")?.field.valueText)
    expect(byId.get("root-private")?.band)
      .not.toBe(byId.get("child-private")?.band)
  })

  test("places a cross-branch shared Value at its highest common owner", () => {
    const source = manifest()
    const placements = layoutCenteredNestedFields({
      ...source,
      darkParticles: [
        ...source.darkParticles,
        darkParticle(4, 1, 1),
      ],
      fieldParticles: [
        ...source.fieldParticles,
        field("left-branch-shared", 8, 106, 3, "shared"),
        field("right-branch-shared", 9, 106, 4, "shared"),
      ],
    })
    const shared = placements.find((placement) =>
      placement.fieldParticleIds.includes("left-branch-shared")
    )

    expect(shared).toMatchObject({
      band: 1,
      bandKind: "shared",
      fieldParticleIds: [
        "left-branch-shared",
        "right-branch-shared",
      ],
      orbitIndex: 0,
      ownerDarkParticleId: 1,
      radius: 11,
    })
    expect(placements.filter((placement) =>
      placement.fieldParticleIds.some((fieldParticleId) =>
        fieldParticleId.endsWith("branch-shared")
      )
    )).toHaveLength(1)
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
    const rootStateLayout = {
      edges: [],
      levels: [{nodeIds: ["root-state"], step: 0, x: 0}],
      nodes: [{
        color: [0.2, 0.7, 0.9],
        current: true,
        end: "terminal",
        fieldRadius: 1,
        fields: [],
        id: "root-state",
        innerRadius: 1,
        label: "Root state",
        radius: 3,
        stateId: 100,
        step: 0,
        x: 0,
        y: 0,
        z: 0,
      }],
      rootStateId: 100,
    } satisfies StateGraphRootLayout
    const scene = buildCenteredNestedVisualScene(manifest(), [{
      atomSrc: "owner/1",
      layouts: [rootStateLayout],
    }])

    expect(scene.context.tori).toHaveLength(3)
    expect(scene.context.tori.map(({x, y, z}) => [x, y, z])).toEqual([
      [17, -9, 3],
      [17, -9, 3],
      [17, -9, 3],
    ])
    const outerRadii = scene.context.tori.map((torus) =>
      torus.radius + torus.tube
    )
    const innerRadii = scene.context.tori.map((torus) =>
      torus.radius - torus.tube
    )
    expect(outerRadii[0]).toBeGreaterThan(outerRadii[1]!)
    expect(outerRadii[1]).toBeGreaterThan(outerRadii[2]!)
    expect(innerRadii[0]).toBeGreaterThan(0)
    expect(innerRadii[0]).toBeLessThan(innerRadii[1]!)
    expect(innerRadii[1]).toBeLessThan(innerRadii[2]!)
    const rootOwnedOuterExtent = Math.max(
      ...layoutCenteredNestedFields(manifest())
        .filter((placement) => placement.ownerDarkParticleId === 1)
        .map((placement) =>
          Math.hypot(
            placement.x - 17,
            placement.y + 9,
            placement.z - 3,
          ) + placement.radius
        ),
    )
    expect(innerRadii[0]! - rootOwnedOuterExtent).toBeCloseTo(8.25)
    const rootStateInnerExtent = Math.min(...scene.layout.nodes.map((node) =>
      Math.hypot(node.x - 17, node.y + 9, node.z - 3) - node.radius
    ))
    const rootStateOuterExtent = Math.max(...scene.layout.nodes.map((node) =>
      Math.hypot(node.x - 17, node.y + 9, node.z - 3) + node.radius
    ))
    expect(rootStateInnerExtent - outerRadii[1]!).toBeCloseTo(8.25)
    expect(outerRadii[0]! - rootStateOuterExtent).toBeCloseTo(8.25)
    expect(scene.context.fields).toHaveLength(5)
  })
})
