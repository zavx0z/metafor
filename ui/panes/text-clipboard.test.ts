import {describe, expect, test} from "bun:test"
import {orderedTextSelection, textFromSelection, wordRangeAt} from "./text-clipboard.ts"

describe("text clipboard helpers", () => {
  test("orders a reversed selection", () => {
    expect(orderedTextSelection({line: 2, col: 1}, {line: 0, col: 3})).toEqual({
      start: {line: 0, col: 3},
      end: {line: 2, col: 1},
    })
  })

  test("extracts selected text across lines", () => {
    expect(textFromSelection(["alpha", "beta", "gamma"], {line: 0, col: 2}, {line: 1, col: 2})).toBe("pha\nbe")
  })

  test("detects unicode word ranges", () => {
    expect(wordRangeAt("// русский комментарий", 5)).toEqual({start: 3, end: 10})
  })
})
