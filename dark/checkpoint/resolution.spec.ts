import {describe, expect, test} from "bun:test"
import {decideMassHistoryResolution} from "./resolution.ts"

const policy = {
  mode: "exact-per-tick",
  maxCaptureLatencyMs: 16,
  maxPendingCaptures: 1,
  maxSnapshotBytes: 1_024,
  maxCaptureDutyCycle: 0.5,
} as const

const metrics = {
  captureLatencyMs: 8,
  pendingCaptures: 0,
  snapshotBytes: 512,
  captureDutyCycle: 0.25,
}

describe("Mass history resolution policy", () => {
  test("permits an exact Mass-changing tick inside measured budgets", () => {
    expect(decideMassHistoryResolution(policy, metrics)).toEqual({mode: "exact-per-tick"})
  })

  test("marks pressure as an explicit degraded interval instead of claiming an exact tick", () => {
    expect(decideMassHistoryResolution(policy, {...metrics, pendingCaptures: 2})).toEqual({
      mode: "degraded", reason: "queue-backpressure",
    })
    expect(decideMassHistoryResolution(policy, {...metrics, snapshotBytes: 1_025})).toEqual({
      mode: "degraded", reason: "snapshot-budget-exceeded",
    })
  })

  test("rejects invalid telemetry instead of silently selecting a mode", () => {
    expect(() => decideMassHistoryResolution(policy, {...metrics, captureLatencyMs: Number.NaN})).toThrow(
      "metrics must be finite",
    )
  })
})
