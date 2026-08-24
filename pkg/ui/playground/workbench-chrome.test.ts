import {describe, expect, test} from "bun:test"
import {join} from "node:path"
import {uiShapeMetrics} from "@ui/elements"
import {playgroundTheme} from "./theme.ts"

const root = import.meta.dir

describe("shared Workbench chrome", () => {
  test("derives shell density from the one Elements shape owner", () => {
    expect(playgroundTheme.stagePadding).toBe(uiShapeMetrics.tightGap)
    expect(playgroundTheme.stageGap).toBe(uiShapeMetrics.separatorWidth)
    expect(playgroundTheme.dockHeight).toBe(uiShapeMetrics.rowHeight)
    expect("panelRadius" in playgroundTheme).toBeFalse()
    expect("previewRadius" in playgroundTheme).toBeFalse()
    expect("panelBackground" in playgroundTheme).toBeFalse()
    expect("previewBackground" in playgroundTheme).toBeFalse()
  })

  test("has no local pill, control or island radius policy", async () => {
    const sharedSources = await Promise.all([
      "surfaces.ts",
      "fixture/entry.ts",
      "fixture/stories/button.ts",
    ].map((path) => Bun.file(join(root, path)).text()))
    const previewSources = await Promise.all([
      "../elements/playground/story-preview.ts",
      "../components/playground/story-preview.ts",
      "../../nodes/playground/packages/ui/surfaces/story-preview-surface.ts",
    ].map((path) => Bun.file(join(root, path)).text()))
    const paneSource = await Bun.file(join(root, "../components/Pane.ts")).text()
    const visibleChrome = [...sharedSources, ...previewSources, paneSource].join("\n")

    expect(visibleChrome).not.toMatch(/\b(?:radius|borderRadius):\s*(?:8|12|17|34|36|38|999)\b/)
    expect(visibleChrome).toContain("uiShapeMetrics.lowRadius")
    expect(visibleChrome).toContain("uiShapeMetrics.panelHeaderHeight")
    expect(visibleChrome).toContain("uiShapeMetrics.rowHeight")
    expect(visibleChrome).toContain("uiShapeMetrics.controlHeight")
    expect(sharedSources[0]).toContain('appearance: "toolbar-item"')
    expect(sharedSources[0]).toContain('appearance: "tab"')
    expect(sharedSources[0]).toContain('appearance: "tool"')
    expect(sharedSources[0]).toContain('appearance: "panel"')
    expect(sharedSources[0]).toContain('appearance: "box"')
    expect(sharedSources[0]).toContain("resolveOpaqueRgba8")
    expect(sharedSources[0]).toContain("material.editorBorder")
    expect(sharedSources[0]).toContain("spaceNode.panel.header")
    expect(sharedSources[0]).not.toContain("drawBackdropGradient")
    expect(sharedSources[0]).not.toContain("palette.bgHot")
    expect(sharedSources[0]).not.toContain("palette.cyan")
    expect(sharedSources[2]).toContain("const width = 146")
    expect(sharedSources[2]).not.toContain("frame.w * 0.32")
    for (const source of previewSources) {
      expect(source).toContain("drawPlaygroundPreviewChrome")
      expect(source).not.toContain("borderRadius:")
      expect(source).not.toContain("fontSize:")
    }
  })
})
