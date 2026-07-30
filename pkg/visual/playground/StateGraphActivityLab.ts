import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkVisualLayer} from "@metafor/types/bulk/viewport"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {buildBulkManifestation} from "../../../bulk/manifestation.ts"
import {
  buildCenteredNestedBulkVisualManifest,
} from "../../../bulk/visual-layout.ts"
import {createBulkViewport} from "../../../bulk/web/index.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"

const ACTIVITY_SRC = "visual/state-branch-activity"

export const STATE_GRAPH_ACTIVITY_LAYERS = [
  "state",
  "causal",
  "transition",
  "field-proxy",
  "relation",
] as const satisfies readonly BulkVisualLayer[]

export type StateGraphActivityScenario = Readonly<{
  active: boolean
  label: "Активная" | "Неактивная"
  manifest: BulkManifest
  projection: BulkRuntimeProjection
  visual: BulkVisualRenderManifest
}>

export type StateGraphActivityStand = Readonly<{
  active: StateGraphActivityScenario
  inactive: StateGraphActivityScenario
}>

const activityProjection = (active: boolean): BulkRuntimeProjection => ({
  atoms: [{
    id: 1,
    parentAtom: null,
    parentTopology: null,
    position: 0,
    wimp: ACTIVITY_SRC,
  }],
  topologies: [],
  wimps: [{src: ACTIVITY_SRC, name: "Ветка State"}],
  fields: [
    {
      id: 11,
      wimp: ACTIVITY_SRC,
      key: "ready",
      type: "boolean",
      label: "Условие",
    },
    {
      id: 12,
      wimp: ACTIVITY_SRC,
      key: "payload",
      type: "string",
      label: "Вход",
    },
    {
      id: 13,
      wimp: ACTIVITY_SRC,
      key: "result",
      type: "string",
      label: "Результат",
    },
  ],
  states: [{
    id: 21,
    wimp: ACTIVITY_SRC,
    name: "состояние",
    position: 0,
  }],
  transitions: [{
    id: 31,
    wimp: ACTIVITY_SRC,
    fromState: 21,
    toState: 21,
    position: 0,
  }],
  conditions: [{
    id: 41,
    wimp: ACTIVITY_SRC,
    transition: 31,
    field: 11,
    position: 0,
    predicate: {eq: true},
  }],
  processes: [{
    id: 51,
    wimp: ACTIVITY_SRC,
    state: "состояние",
    descriptor: {
      type: "action",
      key: "процесс",
      label: "Процесс",
      action: {
        readFields: [[12, "payload"]],
        writeFields: [[13, "result"]],
      },
    },
  }],
  reactions: [],
  atomStates: [{atom: 1, state: active ? 21 : null}],
  fieldEnumVariants: [],
  atomValues: [],
  values: [],
  valueItems: [],
  matterParticles: [],
  matterTopologyBindingPaths: [],
  matterChildWimpBindingPaths: [],
})

const activityScenario = (
  active: boolean,
): StateGraphActivityScenario => {
  const projection = activityProjection(active)
  const manifest = buildBulkManifestation(projection, ACTIVITY_SRC)
  return {
    active,
    label: active ? "Активная" : "Неактивная",
    manifest,
    projection,
    visual: buildCenteredNestedBulkVisualManifest(manifest, projection),
  }
}

/**
 * Two production manifestations of one exact branch. Activity is the only
 * semantic input that differs between the cards.
 */
export const buildStateGraphActivityStand = (): StateGraphActivityStand => ({
  active: activityScenario(true),
  inactive: activityScenario(false),
})

export type StateGraphActivityLab = Readonly<{
  dispose(): void
  hide(): void
  show(): void
}>

type ActivityCardRuntime = Readonly<{
  annotation: ReturnType<typeof createPageAnnotationLayer>
  canvas: HTMLCanvasElement
  observer: ResizeObserver
  viewport: Awaited<ReturnType<typeof createBulkViewport>>
}>

const requireCanvas = (id: string): HTMLCanvasElement => {
  const canvas = document.getElementById(id)
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`State Graph Activity canvas is missing: ${id}`)
  }
  return canvas
}

const canvasSize = (
  canvas: HTMLCanvasElement,
): {width: number; height: number} => {
  const rect = canvas.getBoundingClientRect()
  return {
    width: Math.max(1, Math.floor(rect.width)),
    height: Math.max(1, Math.floor(rect.height)),
  }
}

export const createStateGraphActivityLab =
  async (): Promise<StateGraphActivityLab> => {
    const stand = buildStateGraphActivityStand()
    const cards = [
      {
        canvas: requireCanvas("state-graph-activity-active-canvas"),
        scenario: stand.active,
      },
      {
        canvas: requireCanvas("state-graph-activity-inactive-canvas"),
        scenario: stand.inactive,
      },
    ] as const
    const runtimes = await Promise.all(cards.map(async ({canvas, scenario}) => {
      const viewport = await createBulkViewport({
        canvas,
        ...canvasSize(canvas),
        visualLayers: STATE_GRAPH_ACTIVITY_LAYERS,
      })
      viewport.applyVisualManifestPatch(scenario.visual)
      const viewer = canvas.parentElement
      if (viewer === null) {
        viewport.dispose()
        throw new Error("State Graph Activity canvas parent is missing")
      }
      const annotation = createPageAnnotationLayer({
        sourceCanvas: canvas,
        viewer,
        capturePng: () =>
          viewport.hud.renderer.captureLastPresentedFramePng(),
        surface: () => ({
          canvasId: canvas.id,
          kind: "playground-page",
          route: window.location.hash,
          slug: scenario.active
            ? "state-graph-activity-active"
            : "state-graph-activity-inactive",
          title: `State Graph · Активность · ${scenario.label}`,
        }),
      })
      annotation.hide()
      const observer = new ResizeObserver(() => {
        const next = canvasSize(canvas)
        viewport.setSize(next.width, next.height)
        annotation.resize()
      })
      observer.observe(canvas)
      return {annotation, canvas, observer, viewport}
    }))
    let disposed = false

    const resize = (runtime: ActivityCardRuntime): void => {
      const next = canvasSize(runtime.canvas)
      runtime.viewport.setSize(next.width, next.height)
      runtime.annotation.resize()
    }

    return {
      dispose(): void {
        if (disposed) return
        disposed = true
        for (const runtime of runtimes) {
          runtime.observer.disconnect()
          runtime.annotation.dispose()
          runtime.viewport.dispose()
        }
      },
      hide(): void {
        if (disposed) return
        for (const runtime of runtimes) runtime.annotation.hide()
      },
      show(): void {
        if (disposed) return
        for (const runtime of runtimes) {
          resize(runtime)
          runtime.annotation.show()
        }
      },
    }
  }
