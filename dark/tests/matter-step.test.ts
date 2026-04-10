import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { HubFixture } from "fixture"
import { matter } from "../index.ts"
import { dark$ } from "../store"
import { Wimp } from "@dark/strong"
import { resetDarkLoadContext } from "../tests/test.helper.ts"

type RecordedStep = {
  kind: "layer" | "root"
  layerSize: number
  src: string
}

const hub = new HubFixture()

describe("dark matter incremental steps", () => {
  const steps: RecordedStep[] = []

  beforeAll(async () => {
    await hub.setup()
    await matter(new Wimp({ src: "zavx0z/git", parent: null }), undefined, {
      onMaterializedStep(step) {
        steps.push({
          kind: step.kind,
          layerSize: step.layerWimps.length,
          src: step.wimp.src,
        })
      },
    })
  })

  afterAll(async () => {
    dark$.meta.clear()
    dark$.fields.clear()
    dark$.particles.clear()
    resetDarkLoadContext()
    await hub.teardown()
  })

  test("сначала публикует root шаг текущей меты, а затем её layer шаги", () => {
    const rootStepIndex = steps.findIndex((step) => step.kind === "root" && step.src === "zavx0z/git")
    const firstRootLayerIndex = steps.findIndex((step) => step.kind === "layer" && step.src === "zavx0z/git")

    expect(rootStepIndex).toBe(0)
    expect(firstRootLayerIndex).toBeGreaterThan(rootStepIndex)
  })

  test("публикует шаги и для рекурсивно materialized дочерних мет", () => {
    expect(steps.some((step) => step.kind === "root" && step.src === "zavx0z/git-start")).toBe(true)
    expect(steps.some((step) => step.kind === "layer" && step.layerSize > 0)).toBe(true)
  })
})
