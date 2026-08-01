import type {VisualScenePayload} from "./ScenePayload.ts"
import type {
  VisualLayout,
  VisualLayoutInput,
  VisualLayoutSlug,
} from "./internal/layout.ts"
import {buildVisualScenePayload} from "./ScenePayload.ts"

/**
 * Complete server-prepared visual state for browser hydration.
 *
 * The envelope is deliberately visual-only: it names the selected strategy and
 * carries its declarative payload. Causal cursor, reconnect, replay and recovery
 * policy belong to the owning Bulk contour and are not part of this contract.
 */
export type VisualPreparedScene = Readonly<{
  kind: "visual-prepared-scene"
  layoutSlug: VisualLayoutSlug
  payload: VisualScenePayload
}>

/** Wraps an already-built payload without running a layout strategy again. */
export const describeVisualPreparedScene = (
  payload: VisualScenePayload,
): VisualPreparedScene => Object.freeze({
  kind: "visual-prepared-scene",
  layoutSlug: payload.layoutSlug,
  payload,
})

/** Server-side initial preparation. A browser hydrates the returned payload. */
export const prepareVisualScene = (
  layout: VisualLayout,
  layoutInput: VisualLayoutInput,
): VisualPreparedScene =>
  describeVisualPreparedScene(buildVisualScenePayload(layout, layoutInput))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Whether a transported value has the visual-only prepared-scene envelope. */
export const isVisualPreparedScene = (
  value: unknown,
): value is VisualPreparedScene =>
  isRecord(value) &&
  value.kind === "visual-prepared-scene" &&
  typeof value.layoutSlug === "string" &&
  isRecord(value.payload) &&
  value.payload.kind === "visual-scene-payload" &&
  value.payload.layoutSlug === value.layoutSlug
