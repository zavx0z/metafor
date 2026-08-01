import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {StateGraph} from "../src/StateGraph.ts"
import type {StateGraphRootLayout} from "../src/StateGraphLayout.ts"
import {
  buildOutsideInVisualScene,
} from "../src/OutsideIn.ts"
import {
  MAX_VISUAL_TOPOLOGY_DEPTH,
} from "../src/internal/dark-tree.ts"
import {
  packStateSleeves,
  placeStateLayout,
  prepareStateLayout,
  type StateSleevePackingEnvelope,
} from "../src/internal/state-sleeves.ts"

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested)
    Object.freeze(value)
  }
  return value
}

const manifest = (): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [
    {
      darkParticleId: 2,
      parentDarkParticleId: null,
      darkParticleKind: "atom",
      src: "owner/root",
      metaSrc: "owner/root",
      label: "Root",
      depth: 0,
      darkParticleOrder: 0,
    },
    {
      darkParticleId: 4,
      parentDarkParticleId: 2,
      darkParticleKind: "atom",
      src: "owner/child",
      metaSrc: "owner/child",
      label: "Child",
      depth: 1,
      darkParticleOrder: 0,
    },
  ],
  fieldParticles: [
    {
      fieldParticleId: "field/root/7",
      fieldId: 7,
      valueId: 7,
      parentDarkParticleId: 2,
      fieldKey: "ready",
      fieldLabel: "Ready",
      fieldParticleKind: "boolean",
      valueText: "true",
    },
    {
      fieldParticleId: "field/7",
      fieldId: 7,
      valueId: 7,
      parentDarkParticleId: 4,
      fieldKey: "ready",
      fieldLabel: "Ready",
      fieldParticleKind: "boolean",
      valueText: "true",
    },
  ],
  orbitalParticles: [
    {
      orbitalParticleId: "atom/1/sleeve/11/state/11/path/root",
      sourceId: 11,
      parentDarkParticleId: 2,
      orbitalParticleKind: "state",
      label: "Start",
      current: true,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 11,
      relatedStateIds: [11],
    },
    {
      orbitalParticleId: "atom/1/sleeve/11/state/12/path/1",
      sourceId: 12,
      parentDarkParticleId: 2,
      orbitalParticleKind: "state",
      label: "Done",
      current: false,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 11,
      relatedStateIds: [12],
    },
    {
      orbitalParticleId: "atom/1/sleeve/12/state/12/path/root",
      sourceId: 12,
      parentDarkParticleId: 2,
      orbitalParticleKind: "state",
      label: "Done",
      current: false,
      active: false,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 12,
      relatedStateIds: [12],
    },
    {
      orbitalParticleId: "atom/2/sleeve/13/state/13/path/root",
      sourceId: 13,
      parentDarkParticleId: 4,
      orbitalParticleKind: "state",
      label: "Child state",
      current: true,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 13,
      relatedStateIds: [13],
    },
  ],
  fieldProxies: [{
    fieldProxyId: "field-proxy/root/11/7",
    fieldParticleId: "field/root/7",
    fieldId: 7,
    parentDarkParticleId: 2,
    stateOrbitalParticleId:
      "atom/1/sleeve/11/state/11/path/root",
  }],
})

const layout = (): StateGraphRootLayout => ({
  rootStateId: 11,
  levels: [
    {step: 0, x: 0, nodeIds: ["state/11"]},
    {step: 1, x: 22, nodeIds: ["state/12"]},
  ],
  nodes: [
    {
      id: "state/11",
      stateId: 11,
      label: "Start",
      step: 0,
      x: 0,
      y: 0,
      z: 0,
      radius: 3.2,
      color: [0, 1, 1],
      current: true,
      end: null,
      fieldRadius: 0.32,
      fields: [{
        id: 7,
        key: "ready",
        label: "Ready",
        type: "boolean",
      }],
      innerRadius: 0.35584,
    },
    {
      id: "state/12",
      stateId: 12,
      label: "Done",
      step: 1,
      x: 22,
      y: 0,
      z: 0,
      radius: 3.2,
      color: [1, 0.4, 0],
      current: false,
      end: "terminal",
      fieldRadius: 0.32,
      fields: [],
      innerRadius: 0.35584,
    },
  ],
  edges: [{
    id: "edge/1",
    transitionId: 1,
    fromNodeId: "state/11",
    toNodeId: "state/12",
    returning: false,
    conditionCount: 1,
    conditionFieldIds: [7],
  }],
})

