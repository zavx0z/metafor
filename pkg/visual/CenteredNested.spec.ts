import {describe, expect, test} from "bun:test"
import type {
  BulkDarkParticle,
  BulkFieldParticle,
  BulkManifest,
  BulkOrbitalParticle,
} from "@metafor/types/bulk/manifest"
import {
  buildCenteredNestedVisualScene,
  layoutCenteredNestedFields,
} from "./CenteredNested.ts"
import type {StateGraph} from "./StateGraph.ts"

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested)
    Object.freeze(value)
  }
  return value
}

const darkParticle = (
  ownerAtomId: number,
  parentOwnerAtomId: number | null,
  depth: number,
): BulkDarkParticle => ({
  darkParticleId: ownerAtomId * 2,
  parentDarkParticleId: parentOwnerAtomId === null
    ? null
    : parentOwnerAtomId * 2,
  darkParticleKind: "atom",
  src: `owner/${ownerAtomId}`,
  metaSrc: `owner/${ownerAtomId}`,
  label: `Atom ${ownerAtomId}`,
  depth,
  darkParticleOrder: 0,
})

const field = (
  fieldParticleId: string,
  fieldId: number,
  valueId: number,
  parentOwnerAtomId: number,
  valueText: string,
): BulkFieldParticle => ({
  fieldParticleId,
  fieldId,
  valueId,
  parentDarkParticleId: parentOwnerAtomId * 2,
  fieldKey: fieldParticleId,
  fieldLabel: fieldParticleId,
  fieldParticleKind: "string",
  valueText,
})

const stateParticle = (
  sourceId: number,
  current: boolean,
  sleeveRootStateId: number = sourceId,
  transitionPath: string = "root",
  active: boolean = current,
): BulkOrbitalParticle => ({
  active,
  anchorStateOrbitalParticleId: null,
  current,
  label: `State ${sourceId}`,
  orbitalParticleId:
    `atom/1/sleeve/${sleeveRootStateId}/state/${sourceId}` +
    `/path/${transitionPath}`,
  orbitalParticleKind: "state",
  parentDarkParticleId: 2,
  relatedStateIds: [sourceId],
  sleeveRootStateId,
  sourceId,
})

const manifest = (branching = false): BulkManifest => ({
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
  orbitalParticles: branching
    ? [
      stateParticle(100, true),
      stateParticle(101, false, 100, "1", true),
      stateParticle(101, false),
      stateParticle(200, false),
    ]
    : [stateParticle(100, true)],
})

const stateGraph = (branching = false): StateGraph => ({
  atomId: 1,
  atomLabel: "Atom 1",
  currentStateId: 100,
  fields: [],
  reachableStateIds: branching ? [100, 101] : [100],
  sleeves: branching
    ? [
      {
        end: {kind: "terminal"},
        id: "atom/1/root/100/path/1",
        rootStateId: 100,
        stateIds: [100, 101],
        transitionIds: [1],
      },
      {
        end: {kind: "terminal"},
        id: "atom/1/root/101/state/101",
        rootStateId: 101,
        stateIds: [101],
        transitionIds: [],
      },
      {
        end: {kind: "terminal"},
        id: "atom/1/root/200/state/200",
        rootStateId: 200,
        stateIds: [200],
        transitionIds: [],
      },
    ]
    : [{
      end: {kind: "terminal"},
      id: "atom/1/root/100/state/100",
      rootStateId: 100,
      stateIds: [100],
      transitionIds: [],
    }],
  src: "owner/1",
  states: branching
    ? [
      {current: true, id: 100, name: "First root", position: 0},
      {current: false, id: 101, name: "First next", position: 1},
      {current: false, id: 200, name: "Second root", position: 2},
    ]
    : [{current: true, id: 100, name: "Root state", position: 0}],
  transitions: branching
    ? [{
      conditions: [],
      fromStateId: 100,
      id: 1,
      position: 0,
      toStateId: 101,
    }]
    : [],
})

