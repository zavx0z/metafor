import {describe, expect, test} from "bun:test"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {BulkSceneStore} from "./scene.ts"

const manifest = (secondLabel = "two"): BulkManifest => ({
  rootSrc: "owner/root",
  darkParticles: [1, 2].map((id) => ({
    darkParticleId: id,
    parentDarkParticleId: null,
    darkParticleKind: "atom",
    src: `owner/${id}`,
    metaSrc: `owner/${id}`,
    label: id === 2 ? secondLabel : "one",
    depth: 0,
    darkParticleOrder: id,
    localX: id,
    localY: 0,
    localZ: 0,
    torusScale: 1,
    torusRadius: 10,
    torusTube: 1,
    colorR: 1,
    colorG: 1,
    colorB: 1,
  })),
  fieldParticles: [],
})

describe("Bulk live Atom scene patch gate", () => {
  test("an unchanged visual record is not emitted or recreated", () => {
    const store = new BulkSceneStore()
    store.apply(manifest())
    const first = store.darkParticles.get(1)
    const second = store.darkParticles.get(2)

    const patch = store.apply(manifest("changed"))

    expect(patch.darkParticleIds).toEqual([2])
    expect(store.darkParticles.get(1)).toBe(first)
    expect(store.darkParticles.get(2)).toBe(second)
    expect(store.darkParticles.get(2)?.label).toBe("changed")
  })

  test("removal reports only the missing visual entity", () => {
    const store = new BulkSceneStore()
    const initial = manifest()
    store.apply(initial)
    const first = store.darkParticles.get(1)

    const patch = store.apply({...initial, darkParticles: initial.darkParticles.slice(0, 1)})

    expect(patch.removedDarkParticleIds).toEqual([2])
    expect(store.darkParticles.get(1)).toBe(first)
  })
})
