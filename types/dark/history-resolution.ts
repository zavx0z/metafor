/** The live Mass state is always exact; this controls only historical resolution. */
export type MassHistoryResolutionModeV1 = "exact-per-tick" | "degraded"

export type MassHistoryResolutionPolicyV1 = {
  mode: MassHistoryResolutionModeV1
  maxCaptureLatencyMs: number
  maxPendingCaptures: number
  maxSnapshotBytes: number
  maxCaptureDutyCycle: number
}

export type MassHistoryResolutionMetricsV1 = {
  captureLatencyMs: number
  pendingCaptures: number
  snapshotBytes: number
  captureDutyCycle: number
}

export type MassHistoryDegradedReasonV1 =
  | "capture-budget-exceeded"
  | "queue-backpressure"
  | "snapshot-budget-exceeded"
  | "capture-duty-cycle-exceeded"

export type MassHistoryResolutionDecisionV1 =
  | {mode: "exact-per-tick"}
  | {mode: "degraded"; reason: MassHistoryDegradedReasonV1}
