import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {runAdaptiveLayoutWorkerRequest} from "@nodes/layout-worker/adaptive/executor"
import {runFixedLayoutWorkerRequest} from "@nodes/layout-worker/fixed/executor"
import {adaptiveWorkerFixture, fixedWorkerFixture} from "./layout-worker-fixture.ts"

const playgroundRoot = fileURLToPath(new URL(".", import.meta.url))

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

  test("keeps the protocol detail visible on package overview and exact leaf", async () => {
    const entry = await Bun.file(join(playgroundRoot, "layout-worker-playground.ts")).text()
    const detail = await Bun.file(join(playgroundRoot, "layout-worker-detail.ts")).text()
    const body = await Bun.file(join(playgroundRoot, "layout-worker-playground-body.html")).text()
    expect(entry).toContain("LAYOUT_WORKER_PLAYGROUND_ROUTE_TREE")
    expect(entry).toContain('await import("./layout-worker-detail.ts")')
    expect(entry).not.toContain("runFixedLayoutWorkerRequest")
    expect(detail).toContain("runFixedLayoutWorkerRequest")
    expect(body).not.toContain('id="layout-worker-overview"')
    expect(body).toContain('id="layout-worker-detail"')
    expect(body).not.toContain('id="layout-worker-detail" hidden')
  })
})
