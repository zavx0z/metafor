import {describe, expect, test} from "bun:test"
import {FILE_LIST_DEFAULT_THEME, FileListPane, fileListRowFill, fileListSelectionGroupStyle} from "./file-list-pane.ts"
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
    expect(pane.selectedIds()).toEqual([])
  })

  test("can explicitly select the first visible row on initialization", () => {
    const pane = new FileListPane({
      items: ITEMS,
      initialSelection: "first",
    })

    expect(pane.selectedIds()).toEqual(["src"])
    expect(pane.activeId()).toBe("src")
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

  test("clears selection without turning active row into selected visual state", () => {
    const pane = new FileListPane({
      items: ITEMS,
      selectedIds: ["readme"],
    })

    pane.clearSelection()
    expect(pane.selectedIds()).toEqual([])
    expect(pane.activeId()).toBe("readme")
    expect(fileListRowFill(FILE_LIST_DEFAULT_THEME, {hovered: false, pressed: false}, false, false)).toBeNull()
    expect(fileListRowFill(FILE_LIST_DEFAULT_THEME, {hovered: true, pressed: false}, false, false)).toBe(FILE_LIST_DEFAULT_THEME.row.hoverFill)
    expect(fileListRowFill(FILE_LIST_DEFAULT_THEME, {hovered: true, pressed: false}, true, false)).toBeNull()
  })

  test("selection group style changes between focused and inactive states", () => {
    expect(fileListSelectionGroupStyle(FILE_LIST_DEFAULT_THEME, true)).toEqual({
      fill: FILE_LIST_DEFAULT_THEME.row.selectedFill,
      border: FILE_LIST_DEFAULT_THEME.row.selectedBorder,
    })
    expect(fileListSelectionGroupStyle(FILE_LIST_DEFAULT_THEME, false)).toEqual({
      fill: FILE_LIST_DEFAULT_THEME.row.selectedInactiveFill,
      border: FILE_LIST_DEFAULT_THEME.row.selectedInactiveBorder,
    })
  })

  test("ensureSelection promotes the active row into real selection", () => {
    const pane = new FileListPane({
      items: ITEMS,
    })

    expect(pane.selectedIds()).toEqual([])
    expect(pane.activeId()).toBe("src")
    pane.ensureSelection()
    expect(pane.selectedIds()).toEqual(["src"])
  })

  test("keyboard navigation changes selection, not just active row", () => {
    const pane = new FileListPane({
      items: ITEMS,
    })
    let prevented = false

    pane.onKey({
      key: "ArrowDown",
      shiftKey: false,
      preventDefault: () => {
        prevented = true
      },
    } as KeyboardEvent)

    expect(prevented).toBe(true)
    expect(pane.activeId()).toBe("readme")
    expect(pane.selectedIds()).toEqual(["readme"])
  })

  test("focus delegates to the runtime canvas and input proxy", () => {
    const pane = new FileListPane({
      items: ITEMS,
    })
    let focusedSurface: unknown = null
    let inputFocused = false

    pane.attachCanvas({
      setFocused: (surface: unknown) => {
        focusedSurface = surface
      },
      inputProxy: {
        focus: () => {
          inputFocused = true
        },
      },
    } as never)
    pane.focus()

    expect(focusedSurface).toBe(pane)
    expect(inputFocused).toBe(true)
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
