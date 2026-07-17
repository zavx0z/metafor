import {describe, expect, test} from "bun:test"
import {normalizeTableSelection, tableSelectionAfterClick} from "./Table.ts"

const ROWS = ["rowid:1", "rowid:2", "rowid:3", "rowid:4"]

describe("table selection model", () => {
  test("normalizes selection against visible row ids", () => {
    expect(normalizeTableSelection(ROWS, ["missing", "rowid:2", "rowid:2", "rowid:4"])).toEqual(["rowid:2", "rowid:4"])
  })

  test("applies single and additive clicks", () => {
    expect(tableSelectionAfterClick(ROWS, ["rowid:1"], "rowid:3", "rowid:1").selectedRowIds).toEqual(["rowid:3"])
    expect(tableSelectionAfterClick(ROWS, ["rowid:1"], "rowid:3", "rowid:1", {metaKey: true}).selectedRowIds).toEqual([
      "rowid:1",
      "rowid:3",
    ])
    expect(tableSelectionAfterClick(ROWS, ["rowid:1", "rowid:3"], "rowid:1", "rowid:1", {ctrlKey: true}).selectedRowIds).toEqual([
      "rowid:3",
    ])
  })

  test("selects a shift range from the anchor", () => {
    expect(tableSelectionAfterClick(ROWS, ["rowid:1"], "rowid:4", "rowid:1", {shiftKey: true}).selectedRowIds).toEqual([
      "rowid:1",
      "rowid:2",
      "rowid:3",
      "rowid:4",
    ])
  })
})
