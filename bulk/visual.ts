import type {
  BulkObserverSnapshot,
  BulkProjectionSnapshot,
  BulkReadySceneSnapshot,
} from "@metafor/types/bulk/initial"
import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {
  BulkProjectionChange,
  BulkRuntimeProjection,
} from "@metafor/types/bulk/runtime"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import type {
  VisualLayout,
  VisualLayoutInput,
} from "@metafor/visual/layout"
import type {VisualScenePayload} from "@metafor/visual/payload"
import type {Particle} from "shared/protocol/force/particle"
import {buildBulkManifestation} from "./manifestation.ts"
import {BulkProjectionStore} from "./projection.ts"
import type {BulkReadyScene} from "./visual-initial.ts"
import {
  DEFAULT_BULK_VISUAL_LAYOUT,
  adaptBulkVisualRenderManifest,
  buildBulkVisualLayoutInput,
  buildBulkVisualScenePayload,
  resolveBulkVisualLayout,
} from "./visual-layout.ts"
import {
  BulkVisualScenePresenter,
  type BulkVisualApplyResult,
  type BulkVisualViewportProjectionSink,
} from "./visual-viewport.ts"
import {
  observedRootSrc,
  resolveForceImpulseVisual,
  type ForceImpulseVisual,
} from "./web/force-protocol.ts"

export type {
  BulkProjectionChange,
  BulkProjectionFacet,
} from "@metafor/types/bulk/runtime"
export type {ForceImpulseVisual}
export {resolveForceImpulseVisual}

/**
 * The renderer seam owned by one visual scene lifecycle.
 *
 * Engine-backed targets implement all operations. Headless consumers may omit
 * a target and still use the same preparation, update and composition path.
 */
export type BulkVisualSceneTarget = BulkVisualViewportProjectionSink &
  Readonly<{
    dispose?(): void
    handleForce?(channel: Particle["part"], message: Particle): void
  }>

/** One immutable semantic cut owned and composed by Bulk. */
export type BulkVisualSceneState = Readonly<{
  manifest: BulkManifest
  projection: BulkRuntimeProjection
  projectionSnapshot: BulkProjectionSnapshot
  rootSrc: string
  throughTs: number | null
}>

/** Result of preparing or applying one semantic scene cut. */
export type BulkVisualSceneUpdate = Readonly<{
  application: BulkVisualApplyResult | null
  change: BulkProjectionChange | null
  state: BulkVisualSceneState
}>

/** Update result for one applied Particle; its projection change is exact. */
export type BulkVisualSceneApplyUpdate = Readonly<{
  application: BulkVisualApplyResult | null
  change: BulkProjectionChange
  state: BulkVisualSceneState
}>

/** Complete declarative result available to an Engine adapter or a UI shell. */
export type BulkVisualSceneComposition = Readonly<{
  payload: VisualScenePayload
  renderManifest: BulkVisualRenderManifest
  state: BulkVisualSceneState
}>

export type BulkVisualSceneLifecycleOptions = Readonly<{
  layout?: VisualLayout
  target?: BulkVisualSceneTarget
}>

/** Result of presenting one visual-only service-plane cut. */
export type BulkReadyVisualSceneUpdate = Readonly<{
  application: BulkVisualApplyResult
  snapshot: BulkReadySceneSnapshot
}>

const HEADLESS_TARGET: BulkVisualViewportProjectionSink = Object.freeze({
  applyVisualManifestPatch(): void {},
  applyVisualReadyScene(): void {},
  applyVisualRenderPatch(): void {},
})

/**
 * The public Bulk-owned lifecycle of one visual scene.
 *
 * Bulk keeps the Monad-derived projection, root selection, semantic
 * manifestation, persistent visual Store, renderer adaptation and target
 * cleanup. A selected Visual strategy is called only with one immutable
 * calculation input and returns derived artifacts which Bulk then composes.
 */
export class BulkVisualSceneLifecycle {
  readonly #presenter: BulkVisualScenePresenter
  readonly #projection = new BulkProjectionStore()
  readonly #target: BulkVisualSceneTarget | undefined
  #disposed = false
  #rootSrc: string | null = null
  #throughTs: number | null = null

