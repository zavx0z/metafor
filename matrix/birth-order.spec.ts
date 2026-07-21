import {describe, expect, test} from "bun:test"
import {waitForMatrixBirthGate} from "./birth-order.ts"

describe("Matrix birth order", () => {
  test("opens only after the other four ForceChannels are ready", async () => {
    const statuses = [
      {state: "starting", connectedDomains: ["dark", "boundary"]},
      {state: "starting", connectedDomains: ["dark", "boundary", "energy"]},
      {state: "starting", connectedDomains: ["dark", "boundary", "energy", "bulk"]},
    ]
    let reads = 0

    await waitForMatrixBirthGate(
      async () => statuses[Math.min(reads++, statuses.length - 1)]!,
      {waitMs: 100, retryMs: 1},
    )

    expect(reads).toBe(3)
  })

  test("rejects an existing Matrix ForceChannel", async () => {
    await expect(waitForMatrixBirthGate(async () => ({
      state: "running",
      connectedDomains: ["dark", "boundary", "matrix", "energy", "bulk"],
    }))).rejects.toThrow("already connected")
  })

  test("rejects a Force lifecycle that already failed", async () => {
    await expect(waitForMatrixBirthGate(async () => ({
      state: "error",
      connectedDomains: ["dark", "boundary", "energy", "bulk"],
      error: "Force stopped: bulk channel was destroyed",
    }))).rejects.toThrow("Force stopped: bulk channel was destroyed")
  })

  test("reports the missing prerequisite on timeout", async () => {
    await expect(waitForMatrixBirthGate(
      async () => ({state: "starting", connectedDomains: ["dark", "boundary", "energy"]}),
      {waitMs: 2, retryMs: 1},
    )).rejects.toThrow("waiting for ForceChannels: bulk")
  })
})