const owner = (branching = false) => ({
  graph: stateGraph(branching),
  ownerDarkParticleId: 2,
})

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
      affinityOwnerDarkParticleId: 2,
      band: 0,
      bandKind: "root-private",
      deepestOwnerDepth: 0,
      fieldParticleIds: ["root-private"],
      orbitIndex: 0,
      ownerDarkParticleIds: [2],
      ownerDarkParticleId: 2,
      radius: 11,
    })
    expect(byId.get("root-shared")).toMatchObject({
      affinityOwnerDarkParticleId: 4,
      band: 1,
      bandKind: "shared",
      deepestOwnerDepth: 1,
      fieldIds: [2, 3],
      fieldKeys: ["root-shared", "child-shared-up"],
      fieldParticleIds: ["root-shared", "child-shared-up"],
      orbitIndex: 0,
      ownerDarkParticleIds: [2, 4],
      ownerDarkParticleId: 2,
      radius: 11,
    })
    expect(byId.get("child-shared-up")).toBe(byId.get("root-shared"))
    expect(byId.get("child-private")).toMatchObject({
      affinityOwnerDarkParticleId: 4,
      band: 2,
      bandKind: "inner-private",
      deepestOwnerDepth: 1,
      fieldParticleIds: ["child-private"],
      orbitIndex: 1,
      ownerDarkParticleIds: [4],
      ownerDarkParticleId: 4,
      radius: 5.5,
    })
    expect(byId.get("child-shared-down")).toMatchObject({
      affinityOwnerDarkParticleId: 6,
      band: 3,
      bandKind: "shared",
      deepestOwnerDepth: 2,
      fieldParticleIds: [
        "child-shared-down",
        "grandchild-shared",
      ],
      orbitIndex: 2,
      ownerDarkParticleIds: [4, 6],
      ownerDarkParticleId: 4,
      radius: 5.5,
    })
    expect(byId.get("grandchild-shared"))
      .toBe(byId.get("child-shared-down"))
    expect(byId.get("grandchild-private")).toMatchObject({
      affinityOwnerDarkParticleId: 6,
      band: 4,
      bandKind: "inner-private",
      deepestOwnerDepth: 2,
      fieldParticleIds: ["grandchild-private"],
      orbitIndex: 3,
      ownerDarkParticleIds: [6],
      ownerDarkParticleId: 6,
      radius: 2.75,
    })

    expect(byId.get("root-private")?.valueText)
      .toBe(byId.get("child-private")?.valueText)
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
      affinityOwnerDarkParticleId: 6,
      band: 1,
      bandKind: "shared",
      deepestOwnerDepth: 2,
      fieldParticleIds: [
        "left-branch-shared",
        "right-branch-shared",
      ],
      orbitIndex: 0,
      ownerDarkParticleIds: [8, 6],
      ownerDarkParticleId: 2,
      radius: 11,
    })
    expect(placements.filter((placement) =>
      placement.fieldParticleIds.some((fieldParticleId) =>
        fieldParticleId.endsWith("branch-shared")
      )
    )).toHaveLength(1)
  })

  test("keeps nested private Fields in their owning Torus core", () => {
    const placements = layoutCenteredNestedFields(manifest())
    const center = placements.filter((placement) =>
      placement.bandKind === "root-private"
    )
    const rootShared = placements.filter((placement) =>
      placement.bandKind === "shared" &&
      placement.ownerDarkParticleId === 2
    )
    const childOwned = placements.filter((placement) =>
      placement.ownerDarkParticleId === 4
    )
    const grandchildPrivate = placements.filter((placement) =>
      placement.ownerDarkParticleId === 6
    )
    const radialInner = (
      placement: (typeof placements)[number],
    ): number =>
      Math.hypot(
        placement.x,
        placement.y,
        placement.z,
      ) - placement.radius
    const radialOuter = (
      placement: (typeof placements)[number],
    ): number =>
      Math.hypot(
        placement.x,
        placement.y,
        placement.z,
      ) + placement.radius

    expect(Math.min(...rootShared.map(radialInner)) -
      Math.max(...center.map(radialOuter))).toBeCloseTo(22)
    expect(Math.min(...childOwned.map(radialInner)))
      .toBeGreaterThan(Math.max(...rootShared.map(radialOuter)))
    expect(Math.min(...grandchildPrivate.map(radialInner)))
      .toBeGreaterThan(Math.max(...childOwned.map(radialOuter)))
    expect(childOwned.map((placement) => placement.bandKind))
      .toEqual(["inner-private", "shared"])
    expect(childOwned.map((placement) =>
      placement.ownerDarkParticleId
    )).toEqual([4, 4])

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
    const scene = buildCenteredNestedVisualScene({
      manifest: manifest(),
      owners: [owner()],
    })

    expect(scene.tori).toHaveLength(3)
    expect(scene.tori.map(({x, y, z}) => [x, y, z])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ])
    expect(scene.tori.map((torus) => torus.darkParticleId))
      .toEqual([2, 4, 6])
    const outerRadii = scene.tori.map((torus) =>
      torus.radius + torus.tube
    )
    const innerRadii = scene.tori.map((torus) =>
      torus.radius - torus.tube
    )
    expect(outerRadii[0]).toBeGreaterThan(outerRadii[1]!)
    expect(outerRadii[1]).toBeGreaterThan(outerRadii[2]!)
    expect(innerRadii[0]).toBeGreaterThan(0)
    expect(innerRadii[0]).toBeLessThan(innerRadii[1]!)
    expect(innerRadii[1]).toBeLessThan(innerRadii[2]!)
    const fieldPlacements = layoutCenteredNestedFields(manifest())
    const ownedOuterExtent = (ownerDarkParticleId: number): number =>
      Math.max(
        ...fieldPlacements
          .filter((placement) =>
            placement.ownerDarkParticleId === ownerDarkParticleId
          )
          .map((placement) =>
            Math.hypot(
              placement.x,
              placement.y,
              placement.z,
            ) + placement.radius
          ),
      )
    const rootOwnedOuterExtent = Math.max(
      ...fieldPlacements
        .filter((placement) => placement.ownerDarkParticleId === 2)
        .map((placement) =>
          Math.hypot(
            placement.x,
            placement.y,
            placement.z,
          ) + placement.radius
        ),
    )
    expect(innerRadii[0]! - rootOwnedOuterExtent).toBeCloseTo(8.25)
    expect(innerRadii[1]! - ownedOuterExtent(4)).toBeCloseTo(4.125)
    expect(innerRadii[2]! - ownedOuterExtent(6)).toBeCloseTo(2.0625)
    const rootStateNodes = scene.stateSleeves[0]!.layout.nodes
    const rootStateInnerExtent = Math.min(...rootStateNodes.map((node) =>
      Math.hypot(node.x, node.y, node.z) - node.radius
    ))
    const rootStateOuterExtent = Math.max(...rootStateNodes.map((node) =>
      Math.hypot(node.x, node.y, node.z) + node.radius
    ))
    expect(rootStateInnerExtent - outerRadii[1]!).toBeCloseTo(8.25)
    expect(outerRadii[0]! - rootStateOuterExtent).toBeCloseTo(8.25)
    expect(scene.fields).toHaveLength(5)
  })

  test("places complete State sleeves on one owner orbit without repacking", () => {
    const scene = buildCenteredNestedVisualScene({
      manifest: manifest(true),
      owners: [owner(true)],
    })
    const center = {x: 0, y: 0, z: 0}
    const firstSleeve = scene.stateSleeves.find(
      (sleeve) => sleeve.rootStateId === 100,
    )!
    const secondSleeve = scene.stateSleeves.find(
      (sleeve) => sleeve.rootStateId === 200,
    )!
    const [firstRoot, firstNext] = firstSleeve.layout.nodes
    const [secondRoot] = secondSleeve.layout.nodes

    expect(Math.hypot(
      firstNext!.x - firstRoot!.x,
      firstNext!.y - firstRoot!.y,
      firstNext!.z - firstRoot!.z,
    )).toBeCloseTo(72)
    expect([firstRoot!.radius, firstNext!.radius, secondRoot!.radius])
      .toEqual([25, 25, 25])
    expect(Math.hypot(
      firstRoot!.x - center.x,
      firstRoot!.y - center.y,
    )).toBeCloseTo(Math.hypot(
      secondRoot!.x - center.x,
      secondRoot!.y - center.y,
    ))
    const childOuterRadius =
      scene.tori[1]!.radius + scene.tori[1]!.tube
    expect(Math.hypot(
      firstRoot!.x - center.x,
      firstRoot!.y - center.y,
    ) - firstRoot!.radius).toBeGreaterThan(childOuterRadius)
  })

  test("returns immutable identity-rich geometry detached from the source", () => {
    const source = manifest()
    const sourceField = source.fieldParticles[0]!
    const frozenOwner = deepFreeze(owner())
    deepFreeze(source)
    const scene = buildCenteredNestedVisualScene({
      manifest: source,
      owners: [frozenOwner],
    })
    const shared = scene.fields.find((field) =>
      field.fieldParticleIds.includes("root-shared")
    )

    expect(scene.layoutSlug).toBe("centered-nested")
    expect(scene.fields[0]).toMatchObject({
      fieldParticleIds: ["root-private"],
      ownerDarkParticleId: 2,
      sourceOwnerDarkParticleIds: [2],
      valueId: 101,
    })
    expect(scene.fields[0]).not.toHaveProperty("field")
    expect(scene.stateSleeves[0]?.ownerAtomId).toBe(1)
    expect(shared).toMatchObject({
      fieldIds: [2, 3],
      fieldKeys: ["root-shared", "child-shared-up"],
      sourceOwnerDarkParticleIds: [2, 4],
    })
    expect(Object.isFrozen(scene)).toBe(true)
    expect(Object.isFrozen(scene.fields[0]?.fieldParticleIds)).toBe(true)
    expect(Object.isFrozen(scene.stateSleeves[0]?.layout.nodes[0])).toBe(true)
    expect(sourceField.fieldParticleId).toBe("root-private")
  })

  test("rejects a complete scene when a manifested State owner is unbound", () => {
    const source: BulkManifest = {
      ...manifest(),
      orbitalParticles: [{
        active: true,
        anchorStateOrbitalParticleId: null,
        current: true,
        label: "Root state",
        orbitalParticleId: "atom/1/sleeve/100/state/100/path/root",
        orbitalParticleKind: "state",
        parentDarkParticleId: 2,
        relatedStateIds: [100],
        sleeveRootStateId: 100,
        sourceId: 100,
      }],
    }

    expect(() => buildCenteredNestedVisualScene({
      manifest: source,
      owners: [],
    })).toThrow("Visual State owner 2 is missing a graph binding")
  })
})
