import {describe, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import {
  bulkHudStoryDefaultProps,
  createBulkHudStory,
} from "./stories/hud.ts"
import {runtime} from "./runtime.ts"

describe("Quantum Bulk HUD DOM story", () => {
  test("presents the production Bulk HUD controller and live source", () => {
    const story = createBulkHudStory(createDocument())

    expect(story.element).toBe(story.controller.element)
    expect(story.element.localName).toBe("section")
    expect(story.element.className).toBe("")
    expect(story.element.getAttribute("data-bulk-hud")).toBe("")
    expect(story.props).toEqual(bulkHudStoryDefaultProps)
    expect(story.controller.refs.fullscreenButton.textContent).toBe("Полный экран")
    expect(story.controller.controllers.timeline.refs.trackElements.size).toBe(3)
    expect(story.source.html).toContain('<section aria-label="Bulk Visual"')
    expect(story.source.html).toContain('data-action-key="fullscreen"')
    expect(story.source.html).toContain('data-track-key="force"')
    expect(Object.keys(story.source).sort()).toEqual(["html", "typescript"])
    expect(story.componentRoot.readStyleSheets().styleSheets.length).toBeGreaterThan(0)
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

  test("keeps the story package-owned and free of retained runtime owners", async () => {
    const source = await Bun.file(new URL("./stories/hud.ts", import.meta.url)).text()
    const runtimeSource = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()

    expect(source).toContain('from "../../dom/hud.tsx"')
    const manifest = await Bun.file(new URL("./manifest.json", import.meta.url)).json() as {
      authorStyleSheets?: unknown
    }
    const catalog = await Bun.file(new URL("./catalog.json", import.meta.url)).json() as {
      categories: readonly Readonly<{subjects: readonly Readonly<{presentation?: unknown; variants: readonly object[]}>[]}>[]
    }
    expect(manifest.authorStyleSheets).toEqual([{specifier: "@ui/components/theme.css"}])
    expect(catalog.categories[0]?.subjects[0]?.presentation).toEqual({
      protocol: "story-presentation/1",
      projection: "hud",
      widgets: ["props", "source", "diagnostics"],
    })
    expect(catalog.categories[0]?.subjects[0]?.variants.every((variant) =>
      !("presentation" in variant))).toBeTrue()
    expect(runtimeSource).toContain("update: show")
    expect(runtime.protocol).toBe("storybook-runtime/3")
    expect(runtimeSource).toContain("context.present")
    expect(runtimeSource).toContain('protocol: "story-presentation/1"')
    expect(runtimeSource).toContain("componentRoot: next.componentRoot")
    expect(runtimeSource).toContain("values: Object.freeze({props: next.props})")
    expect(runtimeSource).toContain("current.dispose()")
    expect(runtimeSource).not.toContain("context.mount")
    expect(runtimeSource).not.toContain("publishInspector")
    expect(runtimeSource).not.toContain("publishSource")
    expect(runtimeSource).not.toContain("publishProps")
    expect(runtimeSource).not.toContain("styleSheets:")
    expect(runtimeSource).not.toContain("@zavx0z/storybook")
    expect(runtimeSource).not.toContain("StorybookRouteTreeRouter")
    expect(runtimeSource).not.toContain("createStorybookDomWorkbench")
    expect(runtimeSource).not.toContain("createDocumentCanvasRuntime")
    for (const forbidden of [
      "UiRuntime",
      "@layout/core",
      "@ui/elements",
      "@ui/hud",
      "StorybookNavigationSurface",
      'from "../../bulk/hud.ts"',
    ]) {
      expect(source).not.toContain(forbidden)
      expect(runtimeSource).not.toContain(forbidden)
    }
  })

  test("replaces only the owner preview inside one external runtime session", async () => {
    const document = createDocument()
    const presentations: Readonly<Record<string, unknown>>[] = []
    const lifetime = new AbortController()
    let disposed = 0
    const factory = () => {
      const element = document.createElement("section")
      const componentRoot = Object.freeze({
        readStyleSheets: () => Object.freeze({revision: 0, styleSheets: Object.freeze([])}),
      })
      return {
        element,
        componentRoot,
        props: Object.freeze({version: presentations.length}),
        source: Object.freeze({html: "<section></section>", typescript: ""}),
        update() {},
        dispose() { disposed += 1 },
      }
    }
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      projection: "hud",
      present(value: Readonly<Record<string, unknown>>) { presentations.push(value) },
      reportDiagnostic() {},
      requestRender() {},
    } as never)
    const routeSignal = new AbortController()
    session.mount({route: "bulk/hud/default", story: factory, signal: routeSignal.signal})
    session.update?.({route: "bulk/hud/default", story: factory, signal: routeSignal.signal})
    expect(presentations).toHaveLength(2)
    expect(presentations.map(({protocol}) => protocol)).toEqual([
      "story-presentation/1",
      "story-presentation/1",
    ])
    expect(presentations.map(({values}) => values)).toEqual([
      {props: {version: 0}},
      {props: {version: 1}},
    ])
    expect(disposed).toBe(1)
    session.unmount()
    expect(disposed).toBe(2)
    session.dispose()
    session.dispose()
    expect(disposed).toBe(2)
  })

  test("rejects a display projection for the HUD-owned runtime", () => {
    expect(() => runtime.create({
      document: createDocument(),
      signal: new AbortController().signal,
      projection: "display",
      present() {},
      reportDiagnostic() {},
      requestRender() {},
    } as never)).toThrow("requires hud projection")
  })
})
