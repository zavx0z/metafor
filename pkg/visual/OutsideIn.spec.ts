import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {StateGraphRootLayout} from "./StateGraphLayout.ts"
import {buildOutsideInVisualScene} from "./OutsideIn.ts"

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
      fields: [{
        id: 7,
        key: "ready",
        label: "Ready",
        type: "boolean",
      }],
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
      fields: [],
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
    fields: [],
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
    fields: [],
  }],
  edges: [],
})

describe("outside-in Visual layout", () => {
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

    expect(rootInnerRadius).toBeLessThan(18)
    expect(rootOuterRadius).toBeLessThan(42)
    expect(childDistance - childOuterRadius)
      .toBeGreaterThanOrEqual(rootInnerRadius)
    expect(scene.context.fields[0]).toMatchObject({
      x: childTorus.x + 1,
      y: childTorus.y + 0.5,
      radius: 0.5,
    })
    expect(scene.layout.nodes.slice(0, 3).map((node) => node.radius))
      .toEqual([0.8, 0.8, 0.8])
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
    expect(childState.radius).toBe(scene.context.fields[0]!.radius)
    expect(Math.hypot(
      childState.x - childTorus.x,
      childState.y - childTorus.y,
    ) - childState.radius)
      .toBeGreaterThanOrEqual(childTorus.radius - childTorus.tube)
  })

  test("compresses State spacing without shrinking the owning Atom marker", () => {
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
    const scene = buildOutsideInVisualScene(
      manifest(),
      [{atomSrc: "owner/root", layouts: [stretched]}],
    )

    expect(scene.layout.nodes.map((node) => node.radius)).toEqual([0.8, 0.8])
    expect(Math.hypot(
      scene.layout.nodes[1]!.x - scene.layout.nodes[0]!.x,
      scene.layout.nodes[1]!.y - scene.layout.nodes[0]!.y,
    )).toBeGreaterThan(1.6)
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
    const fieldExtent =
      Math.hypot(field.localX, field.localY, field.localZ) +
      field.sphereRadius
    const stateInnerEdge = Math.min(...scene.layout.nodes.map((node) =>
      Math.hypot(node.x, node.y) - node.radius
    ))

    expect(innerRadius).toBeCloseTo(fieldExtent + 0.75)
    expect(stateInnerEdge - innerRadius).toBeCloseTo(0.75)
    expect(outerRadius).toBeLessThan(42)
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
})