  constructor(options: BulkVisualSceneLifecycleOptions = {}) {
    this.#presenter = new BulkVisualScenePresenter(
      options.layout ?? DEFAULT_BULK_VISUAL_LAYOUT,
    )
    this.#target = options.target
  }

  /** Hydrates a complete recorded or observer snapshot and presents it. */
  prepare(snapshot: BulkObserverSnapshot): BulkVisualSceneUpdate {
    this.#assertLive()
    this.#projection.hydrate(structuredClone(snapshot.projection))
    this.#rootSrc = snapshot.rootSrc
    this.#throughTs = snapshot.throughTs
    const state = this.#readState()
    const application = this.#presenter.apply(
      this.#sink(),
      state.manifest,
      state.projection,
    )
    return Object.freeze({application, change: null, state})
  }

  /** Applies one ordinary Particle through projection, composition and target. */
  apply(part: Particle): BulkVisualSceneApplyUpdate {
    this.#assertPrepared()
    const change = this.#projection.apply(part)
    const rootSrcs = new Set(
      [...this.#projection.atoms.values()]
        .filter((atom) =>
          atom.parentAtom === null && atom.parentTopology === null
        )
        .map((atom) => atom.wimp),
    )
    const nextRootSrc = observedRootSrc(part, rootSrcs)
    if (nextRootSrc !== null) this.#rootSrc = nextRootSrc
    this.#throughTs = part.ts

    const state = this.#readState()
    const application = change.changed
      ? this.#presenter.apply(
        this.#sink(),
        state.manifest,
        state.projection,
        change,
      )
      : null
    this.#target?.handleForce?.(part.part, part)
    return Object.freeze({application, change, state})
  }

  /** Returns a detached semantic state cut; callers cannot mutate the Store. */
  state(): BulkVisualSceneState {
    this.#assertPrepared()
    return this.#readState()
  }

  /** Serializable snapshot for capture, replay or another lifecycle. */
  snapshot(): BulkObserverSnapshot {
    const state = this.state()
    return {
      version: 1,
      throughTs: state.throughTs,
      rootSrc: state.rootSrc,
      projection: state.projectionSnapshot,
    }
  }

  /**
   * Adapts the current Bulk state to one pure Visual layout calculation.
   * An optional isolated manifestation is useful to recorded fixture labs.
   */
  layoutInput(manifest?: BulkManifest): VisualLayoutInput {
    const state = this.state()
    return buildBulkVisualLayoutInput(
      manifest ?? state.manifest,
      state.projection,
    )
  }

  /** Composes a complete declarative scene without mutating presented state. */
  compose(options: Readonly<{
    layout?: VisualLayout
    manifest?: BulkManifest
  }> = {}): BulkVisualSceneComposition {
    const state = this.state()
    const manifest = options.manifest ?? state.manifest
    const payload = buildBulkVisualScenePayload(
      manifest,
      state.projection,
      options.layout ?? this.#presenter.layout,
    )
    return Object.freeze({
      payload,
      renderManifest: adaptBulkVisualRenderManifest(manifest, payload),
      state,
    })
  }

  /** Releases the owned renderer target and rejects later lifecycle work. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#target?.dispose?.()
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new Error("Bulk visual scene lifecycle is disposed")
    }
  }

  #assertPrepared(): void {
    this.#assertLive()
    if (this.#rootSrc === null) {
      throw new Error("Bulk visual scene lifecycle is not prepared")
    }
  }

  #readState(): BulkVisualSceneState {
    if (this.#rootSrc === null) {
      throw new Error("Bulk visual scene lifecycle is not prepared")
    }
    const projectionSnapshot = this.#projection.snapshot()
    const projection = projectionSnapshot.runtime
    return Object.freeze({
      manifest: buildBulkManifestation(projection, this.#rootSrc),
      projection,
      projectionSnapshot,
      rootSrc: this.#rootSrc,
      throughTs: this.#throughTs,
    })
  }

  #sink(): BulkVisualViewportProjectionSink {
    return this.#target ?? HEADLESS_TARGET
  }
}

/**
 * Production browser lifecycle for server-prepared ready scenes.
 *
 * It owns only visual payload, renderer state and the diagnostic cursor. The
 * semantic lifecycle above remains available to server-side and recorded-fixture
 * consumers, but Graph/projection/manifest cannot enter this class.
 */
export class BulkReadyVisualSceneLifecycle {
  readonly #presenter: BulkVisualScenePresenter
  readonly #target: BulkVisualSceneTarget | undefined
  #disposed = false
  #rootSrc: string | null = null
  #throughTs: number | null = null

  constructor(options: BulkVisualSceneLifecycleOptions = {}) {
    this.#presenter = new BulkVisualScenePresenter(
      options.layout ?? DEFAULT_BULK_VISUAL_LAYOUT,
    )
    this.#target = options.target
  }

  /** Presents one complete replacement without semantic browser state. */
  hydrate(scene: BulkReadyScene): BulkReadyVisualSceneUpdate {
    this.#assertLive()
    this.#presenter.selectLayout(
      resolveBulkVisualLayout(scene.visual.layoutSlug),
    )
    const application = this.#presenter.hydrateReady(
      this.#target ?? HEADLESS_TARGET,
      scene.visual,
    )
    this.#rootSrc = scene.rootSrc
    this.#throughTs = scene.throughTs
    return Object.freeze({application, snapshot: this.snapshot()})
  }

  /** Compact capture identity for the scene currently held by the presenter. */
  snapshot(): BulkReadySceneSnapshot {
    this.#assertLive()
    const payload = this.#presenter.payload
    if (payload === null || this.#rootSrc === null) {
      throw new Error("Bulk ready visual scene lifecycle is not prepared")
    }
    return {
      kind: "bulk-ready-scene-snapshot",
      version: 1,
      throughTs: this.#throughTs,
      rootSrc: this.#rootSrc,
      visual: {
        layoutSlug: payload.layoutSlug,
        sourceStats: {
          rootSrc: payload.stats.rootSrc,
          darkParticleCount: payload.stats.darkParticleCount,
          fieldParticleCount: payload.stats.fieldParticleCount,
          orbitalParticleCount: payload.stats.orbitalParticleCount,
          transitionChannelCount: payload.stats.transitionChannelCount,
        },
        transitionBatchFingerprints: payload.transitionBatches.map(
          (batch) => batch.fingerprint,
        ),
        relationBatchFingerprints: payload.relationBatches.map(
          (batch) => batch.fingerprint,
        ),
      },
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#target?.dispose?.()
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new Error("Bulk ready visual scene lifecycle is disposed")
    }
  }
}
