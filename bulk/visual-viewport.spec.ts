import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import {
  applyBulkViewportManifest,
} from "./visual-viewport.ts"

describe("Bulk Visual viewport seam", () => {
  test("routes initial and changed manifestations through one adapter", () => {
    const snapshot = snapshotJson as BulkObserverSnapshot
    const store = new BulkProjectionStore()
    store.hydrate(structuredClone(snapshot.projection))
    const projection = store.view()
    const initial = buildBulkManifestation(projection, snapshot.rootSrc)
    const changed = structuredClone(initial)
    changed.fieldParticles[0] = {
      ...changed.fieldParticles[0]!,
      fieldLabel: "Changed label",
    }
    const received: BulkVisualRenderManifest[] = []
    const viewport = {
      applyVisualManifestPatch(
        visual: BulkVisualRenderManifest,
      ): void {
        received.push(visual)
      },
    }

    const initialVisual = applyBulkViewportManifest(
      viewport,
      initial,
      projection,
    )
    const changedVisual = applyBulkViewportManifest(
      viewport,
      changed,
      projection,
    )

    expect(received).toEqual([initialVisual, changedVisual])
    expect(received[0]).not.toHaveProperty("sourceManifest")
    expect(received[0]?.sourceStats.rootSrc).toBe(initial.rootSrc)
    expect(received[1]?.sourceStats.fieldParticleCount)
      .toBe(changed.fieldParticles.length)
    expect(received[1]?.manifest.fieldParticles.some((field) =>
      field.fieldLabel.includes("Changed label")
    )).toBe(true)
  })
})
