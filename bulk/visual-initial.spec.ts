import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import type {
  BulkReadyVisualRenderManifest,
  BulkVisualRenderManifest,
} from "@metafor/types/bulk/visual"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import {
  isVisualPreparedScene,
  visualLayoutBuiltScenes,
  visualRegisteredLayoutSlugs,
} from "@metafor/visual/layout/centered-nested"
// This test explicitly exercises both shipped strategies; production Bulk's
// centered-only entrypoint remains independently bundle-checked.
import "@metafor/visual/layout"
import snapshotJson from "./fixture/oracle-snapshot.json"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import {BulkVisualScenePresenter} from "./visual-viewport.ts"
import {
  adaptBulkReadyVisualRenderManifest,
  adaptBulkVisualRenderManifest,
  resolveBulkVisualLayout,
} from "./visual-layout.ts"
import {
  isBulkInitialScene,
  isBulkReadySceneUpdateControl,
  prepareBulkInitialVisual,
  type BulkInitialScene,
} from "./visual-initial.ts"
import {projectBulkGraph} from "./graph.ts"
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
  const received: Array<
    BulkVisualRenderManifest | BulkReadyVisualRenderManifest
  > = []
  return {
    received,
    applyVisualManifestPatch(value: BulkVisualRenderManifest) {
      assertBulkVisualProjectionBoundary(value)
      received.push(value)
    },
    applyVisualReadyScene(value: BulkReadyVisualRenderManifest) {
      assertBulkVisualProjectionBoundary(value)
      received.push(value)
    },
  }
}

const graphScene = (): BulkInitialScene => {
  const root = parseMetaAddress("example/root")!
  const graph: Graph = {
    schema: GRAPH_SCHEMA,
    root,
    template: {
      [root]: {name: "Root", fields: [], superposition: [], mass: [], processes: []},
    },
    runtime: {
      roots: [{
        kind: "atom",
        declaration: "#/template/example~1root",
        meta: root,
        state: null,
        values: {},
      }],
    },
  }
  const projection = projectBulkGraph(graph).runtime
  const manifest = buildBulkManifestation(projection, root)
  return {
    kind: "bulk-ready-scene",
    version: 1,
    session: "scene-session",
    throughTs: 7,
    rootSrc: root,
    visual: prepareBulkInitialVisual(manifest, projection),
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
  test("accepts only a visual-only ready initial cut and causal update", () => {
    const initial = graphScene()
    const message = {
      parts: [{part: "photon" as const, op: "replace" as const, path: 1, by: "matrix", ts: 7, value: "ready"}],
    }

    expect(isBulkInitialScene(initial)).toBe(true)
    expect(isBulkReadySceneUpdateControl({
      control: "bulk.graph.update",
      scene: initial,
      message,
    })).toBe(true)
    expect(isBulkInitialScene({...initial, rootSrc: "example/other"})).toBe(false)
    expect(isBulkInitialScene({...initial, graph: {}})).toBe(false)
    expect(isBulkInitialScene({...initial, manifest: {}})).toBe(false)
    expect(isBulkReadySceneUpdateControl({
      control: "bulk.graph.update",
      scene: initial,
      message: {...message, parts: [{...message.parts[0], ts: 8}]},
    })).toBe(false)
  })

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
    const result = presenter.hydrateReady(viewport, initial)

    expect(visualLayoutBuiltScenes()).toBe(beforeHydration)
    expect(viewport.received.length).toBe(1)
    expect(result.projection).not.toBeNull()
    expect(presenter.payload).toBe(initial.payload)
  })

  test("keeps renderer-visible facts identical without semantic manifestation", () => {
    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection)
    const semantic = adaptBulkVisualRenderManifest(manifest, prepared.payload)
    const ready = adaptBulkReadyVisualRenderManifest(prepared.payload)
    const semanticDark = new Map(semantic.manifest.darkParticles.map((entry) =>
      [entry.darkParticleId, entry] as const
    ))
    const semanticFields = new Map(semantic.manifest.fieldParticles.map((entry) =>
      [entry.fieldParticleId, entry] as const
    ))
    const semanticOrbitals = new Map(semantic.manifest.orbitalParticles.map((entry) =>
      [entry.orbitalParticleId, entry] as const
    ))
    const semanticProxies = new Map(semantic.manifest.fieldProxies.map((entry) =>
      [entry.fieldProxyId, entry] as const
    ))

    ready.manifest.darkParticles.forEach((entry) =>
      expect(semanticDark.get(entry.darkParticleId)).toMatchObject(entry)
    )
    ready.manifest.fieldParticles.forEach((entry) =>
      expect(semanticFields.get(entry.fieldParticleId)).toMatchObject(entry)
    )
    ready.manifest.orbitalParticles.forEach((entry) =>
      expect(semanticOrbitals.get(entry.orbitalParticleId)).toMatchObject(entry)
    )
    ready.manifest.fieldProxies.forEach((entry) =>
      expect(semanticProxies.get(entry.fieldProxyId)).toMatchObject(entry)
    )
    const semanticTransitions = new Map(semantic.transitionPaths.map((entry) =>
      [entry.transitionChannelId, entry] as const
    ))
    const semanticRelations = new Map(semantic.relationPaths.map((entry) =>
      [entry.relationChannelId, entry] as const
    ))
    expect(ready.transitionPaths).toHaveLength(semantic.transitionPaths.length)
    ready.transitionPaths.forEach((entry) =>
      expect(semanticTransitions.get(entry.transitionChannelId)).toEqual(entry)
    )
    expect(ready.relationPaths).toHaveLength(semantic.relationPaths.length)
    ready.relationPaths.forEach((entry) =>
      expect(semanticRelations.get(entry.relationChannelId)).toEqual(entry)
    )
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
    presenter.hydrateReady(viewport, prepared)

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
      presenter.hydrateReady(recordingViewport(), prepared)
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

    const {manifest, projection} = fixture()
    const prepared = prepareBulkInitialVisual(manifest, projection)
    const wrongEnvelopeVersion = structuredClone(prepared) as unknown as {
      version: number
    }
    wrongEnvelopeVersion.version = 2
    expect(isVisualPreparedScene(wrongEnvelopeVersion)).toBe(false)

    const wrongCurveLaw = structuredClone(prepared) as unknown as {
      payload: {curveLaw: {version: number}}
    }
    wrongCurveLaw.payload.curveLaw.version = 2
    expect(isVisualPreparedScene(wrongCurveLaw)).toBe(false)

    const legacyPoints = structuredClone(prepared) as unknown as {
      payload: {transitionBatches: Array<{paths: Array<Record<string, unknown>>}>}
    }
    const firstPath = legacyPoints.payload.transitionBatches[0]?.paths[0]
    if (firstPath) firstPath.points = [0, 0, 0]
    expect(isVisualPreparedScene(legacyPoints)).toBe(false)
  })
})
