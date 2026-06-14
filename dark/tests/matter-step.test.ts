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

const particleUuid = (part: Particle): unknown => {
  if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return part.value
  const value = part.value as {uuid?: unknown; actor?: {uuid?: unknown}}
  return value.actor?.uuid ?? value.uuid
}

describe("dark matter — force parts", () => {
  const parts: Particle[] = []
  let store: Awaited<ReturnType<typeof open>>
  let subscription: ReturnType<typeof store.observe>

  beforeAll(async () => {
    store = await open(":memory:")
    globalThis.store = store
    subscription = store.observe((event) => parts.push(...event.data.parts))
    await matter("zavx0z/git")
    await waitForParts(() => {
      const actorCount = parts.filter((part) => part.part === "graviton" && part.op === "add" && part.path === "actor").length
      const topologyCount = parts.filter((part) =>
        part.part === "graviton" && part.op === "add" && (part.path === "fuzzy" || part.path === "axion" || part.path === "macho")
      ).length
      return actorCount > 20 && topologyCount > 0
    })
  })

  afterAll(async () => {
    subscription.close()
    await store.close()
  })

  const actorParts = (): Particle[] =>
    parts.filter((part) => part.part === "graviton" && part.op === "add" && part.path === "actor")

  const topologyParts = (): Particle[] =>
    parts.filter((part) =>
      part.part === "graviton" && part.op === "add" && (part.path === "fuzzy" || part.path === "axion" || part.path === "macho")
    )

  test("первый actor part соответствует root actor", async () => {
    const roots = await store.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(actorParts()[0] ? particleUuid(actorParts()[0]!) : undefined).toBe(roots[0]!.uuid)
  })

  test("публикует actor parts для рекурсивно materialized child wimps", () => {
    expect(actorParts().length).toBeGreaterThan(20)
  })

  test("публикует runtime topology parts", () => {
    expect(topologyParts().length).toBeGreaterThan(0)
  })

  test("каждый runtime particle uuid уникален в parts", () => {
    const uuids = [...actorParts(), ...topologyParts()].map(particleUuid)
    expect(new Set(uuids).size).toBe(uuids.length)
  })
})
