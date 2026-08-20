import {describe, expect, test} from "bun:test"

describe("shared Workbench accordion hierarchy", () => {
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
  })
})
