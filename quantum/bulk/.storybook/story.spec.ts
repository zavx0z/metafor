import {describe, expect, test} from "bun:test"
import {createDocument} from "@zavx0z/dom"
import type {BulkHudDocumentProps} from "../dom/hud.tsx"
import {
  bulkHudStoryDefaultProps,
  createBulkHudStory,
} from "./stories/hud.ts"
import {runtime} from "./runtime.ts"

describe("Quantum Bulk HUD DOM story", () => {
  test("presents the production Bulk HUD controller and live source", async () => {
    const document = createDocument()
    document.appendChild(document.createElement("main"))
    const story = createBulkHudStory(document)
    await story.ready

    expect(story.element).toBe(story.controller.element)
    expect(story.element.localName).toBe("section")
    expect(story.element.className).toBe("")
    expect(story.element.getAttribute("data-bulk-hud")).toBe("")
    expect(story.props).toEqual(bulkHudStoryDefaultProps)
    expect(story.controller.presentation.refs.fullscreenButton.textContent).toBe("Полный экран")
    expect(story.controller.presentation.controllers.channels.refs.channelElements.size).toBe(3)
    expect(story.source.html).toContain('<section aria-label="Bulk Visual"')
    expect(story.source.html).toContain('data-action-key="fullscreen"')
    expect(story.source.html).toContain('data-channel-key="force"')
    expect(Object.keys(story.source).sort()).toEqual(["html", "typescript"])
    expect(story.componentRoot.readStyleSheets().styleSheets.length).toBeGreaterThan(0)
    expect(story.source.typescript).toContain("createBulkHudController({")
    expect(story.source.typescript).toContain("parent: presentationHost")
    expect(story.source.typescript).not.toContain("UiRuntime")

    story.dispose()
  })

  test("drives playback labels and causal frames through the production controller", async () => {
    const story = createBulkHudStory(createDocument())
    await story.ready
    const root = story.element
    const presentation = story.controller.presentation
    const toggle = presentation.controllers.playback.refs.toggleButton
    const previous = presentation.controllers.playback.refs.previousButton
    const forceChannel = presentation.controllers.channels.refs.channelElements.get("force")!
    const frame2 = presentation.controllers.channels.refs.pointItems.get("force/frame-2")!

    expect(story.element).toBe(root)
    expect(toggle.getAttribute("aria-label")).toBe("Продолжить causal time")
    expect(toggle.textContent).toBe("Продолжить")
    expect(story.props.causalTime.timeline.frameCurrent).toBe(16)

    previous.click()
    expect(story.props.causalTime.timeline.frameCurrent).toBe(4)
    expect(presentation.controllers.timeline.refs.keyframeButtons.get("frame-1")
      ?.getAttribute("aria-pressed")).toBe("true")

    toggle.click()
    await eventually(() => story.controller.time.state === "open")
    expect(story.element).toBe(root)
    expect(presentation.controllers.channels.refs.channelElements.get("force")).toBe(forceChannel)
    expect(presentation.controllers.channels.refs.pointItems.get("force/frame-2")).toBeUndefined()
    expect(frame2.parentNode).toBeNull()
    expect(toggle.getAttribute("aria-label")).toBe("Приостановить causal time")
    expect(toggle.textContent).toBe("Пауза")
    expect(story.props.causalTime.timeline.frameCurrent).toBe(0)
    expect(story.source.html).toContain('aria-label="Приостановить causal time"')

    story.dispose()
    expect(() => story.subscribe(() => {})).toThrow("BulkHudStory is disposed")
  })

  test("keeps the story package-owned and free of retained runtime owners", async () => {
    const source = await Bun.file(new URL("./stories/hud.ts", import.meta.url)).text()
    const runtimeSource = await Bun.file(new URL("./runtime.ts", import.meta.url)).text()

    expect(source).toContain('from "../../dom/hud-controller.ts"')
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
    expect(runtimeSource).toContain("await next.ready")
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
    let renders = 0
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
        ready: Promise.resolve(),
        subscribe() { return () => {} },
        dispose() { disposed += 1 },
      }
    }
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      projection: "hud",
      present(value: Readonly<Record<string, unknown>>) { presentations.push(value) },
      reportDiagnostic() {},
      requestRender() { renders += 1 },
    } as never)
    const routeSignal = new AbortController()
    await session.mount({route: "bulk/hud/default", story: factory, signal: routeSignal.signal})
    await session.update?.({route: "bulk/hud/default", story: factory, signal: routeSignal.signal})
    expect(presentations).toHaveLength(2)
    expect(presentations.map(({protocol}) => protocol)).toEqual([
      "story-presentation/1",
      "story-presentation/1",
    ])
    expect(presentations.map(({values}) => values)).toEqual([
      {props: {version: 0}},
      {props: {version: 1}},
    ])
    expect(renders).toBe(2)
    expect(disposed).toBe(1)
    session.unmount()
    expect(disposed).toBe(2)
    session.dispose()
    session.dispose()
    expect(disposed).toBe(2)
  })

  test("keeps one presentation while production interaction updates its DOM state", async () => {
    const document = createDocument()
    const presentations: Readonly<Record<string, unknown>>[] = []
    const lifetime = new AbortController()
    let renders = 0
    let story: ReturnType<typeof createBulkHudStory> | null = null
    const factory = () => {
      story = createBulkHudStory(document)
      return story
    }
    const session = runtime.create({
      document,
      signal: lifetime.signal,
      projection: "hud",
      present(value: Readonly<Record<string, unknown>>) { presentations.push(value) },
      reportDiagnostic() {},
      requestRender() { renders += 1 },
    } as never)
    const routeSignal = new AbortController()
    await session.mount({route: "bulk/hud/default", story: factory, signal: routeSignal.signal})
    await story!.ready
    await eventually(() => story!.controller.time.state === "paused")

    const toggle = story!.controller.presentation.controllers.playback.refs.toggleButton
    const initialValues = presentations.at(-1)?.values as {props?: BulkHudDocumentProps} | undefined
    expect(initialValues?.props?.causalTime.timeline.frameCurrent).toBe(16)
    expect(toggle.getAttribute("aria-label")).toBe("Продолжить causal time")
    toggle.click()
    await eventually(() => story!.controller.time.state === "open")

    expect(toggle.getAttribute("aria-label")).toBe("Приостановить causal time")
    expect(story!.props.causalTime.playback.playing).toBeTrue()
    expect(story!.props.causalTime.timeline.frameCurrent).toBe(0)
    expect(presentations).toHaveLength(1)
    expect(renders).toBeGreaterThan(1)
    session.dispose()
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

async function eventually(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("Expected asynchronous HUD story state was not reached")
}
