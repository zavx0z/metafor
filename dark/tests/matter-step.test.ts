import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import type { Particle } from "@metafor/types/force/particle"
import {open} from "boundary/sqlite"
import {matter} from "../dark.ts"

const waitForParts = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Expected dark force parts")
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const particleId = (part: Particle): unknown => {
  if (typeof part.value !== "object" || part.value === null || Array.isArray(part.value)) return part.value
  const value = part.value as {id?: unknown; actor?: {id?: unknown}}
  return value.actor?.id ?? value.id
}

describe("dark matter — force parts", () => {
  const parts: Particle[] = []
  let boundary: Awaited<ReturnType<typeof open>>
  let subscription: ReturnType<typeof boundary.observe>

  beforeAll(async () => {
    boundary = await open(":memory:")
    globalThis.boundary = boundary
    subscription = boundary.observe((event) => parts.push(...event.data.parts))
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
    await boundary.close()
  })

  const actorParts = (): Particle[] =>
    parts.filter((part) => part.part === "graviton" && part.op === "add" && part.path === "actor")

  const topologyParts = (): Particle[] =>
    parts.filter((part) =>
      part.part === "graviton" && part.op === "add" && (part.path === "fuzzy" || part.path === "axion" || part.path === "macho")
    )

  test("первый actor part соответствует root actor", async () => {
    const roots = await boundary.actor.roots.all()
    expect(roots).toHaveLength(1)
    expect(actorParts()[0] ? particleId(actorParts()[0]!) : undefined).toBe(roots[0]!.id)
  })

  test("публикует actor parts для рекурсивно materialized child wimps", () => {
    expect(actorParts().length).toBeGreaterThan(20)
  })

  test("публикует runtime topology parts", () => {
    expect(topologyParts().length).toBeGreaterThan(0)
  })

  test("каждый runtime particle id уникален в parts", () => {
    const addresses = [...actorParts(), ...topologyParts()].map((part) => `${part.path}:${String(particleId(part))}`)
    expect(new Set(addresses).size).toBe(addresses.length)
  })
})
