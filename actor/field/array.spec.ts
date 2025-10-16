import { describe, it, expect } from "bun:test"
import { diffArrays, applyPatchesToArray } from "./array"
import type { Patch, ArrayKey } from "./array.t"
import type { Key } from "./field.t"

describe("diffArrays & applyPatchesToArray - primitives", () => {
  it("returns no patches for identical arrays", () => {
    const a = [1, 2, 3]
    const b = [1, 2, 3]
    const p = diffArrays(a, b, "/items")
    expect(p.length).toBe(0)
    const applied = applyPatchesToArray(a, p)
    expect(applied).toEqual(b)
  })

  it("adds elements", () => {
    const a: (number | string)[] = [1, 2]
    const b: (number | string)[] = [1, 2, 3, 4]
    const p = diffArrays(a as any, b as any, "/x")
    expect(p.length).toBeGreaterThan(0)
    const applied = applyPatchesToArray(a as any, p as Patch[])
    expect(applied).toEqual(b)
  })

  it("removes elements", () => {
    const a = [1, 2, 3, 4]
    const b = [1, 3]
    const p = diffArrays(a, b, "/list")
    const applied = applyPatchesToArray(a, p)
    expect(applied).toEqual(b)
  })

  it("moves elements around", () => {
    const a = [1, 2, 3, 4, 5]
    const b = [3, 1, 4, 5, 2]
    const p = diffArrays(a, b, "/arr")
    const applied = applyPatchesToArray(a, p)
    expect(applied).toEqual(b)
  })

  it("complex mixed changes", () => {
    const a = ["a", "b", "c", "d", "e"]
    const b = ["b", "x", "d", "a", "f"]
    const p = diffArrays(a, b, "/s")
    const applied = applyPatchesToArray(a, p)
    expect(applied).toEqual(b)
  })

  it("handles empty -> populated and populated -> empty", () => {
    expect(applyPatchesToArray([], diffArrays([], [1, 2, 3], "/r"))).toEqual([1, 2, 3])
    expect(applyPatchesToArray([1, 2, 3], diffArrays([1, 2, 3], [], "/r"))).toEqual([])
  })

  it("works with strings and numbers combined", () => {
    const a = [1, "a", 2, "b"]
    const b = ["a", 1, "b", 3]
    const p = diffArrays(a as any, b as any, "/mix")
    const applied = applyPatchesToArray(a as any, p as Patch[])
    expect(applied).toEqual(b)
  })

  it("produces stable result for full permutation", () => {
    const a = [1, 2, 3, 4]
    const b = [4, 3, 2, 1]
    const p = diffArrays(a, b, "/p")
    const applied = applyPatchesToArray(a, p)
    expect(applied).toEqual(b)
  })

  // Sanity: applying produced patches to an intermediate state should always produce target
  it("applies to original to get target for random cases", () => {
    const cases: Array<{ a: (string | number)[]; b: (string | number)[] }> = [
      { a: [], b: [] },
      { a: [1], b: [1] },
      { a: [1], b: [2, 1] },
      { a: [1, 2, 3], b: [3, 2, 1] },
      { a: [10, 20, 30, 40], b: [20, 10, 50, 40] },
    ]
    for (const c of cases) {
      const p = diffArrays(c.a as any, c.b as any, "/x")
      const applied = applyPatchesToArray(c.a as any, p as Patch[])
      expect(applied).toEqual(c.b)
    }
  })

  // -----------------------
  // New tests for minimizing add/remove in favor of move
  // -----------------------

  it("for full permutation uses only move operations (no add/remove)", () => {
    const a = [1, 2, 3, 4, 5, 6]
    // full permutation, same elements in different order
    const b = [4, 6, 3, 1, 5, 2]
    const patches = diffArrays(a, b, "/perm")

    // ensure there are some ops and all of them are 'move'
    expect(patches.length).toBeGreaterThan(0)
    const nonMove = patches.filter((p) => p.op !== "move")
    expect(nonMove.length).toBe(0)

    // sanity: applying yields target
    const applied = applyPatchesToArray(a, patches)
    expect(applied).toEqual(b)
  })

  it("produces add/remove only for truly new/removed values (no remove+add of same value)", () => {
    const a = [1, 2, 3, 4, 5, 6]
    const b = [3, 7, 2, 9, 6] // 7 and 9 are new, 1,4,5 removed; 2,3,6 kept but permuted/positioned

    const patches = diffArrays(a, b, "/mixed")

    // counts
    const addCount = patches.filter((p) => p.op === "add").length
    const removeCount = patches.filter((p) => p.op === "remove").length
    const moveCount = patches.filter((p) => p.op === "move").length

    const oldSet = new Set(a)
    const newSet = new Set(b)
    const newOnly = Array.from(newSet).filter((x) => !oldSet.has(x))
    const oldOnly = Array.from(oldSet).filter((x) => !newSet.has(x))

    // the algorithm should add exactly the newOnly values and remove exactly the oldOnly values
    expect(addCount).toBe(newOnly.length)
    expect(removeCount).toBe(oldOnly.length)

    // additionally ensure no value was both removed and added (i.e. no remove+add for same value)
    // to check this we simulate applying patches stepwise and capture removed values
    const removedValues: Array<string | number> = []
    const addedValues: Array<string | number> = []

    // simulate applying while collecting removed/added actual values
    {
      // clone initial array
      const virtual = a.slice()
      for (const p of patches) {
        if (p.op === "add") {
          const idx = Number(p.path.split("/").pop())
          virtual.splice(idx, 0, (p as any).value)
          addedValues.push((p as any).value)
        } else if (p.op === "remove") {
          const idx = Number(p.path.split("/").pop())
          const [val] = virtual.splice(idx, 1)
          if (val !== undefined) removedValues.push(val)
        } else if (p.op === "move") {
          const fromIdx = Number((p as any).from.split("/").pop())
          const toIdx = Number((p as any).path.split("/").pop())
          const [val] = virtual.splice(fromIdx, 1)
          if (val !== undefined) virtual.splice(toIdx, 0, val)
        }
      }
    }

    // sets intersection should be empty
    const removedSet = new Set(removedValues)
    const addedSet = new Set(addedValues)
    const intersection = Array.from(removedSet).filter((x) => addedSet.has(x))
    expect(intersection.length).toBe(0)

    // sanity: final applied equals target
    const applied = applyPatchesToArray(a, patches)
    expect(applied).toEqual(b)
  })
})
