import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {open} from "../../store/server.ts"
import {matter} from "../index.ts"
import {Wimp} from "@dark/strong"

type RecordedStep = {
  kind: "layer" | "root"
  layerSize: number
  src: string
}

describe("dark matter incremental steps", () => {
  const steps: RecordedStep[] = []
  let store: Awaited<ReturnType<typeof open>>

  beforeAll(async () => {
    store = await open(":memory:")
    await matter(new Wimp({src: "zavx0z/git", parent: null}), undefined, {
      store,
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
    await store.close()
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
