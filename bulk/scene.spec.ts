import {describe, expect, test} from "bun:test"
import type {BulkRenderManifest} from "@metafor/types/bulk/manifest"
import {BulkSceneStore} from "./scene.ts"

const manifest = (secondLabel = "two", childLocalX = 0.25): BulkRenderManifest => ({
  rootSrc: "owner/root",
  darkParticles: [1, 2].map((id) => ({
    darkParticleId: id,
    parentDarkParticleId: id === 1 ? null : 1,
    darkParticleKind: "atom",
    src: `owner/${id}`,
    metaSrc: `owner/${id}`,
    label: id === 2 ? secondLabel : "one",
    depth: 0,
    darkParticleOrder: id,
    localX: id === 1 ? 1 : childLocalX,
    localY: 0,
    localZ: 0,
    torusRadius: 10,
    torusTube: 1,
    colorR: 1,
    colorG: 1,
    colorB: 1,
  })),
  fieldParticles: [],
  orbitalParticles: [],
  transitionChannels: [],
  fieldProxies: [],
  relationChannels: [],
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

  test("a child transform update does not emit or recreate its unchanged parent", () => {
    const store = new BulkSceneStore()
    store.apply(manifest())
    const parent = store.darkParticles.get(1)

    const patch = store.apply(manifest("two", 0.125))

    expect(patch.darkParticleIds).toEqual([2])
    expect(store.darkParticles.get(1)).toBe(parent)
    expect(store.darkParticles.get(2)?.localX).toBe(0.125)
  })
})
