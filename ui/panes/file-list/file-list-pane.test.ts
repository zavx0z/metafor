import {describe, expect, test} from "bun:test"
import {FileListPane} from "./file-list-pane.ts"
import type {FileListItem} from "./file-list-model.ts"

const ITEMS: readonly FileListItem[] = [
  {
    id: "src",
    name: "src",
    kind: "directory",
    children: [
      {id: "src/index", name: "index.ts", kind: "file"},
      {id: "src/nested", name: "nested", kind: "directory", children: [
        {id: "src/nested/file", name: "file.ts", kind: "file"},
      ]},
    ],
  },
  {id: "readme", name: "README.md", kind: "file"},
]

describe("FileListPane", () => {
  test("starts collapsed by default", () => {
    const pane = new FileListPane({
      items: ITEMS,
    })

    expect(pane.expandedIds()).toEqual([])
  })

  test("exposes directory expansion controls", () => {
    const changes: string[][] = []
    const pane = new FileListPane({
      items: ITEMS,
      expandedIds: ["src"],
      onExpandedChange: (ids) => changes.push([...ids]),
    })

    pane.toggleDirectory("src", false)
    expect(pane.expandedIds()).toEqual([])

    pane.expandAll()
    expect(pane.expandedIds()).toEqual(["src", "src/nested"])
    expect(changes).toEqual([[], ["src", "src/nested"]])
  })

  test("normalizes multi selection when switching to single mode", () => {
    const pane = new FileListPane({
      items: ITEMS,
      selectionMode: "multiple",
      selectedIds: ["src/index", "readme"],
    })

    pane.setSelectionMode("single")
    expect(pane.selectionMode()).toBe("single")
    expect(pane.selectedIds()).toEqual(["src/index"])
  })

  test("accepts preset and override themes", () => {
    const pane = new FileListPane({
      items: ITEMS,
      theme: "material",
    })

    pane.setTheme({
      preset: "intellij",
      row: {height: 30},
    })
    expect(pane.getItems()).toBe(ITEMS)
  })
})
