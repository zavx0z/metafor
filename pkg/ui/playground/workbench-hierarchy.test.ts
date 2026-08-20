import {describe, expect, test} from "bun:test"
import {activeUiTheme} from "@ui/elements"

describe("shared Workbench accordion hierarchy", () => {
  test("uses distinct exact raw roles for navigation, cards and subtle focus", () => {
    expect(activeUiTheme.spaceNode.list).toEqual([0x30, 0x30, 0x30, 0xff])
    expect(activeUiTheme.spaceNode.panel.back).toEqual([0x3d, 0x3d, 0x3d, 0xff])
    expect(activeUiTheme.spaceNode.list).not.toEqual(activeUiTheme.spaceNode.panel.back)
    expect(activeUiTheme.material.editorOutlineActive).toEqual([0xff, 0xff, 0xff, 0x2a])
    expect(activeUiTheme.material.editorOutlineActive).not.toEqual(activeUiTheme.widgets.box.text)
  })

  test("keeps navigation sections on Elements li and Flex without Component Button rows", async () => {
    const source = await Bun.file(new URL("./surfaces.ts", import.meta.url)).text()
    expect(source).toContain("drawNavigationSection")
    expect(source).toContain("drawNavigationLeaf")
    expect(source).toContain("li(surface")
    expect(source).toContain("span(surface")
    expect(source).toContain("width: uiShapeMetrics.iconActionSlot")
    expect(source).toContain('textAlign: "left"')
    expect(source).toContain("gap: 0")
    expect(source).toContain("drawNavigationFocus")
    expect(source).toContain("drawNavigationDisclosure")
    expect(source).toContain("surface.drawPolyline")
    expect(source).toContain("this.#dock || !this.#usesAccordion()")
    expect(source).toContain('appearance: "toolbar-item"')
    expect(source).not.toContain('appearance: "toggle"')
    expect(source).not.toContain('children: `${group.collapsed ? "▸" : "▾"}')
    expect(source).not.toContain("workbenchSectionOutline")
    expect(source).toContain("workbenchNavigationFill")
    expect(source).toContain("workbenchSectionFill")
    expect(source).toContain("workbenchFocusOutline")
  })
})
