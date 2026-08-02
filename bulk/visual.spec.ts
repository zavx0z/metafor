import {describe, expect, test} from "bun:test"
import type {BulkObserverSnapshot} from "@metafor/types/bulk/initial"
import {
  GRAPH_SCHEMA,
  parseMetaAddress,
  type Graph,
} from "@metafor/types/metafor/graph"
import type {
  BulkReadyVisualRenderManifest,
  BulkVisualRenderManifest,
  BulkVisualRenderPatch,
} from "@metafor/types/bulk/visual"
import {visualLayoutBuiltScenes} from "@metafor/visual/payload"
import type {Particle} from "shared/protocol/force/particle"
import snapshotJson from "./fixture/monad-snapshot.json"
import {prepareBulkInitialVisual, type BulkInitialScene} from "./visual-initial.ts"
import {projectBulkGraph} from "./graph.ts"
import {
  BulkVisualSceneLifecycle,
  BulkReadyVisualSceneLifecycle,
  type BulkVisualSceneTarget,
} from "./visual.ts"

const fixture = (): BulkObserverSnapshot =>
  structuredClone(snapshotJson) as BulkObserverSnapshot

const hydrationDocument = (): Graph => {
  const root = parseMetaAddress("zavx0z/lada")!
  return {
    schema: GRAPH_SCHEMA,
    root,
    template: {
      [root]: {
        name: "Lada",
        fields: [],
        superposition: [],
        mass: [],
        processes: [],
      },
    },
    runtime: {
      roots: [{
        kind: "atom",
        declaration: "#/template/zavx0z~1lada",
        meta: root,
        state: null,
        values: {},
      }],
    },
  }
}

const recordingTarget = () => {
  const manifests: BulkVisualRenderManifest[] = []
  const readyManifests: BulkReadyVisualRenderManifest[] = []
  const patches: BulkVisualRenderPatch[] = []
  const forces: Array<readonly [string, unknown]> = []
  let disposals = 0
  const target: BulkVisualSceneTarget = {
    applyVisualManifestPatch(manifest): void {
      manifests.push(manifest)
    },
    applyVisualReadyScene(manifest): void {
      readyManifests.push(manifest)
    },
    applyVisualRenderPatch(patch): void {
      patches.push(patch)
    },
    dispose(): void {
      disposals += 1
    },
    handleForce(channel, message): void {
      forces.push([channel, message])
    },
  }
  return {
    forces,
    manifests,
    patches,
    readyManifests,
    target,
    disposals: () => disposals,
  }
}

const nextStatePhoton = (
  lifecycle: BulkVisualSceneLifecycle,
): Particle => {
  const {projection, throughTs} = lifecycle.state()
  const current = projection.atomStates.find((entry) => entry.state !== null)
  if (!current) throw new Error("fixture has no current State")
  const atom = projection.atoms.find((entry) => entry.id === current.atom)
  if (!atom) throw new Error("fixture has no owning Atom")
  const next = projection.states.find((state) =>
    state.wimp === atom.wimp && state.id !== current.state
  )
  if (!next) throw new Error("fixture has no alternative State")
  return {
    part: "photon",
    op: "replace",
    path: atom.id,
    ts: (throughTs ?? 0) + 1,
    value: next.name,
    by: "matrix",
  }
}

describe("public Bulk visual scene lifecycle", () => {
  test("prepares one complete snapshot and exposes detached state", () => {
    const recording = recordingTarget()
    const lifecycle = new BulkVisualSceneLifecycle({target: recording.target})
    const before = visualLayoutBuiltScenes()
    const update = lifecycle.prepare(fixture())

    expect(visualLayoutBuiltScenes()).toBe(before + 1)
    expect(update.application?.route).toBe("rebuilt")
    expect(recording.manifests).toHaveLength(1)
    expect(update.state.manifest.rootSrc).toBe("zavx0z/lada")

    update.state.projection.atoms[0]!.wimp = "mutated/outside"
    expect(lifecycle.state().projection.atoms[0]?.wimp)
      .not.toBe("mutated/outside")
    expect(lifecycle.snapshot()).toMatchObject(fixture())
    expect(lifecycle.snapshot().projection.revision).toBe(0)
  })

  test("hydrates server-prepared state without running a browser layout", () => {
    const source = new BulkVisualSceneLifecycle()
    const graph = hydrationDocument()
    const snapshot: BulkObserverSnapshot = {
      version: 1,
      throughTs: null,
      rootSrc: graph.root,
      projection: projectBulkGraph(graph),
    }
    source.prepare(snapshot)
    const state = source.state()
    const initial: BulkInitialScene = {
      kind: "bulk-ready-scene",
      version: snapshot.version,
      throughTs: snapshot.throughTs,
      rootSrc: snapshot.rootSrc,
      session: "visual-lifecycle-test",
      visual: prepareBulkInitialVisual(state.manifest, state.projection),
    }
    const recording = recordingTarget()
    const lifecycle = new BulkReadyVisualSceneLifecycle({target: recording.target})
    const before = visualLayoutBuiltScenes()

    const update = lifecycle.hydrate(initial)

    expect(visualLayoutBuiltScenes()).toBe(before)
    expect(update.application.route).toBe("rebuilt")
    expect(recording.readyManifests).toHaveLength(1)
    expect(lifecycle.snapshot()).toMatchObject({
      kind: "bulk-ready-scene-snapshot",
      version: 1,
      throughTs: snapshot.throughTs,
      rootSrc: snapshot.rootSrc,
    })
    expect("projection" in lifecycle.snapshot()).toBe(false)
  })

  test("applies one Particle through projection, presenter and target", () => {
    const recording = recordingTarget()
    const lifecycle = new BulkVisualSceneLifecycle({target: recording.target})
    lifecycle.prepare(fixture())
    const photon = nextStatePhoton(lifecycle)
    const before = visualLayoutBuiltScenes()

    const update = lifecycle.apply(photon)

    expect(visualLayoutBuiltScenes()).toBe(before)
    expect(update.change).toEqual({
      changed: true,
      affectedAtomIds: [Number(photon.path)],
      facet: "current-state",
      structural: false,
    })
    expect(update.application?.route).toBe("incremental")
    expect(recording.patches).toHaveLength(1)
    expect(recording.forces).toEqual([["photon", photon]])
    expect(update.state.throughTs).toBe(photon.ts)
  })

  test("disposes the owned target exactly once", () => {
    const recording = recordingTarget()
    const lifecycle = new BulkVisualSceneLifecycle({target: recording.target})
    lifecycle.prepare(fixture())

    lifecycle.dispose()
    lifecycle.dispose()

    expect(recording.disposals()).toBe(1)
    expect(() => lifecycle.state()).toThrow(/disposed/)
  })
})
