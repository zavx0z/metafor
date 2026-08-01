import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkProjectionSnapshot} from "@metafor/types/bulk/initial"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {
  CenteredNested,
  OutsideIn,
  visualOwnerDarkParticleIdFromAtomId,
  type StateGraph,
  type VisualLayout,
  type VisualLayoutSlug,
  type VisualScene,
} from "@metafor/visual/layout"
import {
  BulkVisualSceneLifecycle,
  type BulkProjectionChange,
  resolveForceImpulseVisual,
} from "bulk/visual"
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
  projection: BulkProjectionSnapshot
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
): BulkVisualSceneLifecycle => {
  const lifecycle = new BulkVisualSceneLifecycle()
  lifecycle.prepare({
    version: 1,
    throughTs: null,
    rootSrc: scene.rootSrc,
    projection: structuredClone(scene.sourceSnapshot),
  })
  return lifecycle
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
  lifecycle: BulkVisualSceneLifecycle,
  scene: ForceStoryPreparedScene,
): string => {
  const projection = lifecycle.state().projection
  const stateId = projection.atomStates.find((entry) =>
    entry.atom === scene.atomId
  )?.state
  if (stateId === null || stateId === undefined) return "none"
  return projection.states.find((state) => state.id === stateId)?.name ??
    `State ${stateId}`
}

const visualSnapshot = (
  lifecycle: BulkVisualSceneLifecycle,
  representation: ForceStoryVerifiedRepresentation,
): ForceStoryVisualSnapshot => {
  const preparedScene = representation.preparedScene
  const state = lifecycle.state()
  const manifest = state.manifest
  const rootDarkParticleId = visualOwnerDarkParticleIdFromAtomId(
    preparedScene.atomId,
  )
  const input = lifecycle.layoutInput(manifest)
  const graph = input.owners.find((owner) =>
    owner.ownerDarkParticleId === rootDarkParticleId
  )?.graph
  if (!graph) {
    throw new Error(
      `Force Story ${representation.id} owner ${rootDarkParticleId} is absent`,
    )
  }
  const stateById = new Map(
    graph.states.map((state) => [state.id, state] as const),
  )
  const rootStateIds = [...new Set(
    graph.sleeves.map((sleeve) => sleeve.rootStateId),
  )]
  return {
    graph,
    layouts: representation.layouts.map((layout) => ({
      id: layout.id,
      label: layout.label,
      scene: forceStoryLayoutById[layout.id].buildScene(input),
    })),
    manifest,
    representationId: representation.id,
    rootDarkParticleId,
    visual: lifecycle.compose({manifest}).renderManifest,
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
  #lifecycle: BulkVisualSceneLifecycle

  constructor(definition: ForceStoryDefinition) {
    this.definition = definition
    this.representation = verifiedRepresentation(definition)
    this.#lifecycle = prepareProjection(this.representation.preparedScene)
  }

  apply(): ForceStorySessionSnapshot {
    if (this.#phase === "prepared") {
      this.#change = this.#lifecycle.apply(
        structuredClone(this.definition.patch),
      ).change
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
    this.#lifecycle.dispose()
    this.#lifecycle = prepareProjection(this.representation.preparedScene)
    this.#change = null
    this.#phase = "prepared"
    return this.snapshot()
  }

  snapshot(): ForceStorySessionSnapshot {
    const representation = visualSnapshot(
      this.#lifecycle,
      this.representation,
    )
    return {
      activity: activitySnapshot(representation),
      change: this.#change === null ? null : structuredClone(this.#change),
      currentState: currentStateName(
        this.#lifecycle,
        this.representation.preparedScene,
      ),
      phase: this.#phase,
      projection: this.#lifecycle.snapshot().projection,
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
