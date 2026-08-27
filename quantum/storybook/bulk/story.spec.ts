import {describe, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import {
  bulkHudOverviewCss,
  bulkHudStoryCss,
  bulkHudStoryDefaultProps,
  createBulkHudOverview,
  createBulkHudStory,
} from "./story.ts"

describe("Quantum Bulk HUD DOM story", () => {
  test("presents the production Bulk HUD controller and live source", () => {
    const story = createBulkHudStory(createDocument())

    expect(story.element).toBe(story.controller.element)
    expect(story.element.localName).toBe("section")
    expect(story.element.className).toBe("bulk-hud-document")
    expect(story.props).toEqual(bulkHudStoryDefaultProps)
    expect(story.controller.refs.fullscreenButton.textContent).toBe("Полный экран")
    expect(story.controller.controllers.timeline.refs.trackElements.size).toBe(3)
    expect(story.source.html).toContain('<section aria-label="Bulk Visual"')
    expect(story.source.html).toContain('data-action-key="fullscreen"')
    expect(story.source.html).toContain('data-track-key="force"')
    expect(story.source.css).toBe(bulkHudStoryCss)
    expect(story.source.typescript).toContain("createBulkHudDocument(document, props)")
    expect(story.source.typescript).not.toContain("UiRuntime")

    story.dispose()
  })

  test("updates one stable production tree and refreshes serialized state", () => {
    const story = createBulkHudStory(createDocument())
    const root = story.element
    const button = story.controller.refs.fullscreenButton
    const forceTrack = story.controller.controllers.timeline.refs.trackElements.get("force")!
    const frame2 = story.controller.controllers.timeline.refs.markerTimes.get("force/frame-2")!

    story.update({
      ...story.props,
      title: "Bulk Visual · Fullscreen",
      fullscreen: true,
      causalTimeline: {
        ...story.props.causalTimeline,
        current: 20,
        tracks: [
          story.props.causalTimeline.tracks[2]!,
          {
            ...story.props.causalTimeline.tracks[0]!,
            label: "Force frontier",
            markers: [
              {key: "frame-2", tick: 20, label: "frame 2 · 20", selected: true},
              story.props.causalTimeline.tracks[0]!.markers[0]!,
            ],
          },
          story.props.causalTimeline.tracks[1]!,
        ],
      },
    })

    expect(story.element).toBe(root)
    expect(story.controller.refs.fullscreenButton).toBe(button)
    expect(story.controller.controllers.timeline.refs.trackElements.get("force")).toBe(forceTrack)
    expect(story.controller.controllers.timeline.refs.markerTimes.get("force/frame-2")).toBe(frame2)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(story.source.html).toContain('aria-label="Bulk Visual · Fullscreen"')
    expect(story.source.html).toContain('data-tick="20"')
    expect(story.source.typescript).toContain('"current": 20')

    story.dispose()
    expect(() => story.update(bulkHudStoryDefaultProps)).toThrow("BulkHudStory is disposed")
  })

  test("owns semantic root and HUD overview presentations without substituting a detail", () => {
    const root = createBulkHudOverview(createDocument(), "")
    const hud = createBulkHudOverview(createDocument(), "hud")

    expect(root.element.localName).toBe("section")
    expect(root.element.getAttribute("data-route")).toBe("")
    expect(root.element.textContent).toContain("Bulk · Обзор")
    expect(hud.element.getAttribute("data-route")).toBe("hud")
    expect(hud.element.textContent).toContain("Bulk HUD · Обзор")
    expect(hud.element.querySelector("button")).toBeNull()
    expect(hud.source.css).toBe(bulkHudOverviewCss)
    expect(hud.source.typescript).toContain('document.createElement("section")')
    expect(hud.source.typescript).not.toContain("createBulkHudDocument")
  })

  test("keeps the story package-owned and free of retained runtime owners", async () => {
    const source = await Bun.file(new URL("./story.ts", import.meta.url)).text()
    const entry = await Bun.file(new URL("./entry.ts", import.meta.url)).text()

    expect(source).toContain('from "../../bulk/dom/hud.ts"')
    expect(source).toContain('from "@ui/components/hud"')
    expect(entry).toContain('from "@zavx0z/dom"')
    expect(entry).toContain('from "@zavx0z/renderer-browser"')
    expect(entry).toContain('from "@zavx0z/storybook/workbench"')
    expect(entry).toContain("createBulkHudStory(semanticDocument)")
    for (const forbidden of [
      "UiRuntime",
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "StorybookNavigationSurface",
      'from "../../bulk/hud.ts"',
    ]) {
      expect(source).not.toContain(forbidden)
      expect(entry).not.toContain(forbidden)
    }
  })
})
