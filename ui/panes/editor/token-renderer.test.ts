import {describe, expect, test} from "bun:test"
import {normalizeEditorTokensForLine} from "./token-renderer.ts"

describe("normalizeEditorTokensForLine", () => {
  test("sorts, clamps and removes invalid ranges", () => {
    const tokens = normalizeEditorTokensForLine("abcdef", [
      {s: 4, e: 6, c: "z"},
      {s: 0, e: 2, c: "a"},
      {s: 1, e: 5, c: "b", fg: "#abcdef", bg: "#123456"},
      {s: -2, e: 1, c: "n"},
      {s: 6, e: 10, c: "out"},
      {s: 3, e: 3, c: "empty"},
      {s: Number.NaN, e: 4, c: "bad"},
    ])

    expect(tokens).toEqual([
      {s: 0, e: 1, c: "n"},
      {s: 1, e: 2, c: "a"},
      {s: 2, e: 5, c: "b", fg: "#abcdef", bg: "#123456"},
      {s: 5, e: 6, c: "z"},
    ])
  })
})
