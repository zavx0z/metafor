import {describe, expect, test} from "bun:test"
import {planEditorWorkbench} from "./editor-workbench-layout.ts"

describe("central editor Workbench layout", () => {
  test("keeps five zones on desktop and gives compact width to preview plus authoring dock", () => {
    const desktop = planEditorWorkbench(1380, 1088)
    expect(desktop.catalog.visible).not.toBeFalse()
    expect(desktop.section.visible).not.toBeFalse()
    expect(desktop.info.visible).not.toBeFalse()
    expect(desktop.dock.h).toBe(220)

    const compact = planEditorWorkbench(493, 1088)
    expect(compact.catalog.visible).toBeFalse()
    expect(compact.section.visible).toBeFalse()
    expect(compact.info.visible).toBeFalse()
    expect(compact.preview.w).toBeGreaterThan(470)
    expect(compact.dock.w).toBe(compact.preview.w)
    expect(compact.dock.h).toBe(220)
  })
})
