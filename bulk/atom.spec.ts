import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {manifestAtoms} from "./atom.ts"

const manifest = (): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [{
    darkParticleId: 2,
    parentDarkParticleId: null,
    darkParticleKind: "wimp",
    src: "owner/root",
    metaSrc: "owner/root",
    label: "Root",
    depth: 0,
    darkParticleOrder: 0,
    localX: 0,
    localY: 0,
    localZ: 0,
    torusScale: 1,
    torusRadius: 10,
    torusTube: 1,
    colorR: 1,
    colorG: 1,
    colorB: 1,
  }],
  fieldParticles: [],
})

describe("Bulk Atom manifestation", () => {
  test("renames a materialized WIMP instance to Atom without losing its declaration references", () => {
    const source = manifest()
    const result = manifestAtoms(source)

    expect(result.darkParticles[0]).toMatchObject({
      darkParticleKind: "atom",
      src: "owner/root",
      metaSrc: "owner/root",
    })
    expect(source.darkParticles[0]?.darkParticleKind).toBe("wimp")
  })
})
