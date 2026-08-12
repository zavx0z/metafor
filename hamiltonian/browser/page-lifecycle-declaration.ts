import type {HamiltonianLifecycleEnvelope} from "../core/lifecycle.js"

/**
 * Page traffic advances the retained causal frontier but cannot change the
 * declared structural membership of its browser/profile contour.
 */
export function pageLifecycleChangesNodeSystem(
  envelope: HamiltonianLifecycleEnvelope,
): boolean {
  return envelope.observation.type === "entity" || envelope.observation.type === "transport"
}
