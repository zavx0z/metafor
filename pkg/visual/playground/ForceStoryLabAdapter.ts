import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  CenteredNested,
  OutsideIn,
  buildStateGraph,
  visualOwnerDarkParticleIdFromAtomId,
  type StateGraph,
  type VisualLayout,
  type VisualLayoutSlug,
  type VisualScene,
} from "@metafor/visual/layout"
import {
  BulkProjectionStore,
  type BulkProjectionChange,
} from "../../../bulk/projection.ts"
import {buildBulkManifestation} from "../../../bulk/manifestation.ts"
import {
  buildBulkVisualRenderManifest,
  renderableManifest,
} from "../../../bulk/visual-layout.ts"
import {resolveForceImpulseVisual} from "../../../bulk/web/force-protocol.ts"
import type {
  ForceStoryDefinition,
  ForceStoryLayout,
  ForceStoryPreparedScene,
  ForceStoryVerifiedRepresentation,
  ForceStoryView,
} from "./ForceStories.ts"
import {
  createVisualSceneViewport,
  type VisualSceneViewport,
} from "./VisualSceneViewport.ts"

export type ForceStorySleeveSnapshot = Readonly<{
  active: boolean
  current: boolean
  name: string
  rootStateId: number
}>

export type ForceStoryVisualLayoutSnapshot = Readonly<{
  id: VisualLayoutSlug
  label: ForceStoryLayout["label"]
  scene: VisualScene
}>

export type ForceStoryVisualSnapshot = Readonly<{
  graph: StateGraph
  layouts: readonly ForceStoryVisualLayoutSnapshot[]
  manifest: BulkManifest
  representationId: string
  rootDarkParticleId: number
  sleeves: readonly ForceStorySleeveSnapshot[]
  visual: BulkVisualRenderManifest
}>

export type ForceStoryActivitySnapshot = Readonly<{
  activeProcessCount: number
  activeRelationCount: number
  activeTransitionCount: number
}>

export type ForceStorySessionSnapshot = Readonly<{
  activity: ForceStoryActivitySnapshot
  change: BulkProjectionChange | null
  currentState: string
  phase: "applied" | "prepared"
  projection: ReturnType<BulkProjectionStore["snapshot"]>
  representation: ForceStoryVisualSnapshot
}>

export type ForceStoryDisplayAdapter = Readonly<{
  apply(snapshot: ForceStorySessionSnapshot): void
  dispose(): void
  setSize(width: number, height: number): void
}>

type CreateForceStoryDisplayAdapterOptions = Readonly<{
  canvas: HTMLCanvasElement
  height: number
  initial: ForceStorySessionSnapshot
  layoutId: VisualLayoutSlug
  view: ForceStoryView
  width: number
}>

const forceStoryLayoutById = Object.freeze({
  "centered-nested": CenteredNested,
  "outside-in": OutsideIn,
} satisfies Record<VisualLayoutSlug, VisualLayout>)

const prepareProjection = (
  scene: ForceStoryPreparedScene,
): BulkProjectionStore => {
  const store = new BulkProjectionStore()
  store.hydrate(structuredClone(scene.sourceSnapshot))
  return store
}

const verifiedRepresentation = (
  definition: ForceStoryDefinition,
): ForceStoryVerifiedRepresentation => {
  const verified = definition.representations.filter((representation) =>
    representation.status === "verified"
  )
  if (verified.length !== 1) {
    throw new Error(
      `Force Story ${definition.part} expected one verified representation`,
    )
  }
  return verified[0]!
}

const currentStateName = (
  store: BulkProjectionStore,
  scene: ForceStoryPreparedScene,
): string => {
  const stateId = store.atomStates.get(scene.atomId)?.state
  if (stateId === null || stateId === undefined) return "none"
  return store.states.get(stateId)?.name ?? `State ${stateId}`
}

