import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  Field,
  States,
  Transition,
  projectVisualScene,
} from "./index.ts"

const manifest = (): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [{
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
    torusRadius: 40,
    torusTube: 10,
    colorR: 1,
    colorG: 1,
    colorB: 1,
  }],
  fieldParticles: [
    {
      fieldParticleId: "field:1",
      fieldId: 1,
      valueId: 1,
      parentDarkParticleId: 1,
      fieldKey: "one",
      fieldLabel: "One",
      fieldParticleKind: "string",
      valueText: null,
      localX: 1,
      localY: 2,
      localZ: 3,
      sphereRadius: 2,
      colorR: 1,
      colorG: 0,
      colorB: 0,
    },
    {
      fieldParticleId: "field:2",
      fieldId: 2,
      valueId: 2,
      parentDarkParticleId: 1,
      fieldKey: "two",
      fieldLabel: "Two",
      fieldParticleKind: "number",
      valueText: null,
      localX: 4,
      localY: 5,
      localZ: 6,
      sphereRadius: 2,
      colorR: 1,
      colorG: 1,
      colorB: 0,
    },
  ],
  orbitalParticles: [
    {
      orbitalParticleId: "state:1",
      sourceId: 1,
      parentDarkParticleId: 1,
      orbitalParticleKind: "state",
      label: "One",
      current: true,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 1,
      relatedStateIds: [],
      localX: 20,
      localY: 0,
      localZ: 0,
      sphereRadius: 2,
      colorR: 0,
      colorG: 1,
      colorB: 0,
    },
    {
      orbitalParticleId: "state:2",
      sourceId: 2,
      parentDarkParticleId: 1,
      orbitalParticleKind: "state",
      label: "Two",
      current: false,
      active: true,
      anchorStateOrbitalParticleId: null,
      sleeveRootStateId: 1,
      relatedStateIds: [],
      localX: 24,
      localY: 0,
      localZ: 0,
      sphereRadius: 2,
      colorR: 0,
      colorG: 0,
      colorB: 1,
    },
  ],
  transitionChannels: [{
    transitionChannelId: "transition:1",
    sourceId: 1,
    parentDarkParticleId: 1,
    fromOrbitalParticleId: "state:1",
    toOrbitalParticleId: "state:2",
    conditionIds: [],
    conditionFieldIds: [],
    active: true,
    colorR: 1,
    colorG: 1,
    colorB: 1,
  }],
  fieldProxies: [],
  relationChannels: [],
})

describe("Visual scene pages", () => {
  test("isolates one Field without changing its materialized geometry", () => {
    const source = manifest()
    const scene = projectVisualScene(source, Field)
    expect(scene.fieldParticles).toEqual([source.fieldParticles[0]!])
    expect(scene.orbitalParticles).toEqual([])
    expect(scene.darkParticles).toEqual(source.darkParticles)
  })

  test("keeps the complete manifestation for the States page", () => {
    const source = manifest()
    expect(projectVisualScene(source, States)).toEqual(source)
  })

  test("isolates one Transition and its exact endpoints", () => {
    const scene = projectVisualScene(manifest(), Transition)
    expect(scene.transitionChannels?.map((channel) => channel.transitionChannelId)).toEqual([
      "transition:1",
    ])
    expect(scene.orbitalParticles?.map((particle) => particle.orbitalParticleId)).toEqual([
      "state:1",
      "state:2",
    ])
    expect(scene.fieldParticles).toEqual([])
  })

})