const rootGraph = (): StateGraph => ({
  atomId: 1,
  atomLabel: "Root",
  currentStateId: 11,
  fields: [{
    id: 7,
    key: "ready",
    label: "Ready",
    type: "boolean",
  }],
  reachableStateIds: [11, 12],
  sleeves: [
    {
      end: {kind: "terminal"},
      id: "atom/1/root/11/path/1",
      rootStateId: 11,
      stateIds: [11, 12],
      transitionIds: [1],
    },
    {
      end: {kind: "terminal"},
      id: "atom/1/root/12/state/12",
      rootStateId: 12,
      stateIds: [12],
      transitionIds: [],
    },
  ],
  src: "owner/root",
  states: [
    {current: true, id: 11, name: "Start", position: 0},
    {current: false, id: 12, name: "Done", position: 1},
  ],
  transitions: [{
    conditions: [{fieldId: 7, id: 1, predicate: true}],
    fromStateId: 11,
    id: 1,
    position: 0,
    toStateId: 12,
  }],
})

const childGraph = (): StateGraph => ({
  atomId: 2,
  atomLabel: "Child",
  currentStateId: 13,
  fields: [],
  reachableStateIds: [13],
  sleeves: [{
    end: {kind: "terminal"},
    id: "atom/2/root/13/state/13",
    rootStateId: 13,
    stateIds: [13],
    transitionIds: [],
  }],
  src: "owner/child",
  states: [{current: true, id: 13, name: "Child state", position: 0}],
  transitions: [],
})

const owners = () => [
  {graph: rootGraph(), ownerDarkParticleId: 2},
  {graph: childGraph(), ownerDarkParticleId: 4},
]

const allStateNodes = (
  scene: ReturnType<typeof buildOutsideInVisualScene>,
) => scene.stateSleeves.flatMap((sleeve) => sleeve.layout.nodes)

