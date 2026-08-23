import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@bulk/types/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {
  BulkVisualRenderManifest,
  BulkVisualRenderPatch,
} from "@bulk/types/visual"
import {CenteredNested, OutsideIn} from "@metafor/visual/layout"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import {
  BulkVisualScenePresenter,
  applyBulkViewportManifest,
} from "./visual-viewport.ts"
import {buildBulkVisualScenePayload} from "./visual-layout.ts"
import {assertBulkVisualProjectionBoundary} from "./web/visual-projection.ts"

const fixture = () => {
  const snapshot = snapshotJson as BulkObserverSnapshot
  const store = new BulkProjectionStore()
  store.hydrate(structuredClone(snapshot.projection))
  const projection = store.view()
  return {
    manifest: buildBulkManifestation(projection, snapshot.rootSrc),
    projection,
    store,
  }
}

const recordingViewport = () => {
  const received: BulkVisualRenderManifest[] = []
  return {
    received,
    applyVisualManifestPatch(value: BulkVisualRenderManifest) {
      assertBulkVisualProjectionBoundary(value)
      received.push(value)
    },
  }
}

/**
 * A sink that accepts operations. The production browser sink does; a sink that
 * does not forces the presenter to widen, which is what `recordingViewport`
 * exercises.
 */
const patchingViewport = () => {
  const received: BulkVisualRenderManifest[] = []
  const patches: BulkVisualRenderPatch[] = []
  return {
    patches,
    received,
    applyVisualManifestPatch(value: BulkVisualRenderManifest) {
      assertBulkVisualProjectionBoundary(value)
      received.push(value)
    },
    applyVisualRenderPatch(value: BulkVisualRenderPatch) {
      patches.push(value)
    },
  }
}

