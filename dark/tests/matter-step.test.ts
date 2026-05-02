import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {Store} from "../../store/index.ts"
import {open} from "../../store/server.ts"
import {matter} from "../index.ts"

type RecordedStep = {
  kind: "actor" | "topology"
  particleUuid: string
  src?: string
}

describe("dark matter — observation hook", () => {
  const steps: RecordedStep[] = []
  let store: Awaited<ReturnType<typeof open>>

  beforeAll(async () => {
    store = await open(":memory:")
    globalThis.store = store
    await matter("zavx0z/git", {
      onMaterializedStep(step) {
        steps.push({
          kind: step.kind,
          particleUuid: step.particle.uuid,
          ...(step.src !== undefined ? {src: step.src} : {}),
        })
      },
    })
  })

  afterAll(async () => {
    await store.close()
  })

  test("первым приходит actor-шаг для root меты", () => {
    expect(steps[0]?.kind).toBe("actor")
    expect(steps[0]?.src).toBe("zavx0z/git")
  })

  test("публикует actor-шаги для рекурсивно materialized дочерних мет", () => {
    expect(steps.some((step) => step.kind === "actor" && step.src === "zavx0z/git-start")).toBe(true)
    expect(steps.some((step) => step.kind === "actor" && step.src === "zavx0z/git-error")).toBe(true)
  })

  test("публикует topology-шаги (Fuzzy/Axion)", () => {
    expect(steps.some((step) => step.kind === "topology")).toBe(true)
  })

  test("каждый particle uuid уникален в steps", () => {
    const uuids = steps.map((s) => s.particleUuid)
    expect(new Set(uuids).size).toBe(uuids.length)
  })
})
