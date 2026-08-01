import type {BulkManifest} from "@metafor/types/bulk/manifest"
import {
  buildVisualScenePayload,
  type VisualScenePayload,
} from "./ScenePayload.ts"
import {
  classifyVisualInvalidation,
  reconcileVisualScenePayload,
  summarizeVisualScenePatch,
  type VisualInvalidationScope,
  type VisualPatchSummary,
  type VisualScenePatch,
} from "./SceneReconciler.ts"
import type {
  VisualLayout,
  VisualLayoutInput,
  VisualLayoutSlug,
  VisualOwnerGraph,
} from "./internal/layout.ts"

/**
 * Deterministic visual stories.
 *
 * A story is a named sequence of visual events applied to one initial visual
 * condition. Nothing here reads a wall clock, a canvas or a GPU: time is a
 * virtual counter the story owns, and each step produces the same production
 * payload and patch a browser would apply. That makes a story runnable in a
 * test and in the playground through exactly one implementation.
 */

/** One complete visual input at a point in story time. */
export type VisualStoryConditions = Readonly<{
  manifest: BulkManifest
  owners: readonly VisualOwnerGraph[]
}>

/**
 * A standard visual event.
 *
 * `structural` mirrors what an upstream projection reports for the change it
 * just applied, so a story exercises the same invalidation decision production
 * makes rather than a story-only shortcut.
 */
export type VisualStoryEvent = Readonly<{
  advanceMs?: number
  apply: (conditions: VisualStoryConditions) => VisualStoryConditions
  label: string
  structural: boolean
}>

export type VisualStoryDefinition = Readonly<{
  description?: string
  events: readonly VisualStoryEvent[]
  initial: () => VisualStoryConditions
  layoutSlug?: VisualLayoutSlug
  name: string
}>

export type VisualStoryStatus = "idle" | "running" | "paused" | "finished"

/** One recorded step. Retained in order so a story can be replayed or diffed. */
export type VisualStoryFrame = Readonly<{
  index: number
  invalidation: VisualInvalidationScope
  label: string
  layoutSlug: VisualLayoutSlug
  patch: VisualScenePatch
  payload: VisualScenePayload
  summary: VisualPatchSummary
  timeMs: number
}>

export type VisualStoryState = Readonly<{
  frame: VisualStoryFrame
  index: number
  layoutSlug: VisualLayoutSlug
  remaining: number
  status: VisualStoryStatus
  timeMs: number
}>

/** One line of story trace, suitable for a log or a diagnostics panel. */
export type VisualStoryTraceEntry = Readonly<{
  index: number
  invalidation: VisualInvalidationScope
  label: string
  patchKind: VisualScenePatch["kind"]
  timeMs: number
  touched: number
}>

export type VisualStoryRun = Readonly<{
  frames: readonly VisualStoryFrame[]
  layoutSlug: VisualLayoutSlug
  name: string
  trace: readonly VisualStoryTraceEntry[]
}>

export type VisualStoryPlayer = Readonly<{
  /** Frames recorded so far, oldest first. */
  frames(): readonly VisualStoryFrame[]
  /** Runs every remaining event and returns the complete run. */
  finish(): VisualStoryRun
  pause(): VisualStoryState
  /** Discards progress and rebuilds the initial condition from scratch. */
  replay(): VisualStoryState
  reset(): VisualStoryState
  resume(): VisualStoryState
  start(): VisualStoryState
  state(): VisualStoryState
  /** Applies the next event. A paused or finished story does not advance. */
  step(): VisualStoryState
  trace(): readonly VisualStoryTraceEntry[]
}>

export type CreateVisualStoryPlayerOptions = Readonly<{
  layout: VisualLayout
  story: VisualStoryDefinition
}>

const layoutInput = (
  conditions: VisualStoryConditions,
): VisualLayoutInput => ({
  manifest: conditions.manifest,
  owners: conditions.owners,
})

const traceEntry = (frame: VisualStoryFrame): VisualStoryTraceEntry =>
  Object.freeze({
    index: frame.index,
    invalidation: frame.invalidation,
    label: frame.label,
    patchKind: frame.patch.kind,
    timeMs: frame.timeMs,
    touched: frame.summary.total,
  })

/**
 * Creates a player for one story under one layout strategy.
 *
 * The player is the only place story control lives. It always builds payloads
 * through `buildVisualScenePayload` and always narrows through
 * `reconcileVisualScenePayload`, so a story cannot drift from what Bulk renders.
 */