describe("outside-in Visual layout", () => {
  test("packs unequal State sleeves with a direct linear sector formula", () => {
    const gap = 3.75
    const phase = 0.37
    const tangentExtents = [
      86.168,
      59.015,
      59.015,
      58.217,
      58.217,
      60.331,
      25,
    ]
    const sleeves: readonly StateSleevePackingEnvelope[] = tangentExtents.map(
      (tangentExtent, index) => ({
        disks: [
          {radius: 25, x: 0, y: 0},
          {
            radius: 25,
            x: 100 + index * 8,
            y: tangentExtent - 25,
          },
        ],
        inwardExtent: 25,
      }),
    )
    const packing = packStateSleeves(sleeves, 0, gap, phase)
    const formerMaximumSlotOrbit =
      (Math.max(...tangentExtents) + gap * 0.5) /
      Math.sin(Math.PI / sleeves.length)

    expect(packing.angles).toHaveLength(sleeves.length)
    expect(packing.halfAngles).toHaveLength(sleeves.length)
    expect(packing.angles[0]).toBe(phase)
    expect(packing.orbitRadius).toBeLessThan(formerMaximumSlotOrbit)
    for (let index = 0; index < sleeves.length; index += 1) {
      const next = (index + 1) % sleeves.length
      const nextAngle = next === 0
        ? packing.angles[0]! + Math.PI * 2
        : packing.angles[next]!
      expect(nextAngle - packing.angles[index]!).toBeCloseTo(
        packing.halfAngles[index]! + packing.halfAngles[next]!,
      )
      for (const disk of sleeves[index]!.disks) {
        const inflatedRadius = disk.radius + gap * 0.5
        const centerX = packing.orbitRadius + disk.x
        const centerDistance = Math.hypot(centerX, disk.y)
        const actualHalfAngle =
          Math.abs(Math.atan2(disk.y, centerX)) +
          Math.asin(inflatedRadius / centerDistance)
        expect(actualHalfAngle)
          .toBeLessThanOrEqual(packing.halfAngles[index]! + 1e-12)
      }
    }

    const changed = sleeves.map((sleeve, index) =>
      index === 0
        ? {
          disks: sleeve.disks.map((disk, diskIndex) =>
            diskIndex === 0
              ? {...disk, radius: disk.radius + 12}
              : disk
          ),
          inwardExtent: sleeve.inwardExtent + 12,
        }
        : sleeve
    )
    const rebuilt = packStateSleeves(changed, 0, gap, phase)
    expect(rebuilt).not.toEqual(packing)
    expect(packStateSleeves(changed, 0, gap, phase)).toEqual(rebuilt)
  })

  test("packs Field, Matter and State into consecutive static Atom layers", () => {
    const scene = buildOutsideInVisualScene({
      manifest: manifest(),
      owners: owners(),
    })
    const nodes = allStateNodes(scene)

    expect(scene.tori).toHaveLength(2)
    const rootTorus = scene.tori[0]!
    const childTorus = scene.tori[1]!
    const rootInnerRadius = rootTorus.radius - rootTorus.tube
    const rootOuterRadius = rootTorus.radius + rootTorus.tube
    const childOuterRadius = childTorus.radius + childTorus.tube
    const childDistance = Math.hypot(childTorus.x, childTorus.y)

    expect(rootInnerRadius).toBeCloseTo(19.25)
    expect(rootOuterRadius).toBeGreaterThanOrEqual(50)
    expect(childDistance - childOuterRadius)
      .toBeGreaterThanOrEqual(rootInnerRadius)
    expect(scene.fields.find((field) =>
      field.ownerDarkParticleId === 4
    )).toMatchObject({
      fieldParticleIds: ["field/7"],
      ownerDarkParticleId: 4,
      x: childTorus.x,
      y: childTorus.y,
      radius: 5.5,
    })
    expect(nodes.slice(0, 3).map((node) => node.fieldRadius))
      .toEqual([5.5, 5.5, 5.5])
    expect(nodes[0]!.fields[0]?.id).toBe(7)
    expect(new Set(nodes.map((node) =>
      node.stateId
    ))).toEqual(new Set([11, 12, 13]))
    expect(new Set(scene.stateSleeves.map((sleeve) =>
      sleeve.ownerAtomId
    ))).toEqual(new Set([1, 2]))
    expect(scene.orbitals).toHaveLength(4)
    expect(scene.fieldProxies).toHaveLength(1)
    expect(scene.components.roots.every((root) =>
      root.sleeves.every((sleeve) =>
        sleeve.occurrences.every((occurrence) =>
          occurrence.state !== null
        )
      )
    )).toBe(true)
    const rootNodes = scene.stateSleeves
      .filter((sleeve) => sleeve.ownerDarkParticleId === 2)
      .flatMap((sleeve) => sleeve.layout.nodes)
    const rootStateInnerEdge = Math.min(
      ...rootNodes.map((node) =>
        Math.hypot(node.x, node.y) - node.radius
      ),
    )
    expect(rootStateInnerEdge)
      .toBeGreaterThan(childDistance + childOuterRadius)
    expect(Math.hypot(
      rootNodes[0]!.x,
      rootNodes[0]!.y,
    )).toBeCloseTo(Math.hypot(
      rootNodes[2]!.x,
      rootNodes[2]!.y,
    ))
    const childState = scene.stateSleeves.find(
      (sleeve) => sleeve.ownerDarkParticleId === 4,
    )!.layout.nodes[0]!
    expect(childState.radius).toBeCloseTo(12.5)
    expect(childState.fieldRadius).toBeCloseTo(2.75)
    expect(Math.hypot(
      childState.x - childTorus.x,
      childState.y - childTorus.y,
    ) - childState.radius)
      .toBeGreaterThanOrEqual(childTorus.radius - childTorus.tube)
  })

  test("moves each complete State sleeve without repacking it", () => {
    const source = layout()
    const stretched: StateGraphRootLayout = {
      ...source,
      levels: source.levels.map((level) =>
        level.step === 1 ? {...level, x: 220} : level
      ),
      nodes: source.nodes.map((node) =>
        node.step === 1 ? {...node, x: 220} : node
      ),
    }
    const prepared = prepareStateLayout(stretched)!
    const placed = placeStateLayout({
      angle: 0.37,
      orbitRadius: 100,
      prepared,
    }, {
      scale: 1,
      x: 0,
      y: 0,
      z: 0,
    })

    expect(placed.nodes[0]!.radius).toBeCloseTo(
      stretched.nodes[0]!.radius,
    )
    expect(placed.nodes[1]!.radius).toBeCloseTo(
      stretched.nodes[1]!.radius,
    )
    expect(Math.hypot(
      placed.nodes[1]!.x - placed.nodes[0]!.x,
      placed.nodes[1]!.y - placed.nodes[0]!.y,
    )).toBeCloseTo(220)
  })

  test("does not reserve a Matter band when the Atom has no child Torus", () => {
    const source = manifest()
    const field = {
      ...source.fieldParticles[0]!,
      parentDarkParticleId: 2,
    }
    const leafManifest: BulkManifest = {
      ...source,
      darkParticles: [source.darkParticles[0]!],
      fieldParticles: [field],
      orbitalParticles: (source.orbitalParticles ?? []).filter((particle) =>
        particle.parentDarkParticleId === 2
      ),
    }
    const scene = buildOutsideInVisualScene({
      manifest: leafManifest,
      owners: [{graph: rootGraph(), ownerDarkParticleId: 2}],
    })
    const torus = scene.tori[0]!
    const innerRadius = torus.radius - torus.tube
    const outerRadius = torus.radius + torus.tube
    const fieldExtent = 11
    const stateInnerEdge = Math.min(...allStateNodes(scene).map((node) =>
      Math.hypot(node.x, node.y) - node.radius
    ))

    expect(scene.fields[0]!.radius).toBe(fieldExtent)
    expect(innerRadius).toBeCloseTo(fieldExtent + 8.25)
    expect(stateInnerEdge - innerRadius).toBeCloseTo(8.25)
    expect(outerRadius).toBeGreaterThanOrEqual(50)
  })

  test("uses the same Torus composition for Atom, Fuzzy, MACHO and Axion", () => {
    const source = manifest()
    source.orbitalParticles = []
    source.fieldProxies = []
    const child = source.darkParticles[1]!
    source.darkParticles.push(
      {
        ...child,
        darkParticleId: 6,
        darkParticleKind: "fuzzy",
        src: null,
        metaSrc: null,
        label: "Fuzzy",
        darkParticleOrder: 1,
      },
      {
        ...child,
        darkParticleId: 8,
        darkParticleKind: "macho",
        src: null,
        metaSrc: null,
        label: "MACHO",
        darkParticleOrder: 2,
      },
      {
        ...child,
        darkParticleId: 10,
        darkParticleKind: "axion",
        src: null,
        metaSrc: null,
        label: "Axion",
        darkParticleOrder: 3,
      },
    )

    const scene = buildOutsideInVisualScene({
      manifest: source,
      owners: [],
    })

    expect(scene.tori).toHaveLength(5)
  })

  test("reuses the Fields analysis pseudo-circle inside the owning Torus", () => {
    const source = manifest()
    const root = source.darkParticles[0]!
    const field = source.fieldParticles[0]!
    const fields = Array.from({length: 4}, (_, index) => ({
      ...field,
      fieldParticleId: `field/${index}`,
      fieldId: index,
      parentDarkParticleId: root.darkParticleId,
      localX: 100 + index,
      localY: 200 + index,
      localZ: 300 + index,
    }))
    const scene = buildOutsideInVisualScene({
      manifest: {
        ...source,
        darkParticles: [root],
        fieldParticles: fields,
        orbitalParticles: [],
        fieldProxies: [],
      },
      owners: [],
    })
    const centers = scene.fields

    expect(centers).toHaveLength(4)
    for (const center of centers) {
      expect(center.z).toBe(0)
    }
    let minimumDistance = Number.POSITIVE_INFINITY
    for (let left = 0; left < centers.length; left += 1) {
      for (let right = left + 1; right < centers.length; right += 1) {
        const from = centers[left]!
        const to = centers[right]!
        minimumDistance = Math.min(
          minimumDistance,
          Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z),
        )
      }
    }
    expect(centers.map((center) => center.radius)).toEqual([11, 11, 11, 11])
    expect(minimumDistance).toBeCloseTo(22)
  })

  test("starts an actually empty root from the approved 100 mm Torus", () => {
    const source = manifest()
    const root = source.darkParticles[0]!
    const scene = buildOutsideInVisualScene({
      manifest: {
        ...source,
        darkParticles: [root],
        fieldParticles: [],
        orbitalParticles: [],
        fieldProxies: [],
      },
      owners: [],
    })
    const torus = scene.tori[0]!

    expect(torus.radius).toBeCloseTo(27.78)
    expect(torus.tube).toBeCloseTo(22.22)
    expect(torus.radius - torus.tube).toBeCloseTo(5.56)
    expect(torus.radius + torus.tube).toBeCloseTo(50)
  })

  test("binds each State graph to one exact manifest owner", () => {
    const source = manifest()
    const valid = {graph: rootGraph(), ownerDarkParticleId: 2}

    expect(() => buildOutsideInVisualScene({
      manifest: source,
      owners: [valid, valid],
    })).toThrow("Visual owner 2 is duplicated")
    expect(() => buildOutsideInVisualScene({
      manifest: source,
      owners: [{graph: rootGraph(), ownerDarkParticleId: 99}],
    })).toThrow("Visual owner 99 is absent from manifest")
    expect(() => buildOutsideInVisualScene({
      manifest: source,
      owners: [{
        graph: {...rootGraph(), src: "another/owner"},
        ownerDarkParticleId: 2,
      }],
    })).toThrow("Visual owner 2 source does not match graph")
    expect(() => buildOutsideInVisualScene({
      manifest: source,
      owners: [valid],
    })).toThrow("Visual State owner 4 is missing a graph binding")

    const repeatedSrc: BulkManifest = {
      ...source,
      darkParticles: source.darkParticles.map((particle) => ({
        ...particle,
        src: "owner/root",
      })),
    }
    expect(() => buildOutsideInVisualScene({
      manifest: repeatedSrc,
      owners: [
        {
          graph: {...rootGraph(), atomId: 2},
          ownerDarkParticleId: 2,
        },
        {
          graph: rootGraph(),
          ownerDarkParticleId: 4,
        },
      ],
    })).toThrow("Visual owner 2 does not match Atom 2")

    expect(() => buildOutsideInVisualScene({
      manifest: {...source, orbitalParticles: []},
      owners: [valid],
    })).toThrow("Visual owner 2 State identities do not match graph")

    expect(() => buildOutsideInVisualScene({
      manifest: {
        ...source,
        orbitalParticles: (source.orbitalParticles ?? []).map((particle) =>
          particle.parentDarkParticleId === 2
            ? {...particle, current: true}
            : particle
        ),
      },
      owners: [valid],
    })).toThrow("Visual owner 2 has multiple current manifested States")

    expect(() => buildOutsideInVisualScene({
      manifest: source,
      owners: [{
        graph: {...rootGraph(), currentStateId: null},
        ownerDarkParticleId: 2,
      }],
    })).toThrow("Visual owner 2 has inconsistent graph current State")
  })

  test("rejects unbounded or cyclic topology before recursive composition", () => {
    const source = manifest()
    const prototype = source.darkParticles[0]!
    const chain = Array.from(
      {length: MAX_VISUAL_TOPOLOGY_DEPTH + 1},
      (_, index) => ({
        ...prototype,
        darkParticleId: index + 1,
        parentDarkParticleId: index === 0 ? null : index,
        depth: index,
      }),
    )

    expect(() => buildOutsideInVisualScene({
      manifest: {
        ...source,
        darkParticles: chain,
        fieldParticles: [],
        orbitalParticles: [],
      },
      owners: [],
    })).toThrow(RangeError)
    expect(() => buildOutsideInVisualScene({
      manifest: {
        ...source,
        darkParticles: [
          {...prototype, darkParticleId: 1, parentDarkParticleId: 2},
          {...prototype, darkParticleId: 2, parentDarkParticleId: 1},
        ],
        fieldParticles: [],
        orbitalParticles: [],
      },
      owners: [],
    })).toThrow("Visual topology contains a cycle")
    expect(() => buildOutsideInVisualScene({
      manifest: {
        ...source,
        darkParticles: [{
          ...prototype,
          darkParticleId: 1,
          parentDarkParticleId: 99,
        }],
        fieldParticles: [],
        orbitalParticles: [],
      },
      owners: [],
    })).toThrow("Visual topology parent 99 is absent for 1")
  })

  test("does not mutate the source and returns a deeply frozen scene", () => {
    const source = manifest()
    source.darkParticles.reverse()
    const before = structuredClone(source)
    deepFreeze(source)
    const frozenOwners = deepFreeze(owners())

    const scene = buildOutsideInVisualScene({
      manifest: source,
      owners: frozenOwners,
    })

    expect(source).toEqual(before)
    expect(Object.isFrozen(scene)).toBe(true)
    expect(Object.isFrozen(scene.tori)).toBe(true)
    expect(Object.isFrozen(scene.fields[0])).toBe(true)
    expect(Object.isFrozen(scene.stateSleeves[0]?.layout.nodes)).toBe(true)
    expect(scene.tori.map((torus) => torus.darkParticleId)).toEqual([2, 4])
  })
})
