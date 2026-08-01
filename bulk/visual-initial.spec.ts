import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  isVisualPreparedScene,
  visualLayoutBuiltScenes,
  visualRegisteredLayoutSlugs,
} from "@metafor/visual/layout/centered-nested"
// This test explicitly exercises both shipped strategies; production Bulk's
// centered-only entrypoint remains independently bundle-checked.
import "@metafor/visual/layout"
import snapshotJson from "./fixture/monad-snapshot.json"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import {BulkVisualScenePresenter} from "./visual-viewport.ts"
import {resolveBulkVisualLayout} from "./visual-layout.ts"
import {prepareBulkInitialVisual} from "./visual-initial.ts"
import {assertBulkVisualProjectionBoundary} from "./web/visual-projection.ts"

const fixture = () => {
  const snapshot = snapshotJson as BulkObserverSnapshot
  const store = new BulkProjectionStore()
  store.hydrate(structuredClone(snapshot.projection))
  const projection = store.view()
  return {
    manifest: buildBulkManifestation(projection, snapshot.rootSrc),
    projection,
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

describe("Bulk server-prepared initial visual state", () => {
  test("prepares a transportable declarative scene", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection)

    expect(isVisualPreparedScene(prepared)).toBe(true)
    expect(prepared.layoutSlug).toBe("centered-nested")
    expect(prepared.payload.tori.length).toBeGreaterThan(0)

    const transported: unknown = JSON.parse(JSON.stringify(prepared))
    expect(isVisualPreparedScene(transported)).toBe(true)
    expect(transported).toEqual(prepared)
  })

  test("carries neither Engine handles nor recovery policy", () => {
    const {manifest, projection} = fixture()
    const serialized = JSON.stringify(
      prepareBulkInitialVisual(manifest, projection),
    )

    for (const forbidden of [
      "Renderer",
      "ViewPoint",
      "GPUBuffer",
      "GPUDevice",
      "canvas",
      "frontier",
      "reconnect",
      "replay",
      "sourceRevision",
    ]) {
      expect(serialized.includes(forbidden)).toBe(false)
    }
  })
})

describe("Bulk browser initial path", () => {
  test("hydrates prepared state without running a layout strategy", () => {
    const {manifest, projection} = fixture()
    const beforePreparation = visualLayoutBuiltScenes()
    const prepared = prepareBulkInitialVisual(manifest, projection)
    expect(visualLayoutBuiltScenes()).toBe(beforePreparation + 1)

    const initial = JSON.parse(JSON.stringify(prepared)) as typeof prepared
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout(initial.layoutSlug))

    const beforeHydration = visualLayoutBuiltScenes()
    const result = presenter.hydrate(viewport, manifest, initial)

    expect(visualLayoutBuiltScenes()).toBe(beforeHydration)
    expect(viewport.received.length).toBe(1)
    expect(result.projection).not.toBeNull()
    expect(presenter.payload).toBe(initial.payload)
  })

  test("hydrates outside-in through the same contract", () => {
    expect(visualRegisteredLayoutSlugs()).toEqual([
      "centered-nested",
      "outside-in",
    ])
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(
      manifest,
      projection,
      {layoutSlug: "outside-in"},
    )
    expect(prepared.layoutSlug).toBe("outside-in")

    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout(prepared.layoutSlug))
    const beforeHydration = visualLayoutBuiltScenes()
    presenter.hydrate(viewport, manifest, prepared)

    expect(visualLayoutBuiltScenes()).toBe(beforeHydration)
    expect(viewport.received.length).toBe(1)
  })

  test("refuses a payload laid out by a different strategy", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(
      manifest,
      projection,
      {layoutSlug: "outside-in"},
    )
    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout("centered-nested"))

    expect(() =>
      presenter.hydrate(recordingViewport(), manifest, prepared)
    ).toThrow(/does not match the selected/)
  })

  test("rejects malformed prepared visual state", () => {
    expect(isVisualPreparedScene(undefined)).toBe(false)
    expect(isVisualPreparedScene({kind: "visual-prepared-scene"})).toBe(false)
    expect(isVisualPreparedScene({
      kind: "visual-prepared-scene",
      layoutSlug: "centered-nested",
      payload: {kind: "visual-scene-payload", layoutSlug: "outside-in"},
    })).toBe(false)
  })
})
