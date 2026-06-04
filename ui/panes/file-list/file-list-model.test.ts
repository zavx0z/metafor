import {describe, expect, test} from "bun:test"
import {
  fileListSelectionAfterClick,
  fileListSelectionAfterKeyboardRange,
  fileListVisibleRows,
  normalizeFileListSelection,
  type FileListItem,
} from "./file-list-model.ts"

const ITEMS: readonly FileListItem[] = [
  {
    id: "src",
    name: "src",
    kind: "directory",
    children: [
      {id: "src/index", name: "index.ts", kind: "file"},
      {id: "src/panes", name: "panes", kind: "directory", children: [
        {id: "src/panes/file-list", name: "file-list.ts", kind: "file"},
      ]},
    ],
  },
  {id: "readme", name: "README.md", kind: "file"},
  {id: "dist", name: "dist", kind: "directory", disabled: true},
]

describe("file list model", () => {
  test("flattens only expanded directory children", () => {
    expect(fileListVisibleRows(ITEMS, new Set()).map((row) => row.id)).toEqual(["src", "readme", "dist"])
    expect(fileListVisibleRows(ITEMS, new Set(["src"])).map((row) => row.id)).toEqual([
      "src",
      "src/index",
      "src/panes",
      "readme",
      "dist",
    ])
    expect(fileListVisibleRows(ITEMS, new Set(["src", "src/panes"])).map((row) => row.id)).toEqual([
      "src",
      "src/index",
      "src/panes",
      "src/panes/file-list",
      "readme",
      "dist",
    ])
  })

  test("normalizes selection against current items and mode", () => {
    expect(normalizeFileListSelection(["missing", "readme", "src/index"], ITEMS, "single")).toEqual(["readme"])
    expect(normalizeFileListSelection(["readme", "readme", "src/index"], ITEMS, "multiple")).toEqual(["readme", "src/index"])
  })

  test("applies single and additive multi selection", () => {
    const rows = fileListVisibleRows(ITEMS, new Set(["src"]))
    expect(fileListSelectionAfterClick(rows, ["readme"], "src/index", "single", "readme").selectedIds).toEqual(["src/index"])
    expect(fileListSelectionAfterClick(rows, ["readme"], "src/index", "multiple", "readme", {metaKey: true}).selectedIds).toEqual([
      "readme",
      "src/index",
    ])
    expect(fileListSelectionAfterClick(rows, ["readme", "src/index"], "readme", "multiple", "readme", {metaKey: true}).selectedIds).toEqual([
      "src/index",
    ])
  })

  test("selects visible ranges from the anchor", () => {
    const rows = fileListVisibleRows(ITEMS, new Set(["src", "src/panes"]))
    expect(fileListSelectionAfterClick(rows, ["src"], "src/panes/file-list", "multiple", "src", {shiftKey: true}).selectedIds).toEqual([
      "src",
      "src/index",
      "src/panes",
      "src/panes/file-list",
    ])
    expect(fileListSelectionAfterKeyboardRange(rows, ["src/index"], "readme", "multiple", "src/index").selectedIds).toEqual([
      "src/index",
      "src/panes",
      "src/panes/file-list",
      "readme",
    ])
  })
})
