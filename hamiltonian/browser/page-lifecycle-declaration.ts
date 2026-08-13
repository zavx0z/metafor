import type {
  HamiltonianLifecycleEnvelope,
  HamiltonianLifecycleSnapshot,
} from "../core/lifecycle.js"

/**
 * A page may retire a superseded Worker, but it cannot replace the retained
 * entity of the current Worker execution with page-local observations.
 */
export function pageLifecycleMayEnterBrowserJournal(
  envelope: HamiltonianLifecycleEnvelope,
  currentWorkerEntityId: string | null,
): boolean {
  return currentWorkerEntityId === null ||
    envelope.observation.type !== "entity" ||
    envelope.observation.subjectId !== currentWorkerEntityId
}

export function projectPageLifecycleForBrowserJournal(
  snapshot: HamiltonianLifecycleSnapshot,
  currentWorkerEntityId: string | null,
): HamiltonianLifecycleSnapshot {
  const envelopes = snapshot.envelopes.filter((envelope) =>
    pageLifecycleMayEnterBrowserJournal(envelope, currentWorkerEntityId))
  if (envelopes.length === snapshot.envelopes.length) return snapshot
  return Object.freeze({
    ...snapshot,
    envelopes: Object.freeze(envelopes),
  })
}

/**
 * Page traffic advances the retained causal frontier but cannot change the
 * declared structural membership of its browser/profile contour.
 */
export function pageLifecycleChangesNodeSystem(
  envelope: HamiltonianLifecycleEnvelope,
): boolean {
  return envelope.observation.type === "entity" || envelope.observation.type === "transport"
}
