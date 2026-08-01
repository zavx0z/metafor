/**
 * Deterministic visual stories.
 *
 * Story control (start, pause, step, resume, replay, reset), virtual time,
 * standard visual events, inspection, comparison and traces. A story builds the
 * same production payloads and patches a browser applies, so authoring a
 * scenario here and rendering it in Bulk exercise one implementation.
 */
export {
  compareVisualStoryRuns,
  createVisualStoryPlayer,
  formatVisualStoryTrace,
  runVisualStory,
  type CreateVisualStoryPlayerOptions,
  type VisualStoryComparison,
  type VisualStoryConditions,
  type VisualStoryDefinition,
  type VisualStoryEvent,
  type VisualStoryFrame,
  type VisualStoryPlayer,
  type VisualStoryRun,
  type VisualStoryState,
  type VisualStoryStatus,
  type VisualStoryTraceEntry,
} from "./VisualStory.ts"
export {
  visualStoryMoveAtom,
  visualStoryMoveCurrentState,
  visualStoryRelabelTorus,
  visualStoryRemoveAtom,
  visualStorySetFieldValue,
  visualStorySetOrbitalActivity,
  visualStoryWait,
} from "./VisualStoryEvents.ts"
