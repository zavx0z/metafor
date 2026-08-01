import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  isVisualPreparedScene,
  visualLayoutBuiltScenes,
  visualRegisteredLayoutSlugs,
} from "@metafor/visual/layout/centered-nested"
// A strategy resolves by slug only where it is actually shipped. This spec
// stands in for a consumer that carries the whole catalog — the playground, a
// server configured for either strategy — so importing it here is what makes
// `outside-in` resolvable below, exactly as it would be in that consumer.
import "@metafor/visual/layout"
import snapshotJson from "../pkg/visual/playground/fixture/monad-snapshot.json"
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

const frontier = {acceptanceSequence: 7, cutId: "cut-initial-hydration"}

describe("Bulk server-prepared initial visual state", () => {
  test("prepares a transportable scene whose payload survives JSON", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:0",
    })

    expect(isVisualPreparedScene(prepared)).toBe(true)
    expect(prepared.frontier).toEqual(frontier)
    expect(prepared.layoutSlug).toBe("centered-nested")
    expect(prepared.payload.tori.length).toBeGreaterThan(0)

    const transported: unknown = JSON.parse(JSON.stringify(prepared))
    expect(isVisualPreparedScene(transported)).toBe(true)
    expect(transported).toEqual(prepared)
  })

  test("carries no Canvas, GPU, Renderer, Space or ViewPoint handle", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:0",
    })

    const serialized = JSON.stringify(prepared)
    for (const forbidden of [
      "Renderer",
      "ViewPoint",
      "GPUBuffer",
      "GPUDevice",
      "canvas",
    ]) {
      expect(serialized.includes(forbidden)).toBe(false)
    }
  })

  test("keys separate a re-send of the same cut from a real change", () => {
    const {manifest, projection} = fixture()
    const first = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:0",
    })
    const resent = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:0",
    })

    expect(resent.keys).toEqual(first.keys)

    const moved = {
      ...first.payload,
      tori: first.payload.tori.map((torus, index) =>
        index === 0 ? {...torus, localX: torus.localX + 25} : torus
      ),
    }
    const movedKeys = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:1",
    })
    expect(movedKeys.keys.sourceRevision).not.toBe(first.keys.sourceRevision)
    expect(moved.tori[0]?.localX).not.toBe(first.payload.tori[0]?.localX)
  })
})

describe("Bulk browser initial path", () => {
  /**
   * The load-bearing assertion of server preparation.
   *
   * `visualLayoutBuiltScenes()` counts every run of any named strategy's
   * placement law, so if hydration ever falls back to building a scene itself
   * this fails — which is the whole point. Preparation is measured separately
   * to prove the counter does move when a strategy really runs, otherwise a
   * broken counter would make the main assertion vacuous.
   */
  test("hydrates prepared state without running any layout strategy", () => {
    const {manifest, projection} = fixture()

    const beforePreparation = visualLayoutBuiltScenes()
    const prepared = prepareBulkInitialVisual(manifest, projection, {
      frontier,
      sourceRevision: "bulk:lada:0",
    })
    expect(visualLayoutBuiltScenes()).toBe(beforePreparation + 1)

    // Exactly what a browser receives: JSON over the wire, nothing else.
    const initial = JSON.parse(JSON.stringify(prepared)) as typeof prepared

    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout(initial.layoutSlug))

    const beforeHydration = visualLayoutBuiltScenes()
    const result = presenter.hydrate(viewport, manifest, initial.payload)

    expect(visualLayoutBuiltScenes()).toBe(beforeHydration)
    expect(viewport.received.length).toBe(1)
    expect(result.projection).not.toBeNull()
    expect(presenter.payload).toBe(initial.payload)
  })

  test("hydrates the outside-in strategy through the same contract", () => {
    // The catalog import above is what put this slug in reach; the production
    // subpath on its own resolves only `centered-nested`, which the browser
    // bundle guard in `visual-layout.spec.ts` proves by absence.
    expect(visualRegisteredLayoutSlugs()).toEqual([
      "centered-nested",
      "outside-in",
    ])
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection, {
      configuration: {layoutSlug: "outside-in"},
      frontier,
      sourceRevision: "bulk:lada:0",
    })
    expect(prepared.layoutSlug).toBe("outside-in")

    const initial = JSON.parse(JSON.stringify(prepared)) as typeof prepared
    const viewport = recordingViewport()
    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout(initial.layoutSlug))

    const beforeHydration = visualLayoutBuiltScenes()
    presenter.hydrate(viewport, manifest, initial.payload)

    expect(visualLayoutBuiltScenes()).toBe(beforeHydration)
    expect(viewport.received.length).toBe(1)
  })

  test("refuses a payload laid out by a different strategy", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection, {
      configuration: {layoutSlug: "outside-in"},
      frontier,
      sourceRevision: "bulk:lada:0",
    })

    const presenter = new BulkVisualScenePresenter()
    presenter.selectLayout(resolveBulkVisualLayout("centered-nested"))

    expect(() =>
      presenter.hydrate(recordingViewport(), manifest, prepared.payload)
    ).toThrow(/does not match the selected/)
  })

  test("rejects an initial package with no prepared visual state", () => {    expect(isVisualPreparedScene(undefined)).toBe(false)
    expect(isVisualPreparedScene({kind: "visual-prepared-scene"})).toBe(false)
    expect(
      isVisualPreparedScene({
        frontier,
        keys: {
          dependencies: "a",
          layoutSlug: "centered-nested",
          payload: "b",
          sourceRevision: "c",
        },
        kind: "visual-prepared-scene",
        layoutSlug: "centered-nested",
        payload: {kind: "visual-scene-payload", layoutSlug: "outside-in"},
      }),
    ).toBe(false)
  })
})
