import {expect, test} from "bun:test"
import requestResourcePhase from "@cosmos/peer-lifecycle"

test("each explicit native resource request has a fresh identity and cancellation has no effects", () => {
  const signal = new AbortController().signal
  const start = requestResourcePhase({event:"started",signal})
  const restart = requestResourcePhase({event:"started",signal})
  const stop = requestResourcePhase({event:"stopping",signal})
  expect(start.request).toBe("start")
  expect(stop.request).toBe("stop")
  expect(new Set([start.requestId,restart.requestId,stop.requestId]).size).toBe(3)
  expect(Object.isFrozen(start)).toBeTrue()
  expect(() => requestResourcePhase({event:"started",signal:AbortSignal.abort(new Error("cancelled"))})).toThrow("cancelled")
})
