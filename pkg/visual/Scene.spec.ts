import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {Field} from "./Field.ts"
import {States} from "./States.ts"
import {Transition} from "./Transition.ts"
import {
  projectVisualScene,
} from "./Scene.ts"

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
