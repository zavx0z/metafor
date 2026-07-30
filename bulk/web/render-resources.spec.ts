import {describe, expect, test} from "bun:test"
import {
  pruneUnusedRenderGeometryCache,
  releaseRenderGeometryCache,
  releaseUniqueRenderGeometry,
  replaceUniqueRenderGeometry,
} from "./render-resources.ts"

describe("Bulk viewport render-resource lifecycle", () => {
  test("invalidates replaced and released unique line geometry exactly once", () => {
    const first = {id: "first"}
    const second = {id: "second"}
    const invalidated: string[] = []
    const invalidate = (geometry: typeof first): void => {
      invalidated.push(geometry.id)
    }

    expect(replaceUniqueRenderGeometry(first, first, invalidate)).toBe(first)
    expect(replaceUniqueRenderGeometry(first, second, invalidate)).toBe(second)
    releaseUniqueRenderGeometry(second, invalidate)

    expect(invalidated).toEqual(["first", "second"])
  })

  test("retains live or fading shared surfaces and releases the rest", () => {
    const live = {id: "live"}
    const fading = {id: "fading"}
    const stale = {id: "stale"}
    const cache = new Map([
      ["live", live],
      ["fading", fading],
      ["stale", stale],
    ])
    const invalidated: string[] = []
    const invalidate = (geometry: typeof live): void => {
      invalidated.push(geometry.id)
    }

    pruneUnusedRenderGeometryCache(
      cache,
      new Set([live, fading]),
      invalidate,
    )
    expect([...cache.keys()]).toEqual(["live", "fading"])
    expect(invalidated).toEqual(["stale"])

    releaseRenderGeometryCache(cache, invalidate)
    expect(cache.size).toBe(0)
    expect(invalidated).toEqual(["stale", "live", "fading"])
  })
})
