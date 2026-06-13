import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type {Particle} from "store"
import {open} from "../../store/sqlite.ts"
import {matter} from "../index.ts"

const waitForParts = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected dark force parts")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("dark matter — force parts", () => {
  const parts: Particle[] = []
  let store: Awaited<ReturnType<typeof open>>

  beforeAll(async () => {
    store = await open(":memory:")
    globalThis.store = store
    store.onmessage = (event) => parts.push(...event.data.parts)
    await matter("zavx0z/git")
    await waitForParts(() => {
      const actorCount = parts.filter((part) => part.part === "graviton" && part.op === "add" && part.value === "actor").length
      const topologyCount = parts.filter((part) => part.part === "graviton" && part.op === "add" && part.value === "topology").length
      return actorCount > 20 && topologyCount > 0
    })
  })

  afterAll(async () => {
    store.onmessage = null
    await store.close()
  })

  const actorParts = (): Particle[] =>
    parts.filter((part) => part.part === "graviton" && part.op === "add" && part.value === "actor")

  const topologyParts = (): Particle[] =>
    parts.filter((part) => part.part === "graviton" && part.op === "add" && part.value === "topology")

  test("первый actor part соответствует root actor", async () => {
    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(actorParts()[0]?.path).toBe(roots[0]!.uuid)
  })

  test("публикует actor parts для рекурсивно materialized child wimps", () => {
    expect(actorParts().length).toBeGreaterThan(20)
  })

  test("публикует runtime topology parts", () => {
    expect(topologyParts().length).toBeGreaterThan(0)
  })

  test("каждый runtime particle uuid уникален в parts", () => {
    const uuids = [...actorParts(), ...topologyParts()].map((part) => part.path)
    expect(new Set(uuids).size).toBe(uuids.length)
  })
})
