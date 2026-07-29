import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"
import {
  buildOutsideInVisualScene,
  packStateSleeves,
  type StateSleevePackingEnvelope,
} from "./OutsideIn.ts"

const manifest = (): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [
    {
      darkParticleId: 1,
      parentDarkParticleId: null,
      darkParticleKind: "atom",
      src: "owner/root",
      metaSrc: "owner/root",
      label: "Root",
      depth: 0,
      darkParticleOrder: 0,
      localX: 0,
      localY: 0,
      localZ: 0,
      torusScale: 1,
      torusRadius: 30,
      torusTube: 12,
      colorR: 0.2,
      colorG: 0.8,
      colorB: 1,
    },
    {
      darkParticleId: 2,
      parentDarkParticleId: 1,
      darkParticleKind: "atom",
      src: "owner/child",
      metaSrc: "owner/child",
      label: "Child",
      depth: 1,
      darkParticleOrder: 0,
      localX: 10,
      localY: 0,
      localZ: 0,
      torusScale: 0.5,
      torusRadius: 8,
      torusTube: 3,
      colorR: 0.8,
      colorG: 0.3,
      colorB: 1,
    },
  ],
  fieldParticles: [{
    fieldParticleId: "field/7",
    fieldId: 7,
    valueId: 7,
    parentDarkParticleId: 2,
    fieldKey: "ready",
    fieldLabel: "Ready",
    fieldParticleKind: "boolean",
    valueText: "true",
    localX: 2,
    localY: 1,
    localZ: 0,
    sphereRadius: 1,
    colorR: 0,
    colorG: 0.9,
    colorB: 1,
  }],
  orbitalParticles: [
    {
      orbitalParticleId: "atom/1/sleeve/11/state/11/path/root",
      sourceId: 11,
      parentDarkParticleId: 1,
      orbitalParticleKind: "state",
      label: "Start",
      current: true,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 11,
      relatedStateIds: [11],
      localX: 34,
      localY: 0,
      localZ: 1,
      sphereRadius: 0.8,
      colorR: 0.2,
      colorG: 0.9,
      colorB: 1,
    },
    {
      orbitalParticleId: "atom/1/sleeve/12/state/12/path/root",
      sourceId: 12,
      parentDarkParticleId: 1,
      orbitalParticleKind: "state",
      label: "Done",
      current: false,
      active: false,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 12,
      relatedStateIds: [12],
      localX: 0,
      localY: 34,
      localZ: -1,
      sphereRadius: 0.8,
      colorR: 1,
      colorG: 0.4,
      colorB: 0,
    },
    {
      orbitalParticleId: "atom/2/sleeve/13/state/13/path/root",
      sourceId: 13,
      parentDarkParticleId: 2,
      orbitalParticleKind: "state",
      label: "Child state",
      current: true,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 13,
      relatedStateIds: [13],
      localX: 9.5,
      localY: 0,
      localZ: 0,
      sphereRadius: 0.5,
      colorR: 0.4,
      colorG: 1,
      colorB: 0.3,
    },
  ],
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

const secondLayout = (): StateGraphRootLayout => ({
  rootStateId: 12,
  levels: [{step: 0, x: 0, nodeIds: ["root/12/state/12"]}],
  nodes: [{
    id: "root/12/state/12",
    stateId: 12,
    label: "Done",
    step: 0,
    x: 0,
    y: 0,
    z: 0,
    radius: 3.2,
    color: [1, 0.4, 0],
    current: false,
    end: "terminal",
    fieldRadius: 0.32,
    fields: [],
    innerRadius: 0.35584,
  }],
  edges: [],
})