const visualSnapshot = (
  store: BulkProjectionStore,
  representation: ForceStoryVerifiedRepresentation,
): ForceStoryVisualSnapshot => {
  const projection = store.view()
  const preparedScene = representation.preparedScene
  const manifest = buildBulkManifestation(projection, preparedScene.rootSrc)
  const graph = buildStateGraph(projection, preparedScene.atomId)
  const rootDarkParticleId = visualOwnerDarkParticleIdFromAtomId(
    preparedScene.atomId,
  )
  const stateById = new Map(
    graph.states.map((state) => [state.id, state] as const),
  )
  const rootStateIds = [...new Set(
    graph.sleeves.map((sleeve) => sleeve.rootStateId),
  )]
  const atomByOwnerId = new Map(
    projection.atoms.map((atom) => [
      visualOwnerDarkParticleIdFromAtomId(atom.id),
      atom,
    ] as const),
  )
  const renderable = renderableManifest(manifest)
  const owners = renderable.darkParticles
    .filter((particle) => particle.darkParticleKind === "atom")
    .map((particle) => {
      const atom = atomByOwnerId.get(particle.darkParticleId)
      if (!atom) {
        throw new Error(
          `Force Story ${representation.id} owner ${particle.darkParticleId} is absent`,
        )
      }
      return {
        graph: buildStateGraph(projection, atom.id),
        ownerDarkParticleId: particle.darkParticleId,
      }
    })
  return {
    graph,
    layouts: representation.layouts.map((layout) => ({
      id: layout.id,
      label: layout.label,
      scene: forceStoryLayoutById[layout.id].buildScene({
        manifest: renderable,
        owners,
      }),
    })),
    manifest,
    representationId: representation.id,
    rootDarkParticleId,
    visual: buildBulkVisualRenderManifest(manifest, projection),
    sleeves: rootStateIds.map((rootStateId) => ({
      active: rootStateId === graph.currentStateId,
      current: rootStateId === graph.currentStateId,
      name: stateById.get(rootStateId)?.name ?? `State ${rootStateId}`,
      rootStateId,
    })),
  }
}

const activitySnapshot = (
  representation: ForceStoryVisualSnapshot,
): ForceStoryActivitySnapshot => ({
  activeProcessCount: representation.manifest.orbitalParticles?.filter(
    (particle) =>
      particle.orbitalParticleKind === "process" && particle.active,
  ).length ?? 0,
  activeRelationCount: representation.manifest.relationChannels?.filter(
    (channel) => channel.active,
  ).length ?? 0,
  activeTransitionCount: representation.manifest.transitionChannels?.filter(
    (channel) => channel.active,
  ).length ?? 0,
})

export class ForceStorySession {
  readonly definition: ForceStoryDefinition
  readonly representation: ForceStoryVerifiedRepresentation
  #change: BulkProjectionChange | null = null
  #phase: "applied" | "prepared" = "prepared"
  #store: BulkProjectionStore

  constructor(definition: ForceStoryDefinition) {
    this.definition = definition
    this.representation = verifiedRepresentation(definition)
    this.#store = prepareProjection(this.representation.preparedScene)
  }

  apply(): ForceStorySessionSnapshot {
    if (this.#phase === "prepared") {
      this.#change = this.#store.apply(structuredClone(this.definition.patch))
      if (!this.#change.changed) {
        throw new Error(
          `Force Story ${this.definition.part} patch did not change projection`,
        )
      }
      this.#phase = "applied"
    }
    return this.snapshot()
  }

  restart(): ForceStorySessionSnapshot {
    this.#store = prepareProjection(this.representation.preparedScene)
    this.#change = null
    this.#phase = "prepared"
    return this.snapshot()
  }

  snapshot(): ForceStorySessionSnapshot {
    const representation = visualSnapshot(this.#store, this.representation)
    return {
      activity: activitySnapshot(representation),
      change: this.#change === null ? null : structuredClone(this.#change),
      currentState: currentStateName(
        this.#store,
        this.representation.preparedScene,
      ),
      phase: this.#phase,
      projection: this.#store.snapshot(),
      representation,
    }
  }
}

export const createForceStorySession = (
  definition: ForceStoryDefinition,
): ForceStorySession => new ForceStorySession(definition)

const layoutSnapshot = (
  snapshot: ForceStorySessionSnapshot,
  layoutId: VisualLayoutSlug,
): ForceStoryVisualLayoutSnapshot => {
  const layout = snapshot.representation.layouts.find((candidate) =>
    candidate.id === layoutId
  )
  if (!layout) throw new Error(`Force Story layout ${layoutId} is absent`)
  return layout
}

export const createForceStoryDisplayAdapter = async ({
  canvas,
  height,
  initial,
  layoutId,
  view,
  width,
}: CreateForceStoryDisplayAdapterOptions): Promise<ForceStoryDisplayAdapter> => {
  const viewport: VisualSceneViewport = await createVisualSceneViewport({
    canvas,
    height,
    scene: layoutSnapshot(initial, layoutId).scene,
    showLabels: true,
    width,
  })
  viewport.setView(view.camera)
  return Object.freeze({
    apply(snapshot: ForceStorySessionSnapshot): void {
      viewport.applyScene(layoutSnapshot(snapshot, layoutId).scene)
    },
    dispose(): void {
      viewport.dispose()
    },
    setSize(nextWidth: number, nextHeight: number): void {
      viewport.setSize(nextWidth, nextHeight)
    },
  })
}

export const forceStoryAccent = (
  definition: ForceStoryDefinition,
): string => resolveForceImpulseVisual(definition.patch).color
  .slice(0, 3)
  .map((value) => Math.round(value * 255))
  .join(", ")