export const createVisualStoryPlayer = ({
  layout,
  story,
}: CreateVisualStoryPlayerOptions): VisualStoryPlayer => {
  if (story.layoutSlug !== undefined && story.layoutSlug !== layout.slug) {
    throw new Error(
      `Visual story ${story.name} requires layout ${story.layoutSlug}`,
    )
  }

  let conditions: VisualStoryConditions
  let frames: VisualStoryFrame[]
  let status: VisualStoryStatus
  let timeMs: number

  const buildFrame = (
    index: number,
    label: string,
    invalidation: VisualInvalidationScope,
    previous: VisualScenePayload | null,
  ): VisualStoryFrame => {
    const payload = buildVisualScenePayload(layout, layoutInput(conditions))
    // A structural change must not be narrowed, so its previous payload is
    // deliberately withheld from the reconciler.
    const patch = reconcileVisualScenePayload(
      invalidation === "structure" ? null : previous,
      payload,
    )
    return Object.freeze({
      index,
      invalidation,
      label,
      layoutSlug: layout.slug,
      patch,
      payload,
      summary: summarizeVisualScenePatch(patch),
      timeMs,
    })
  }

  const initialize = (): void => {
    conditions = story.initial()
    timeMs = 0
    frames = [buildFrame(0, "initial", "structure", null)]
  }

  const currentFrame = (): VisualStoryFrame => frames[frames.length - 1]!

  const snapshot = (): VisualStoryState => Object.freeze({
    frame: currentFrame(),
    index: frames.length - 1,
    layoutSlug: layout.slug,
    remaining: story.events.length - (frames.length - 1),
    status,
    timeMs,
  })

  initialize()
  status = "idle"

  const advance = (): void => {
    const eventIndex = frames.length - 1
    const event = story.events[eventIndex]
    if (!event) {
      status = "finished"
      return
    }
    conditions = event.apply(conditions)
    timeMs += event.advanceMs ?? 0
    frames.push(buildFrame(
      frames.length,
      event.label,
      classifyVisualInvalidation({changed: true, structural: event.structural}),
      currentFrame().payload,
    ))
    if (frames.length - 1 >= story.events.length) status = "finished"
  }

  return Object.freeze({
    frames: () => Object.freeze([...frames]),
    finish() {
      if (status === "idle") status = "running"
      if (status === "paused") status = "running"
      while (status === "running") advance()
      return Object.freeze({
        frames: Object.freeze([...frames]),
        layoutSlug: layout.slug,
        name: story.name,
        trace: Object.freeze(frames.map(traceEntry)),
      })
    },
    pause() {
      if (status === "running") status = "paused"
      return snapshot()
    },
    replay() {
      initialize()
      status = "running"
      return snapshot()
    },
    reset() {
      initialize()
      status = "idle"
      return snapshot()
    },
    resume() {
      if (status === "paused") status = "running"
      return snapshot()
    },
    start() {
      if (status === "idle") status = "running"
      return snapshot()
    },
    state: snapshot,
    step() {
      if (status === "idle") status = "running"
      if (status === "running") advance()
      return snapshot()
    },
    trace: () => Object.freeze(frames.map(traceEntry)),
  })
}

/** Runs a story to completion in one call. */
export const runVisualStory = (
  options: CreateVisualStoryPlayerOptions,
): VisualStoryRun => createVisualStoryPlayer(options).finish()

export type VisualStoryComparison = Readonly<{
  frameCount: number
  identical: boolean
  firstDivergedIndex: number | null
  left: VisualStoryRun
  right: VisualStoryRun
}>

/**
 * Compares two completed runs frame by frame.
 *
 * Comparison is on serialized payloads, so it answers the practical question —
 * would these two configurations put the same picture on screen — rather than
 * whether they happened to allocate the same objects.
 */
export const compareVisualStoryRuns = (
  left: VisualStoryRun,
  right: VisualStoryRun,
): VisualStoryComparison => {
  const frameCount = Math.min(left.frames.length, right.frames.length)
  let firstDivergedIndex: number | null =
    left.frames.length === right.frames.length ? null : frameCount
  for (let index = 0; index < frameCount; index++) {
    const same = JSON.stringify(left.frames[index]!.payload) ===
      JSON.stringify(right.frames[index]!.payload)
    if (!same) {
      firstDivergedIndex = index
      break
    }
  }
  return Object.freeze({
    frameCount,
    identical: firstDivergedIndex === null,
    firstDivergedIndex,
    left,
    right,
  })
}

/** Formats a trace as aligned lines for logs and diagnostics panels. */
export const formatVisualStoryTrace = (
  trace: readonly VisualStoryTraceEntry[],
): string =>
  trace
    .map((entry) =>
      `#${String(entry.index).padStart(2, "0")} ` +
      `${String(entry.timeMs).padStart(6)}ms ` +
      `${entry.invalidation.padEnd(10)} ` +
      `${String(entry.touched).padStart(5)} ` +
      `${entry.label}`
    )
    .join("\n")
