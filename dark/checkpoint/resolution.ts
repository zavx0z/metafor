import type {
  MassHistoryResolutionDecisionV1,
  MassHistoryResolutionMetricsV1,
  MassHistoryResolutionPolicyV1,
} from "@metafor/types/dark/history-resolution"

const finiteNonNegative = (value: number): boolean => Number.isFinite(value) && value >= 0

/**
 * Pure measured policy. It does not write Mass, schedule a capture, or mutate
 * Particle history; the capture owner consumes its decision at a coherent
 * material-Mass boundary.
 */
export const decideMassHistoryResolution = (
  policy: MassHistoryResolutionPolicyV1,
  metrics: MassHistoryResolutionMetricsV1,
): MassHistoryResolutionDecisionV1 => {
  for (const value of Object.values(policy)) {
    if (typeof value === "number" && !finiteNonNegative(value)) {
      throw new Error("Mass history resolution policy must contain finite non-negative budgets")
    }
  }
  for (const value of Object.values(metrics)) {
    if (!finiteNonNegative(value)) throw new Error("Mass history resolution metrics must be finite and non-negative")
  }
  if (policy.mode === "degraded") return {mode: "degraded", reason: "capture-budget-exceeded"}
  if (metrics.pendingCaptures > policy.maxPendingCaptures) return {mode: "degraded", reason: "queue-backpressure"}
  if (metrics.snapshotBytes > policy.maxSnapshotBytes) return {mode: "degraded", reason: "snapshot-budget-exceeded"}
  if (metrics.captureDutyCycle > policy.maxCaptureDutyCycle) return {mode: "degraded", reason: "capture-duty-cycle-exceeded"}
  if (metrics.captureLatencyMs > policy.maxCaptureLatencyMs) return {mode: "degraded", reason: "capture-budget-exceeded"}
  return {mode: "exact-per-tick"}
}
