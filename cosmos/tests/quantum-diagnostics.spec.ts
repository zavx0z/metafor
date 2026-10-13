import {expect, spyOn, test} from "bun:test"
import {reportQuantumDomainFailure} from "../release/server/quantum-diagnostics"

test("owned Quantum failures retain domain and error under distinct fixed diagnostic checkpoints", () => {
  const output = spyOn(console, "error").mockImplementation(() => {})
  const peer = new Error("fixture peer failure")
  const cleanup = new AggregateError([peer], "fixture cleanup failure")
  const shutdown = new Error("fixture shutdown failure")
  try {
    reportQuantumDomainFailure("energy", "peer", peer)
    reportQuantumDomainFailure("energy", "cleanup", cleanup)
    reportQuantumDomainFailure("boundary", "shutdown", shutdown)
    expect(output.mock.calls).toEqual([
      ["[@cosmos/release:server:quantum]", "owned peer failed", {domain: "energy", error: peer}],
      ["[@cosmos/release:server:quantum]", "owned cleanup failed", {domain: "energy", error: cleanup}],
      ["[@cosmos/release:server:quantum]", "owned shutdown failed", {domain: "boundary", error: shutdown}],
    ])
  } finally {output.mockRestore()}
})
