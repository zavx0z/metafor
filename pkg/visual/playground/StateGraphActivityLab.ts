import type {BulkManifest} from "@metafor/types/bulk/manifest"
import type {BulkRuntimeProjection} from "@metafor/types/bulk/runtime"
import type {BulkVisualLayer} from "@metafor/types/bulk/viewport"
import type {BulkVisualRenderManifest} from "@metafor/types/bulk/visual"
import {createBulkViewport} from "../../../bulk/web/index.ts"
import {createPageAnnotationLayer} from "./AnnotationLayer.ts"
import {
  buildStateGraphFieldsStand,
  type StateGraphFieldsStand,
} from "./StateGraphFieldsLab.ts"

export const STATE_GRAPH_ACTIVITY_LAYERS = [
  "state",
  "causal",
  "transition",
  "field-proxy",
  "relation",
] as const satisfies readonly BulkVisualLayer[]

export type StateGraphActivityScenario = Readonly<{
  active: boolean
  label: "Текущее состояние" | "Без текущего состояния"
  manifest: BulkManifest
  projection: BulkRuntimeProjection
  visual: BulkVisualRenderManifest
}>

export type StateGraphActivityStand = Readonly<{
  active: StateGraphActivityScenario
  inactive: StateGraphActivityScenario
}>

const activityScenarioFromStand = (
  active: boolean,
  projection: BulkRuntimeProjection,
  stand: StateGraphFieldsStand,
): StateGraphActivityScenario => {
  return {
    active,
    label: active ? "Текущее состояние" : "Без текущего состояния",
    manifest: stand.manifest,
    projection,
    visual: stand.visual,
  }
}

/**
 * Two production manifestations of one real root Atom graph. The first keeps
 * its materialized current State, so exactly one complete sleeve is active.
 * The second clears only that current-State pointer, leaving the same graph
 * and geometry with every sleeve inactive.
 */
export const buildStateGraphActivityStand = (
  projection: BulkRuntimeProjection,
  rootSrc: string,
): StateGraphActivityStand => {
  const activeStand = buildStateGraphFieldsStand(projection, rootSrc)
  if (activeStand.graph.currentStateId === null) {
    throw new Error(
      `State Graph Activity stand expected current State for ${rootSrc}`,
    )
  }
  const atomId = activeStand.graph.atomId
  const inactiveProjection: BulkRuntimeProjection = {
    ...projection,
    atomStates: projection.atomStates.map((entry) =>
      entry.atom === atomId ? {...entry, state: null} : entry
    ),
  }
  const inactiveStand = buildStateGraphFieldsStand(
    inactiveProjection,
    rootSrc,
  )
  return {
    active: activityScenarioFromStand(true, projection, activeStand),
    inactive: activityScenarioFromStand(
      false,
      inactiveProjection,
      inactiveStand,
    ),
  }
}

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
  async (
    projection: BulkRuntimeProjection,
    rootSrc: string,
  ): Promise<StateGraphActivityLab> => {
    const stand = buildStateGraphActivityStand(projection, rootSrc)
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
