import {describe, expect, test} from "bun:test"
import {mergeVisualBatchPaths} from "./visual-patch-application.ts"

const path = (batchId: string, id: string) => ({batchId, id})

describe("Bulk Visual batch path merge", () => {
  test("an untouched batch survives a patch that never names it", () => {
    const held = [path("a", "a1"), path("b", "b1")]

    const merged = mergeVisualBatchPaths(held, [path("a", "a2")], [])

    // `b` is not re-listed, so its line buffer is never rebuilt.
    expect(merged.filter((entry) => entry.batchId === "b")).toEqual([
      path("b", "b1"),
    ])
    expect(merged.find((entry) => entry.batchId === "a")?.id).toBe("a2")
    expect(merged.length).toBe(2)
  })

  test("a patched batch replaces every path it had, not just the ones sent", () => {
    const held = [path("a", "a1"), path("a", "a2"), path("b", "b1")]

    const merged = mergeVisualBatchPaths(held, [path("a", "a3")], [])

    // A batch is synchronised as a whole, so a stale sibling path would end up
    // in the same geometry as the new one.
    expect(merged.filter((entry) => entry.batchId === "a")).toEqual([
      path("a", "a3"),
    ])
  })

  test("a removed batch leaves nothing behind", () => {
    const held = [path("a", "a1"), path("b", "b1")]

    const merged = mergeVisualBatchPaths(held, [], ["a"])

    expect(merged).toEqual([path("b", "b1")])
  })

  test("a patch that touches no batch holds the same sequence", () => {
    const held = [path("a", "a1")]

    // Identity, not just equality: nothing is reallocated and no batch is
    // re-synchronised.
    expect(mergeVisualBatchPaths(held, [], [])).toBe(held)
  })

  test("an incoming path wins over a removal of the same batch", () => {
    const held = [path("a", "a1"), path("b", "b1")]

    // A reconciler delta never lists one batch as both changed and removed;
    // this pins the resolution rather than leaving it to filter order.
    const merged = mergeVisualBatchPaths(held, [path("b", "b2")], ["b"])

    expect(merged).toEqual([path("a", "a1"), path("b", "b2")])
  })
})
