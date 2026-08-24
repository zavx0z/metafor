import {describe, expect, test} from "bun:test"
import {runAdaptiveLayoutWorkerRequest} from "@nodes/layout-worker/adaptive/executor"
import {runFixedLayoutWorkerRequest} from "@nodes/layout-worker/fixed/executor"
import {adaptiveWorkerFixture, fixedWorkerFixture} from "./layout-worker-fixture.ts"

describe("@nodes/layout-worker centralized playground", () => {
  test("shows exact fixed and adaptive serializable envelopes", () => {
    const fixed = structuredClone(runFixedLayoutWorkerRequest({
      type: "layout",
      requestId: 1,
      generation: 7,
      graph: fixedWorkerFixture(),
    }))
    const adaptive = structuredClone(runAdaptiveLayoutWorkerRequest({
      type: "layout",
      requestId: 2,
      generation: 8,
      graph: adaptiveWorkerFixture(),
    }))
    expect(fixed).toMatchObject({type: "layout-result", requestId: 1, generation: 7})
    expect(adaptive).toMatchObject({type: "layout-result", requestId: 2, generation: 8})
    if (adaptive.type === "layout-result") expect(adaptive.diagnostics.attemptedCandidates).toBeGreaterThan(0)
  })
})