describe("Bulk Visual scene presenter", () => {
  test("hydrates a server-prepared payload without re-running layout", () => {
    const {manifest, projection} = fixture()
    const payload = buildBulkVisualScenePayload(manifest, projection)
    const serialized = JSON.parse(
      JSON.stringify(payload),
    ) as typeof payload
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()

    const result = presenter.hydrate(viewport, manifest, serialized)

    expect(viewport.received.length).toBe(1)
    expect(result.projection).not.toBeNull()
    expect(result.summary.kind).toBe("visual-replace-patch")
    expect(viewport.received[0]?.layoutSlug).toBe("centered-nested")
    expect(viewport.received[0]?.manifest.darkParticles.length)
      .toBe(payload.tori.length)
    expect(presenter.payload).toBe(serialized)
  })

  test("produces the same render projection on server and browser", () => {
    const {manifest, projection} = fixture()
    const prepared = JSON.parse(
      JSON.stringify(buildBulkVisualScenePayload(manifest, projection)),
    ) as ReturnType<typeof buildBulkVisualScenePayload>

    const hydrated = recordingViewport()
    new BulkVisualScenePresenter().hydrate(hydrated, manifest, prepared)
    const rebuilt = recordingViewport()
    new BulkVisualScenePresenter().apply(rebuilt, manifest, projection)

    expect(JSON.stringify(hydrated.received[0]))
      .toBe(JSON.stringify(rebuilt.received[0]))
  })

  test("does not touch the viewport when nothing changed", () => {
    const {manifest, projection} = fixture()
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.apply(viewport, manifest, projection)

    const result = presenter.apply(viewport, manifest, projection, {
      affectedAtomIds: [],
      changed: false,
      facet: "none",
      structural: false,
    })

    expect(viewport.received.length).toBe(1)
    expect(result.projection).toBeNull()
    expect(result.summary.total).toBe(0)
  })

  test("narrows an appearance-only change instead of rebuilding", () => {
    const {manifest, projection} = fixture()
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    const initial = presenter.apply(viewport, manifest, projection)

    const changed: BulkManifest = {
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field, index) =>
        index === 0 ? {...field, valueText: "presenter-probe"} : field
      ),
    }
    // `centered-nested` reads Field Value for placement, so the strategy runs
    // again — this facet is never automatically appearance-only here. What the
    // renderer receives is still only what actually differs: one Field.
    const result = presenter.apply(viewport, changed, projection, {
      affectedAtomIds: [],
      changed: true,
      facet: "field-value",
      structural: false,
    })

    expect(result.scope).toBe("geometry")
    expect(result.summary.fields).toBe(1)
    expect(result.summary.tori).toBe(0)
    expect(result.summary.total).toBe(1)
    expect(result.summary.total).toBeLessThan(initial.summary.total)
    // The renderer still receives a complete, boundary-valid projection,
    // because this sink cannot apply operations.
    expect(viewport.received.length).toBe(2)
    expect(viewport.received[1]?.manifest.fieldParticles.length)
      .toBe(viewport.received[0]?.manifest.fieldParticles.length)
  })

  test("sends a sink that accepts operations the exact patch, not a scene", () => {
    const {manifest, projection} = fixture()
    const viewport = patchingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.apply(viewport, manifest, projection)

    const changed: BulkManifest = {
      ...manifest,
      fieldParticles: manifest.fieldParticles.map((field, index) =>
        index === 0 ? {...field, valueText: "presenter-probe"} : field
      ),
    }
    const result = presenter.apply(viewport, changed, projection, {
      affectedAtomIds: [],
      changed: true,
      facet: "field-value",
      structural: false,
    })

    // One full projection at hydration, none after: the change arrived as
    // operations.
    expect(viewport.received.length).toBe(1)
    expect(viewport.patches.length).toBe(1)
    expect(result.projection).toBeNull()
    expect(result.patch).not.toBeNull()

    const patch = viewport.patches[0]!
    expect(patch.kind).toBe("bulk-visual-render-patch")
    expect(patch.layoutSlug).toBe("centered-nested")
    expect(patch.fieldParticles.length).toBe(1)
    expect(patch.darkParticles.length).toBe(0)
    expect(patch.orbitalParticles.length).toBe(0)
    expect(patch.removedFieldParticleIds.length).toBe(0)
    expect(patch.removedDarkParticleIds.length).toBe(0)
    // The one changed Field carries the new text through to the renderer.
    expect(patch.fieldParticles[0]?.valueText).toBe("presenter-probe")
  })

  test("costs nothing when a structural facet changed no entity", () => {
    const {manifest, projection} = fixture()
    const viewport = patchingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.apply(viewport, manifest, projection)

    const result = presenter.apply(viewport, manifest, projection, {
      affectedAtomIds: [],
      changed: true,
      facet: "structure",
      structural: true,
    })

    // A structural facet always re-places the scene — the Store refuses to
    // narrow it. But re-placing the same manifestation differs nowhere, so
    // nothing reaches the renderer at all.
    expect(result.scope).toBe("structure")
    expect(result.route).toBe("none")
    expect(result.summary.total).toBe(0)
    expect(viewport.received.length).toBe(1)
    expect(viewport.patches.length).toBe(0)
  })

  test("accepts an injected strategy through the same contract", () => {
    const {manifest, projection} = fixture()
    const centered = recordingViewport()
    const outside = recordingViewport()

    applyBulkViewportManifest(centered, manifest, projection, CenteredNested)
    applyBulkViewportManifest(outside, manifest, projection, OutsideIn)

    expect(centered.received[0]?.layoutSlug).toBe("centered-nested")
    expect(outside.received[0]?.layoutSlug).toBe("outside-in")
    expect(outside.received[0]?.manifest.darkParticles.length)
      .toBe(centered.received[0]?.manifest.darkParticles.length)

    const centeredById = new Map(
      centered.received[0]!.manifest.darkParticles.map((particle) =>
        [particle.darkParticleId, particle] as const
      ),
    )
    const moved = outside.received[0]!.manifest.darkParticles.filter(
      (particle) => {
        const other = centeredById.get(particle.darkParticleId)!
        return other.localX !== particle.localX ||
          other.localY !== particle.localY ||
          other.torusRadius !== particle.torusRadius
      },
    )
    expect(moved.length).toBeGreaterThan(0)
  })

  test("rebuilds after the selected strategy changes", () => {
    const {manifest, projection} = fixture()
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter(CenteredNested)
    presenter.apply(viewport, manifest, projection)

    presenter.selectLayout(OutsideIn)
    expect(presenter.payload).toBeNull()

    // Non-structural upstream, yet the strategy itself changed: there is no
    // prior payload under the new law to narrow against.
    const result = presenter.apply(viewport, manifest, projection, {
      affectedAtomIds: [],
      changed: true,
      facet: "current-state",
      structural: false,
    })

    expect(result.summary.kind).toBe("visual-replace-patch")
    expect(result.payload.layoutSlug).toBe("outside-in")
    expect(viewport.received[1]?.layoutSlug).toBe("outside-in")
  })

  test("rejects a payload built by a different strategy", () => {
    const {manifest, projection} = fixture()
    const payload = buildBulkVisualScenePayload(
      manifest,
      projection,
      OutsideIn,
    )

    expect(() =>
      new BulkVisualScenePresenter(CenteredNested).hydrate(
        recordingViewport(),
        manifest,
        payload,
      )
    ).toThrow("does not match the selected")
  })

  test("keeps a server-prepared payload free of browser resources", () => {
    const {manifest, projection} = fixture()
    const json = JSON.stringify(
      buildBulkVisualScenePayload(manifest, projection),
    )

    for (const forbidden of [
      "Renderer",
      "ViewPoint",
      "Space",
      "canvas",
      "GPUDevice",
      "BufferGeometry",
      "LineSegments",
    ]) {
      expect(json).not.toContain(forbidden)
    }
    expect(JSON.parse(json)).toBeTruthy()
  })
})