const childLayout = (): StateGraphRootLayout => ({
  rootStateId: 13,
  levels: [{step: 0, x: 0, nodeIds: ["child/state/13"]}],
  nodes: [{
    id: "child/state/13",
    stateId: 13,
    label: "Child state",
    step: 0,
    x: 0,
    y: 0,
    z: 0,
    radius: 3.2,
    color: [0.4, 1, 0.3],
    current: true,
    end: null,
    fieldRadius: 0.32,
    fields: [],
    innerRadius: 0.35584,
  }],
  edges: [],
})

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
    const scene = buildOutsideInVisualScene(
      manifest(),
      [
        {atomSrc: "owner/root", layouts: [layout(), secondLayout()]},
        {atomSrc: "owner/child", layouts: [childLayout()]},
      ],
    )

    expect(scene.context.tori).toHaveLength(2)
    const rootTorus = scene.context.tori[0]!
    const childTorus = scene.context.tori[1]!
    const rootInnerRadius = rootTorus.radius - rootTorus.tube
    const rootOuterRadius = rootTorus.radius + rootTorus.tube
    const childOuterRadius = childTorus.radius + childTorus.tube
    const childDistance = Math.hypot(childTorus.x, childTorus.y)

    expect(rootInnerRadius).toBeCloseTo(5.56)
    expect(rootOuterRadius).toBeGreaterThanOrEqual(50)
    expect(childDistance - childOuterRadius)
      .toBeGreaterThanOrEqual(rootInnerRadius)
    expect(scene.context.fields[0]).toMatchObject({
      x: childTorus.x,
      y: childTorus.y,
      radius: 5.5,
    })
    expect(scene.layout.nodes.slice(0, 3).map((node) => node.fieldRadius))
      .toEqual([5.5, 5.5, 5.5])
    expect(scene.layout.nodes[0]!.radius)
      .toBeGreaterThan(scene.layout.nodes[1]!.radius)
    expect(scene.layout.nodes[0]!.fields[0]?.id).toBe(7)
    expect(new Set(scene.layout.nodes.map((node) =>
      node.stateId
    ))).toEqual(new Set([11, 12, 13]))
    const rootStateInnerEdge = Math.min(
      ...scene.layout.nodes.slice(0, 3).map((node) =>
        Math.hypot(node.x, node.y) - node.radius
      ),
    )
    expect(rootStateInnerEdge)
      .toBeGreaterThan(childDistance + childOuterRadius)
    const childState = scene.layout.nodes[3]!
    expect(childState.radius).toBeCloseTo(12.5)
    expect(childState.fieldRadius).toBeCloseTo(2.75)
    expect(Math.hypot(
      childState.x - childTorus.x,
      childState.y - childTorus.y,
    ) - childState.radius)
      .toBeGreaterThanOrEqual(childTorus.radius - childTorus.tube)
  })

  test("derives State spacing without shrinking either State Torus", () => {
    const source = layout()
    const baseline = buildOutsideInVisualScene(
      manifest(),
      [{atomSrc: "owner/root", layouts: [source]}],
    )
    const stretched: StateGraphRootLayout = {
      ...source,
      levels: source.levels.map((level) =>
        level.step === 1 ? {...level, x: 220} : level
      ),
      nodes: source.nodes.map((node) =>
        node.step === 1 ? {...node, x: 220} : node
      ),
    }
    const scene = buildOutsideInVisualScene(
      manifest(),
      [{atomSrc: "owner/root", layouts: [stretched]}],
    )

    expect(scene.layout.nodes[0]!.radius).toBeCloseTo(31.845)
    expect(scene.layout.nodes[1]!.radius).toBeCloseTo(25)
    expect(Math.hypot(
      scene.layout.nodes[1]!.x - scene.layout.nodes[0]!.x,
      scene.layout.nodes[1]!.y - scene.layout.nodes[0]!.y,
    ) - scene.layout.nodes[0]!.radius - scene.layout.nodes[1]!.radius)
      .toBeCloseTo(22)
    expect(Math.hypot(
      scene.layout.nodes[1]!.x - scene.layout.nodes[0]!.x,
      scene.layout.nodes[1]!.y - scene.layout.nodes[0]!.y,
    )).toBeCloseTo(Math.hypot(
      baseline.layout.nodes[1]!.x - baseline.layout.nodes[0]!.x,
      baseline.layout.nodes[1]!.y - baseline.layout.nodes[0]!.y,
    ))
    const rootTorus = scene.context.tori[0]!
    const innerRadius = rootTorus.radius - rootTorus.tube
    const outerRadius = rootTorus.radius + rootTorus.tube
    for (const node of scene.layout.nodes) {
      const planarRadius = Math.hypot(node.x, node.y)
      expect(planarRadius - node.radius).toBeGreaterThanOrEqual(innerRadius)
      expect(planarRadius + node.radius).toBeLessThanOrEqual(outerRadius)
    }
  })

  test("does not reserve a Matter band when the Atom has no child Torus", () => {
    const source = manifest()
    const field = {
      ...source.fieldParticles[0]!,
      parentDarkParticleId: 1,
    }
    const leafManifest: BulkManifest = {
      ...source,
      darkParticles: [source.darkParticles[0]!],
      fieldParticles: [field],
      orbitalParticles: (source.orbitalParticles ?? []).filter((particle) =>
        particle.parentDarkParticleId === 1
      ),
    }
    const scene = buildOutsideInVisualScene(
      leafManifest,
      [{atomSrc: "owner/root", layouts: [layout()]}],
    )
    const torus = scene.context.tori[0]!
    const innerRadius = torus.radius - torus.tube
    const outerRadius = torus.radius + torus.tube
    const fieldExtent = 11
    const stateInnerEdge = Math.min(...scene.layout.nodes.map((node) =>
      Math.hypot(node.x, node.y) - node.radius
    ))

    expect(scene.context.fields[0]!.radius).toBe(fieldExtent)
    expect(innerRadius).toBeCloseTo(fieldExtent + 8.25)
    expect(stateInnerEdge - innerRadius).toBeCloseTo(8.25)
    expect(outerRadius).toBeGreaterThanOrEqual(50)
  })

  test("uses the same Torus composition for Atom, Fuzzy, MACHO and Axion", () => {
    const source = manifest()
    const child = source.darkParticles[1]!
    source.darkParticles.push(
      {
        ...child,
        darkParticleId: 3,
        darkParticleKind: "fuzzy",
        src: null,
        metaSrc: null,
        label: "Fuzzy",
        darkParticleOrder: 1,
      },
      {
        ...child,
        darkParticleId: 4,
        darkParticleKind: "macho",
        src: null,
        metaSrc: null,
        label: "MACHO",
        darkParticleOrder: 2,
      },
      {
        ...child,
        darkParticleId: 5,
        darkParticleKind: "axion",
        src: null,
        metaSrc: null,
        label: "Axion",
        darkParticleOrder: 3,
      },
    )

    const scene = buildOutsideInVisualScene(source, [])

    expect(scene.context.tori).toHaveLength(5)
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
      ...source,
      darkParticles: [root],
      fieldParticles: fields,
    }, [])
    const centers = scene.context.fields

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
      ...source,
      darkParticles: [root],
      fieldParticles: [],
      orbitalParticles: [],
    }, [])
    const torus = scene.context.tori[0]!

    expect(torus.radius).toBeCloseTo(27.78)
    expect(torus.tube).toBeCloseTo(22.22)
    expect(torus.radius - torus.tube).toBeCloseTo(5.56)
    expect(torus.radius + torus.tube).toBeCloseTo(50)
  })
})
